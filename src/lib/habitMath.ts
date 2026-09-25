// Pure habit engine: turns logs into statuses, progress, streaks, rates and strength.
// Strength is a Loop-style EMA. Log maps and the relapses array are memoized by reference,
// so replace them instead of mutating in place.
import type {
  AppData, DayCell, DayKey, DayStatus, Habit, HabitSummary, LogEntry, Period, PeriodProgress, Relapse,
  Settings, StreakInfo,
} from '@/types';
import { fromDayKey, logicalDayOf, logicalToday } from './dates';

export interface EngineCtx {
  today: DayKey; // logical day, shifted by dayStartHour
  weekStartsOn: 0 | 1;
  dayStartHour: number;
  now: Date; // wall clock for the live quit counters
}

export function makeCtx(settings: Pick<Settings, 'weekStartsOn' | 'dayStartHour'>, now: Date = new Date()): EngineCtx {
  return {
    today: logicalToday(settings.dayStartHour, now),
    weekStartsOn: settings.weekStartsOn,
    dayStartHour: settings.dayStartHour,
    now,
  };
}

const DAY_MS = 86_400_000;
const EPS = 1e-9;
// EMA half-lives: 14 days, 4 weeks, 2 months
const M_DAY = Math.pow(0.5, 1 / 14);
const M_WEEK = Math.pow(0.5, 1 / 4);
const M_MONTH = Math.pow(0.5, 1 / 2);
const QUIT_MILESTONES = [1, 3, 7, 14, 30, 60, 90, 180, 365, 730, 1095];
const ALL_DAYS_MASK = 0b1111111;
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const PAD2: readonly string[] = Array.from({ length: 32 }, (_, i) => (i < 10 ? `0${i}` : String(i)));

// numeric statuses so hot loops can use typed arrays
const S_DONE = 0;
const S_PARTIAL = 1;
const S_MISSED = 2;
const S_SKIPPED = 3;
const S_PENDING = 4;
const S_NOT_DUE = 5;
const S_FUTURE = 6;
const S_BEFORE = 7;
const S_LOGGED = 8;
const S_EMPTY = 9;
const STATUS_NAMES: readonly DayStatus[] = [
  'done', 'partial', 'missed', 'skipped', 'pending', 'notDue', 'future', 'beforeStart', 'logged', 'empty',
];

const F_DUE = 1;
const F_HAS_VALUE = 2;

const finite = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function weekdayOfYmd(y: number, m: number, d: number): number {
  const days = Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
  // 1970-01-01 was a Thursday
  return (((days + 4) % 7) + 7) % 7;
}

function weekdayOfKey(key: DayKey): number {
  return weekdayOfYmd(Number(key.slice(0, 4)), Number(key.slice(5, 7)), Number(key.slice(8, 10)));
}

// steps through days without allocating a Date each time
class DayCursor {
  key: DayKey;
  weekday: number;
  private y: number;
  private m: number;
  private d: number;

  constructor(key: DayKey) {
    this.key = key;
    this.y = Number(key.slice(0, 4));
    this.m = Number(key.slice(5, 7));
    this.d = Number(key.slice(8, 10));
    this.weekday = weekdayOfYmd(this.y, this.m, this.d);
  }

  next(): void {
    const monthLength = this.m === 2 && isLeapYear(this.y) ? 29 : MONTH_DAYS[this.m - 1];
    if (this.d < monthLength) {
      this.d++;
    } else {
      this.d = 1;
      if (this.m < 12) this.m++;
      else {
        this.m = 1;
        this.y++;
      }
    }
    this.weekday = this.weekday === 6 ? 0 : this.weekday + 1;
    this.key = `${this.y}-${PAD2[this.m]}-${PAD2[this.d]}`;
  }
}

// UTC so DST can't shift the count
function dayNumber(key: DayKey): number {
  return Math.round(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10))) / DAY_MS);
}

function dayDiff(a: DayKey, b: DayKey): number {
  return dayNumber(b) - dayNumber(a);
}

function shiftDay(key: DayKey, n: number): DayKey {
  const dt = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)) + n));
  return `${dt.getUTCFullYear()}-${PAD2[dt.getUTCMonth() + 1]}-${PAD2[dt.getUTCDate()]}`;
}

function spanDays(from: DayKey, to: DayKey): number {
  return to < from ? 0 : dayDiff(from, to) + 1;
}

function periodBounds(day: DayKey, period: 'week' | 'month', weekStartsOn: 0 | 1): { start: DayKey; end: DayKey; length: number } {
  if (period === 'week') {
    const start = shiftDay(day, -((weekdayOfKey(day) - weekStartsOn + 7) % 7));
    return { start, end: shiftDay(start, 6), length: 7 };
  }
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7));
  const length = m === 2 && isLeapYear(y) ? 29 : MONTH_DAYS[m - 1];
  const prefix = day.slice(0, 8);
  return { start: `${prefix}01`, end: `${prefix}${PAD2[length]}`, length };
}

const earliestLogCache = new WeakMap<Record<DayKey, LogEntry>, DayKey>();

function earliestLogDay(logs: Record<DayKey, LogEntry> | undefined): DayKey | undefined {
  if (!logs) return undefined;
  const cached = earliestLogCache.get(logs);
  // cheap check in case the cached day was deleted or changed in place
  if (cached !== undefined && logs[cached] !== undefined && !logs[cached].skipped) return cached;
  let min: DayKey | undefined;
  for (const key in logs) {
    // an excused day isn't tracking, so it can't move the start earlier
    if (key.length === 10 && !logs[key].skipped && (min === undefined || key < min)) min = key;
  }
  // skip caching empty maps, they're cheap to scan and likely to be filled next
  if (min !== undefined) earliestLogCache.set(logs, min);
  return min;
}

