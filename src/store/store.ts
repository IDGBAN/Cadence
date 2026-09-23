import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval';
import type {
  AccentName, AppData, Category, DayKey, GoalDirection, Habit, HabitColor, HabitKind, HabitType, ISODate,
  LogEntry, Period, Relapse, RewardsState, RunningTimer, Settings, ThemeName,
} from '@/types';
import { createInitialData, DATA_VERSION, DEFAULT_CATEGORIES, DEFAULT_SETTINGS, uid } from '@/lib/defaults';
import { addDays, fromDayKey, logicalDayOf, logicalToday, toDayKey } from '@/lib/dates';
import { ACCENTS, HABIT_COLORS } from '@/lib/colors';
import { toast, useUI } from './ui';

export interface LogPatch {
  value?: number;
  note?: string;
  skipped?: boolean;
}

export interface AppStore {
  data: AppData;
  hydrated: boolean;
  canUndo: boolean;
  canRedo: boolean;
  storageError: StorageIssue | null;

  /** Drops the entry when nothing is left to keep (atMost goals keep zero values). */
  setLog: (habitId: string, day: DayKey, patch: LogPatch) => void;
  clearLog: (habitId: string, day: DayKey) => void;
  /** A positive delta also un-skips the day. */
  adjustLog: (habitId: string, day: DayKey, delta: number) => void;
  toggleCheck: (habitId: string, day: DayKey) => void;
  setSkipped: (habitId: string, day: DayKey, skipped: boolean) => void;
  /** One undo step. `note` is only written to entries that don't have one yet. */
  setSkippedMany: (habitIds: readonly string[], day: DayKey, skipped: boolean, note?: string) => void;

  addRelapse: (habitId: string, at?: ISODate, note?: string) => Relapse;
  updateRelapse: (id: string, patch: { at?: ISODate; note?: string }) => void;
  deleteRelapse: (id: string) => void;

  startTimer: (habitId: string, day: DayKey) => void;
  /** Returns the minutes added. Runs under 30s add nothing and long runs are capped. */
  stopTimer: (habitId: string) => number;
  cancelTimer: (habitId: string) => void;

  addHabit: (habit: Habit) => void;
  /** Changing type or ratingMax also rewrites existing log values, in the same undo step. */
  updateHabit: (id: string, patch: Partial<Habit>) => void;
  setArchived: (id: string, archived: boolean) => void;
  deleteHabit: (id: string) => void;
  duplicateHabit: (id: string) => Habit | undefined;
  reorderHabits: (orderedIds: string[]) => void;

  addCategory: (input: { name: string; icon: string }) => Category;
  updateCategory: (id: string, patch: Partial<Omit<Category, 'id'>>) => void;
  /** Moves its habits to `moveToId` or the first remaining category. The last category can't be deleted. */
  deleteCategory: (id: string, moveToId?: string) => void;
  reorderCategories: (orderedIds: string[]) => void;

  setDayNote: (day: DayKey, note: string) => void;

  updateSettings: (patch: Partial<Settings>) => void;

  unlockAchievements: (ids: string[]) => void;
  setLastSeenLevel: (level: number) => void;
  markPerfectDayCelebrated: (day: DayKey) => void;

  replaceData: (data: AppData) => void;
  resetData: () => void;
  setOnboarded: (onboarded?: boolean) => void;
  markBackup: () => void;

  undo: () => void;
  redo: () => void;
}

type UnknownRecord = Record<string, unknown>;

const HABIT_TYPES: readonly HabitType[] = ['check', 'quantity', 'duration', 'rating', 'quit'];
const METRIC_TYPES: readonly HabitType[] = ['quantity', 'duration', 'rating'];
const PERIODS: readonly Period[] = ['day', 'week', 'month'];
const THEMES: readonly ThemeName[] = ['midnight', 'oled', 'dusk', 'daylight'];
const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function includes<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (list as readonly string[]).includes(v);
}

function finiteNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function nonEmptyString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

