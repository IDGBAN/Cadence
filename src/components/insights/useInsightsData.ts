import { useMemo } from 'react';
import type { AppData, Category, DayKey, Habit, HabitSummary, StreakInfo } from '@/types';
import type { EngineCtx } from '@/lib/habitMath';
import {
  completionRate, dailyValueSeries, habitSummary, overallCompletionSeries,
} from '@/lib/habitMath';
import {
  correlationMatrix, generateInsights, habitTrend, lowerIsBetter, weekdayProfile,
  type Confidence, type CorrelationResult, type Insight, type WeekdayStat,
} from '@/lib/insights';
import { addDays, weekday } from '@/lib/dates';
import { useActiveHabits, useAnalysisData, useCategories, useEngineCtx, useHabitSummaries, useQuitCtx } from '@/store/hooks';
import { meanOf, movingAverage, type Lag, type RangeKey, type ResolvedRange, resolveRange } from './insightsData';

export function useResolvedRange(key: RangeKey): ResolvedRange {
  const data = useAnalysisData();
  const ctx = useEngineCtx();
  return useMemo(() => resolveRange(key, data, ctx), [key, data, ctx]);
}

export interface OverallPoint {
  day: DayKey;
  rate: number | null;
  average: number | null;
  completed: number;
  total: number;
  weekend: boolean;
}

export interface OverallStats {
  points: OverallPoint[];
  rate: number | null;
  previousRate: number | null;
  changePoints: number | null;
  perfectDays: number;
  evaluatedDays: number;
  // indexed by weekday, 0 = Sunday
  byWeekday: Array<{ weekday: number; rate: number | null; n: number }>;
  bestWeekday: number | null;
  worstWeekday: number | null;
}

function aggregate(series: Array<{ rate: number | null; completed: number; total: number }>): number | null {
  let completed = 0;
  let total = 0;
  for (const point of series) {
    completed += point.completed;
    total += point.total;
  }
  return total > 0 ? completed / total : null;
}

export function useOverallStats(range: ResolvedRange): OverallStats {
  const data = useAnalysisData();
  const ctx = useEngineCtx();
  return useMemo(() => {
    const raw = overallCompletionSeries(data, range.start, range.end, ctx);
    // today is still open, so its unfinished habits aren't misses yet (the same rule completion rates use)
    const settled = raw.map((p) => (p.day === ctx.today && p.completed < p.total ? { ...p, total: p.completed } : p));
    const rates = raw.map((p) => p.rate);
    const smoothed = movingAverage(rates, 7);
    const points: OverallPoint[] = raw.map((p, i) => {
      const wd = weekday(p.day);
      return {
        day: p.day,
        rate: p.rate,
        average: smoothed[i],
        completed: p.completed,
        total: p.total,
        weekend: wd === 0 || wd === 6,
      };
    });

    const sums = new Array<number>(7).fill(0);
    const counts = new Array<number>(7).fill(0);
    let perfectDays = 0;
    let evaluatedDays = 0;
    for (const point of points) {
      if (point.total <= 0 || point.rate === null) continue;
      if (point.day === ctx.today && point.completed < point.total) continue;
      evaluatedDays++;
      if (point.rate >= 1) perfectDays++;
      const wd = weekday(point.day);
      sums[wd] += point.rate;
      counts[wd]++;
    }
    const byWeekday = sums.map((sum, wd) => ({ weekday: wd, rate: counts[wd] > 0 ? sum / counts[wd] : null, n: counts[wd] }));
    let bestWeekday: number | null = null;
    let worstWeekday: number | null = null;
    for (const row of byWeekday) {
      if (row.rate === null || row.n < 3) continue;
      if (bestWeekday === null || row.rate > (byWeekday[bestWeekday].rate ?? -1)) bestWeekday = row.weekday;
      if (worstWeekday === null || row.rate < (byWeekday[worstWeekday].rate ?? 2)) worstWeekday = row.weekday;
    }

    const previous = range.previous
      ? aggregate(overallCompletionSeries(data, range.previous.start, range.previous.end, ctx))
      : null;
    const rate = aggregate(settled);
    return {
      points,
      rate,
      previousRate: previous,
      changePoints: rate !== null && previous !== null ? (rate - previous) * 100 : null,
      perfectDays,
      evaluatedDays,
      byWeekday,
      bestWeekday,
      worstWeekday,
    };
  }, [data, ctx, range]);
}

