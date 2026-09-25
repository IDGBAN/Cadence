import type { AppData, DayKey, Habit } from '@/types';
import type { EngineCtx } from '@/lib/habitMath';
import { activeHabits } from '@/lib/habitMath';
import { addDays, diffDays, logicalDayOf } from '@/lib/dates';
import { formatMinutes, formatNumber, formatPercent, formatValue } from '@/lib/format';
import { pairedPoints, type Comparison, type Confidence, type PairPoint, type Strength } from '@/lib/insights';

export type { PairPoint };

export type RangeKey = '30d' | '90d' | '1y' | 'all';

export const INSIGHT_RANGES: Array<{ value: RangeKey; label: string; title: string; days: number | null }> = [
  { value: '30d', label: '30D', title: 'Last 30 days', days: 30 },
  { value: '90d', label: '90D', title: 'Last 90 days', days: 90 },
  { value: '1y', label: '1Y', title: 'Last 12 months', days: 365 },
  { value: 'all', label: 'All', title: 'All time', days: null },
];

export interface ResolvedRange {
  key: RangeKey;
  start: DayKey;
  end: DayKey;
  days: number;
  previous: { start: DayKey; end: DayKey } | null;
  label: string;
}

// archived habits are left out everywhere else on the page, so they don't stretch "All" either
export function earliestDay(data: AppData, ctx: EngineCtx): DayKey {
  let earliest: DayKey | null = null;
  for (const habit of activeHabits(data)) {
    if (habit.startDate && (earliest === null || habit.startDate < earliest)) earliest = habit.startDate;
    if (habit.type === 'quit' && Number.isFinite(Date.parse(habit.quitStart))) {
      const quitDay = logicalDayOf(habit.quitStart, ctx.dayStartHour);
      if (earliest === null || quitDay < earliest) earliest = quitDay;
    }
    const logs = data.logs[habit.id];
    if (!logs) continue;
    for (const day in logs) if (earliest === null || day < earliest) earliest = day;
  }
  if (earliest === null || earliest > ctx.today) return ctx.today;
  return earliest;
}

export function resolveRange(key: RangeKey, data: AppData, ctx: EngineCtx): ResolvedRange {
  const option = INSIGHT_RANGES.find((r) => r.value === key) ?? INSIGHT_RANGES[1];
  const end = ctx.today;
  const oldest = earliestDay(data, ctx);
  const start = option.days === null ? oldest : addDays(end, -(option.days - 1));
  const days = Math.max(1, diffDays(start, end) + 1);
  const previousEnd = addDays(start, -1);
  const previousStart = addDays(previousEnd, -(days - 1));
  return {
    key: option.value,
    start,
    end,
    days,
    previous: previousEnd >= oldest ? { start: previousStart, end: previousEnd } : null,
    label: option.title,
  };
}

// today is still in progress, so correlations stop at yesterday (same as lib/insights)
export function analysisEnd(ctx: EngineCtx, end: DayKey): DayKey {
  const lastSettled = addDays(ctx.today, -1);
  return end > lastSettled ? lastSettled : end;
}

export type Lag = 0 | 1;

export function pairedValues(
  data: AppData, ctx: EngineCtx, driver: Habit, outcome: Habit,
  opts: { start: DayKey; end: DayKey; lag?: Lag },
): PairPoint[] {
  return pairedPoints(data, ctx, driver, outcome, opts);
}

export interface Fit {
  slope: number;
  intercept: number;
}

export function linearFit(points: ReadonlyArray<PairPoint>): Fit | null {
  const n = points.length;
  if (n < 2) return null;
  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    const dx = p.x - meanX;
    sxx += dx * dx;
    sxy += dx * (p.y - meanY);
  }
  if (sxx <= 1e-12) return null;
  const slope = sxy / sxx;
  return { slope, intercept: meanY - slope * meanX };
}

export interface BucketPoint {
  x: number;
  y: number;
  count: number;
  days: DayKey[];
}

export function bucketPoints(points: ReadonlyArray<PairPoint>): BucketPoint[] {
  const map = new Map<string, BucketPoint>();
  for (const p of points) {
    const key = `${p.x}|${p.y}`;
    const hit = map.get(key);
    if (hit) {
      hit.count++;
      if (p.day > hit.days[0]) hit.days.unshift(p.day);
      else if (hit.days.length < 3) hit.days.push(p.day);
      if (hit.days.length > 3) hit.days.length = 3;
    } else {
      map.set(key, { x: p.x, y: p.y, count: 1, days: [p.day] });
    }
  }
  return [...map.values()];
}