interface SortedRelapses {
  list: Relapse[];
  times: number[]; // parsed `at`, parallel to list
}

interface RelapseCacheEntry {
  length: number;
  last: Relapse | undefined;
  byHabit: Map<string, SortedRelapses>;
}

const relapseCache = new WeakMap<Relapse[], RelapseCacheEntry>();
const EMPTY_RELAPSES: Relapse[] = [];

function sortedRelapses(data: AppData, habitId: string): SortedRelapses {
  const all = Array.isArray(data.relapses) ? data.relapses : EMPTY_RELAPSES;
  const last = all[all.length - 1];
  let entry = relapseCache.get(all);
  if (!entry || entry.length !== all.length || entry.last !== last) {
    entry = { length: all.length, last, byHabit: new Map() };
    relapseCache.set(all, entry);
  }
  let sorted = entry.byHabit.get(habitId);
  if (!sorted) {
    const pairs: Array<{ relapse: Relapse; t: number }> = [];
    for (const relapse of all) {
      if (relapse.habitId !== habitId) continue;
      const t = Date.parse(relapse.at);
      if (Number.isFinite(t)) pairs.push({ relapse, t });
    }
    pairs.sort((a, b) => a.t - b.t);
    sorted = { list: pairs.map((p) => p.relapse), times: pairs.map((p) => p.t) };
    entry.byHabit.set(habitId, sorted);
  }
  return sorted;
}

export type HabitMode = 'daily' | 'period' | 'quit' | 'metric';

interface QuitIndex {
  startMs: number;
  startIso: string;
  startDay: DayKey;
  list: Relapse[];
  times: number[];
  relapseDays: Set<DayKey>;
}

interface Prep {
  habit: Habit;
  logs: Record<DayKey, LogEntry> | undefined;
  mode: HabitMode;
  period: Period;
  mask: number;
  target: number;
  isCheck: boolean;
  atMost: boolean;
  baseStart: DayKey; // start ignoring logs
  start: DayKey | undefined; // filled lazily by startOf
  quit: QuitIndex | undefined;
}

/** The period goals are measured over. Rating and quit habits are always daily. */
export function effectivePeriod(habit: Habit): Period {
  if (habit.type === 'rating' || habit.type === 'quit') return 'day';
  return habit.period === 'week' || habit.period === 'month' ? habit.period : 'day';
}

/** How the engine evaluates a habit. Use this instead of re-deriving it from type, kind and period. */
export function habitMode(habit: Habit): HabitMode {
  if (habit.type === 'quit') return 'quit';
  if (habit.kind === 'metric') return 'metric';
  return effectivePeriod(habit) === 'day' ? 'daily' : 'period';
}

function scheduleMask(schedule: readonly number[] | undefined): number {
  let mask = 0;
  if (Array.isArray(schedule)) {
    for (const d of schedule) if (Number.isInteger(d) && d >= 0 && d <= 6) mask |= 1 << d;
  }
  return mask === 0 ? ALL_DAYS_MASK : mask;
}

function validStartDate(habit: Habit, ctx: EngineCtx): DayKey {
  if (typeof habit.startDate === 'string' && DAY_KEY_RE.test(habit.startDate)) return habit.startDate;
  const created = Date.parse(habit.createdAt);
  return Number.isFinite(created) ? logicalDayOf(new Date(created), ctx.dayStartHour) : ctx.today;
}

function buildQuitIndex(habit: Habit, data: AppData, startDate: DayKey, dayStartHour: number): QuitIndex {
  let startMs = Date.parse(habit.quitStart);
  let startIso = habit.quitStart;
  if (!Number.isFinite(startMs)) {
    const d = fromDayKey(startDate);
    d.setHours(dayStartHour);
    startMs = d.getTime();
    startIso = d.toISOString();
  }
  const startDay = logicalDayOf(new Date(startMs), dayStartHour);
  const { list, times } = sortedRelapses(data, habit.id);
  const relapseDays = new Set<DayKey>();
  for (const t of times) {
    const day = logicalDayOf(new Date(t), dayStartHour);
    if (day >= startDay) relapseDays.add(day);
  }
  return { startMs, startIso, startDay, list, times, relapseDays };
}

function prepare(habit: Habit, data: AppData, ctx: EngineCtx): Prep {
  const mode = habitMode(habit);
  const startDate = validStartDate(habit, ctx);
  const quit = mode === 'quit' ? buildQuitIndex(habit, data, startDate, ctx.dayStartHour) : undefined;
  return {
    habit,
    logs: data.logs ? data.logs[habit.id] : undefined,
    mode,
    period: mode === 'period' ? effectivePeriod(habit) : 'day',
    mask: mode === 'quit' ? ALL_DAYS_MASK : scheduleMask(habit.schedule),
    target: Math.max(0, finite(habit.target)),
    isCheck: habit.type === 'check',
    atMost: habit.direction === 'atMost' && habit.type !== 'check' && habit.type !== 'quit',
    baseStart: quit && quit.startDay < startDate ? quit.startDay : startDate,
    start: undefined,
    quit,
  };
}

function startOf(p: Prep): DayKey {
  if (p.start === undefined) {
    const earliest = earliestLogDay(p.logs);
    p.start = earliest !== undefined && earliest < p.baseStart ? earliest : p.baseStart;
  }
  return p.start;
}

function historyStart(p: Prep): DayKey {
  return p.quit ? p.quit.startDay : startOf(p);
}

function isBeforeStart(p: Prep, day: DayKey): boolean {
  if (p.quit) return day < p.quit.startDay;
  return day < p.baseStart && day < startOf(p);
}

function dailySuccess(p: Prep, value: number): boolean {
  if (p.isCheck) return value > 0;
  if (p.atMost) return value <= p.target;
  return value >= p.target;
}

