import type { AppData, DayKey, Habit, HabitSummary, LogEntry, Relapse } from '@/types';
import {
  activeHabits, completionRate, dailyValueSeries, dayCells, habitSummary, isScheduledOn, quitStats, streakInfo,
  type EngineCtx,
} from './habitMath';
import { addDays, diffDays, logicalDayOf, weekday, WEEKDAY_LONG, WEEKDAY_SHORT } from './dates';
import { formatHours, formatMinutes, formatNumber, formatPercent, formatValue, pluralize } from './format';

export type Strength = 'none' | 'weak' | 'moderate' | 'strong';
export type Confidence = 'low' | 'medium' | 'high';

export interface CorrelationResult {
  a: string; // driver
  b: string; // outcome
  lag: 0 | 1;
  r: number;
  n: number;
  p: number;
  strength: Strength;
  confidence: Confidence;
}

const DEFAULT_MIN_N = 10;
const MIN_GROUP = 5; // days needed on each side of a compareOutcome split
const INSIGHT_MIN_R = 0.2;
const DEFAULT_RANGE_DAYS = 180;
const TREND_WINDOW = 14;
const NEAR_CONSTANT_SHARE = 0.95; // share of days on the most common value
const MAX_CORRELATIONS_PER_HABIT = 3;
const FDR_Q = 0.1; // Benjamini-Hochberg, across every pair generateInsights tests
const TREND_HALF_WINDOW = 14;
const ADJUSTMENT_MIN_VALUES = 28; // too little data for the weekday/trend check below this
const ADJUSTED_MIN_R = 0.15;
// two drivers (or outcomes) this correlated make their insights say the same thing
const REDUNDANT_R = 0.6;
const REPEAT_DECAY = 0.8;
const KIND_REPEAT_DECAY = 0.92;
const CONFIDENCE_WEIGHT: Record<Confidence, number> = { high: 1, medium: 0.7, low: 0.4 };
const MINUS = '−';
const LOWER_IS_BETTER_RE =
  /\b(stress|stressed|anxiety|anxious|pain|craving|cravings|fatigue|tired|tiredness|headaches?|soreness|irritability|procrastination)\b/i;

const VARIANCE_EPS = 1e-12;
const WEEKDAY_MIN_N = 4; // days per weekday before it can be compared
const WEEKDAY_MIN_Z = 1.96; // about p < 0.05, two-sided

function pearsonCore(
  xs: ArrayLike<number>, xOffset: number, ys: ArrayLike<number>, yOffset: number, length: number,
): { r: number; n: number } | null {
  let n = 0;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < length; i++) {
    const x = xs[xOffset + i];
    const y = ys[yOffset + i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    n++;
    sumX += x;
    sumY += y;
  }
  if (n < 2) return null;
  const meanX = sumX / n;
  const meanY = sumY / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  let squaresX = 0;
  let squaresY = 0;
  for (let i = 0; i < length; i++) {
    const x = xs[xOffset + i];
    const y = ys[yOffset + i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const dx = x - meanX;
    const dy = y - meanY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
    squaresX += x * x;
    squaresY += y * y;
  }
  // zero variance, with a relative tolerance for float residue
  if (sxx <= VARIANCE_EPS * Math.max(1, squaresX) || syy <= VARIANCE_EPS * Math.max(1, squaresY)) return null;
  const r = sxy / Math.sqrt(sxx * syy);
  return { r: Math.max(-1, Math.min(1, r)), n };
}

/** Drops pairs with a non-finite member. Null when n < 2 or either side has no variance. */
export function pearson(xs: number[], ys: number[]): { r: number; n: number } | null {
  return pearsonCore(xs, 0, ys, 0, Math.min(xs.length, ys.length));
}

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

// Lanczos approximation, g = 7
function logGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - logGamma(1 - x);
  const z = x - 1;
  let sum = LANCZOS[0];
  for (let i = 1; i < LANCZOS.length; i++) sum += LANCZOS[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum);
}

// modified Lentz
function betaContinuedFraction(a: number, b: number, x: number): number {
  const TINY = 1e-300;
  const EPS = 1e-15;
  const MAX_ITERATIONS = 1000;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_ITERATIONS; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPS) break;
  }
  return h;
}

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const logFront = logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x);
  const front = Math.exp(logFront);
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(a, b, x)) / a;
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Two-tailed p-value for Pearson r over n pairs. */
export function pValueForR(r: number, n: number): number {
  if (!Number.isFinite(r) || !Number.isFinite(n)) return 1;
  const df = Math.floor(n) - 2;
  if (df < 1) return 1;
  const absR = Math.min(1, Math.abs(r));
  if (absR >= 1) return 0;
  if (absR === 0) return 1;
  // df / (df + t²) is just 1 - r². written as (1 - |r|)(1 + |r|) to keep precision near |r| = 1
  const x = (1 - absR) * (1 + absR);
  const p = regularizedIncompleteBeta(x, df / 2, 0.5);
  return Math.max(0, Math.min(1, p));
}

export function strengthOf(r: number): Strength {
  const abs = Math.abs(r);
  if (!Number.isFinite(abs) || abs < 0.1) return 'none';
  if (abs < 0.3) return 'weak';
  if (abs < 0.5) return 'moderate';
  return 'strong';
}

export function confidenceOf(n: number, p: number): Confidence {
  if (!(n >= 14) || !(p < 0.1)) return 'low';
  if (n >= 30 && p < 0.01) return 'high';
  return 'medium';
}

interface Series {
  habit: Habit;
  values: Float64Array; // one per day, NaN = unknown
  inferred: Uint8Array; // 1 where the value was filled in without an entry, like a 0 for an unlogged check
  firstWeekday: number;
  count: number; // known values
  nearConstant: boolean;
  median?: number | null; // lazy
  residuals?: Float64Array; // lazy, see seriesResiduals
}

interface Window {
  start: DayKey;
  end: DayKey;
}

// ends at yesterday at the latest. today is still in progress (half the water logged, a timer running)
function analysisWindow(ctx: EngineCtx, start: DayKey, end: DayKey): Window | null {
  const lastSettled = addDays(ctx.today, -1);
  const hi = end > lastSettled ? lastSettled : end;
  return hi < start ? null : { start, end: hi };
}

// series and weekday profiles are memoized per habit, keyed on the references of its inputs, so the
// Insights page walks each habit's days once. results are shared: don't mutate them.
interface HabitMemoEntry<T> {
  logs: Record<DayKey, LogEntry> | undefined;
  relapses: Relapse[] | undefined;
  today: DayKey;
  weekStartsOn: 0 | 1;
  dayStartHour: number;
  start: DayKey;
  end: DayKey;
  value: T;
}

type HabitMemo<T> = WeakMap<Habit, Array<HabitMemoEntry<T>>>;

const MEMO_RANGES_PER_HABIT = 4; // page range, detail page, pair modal...

function memoForHabit<T>(
  memo: HabitMemo<T>, habit: Habit, data: AppData, ctx: EngineCtx, start: DayKey, end: DayKey, compute: () => T,
): T {
  const logs = data.logs ? data.logs[habit.id] : undefined;
  const relapses = habit.type === 'quit' ? data.relapses : undefined;
  const { today, weekStartsOn, dayStartHour } = ctx;
  let entries = memo.get(habit);
  const hit = entries?.find((e) =>
    e.logs === logs && e.relapses === relapses && e.today === today && e.weekStartsOn === weekStartsOn
    && e.dayStartHour === dayStartHour && e.start === start && e.end === end);
  if (hit) return hit.value;
  const value = compute();
  if (!entries) {
    entries = [];
    memo.set(habit, entries);
  }
  entries.push({ logs, relapses, today, weekStartsOn, dayStartHour, start, end, value });
  if (entries.length > MEMO_RANGES_PER_HABIT) entries.shift();
  return value;
}

const seriesMemo: HabitMemo<Series> = new WeakMap();

function buildSeries(habit: Habit, data: AppData, ctx: EngineCtx, window: Window): Series {
  return memoForHabit(seriesMemo, habit, data, ctx, window.start, window.end, () => computeSeries(habit, data, ctx, window));
}

function computeSeries(habit: Habit, data: AppData, ctx: EngineCtx, window: Window): Series {
  const raw = dailyValueSeries(habit, data, window.start, window.end, ctx);
  const logs = data.logs ? data.logs[habit.id] : undefined;
  const values = new Float64Array(raw.length);
  const inferred = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i].value;
    values[i] = v === null || !Number.isFinite(v) ? Number.NaN : v;
    if (v !== null && !(logs && logs[raw[i].day])) inferred[i] = 1;
  }
  return seriesFrom(habit, values, inferred, weekday(window.start));
}