export interface HabitTrend {
  change: number;
  measure: 'rate' | 'average';
  label: string;
  good: boolean;
}

export interface HabitRow {
  habit: Habit;
  summary: HabitSummary;
  streak: StreakInfo;
  rate: number | null;
  opportunities: number;
  successes: number;
  strength: number | null;
  trend: HabitTrend | null;
  logged: number;
  total: number;
  average: number | null;
  isMetric: boolean;
  // second half of the range vs the first
  improvement: { score: number; label: string } | null;
}

const MINUS = '−';

function signedPoints(change: number): string {
  const points = Math.round(Math.abs(change) * 100);
  if (points === 0) return '±0 pts';
  return `${change > 0 ? '+' : MINUS}${points} pts`;
}

function signedRelative(change: number, base: number): string {
  if (base === 0) return change === 0 ? '±0%' : `${change > 0 ? '+' : MINUS}${Math.abs(change).toFixed(1)}`;
  const pct = Math.round(Math.abs(change / base) * 100);
  if (pct === 0) return '±0%';
  return `${change > 0 ? '+' : MINUS}${pct}%`;
}

// a half-logged amount (steps by 9am, a running timer) would drag averages down during the day
function growsDuringDay(habit: Habit): boolean {
  return habit.type === 'quantity' || habit.type === 'duration';
}

function halfAverage(habit: Habit, data: AppData, ctx: EngineCtx, start: DayKey, end: DayKey): { mean: number | null; n: number } {
  if (end < start) return { mean: null, n: 0 };
  const series = dailyValueSeries(habit, data, start, end, ctx);
  const skipToday = growsDuringDay(habit);
  const values = series.map((s) => (skipToday && s.day === ctx.today ? null : s.value));
  const n = values.reduce<number>((acc, v) => (v === null ? acc : acc + 1), 0);
  return { mean: meanOf(values), n };
}

function computeImprovement(
  habit: Habit, data: AppData, ctx: EngineCtx, range: ResolvedRange,
): { score: number; label: string } | null {
  if (range.days < 8) return null;
  const mid = addDays(range.start, Math.floor(range.days / 2));
  const firstEnd = addDays(mid, -1);
  if (habit.kind !== 'metric' && habit.type !== 'rating') {
    const first = completionRate(habit, data, range.start, firstEnd, ctx);
    const second = completionRate(habit, data, mid, range.end, ctx);
    if (first.opportunities < 3 || second.opportunities < 3) return null;
    const change = second.rate - first.rate;
    return { score: change, label: signedPoints(change) };
  }
  const first = halfAverage(habit, data, ctx, range.start, firstEnd);
  const second = halfAverage(habit, data, ctx, mid, range.end);
  if (first.n < 3 || second.n < 3 || first.mean === null || second.mean === null) return null;
  const raw = second.mean - first.mean;
  const change = lowerIsBetter(habit) ? -raw : raw;
  const base = Math.abs(first.mean);
  const score = base > 0 ? Math.max(-1, Math.min(1, change / base)) : 0;
  return { score, label: signedRelative(raw, first.mean) };
}

function computeTrend(habit: Habit, data: AppData, ctx: EngineCtx): HabitTrend | null {
  const trend = habitTrend(habit, data, ctx, 14);
  if (!trend) return null;
  if (trend.measure === 'rate') {
    return { change: trend.change, measure: 'rate', label: signedPoints(trend.change), good: trend.change >= 0 };
  }
  const good = lowerIsBetter(habit) ? trend.change <= 0 : trend.change >= 0;
  return { change: trend.change, measure: 'average', label: signedRelative(trend.change, trend.previous), good };
}

