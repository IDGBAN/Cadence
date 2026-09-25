// turns stored, imported or hand-edited data into valid AppData. pure, so importing it has no side effects
import type {
  AccentName, AppData, Category, DayKey, GoalDirection, Habit, HabitColor, HabitKind, HabitType, ISODate, LogEntry,
  Period, Relapse, RewardsState, Settings, ThemeName,
} from '@/types';
import { createInitialData, DATA_VERSION, DEFAULT_SETTINGS, uid } from '@/lib/defaults';
import { fromDayKey, logicalDayOf, toDayKey } from '@/lib/dates';
import { ACCENTS, HABIT_COLORS } from '@/lib/colors';

type UnknownRecord = Record<string, unknown>;

const HABIT_TYPES: readonly HabitType[] = ['check', 'quantity', 'duration', 'rating', 'quit'];
export const METRIC_TYPES: readonly HabitType[] = ['quantity', 'duration', 'rating'];
const PERIODS: readonly Period[] = ['day', 'week', 'month'];
const THEMES: readonly ThemeName[] = ['midnight', 'oled', 'dusk', 'daylight'];
const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function includes<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (list as readonly string[]).includes(v);
}

export function finiteNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export function nonEmptyString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

export function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

// rejects impossible dates like 2026-02-30
export function isValidDayKey(v: unknown): v is DayKey {
  return typeof v === 'string' && DAY_KEY_RE.test(v) && toDayKey(fromDayKey(v)) === v;
}

export function normalizeIso(v: unknown): ISODate | undefined {
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString() : undefined;
  if (typeof v !== 'string' || v.trim() === '') return undefined;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

export function sortByOrder<T extends { order: number }>(items: readonly T[]): T[] {
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
export const MAX_TIMER_MS = 12 * 60 * 60 * 1000;
// allow for the clock changing a little between sessions
const TIMER_CLOCK_SKEW_MS = 60_000;

export interface HabitNormalizeOptions {
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

export function normalizeHabit(raw: unknown, opts: HabitNormalizeOptions): Habit | null {
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

export function normalizeSettings(raw: unknown, fallback: Settings = DEFAULT_SETTINGS): Settings {
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
      const note = nonEmptyString(e.note);
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
    const note = nonEmptyString(r.note);
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
    const text = nonEmptyString(note);
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