function seriesFrom(habit: Habit, values: Float64Array, inferred: Uint8Array, firstWeekday: number): Series {
  const frequency = new Map<number, number>();
  let count = 0;
  let modeCount = 0;
  for (const v of values) {
    if (Number.isNaN(v)) continue;
    count++;
    const f = (frequency.get(v) ?? 0) + 1;
    frequency.set(v, f);
    if (f > modeCount) modeCount = f;
  }
  return { habit, values, inferred, firstWeekday, count, nearConstant: count === 0 || modeCount / count >= NEAR_CONSTANT_SHARE };
}

// a day with nothing logged at all usually means the app wasn't opened, not that every habit was skipped.
// the zeros filled in on those days line every goal habit up together and fake links between them,
// so pairwise analysis treats them as unknown
interface BlankDaysEntry {
  logs: AppData['logs'];
  relapses: AppData['relapses'];
  dayNotes: AppData['dayNotes'];
  dayStartHour: number;
  start: DayKey;
  end: DayKey;
  mask: Uint8Array;
}

let blankDaysCache: BlankDaysEntry | null = null;

function blankDays(data: AppData, ctx: EngineCtx, window: Window): Uint8Array {
  const { logs, relapses, dayNotes } = data;
  const c = blankDaysCache;
  if (
    c && c.logs === logs && c.relapses === relapses && c.dayNotes === dayNotes
    && c.dayStartHour === ctx.dayStartHour && c.start === window.start && c.end === window.end
  ) {
    return c.mask;
  }
  const active = new Set<DayKey>();
  for (const habitId in logs) {
    for (const day in logs[habitId]) if (day >= window.start && day <= window.end) active.add(day);
  }
  for (const relapse of relapses ?? []) active.add(logicalDayOf(relapse.at, ctx.dayStartHour));
  for (const day in dayNotes) active.add(day);
  const mask = new Uint8Array(Math.max(0, diffDays(window.start, window.end) + 1));
  for (let i = 0, day = window.start; i < mask.length; i++, day = addDays(day, 1)) {
    if (!active.has(day)) mask[i] = 1;
  }
  blankDaysCache = { logs, relapses, dayNotes, dayStartHour: ctx.dayStartHour, start: window.start, end: window.end, mask };
  return mask;
}

const pairSeriesMemo = new WeakMap<Series, { blank: Uint8Array; value: Series }>();

// the series used for anything that pairs two habits
function pairSeries(habit: Habit, data: AppData, ctx: EngineCtx, window: Window): Series {
  const series = buildSeries(habit, data, ctx, window);
  const blank = blankDays(data, ctx, window);
  const hit = pairSeriesMemo.get(series);
  if (hit && hit.blank === blank) return hit.value;
  let values: Float64Array | null = null;
  for (let i = 0; i < series.values.length; i++) {
    if (blank[i] && series.inferred[i] && !Number.isNaN(series.values[i])) {
      values ??= series.values.slice();
      values[i] = Number.NaN;
    }
  }
  const value = values ? seriesFrom(habit, values, series.inferred, series.firstWeekday) : series;
  pairSeriesMemo.set(series, { blank, value });
  return value;
}

// removes weekday means and a ±14 day moving average, so weekly rhythms and slow drifts
// (a rough month, a new routine) can't pass for a daily link
function seriesResiduals(series: Series): Float64Array {
  if (series.residuals) return series.residuals;
  const { values } = series;
  const length = values.length;
  const sums = new Float64Array(7);
  const counts = new Float64Array(7);
  for (let i = 0, wd = series.firstWeekday; i < length; i++, wd = wd === 6 ? 0 : wd + 1) {
    const v = values[i];
    if (Number.isNaN(v)) continue;
    sums[wd] += v;
    counts[wd]++;
  }
  const out = new Float64Array(length);
  const prefixSum = new Float64Array(length + 1);
  const prefixCount = new Float64Array(length + 1);
  for (let i = 0, wd = series.firstWeekday; i < length; i++, wd = wd === 6 ? 0 : wd + 1) {
    const v = values[i];
    const known = !Number.isNaN(v);
    out[i] = known ? v - sums[wd] / counts[wd] : Number.NaN;
    prefixSum[i + 1] = prefixSum[i] + (known ? out[i] : 0);
    prefixCount[i + 1] = prefixCount[i] + (known ? 1 : 0);
  }
  for (let i = 0; i < length; i++) {
    if (Number.isNaN(out[i])) continue;
    const lo = Math.max(0, i - TREND_HALF_WINDOW);
    const hi = Math.min(length, i + TREND_HALF_WINDOW + 1);
    out[i] -= (prefixSum[hi] - prefixSum[lo]) / (prefixCount[hi] - prefixCount[lo]);
  }
  series.residuals = out;
  return out;
}

function seriesMedian(series: Series): number | null {
  if (series.median !== undefined) return series.median;
  const known: number[] = [];
  for (const v of series.values) if (!Number.isNaN(v)) known.push(v);
  if (known.length === 0) {
    series.median = null;
    return null;
  }
  known.sort((a, b) => a - b);
  const mid = known.length >> 1;
  series.median = known.length % 2 === 1 ? known[mid] : (known[mid - 1] + known[mid]) / 2;
  return series.median;
}

function minNOf(minN: number | undefined): number {
  return Math.max(3, Math.floor(Number.isFinite(minN) ? (minN as number) : DEFAULT_MIN_N));
}

function correlateSeries(x: Series, y: Series, lag: 0 | 1, minN: number): CorrelationResult | null {
  const length = x.values.length - lag;
  if (length <= 0) return null;
  const res = pearsonCore(x.values, 0, y.values, lag, length);
  if (!res || res.n < minN) return null;
  const p = pValueForR(res.r, res.n);
  return {
    a: x.habit.id,
    b: y.habit.id,
    lag,
    r: res.r,
    n: res.n,
    p,
    strength: strengthOf(res.r),
    confidence: confidenceOf(res.n, p),
  };
}

export function correlate(
  data: AppData, ctx: EngineCtx, driver: Habit, outcome: Habit,
  opts: { start: DayKey; end: DayKey; lag?: 0 | 1; minN?: number },
): CorrelationResult | null {
  const lag = opts.lag === 1 ? 1 : 0;
  if (lag === 0 && driver.id === outcome.id) return null;
  const window = analysisWindow(ctx, opts.start, opts.end);
  if (!window) return null;
  const x = pairSeries(driver, data, ctx, window);
  const y = driver.id === outcome.id ? x : pairSeries(outcome, data, ctx, window);
  return correlateSeries(x, y, lag, minNOf(opts.minN));
}

export interface PairPoint {
  // the driver's day. the outcome is `lag` days later
  day: DayKey;
  x: number;
  y: number;
}

/** The exact days correlate() pairs up, so a chart of them always shows the reported n. */
export function pairedPoints(
  data: AppData, ctx: EngineCtx, driver: Habit, outcome: Habit,
  opts: { start: DayKey; end: DayKey; lag?: 0 | 1 },
): PairPoint[] {
  const lag = opts.lag === 1 ? 1 : 0;
  const window = analysisWindow(ctx, opts.start, opts.end);
  if (!window) return [];
  const x = pairSeries(driver, data, ctx, window).values;
  const y = driver.id === outcome.id ? x : pairSeries(outcome, data, ctx, window).values;
  const out: PairPoint[] = [];
  let day = window.start;
  for (let i = 0; i + lag < x.length; i++, day = addDays(day, 1)) {
    if (Number.isNaN(x[i]) || Number.isNaN(y[i + lag])) continue;
    out.push({ day, x: x[i], y: y[i + lag] });
  }
  return out;
}

export interface CorrelationMatrix {
  habits: Habit[];
  matrix: Array<Array<CorrelationResult | null>>;
}