export function useHabitRows(range: ResolvedRange): HabitRow[] {
  const data = useAnalysisData();
  const ctx = useEngineCtx();
  const habits = useActiveHabits();
  // no ticking clock here, it would recompute every row each second
  const summaries = useHabitSummaries(habits, 0);
  return useMemo(
    () =>
      habits.map((habit) => {
        const summary = summaries.get(habit.id) ?? habitSummary(habit, data, ctx);
        const isMetric = habit.kind === 'metric';
        const rate = isMetric ? null : completionRate(habit, data, range.start, range.end, ctx);
        const series = dailyValueSeries(habit, data, range.start, range.end, ctx);
        const skipToday = growsDuringDay(habit);
        let logged = 0;
        let total = 0;
        for (const point of series) {
          if (point.value === null || !Number.isFinite(point.value)) continue;
          if (skipToday && point.day === ctx.today) continue;
          logged++;
          total += point.value;
        }
        return {
          habit,
          summary,
          streak: summary.streak,
          rate: rate ? rate.rate : null,
          opportunities: rate ? rate.opportunities : 0,
          successes: rate ? rate.successes : 0,
          strength: isMetric ? null : summary.strength,
          trend: computeTrend(habit, data, ctx),
          logged,
          total,
          average: logged > 0 ? total / logged : null,
          isMetric,
          improvement: computeImprovement(habit, data, ctx, range),
        };
      }),
    [habits, summaries, data, ctx, range],
  );
}

export interface InsightTotals {
  checkIns: number;
  focusedMinutes: number;
  daysTracked: number;
  habitsTracked: number;
  bestStreak: { habit: Habit; streak: StreakInfo } | null;
  mostImproved: HabitRow | null;
}

const STREAK_UNIT_DAYS: Record<StreakInfo['unit'], number> = { day: 1, week: 7, month: 30.44 };

function streakDays(streak: StreakInfo): number {
  return streak.current * STREAK_UNIT_DAYS[streak.unit];
}

// time spent on a limit (screen time) or a track-only duration isn't focus
function countsAsFocus(habit: Habit): boolean {
  return habit.type === 'duration' && habit.kind !== 'metric' && habit.direction !== 'atMost';
}

export function useInsightTotals(range: ResolvedRange, rows: HabitRow[]): InsightTotals {
  const data = useAnalysisData();
  return useMemo(() => {
    // walk rows, not data.logs, so archived and deleted habits stay out of the totals
    const days = new Set<DayKey>();
    let checkIns = 0;
    let focusedMinutes = 0;
    for (const row of rows) {
      const logs = data.logs[row.habit.id];
      if (!logs) continue;
      const isFocus = countsAsFocus(row.habit);
      for (const day in logs) {
        if (day < range.start || day > range.end) continue;
        const entry = logs[day];
        if (entry.skipped) continue;
        days.add(day);
        if (entry.value > 0) checkIns++;
        if (isFocus && Number.isFinite(entry.value)) focusedMinutes += Math.max(0, entry.value);
      }
    }

    let bestStreak: { habit: Habit; streak: StreakInfo } | null = null;
    let mostImproved: HabitRow | null = null;
    for (const row of rows) {
      if (!row.isMetric && row.streak.current > 0 && (!bestStreak || streakDays(row.streak) > streakDays(bestStreak.streak))) {
        bestStreak = { habit: row.habit, streak: row.streak };
      }
      const score = row.improvement?.score ?? 0;
      if (row.improvement && score > 0.05 && (!mostImproved || score > (mostImproved.improvement?.score ?? 0))) {
        mostImproved = row;
      }
    }

    return {
      checkIns,
      focusedMinutes,
      daysTracked: days.size,
      habitsTracked: rows.length,
      bestStreak,
      mostImproved,
    };
  }, [data, range, rows]);
}

export function useInsights(range: ResolvedRange): Insight[] {
  const data = useAnalysisData();
  const hasQuit = useActiveHabits().some((habit) => habit.type === 'quit');
  // the shared ctx's clock is frozen for the day, so a relapse logged this afternoon would be missed
  const ctx = useQuitCtx(hasQuit, 0);
  return useMemo(
    () => generateInsights(data, ctx, { start: range.start, end: range.end }),
    [data, ctx, range],
  );
}

export interface CorrelationPair {
  driver: Habit;
  outcome: Habit;
  result: CorrelationResult;
}

export interface CorrelationData {
  habits: Habit[];
  // matrix[driver][outcome]
  matrix: Array<Array<CorrelationResult | null>>;
  pairs: CorrelationPair[];
  // the top pair that isn't low confidence, so a noisy 10-day link can't headline the section
  strongest: CorrelationPair | null;
  tested: number;
  possible: number;
  minN: number;
}

export const CORRELATION_MIN_N = 10;