export interface Extent {
  min: number;
  max: number;
}

export function extentOf(values: ReadonlyArray<number>): Extent | null {
  if (values.length === 0) return null;
  let min = values[0];
  let max = values[0];
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

export function axisDomain(habit: Habit, values: ReadonlyArray<number>): [number, number] {
  if (habit.type === 'check' || habit.type === 'quit') return [-0.25, 1.25];
  const extent = extentOf(values);
  if (!extent) return [0, 1];
  if (habit.type === 'rating') return [Math.max(0, Math.floor(extent.min) - 0.5), Math.min(habit.ratingMax, Math.ceil(extent.max) + 0.5)];
  const span = extent.max - extent.min;
  const pad = span === 0 ? Math.max(1, Math.abs(extent.max) * 0.1) : span * 0.08;
  return [Math.max(0, extent.min - pad), extent.max + pad];
}

export function axisValueLabel(habit: Habit, value: number): string {
  switch (habit.type) {
    case 'check':
      return value >= 0.5 ? 'Done' : 'Missed';
    case 'quit':
      return value >= 0.5 ? 'Clean' : 'Slip';
    case 'duration':
      return formatMinutes(value);
    case 'rating':
      return formatNumber(value, 1);
    default: {
      const unit = (habit.unit ?? '').trim();
      return unit ? `${formatNumber(value, 1)} ${unit}` : formatNumber(value, 1);
    }
  }
}

export function axisTickLabel(habit: Habit, value: number): string {
  if (habit.type === 'check') return value >= 0.5 ? 'Done' : 'Missed';
  if (habit.type === 'quit') return value >= 0.5 ? 'Clean' : 'Slip';
  if (habit.type === 'duration') return formatMinutes(value);
  return formatNumber(value, 1);
}

export function axisTitle(habit: Habit): string {
  switch (habit.type) {
    case 'check':
      return `${habit.name} (done / missed)`;
    case 'quit':
      return `${habit.name} (clean / slip)`;
    case 'duration':
      return `${habit.name} (time)`;
    case 'rating':
      return `${habit.name} (1-${formatNumber(habit.ratingMax, 0)})`;
    default: {
      const unit = (habit.unit ?? '').trim();
      return unit ? `${habit.name} (${unit})` : habit.name;
    }
  }
}

export function isBinaryHabit(habit: Habit): boolean {
  return habit.type === 'check' || habit.type === 'quit';
}

export function averageLabel(habit: Habit, value: number): string {
  if (habit.type === 'check' || habit.type === 'quit') return formatPercent(value);
  if (habit.type === 'rating') return `${formatNumber(value, 1)}/${formatNumber(habit.ratingMax, 0)}`;
  return formatValue(habit, value);
}

const MINUS = '−';

/** "+18 pts" for rates, "+24%" for averages. */
export function effectLabel(outcome: Habit, comparison: Comparison): string {
  const { withAvg, withoutAvg } = comparison;
  const delta = withAvg - withoutAvg;
  if (comparison.measure === 'rate' || isBinaryHabit(outcome)) {
    const points = Math.round(Math.abs(delta) * 100);
    if (points === 0) return '±0 pts';
    return `${delta > 0 ? '+' : MINUS}${points} pts`;
  }
  if (withoutAvg !== 0) {
    const pct = formatPercent(Math.abs(delta / withoutAvg));
    if (pct === '0%') return '±0%';
    return `${delta > 0 ? '+' : MINUS}${pct}`;
  }
  return `${delta >= 0 ? '+' : MINUS}${averageLabel(outcome, Math.abs(delta))}`;
}

export function splitSideLabels(driver: Habit, comparison: Comparison): { on: string; off: string } {
  switch (comparison.split) {
    case 'done':
      return { on: 'Done', off: 'Missed' };
    case 'clean':
      return { on: 'Clean day', off: 'Slip day' };
    case 'goalMet':
      return { on: 'Goal met', off: 'Goal missed' };
    case 'logged':
      return { on: 'Logged', off: 'Not logged' };
    default:
      return { on: comparison.splitLabel, off: `below ${formatValue(driver, comparison.threshold ?? 0)}` };
  }
}

export function driverPhrase(driver: Habit, comparison: Comparison, lag: Lag): string {
  const prefix = lag === 1 ? 'After days' : 'On days';
  switch (comparison.split) {
    case 'done':
      return `${prefix} you check off ${driver.name}`;
    case 'clean':
      return lag === 1 ? `After a clean ${driver.name} day` : `On clean ${driver.name} days`;
    case 'goalMet':
      return `${prefix} you hit your ${driver.name} goal`;
    case 'logged':
      return `${prefix} you log ${driver.name}`;
    default:
      return `${prefix} with ${driver.name} ${comparison.splitLabel}`;
  }
}

export function describeComparison(driver: Habit, outcome: Habit, comparison: Comparison, lag: Lag): string {
  const lead = driverPhrase(driver, comparison, lag);
  const nextDay = lag === 1 ? ' the next day' : '';
  const a = averageLabel(outcome, comparison.withAvg);
  const b = averageLabel(outcome, comparison.withoutAvg);
  let tail: string;
  if (outcome.type === 'check') tail = `you check off ${outcome.name}${nextDay} ${a} of the time, vs ${b} otherwise`;
  else if (outcome.type === 'quit') tail = `you stay clean on ${outcome.name}${nextDay} ${a} of the time, vs ${b} otherwise`;
  else tail = `${lag === 1 ? 'next-day ' : 'your '}${outcome.name} averages ${a}, vs ${b} otherwise`;
  return `${lead}, ${tail} (${effectLabel(outcome, comparison)}).`;
}

export function describeCorrelationOnly(driver: Habit, outcome: Habit, r: number, n: number, lag: Lag): string {
  const more = r > 0;
  const lead = isBinaryHabit(driver)
    ? `${lag === 1 ? 'After days' : 'On days'} you ${driver.type === 'quit' ? `stay clean on ${driver.name}` : `check off ${driver.name}`}`
    : `When ${driver.name} is higher`;
  const nextDay = lag === 1 ? ' the next day' : '';
  const tail = isBinaryHabit(outcome)
    ? `${outcome.name} is ${more ? 'more' : 'less'} likely${nextDay}`
    : `${lag === 1 ? 'next-day ' : ''}${outcome.name} tends to be ${more ? 'higher' : 'lower'}`;
  return `${lead}, ${tail} (r ${signedR(r)} across ${formatNumber(n, 0)} paired days).`;
}

export function signedR(r: number): string {
  return `${r >= 0 ? '+' : MINUS}${Math.abs(r).toFixed(2)}`;
}

export function formatP(p: number): string {
  if (!Number.isFinite(p)) return 'p = n/a';
  if (p < 0.001) return 'p < 0.001';
  if (p < 0.01) return `p = ${p.toFixed(3)}`;
  return `p = ${p.toFixed(2)}`;
}

export const CONFIDENCE_TONE: Record<Confidence, 'success' | 'warning' | 'neutral'> = {
  high: 'success',
  medium: 'warning',
  low: 'neutral',
};

export const CONFIDENCE_HINT: Record<Confidence, string> = {
  high: 'Plenty of days, and very unlikely to be chance',
  medium: 'Worth watching, but not conclusive',
  low: 'Too few days to tell. Treat it as a hunch',
};

export function strengthLabel(strength: Strength): string {
  return strength === 'none' ? 'No link' : `${strength[0].toUpperCase()}${strength.slice(1)}`;
}

export function correlationFill(r: number, boost = 1): string {
  const magnitude = Math.min(1, Math.abs(r)) * boost;
  const token = r >= 0 ? 'var(--success)' : 'var(--danger)';
  const pct = Math.round(8 + magnitude * 66);
  return `color-mix(in oklab, ${token} ${pct}%, transparent)`;
}

export function correlationTextColor(r: number): string {
  return Math.abs(r) >= 0.45 ? 'var(--fg)' : 'var(--fg-2)';
}

export function movingAverage(values: ReadonlyArray<number | null>, window: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  let sum = 0;
  let count = 0;
  const queue: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v !== null && Number.isFinite(v)) {
      queue.push(v);
      sum += v;
      count++;
    } else {
      queue.push(Number.NaN);
    }
    if (queue.length > window) {
      const dropped = queue.shift() as number;
      if (!Number.isNaN(dropped)) {
        sum -= dropped;
        count--;
      }
    }
    out[i] = count >= Math.min(3, window) ? sum / count : null;
  }
  return out;
}

export function meanOf(values: ReadonlyArray<number | null>): number | null {
  let sum = 0;
  let count = 0;
  for (const v of values) {
    if (v === null || !Number.isFinite(v)) continue;
    sum += v;
    count++;
  }
  return count === 0 ? null : sum / count;
}