/** Defaults to the active habits. matrix[driver][outcome], symmetric at lag 0. */
export function correlationMatrix(
  data: AppData, ctx: EngineCtx,
  opts: { start: DayKey; end: DayKey; lag?: 0 | 1; minN?: number; habitIds?: string[] },
): CorrelationMatrix {
  const lag = opts.lag === 1 ? 1 : 0;
  let habits: Habit[];
  if (opts.habitIds) {
    const byId = new Map(data.habits.map((h) => [h.id, h] as const));
    const seen = new Set<string>();
    habits = [];
    for (const id of opts.habitIds) {
      const habit = byId.get(id);
      if (habit && !seen.has(id)) {
        seen.add(id);
        habits.push(habit);
      }
    }
  } else {
    habits = activeHabits(data);
  }
  const size = habits.length;
  const matrix: Array<Array<CorrelationResult | null>> = Array.from({ length: size }, () =>
    new Array<CorrelationResult | null>(size).fill(null),
  );
  const window = analysisWindow(ctx, opts.start, opts.end);
  if (!window || size === 0) return { habits, matrix };

  const minN = minNOf(opts.minN);
  const series = habits.map((h) => pairSeries(h, data, ctx, window));
  for (let i = 0; i < size; i++) {
    for (let j = lag === 0 ? i + 1 : 0; j < size; j++) {
      if (i === j) continue;
      const res = correlateSeries(series[i], series[j], lag, minN);
      matrix[i][j] = res;
      if (lag === 0 && res) matrix[j][i] = { ...res, a: res.b, b: res.a };
    }
  }
  return { habits, matrix };
}

export type SplitKind = 'done' | 'clean' | 'goalMet' | 'logged' | 'atLeast' | 'above';

export interface Comparison {
  withAvg: number; // outcome average on days the driver "happened"
  withoutAvg: number;
  withN: number;
  withoutN: number;
  delta: number;
  deltaPct: number; // relative to withoutAvg, 0 when that's 0
  splitLabel: string; // "done", "goal met", "≥ 7h"...
  split?: SplitKind;
  threshold?: number; // in the driver's units
  measure?: 'average' | 'rate'; // rate for check/quit outcomes, averages are then 0..1
}

interface SplitCandidate {
  kind: SplitKind;
  label: string;
  threshold?: number;
  happened: (value: number) => boolean;
}

function isBinary(habit: Habit): boolean {
  return habit.type === 'check' || habit.type === 'quit';
}

function isDailyEvaluated(habit: Habit): boolean {
  return habit.type === 'rating' || habit.kind === 'metric' || habit.period === 'day';
}

function isAtMostGoal(habit: Habit): boolean {
  return habit.kind !== 'metric' && habit.direction === 'atMost' && !isBinary(habit);
}

// in order of preference. the first one with enough days on both sides wins
function splitCandidates(series: Series): SplitCandidate[] {
  const habit = series.habit;
  if (habit.type === 'check') return [{ kind: 'done', label: 'done', happened: (v) => v > 0 }];
  if (habit.type === 'quit') return [{ kind: 'clean', label: 'clean day', happened: (v) => v > 0 }];

  const out: SplitCandidate[] = [];
  if (habit.kind !== 'metric') {
    if (isDailyEvaluated(habit)) {
      const target = Math.max(0, Number.isFinite(habit.target) ? habit.target : 0);
      out.push({
        kind: 'goalMet',
        label: 'goal met',
        threshold: target,
        happened: habit.direction === 'atMost' ? (v) => v <= target : (v) => v >= target,
      });
    } else {
      out.push({ kind: 'logged', label: 'logged', happened: (v) => v > 0 });
    }
  }
  const median = seriesMedian(series);
  if (median !== null) {
    if (median > 0) {
      out.push({ kind: 'atLeast', label: `≥ ${formatValue(habit, median)}`, threshold: median, happened: (v) => v >= median });
      out.push({ kind: 'above', label: `> ${formatValue(habit, median)}`, threshold: median, happened: (v) => v > median });
    } else if (!out.some((c) => c.kind === 'logged')) {
      out.push({ kind: 'logged', label: 'logged', happened: (v) => v > 0 });
    }
  }
  return out;
}

function compareWithSplit(x: Series, y: Series, lag: 0 | 1, split: SplitCandidate): Comparison | null {
  const length = x.values.length - lag;
  let withSum = 0;
  let withN = 0;
  let withoutSum = 0;
  let withoutN = 0;
  for (let i = 0; i < length; i++) {
    const xv = x.values[i];
    const yv = y.values[i + lag];
    if (Number.isNaN(xv) || Number.isNaN(yv)) continue;
    if (split.happened(xv)) {
      withSum += yv;
      withN++;
    } else {
      withoutSum += yv;
      withoutN++;
    }
  }
  if (withN < MIN_GROUP || withoutN < MIN_GROUP) return null;
  const withAvg = withSum / withN;
  const withoutAvg = withoutSum / withoutN;
  const delta = withAvg - withoutAvg;
  const comparison: Comparison = {
    withAvg,
    withoutAvg,
    withN,
    withoutN,
    delta,
    deltaPct: withoutAvg !== 0 ? delta / Math.abs(withoutAvg) : 0,
    splitLabel: split.label,
    split: split.kind,
    measure: isBinary(y.habit) ? 'rate' : 'average',
  };
  if (split.threshold !== undefined) comparison.threshold = split.threshold;
  return comparison;
}

function compareSeries(x: Series, y: Series, lag: 0 | 1): Comparison | null {
  if (x.values.length - lag <= 0) return null;
  for (const split of splitCandidates(x)) {
    const comparison = compareWithSplit(x, y, lag, split);
    if (comparison) return comparison;
  }
  return null;
}

/** Null unless both sides of the split have at least 5 days. */
export function compareOutcome(
  data: AppData, ctx: EngineCtx, driver: Habit, outcome: Habit,
  opts: { start: DayKey; end: DayKey; lag?: 0 | 1 },
): Comparison | null {
  const lag = opts.lag === 1 ? 1 : 0;
  if (lag === 0 && driver.id === outcome.id) return null;
  const window = analysisWindow(ctx, opts.start, opts.end);
  if (!window) return null;
  const x = pairSeries(driver, data, ctx, window);
  const y = driver.id === outcome.id ? x : pairSeries(outcome, data, ctx, window);
  return compareSeries(x, y, lag);
}

export type InsightKind = 'correlation' | 'lagged' | 'weekday' | 'trend' | 'streak' | 'consistency' | 'milestone';

export interface Insight {
  id: string;
  kind: InsightKind;
  title: string;
  detail: string;
  habitIds: string[];
  sentiment: 'positive' | 'negative' | 'neutral';
  confidence: Confidence;
  score: number;
  icon?: string;
  stats?: Array<{ label: string; value: string }>;
}