const CONFIDENCE_RANK: Record<Confidence, number> = { high: 2, medium: 1, low: 0 };

export function useCorrelations(range: ResolvedRange, lag: Lag): CorrelationData {
  const data = useAnalysisData();
  const ctx = useEngineCtx();
  const habits = useActiveHabits();
  return useMemo(() => {
    const habitIds = habits.map((h) => h.id);
    const { habits: ordered, matrix } = correlationMatrix(data, ctx, {
      start: range.start,
      end: range.end,
      lag,
      minN: CORRELATION_MIN_N,
      habitIds,
    });
    const pairs: CorrelationPair[] = [];
    let tested = 0;
    for (let i = 0; i < ordered.length; i++) {
      for (let j = 0; j < ordered.length; j++) {
        if (i === j) continue;
        const result = matrix[i][j];
        if (!result) continue;
        tested++;
        if (lag === 0 && j < i) continue;
        pairs.push({ driver: ordered[i], outcome: ordered[j], result });
      }
    }
    pairs.sort((a, b) =>
      CONFIDENCE_RANK[b.result.confidence] - CONFIDENCE_RANK[a.result.confidence]
      || Math.abs(b.result.r) - Math.abs(a.result.r));
    const strongest = pairs.length > 0 && pairs[0].result.confidence !== 'low' ? pairs[0] : null;
    const size = ordered.length;
    const possible = lag === 0 ? (size * (size - 1)) / 2 : size * (size - 1);
    return {
      habits: ordered,
      matrix,
      pairs,
      strongest,
      tested: lag === 0 ? tested / 2 : tested,
      possible,
      minN: CORRELATION_MIN_N,
    };
  }, [data, ctx, range, lag, habits]);
}

export interface WeekdayRow {
  habit: Habit;
  stats: WeekdayStat[];
  // metric averages are scaled to the row max
  intensity: Array<number | null>;
  isMetric: boolean;
}

export function useWeekdayRows(range: ResolvedRange): WeekdayRow[] {
  const data = useAnalysisData();
  const ctx = useEngineCtx();
  const habits = useActiveHabits();
  return useMemo(
    () =>
      habits.map((habit) => {
        const stats = weekdayProfile(habit, data, ctx, range.start, range.end);
        const isMetric = habit.kind === 'metric';
        const values = stats.map((s) => (isMetric ? s.average : s.rate));
        let max = 0;
        for (const v of values) if (v !== null && v > max) max = v;
        const intensity = values.map((v) => {
          if (v === null) return null;
          if (!isMetric) return Math.max(0, Math.min(1, v));
          return max > 0 ? Math.max(0, Math.min(1, v / max)) : 0;
        });
        return { habit, stats, intensity, isMetric };
      }),
    [habits, data, ctx, range],
  );
}

export interface CategoryRow {
  id: string;
  name: string;
  icon: string;
  habits: Habit[];
  rate: number | null;
  successes: number;
  opportunities: number;
  metricCount: number;
}

export function useCategoryRows(rows: HabitRow[]): CategoryRow[] {
  const categories = useCategories();
  return useMemo(() => {
    const byId = new Map<string, CategoryRow>();
    const make = (category: Pick<Category, 'id' | 'name' | 'icon'>): CategoryRow => ({
      id: category.id,
      name: category.name,
      icon: category.icon,
      habits: [],
      rate: null,
      successes: 0,
      opportunities: 0,
      metricCount: 0,
    });
    for (const category of categories) byId.set(category.id, make(category));
    for (const row of rows) {
      let bucket = byId.get(row.habit.categoryId);
      if (!bucket) {
        bucket = make({ id: '__other', name: 'Uncategorized', icon: '🗂️' });
        byId.set('__other', bucket);
      }
      bucket.habits.push(row.habit);
      if (row.isMetric) bucket.metricCount++;
      bucket.successes += row.successes;
      bucket.opportunities += row.opportunities;
    }
    const out: CategoryRow[] = [];
    for (const bucket of byId.values()) {
      if (bucket.habits.length === 0) continue;
      bucket.rate = bucket.opportunities > 0 ? bucket.successes / bucket.opportunities : null;
      out.push(bucket);
    }
    out.sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.habits.length - a.habits.length);
    return out;
  }, [categories, rows]);
}
