import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { AppData, Category, DayKey, Habit, HabitSummary, LogEntry, Relapse, Settings, StreakInfo } from '@/types';
import type { DayOverview, DayOverviewItem, EngineCtx, QuitStats } from '@/lib/habitMath';
import { dayOverview, habitSummary, quitStats } from '@/lib/habitMath';
import { logicalToday } from '@/lib/dates';
import { getData, useStore } from './store';

type Listener = () => void;

interface ClockSubscription {
  listener: Listener;
  interval: number;
  bucket: number;
}

const MIN_TICK_MS = 100;
// reads this close together reuse the cached time, so getSnapshot is stable within a render
const CLOCK_FRESHNESS_MS = 50;
const ROLLOVER_CHECK_MS = 30_000;

const clock = {
  now: Date.now(),
  subscriptions: new Set<ClockSubscription>(),
  timer: null as ReturnType<typeof setTimeout> | null,
  dueAt: Infinity,
};

function readClock(): number {
  const t = Date.now();
  if (t - clock.now >= CLOCK_FRESHNESS_MS || t < clock.now) clock.now = t;
  return clock.now;
}

// a few ms past the boundary so the bucket has definitely flipped
function nextBoundary(interval: number, t: number): number {
  return t - (t % interval) + interval + 5;
}

// one timeout for all subscribers, armed for the earliest boundary
function scheduleTick(): void {
  if (clock.timer !== null) clearTimeout(clock.timer);
  clock.timer = null;
  clock.dueAt = Infinity;
  if (clock.subscriptions.size === 0) return;
  const t = Date.now();
  for (const s of clock.subscriptions) clock.dueAt = Math.min(clock.dueAt, nextBoundary(s.interval, t));
  clock.timer = setTimeout(() => tick(), Math.max(0, clock.dueAt - t));
}

function tick(force = false): void {
  clock.now = Date.now();
  // a listener can unsubscribe others while this runs, so walk a copy
  for (const s of Array.from(clock.subscriptions)) {
    const bucket = Math.floor(clock.now / s.interval);
    if (!force && bucket === s.bucket) continue;
    s.bucket = bucket;
    s.listener();
  }
  scheduleTick();
}

function onVisibilityChange(): void {
  // background tabs throttle timers, so catch up as soon as we're visible again
  if (document.visibilityState === 'visible') tick(true);
}