export function lowerIsBetter(habit: Habit): boolean {
  if (habit.type === 'quit' || habit.type === 'check') return false;
  if (habit.kind === 'metric') return habit.direction === 'atMost' || LOWER_IS_BETTER_RE.test(habit.name);
  return habit.direction === 'atMost';
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function signedPercent(ratio: number): string {
  const text = formatPercent(Math.abs(ratio));
  if (text === '0%') return '±0%';
  return `${ratio > 0 ? '+' : MINUS}${text}`;
}

function signedPoints(delta: number): string {
  const points = Math.round(Math.abs(delta) * 100);
  if (points === 0) return '±0 pts';
  return `${delta > 0 ? '+' : MINUS}${points} pts`;
}

function signedR(r: number): string {
  return `${r >= 0 ? '+' : MINUS}${Math.abs(r).toFixed(2)}`;
}

// "7.8", "1h 50m", "85%", "7.5 glasses"
function valueText(habit: Habit, value: number): string {
  const v = Number.isFinite(value) ? value : 0;
  switch (habit.type) {
    case 'check':
    case 'quit':
      return formatPercent(v);
    case 'duration':
      return formatMinutes(v);
    case 'rating':
      return Math.abs(v).toFixed(1);
    default: {
      const unit = (habit.unit ?? '').trim();
      return unit ? `${formatNumber(v, 1)} ${unit}` : formatNumber(v, 1);
    }
  }
}

// "7.5 vs 5.8 glasses", with the unit only once
function pairText(habit: Habit, a: number, b: number): string {
  if (habit.type === 'quantity') {
    const unit = (habit.unit ?? '').trim();
    return `${formatNumber(a, 1)} vs ${formatNumber(b, 1)}${unit ? ` ${unit}` : ''}`;
  }
  return `${valueText(habit, a)} vs ${valueText(habit, b)}`;
}

// "+28%" for averages, "+12 pts" for rates
function effectText(outcome: Habit, a: number, b: number): string {
  if (isBinary(outcome)) return signedPoints(a - b);
  if (b !== 0) return signedPercent((a - b) / Math.abs(b));
  const diff = a - b;
  return `${diff >= 0 ? '+' : MINUS}${valueText(outcome, Math.abs(diff))}`;
}

function driverClause(driver: Habit, comparison: Comparison, lag: 0 | 1): string {
  const name = driver.name;
  const prefix = lag === 1 ? 'After days' : 'On days';
  switch (comparison.split) {
    case 'done':
      return `${prefix} you check off ${name}`;
    case 'goalMet':
      return `${prefix} you hit your ${name} goal`;
    case 'logged':
      return `${prefix} you log ${name}`;
    default:
      return `${prefix} with ${name} ${comparison.splitLabel}`;
  }
}

// a is the highlighted side, b the baseline
function outcomeClause(outcome: Habit, lag: 0 | 1, a: number, b: number, also: boolean): string {
  const name = outcome.name;
  const nextDay = lag === 1 ? ' the next day' : '';
  if (outcome.type === 'check') {
    return `you${also && lag === 0 ? ' also' : ''} check off ${name}${nextDay} ${formatPercent(a)} of the time vs ${formatPercent(b)}`;
  }
  if (outcome.type === 'quit') {
    return `you stay clean on ${name}${nextDay} ${formatPercent(a)} of the time vs ${formatPercent(b)}`;
  }
  return `${lag === 1 ? 'next-day' : 'your'} ${name} averages ${pairText(outcome, a, b)}`;
}

function comparisonDetail(driver: Habit, outcome: Habit, comparison: Comparison, lag: 0 | 1): string {
  if (driver.type === 'quit') {
    // lead with the slip days, they're the interesting side
    const lead = lag === 1 ? `After a ${driver.name} slip` : `On days you slip on ${driver.name}`;
    const tail = outcomeClause(outcome, lag, comparison.withoutAvg, comparison.withAvg, false);
    const effect = effectText(outcome, comparison.withoutAvg, comparison.withAvg);
    return `${lead}, ${tail} ${lag === 1 ? 'after clean days' : 'on clean days'} (${effect}).`;
  }
  const lead = driverClause(driver, comparison, lag);
  const tail = outcomeClause(outcome, lag, comparison.withAvg, comparison.withoutAvg, driver.type === 'check');
  return `${lead}, ${tail} (${effectText(outcome, comparison.withAvg, comparison.withoutAvg)}).`;
}

function genericDetail(driver: Habit, outcome: Habit, r: number, n: number, lag: 0 | 1): string {
  // quit series are 1 on clean days, so a positive r means slips go with a lower outcome
  let lead: string;
  let more = r > 0;
  if (driver.type === 'check') {
    lead = `${lag === 1 ? 'After days' : 'On days'} you check off ${driver.name}`;
  } else if (driver.type === 'quit') {
    lead = lag === 1 ? `After a ${driver.name} slip` : `On days you slip on ${driver.name}`;
    more = !more;
  } else {
    lead = `When ${driver.name} is higher`;
  }
  const nextDay = lag === 1 ? ' the next day' : '';
  let tail: string;
  if (outcome.type === 'check') tail = `you're ${more ? 'more' : 'less'} likely to check off ${outcome.name}${nextDay}`;
  else if (outcome.type === 'quit') tail = `you're ${more ? 'more' : 'less'} likely to stay clean on ${outcome.name}${nextDay}`;
  else tail = `${lag === 1 ? 'next-day ' : ''}${outcome.name} tends to be ${more ? 'higher' : 'lower'}`;
  return `${lead}, ${tail} (r = ${signedR(r)} across ${pluralize(n, 'day')}).`;
}

function correlationTitle(driver: Habit, outcome: Habit, r: number, lag: 0 | 1): string {
  const up = r > 0;
  const d = driver.name;
  const o = outcome.name;
  if (driver.type === 'quit') {
    if (isBinary(outcome)) {
      if (lag === 1) return up ? `${d} slips throw off next-day ${o}` : `${o} happens more after ${d} slips`;
      return up ? `${d} slips throw off ${o}` : `${o} happens more on ${d} slip days`;
    }
    if (lag === 1) return up ? `${d} slips cost you next-day ${o}` : `${o} runs higher after ${d} slips`;
    return up ? `${o} dips on ${d} slip days` : `${o} runs higher on ${d} slip days`;
  }
  if (isBinary(outcome)) {
    if (lag === 1) return up ? `${d} sets up ${o} the next day` : `${d} gets in the way of ${o} the next day`;
    return up ? `${d} and ${o} tend to happen together` : `${d} and ${o} rarely happen together`;
  }
  if (driver.kind === 'metric' && outcome.kind === 'metric' && lag === 0) {
    return up ? `${d} and ${o} move together` : `${d} and ${o} move in opposite directions`;
  }
  if (driver.type === 'check') {
    if (lag === 1) return up ? `${d} lifts next-day ${o}` : `${o} dips the day after ${d}`;
    return up ? `${d} days lift your ${o}` : `${o} dips on ${d} days`;
  }
  if (driver.type === 'rating') {
    if (lag === 1) return up ? `${d} lifts next-day ${o}` : `${d} weighs on next-day ${o}`;
    return up ? `${d} lifts your ${o}` : `${d} weighs on your ${o}`;
  }
  const better = outcome.type === 'rating' && !lowerIsBetter(outcome) ? 'better' : 'higher';
  if (lag === 1) return up ? `More ${d}, ${better} ${o} the next day` : `More ${d}, lower ${o} the next day`;
  return up ? `More ${d}, ${better} ${o}` : `More ${d}, lower ${o}`;
}

function correlationSentiment(driver: Habit, outcome: Habit, r: number): Insight['sentiment'] {
  if (driver.kind === 'metric') return 'neutral';
  if (driver.type === 'quit') {
    // phrased around slips: a positive r means slips drag the outcome down
    const hurts = r > 0 !== lowerIsBetter(outcome);
    return hurts ? 'negative' : 'neutral';
  }
  const sign = Math.sign(r) * (lowerIsBetter(driver) ? -1 : 1) * (lowerIsBetter(outcome) ? -1 : 1);
  return sign > 0 ? 'positive' : 'negative';
}

// picks the driver of a same-day pair: the lower tier drives
function roleTier(habit: Habit): number {
  if (habit.kind === 'metric') return 2;
  return isBinary(habit) ? 0 : 1;
}

function effectSize(comparison: Comparison | null): number {
  if (!comparison) return -1;
  return comparison.measure === 'rate' ? Math.abs(comparison.delta) : Math.abs(comparison.deltaPct);
}

// an atMost goal-met split selects low values, so its sign is flipped
function comparisonAgrees(driver: Habit, comparison: Comparison, r: number): boolean {
  if (Math.abs(comparison.delta) < 1e-9) return false;
  const splitSign = comparison.split === 'goalMet' && isAtMostGoal(driver) ? -1 : 1;
  return Math.sign(comparison.delta) * splitSign === Math.sign(r);
}

function correlationScore(result: CorrelationResult, comparison: Comparison | null, driver: Habit, outcome: Habit): number {
  let score = 100 * Math.abs(result.r) * CONFIDENCE_WEIGHT[result.confidence];
  if (comparison) score += Math.min(20, effectSize(comparison) * 50);
  if (driver.kind !== 'metric' && (outcome.kind === 'metric' || outcome.type === 'rating')) score += 6;
  // slips are concrete events you control, so their cost is worth surfacing
  if (driver.type === 'quit') score += 8;
  if (Math.abs(result.r) > 0.95) score *= 0.35;
  if (isBinary(driver) && isBinary(outcome) && driver.categoryId === outcome.categoryId) score *= 0.7;
  if (driver.kind === 'metric' && outcome.kind === 'metric') score *= 0.8;
  if (result.lag === 1) score *= 0.92;
  return score;
}

interface CorrelationCandidate {
  insight: Insight;
  driver: Series;
  outcome: Series;
  lag: 0 | 1;
}

function correlationCandidate(first: Series, second: Series, result: CorrelationResult): CorrelationCandidate {
  const lag = result.lag;
  let driver = first;
  let outcome = second;
  let comparison: Comparison | null;
  if (lag === 1) {
    comparison = compareSeries(driver, outcome, 1);
  } else {
    const tierFirst = roleTier(first.habit);
    const tierSecond = roleTier(second.habit);
    if (tierFirst !== tierSecond) {
      if (tierFirst > tierSecond) {
        driver = second;
        outcome = first;
      }
      comparison = compareSeries(driver, outcome, 0);
    } else {
      const forward = compareSeries(first, second, 0);
      const backward = compareSeries(second, first, 0);
      if (effectSize(backward) > effectSize(forward)) {
        driver = second;
        outcome = first;
        comparison = backward;
      } else {
        comparison = forward;
      }
    }
  }
  const d = driver.habit;
  const o = outcome.habit;
  if (comparison && !comparisonAgrees(d, comparison, result.r)) comparison = null;

  const detail = comparison
    ? `${comparisonDetail(d, o, comparison, lag)} ${capitalize(describeR(result.r))} correlation across ${pluralize(result.n, 'day')}.`
    : genericDetail(d, o, result.r, result.n, lag);

  const stats: Array<{ label: string; value: string }> = [{ label: 'Correlation', value: `r ${signedR(result.r)}` }];
  if (comparison) {
    const effect = d.type === 'quit'
      ? effectText(o, comparison.withoutAvg, comparison.withAvg)
      : effectText(o, comparison.withAvg, comparison.withoutAvg);
    stats.push({ label: 'Difference', value: effect });
  }
  stats.push({ label: 'Days', value: formatNumber(result.n, 0) });
  stats.push({ label: 'Confidence', value: capitalize(result.confidence) });

  const ids = [d.id, o.id];
  const insight: Insight = {
    id: lag === 1 ? `lagged:${d.id}:${o.id}` : `correlation:${[...ids].sort().join(':')}`,
    kind: lag === 1 ? 'lagged' : 'correlation',
    title: correlationTitle(d, o, result.r, lag),
    detail,
    habitIds: ids,
    sentiment: correlationSentiment(d, o, result.r),
    confidence: result.confidence,
    score: correlationScore(result, comparison, d, o),
    icon: lag === 1 ? '🌅' : '🔗',
    stats,
  };
  return { insight, driver, outcome, lag };
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function isInsightworthy(result: CorrelationResult): boolean {
  return Math.abs(result.r) >= INSIGHT_MIN_R && result.confidence !== 'low';
}

// largest p-value Benjamini-Hochberg accepts at FDR_Q, -1 when none
function benjaminiHochbergCutoff(pValues: number[]): number {
  const sorted = [...pValues].sort((a, b) => a - b);
  const m = sorted.length;
  let cutoff = -1;
  for (let k = 0; k < m; k++) if (sorted[k] <= (FDR_Q * (k + 1)) / m) cutoff = sorted[k];
  return cutoff;
}

// the link has to hold (same sign, |r| >= 0.15) with weekday rhythms and slow trends removed
function survivesAdjustment(x: Series, y: Series, result: CorrelationResult): boolean {
  if (x.count < ADJUSTMENT_MIN_VALUES || y.count < ADJUSTMENT_MIN_VALUES) return true;
  const length = x.values.length - result.lag;
  const adjusted = pearsonCore(seriesResiduals(x), 0, seriesResiduals(y), result.lag, length);
  return adjusted !== null && Math.sign(adjusted.r) === Math.sign(result.r) && Math.abs(adjusted.r) >= ADJUSTED_MIN_R;
}

function correlationInsights(data: AppData, ctx: EngineCtx, habits: Habit[], focus: Habit | undefined, window: Window): Insight[] {
  const series = habits
    .map((h) => pairSeries(h, data, ctx, window))
    .filter((s) => s.count >= DEFAULT_MIN_N);
  const involvesFocus = (x: Series, y: Series) => !focus || x.habit.id === focus.id || y.habit.id === focus.id;

  // memoized, the redundancy check below needs these too
  const sameDay = new Map<string, CorrelationResult | null>();
  const sameDayResult = (x: Series, y: Series): CorrelationResult | null => {
    const key = pairKey(x.habit.id, y.habit.id);
    let result = sameDay.get(key);
    if (result === undefined) {
      result = correlateSeries(x, y, 0, DEFAULT_MIN_N);
      sameDay.set(key, result);
    }
    return result;
  };

  // same-day pairs are unordered, next-day pairs are ordered
  const tests: Array<{ x: Series; y: Series; result: CorrelationResult }> = [];
  for (let i = 0; i < series.length; i++) {
    for (let j = 0; j < series.length; j++) {
      const x = series[i];
      const y = series[j];
      if (i === j || !involvesFocus(x, y) || (x.nearConstant && y.nearConstant)) continue;
      if (j > i) {
        const result = sameDayResult(x, y);
        if (result) tests.push({ x, y, result });
      }
      const lagged = correlateSeries(x, y, 1, DEFAULT_MIN_N);
      if (lagged) tests.push({ x, y, result: lagged });
    }
  }

  const cutoff = benjaminiHochbergCutoff(tests.map((t) => t.result.p));
  const discoveries = tests.filter(({ x, y, result }) =>
    isInsightworthy(result) && result.p <= cutoff && survivesAdjustment(x, y, result));

  // a next-day link no stronger than the same-day one is just an echo of it
  const candidates: CorrelationCandidate[] = [];
  const nextDay = new Map<string, { x: Series; y: Series; result: CorrelationResult }>();
  for (const test of discoveries) {
    const { x, y, result } = test;
    if (result.lag === 0) {
      candidates.push(correlationCandidate(x, y, result));
      continue;
    }
    const same = sameDayResult(x, y);
    if (same && Math.abs(same.r) >= Math.abs(result.r)) continue;
    const key = pairKey(x.habit.id, y.habit.id);
    const previous = nextDay.get(key);
    if (!previous || Math.abs(result.r) > Math.abs(previous.result.r)) nextDay.set(key, test);
  }
  for (const { x, y, result } of nextDay.values()) candidates.push(correlationCandidate(x, y, result));

  // Sleep Hours → Energy and Good Sleep → Energy say the same thing when both drivers move together.
  // keep the stronger one
  candidates.sort((a, b) => b.insight.score - a.insight.score || (a.insight.id < b.insight.id ? -1 : 1));
  const kept: CorrelationCandidate[] = [];
  for (const candidate of candidates) {
    const redundant = kept.some((other) => {
      if (other.lag !== candidate.lag) return false;
      let a: Series | undefined;
      let b: Series | undefined;
      if (other.outcome === candidate.outcome && other.driver !== candidate.driver) {
        a = other.driver;
        b = candidate.driver;
      } else if (other.driver === candidate.driver && other.outcome !== candidate.outcome) {
        a = other.outcome;
        b = candidate.outcome;
      }
      if (!a || !b) return false;
      const link = sameDayResult(a, b);
      return link !== null && Math.abs(link.r) >= REDUNDANT_R;
    });
    if (!redundant) kept.push(candidate);
  }
  return kept.map((c) => c.insight);
}

// two-proportion z-test, so a single missed Tuesday can't become "Tuesdays are your weak spot"
function ratesDiffer(a: { value: number; n: number }, b: { value: number; n: number }): boolean {
  const pooled = (a.value * a.n + b.value * b.n) / (a.n + b.n);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.n + 1 / b.n));
  return se > 0 && Math.abs(a.value - b.value) / se >= WEEKDAY_MIN_Z;
}