function dailyScore(p: Prep, value: number): number {
  if (p.isCheck) return value > 0 ? 1 : 0;
  if (p.atMost) {
    if (value <= p.target) return 1;
    return Math.max(0, 1 - (value - p.target) / Math.max(p.target, 1));
  }
  if (p.target <= 0) return 1;
  return Math.min(1, Math.max(0, value / p.target));
}

// a 0 still counts for atMost goals ("none today") and non-rating metrics, but a rating of 0 means not rated
function hasValue(p: Prep, value: number): boolean {
  if (value > 0) return true;
  if (p.mode === 'quit' || p.isCheck || p.habit.type === 'rating') return false;
  if (p.mode === 'metric') return true;
  return p.atMost;
}

// whether a daily entry gets judged against the goal at all. A note-only rating entry doesn't
function isScorable(p: Prep, entry: LogEntry | undefined, value: number): boolean {
  return entry !== undefined && (value > 0 || p.habit.type !== 'rating');
}

interface DayEval {
  status: number;
  score: number;
  value: number;
  due: boolean;
  hasValue: boolean;
  entry: LogEntry | undefined;
}

function newDayEval(): DayEval {
  return { status: S_EMPTY, score: 0, value: 0, due: false, hasValue: false, entry: undefined };
}

// writes into `out` so hot loops don't allocate; weekday must match day
function evalDay(p: Prep, day: DayKey, weekday: number, today: DayKey, out: DayEval): void {
  const entry = p.logs ? p.logs[day] : undefined;
  const skipped = entry !== undefined && entry.skipped === true;
  const value = entry !== undefined && !skipped ? finite(entry.value) : 0;
  out.entry = entry;
  out.value = value;
  out.score = 0;
  out.hasValue = false;
  out.due = p.mode !== 'daily' || (p.mask & (1 << weekday)) !== 0;

  if (day > today) {
    out.status = S_FUTURE;
    return;
  }
  if (p.quit) {
    if (day < p.quit.startDay) out.status = S_BEFORE;
    else if (p.quit.relapseDays.has(day)) out.status = S_MISSED;
    else {
      out.status = S_DONE;
      out.score = 1;
    }
    return;
  }
  if (isBeforeStart(p, day)) {
    out.status = S_BEFORE;
    return;
  }
  if (skipped) {
    out.status = S_SKIPPED;
    return;
  }
  out.hasValue = entry !== undefined && hasValue(p, value);

  if (p.mode === 'metric') {
    out.status = out.hasValue ? S_LOGGED : S_EMPTY;
    out.score = out.hasValue ? 1 : 0;
    return;
  }
  if (p.mode === 'period') {
    // an amount logged against a limit isn't a win for that day, only the period total is
    if (p.atMost) {
      out.status = out.hasValue ? S_LOGGED : S_EMPTY;
      return;
    }
    const contributed = entry !== undefined && value > 0;
    out.status = contributed ? S_DONE : S_EMPTY;
    out.score = contributed ? 1 : 0;
    return;
  }

  const scorable = isScorable(p, entry, value);
  if (scorable && dailySuccess(p, value)) {
    out.status = S_DONE;
    out.score = 1;
    return;
  }
  out.score = scorable ? dailyScore(p, value) : 0;
  if (!out.due) {
    out.status = S_NOT_DUE;
    return;
  }
  if (scorable) {
    if (p.atMost) {
      out.status = S_MISSED; // already over the limit, so it's a miss even today
      return;
    }
    if (value > 0) {
      out.status = S_PARTIAL;
      return;
    }
  }
  out.status = day === today ? S_PENDING : S_MISSED;
}

function toCell(day: DayKey, ev: DayEval): DayCell {
  const st = ev.status;
  let progress = 0;
  if (st === S_DONE || st === S_LOGGED) progress = 1;
  else if (st === S_PARTIAL || st === S_MISSED || st === S_PENDING || st === S_NOT_DUE) progress = ev.score;
  return {
    day,
    status: STATUS_NAMES[st],
    value: ev.entry ? ev.entry.value : undefined,
    note: ev.entry ? ev.entry.note : undefined,
    progress,
  };
}

function dayAsPeriod(p: Prep, day: DayKey, ev: DayEval, today: DayKey): PeriodProgress {
  const st = ev.status;
  const current = day === today;
  if (p.mode === 'quit') {
    const clean = st === S_DONE;
    return {
      start: day, end: day, achieved: clean ? 1 : 0, target: 1, progress: clean ? 1 : 0,
      success: clean, current, skipped: st === S_BEFORE,
    };
  }
  if (p.mode === 'metric') {
    return {
      start: day, end: day, achieved: ev.hasValue ? ev.value : 0, target: p.target,
      progress: st === S_LOGGED ? 1 : 0, success: false, current,
      skipped: st === S_SKIPPED || st === S_BEFORE,
    };
  }
  const success = st === S_DONE;
  const neutral = st === S_FUTURE || st === S_BEFORE || st === S_SKIPPED;
  return {
    start: day,
    end: day,
    achieved: p.isCheck ? (success ? 1 : 0) : ev.value,
    target: p.isCheck ? 1 : p.target,
    progress: success ? 1 : neutral ? 0 : ev.score,
    success,
    current,
    skipped: st === S_SKIPPED || st === S_NOT_DUE || st === S_BEFORE,
  };
}

interface Timeline {
  from: DayKey;
  n: number;
  todayIndex: number;
  status: Uint8Array;
  score: Float64Array;
  value: Float64Array;
  flags: Uint8Array;
}