function meaningfulNote(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

// rejects impossible dates like 2026-02-30
export function isValidDayKey(v: unknown): v is DayKey {
  return typeof v === 'string' && DAY_KEY_RE.test(v) && toDayKey(fromDayKey(v)) === v;
}

function normalizeIso(v: unknown): ISODate | undefined {
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString() : undefined;
  if (typeof v !== 'string' || v.trim() === '') return undefined;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

const nowIso = (): ISODate => new Date().toISOString();

function sortByOrder<T extends { order: number }>(items: readonly T[]): T[] {
  return items.slice().sort((a, b) => a.order - b.order);
}

export function sanitizeLogValue(habit: Pick<Habit, 'type' | 'ratingMax'>, raw: number): number {
  const n = Number.isFinite(raw) ? Math.max(0, raw) : 0;
  switch (habit.type) {
    case 'check':
      return n > 0 ? 1 : 0;
    case 'quantity':
      return round(n, 2);
    case 'duration':
      return round(n, 1);
    case 'rating': {
      if (n <= 0) return 0;
      const max = Number.isFinite(habit.ratingMax) && habit.ratingMax >= 1 ? habit.ratingMax : 10;
      return clamp(round(n, 2), 1, max);
    }
    case 'quit':
      return 0;
  }
}

// anything longer is a forgotten timer: not restored on load and not credited in full
const MAX_TIMER_MS = 12 * 60 * 60 * 1000;
// allow for the clock changing a little between sessions
const TIMER_CLOCK_SKEW_MS = 60_000;

function logicalDayEndMs(day: DayKey, dayStartHour: number): number {
  const end = fromDayKey(addDays(day, 1));
  end.setHours(dayStartHour);
  return end.getTime();
}

// a timer can't credit more of its day than was left when it started
function timerCapMs(timer: RunningTimer, dayStartHour: number): number {
  const startedMs = Date.parse(timer.startedAt);
  if (!Number.isFinite(startedMs)) return MAX_TIMER_MS;
  const remainingInDay = logicalDayEndMs(timer.day, dayStartHour) - startedMs;
  return remainingInDay > 0 ? Math.min(MAX_TIMER_MS, remainingInDay) : MAX_TIMER_MS;
}

function reReadLogValues(data: AppData, habit: Habit): AppData {
  const habitLogs = data.logs[habit.id];
  if (!habitLogs) return data;
  let next: Record<DayKey, LogEntry> | null = null;
  for (const [day, entry] of Object.entries(habitLogs)) {
    const value = sanitizeLogValue(habit, entry.value);
    if (value === entry.value) continue;
    if (!next) next = { ...habitLogs };
    next[day] = { ...entry, value };
  }
  if (!next) return data;
  return { ...data, logs: { ...data.logs, [habit.id]: next } };
}

function rereadsLogValues(prev: Habit, next: Habit): boolean {
  return next.type !== prev.type || next.ratingMax !== prev.ratingMax;
}

/** How many logged values `patch` would rewrite, for the editor's confirm prompt. */
export function countLogValueChanges(data: AppData, habitId: string, patch: Pick<Habit, 'type' | 'ratingMax'>): number {
  const habitLogs = data.logs[habitId];
  if (!habitLogs) return 0;
  let count = 0;
  for (const entry of Object.values(habitLogs)) {
    if (sanitizeLogValue(patch, entry.value) !== entry.value) count++;
  }
  return count;
}

// for atMost goals a logged 0 means "none today", which counts as a success
function keepsZeroEntries(habit: Habit): boolean {
  return habit.kind === 'goal' && habit.direction === 'atMost' && includes(METRIC_TYPES, habit.type);
}

function patchEntry(habit: Habit, existing: LogEntry | undefined, patch: LogPatch): LogEntry | undefined {
  const rawValue = patch.value !== undefined ? patch.value : existing?.value ?? 0;
  const value = sanitizeLogValue(habit, rawValue);
  const note = meaningfulNote(patch.note !== undefined ? patch.note : existing?.note);
  const skipped = patch.skipped !== undefined ? patch.skipped === true : existing?.skipped === true;
  if (value === 0 && note === undefined && !skipped && !keepsZeroEntries(habit)) return undefined;
  const entry: LogEntry = { value, updatedAt: nowIso() };
  if (note !== undefined) entry.note = note;
  if (skipped) entry.skipped = true;
  return entry;
}

function sameEntry(a: LogEntry | undefined, b: LogEntry | undefined): boolean {
  if (!a || !b) return a === b;
  return a.value === b.value && (a.note ?? '') === (b.note ?? '') && (a.skipped === true) === (b.skipped === true);
}

function withEntry(data: AppData, habitId: string, day: DayKey, entry: LogEntry | undefined): AppData {
  const habitLogs = data.logs[habitId];
  if (entry === undefined) {
    if (!habitLogs || !hasOwn(habitLogs, day)) return data;
    const nextHabitLogs = { ...habitLogs };
    delete nextHabitLogs[day];
    const logs = { ...data.logs };
    if (Object.keys(nextHabitLogs).length === 0) delete logs[habitId];
    else logs[habitId] = nextHabitLogs;
    return { ...data, logs };
  }
  return { ...data, logs: { ...data.logs, [habitId]: { ...habitLogs, [day]: entry } } };
}

function applyLogPatch(data: AppData, habitId: string, day: DayKey, patch: LogPatch): AppData {
  if (!isValidDayKey(day)) return data;
  const habit = data.habits.find((h) => h.id === habitId);
  if (!habit) return data;
  const existing = data.logs[habitId]?.[day];
  const next = patchEntry(habit, existing, patch);
  if (sameEntry(existing, next)) return data;
  return withEntry(data, habitId, day, next);
}

function insertRelapseSorted(relapses: readonly Relapse[], relapse: Relapse): Relapse[] {
  const out = relapses.slice();
  let i = out.length;
  while (i > 0 && out[i - 1].at > relapse.at) i--;
  out.splice(i, 0, relapse);
  return out;
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!hasOwn(record, key)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

// returns null when nothing moved
function reorderItems<T extends { id: string; order: number }>(items: readonly T[], orderedIds: readonly string[]): T[] | null {
  const sorted = sortByOrder(items);
  const byId = new Map(sorted.map((it) => [it.id, it]));
  const listed: T[] = [];
  const seen = new Set<string>();
  for (const id of orderedIds) {
    const it = byId.get(id);
    if (it && !seen.has(id)) {
      listed.push(it);
      seen.add(id);
    }
  }
  const final = [...listed, ...sorted.filter((it) => !seen.has(it.id))];
  let changed = false;
  const result = final.map((it, i) => {
    if (it.order === i) return it;
    changed = true;
    return { ...it, order: i };
  });
  return changed ? result : null;
}

interface HabitNormalizeOptions {
  order: number;
  categoryIds: ReadonlySet<string>;
  fallbackCategoryId: string;
  dayStartHour: number;
  now: ISODate;
}

function normalizeSchedule(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [...ALL_WEEKDAYS];
  const days = new Set<number>();
  for (const d of raw) {
    if (typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6) days.add(d);
  }
  return days.size === 0 ? [...ALL_WEEKDAYS] : [...days].sort((a, b) => a - b);
}

function defaultRatingTarget(ratingMax: number): number {
  return Math.max(1, Math.ceil(ratingMax * 0.7));
}

function normalizeTarget(type: HabitType, period: Period, raw: unknown, ratingMax: number): number {
  const n = finiteNumber(raw);
  const valid = n !== undefined && n >= 0 ? n : undefined;
  switch (type) {
    case 'check':
      if (period === 'day') return 1;
      return clamp(Math.round(valid ?? 1), 1, period === 'week' ? 7 : 31);
    case 'quantity':
      return valid === undefined ? 1 : round(valid, 2);
    case 'duration':
      return valid === undefined ? 30 : round(valid, 1);
    case 'rating':
      return valid === undefined ? defaultRatingTarget(ratingMax) : clamp(round(valid, 2), 1, ratingMax);
    case 'quit':
      return valid === undefined ? 0 : Math.round(valid);
  }
}

function normalizeHabit(raw: unknown, opts: HabitNormalizeOptions): Habit | null {
  if (!isRecord(raw)) return null;
  const type: HabitType = includes(HABIT_TYPES, raw.type) ? raw.type : 'check';
  const kind: HabitKind = raw.kind === 'metric' && includes(METRIC_TYPES, type) ? 'metric' : 'goal';
  const period: Period = type === 'rating' || type === 'quit' ? 'day' : includes(PERIODS, raw.period) ? raw.period : 'day';
  const ratingMaxRaw = finiteNumber(raw.ratingMax);
  const ratingMax = ratingMaxRaw !== undefined && ratingMaxRaw >= 2 ? clamp(Math.round(ratingMaxRaw), 2, 100) : 10;
  const direction: GoalDirection = raw.direction === 'atMost' ? 'atMost' : 'atLeast';
  const stepRaw = finiteNumber(raw.step);
  const step = stepRaw !== undefined && round(stepRaw, 2) > 0 ? round(stepRaw, 2) : type === 'duration' ? 15 : 1;
  const createdAt = normalizeIso(raw.createdAt) ?? opts.now;
  const categoryId = typeof raw.categoryId === 'string' && opts.categoryIds.has(raw.categoryId)
    ? raw.categoryId
    : opts.fallbackCategoryId;

  return {
    id: nonEmptyString(raw.id) ?? uid('h'),
    name: nonEmptyString(raw.name) ?? 'Untitled habit',
    icon: nonEmptyString(raw.icon) ?? '✨',
    color: typeof raw.color === 'string' && hasOwn(HABIT_COLORS, raw.color) ? (raw.color as HabitColor) : 'violet',
    categoryId,
    description: typeof raw.description === 'string' ? raw.description : '',
    type,
    kind,
    period,
    schedule: normalizeSchedule(raw.schedule),
    target: normalizeTarget(type, period, raw.target, ratingMax),
    direction,
    unit: typeof raw.unit === 'string' ? raw.unit : '',
    step,
    ratingMax,
    quitStart: normalizeIso(raw.quitStart) ?? createdAt,
    startDate: isValidDayKey(raw.startDate) ? raw.startDate : logicalDayOf(createdAt, opts.dayStartHour),
    createdAt,
    archived: raw.archived === true,
    order: finiteNumber(raw.order) ?? opts.order,
  };
}

function sameHabit(a: Habit, b: Habit): boolean {
  const keys = Object.keys(b) as Array<keyof Habit>;
  if (Object.keys(a).length !== keys.length) return false;
  for (const key of keys) {
    if (key === 'schedule') {
      if (a.schedule.length !== b.schedule.length || a.schedule.some((d, i) => d !== b.schedule[i])) return false;
    } else if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
}

function normalizeSettings(raw: unknown, fallback: Settings = DEFAULT_SETTINGS): Settings {
  const s = isRecord(raw) ? raw : {};
  const bool = (v: unknown, fb: boolean) => (typeof v === 'boolean' ? v : fb);
  const hour = finiteNumber(s.dayStartHour);
  return {
    theme: includes(THEMES, s.theme) ? s.theme : fallback.theme,
    accent: typeof s.accent === 'string' && hasOwn(ACCENTS, s.accent) ? (s.accent as AccentName) : fallback.accent,
    weekStartsOn: s.weekStartsOn === 0 || s.weekStartsOn === 1 ? s.weekStartsOn : fallback.weekStartsOn,
    dayStartHour: hour !== undefined ? clamp(Math.round(hour), 0, 6) : fallback.dayStartHour,
    soundEnabled: bool(s.soundEnabled, fallback.soundEnabled),
    confettiEnabled: bool(s.confettiEnabled, fallback.confettiEnabled),
    reduceMotion: bool(s.reduceMotion, fallback.reduceMotion),
    todayGroupBy: s.todayGroupBy === 'category' || s.todayGroupBy === 'none' ? s.todayGroupBy : fallback.todayGroupBy,
    hideCompleted: bool(s.hideCompleted, fallback.hideCompleted),
    userName: typeof s.userName === 'string' ? s.userName : fallback.userName,
  };
}

function normalizeCategories(raw: unknown): Category[] {
  if (!Array.isArray(raw)) return [];
  const out: Category[] = [];
  const seen = new Set<string>();
  raw.forEach((c, index) => {
    if (!isRecord(c)) return;
    const id = nonEmptyString(c.id) ?? uid('c');
    if (seen.has(id)) return;
    seen.add(id);
    out.push({
      id,
      name: nonEmptyString(c.name) ?? 'Category',
      icon: nonEmptyString(c.icon) ?? '📁',
      order: finiteNumber(c.order) ?? index,
    });
  });
  return out;
}

function normalizeLogs(raw: unknown, habitsById: ReadonlyMap<string, Habit>, now: ISODate): AppData['logs'] {
  const logs: AppData['logs'] = {};
  if (!isRecord(raw)) return logs;
  for (const [habitId, days] of Object.entries(raw)) {
    const habit = habitsById.get(habitId);
    if (!habit || !isRecord(days)) continue;
    const habitLogs: Record<DayKey, LogEntry> = {};
    for (const [day, e] of Object.entries(days)) {
      if (!isValidDayKey(day) || !isRecord(e)) continue;
      const entry: LogEntry = {
        value: sanitizeLogValue(habit, finiteNumber(e.value) ?? 0),
        updatedAt: normalizeIso(e.updatedAt) ?? now,
      };
      const note = meaningfulNote(e.note);
      if (note !== undefined) entry.note = note;
      if (e.skipped === true) entry.skipped = true;
      habitLogs[day] = entry;
    }
    if (Object.keys(habitLogs).length > 0) logs[habitId] = habitLogs;
  }
  return logs;
}

function normalizeRelapses(raw: unknown, habitsById: ReadonlyMap<string, Habit>): Relapse[] {
  if (!Array.isArray(raw)) return [];
  const out: Relapse[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (!isRecord(r) || typeof r.habitId !== 'string' || !habitsById.has(r.habitId)) continue;
    const at = normalizeIso(r.at);
    if (!at) continue;
    let id = nonEmptyString(r.id) ?? uid('r');
    if (seen.has(id)) id = uid('r');
    seen.add(id);
    const relapse: Relapse = { id, habitId: r.habitId, at };
    const note = meaningfulNote(r.note);
    if (note !== undefined) relapse.note = note;
    out.push(relapse);
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

function normalizeTimers(
  raw: unknown,
  habitsById: ReadonlyMap<string, Habit>,
  dayStartHour: number,
  now: ISODate,
): AppData['timers'] {
  const timers: AppData['timers'] = {};
  if (!isRecord(raw)) return timers;
  const nowMs = Date.parse(now);
  for (const [habitId, t] of Object.entries(raw)) {
    if (!isRecord(t) || habitsById.get(habitId)?.type !== 'duration') continue;
    const startedAt = normalizeIso(t.startedAt);
    if (!startedAt) continue;
    if (Number.isFinite(nowMs)) {
      const age = nowMs - Date.parse(startedAt);
      if (age > MAX_TIMER_MS || age < -TIMER_CLOCK_SKEW_MS) continue;
    }
    timers[habitId] = {
      habitId,
      startedAt,
      day: isValidDayKey(t.day) ? t.day : logicalDayOf(startedAt, dayStartHour),
    };
  }
  return timers;
}

function normalizeDayNotes(raw: unknown): AppData['dayNotes'] {
  const notes: AppData['dayNotes'] = {};
  if (!isRecord(raw)) return notes;
  for (const [day, note] of Object.entries(raw)) {
    const text = meaningfulNote(note);
    if (isValidDayKey(day) && text !== undefined) notes[day] = text;
  }
  return notes;
}

function normalizeRewards(raw: unknown): RewardsState {
  const r = isRecord(raw) ? raw : {};
  const unlocked: Record<string, ISODate> = {};
  if (isRecord(r.unlocked)) {
    for (const [id, at] of Object.entries(r.unlocked)) {
      const iso = normalizeIso(at);
      if (id && iso) unlocked[id] = iso;
    }
  }
  const level = finiteNumber(r.lastSeenLevel);
  const days = Array.isArray(r.celebratedPerfectDays)
    ? [...new Set(r.celebratedPerfectDays.filter(isValidDayKey))].sort()
    : [];
  return {
    unlocked,
    lastSeenLevel: level !== undefined && level >= 1 ? Math.floor(level) : 1,
    celebratedPerfectDays: days,
  };
}

/** Fills in missing or invalid fields so older and hand-edited data still loads. */
export function migrate(input: unknown): AppData {
  const fresh = createInitialData();
  if (!isRecord(input)) return fresh;
  const now = fresh.meta.createdAt;

  const settings = normalizeSettings(input.settings);

  let categories = normalizeCategories(input.categories);
  if (categories.length === 0) categories = fresh.categories;
  const categoryIds = new Set(categories.map((c) => c.id));
  const fallbackCategoryId = sortByOrder(categories)[0].id;

  const hadHabits = Array.isArray(input.habits);
  const rawHabits: unknown[] = Array.isArray(input.habits) ? input.habits : fresh.habits;
  const habits: Habit[] = [];
  const habitsById = new Map<string, Habit>();
  rawHabits.forEach((raw, index) => {
    const habit = normalizeHabit(raw, { order: index, categoryIds, fallbackCategoryId, dayStartHour: settings.dayStartHour, now });
    if (!habit || habitsById.has(habit.id)) return;
    habits.push(habit);
    habitsById.set(habit.id, habit);
  });

  const meta = isRecord(input.meta) ? input.meta : {};
  const lastBackupAt = normalizeIso(meta.lastBackupAt);

  return {
    version: DATA_VERSION,
    habits,
    categories,
    logs: normalizeLogs(input.logs, habitsById, now),
    relapses: normalizeRelapses(input.relapses, habitsById),
    timers: normalizeTimers(input.timers, habitsById, settings.dayStartHour, now),
    dayNotes: normalizeDayNotes(input.dayNotes),
    settings,
    rewards: normalizeRewards(input.rewards),
    meta: {
      createdAt: normalizeIso(meta.createdAt) ?? now,
      ...(lastBackupAt ? { lastBackupAt } : {}),
      onboarded: typeof meta.onboarded === 'boolean' ? meta.onboarded : hadHabits,
    },
  };
}

const STORAGE_KEY = 'habit-app';
const WRITE_DEBOUNCE_MS = 200;
const WRITE_MAX_WAIT_MS = 1000;
// doubles after each failed write, up to MAX_WRITE_RETRY_MS
const WRITE_RETRY_MS = 2000;
const MAX_WRITE_RETRY_MS = 60_000;

type PersistedState = { data: AppData };

export type StorageIssueKind = 'read' | 'corrupt' | 'write';

export interface StorageIssue {
  kind: StorageIssueKind;
  // set after a failed read, so the stored data is never overwritten
  writesBlocked: boolean;
  at: number;
  message?: string;
}

export interface KeyValueBackend {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
  del: (key: string) => Promise<void>;
}

function indexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

function createMemoryBackend(): KeyValueBackend {
  const map = new Map<string, unknown>();
  const clone = <T,>(v: T): T => (typeof structuredClone === 'function' ? structuredClone(v) : v);
  return {
    get: async (key) => clone(map.get(key)),
    set: async (key, value) => {
      map.set(key, clone(value));
    },
    del: async (key) => {
      map.delete(key);
    },
  };
}

const idbBackend: KeyValueBackend = {
  get: (key) => idbGet(key),
  set: (key, value) => idbSet(key, value),
  del: (key) => idbDel(key),
};

export interface DebouncedStorage extends PersistStorage<PersistedState, void> {
  flush: () => Promise<void>;
  hadStoredValue: () => boolean;
  issue: () => StorageIssue | null;
  pendingSince: () => number;
  /** Call after loading `data` so it isn't written straight back. */
  markSaved: (data: AppData) => void;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}

function sameIssue(a: StorageIssue | null, b: StorageIssue | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.kind === b.kind && a.writesBlocked === b.writesBlocked;
}

const ISSUE_LOG: Record<StorageIssueKind, string> = {
  read: 'Could not read the stored data. Nothing will be saved this session so your data stays intact.',
  corrupt: 'The stored record is unreadable. Nothing will be saved this session so it stays recoverable.',
  write: 'Could not save data to IndexedDB. The change is kept and will be retried.',
};

export function createDebouncedStorage(
  backend: KeyValueBackend,
  hooks: { onSaved?: () => void; onIssue?: (issue: StorageIssue | null) => void } = {},
): DebouncedStorage {
  let pending: { name: string; value: StorageValue<PersistedState> } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstPendingAt = 0;
  let lastWrittenData: AppData | null = null;
  // hold writes until the first read succeeds, so defaults can't overwrite real data
  let loaded = false;
  let blocked = false;
  let storedValueFound = false;
  let issue: StorageIssue | null = null;
  let retryDelay = WRITE_RETRY_MS;
  // one write at a time, so a retry can't race the write it's retrying
  let chain: Promise<void> = Promise.resolve();

  const cancelTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const setIssue = (next: StorageIssue | null) => {
    if (sameIssue(issue, next)) return;
    issue = next;
    if (next) console.warn(`[habit] ${ISSUE_LOG[next.kind]}`, next.message ?? '');
    hooks.onIssue?.(next);
  };

  const fail = (kind: StorageIssueKind, err: unknown) => {
    setIssue({ kind, writesBlocked: kind !== 'write', at: Date.now(), message: errorMessage(err) });
  };

  const scheduleRetry = () => {
    if (!pending || blocked) return;
    cancelTimer();
    timer = setTimeout(() => void flush(), retryDelay);
    retryDelay = Math.min(retryDelay * 2, MAX_WRITE_RETRY_MS);
  };

  const writeOnce = async (): Promise<void> => {
    if (!pending || !loaded || blocked) return;
    const queued = pending;
    const data = queued.value.state.data;
    if (data === lastWrittenData) {
      if (pending === queued) pending = null;
      return;
    }
    try {
      await backend.set(queued.name, queued.value);
      lastWrittenData = data;
      // a change queued during the write has its own timer, keep it
      if (pending === queued) pending = null;
      retryDelay = WRITE_RETRY_MS;
      setIssue(null);
      hooks.onSaved?.();
    } catch (err) {
      lastWrittenData = null;
      fail('write', err);
      scheduleRetry();
    }
  };

  const flush = (): Promise<void> => {
    cancelTimer();
    chain = chain.then(writeOnce, writeOnce);
    return chain;
  };

  return {
    async getItem(name) {
      let raw: unknown;
      try {
        raw = await backend.get(name);
      } catch (err) {
        blocked = true;
        fail('read', err);
        throw err instanceof Error ? err : new Error(errorMessage(err));
      }
      if (raw === undefined || raw === null) {
        storedValueFound = false;
        loaded = true;
        return null; // first run
      }
      let value: unknown = raw;
      if (typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch {
          value = undefined;
        }
      }
      if (!isRecord(value) || !isRecord(value.state) || !isRecord((value.state as UnknownRecord).data)) {
        // something is stored but we can't read it. leave it alone, it may be recoverable by hand
        blocked = true;
        const err = new Error('The stored record is not readable Cadence data.');
        fail('corrupt', err);
        throw err;
      }
      storedValueFound = true;
      loaded = true;
      return {
        state: value.state as PersistedState,
        version: typeof value.version === 'number' ? value.version : undefined,
      };
    },
    setItem(name, value) {
      if (blocked) return;
      if (!pending) firstPendingAt = Date.now();
      pending = { name, value };
      cancelTimer();
      const wait = Math.max(0, Math.min(WRITE_DEBOUNCE_MS, firstPendingAt + WRITE_MAX_WAIT_MS - Date.now()));
      timer = setTimeout(() => void flush(), wait);
    },
    async removeItem(name) {
      if (blocked) return;
      cancelTimer();
      pending = null;
      lastWrittenData = null;
      await backend.del(name);
    },
    flush,
    hadStoredValue: () => storedValueFound,
    issue: () => issue,
    pendingSince: () => (pending ? firstPendingAt : 0),
    markSaved(data) {
      cancelTimer();
      pending = null;
      lastWrittenData = data;
    },
  };
}

// after a save, tell other tabs to reload so they don't overwrite it with stale data
const TAB_ID = uid('tab');
const useIndexedDb = indexedDbAvailable();

function openSyncChannel(): BroadcastChannel | null {
  if (!useIndexedDb || typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel('habit-app-sync');
  } catch {
    return null;
  }
}

const syncChannel = openSyncChannel();

// assigned once the store exists
let publishStorageIssue: ((issue: StorageIssue | null) => void) | null = null;

const storage = createDebouncedStorage(useIndexedDb ? idbBackend : createMemoryBackend(), {
  onSaved: () => {
    try {
      syncChannel?.postMessage({ type: 'saved', tabId: TAB_ID, at: Date.now() });
    } catch {
      // best effort
    }
  },
  onIssue: (issue) => publishStorageIssue?.(issue),
});

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('pagehide', () => void storage.flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void storage.flush();
  });
}

export function flushPersistence(): Promise<void> {
  return storage.flush();
}

let persistRequested = false;
function requestPersistentStorage(): void {
  if (persistRequested) return;
  persistRequested = true;
  try {
    if (typeof navigator === 'undefined') return;
    const result = navigator.storage?.persist?.();
    if (result) result.catch(() => undefined);
  } catch {
    // not supported everywhere
  }
}

interface HistoryEntry {
  before: AppData;
  after: AppData;
}

const HISTORY_LIMIT = 50;
let past: HistoryEntry[] = [];
let future: HistoryEntry[] = [];

// merged key by key so undoing a log doesn't also revert, say, a theme change
const KEYED_BRANCHES = new Set<keyof AppData>(['timers', 'settings', 'rewards', 'meta']);

function mergeKeyed(current: object, from: object, to: object): object {
  if (from === to) return current;
  const cur = current as Record<string, unknown>;
  const src = from as Record<string, unknown>;
  const dst = to as Record<string, unknown>;
  let result = cur;
  const ensureCopy = () => {
    if (result === cur) result = { ...cur };
    return result;
  };
  for (const key of new Set([...Object.keys(src), ...Object.keys(dst)])) {
    if (src[key] === dst[key] && hasOwn(src, key) === hasOwn(dst, key)) continue;
    if (hasOwn(dst, key)) {
      if (!hasOwn(cur, key) || cur[key] !== dst[key]) ensureCopy()[key] = dst[key];
    } else if (hasOwn(cur, key)) {
      delete ensureCopy()[key];
    }
  }
  return result;
}

function applyTransition(current: AppData, from: AppData, to: AppData): AppData {
  const out = { ...current } as Record<keyof AppData, unknown>;
  for (const key of Object.keys(to) as Array<keyof AppData>) {
    if (from[key] === to[key]) continue;
    out[key] = KEYED_BRANCHES.has(key) ? mergeKeyed(current[key] as object, from[key] as object, to[key] as object) : to[key];
  }
  const result = out as unknown as AppData;
  const habitIds = new Set(result.habits.map((h) => h.id));
  const orphanTimers = Object.keys(result.timers).filter((id) => !habitIds.has(id));
  if (orphanTimers.length > 0) {
    const timers = { ...result.timers };
    for (const id of orphanTimers) delete timers[id];
    result.timers = timers;
  }
  return result;
}

const historyFlags = () => ({ canUndo: past.length > 0, canRedo: future.length > 0 });

export const useStore = create<AppStore>()(
  persist<AppStore, [], [], PersistedState>(
    (set, get) => {
      const commit = (recipe: (data: AppData) => AppData, undoable: boolean): boolean => {
        const before = get().data;
        const after = recipe(before);
        if (after === before) return false;
        if (undoable) {
          past.push({ before, after });
          if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
          future = [];
        }
        set({ data: after, ...historyFlags() });
        return true;
      };

      const findHabit = (data: AppData, id: string) => data.habits.find((h) => h.id === id);

      const habitOptions = (data: AppData, order: number): HabitNormalizeOptions => {
        const sorted = sortByOrder(data.categories);
        return {
          order,
          categoryIds: new Set(data.categories.map((c) => c.id)),
          fallbackCategoryId: sorted[0]?.id ?? DEFAULT_CATEGORIES[0].id,
          dayStartHour: data.settings.dayStartHour,
          now: nowIso(),
        };
      };

      return {
        data: createInitialData(),
        hydrated: false,
        canUndo: false,
        canRedo: false,
        storageError: null,

        setLog: (habitId, day, patch) => {
          commit((d) => applyLogPatch(d, habitId, day, patch), true);
        },

        clearLog: (habitId, day) => {
          commit((d) => withEntry(d, habitId, day, undefined), true);
        },

        adjustLog: (habitId, day, delta) => {
          if (!Number.isFinite(delta) || delta === 0) return;
          commit((d) => {
            const current = d.logs[habitId]?.[day]?.value ?? 0;
            const value = round(Math.max(0, current + delta), 2);
            return applyLogPatch(d, habitId, day, delta > 0 ? { value, skipped: false } : { value });
          }, true);
        },

        toggleCheck: (habitId, day) => {
          commit((d) => {
            const entry = d.logs[habitId]?.[day];
            const done = !!entry && !entry.skipped && entry.value > 0;
            return applyLogPatch(d, habitId, day, { value: done ? 0 : 1, skipped: false });
          }, true);
        },

        setSkipped: (habitId, day, skipped) => {
          commit((d) => applyLogPatch(d, habitId, day, { skipped }), true);
        },

        setSkippedMany: (habitIds, day, skipped, note) => {
          const reason = note?.trim() ?? '';
          commit(
            (d) =>
              habitIds.reduce((acc, habitId) => {
                const hasNote = (acc.logs[habitId]?.[day]?.note ?? '').trim() !== '';
                return applyLogPatch(acc, habitId, day, reason !== '' && !hasNote ? { skipped, note: reason } : { skipped });
              }, d),
            true,
          );
        },

        addRelapse: (habitId, at, note) => {
          const relapse: Relapse = { id: uid('r'), habitId, at: normalizeIso(at) ?? nowIso() };
          const text = meaningfulNote(note);
          if (text !== undefined) relapse.note = text;
          commit((d) => (findHabit(d, habitId) ? { ...d, relapses: insertRelapseSorted(d.relapses, relapse) } : d), true);
          return relapse;
        },

        updateRelapse: (id, patch) => {
          commit((d) => {
            const prev = d.relapses.find((r) => r.id === id);
            if (!prev) return d;
            const next: Relapse = { id: prev.id, habitId: prev.habitId, at: normalizeIso(patch.at) ?? prev.at };
            const note = meaningfulNote(patch.note !== undefined ? patch.note : prev.note);
            if (note !== undefined) next.note = note;
            if (next.at === prev.at && next.note === prev.note) return d;
            return { ...d, relapses: insertRelapseSorted(d.relapses.filter((r) => r.id !== id), next) };
          }, true);
        },

        deleteRelapse: (id) => {
          commit((d) => (d.relapses.some((r) => r.id === id) ? { ...d, relapses: d.relapses.filter((r) => r.id !== id) } : d), true);
        },

        startTimer: (habitId, day) => {
          commit((d) => {
            if (d.timers[habitId] || !isValidDayKey(day) || findHabit(d, habitId)?.type !== 'duration') return d;
            const timer: RunningTimer = { habitId, startedAt: nowIso(), day };
            return { ...d, timers: { ...d.timers, [habitId]: timer } };
          }, false);
        },

        stopTimer: (habitId) => {
          const timer = get().data.timers[habitId];
          if (!timer) return 0;
          const rawElapsedMs = Date.now() - Date.parse(timer.startedAt);
          const elapsedMs = Math.min(rawElapsedMs, timerCapMs(timer, get().data.settings.dayStartHour));
          const minutes = Number.isFinite(elapsedMs) && elapsedMs >= 30_000 ? Math.max(1, Math.round(elapsedMs / 60_000)) : 0;
          let added = 0;
          commit((d) => {
            const stopped: AppData = { ...d, timers: withoutKey(d.timers, habitId) };
            if (minutes === 0 || !findHabit(d, habitId)) return stopped;
            const current = d.logs[habitId]?.[timer.day]?.value ?? 0;
            const next = applyLogPatch(stopped, habitId, timer.day, { value: current + minutes, skipped: false });
            added = (next.logs[habitId]?.[timer.day]?.value ?? 0) - current;
            return next;
          }, true);
          return Math.max(0, round(added, 1));
        },

        cancelTimer: (habitId) => {
          commit((d) => (d.timers[habitId] ? { ...d, timers: withoutKey(d.timers, habitId) } : d), false);
        },

        addHabit: (habit) => {
          commit((d) => {
            const maxOrder = d.habits.reduce((m, h) => Math.max(m, h.order), -1);
            const normalized = normalizeHabit(habit, habitOptions(d, maxOrder + 1));
            if (!normalized) return d;
            const unique = d.habits.some((h) => h.id === normalized.id) ? { ...normalized, id: uid('h') } : normalized;
            return { ...d, habits: [...d.habits, unique] };
          }, true);
        },

        updateHabit: (id, patch) => {
          commit((d) => {
            const index = d.habits.findIndex((h) => h.id === id);
            if (index < 0) return d;
            const prev = d.habits[index];
            const next = normalizeHabit({ ...prev, ...patch, id: prev.id }, habitOptions(d, prev.order));
            if (!next || sameHabit(prev, next)) return d;
            const habits = d.habits.slice();
            habits[index] = next;
            const dropTimer = !!d.timers[id] && (next.type !== 'duration' || next.archived);
            const updated: AppData = { ...d, habits, timers: dropTimer ? withoutKey(d.timers, id) : d.timers };
            return rereadsLogValues(prev, next) ? reReadLogValues(updated, next) : updated;
          }, true);
        },

        setArchived: (id, archived) => {
          get().updateHabit(id, { archived });
        },

        deleteHabit: (id) => {
          commit((d) => {
            if (!findHabit(d, id)) return d;
            return {
              ...d,
              habits: d.habits.filter((h) => h.id !== id),
              logs: withoutKey(d.logs, id),
              relapses: d.relapses.some((r) => r.habitId === id) ? d.relapses.filter((r) => r.habitId !== id) : d.relapses,
              timers: withoutKey(d.timers, id),
            };
          }, true);
        },

        duplicateHabit: (id) => {
          const data = get().data;
          const source = findHabit(data, id);
          if (!source) return undefined;
          const now = new Date();
          let copy: Habit = {
            ...source,
            schedule: [...source.schedule],
            id: uid('h'),
            name: `${source.name} (copy)`,
            createdAt: now.toISOString(),
            quitStart: now.toISOString(),
            startDate: logicalToday(data.settings.dayStartHour, now),
            archived: false,
          };
          commit((d) => {
            const sorted = sortByOrder(d.habits);
            const position = sorted.findIndex((h) => h.id === id);
            if (position < 0) return d;
            sorted.splice(position + 1, 0, copy);
            const habits = sorted.map((h, i) => (h.order === i ? h : { ...h, order: i }));
            copy = habits[position + 1];
            return { ...d, habits };
          }, true);
          return copy;
        },

        reorderHabits: (orderedIds) => {
          commit((d) => {
            const habits = reorderItems(d.habits, orderedIds);
            return habits ? { ...d, habits } : d;
          }, true);
        },

        addCategory: ({ name, icon }) => {
          const data = get().data;
          const category: Category = {
            id: uid('c'),
            name: typeof name === 'string' && name.trim() !== '' ? name.trim() : 'New category',
            icon: typeof icon === 'string' && icon.trim() !== '' ? icon.trim() : '📁',
            order: data.categories.reduce((m, c) => Math.max(m, c.order), -1) + 1,
          };
          commit((d) => ({ ...d, categories: [...d.categories, category] }), true);
          return category;
        },

        updateCategory: (id, patch) => {
          commit((d) => {
            const index = d.categories.findIndex((c) => c.id === id);
            if (index < 0) return d;
            const prev = d.categories[index];
            const next: Category = {
              id: prev.id,
              name: nonEmptyString(patch.name) ?? prev.name,
              icon: nonEmptyString(patch.icon) ?? prev.icon,
              order: finiteNumber(patch.order) ?? prev.order,
            };
            if (next.name === prev.name && next.icon === prev.icon && next.order === prev.order) return d;
            const categories = d.categories.slice();
            categories[index] = next;
            return { ...d, categories };
          }, true);
        },

        deleteCategory: (id, moveToId) => {
          commit((d) => {
            if (d.categories.length <= 1 || !d.categories.some((c) => c.id === id)) return d;
            const remaining = d.categories.filter((c) => c.id !== id);
            const destination = remaining.find((c) => c.id === moveToId) ?? sortByOrder(remaining)[0];
            const habits = d.habits.some((h) => h.categoryId === id)
              ? d.habits.map((h) => (h.categoryId === id ? { ...h, categoryId: destination.id } : h))
              : d.habits;
            return { ...d, categories: remaining, habits };
          }, true);
        },

        reorderCategories: (orderedIds) => {
          commit((d) => {
            const categories = reorderItems(d.categories, orderedIds);
            return categories ? { ...d, categories } : d;
          }, true);
        },

        setDayNote: (day, note) => {
          commit((d) => {
            if (!isValidDayKey(day)) return d;
            const text = meaningfulNote(note);
            if (text === undefined) return hasOwn(d.dayNotes, day) ? { ...d, dayNotes: withoutKey(d.dayNotes, day) } : d;
            if (d.dayNotes[day] === text) return d;
            return { ...d, dayNotes: { ...d.dayNotes, [day]: text } };
          }, true);
        },

        updateSettings: (patch) => {
          commit((d) => {
            const next = normalizeSettings({ ...d.settings, ...patch }, d.settings);
            const changed = (Object.keys(next) as Array<keyof Settings>).some((k) => next[k] !== d.settings[k]);
            return changed ? { ...d, settings: next } : d;
          }, false);
        },

        unlockAchievements: (ids) => {
          commit((d) => {
            const stamp = nowIso();
            let unlocked = d.rewards.unlocked;
            for (const id of ids) {
              if (typeof id !== 'string' || id === '' || hasOwn(unlocked, id)) continue;
              if (unlocked === d.rewards.unlocked) unlocked = { ...unlocked };
              unlocked[id] = stamp;
            }
            return unlocked === d.rewards.unlocked ? d : { ...d, rewards: { ...d.rewards, unlocked } };
          }, false);
        },

        setLastSeenLevel: (level) => {
          commit((d) => {
            if (!Number.isFinite(level)) return d;
            const next = Math.max(1, Math.floor(level));
            return next === d.rewards.lastSeenLevel ? d : { ...d, rewards: { ...d.rewards, lastSeenLevel: next } };
          }, false);
        },

        markPerfectDayCelebrated: (day) => {
          commit((d) => {
            if (!isValidDayKey(day) || d.rewards.celebratedPerfectDays.includes(day)) return d;
            const celebratedPerfectDays = [...d.rewards.celebratedPerfectDays, day].sort();
            return { ...d, rewards: { ...d.rewards, celebratedPerfectDays } };
          }, false);
        },

        replaceData: (data) => {
          commit(() => migrate(data), true);
        },

        resetData: () => {
          commit((d) => ({ ...createInitialData(), settings: d.settings }), true);
        },

        setOnboarded: (onboarded = true) => {
          commit((d) => (d.meta.onboarded === onboarded ? d : { ...d, meta: { ...d.meta, onboarded } }), false);
        },

        markBackup: () => {
          commit((d) => ({ ...d, meta: { ...d.meta, lastBackupAt: nowIso() } }), false);
        },

        undo: () => {
          const entry = past.pop();
          if (!entry) return;
          future.push(entry);
          set({ data: applyTransition(get().data, entry.after, entry.before), ...historyFlags() });
        },

        redo: () => {
          const entry = future.pop();
          if (!entry) return;
          past.push(entry);
          set({ data: applyTransition(get().data, entry.before, entry.after), ...historyFlags() });
        },
      };
    },
    {
      name: STORAGE_KEY,
      version: DATA_VERSION,
      storage,
      partialize: (state) => ({ data: state.data }),
      // the real migration runs in merge, on every load
      migrate: (persisted) => persisted as PersistedState,
      merge: (persisted, current) => {
        // undo snapshots belong to the old data, so drop them on any rehydrate
        past = [];
        future = [];
        if (!isRecord(persisted) || !isRecord(persisted.data)) {
          return { ...current, hydrated: true, canUndo: false, canRedo: false };
        }
        return { ...current, data: migrate(persisted.data), hydrated: true, canUndo: false, canRedo: false };
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          // writes are already blocked. hydrated stays false so we never show empty data or onboarding
          const issue = storage.issue();
          if (issue) publishStorageIssue?.(issue);
          requestPersistentStorage();
          return;
        }
        if (storage.hadStoredValue()) storage.markSaved(useStore.getState().data);
        // first run: save right away so generated ids stay stable across reloads
        else storage.setItem(STORAGE_KEY, { state: { data: useStore.getState().data }, version: DATA_VERSION });
        requestPersistentStorage();
      },
    },
  ),
);

let writeFailureToastId: string | null = null;

// Settings shows a banner for this too, but the user may never open Settings
function warnAboutWrites(issue: StorageIssue | null): void {
  if (issue?.kind === 'write') {
    if (writeFailureToastId !== null) return;
    writeFailureToastId = toast({
      title: 'Cadence can’t save right now',
      description: 'Your changes are only in this tab. Export a backup from Settings to be safe.',
      tone: 'danger',
      icon: '⚠️',
      duration: 0,
    });
  } else if (writeFailureToastId !== null) {
    useUI.getState().dismissToast(writeFailureToastId);
    writeFailureToastId = null;
  }
}

publishStorageIssue = (issue) => {
  // setState goes through persist, but flush skips unchanged data and blocked storage ignores it
  if (!sameIssue(useStore.getState().storageError, issue)) useStore.setState({ storageError: issue });
  warnAboutWrites(issue);
};

/** Another tab saved. Flush our own pending write first, then reload unless ours is newer. */
export async function syncFromOtherTab(savedAt: number): Promise<void> {
  const pendingSince = storage.pendingSince();
  await storage.flush();
  if (pendingSince > 0 && savedAt > 0 && pendingSince > savedAt) return;
  const hadHistory = past.length > 0 || future.length > 0;
  await useStore.persist.rehydrate();
  if (hadHistory && past.length === 0 && future.length === 0) {
    toast({
      title: 'Updated from another tab',
      description: 'Cadence reloaded your data, so undo history in this tab was cleared.',
      icon: '🔄',
    });
  }
}

syncChannel?.addEventListener('message', (event: MessageEvent<unknown>) => {
  const message = event.data;
  if (!isRecord(message) || message.type !== 'saved' || message.tabId === TAB_ID) return;
  void syncFromOtherTab(finiteNumber(message.at) ?? 0);
});

export function clearHistory(): void {
  past = [];
  future = [];
  useStore.setState(historyFlags());
}

export const getData = (): AppData => useStore.getState().data;
export const actions = (): AppStore => useStore.getState();

export type { LogEntry };