function weekdayInsight(habit: Habit, data: AppData, ctx: EngineCtx, start: DayKey, end: DayKey): Insight | null {
  if (habit.type === 'quit') return null;
  const useRate = habit.kind !== 'metric';
  const profile = weekdayProfile(habit, data, ctx, start, end);
  const rows: Array<{ weekday: number; value: number; n: number }> = [];
  let total = 0;
  for (const stat of profile) {
    const value = useRate ? stat.rate : stat.average;
    if (value === null || stat.n < WEEKDAY_MIN_N) continue;
    rows.push({ weekday: stat.weekday, value, n: stat.n });
    total += stat.n;
  }
  if (rows.length < 2 || total < 21) return null;

  // sort by week position so ties always resolve the same way
  const weekPos = (wd: number) => (wd - ctx.weekStartsOn + 7) % 7;
  rows.sort((a, b) => weekPos(a.weekday) - weekPos(b.weekday));
  let best = rows[0];
  let worst = rows[0];
  for (const row of rows) {
    if (row.value > best.value) best = row;
    if (row.value < worst.value) worst = row;
  }
  const spread = best.value - worst.value;

  let normalized: number;
  if (useRate) {
    if (spread < 0.25 || !ratesDiffer(best, worst)) return null;
    normalized = spread;
  } else if (habit.type === 'rating') {
    const scale = Math.max(1, habit.ratingMax);
    if (spread < 0.08 * scale) return null;
    normalized = (spread / scale) * 2;
  } else {
    const mean = rows.reduce((sum, r) => sum + r.value * r.n, 0) / total;
    if (mean <= 0 || spread / mean < 0.2) return null;
    normalized = Math.min(1, spread / mean);
  }

  const bestDay = WEEKDAY_LONG[best.weekday];
  const worstDay = WEEKDAY_LONG[worst.weekday];
  let title: string;
  let detail: string;
  if (useRate) {
    const weekend = rows.filter((r) => r.weekday === 0 || r.weekday === 6);
    const weekdays = rows.filter((r) => r.weekday !== 0 && r.weekday !== 6);
    const avg = (list: typeof rows) => list.reduce((s, r) => s + r.value, 0) / list.length;
    const weekendSlump = weekend.length === 2 && weekdays.length >= 3 && (worst.weekday === 0 || worst.weekday === 6)
      && avg(weekdays) - avg(weekend) >= 0.15;
    // a weekly or monthly goal never asked for any particular day, so nothing "slips"
    const periodic = !isDailyEvaluated(habit);
    if (weekendSlump && !periodic) title = `${habit.name} drops off on weekends`;
    else if (best.value >= 0.5 || periodic) title = `Best day for ${habit.name}: ${bestDay}`;
    else title = `${habit.name} slips on ${worstDay}s`;
    const verb = habit.type === 'check' ? `check off ${habit.name}` : isDailyEvaluated(habit) ? `hit your ${habit.name} goal` : `log ${habit.name}`;
    detail = `You ${verb} on ${formatPercent(best.value)} of ${bestDay}s but only ${formatPercent(worst.value)} of ${worstDay}s.`;
  } else {
    title = `${habit.name} peaks on ${bestDay}s`;
    detail = `${habit.name} averages ${valueText(habit, best.value)} on ${bestDay}s vs ${valueText(habit, worst.value)} on ${worstDay}s.`;
  }

  const format = (v: number) => (useRate ? formatPercent(v) : valueText(habit, v));
  return {
    id: `weekday:${habit.id}`,
    kind: 'weekday',
    title,
    detail,
    habitIds: [habit.id],
    sentiment: 'neutral',
    confidence: total >= 56 ? 'high' : 'medium',
    score: 22 + Math.min(20, normalized * 40),
    icon: '📅',
    stats: [
      { label: 'Best', value: `${WEEKDAY_SHORT[best.weekday]} · ${format(best.value)}` },
      { label: 'Worst', value: `${WEEKDAY_SHORT[worst.weekday]} · ${format(worst.value)}` },
    ],
  };
}