function buildTimeline(p: Prep, from: DayKey, to: DayKey, today: DayKey): Timeline {
  const n = spanDays(from, to);
  const tl: Timeline = {
    from,
    n,
    todayIndex: today >= from && today <= to ? dayDiff(from, today) : -1,
    status: new Uint8Array(n),
    score: new Float64Array(n),
    value: new Float64Array(n),
    flags: new Uint8Array(n),
  };
  if (n === 0) return tl;
  const ev = newDayEval();
  const cursor = new DayCursor(from);
  for (let i = 0; i < n; i++) {
    if (i > 0) cursor.next();
    evalDay(p, cursor.key, cursor.weekday, today, ev);
    tl.status[i] = ev.status;
    tl.score[i] = ev.score;
    tl.value[i] = ev.value;
    tl.flags[i] = (ev.due ? F_DUE : 0) | (ev.hasValue ? F_HAS_VALUE : 0);
  }
  return tl;
}

function timelineSlice(tl: Timeline, start: DayKey, end: DayKey): [number, number] {
  if (tl.n === 0 || end < start) return [0, -1];
  const i0 = start <= tl.from ? 0 : dayDiff(tl.from, start);
  const lastKeyIndex = tl.n - 1;
  const i1 = Math.min(lastKeyIndex, dayDiff(tl.from, end));
  return [i0, i1];
}

function isNeutralDailyStatus(st: number, i: number, todayIndex: number): boolean {
  return st === S_SKIPPED || st === S_NOT_DUE || st === S_PENDING || st === S_FUTURE
    || (st === S_PARTIAL && i === todayIndex);
}

function emptyStreak(unit: StreakInfo['unit']): StreakInfo {
  return { current: 0, best: 0, unit };
}

function dailyStreak(tl: Timeline): StreakInfo {
  const { n, status, flags, todayIndex } = tl;
  let current = 0;
  let currentStartIdx = -1;
  for (let i = n - 1; i >= 0; i--) {
    const st = status[i];
    if (st === S_DONE) {
      if (flags[i] & F_DUE) {
        current++;
        currentStartIdx = i;
      }
      continue;
    }
    if (isNeutralDailyStatus(st, i, todayIndex)) continue;
    break;
  }

  let best = 0;
  let bestStartIdx = -1;
  let bestEndIdx = -1;
  let run = 0;
  let runStartIdx = -1;
  for (let i = 0; i < n; i++) {
    const st = status[i];
    if (st === S_DONE) {
      if (flags[i] & F_DUE) {
        if (run === 0) runStartIdx = i;
        run++;
        if (run >= best) {
          best = run;
          bestStartIdx = runStartIdx;
          bestEndIdx = i;
        }
      }
      continue;
    }
    if (isNeutralDailyStatus(st, i, todayIndex)) continue;
    run = 0;
  }

  const info: StreakInfo = { current, best, unit: 'day' };
  if (current > 0) info.currentStart = shiftDay(tl.from, currentStartIdx);
  if (best > 0) {
    info.bestStart = shiftDay(tl.from, bestStartIdx);
    info.bestEnd = shiftDay(tl.from, bestEndIdx);
  }
  return info;
}

function dayModeRate(p: Prep, tl: Timeline, i0: number, i1: number): RateResult {
  const { status, flags, todayIndex } = tl;
  let successes = 0;
  let opportunities = 0;
  for (let i = i0; i <= i1; i++) {
    const st = status[i];
    if (st === S_BEFORE || st === S_FUTURE || st === S_SKIPPED) continue;
    if (p.mode === 'daily') {
      if (!(flags[i] & F_DUE)) continue;
      // an atMost miss today is already final
      if (i === todayIndex && st !== S_DONE && st !== S_MISSED) continue;
      opportunities++;
      if (st === S_DONE) successes++;
    } else if (p.mode === 'metric') {
      if (i === todayIndex && st !== S_LOGGED) continue;
      opportunities++;
      if (st === S_LOGGED) successes++;
    } else {
      opportunities++;
      if (st === S_DONE) successes++;
    }
  }
  return { rate: opportunities > 0 ? successes / opportunities : 0, successes, opportunities };
}

// `into` gets the running value after each day
function dayModeStrength(p: Prep, tl: Timeline, into?: Float64Array): number {
  if (p.mode === 'metric' || p.mode === 'period') {
    if (into) into.fill(0);
    return 0;
  }
  const { n, status, flags, score, todayIndex } = tl;
  const keep = M_DAY;
  const gain = 1 - M_DAY;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const st = status[i];
    if (p.mode === 'quit') {
      if (st === S_DONE) s = s * keep + gain;
      else if (st === S_MISSED) s *= keep;
    } else if (
      (flags[i] & F_DUE) && st !== S_SKIPPED && st !== S_BEFORE && st !== S_FUTURE
      && (i !== todayIndex || st === S_DONE || st === S_MISSED)
    ) {
      s = s * keep + score[i] * gain;
    }
    if (into) into[i] = s;
  }
  return Math.min(1, Math.max(0, s));
}

function computePeriod(p: Prep, day: DayKey, ctx: EngineCtx): PeriodProgress {
  const period = p.period === 'month' ? 'month' : 'week';
  const { start, end, length: fullLength } = periodBounds(day, period, ctx.weekStartsOn);
  const habitStart = startOf(p);
  const from = start < habitStart ? habitStart : start;
  const today = ctx.today;

  let activeDays = 0;
  let achieved = 0;
  let hasEntry = false;
  const length = spanDays(from, end);
  if (length > 0) {
    const cursor = new DayCursor(from);
    for (let i = 0; i < length; i++) {
      if (i > 0) cursor.next();
      const entry = p.logs ? p.logs[cursor.key] : undefined;
      if (entry && entry.skipped) continue;
      activeDays++;
      if (entry && cursor.key <= today) {
        hasEntry = true;
        const v = finite(entry.value);
        if (v > 0) achieved += p.isCheck ? 1 : v;
      }
    }
  }

  const skipped = activeDays === 0;
  const raw = (p.target * activeDays) / fullLength;
  // a check target can't ask for more days than the period has
  const target = p.isCheck ? (skipped ? 0 : Math.min(activeDays, Math.max(1, Math.ceil(raw - EPS)))) : raw;
  let success = false;
  let progress = 0;
  if (!skipped) {
    if (p.atMost) {
      success = hasEntry && achieved <= target + EPS;
      progress = success ? 1 : 0;
    } else {
      success = achieved >= target - EPS;
      progress = target <= 0 ? 1 : Math.min(1, achieved / target);
    }
  }
  return { start, end, achieved, target, progress, success, current: start <= today && today <= end, skipped };
}