function subscribeClock(interval: number, listener: Listener): () => void {
  if (clock.subscriptions.size === 0 && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
  const every = Math.max(MIN_TICK_MS, interval);
  const subscription: ClockSubscription = { listener, interval: every, bucket: Math.floor(readClock() / every) };
  clock.subscriptions.add(subscription);
  if (nextBoundary(every, Date.now()) < clock.dueAt) scheduleTick();
  return () => {
    if (!clock.subscriptions.delete(subscription)) return;
    if (clock.subscriptions.size > 0) return; // the pending timer reschedules itself when it fires
    if (clock.timer !== null) clearTimeout(clock.timer);
    clock.timer = null;
    clock.dueAt = Infinity;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

const subscribeRollover = (listener: Listener) => subscribeClock(ROLLOVER_CHECK_MS, listener);
const noopUnsubscribe = () => undefined;

export function useData(): AppData {
  return useStore((s) => s.data);
}

/**
 * Just the parts of AppData the engine reads (habits, logs, relapses, day notes), so heavy analytics
 * don't start over for a theme change or a badge unlock. Settings come from the ctx instead.
 */
export function useAnalysisData(): AppData {
  const habits = useStore((s) => s.data.habits);
  const logs = useStore((s) => s.data.logs);
  const relapses = useStore((s) => s.data.relapses);
  const dayNotes = useStore((s) => s.data.dayNotes);
  return useMemo(() => ({ ...getData(), habits, logs, relapses, dayNotes }), [habits, logs, relapses, dayNotes]);
}

export function useSettings(): Settings {
  return useStore((s) => s.data.settings);
}

const ctxCache = new Map<string, EngineCtx>();
const CTX_CACHE_SIZE = 4;

function sharedCtx(today: DayKey, weekStartsOn: 0 | 1, dayStartHour: number): EngineCtx {
  const key = `${today}|${weekStartsOn}|${dayStartHour}`;
  const cached = ctxCache.get(key);
  if (cached) return cached;
  const ctx: EngineCtx = { today, weekStartsOn, dayStartHour, now: new Date() };
  ctxCache.set(key, ctx);
  if (ctxCache.size > CTX_CACHE_SIZE) {
    const oldest = ctxCache.keys().next().value;
    if (oldest !== undefined) ctxCache.delete(oldest);
  }
  return ctx;
}

/** Shared engine ctx. Its `now` is frozen for the logical day, so quit habits should use useQuitCtx. */
export function useEngineCtx(): EngineCtx {
  const today = useToday();
  const weekStartsOn = useStore((s) => s.data.settings.weekStartsOn);
  const dayStartHour = useStore((s) => s.data.settings.dayStartHour);
  return sharedCtx(today, weekStartsOn, dayStartHour);
}

const QUIT_TICK_MS = 30_000;

/**
 * Ctx with a live `now` for quit habits (the engine ignores relapses after ctx.now).
 * With enabled=false it returns the shared ctx so caches stay shared.
 */
export function useQuitCtx(enabled = true, intervalMs = QUIT_TICK_MS): EngineCtx {
  const ctx = useEngineCtx();
  const relapses = useStore((s) => (enabled ? s.data.relapses : undefined));
  const clockTick = useNow(enabled ? intervalMs : 0);
  // relapses and the clock tick only trigger a fresh `now`
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (enabled ? { ...ctx, now: new Date(readClock()) } : ctx), [enabled, ctx, relapses, clockTick]);
}

export function useToday(): DayKey {
  const dayStartHour = useStore((s) => s.data.settings.dayStartHour);
  const getSnapshot = useCallback(() => logicalToday(dayStartHour, new Date(readClock())), [dayStartHour]);
  return useSyncExternalStore(subscribeRollover, getSnapshot, getSnapshot);
}

/** Re-renders every `intervalMs`. Pass 0 to stop ticking. */
export function useNow(intervalMs = 1000): Date {
  const interval = Number.isFinite(intervalMs) && intervalMs > 0 ? Math.max(MIN_TICK_MS, intervalMs) : 0;
  const subscribe = useCallback(
    (listener: Listener) => (interval > 0 ? subscribeClock(interval, listener) : noopUnsubscribe),
    [interval],
  );
  const getSnapshot = useCallback(() => (interval > 0 ? Math.floor(readClock() / interval) : 0), [interval]);
  const bucket = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  // bucket is the trigger, not an input
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => new Date(readClock()), [bucket, interval]);
}

const activeHabitsCache = new WeakMap<Habit[], Habit[]>();
const allHabitsCache = new WeakMap<Habit[], Habit[]>();
const categoriesCache = new WeakMap<Category[], Category[]>();

function sortedByOrder<T extends { order: number }>(items: readonly T[]): T[] {
  return items.slice().sort((a, b) => a.order - b.order);
}

function selectActiveHabits(habits: Habit[]): Habit[] {
  let out = activeHabitsCache.get(habits);
  if (!out) {
    out = sortedByOrder(habits.filter((h) => !h.archived));
    activeHabitsCache.set(habits, out);
  }
  return out;
}

function selectAllHabits(habits: Habit[]): Habit[] {
  let out = allHabitsCache.get(habits);
  if (!out) {
    out = sortedByOrder(habits);
    allHabitsCache.set(habits, out);
  }
  return out;
}

function selectCategories(categories: Category[]): Category[] {
  let out = categoriesCache.get(categories);
  if (!out) {
    out = sortedByOrder(categories);
    categoriesCache.set(categories, out);
  }
  return out;
}

export function useActiveHabits(): Habit[] {
  return useStore(useShallow((s) => selectActiveHabits(s.data.habits)));
}

export function useAllHabits(): Habit[] {
  return useStore(useShallow((s) => selectAllHabits(s.data.habits)));
}

export function useHabit(id: string | undefined): Habit | undefined {
  return useStore((s) => (id === undefined ? undefined : s.data.habits.find((h) => h.id === id)));
}

export function useCategories(): Category[] {
  return useStore(useShallow((s) => selectCategories(s.data.categories)));
}

export function useCategory(id: string | undefined): Category | undefined {
  return useStore((s) => (id === undefined ? undefined : s.data.categories.find((c) => c.id === id)));
}

type HabitLogs = Record<DayKey, LogEntry> | undefined;

// current data with the selected branches pinned, so a cached result always matches its key
function dataWith(overrides: { habitId?: string; habitLogs?: HabitLogs; logs?: AppData['logs']; habits?: Habit[]; relapses?: Relapse[] }): AppData {
  const data = useStore.getState().data;
  let logs = overrides.logs ?? data.logs;
  if (overrides.habitId !== undefined && logs[overrides.habitId] !== overrides.habitLogs) {
    logs = { ...logs };
    if (overrides.habitLogs) logs[overrides.habitId] = overrides.habitLogs;
    else delete logs[overrides.habitId];
  }
  const habits = overrides.habits ?? data.habits;
  const relapses = overrides.relapses ?? data.relapses;
  if (logs === data.logs && habits === data.habits && relapses === data.relapses) return data;
  return { ...data, logs, habits, relapses };
}

interface SummaryCacheEntry {
  logs: HabitLogs;
  relapses: Relapse[] | undefined;
  ctx: EngineCtx;
  value: HabitSummary;
}

const summaryCache = new WeakMap<Habit, SummaryCacheEntry>();

function cachedSummary(habit: Habit, logs: HabitLogs, relapses: Relapse[] | undefined, ctx: EngineCtx): HabitSummary {
  const hit = summaryCache.get(habit);
  if (hit && hit.logs === logs && hit.relapses === relapses && hit.ctx === ctx) return hit.value;
  const data = dataWith({ habitId: habit.id, habitLogs: logs, ...(relapses ? { relapses } : {}) });
  const value = habitSummary(habit, data, ctx);
  summaryCache.set(habit, { logs, relapses, ctx, value });
  return value;
}

export function useHabitSummary(habitId: string | undefined): HabitSummary | undefined {
  const habit = useHabit(habitId);
  const isQuit = habit?.type === 'quit';
  const logs = useStore((s) => (habit ? s.data.logs[habit.id] : undefined));
  const relapses = useStore((s) => (isQuit ? s.data.relapses : undefined));
  const ctx = useQuitCtx(isQuit);
  return useMemo(() => (habit ? cachedSummary(habit, logs, relapses, ctx) : undefined), [habit, logs, relapses, ctx]);
}

/** Summaries keyed by habit id. Quit habits tick every `quitIntervalMs`, which re-renders the caller. */
export function useHabitSummaries(habits: Habit[], quitIntervalMs = QUIT_TICK_MS): Map<string, HabitSummary> {
  const ctx = useEngineCtx();
  const logs = useStore((s) => s.data.logs);
  const hasQuit = habits.some((habit) => habit.type === 'quit');
  const relapses = useStore((s) => (hasQuit ? s.data.relapses : undefined));
  const quitCtx = useQuitCtx(hasQuit, quitIntervalMs);
  return useMemo(() => {
    const out = new Map<string, HabitSummary>();
    for (const habit of habits) {
      const habitLogs = logs[habit.id];
      const summary = habit.type === 'quit'
        // quit ctx changes every tick, so skip the shared cache
        ? habitSummary(habit, dataWith({ habitId: habit.id, habitLogs, ...(relapses ? { relapses } : {}) }), quitCtx)
        : cachedSummary(habit, habitLogs, undefined, ctx);
      out.set(habit.id, summary);
    }
    return out;
  }, [habits, logs, relapses, ctx, quitCtx]);
}

export function useStreaks(habits: Habit[], quitIntervalMs = QUIT_TICK_MS): Map<string, StreakInfo> {
  const summaries = useHabitSummaries(habits, quitIntervalMs);
  return useMemo(() => {
    const out = new Map<string, StreakInfo>();
    for (const [id, summary] of summaries) out.set(id, summary.streak);
    return out;
  }, [summaries]);
}

interface OverviewCacheEntry {
  day: DayKey;
  habits: Habit[];
  logs: AppData['logs'];
  relapses: Relapse[];
  ctx: EngineCtx;
  value: DayOverview;
}

const OVERVIEW_CACHE_SIZE = 16;
let overviewCache: OverviewCacheEntry[] = [];

function sameCell(a: DayOverviewItem['cell'], b: DayOverviewItem['cell']): boolean {
  return a.day === b.day && a.status === b.status && a.value === b.value && a.note === b.note && a.progress === b.progress;
}

function samePeriod(a: DayOverviewItem['period'], b: DayOverviewItem['period']): boolean {
  return (
    a.start === b.start && a.end === b.end && a.achieved === b.achieved && a.target === b.target &&
    a.progress === b.progress && a.success === b.success && a.current === b.current && a.skipped === b.skipped
  );
}

function withStableItems(fresh: DayOverview, previous: DayOverview): DayOverview {
  const before = new Map(previous.items.map((item) => [item.habit.id, item] as const));
  let reused = 0;
  const items = fresh.items.map((item) => {
    const old = before.get(item.habit.id);
    if (
      old &&
      old.habit === item.habit &&
      old.countsForDay === item.countsForDay &&
      old.completeForDay === item.completeForDay &&
      sameCell(old.cell, item.cell) &&
      samePeriod(old.period, item.period)
    ) {
      reused++;
      return old;
    }
    return item;
  });
  return reused === 0 ? fresh : { ...fresh, items };
}

function cachedOverview(day: DayKey, habits: Habit[], logs: AppData['logs'], relapses: Relapse[], ctx: EngineCtx): DayOverview {
  const hit = overviewCache.find(
    (e) => e.day === day && e.habits === habits && e.logs === logs && e.relapses === relapses && e.ctx === ctx,
  );
  if (hit) return hit.value;
  const fresh = dayOverview(dataWith({ habits, logs, relapses }), day, ctx);
  // reuse unchanged items by reference so tapping one habit only re-renders its card
  const previous = [...overviewCache].reverse().find((e) => e.day === day && e.ctx === ctx)?.value;
  const value = previous ? withStableItems(fresh, previous) : fresh;
  // entries built from old inputs can't be hit again
  overviewCache = overviewCache.filter((e) => e.habits === habits && e.logs === logs && e.relapses === relapses && e.ctx === ctx);
  overviewCache.push({ day, habits, logs, relapses, ctx, value });
  if (overviewCache.length > OVERVIEW_CACHE_SIZE) overviewCache.shift();
  return value;
}

export function useDayOverview(day?: DayKey): DayOverview {
  const ctx = useEngineCtx();
  const habits = useStore((s) => s.data.habits);
  const logs = useStore((s) => s.data.logs);
  const relapses = useStore((s) => s.data.relapses);
  const target = day ?? ctx.today;
  return useMemo(() => cachedOverview(target, habits, logs, relapses, ctx), [target, habits, logs, relapses, ctx]);
}

export function useQuitStats(habitId: string | undefined, intervalMs = 1000): QuitStats | undefined {
  const habit = useHabit(habitId);
  const isQuit = habit?.type === 'quit';
  const logs = useStore((s) => (isQuit && habit ? s.data.logs[habit.id] : undefined));
  const relapses = useStore((s) => (isQuit ? s.data.relapses : undefined));
  const ctx = useQuitCtx(isQuit, intervalMs);
  return useMemo(() => {
    if (!habit || !isQuit) return undefined;
    const data = dataWith({ habitId: habit.id, habitLogs: logs, ...(relapses ? { relapses } : {}) });
    return quitStats(habit, data, ctx);
  }, [habit, isQuit, logs, relapses, ctx]);
}

const mediaQueryLists = new Map<string, MediaQueryList>();

function getMediaQueryList(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  let mql = mediaQueryLists.get(query);
  if (!mql) {
    mql = window.matchMedia(query);
    mediaQueryLists.set(query, mql);
  }
  return mql;
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (listener: Listener) => {
      const mql = getMediaQueryList(query);
      if (!mql) return noopUnsubscribe;
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', listener);
        return () => mql.removeEventListener('change', listener);
      }
      // Safari < 14
      mql.addListener(listener);
      return () => mql.removeListener(listener);
    },
    [query],
  );
  const getSnapshot = useCallback(() => getMediaQueryList(query)?.matches ?? false, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function useReducedMotion(): boolean {
  const setting = useStore((s) => s.data.settings.reduceMotion);
  const os = useMediaQuery('(prefers-reduced-motion: reduce)');
  return setting || os;
}