function windowLabel(days: number): string {
  if (days % 7 === 0) {
    const weeks = days / 7;
    return weeks === 1 ? 'week' : `${weeks} weeks`;
  }
  return pluralize(days, 'day');
}

function trendInsight(habit: Habit, data: AppData, ctx: EngineCtx): Insight | null {
  // weekly goals move in whole weeks, so compare 4 weeks with the 4 before. monthly ones change too slowly
  const weekly = habit.type !== 'quit' && !isDailyEvaluated(habit);
  if (weekly && habit.period === 'month') return null;
  const windowDays = weekly ? TREND_WINDOW * 2 : TREND_WINDOW;
  const trend = habitTrend(habit, data, ctx, windowDays);
  if (!trend) return null;
  const change = trend.change;
  let magnitude: number;
  if (trend.measure === 'rate') {
    if (Math.abs(change) < 0.15) return null;
    magnitude = Math.abs(change);
  } else if (habit.type === 'rating') {
    const scale = Math.max(1, habit.ratingMax);
    if (Math.abs(change) < 0.08 * scale) return null;
    magnitude = (Math.abs(change) / scale) * 2;
  } else {
    if (trend.previous <= 0 || Math.abs(change) / trend.previous < 0.15) return null;
    magnitude = Math.min(1, Math.abs(change) / trend.previous);
  }

  const up = change > 0;
  const good = trend.measure === 'rate' ? up : up !== lowerIsBetter(habit);
  const span = windowLabel(windowDays);
  const direction = up ? 'up' : 'down';
  let title: string;
  let detail: string;
  let changeText: string;
  let format: (v: number) => string;
  if (trend.measure === 'rate') {
    format = (v) => formatPercent(v);
    changeText = signedPoints(change);
    title = up ? `${habit.name} is improving` : `${habit.name} has slipped lately`;
    const cur = formatPercent(trend.current);
    const prev = formatPercent(trend.previous);
    if (weekly) {
      detail = `You met your weekly ${habit.name} goal ${cur} of the time over the last ${span}, ${direction} from ${prev} the ${span} before.`;
    } else if (habit.type === 'check') {
      detail = `You checked off ${habit.name} ${cur} of the time over the last ${span}, ${direction} from ${prev} the ${span} before.`;
    } else if (habit.type === 'quit') {
      detail = `You stayed clean on ${habit.name} ${cur} of days over the last ${span}, ${direction} from ${prev} the ${span} before.`;
    } else {
      detail = `You hit your ${habit.name} goal ${cur} of the time over the last ${span}, ${direction} from ${prev} the ${span} before.`;
    }
  } else {
    format = (v) => valueText(habit, v);
    changeText = trend.previous !== 0 ? signedPercent(change / Math.abs(trend.previous)) : `${up ? '+' : MINUS}${valueText(habit, Math.abs(change))}`;
    title = up ? `${habit.name} is trending up` : `${habit.name} is trending down`;
    detail = `${habit.name} averaged ${valueText(habit, trend.current)} over the last ${span}, ${direction} from ${valueText(habit, trend.previous)} the ${span} before.`;
  }

  return {
    id: `trend:${habit.id}`,
    kind: 'trend',
    title,
    detail,
    habitIds: [habit.id],
    sentiment: good ? 'positive' : 'negative',
    confidence: 'medium',
    score: 28 + Math.min(27, magnitude * 100),
    icon: up ? '📈' : '📉',
    stats: [
      { label: `Last ${span}`, value: format(trend.current) },
      { label: 'Before', value: format(trend.previous) },
      { label: 'Change', value: changeText },
    ],
  };
}

type SummaryOf = () => HabitSummary;

// totals of something you're cutting down on aren't milestones
function hasValueMilestones(habit: Habit): boolean {
  return (habit.type === 'duration' || habit.type === 'quantity') && !lowerIsBetter(habit);
}

// keep in sync with milestoneInsights
function milestonesUseSummary(habit: Habit): boolean {
  return hasValueMilestones(habit) || (habit.type === 'check' && habit.kind !== 'metric');
}

function streakInsight(habit: Habit, data: AppData, ctx: EngineCtx, summaryOf: SummaryOf): Insight | null {
  if (habit.kind === 'metric') return null;
  // the summary's streak is streakInfo's, so reuse it instead of walking the history twice
  const streak = milestonesUseSummary(habit) ? summaryOf().streak : streakInfo(habit, data, ctx);
  const minBest = streak.unit === 'day' ? 7 : streak.unit === 'week' ? 4 : 3;
  if (streak.best < minBest || streak.current <= 0 || streak.current < 0.8 * streak.best) return null;

  const current = pluralize(streak.current, streak.unit);
  const best = pluralize(streak.best, streak.unit);
  const record = streak.current >= streak.best;
  const periodWord = streak.unit === 'day' ? 'today' : streak.unit === 'week' ? 'this week' : 'this month';
  let title: string;
  let detail: string;
  if (record) {
    if (habit.type === 'quit') {
      title = `Longest ${habit.name} run yet`;
      detail = `${current} clean, your longest run so far. Every day from here is a new record.`;
    } else {
      title = `Longest ${habit.name} streak yet`;
      detail = `${current} in a row, your longest so far. Log it ${periodWord} to keep it going.`;
    }
  } else {
    const left = streak.best - streak.current + 1;
    title = `Close to your ${habit.name} record`;
    detail = habit.type === 'quit'
      ? `You're ${current} clean. ${pluralize(left, streak.unit)} more beats your best run of ${best}.`
      : `Your streak is at ${current}. ${pluralize(left, streak.unit)} more beats your best of ${best}.`;
  }
  return {
    id: `streak:${habit.id}`,
    kind: 'streak',
    title,
    detail,
    habitIds: [habit.id],
    sentiment: 'positive',
    confidence: 'high',
    score: (record ? 45 : 38) + Math.min(15, streak.current / (streak.unit === 'day' ? 4 : 1)),
    icon: '🔥',
    stats: [
      { label: 'Current', value: current },
      { label: 'Best', value: best },
    ],
  };
}