function periodList(p: Prep, from: DayKey, to: DayKey, ctx: EngineCtx): PeriodProgress[] {
  const habitStart = startOf(p);
  const lo = from < habitStart ? habitStart : from;
  const hi = to > ctx.today ? ctx.today : to;
  const out: PeriodProgress[] = [];
  if (hi < lo) return out;
  let anchor = lo;
  while (anchor <= hi) {
    const pp = computePeriod(p, anchor, ctx);
    out.push(pp);
    anchor = shiftDay(pp.end, 1);
  }
  return out;
}

function periodCountsForStreak(pp: PeriodProgress): 'success' | 'neutral' | 'break' {
  if (pp.success) return 'success';
  if (pp.skipped || pp.current) return 'neutral';
  return 'break';
}

function periodStreak(periods: PeriodProgress[], unit: 'week' | 'month'): StreakInfo {
  let current = 0;
  let currentStartIdx = -1;
  for (let i = periods.length - 1; i >= 0; i--) {
    const kind = periodCountsForStreak(periods[i]);
    if (kind === 'success') {
      current++;
      currentStartIdx = i;
    } else if (kind === 'break') break;
  }

  let best = 0;
  let bestStartIdx = -1;
  let bestEndIdx = -1;
  let run = 0;
  let runStartIdx = -1;
  for (let i = 0; i < periods.length; i++) {
    const kind = periodCountsForStreak(periods[i]);
    if (kind === 'success') {
      if (run === 0) runStartIdx = i;
      run++;
      if (run >= best) {
        best = run;
        bestStartIdx = runStartIdx;
        bestEndIdx = i;
      }
    } else if (kind === 'break') run = 0;
  }

  const info: StreakInfo = { current, best, unit };
  if (current > 0) info.currentStart = periods[currentStartIdx].start;
  if (best > 0) {
    info.bestStart = periods[bestStartIdx].start;
    info.bestEnd = periods[bestEndIdx].end;
  }
  return info;
}

// a period belongs to the window holding the day it resolves (its end, or today while it's running),
// so back-to-back windows never both count the week that straddles them
function periodRate(periods: PeriodProgress[], start: DayKey, end: DayKey, today: DayKey): RateResult {
  let successes = 0;
  let opportunities = 0;
  for (const pp of periods) {
    const resolvesOn = pp.current ? today : pp.end;
    if (resolvesOn < start || resolvesOn > end) continue;
    if (pp.skipped || (pp.current && !pp.success)) continue;
    opportunities++;
    if (pp.success) successes++;
  }
  return { rate: opportunities > 0 ? successes / opportunities : 0, successes, opportunities };
}

function periodMultiplier(p: Prep): number {
  return p.period === 'month' ? M_MONTH : M_WEEK;
}

function isPeriodEvaluated(pp: PeriodProgress): boolean {
  return !pp.skipped && (!pp.current || pp.success);
}

function periodStrength(p: Prep, periods: PeriodProgress[]): number {
  const m = periodMultiplier(p);
  let s = 0;
  for (const pp of periods) {
    if (isPeriodEvaluated(pp)) s = s * m + pp.progress * (1 - m);
  }
  return Math.min(1, Math.max(0, s));
}

interface QuitRuns {
  currentMs: number;
  lastResetMs: number;
  lastResetIso: string;
  lastRelapse: Relapse | undefined;
  relapseCount: number;
  completedMs: number;
  bestMs: number;
  bestStartMs: number;
  bestEndMs: number;
}

function quitRuns(q: QuitIndex, nowMs: number): QuitRuns {
  let lastResetMs = q.startMs;
  let lastResetIso = q.startIso;
  let lastRelapse: Relapse | undefined;
  let relapseCount = 0;
  let completedMs = 0;
  let bestMs = -1;
  let bestStartMs = q.startMs;
  let bestEndMs = q.startMs;
  for (let i = 0; i < q.times.length; i++) {
    const t = q.times[i];
    if (t < q.startMs) continue;
    if (t > nowMs) break;
    const gap = t - lastResetMs;
    if (gap >= bestMs) {
      bestMs = gap;
      bestStartMs = lastResetMs;
      bestEndMs = t;
    }
    completedMs += gap;
    relapseCount++;
    lastResetMs = t;
    lastResetIso = q.list[i].at;
    lastRelapse = q.list[i];
  }
  const currentMs = Math.max(0, nowMs - lastResetMs);
  if (currentMs >= bestMs) {
    bestMs = currentMs;
    bestStartMs = lastResetMs;
    bestEndMs = Math.max(nowMs, lastResetMs);
  }
  return { currentMs, lastResetMs, lastResetIso, lastRelapse, relapseCount, completedMs, bestMs, bestStartMs, bestEndMs };
}

function quitStreak(q: QuitIndex, ctx: EngineCtx): StreakInfo {
  const runs = quitRuns(q, ctx.now.getTime());
  const current = Math.floor(runs.currentMs / DAY_MS);
  const best = Math.floor(runs.bestMs / DAY_MS);
  const info: StreakInfo = { current, best, unit: 'day' };
  if (current > 0) info.currentStart = logicalDayOf(new Date(runs.lastResetMs), ctx.dayStartHour);
  if (best > 0) {
    info.bestStart = logicalDayOf(new Date(runs.bestStartMs), ctx.dayStartHour);
    info.bestEnd = logicalDayOf(new Date(runs.bestEndMs), ctx.dayStartHour);
  }
  return info;
}

export function activeHabits(data: AppData): Habit[] {
  return data.habits
    .filter((h) => !h.archived)
    .sort((a, b) => finite(a.order) - finite(b.order));
}

export function getEntry(data: AppData, habitId: string, day: DayKey): LogEntry | undefined {
  const logs = data.logs ? data.logs[habitId] : undefined;
  return logs ? logs[day] : undefined;
}

export function relapsesFor(data: AppData, habitId: string): Relapse[] {
  return sortedRelapses(data, habitId).list.slice();
}

/** Earliest of startDate, the first log and the quit start day. */
export function habitStartDay(habit: Habit, data: AppData, ctx: EngineCtx): DayKey {
  return startOf(prepare(habit, data, ctx));
}

/** Ignores the start date. Period and quit habits are scheduled every day. */
export function isScheduledOn(habit: Habit, day: DayKey): boolean {
  if (habit.type === 'quit' || (habit.kind !== 'metric' && effectivePeriod(habit) !== 'day')) return true;
  return (scheduleMask(habit.schedule) & (1 << weekdayOfKey(day))) !== 0;
}

export function dayCell(habit: Habit, data: AppData, day: DayKey, ctx: EngineCtx): DayCell {
  const p = prepare(habit, data, ctx);
  const ev = newDayEval();
  evalDay(p, day, weekdayOfKey(day), ctx.today, ev);
  return toCell(day, ev);
}

export function dayCells(habit: Habit, data: AppData, start: DayKey, end: DayKey, ctx: EngineCtx): DayCell[] {
  const n = spanDays(start, end);
  const out: DayCell[] = new Array(n);
  if (n === 0) return out;
  const p = prepare(habit, data, ctx);
  const ev = newDayEval();
  const cursor = new DayCursor(start);
  for (let i = 0; i < n; i++) {
    if (i > 0) cursor.next();
    evalDay(p, cursor.key, cursor.weekday, ctx.today, ev);
    out[i] = toCell(cursor.key, ev);
  }
  return out;
}

/** For daily habits the "period" is just that day. */
export function periodProgress(habit: Habit, data: AppData, day: DayKey, ctx: EngineCtx): PeriodProgress {
  const p = prepare(habit, data, ctx);
  if (p.mode === 'period') return computePeriod(p, day, ctx);
  const ev = newDayEval();
  evalDay(p, day, weekdayOfKey(day), ctx.today, ev);
  return dayAsPeriod(p, day, ev, ctx.today);
}

/** Clipped to the habit's start and today. */
export function periodsInRange(habit: Habit, data: AppData, start: DayKey, end: DayKey, ctx: EngineCtx): PeriodProgress[] {
  const p = prepare(habit, data, ctx);
  if (p.mode === 'period') return periodList(p, start, end, ctx);
  const from = historyStart(p);
  const lo = start < from ? from : start;
  const hi = end > ctx.today ? ctx.today : end;
  const n = spanDays(lo, hi);
  const out: PeriodProgress[] = new Array(n);
  if (n === 0) return out;
  const ev = newDayEval();
  const cursor = new DayCursor(lo);
  for (let i = 0; i < n; i++) {
    if (i > 0) cursor.next();
    evalDay(p, cursor.key, cursor.weekday, ctx.today, ev);
    out[i] = dayAsPeriod(p, cursor.key, ev, ctx.today);
  }
  return out;
}

export function streakInfo(habit: Habit, data: AppData, ctx: EngineCtx): StreakInfo {
  const p = prepare(habit, data, ctx);
  switch (p.mode) {
    case 'metric':
      return emptyStreak('day');
    case 'quit':
      return p.quit ? quitStreak(p.quit, ctx) : emptyStreak('day');
    case 'period': {
      const periods = periodList(p, startOf(p), ctx.today, ctx);
      return periodStreak(periods, p.period === 'month' ? 'month' : 'week');
    }
    default:
      return dailyStreak(buildTimeline(p, startOf(p), ctx.today, ctx.today));
  }
}

export interface RateResult {
  rate: number;
  successes: number;
  opportunities: number;
}

export function completionRate(habit: Habit, data: AppData, start: DayKey, end: DayKey, ctx: EngineCtx): RateResult {
  const p = prepare(habit, data, ctx);
  if (p.mode === 'period') return periodRate(periodList(p, start, end, ctx), start, end, ctx.today);
  const from = historyStart(p);
  const lo = start < from ? from : start;
  const hi = end > ctx.today ? ctx.today : end;
  const tl = buildTimeline(p, lo, hi, ctx.today);
  return dayModeRate(p, tl, 0, tl.n - 1);
}

// days that aren't evaluated carry the previous value forward
export function strengthSeries(habit: Habit, data: AppData, start: DayKey, end: DayKey, ctx: EngineCtx): Array<{ day: DayKey; value: number }> {
  const n = spanDays(start, end);
  const out: Array<{ day: DayKey; value: number }> = new Array(n);
  if (n === 0) return out;
  const p = prepare(habit, data, ctx);
  const today = ctx.today;
  const cursor = new DayCursor(start);

  if (p.mode === 'metric') {
    for (let i = 0; i < n; i++) {
      if (i > 0) cursor.next();
      out[i] = { day: cursor.key, value: 0 };
    }
    return out;
  }

  if (p.mode === 'period') {
    const periods = periodList(p, startOf(p), today, ctx);
    const m = periodMultiplier(p);
    let s = 0;
    let k = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) cursor.next();
      while (k < periods.length) {
        const pp = periods[k];
        const appliesOn = pp.current ? today : pp.end;
        if (appliesOn > cursor.key) break;
        if (isPeriodEvaluated(pp)) s = s * m + pp.progress * (1 - m);
        k++;
      }
      out[i] = { day: cursor.key, value: Math.min(1, Math.max(0, s)) };
    }
    return out;
  }

  const from = historyStart(p);
  const tl = buildTimeline(p, from, end < today ? end : today, today);
  const values = new Float64Array(tl.n);
  dayModeStrength(p, tl, values);
  const offset = dayDiff(from, start);
  const lastValue = tl.n > 0 ? values[tl.n - 1] : 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) cursor.next();
    const idx = offset + i;
    const raw = idx < 0 ? 0 : idx < tl.n ? values[idx] : lastValue;
    out[i] = { day: cursor.key, value: Math.min(1, Math.max(0, raw)) };
  }
  return out;
}