function consistencyInsights(data: AppData, ctx: EngineCtx, habits: Habit[]): Insight[] {
  const start = addDays(ctx.today, -29);
  const rows = habits
    .filter((h) => h.kind !== 'metric' && h.type !== 'quit' && !h.archived)
    .map((habit) => ({ habit, rate: completionRate(habit, data, start, ctx.today, ctx) }))
    .filter(({ habit, rate }) => rate.opportunities >= (isDailyEvaluated(habit) ? 7 : 2));
  if (rows.length < 2) return [];
  rows.sort((a, b) => b.rate.rate - a.rate.rate || b.rate.opportunities - a.rate.opportunities || a.habit.order - b.habit.order);

  const out: Insight[] = [];
  const best = rows[0];
  const worst = rows[rows.length - 1];
  if (best.rate.rate >= 0.6) {
    const streak = streakInfo(best.habit, data, ctx);
    const streakText = streak.current >= 3 ? ` Current streak: ${pluralize(streak.current, streak.unit)}.` : '';
    out.push({
      id: `consistency:best:${best.habit.id}`,
      kind: 'consistency',
      title: `${best.habit.name} is your most consistent habit`,
      detail: `You hit it ${formatPercent(best.rate.rate)} of the time over the last 30 days.${streakText}`,
      habitIds: [best.habit.id],
      sentiment: 'positive',
      confidence: best.rate.opportunities >= 20 ? 'high' : 'medium',
      score: 30 + best.rate.rate * 6,
      icon: '🏆',
      stats: [
        { label: '30-day rate', value: formatPercent(best.rate.rate) },
        { label: 'Hits', value: `${best.rate.successes}/${best.rate.opportunities}` },
      ],
    });
  }
  if (worst.habit.id !== best.habit.id && worst.rate.rate <= 0.7 && best.rate.rate - worst.rate.rate >= 0.15) {
    const stack = worst.habit.type === 'check' && best.habit.type === 'check' && best.rate.rate >= 0.8
      ? ` Try doing it right after ${best.habit.name}, which you rarely miss.`
      : worst.habit.type === 'check'
        ? ' A set time of day or a visible reminder might help.'
        : isAtMostGoal(worst.habit)
          ? ' A slightly higher limit might be easier to stick to.'
          : ' A slightly smaller target might be easier to hit.';
    out.push({
      id: `consistency:worst:${worst.habit.id}`,
      kind: 'consistency',
      title: `${worst.habit.name} is your least consistent habit`,
      detail: `You hit it ${formatPercent(worst.rate.rate)} of the time over the last 30 days.${stack}`,
      habitIds: [worst.habit.id],
      sentiment: 'negative',
      confidence: worst.rate.opportunities >= 20 ? 'high' : 'medium',
      score: 28 + (1 - worst.rate.rate) * 8,
      icon: '🌱',
      stats: [
        { label: '30-day rate', value: formatPercent(worst.rate.rate) },
        { label: 'Hits', value: `${worst.rate.successes}/${worst.rate.opportunities}` },
      ],
    });
  }
  return out;
}

const HOUR_MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
const QUANTITY_MILESTONES = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
const DAY_MILESTONES = [25, 50, 100, 200, 365, 500, 750, 1000];

// largest milestone in (before, total]
function crossedMilestone(ladder: number[], before: number, total: number): number | null {
  let hit: number | null = null;
  for (const m of ladder) if (before < m && m <= total) hit = m;
  return hit;
}

function milestoneInsights(habit: Habit, data: AppData, ctx: EngineCtx, summaryOf: SummaryOf): Insight[] {
  const out: Insight[] = [];
  if (habit.type === 'quit') {
    const q = quitStats(habit, data, ctx);
    const days = q.currentDays;
    const { previous, next } = q.milestone;
    if (previous >= 7 && days >= previous && days - previous <= 2) {
      out.push({
        id: `milestone:${habit.id}:clean:${previous}`,
        kind: 'milestone',
        title: `${habit.name}: ${previous} days clean`,
        detail: `You just passed the ${previous}-day mark. Next milestone: ${next} days.`,
        habitIds: [habit.id],
        sentiment: 'positive',
        confidence: 'high',
        score: 44 + Math.min(10, previous / 10),
        icon: '🏅',
        stats: [{ label: 'Clean', value: pluralize(days, 'day') }],
      });
    } else if (next >= 7 && days >= 1 && next - days <= Math.max(2, Math.ceil(next * 0.1))) {
      const left = next - days;
      out.push({
        id: `milestone:${habit.id}:clean-next:${next}`,
        kind: 'milestone',
        title: `${pluralize(left, 'day')} until ${next} days clean`,
        detail: `You're ${pluralize(days, 'day')} into your ${habit.name} run. The ${next}-day mark is close.`,
        habitIds: [habit.id],
        sentiment: 'positive',
        confidence: 'high',
        score: 36 + Math.min(8, next / 15),
        icon: '🎯',
        stats: [
          { label: 'Clean', value: pluralize(days, 'day') },
          { label: 'Next', value: pluralize(next, 'day') },
        ],
      });
    }
    return out;
  }

  const recentStart = addDays(ctx.today, -6);
  const recent = dailyValueSeries(habit, data, recentStart, ctx.today, ctx);
  if (hasValueMilestones(habit)) {
    const summary = summaryOf();
    const total = summary.totalValue;
    let recentSum = 0;
    for (const { value } of recent) if (value !== null && value > 0) recentSum += value;
    if (habit.type === 'duration') {
      const hit = crossedMilestone(HOUR_MILESTONES, (total - recentSum) / 60, total / 60);
      if (hit !== null) {
        out.push({
          id: `milestone:${habit.id}:hours:${hit}`,
          kind: 'milestone',
          title: `${formatNumber(hit, 0)} hours of ${habit.name}`,
          detail: `You've logged ${formatHours(total)} of ${habit.name} in total, ${formatMinutes(recentSum)} of it in the last 7 days.`,
          habitIds: [habit.id],
          sentiment: 'positive',
          confidence: 'high',
          score: 34 + Math.min(10, Math.log10(hit) * 3),
          icon: '⏱️',
          stats: [{ label: 'Total', value: formatHours(total) }],
        });
      }
    } else {
      const hit = crossedMilestone(QUANTITY_MILESTONES, total - recentSum, total);
      const unit = (habit.unit ?? '').trim();
      if (hit !== null && unit) {
        out.push({
          id: `milestone:${habit.id}:total:${hit}`,
          kind: 'milestone',
          title: `${formatNumber(hit, 0)} ${unit} of ${habit.name}`,
          detail: `You've logged ${formatNumber(total, 0)} ${unit} of ${habit.name} since you started.`,
          habitIds: [habit.id],
          sentiment: 'positive',
          confidence: 'high',
          score: 32 + Math.min(10, Math.log10(hit) * 2),
          icon: '🎉',
          stats: [{ label: 'Total', value: `${formatNumber(total, 0)} ${unit}` }],
        });
      }
    }
  }

  if (habit.type === 'check' && habit.kind !== 'metric') {
    const summary = summaryOf();
    const total = summary.totalLoggedDays;
    let recentDone = 0;
    for (const { value } of recent) if (value !== null && value > 0) recentDone++;
    const hit = crossedMilestone(DAY_MILESTONES, total - recentDone, total);
    if (hit !== null) {
      out.push({
        id: `milestone:${habit.id}:days:${hit}`,
        kind: 'milestone',
        title: `${hit} days of ${habit.name}`,
        detail: `You've checked off ${habit.name} on ${pluralize(total, 'day')} so far.`,
        habitIds: [habit.id],
        sentiment: 'positive',
        confidence: 'high',
        score: 34 + Math.min(10, hit / 50),
        icon: '🎉',
        stats: [{ label: 'Days done', value: formatNumber(total, 0) }],
      });
    }
  }
  return out;
}