export function habitSummary(habit: Habit, data: AppData, ctx: EngineCtx): HabitSummary {
  const p = prepare(habit, data, ctx);
  const today = ctx.today;
  const from = historyStart(p);
  const tl = buildTimeline(p, from, today, today);
  const start30 = shiftDay(today, -29);
  const start7 = shiftDay(today, -6);

  let streak: StreakInfo;
  let all: RateResult;
  let r30: RateResult;
  let r7: RateResult;
  let totalSuccesses = 0;
  let strength = 0;

  if (p.mode === 'period') {
    const periods = periodList(p, from, today, ctx);
    streak = periodStreak(periods, p.period === 'month' ? 'month' : 'week');
    all = periodRate(periods, from, today, today);
    r30 = periodRate(periods, start30, today, today);
    r7 = periodRate(periods, start7, today, today);
    for (const pp of periods) if (pp.success) totalSuccesses++;
    strength = periodStrength(p, periods);
  } else {
    const [a0, a1] = timelineSlice(tl, from, today);
    const [b0, b1] = timelineSlice(tl, start30, today);
    const [c0, c1] = timelineSlice(tl, start7, today);
    all = dayModeRate(p, tl, a0, a1);
    r30 = dayModeRate(p, tl, b0, b1);
    r7 = dayModeRate(p, tl, c0, c1);
    if (p.mode === 'metric') {
      streak = emptyStreak('day');
    } else {
      streak = p.quit ? quitStreak(p.quit, ctx) : dailyStreak(tl);
      for (let i = 0; i < tl.n; i++) if (tl.status[i] === S_DONE) totalSuccesses++;
      strength = dayModeStrength(p, tl);
    }
  }

  let totalLoggedDays = 0;
  let valueSum = 0;
  for (let i = 0; i < tl.n; i++) {
    if (tl.flags[i] & F_HAS_VALUE) {
      totalLoggedDays++;
      valueSum += tl.value[i];
    }
  }
  let totalValue = 0;
  let averageValue = 0;
  if (habit.type === 'quantity' || habit.type === 'duration') {
    totalValue = valueSum;
    averageValue = totalLoggedDays > 0 ? valueSum / totalLoggedDays : 0;
  } else if (habit.type === 'rating') {
    averageValue = totalLoggedDays > 0 ? valueSum / totalLoggedDays : 0;
    totalValue = averageValue;
  }

  return {
    habitId: habit.id,
    streak,
    completionRate: all.rate,
    completionRate30: r30.rate,
    completionRate7: r7.rate,
    totalSuccesses,
    totalLoggedDays,
    totalValue,
    averageValue,
    strength,
  };
}

export interface QuitStats {
  currentMs: number;
  currentDays: number;
  bestMs: number;
  bestDays: number;
  runStartedAt: string;
  relapseCount: number;
  attempts: number;
  lastRelapse?: Relapse;
  relapsesByDay: Record<DayKey, Relapse[]>;
  milestone: { previous: number; next: number; progress: number };
  cleanRate: number;
  averageRunDays: number;
}

function milestoneFor(currentMs: number, target: number): QuitStats['milestone'] {
  const ladder = QUIT_MILESTONES.slice();
  const extra = Math.round(target);
  if (extra > 0 && !ladder.includes(extra)) {
    ladder.push(extra);
    ladder.sort((a, b) => a - b);
  }
  const exactDays = currentMs / DAY_MS;
  const days = Math.floor(exactDays);
  let previous = 0;
  let next = ladder[0];
  let found = false;
  for (const rung of ladder) {
    if (rung <= days) previous = rung;
    else {
      next = rung;
      found = true;
      break;
    }
  }
  if (!found) {
    // past the top rung, add a milestone every year
    previous = ladder[ladder.length - 1];
    next = previous + 365;
    while (next <= days) {
      previous = next;
      next += 365;
    }
  }
  const progress = Math.min(1, Math.max(0, (exactDays - previous) / (next - previous)));
  return { previous, next, progress };
}

export function quitStats(habit: Habit, data: AppData, ctx: EngineCtx): QuitStats {
  const p = prepare(habit, data, ctx);
  const q = p.quit ?? buildQuitIndex(habit, data, validStartDate(habit, ctx), ctx.dayStartHour);
  const runs = quitRuns(q, ctx.now.getTime());

  const relapsesByDay: Record<DayKey, Relapse[]> = {};
  for (let i = 0; i < q.list.length; i++) {
    const day = logicalDayOf(new Date(q.times[i]), ctx.dayStartHour);
    (relapsesByDay[day] ??= []).push(q.list[i]);
  }

  const trackedDays = spanDays(q.startDay, ctx.today);
  let relapseDaysSoFar = 0;
  for (const day of q.relapseDays) if (day <= ctx.today) relapseDaysSoFar++;
  const cleanRate = trackedDays > 0 ? Math.max(0, trackedDays - relapseDaysSoFar) / trackedDays : 0;

  const stats: QuitStats = {
    currentMs: runs.currentMs,
    currentDays: Math.floor(runs.currentMs / DAY_MS),
    bestMs: runs.bestMs,
    bestDays: Math.floor(runs.bestMs / DAY_MS),
    runStartedAt: runs.lastResetIso,
    relapseCount: runs.relapseCount,
    attempts: runs.relapseCount + 1,
    relapsesByDay,
    milestone: milestoneFor(runs.currentMs, finite(habit.target)),
    cleanRate,
    averageRunDays: (runs.completedMs + runs.currentMs) / (runs.relapseCount + 1) / DAY_MS,
  };
  if (runs.lastRelapse) stats.lastRelapse = runs.lastRelapse;
  return stats;
}

/** Per-day values for charts and correlations, null where there's nothing meaningful to plot. */
export function dailyValueSeries(habit: Habit, data: AppData, start: DayKey, end: DayKey, ctx: EngineCtx): Array<{ day: DayKey; value: number | null }> {
  const n = spanDays(start, end);
  const out: Array<{ day: DayKey; value: number | null }> = new Array(n);
  if (n === 0) return out;
  const p = prepare(habit, data, ctx);
  const today = ctx.today;
  const type = habit.type;
  const isGoal = habit.kind !== 'metric';
  const cursor = new DayCursor(start);
  for (let i = 0; i < n; i++) {
    if (i > 0) cursor.next();
    const day = cursor.key;
    let value: number | null = null;
    if (day <= today && !isBeforeStart(p, day)) {
      if (p.quit) {
        value = p.quit.relapseDays.has(day) ? 0 : 1;
      } else {
        const entry = p.logs ? p.logs[day] : undefined;
        if (!entry || !entry.skipped) {
          const v = entry ? finite(entry.value) : 0;
          if (type === 'check') {
            if (p.mode === 'period') {
              if (day < today || entry) value = v > 0 ? 1 : 0;
            } else if (entry || (p.mask & (1 << cursor.weekday)) !== 0) {
              value = v > 0 ? 1 : day < today ? 0 : null;
            }
          } else if (type === 'rating') {
            value = entry && v > 0 ? v : null;
          } else if (entry) {
            value = v;
          } else if (isGoal && day < today && (p.mode === 'period' || (!p.atMost && (p.mask & (1 << cursor.weekday)) !== 0))) {
            // a forgotten day of a daily limit is unknown, not a perfect zero
            value = 0;
          }
        }
      }
    }
    out[i] = { day, value };
  }
  return out;
}

export interface DayOverviewItem {
  habit: Habit;
  cell: DayCell;
  period: PeriodProgress;
  countsForDay: boolean; // counts toward the daily ring and perfect days
  completeForDay: boolean;
}

export interface DayOverview {
  day: DayKey;
  items: DayOverviewItem[];
  total: number;
  completed: number;
  progress: number;
  perfect: boolean;
}

/** Skips habits that start after `day`. Unscheduled daily habits stay in with countsForDay false. */
export function dayOverview(data: AppData, day: DayKey, ctx: EngineCtx): DayOverview {
  const items: DayOverviewItem[] = [];
  const weekday = weekdayOfKey(day);
  const ev = newDayEval();
  let total = 0;
  let completed = 0;
  for (const habit of activeHabits(data)) {
    const p = prepare(habit, data, ctx);
    if (startOf(p) > day) continue;
    evalDay(p, day, weekday, ctx.today, ev);
    const cell = toCell(day, ev);
    const period = p.mode === 'period' ? computePeriod(p, day, ctx) : dayAsPeriod(p, day, ev, ctx.today);
    const countsForDay = p.mode === 'daily' && ev.due && ev.status !== S_SKIPPED;
    let completeForDay: boolean;
    if (p.mode === 'period') completeForDay = period.success || ev.status === S_DONE;
    else if (p.mode === 'metric') completeForDay = ev.status === S_LOGGED;
    else completeForDay = ev.status === S_DONE;
    if (countsForDay) {
      total++;
      if (ev.status === S_DONE) completed++;
    }
    items.push({ habit, cell, period, countsForDay, completeForDay });
  }
  return {
    day,
    items,
    total,
    completed,
    progress: total > 0 ? completed / total : 0,
    perfect: total >= 1 && completed === total,
  };
}

// rate is null on days where nothing was due
export function overallCompletionSeries(data: AppData, start: DayKey, end: DayKey, ctx: EngineCtx): Array<{ day: DayKey; rate: number | null; completed: number; total: number }> {
  const n = spanDays(start, end);
  const out: Array<{ day: DayKey; rate: number | null; completed: number; total: number }> = new Array(n);
  if (n === 0) return out;
  const preps: Prep[] = [];
  for (const habit of activeHabits(data)) {
    const p = prepare(habit, data, ctx);
    if (p.mode === 'daily') preps.push(p);
  }
  const starts = preps.map(startOf);
  const cursor = new DayCursor(start);
  for (let i = 0; i < n; i++) {
    if (i > 0) cursor.next();
    const day = cursor.key;
    if (day > ctx.today) {
      out[i] = { day, rate: null, completed: 0, total: 0 };
      continue;
    }
    const bit = 1 << cursor.weekday;
    let total = 0;
    let done = 0;
    for (let j = 0; j < preps.length; j++) {
      const p = preps[j];
      if (day < starts[j] || !(p.mask & bit)) continue;
      const entry = p.logs ? p.logs[day] : undefined;
      if (entry && entry.skipped) continue;
      total++;
      const value = entry ? finite(entry.value) : 0;
      if (isScorable(p, entry, value) && dailySuccess(p, value)) done++;
    }
    out[i] = { day, rate: total > 0 ? done / total : null, completed: done, total };
  }
  return out;
}