// greedy: each pick decays later insights about the same habit (and of the same kind), so one
// habit can't flood the list
function rankInsights(candidates: Insight[], focusId: string | undefined, limit: number | undefined): Insight[] {
  const max = limit === undefined || !Number.isFinite(limit) ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(limit));
  const pool: Insight[] = [];
  const ids = new Set<string>();
  for (const insight of candidates) {
    if (ids.has(insight.id)) continue;
    ids.add(insight.id);
    pool.push(insight);
  }
  pool.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const appearances = new Map<string, number>();
  const correlations = new Map<string, number>();
  const kinds = new Map<InsightKind, number>();
  const others = (insight: Insight) => insight.habitIds.filter((id) => id !== focusId);
  const out: Insight[] = [];
  const taken = new Array<boolean>(pool.length).fill(false);

  while (out.length < max) {
    let bestIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < pool.length; i++) {
      if (taken[i]) continue;
      const insight = pool[i];
      const habitIds = others(insight);
      const isCorrelation = insight.kind === 'correlation' || insight.kind === 'lagged';
      if (isCorrelation && habitIds.some((id) => (correlations.get(id) ?? 0) >= MAX_CORRELATIONS_PER_HABIT)) {
        taken[i] = true;
        continue;
      }
      let repeats = 0;
      for (const id of habitIds) repeats = Math.max(repeats, appearances.get(id) ?? 0);
      const adjusted = insight.score * Math.pow(REPEAT_DECAY, repeats) * Math.pow(KIND_REPEAT_DECAY, kinds.get(insight.kind) ?? 0);
      if (adjusted > bestScore) {
        bestScore = adjusted;
        bestIndex = i;
      }
    }
    if (bestIndex < 0) break;
    taken[bestIndex] = true;
    const pick = pool[bestIndex];
    kinds.set(pick.kind, (kinds.get(pick.kind) ?? 0) + 1);
    for (const id of others(pick)) {
      appearances.set(id, (appearances.get(id) ?? 0) + 1);
      if (pick.kind === 'correlation' || pick.kind === 'lagged') correlations.set(id, (correlations.get(id) ?? 0) + 1);
    }
    out.push({ ...pick, score: Math.round(bestScore * 100) / 100 });
  }
  return out;
}

/** Ranked, highest score first. With opts.habitId, only insights that involve that habit. */
export function generateInsights(
  data: AppData, ctx: EngineCtx,
  opts?: { start?: DayKey; end?: DayKey; habitId?: string; limit?: number },
): Insight[] {
  const end = opts?.end !== undefined && opts.end < ctx.today ? opts.end : ctx.today;
  const start = opts?.start ?? addDays(end, -(DEFAULT_RANGE_DAYS - 1));
  if (start > end) return [];

  const active = activeHabits(data);
  let focus: Habit | undefined;
  if (opts?.habitId !== undefined) {
    focus = data.habits.find((h) => h.id === opts.habitId);
    if (!focus) return [];
  }
  const focusHabit = focus;
  const habits = focusHabit && !active.some((h) => h.id === focusHabit.id) ? [...active, focusHabit] : active;

  const candidates: Insight[] = [];
  const window = analysisWindow(ctx, start, end);
  if (window) candidates.push(...correlationInsights(data, ctx, habits, focusHabit, window));

  for (const habit of focusHabit ? [focusHabit] : habits) {
    const weekdayResult = weekdayInsight(habit, data, ctx, start, end);
    if (weekdayResult) candidates.push(weekdayResult);
    const trendResult = trendInsight(habit, data, ctx);
    if (trendResult) candidates.push(trendResult);
    let summary: HabitSummary | undefined;
    const summaryOf: SummaryOf = () => (summary ??= habitSummary(habit, data, ctx));
    const streakResult = streakInsight(habit, data, ctx, summaryOf);
    if (streakResult) candidates.push(streakResult);
    candidates.push(...milestoneInsights(habit, data, ctx, summaryOf));
  }
  for (const insight of consistencyInsights(data, ctx, habits)) {
    if (!focusHabit || insight.habitIds.includes(focusHabit.id)) candidates.push(insight);
  }

  return rankInsights(candidates, focusHabit?.id, opts?.limit);
}

export interface WeekdayStat {
  weekday: number;
  rate: number | null; // goal habits only
  average: number | null;
  n: number; // the rate's denominator for goals, the number of values for metrics
}

const profileMemo: HabitMemo<WeekdayStat[]> = new WeakMap();

/** Indexed by weekday, 0 = Sunday. Memoized and shared, so don't mutate the result. */
export function weekdayProfile(habit: Habit, data: AppData, ctx: EngineCtx, start: DayKey, end: DayKey): WeekdayStat[] {
  return memoForHabit(profileMemo, habit, data, ctx, start, end, () => computeWeekdayProfile(habit, data, ctx, start, end));
}

function computeWeekdayProfile(habit: Habit, data: AppData, ctx: EngineCtx, start: DayKey, end: DayKey): WeekdayStat[] {
  const successes = [0, 0, 0, 0, 0, 0, 0];
  const opportunities = [0, 0, 0, 0, 0, 0, 0];
  const sums = [0, 0, 0, 0, 0, 0, 0];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  const isMetric = habit.kind === 'metric' && habit.type !== 'quit';
  const growing = habit.type === 'quantity' || habit.type === 'duration';
  const hi = end > ctx.today ? ctx.today : end;

  if (start <= hi) {
    const values = dailyValueSeries(habit, data, start, hi, ctx);
    const cells = isMetric ? null : dayCells(habit, data, start, hi, ctx);
    const daily = habit.type !== 'quit' && isDailyEvaluated(habit);
    // isScheduledOn only depends on the weekday, so resolve it once per weekday
    const scheduled: Array<boolean | undefined> = new Array(7);
    let wd = weekday(start);
    for (let i = 0; i < values.length; i++, wd = wd === 6 ? 0 : wd + 1) {
      const day = values[i].day;
      const inProgress = day === ctx.today;
      if (cells) {
        const status = cells[i].status;
        if (status === 'done') {
          // bonus days don't count, same as completion rates
          if (!daily || (scheduled[wd] ??= isScheduledOn(habit, day))) {
            successes[wd]++;
            opportunities[wd]++;
          }
        } else if (status === 'missed') {
          opportunities[wd]++;
        } else if ((status === 'partial' || status === 'empty') && !inProgress) {
          opportunities[wd]++;
        }
      }
      const value = values[i].value;
      if (value !== null && Number.isFinite(value) && !(inProgress && growing)) {
        sums[wd] += value;
        counts[wd]++;
      }
    }
  }

  return successes.map((_, wd) => ({
    weekday: wd,
    rate: !isMetric && opportunities[wd] > 0 ? successes[wd] / opportunities[wd] : null,
    average: counts[wd] > 0 ? sums[wd] / counts[wd] : null,
    n: isMetric ? counts[wd] : opportunities[wd],
  }));
}

export interface TrendResult {
  current: number;
  previous: number;
  change: number;
  measure: 'rate' | 'average';
}

export function habitTrend(habit: Habit, data: AppData, ctx: EngineCtx, windowDays = 14): TrendResult | null {
  const w = Math.max(1, Math.floor(Number.isFinite(windowDays) ? windowDays : 14));
  const currentStart = addDays(ctx.today, -(w - 1));
  const previousEnd = addDays(currentStart, -1);
  const previousStart = addDays(currentStart, -w);
  const minCount = Math.max(3, Math.ceil(w / 3));

  if (habit.kind !== 'metric' && habit.type !== 'rating') {
    const current = completionRate(habit, data, currentStart, ctx.today, ctx);
    const previous = completionRate(habit, data, previousStart, previousEnd, ctx);
    const minOpportunities = habit.type !== 'quit' && !isDailyEvaluated(habit) ? 1 : minCount;
    if (current.opportunities < minOpportunities || previous.opportunities < minOpportunities) return null;
    return { current: current.rate, previous: previous.rate, change: current.rate - previous.rate, measure: 'rate' };
  }

  const growing = habit.type === 'quantity' || habit.type === 'duration';
  const series = dailyValueSeries(habit, data, previousStart, ctx.today, ctx);
  let previousSum = 0;
  let previousN = 0;
  let currentSum = 0;
  let currentN = 0;
  for (let i = 0; i < series.length; i++) {
    const { day, value } = series[i];
    if (value === null || !Number.isFinite(value)) continue;
    if (i < w) {
      previousSum += value;
      previousN++;
    } else if (!(growing && day === ctx.today)) {
      currentSum += value;
      currentN++;
    }
  }
  if (previousN < minCount || currentN < minCount) return null;
  const current = currentSum / currentN;
  const previous = previousSum / previousN;
  return { current, previous, change: current - previous, measure: 'average' };
}

/** "strong positive", "weak negative"... or "no correlation" below |r| = 0.1 */
export function describeR(r: number): string {
  const strength = strengthOf(r);
  if (strength === 'none') return 'no correlation';
  return `${strength} ${r > 0 ? 'positive' : 'negative'}`;
}
