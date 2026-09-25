import { describe, expect, it } from 'vitest';
import type { AppData, DayKey, Habit, LogEntry, Relapse } from '@/types';
import { addDays, fromDayKey, weekday } from './dates';
import { blankHabit, createInitialData } from './defaults';
import { makeCtx } from './habitMath';
import { generateDemoData } from './demo';
import {
  compareOutcome, confidenceOf, correlate, correlationMatrix, describeR, generateInsights, habitTrend,
  pearson, pValueForR, strengthOf, weekdayProfile, type Insight,
} from './insights';

// fixed clock: Thu 2026-09-17 12:00 local. the analysis window always ends yesterday

const NOW = new Date(2026, 8, 17, 12, 0, 0);
const TODAY = '2026-09-17';
const YESTERDAY = '2026-09-16';
const ctx = makeCtx({ weekStartsOn: 1, dayStartHour: 0 }, NOW);

let seq = 0;

function habit(patch: Partial<Habit> = {}): Habit {
  seq += 1;
  return {
    ...blankHabit(seq),
    id: `h_test_${seq}`,
    name: `Habit ${seq}`,
    startDate: '2026-01-01',
    createdAt: new Date(2026, 0, 1, 9).toISOString(),
    quitStart: new Date(2026, 0, 1, 9).toISOString(),
    ...patch,
  };
}

function entry(value: number, extra: Partial<LogEntry> = {}): LogEntry {
  return { value, updatedAt: NOW.toISOString(), ...extra };
}

function makeData(
  habits: Habit[],
  logs: Record<string, Record<DayKey, LogEntry>> = {},
  relapses: Relapse[] = [],
): AppData {
  return { ...createInitialData(), habits, logs, relapses };
}

function relapseOn(habitId: string, day: DayKey): Relapse {
  const at = fromDayKey(day);
  at.setHours(20, 0, 0, 0);
  return { id: `rel_${habitId}_${day}`, habitId, at: at.toISOString() };
}

function logDays(from: DayKey, values: number[]): Record<DayKey, LogEntry> {
  const out: Record<DayKey, LogEntry> = {};
  values.forEach((value, i) => {
    out[addDays(from, i)] = entry(value);
  });
  return out;
}

// a metric's series is exactly what you log, nothing inferred
function metricHabit(name: string): Habit {
  return habit({ name, type: 'rating', kind: 'metric', ratingMax: 10 });
}

describe('pearson', () => {
  it('returns r = 1 for a perfect positive relationship', () => {
    const res = pearson([1, 2, 3, 4], [2, 4, 6, 8]);
    expect(res).not.toBeNull();
    expect(res!.r).toBeCloseTo(1, 12);
    expect(res!.n).toBe(4);
  });

  it('returns r = -1 for a perfect negative relationship', () => {
    const res = pearson([1, 2, 3, 4, 5], [10, 8, 6, 4, 2]);
    expect(res!.r).toBeCloseTo(-1, 12);
    expect(res!.n).toBe(5);
  });

  it('computes a known intermediate r', () => {
    // sxy = 8, sxx = syy = 10, so r = 0.8
    const res = pearson([1, 2, 3, 4, 5], [2, 1, 4, 3, 5]);
    expect(res!.r).toBeCloseTo(0.8, 12);
  });

  it('returns null when either series has zero variance', () => {
    expect(pearson([1, 1, 1, 1], [1, 2, 3, 4])).toBeNull();
    expect(pearson([1, 2, 3, 4], [7, 7, 7, 7])).toBeNull();
    expect(pearson([0, 0, 0], [0, 0, 0])).toBeNull();
  });

  it('pairs by index and ignores the tail of the longer series', () => {
    const res = pearson([1, 2, 3, 4, 5], [2, 4, 6]);
    expect(res!.n).toBe(3);
    expect(res!.r).toBeCloseTo(1, 12);
  });

  it('drops pairs with a non-finite member', () => {
    const res = pearson([1, 2, Number.NaN, 4, 5], [2, 4, 100, 8, 10]);
    expect(res!.n).toBe(4);
    expect(res!.r).toBeCloseTo(1, 12);
    expect(pearson([1, 2, 3, 4], [2, Number.NaN, 6, 8])!.n).toBe(3);
    expect(pearson([1, Number.POSITIVE_INFINITY, 3], [2, 99, 6])!.n).toBe(2);
  });

  it('returns null when fewer than two pairs survive', () => {
    expect(pearson([1], [2])).toBeNull();
    expect(pearson([], [])).toBeNull();
    expect(pearson([1, Number.NaN], [2, 3])).toBeNull();
  });

  it('keeps r inside [-1, 1]', () => {
    for (const [xs, ys] of [
      [[1, 2, 3], [2, 4, 6]],
      [[3, 1, 2, 9, 4], [3, 1, 2, 9, 4]],
      [[10, 20, 30, 40], [40, 30, 20, 10]],
    ] as Array<[number[], number[]]>) {
      const res = pearson(xs, ys)!;
      expect(res.r).toBeLessThanOrEqual(1);
      expect(res.r).toBeGreaterThanOrEqual(-1);
    }
    expect(pearson([1, 2, 3], [2, 4, 6])!.r).toBe(1);
  });

  it('treats a spread that is negligible against the magnitude as no variance', () => {
    expect(pearson([1e8, 1e8 + 1, 1e8 + 2, 1e8 + 3], [1, 2, 3, 4])).toBeNull();
  });
});

describe('pValueForR', () => {
  it('matches the Student-t table for a moderate correlation', () => {
    // r = 0.5, n = 30 → t = 3.055 on 28 df → p ≈ 0.005
    expect(pValueForR(0.5, 30)).toBeCloseTo(0.0049, 4);
  });

  it('stays far from significance for a weak correlation on few days', () => {
    // r = 0.1, n = 20 → t = 0.426 on 18 df → p ≈ 0.67
    expect(pValueForR(0.1, 20)).toBeGreaterThan(0.5);
    expect(pValueForR(0.1, 20)).toBeCloseTo(0.6749, 3);
  });

  it('matches the table for a small-sample strong correlation', () => {
    // r = 0.8, n = 5 → t = 2.309 on 3 df → p ≈ 0.104
    expect(pValueForR(0.8, 5)).toBeCloseTo(0.1041, 3);
  });

  it('is 0 at |r| = 1 and 1 at r = 0', () => {
    expect(pValueForR(1, 10)).toBe(0);
    expect(pValueForR(-1, 10)).toBe(0);
    expect(pValueForR(0, 10)).toBe(1);
  });

  it('ignores the sign of r', () => {
    expect(pValueForR(-0.5, 30)).toBe(pValueForR(0.5, 30));
    expect(pValueForR(-0.37, 42)).toBe(pValueForR(0.37, 42));
  });

  it('decreases monotonically as n grows', () => {
    const p10 = pValueForR(0.4, 10);
    const p20 = pValueForR(0.4, 20);
    const p50 = pValueForR(0.4, 50);
    expect(p10).toBeGreaterThan(p20);
    expect(p20).toBeGreaterThan(p50);
    expect(p50).toBeLessThan(0.01);
  });

  it('decreases monotonically as |r| grows', () => {
    expect(pValueForR(0.1, 40)).toBeGreaterThan(pValueForR(0.3, 40));
    expect(pValueForR(0.3, 40)).toBeGreaterThan(pValueForR(0.6, 40));
  });

  it('returns 1 when there are not enough degrees of freedom or the inputs are broken', () => {
    expect(pValueForR(0.9, 2)).toBe(1);
    expect(pValueForR(0.9, 1)).toBe(1);
    expect(pValueForR(Number.NaN, 30)).toBe(1);
    expect(pValueForR(0.5, Number.NaN)).toBe(1);
  });

  it('always returns a probability', () => {
    for (const r of [0.05, 0.2, 0.45, 0.72, 0.99]) {
      for (const n of [5, 14, 30, 120]) {
        const p = pValueForR(r, n);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('strengthOf', () => {
  it('uses the documented |r| thresholds', () => {
    expect(strengthOf(0)).toBe('none');
    expect(strengthOf(0.099)).toBe('none');
    expect(strengthOf(0.1)).toBe('weak');
    expect(strengthOf(0.299)).toBe('weak');
    expect(strengthOf(0.3)).toBe('moderate');
    expect(strengthOf(0.499)).toBe('moderate');
    expect(strengthOf(0.5)).toBe('strong');
    expect(strengthOf(1)).toBe('strong');
  });

  it('is symmetric in sign and safe on non-finite input', () => {
    expect(strengthOf(-0.35)).toBe('moderate');
    expect(strengthOf(-0.85)).toBe('strong');
    expect(strengthOf(Number.NaN)).toBe('none');
  });
});

describe('confidenceOf', () => {
  it('needs at least 14 pairs and p < 0.1 to leave "low"', () => {
    expect(confidenceOf(13, 0.0001)).toBe('low');
    expect(confidenceOf(14, 0.1)).toBe('low');
    expect(confidenceOf(200, 0.2)).toBe('low');
    expect(confidenceOf(14, 0.099)).toBe('medium');
  });

  it('needs 30 pairs and p < 0.01 for "high"', () => {
    expect(confidenceOf(30, 0.0099)).toBe('high');
    expect(confidenceOf(30, 0.01)).toBe('medium');
    expect(confidenceOf(29, 0.0001)).toBe('medium');
    expect(confidenceOf(120, 1e-9)).toBe('high');
  });

  it('is low for broken input', () => {
    expect(confidenceOf(Number.NaN, 0.001)).toBe('low');
    expect(confidenceOf(50, Number.NaN)).toBe('low');
  });
});

// outcome on day d = driver on day d-1. the [1, 5, 9, 5] cycle has zero lag-1 autocorrelation,
// so lag 0 sees nothing and lag 1 sees a perfect link
const CYCLE = [1, 5, 9, 5];
function lagFixture() {
  const start = addDays(YESTERDAY, -100);
  const driver = metricHabit('Driver');
  const outcome = metricHabit('Outcome');
  const driverLogs: Record<DayKey, LogEntry> = {};
  const outcomeLogs: Record<DayKey, LogEntry> = {};
  for (let i = 0; i <= 100; i++) {
    const day = addDays(start, i);
    driverLogs[day] = entry(CYCLE[i % 4]);
    if (i > 0) outcomeLogs[day] = entry(CYCLE[(i - 1) % 4]);
  }
  // today is logged too and must never enter a correlation
  driverLogs[TODAY] = entry(10);
  outcomeLogs[TODAY] = entry(1);
  const data = makeData([driver, outcome], { [driver.id]: driverLogs, [outcome.id]: outcomeLogs });
  return { start, driver, outcome, data };
}

describe('correlate', () => {
  const { start, driver, outcome, data } = lagFixture();
  const range = { start, end: TODAY };

  it('finds a next-day link at lag 1', () => {
    const res = correlate(data, ctx, driver, outcome, { ...range, lag: 1 })!;
    expect(res).not.toBeNull();
    expect(res.r).toBeCloseTo(1, 10);
    expect(res.lag).toBe(1);
    expect(res.n).toBe(100);
    expect(res.a).toBe(driver.id);
    expect(res.b).toBe(outcome.id);
    expect(res.strength).toBe('strong');
    expect(res.confidence).toBe('high');
    expect(res.p).toBe(0);
  });

  it('sees nothing for the same pair at lag 0', () => {
    const res = correlate(data, ctx, driver, outcome, { ...range, lag: 0 })!;
    expect(res.r).toBeCloseTo(0, 10);
    expect(res.lag).toBe(0);
    expect(res.strength).toBe('none');
    expect(res.confidence).toBe('low');
    expect(res.n).toBe(100);
  });

  it('defaults to lag 0', () => {
    expect(correlate(data, ctx, driver, outcome, range)!.lag).toBe(0);
  });

  it('stops the window at yesterday, so today never skews a correlation', () => {
    const untilYesterday = correlate(data, ctx, driver, outcome, { start, end: YESTERDAY, lag: 1 })!;
    const untilToday = correlate(data, ctx, driver, outcome, { ...range, lag: 1 })!;
    expect(untilToday.n).toBe(untilYesterday.n);
    expect(untilToday.r).toBeCloseTo(untilYesterday.r, 12);
  });

  it('returns null for an empty window', () => {
    expect(correlate(data, ctx, driver, outcome, { start: TODAY, end: TODAY })).toBeNull();
    expect(correlate(data, ctx, driver, outcome, { start: '2026-09-20', end: '2026-09-30' })).toBeNull();
  });

  it('refuses a same-day self-correlation but allows the lag-1 autocorrelation', () => {
    expect(correlate(data, ctx, driver, driver, range)).toBeNull();
    const self = correlate(data, ctx, driver, driver, { ...range, lag: 1 })!;
    expect(self.a).toBe(driver.id);
    expect(self.b).toBe(driver.id);
    expect(self.r).toBeCloseTo(0, 10);
  });

  it('honours minN', () => {
    expect(correlate(data, ctx, driver, outcome, { ...range, lag: 1, minN: 100 })).not.toBeNull();
    expect(correlate(data, ctx, driver, outcome, { ...range, lag: 1, minN: 101 })).toBeNull();
  });

  it('clamps minN to at least 3', () => {
    const a = metricHabit('Tiny A');
    const b = metricHabit('Tiny B');
    const from = addDays(YESTERDAY, -2);
    const tiny = makeData([a, b], {
      [a.id]: logDays(from, [1, 5, 9]),
      [b.id]: logDays(from, [2, 4, 7]),
    });
    expect(correlate(tiny, ctx, a, b, { start: from, end: TODAY, minN: 1 })!.n).toBe(3);
    expect(correlate(tiny, ctx, a, b, { start: from, end: TODAY })).toBeNull(); // default minN 10

    const twoDay = addDays(YESTERDAY, -1);
    const pair = makeData([a, b], {
      [a.id]: logDays(twoDay, [1, 9]),
      [b.id]: logDays(twoDay, [2, 8]),
    });
    expect(correlate(pair, ctx, a, b, { start: twoDay, end: TODAY, minN: 1 })).toBeNull();
  });

  it('returns null when a series never varies', () => {
    const flat = habit({ name: 'Flat', type: 'check' });
    const flatLogs: Record<DayKey, LogEntry> = {};
    for (let i = 0; i <= 100; i++) flatLogs[addDays(start, i)] = entry(1);
    const withFlat = makeData([flat, outcome], {
      [flat.id]: flatLogs,
      [outcome.id]: data.logs[outcome.id],
    });
    expect(correlate(withFlat, ctx, flat, outcome, range)).toBeNull();
  });
});

describe('correlationMatrix', () => {
  const { start, driver, outcome, data } = lagFixture();
  const third = metricHabit('Third');
  const archived = metricHabit('Archived');
  archived.archived = true;
  const wide = makeData([driver, outcome, third, archived], data.logs);
  const range = { start, end: TODAY };

  it('covers the active habits with a null diagonal', () => {
    const { habits, matrix } = correlationMatrix(wide, ctx, range);
    expect(habits.map((h) => h.name)).toEqual(['Driver', 'Outcome', 'Third']);
    expect(matrix).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(matrix[i]).toHaveLength(3);
      expect(matrix[i][i]).toBeNull();
    }
  });

  it('is symmetric at lag 0 with the roles swapped', () => {
    const { matrix } = correlationMatrix(wide, ctx, { ...range, lag: 0 });
    const forward = matrix[0][1]!;
    const backward = matrix[1][0]!;
    expect(backward).not.toBeNull();
    expect(backward.r).toBe(forward.r);
    expect(backward.n).toBe(forward.n);
    expect(backward.p).toBe(forward.p);
    expect(backward.a).toBe(forward.b);
    expect(backward.b).toBe(forward.a);
  });

  it('is directional at lag 1', () => {
    const { habits, matrix } = correlationMatrix(wide, ctx, { ...range, lag: 1 });
    const d = habits.findIndex((h) => h.id === driver.id);
    const o = habits.findIndex((h) => h.id === outcome.id);
    expect(matrix[d][o]!.r).toBeCloseTo(1, 10);
    expect(matrix[o][d]!.r).toBeLessThan(0);
    expect(matrix[d][o]!.lag).toBe(1);
  });

  it('respects habitIds, dropping unknown ids and duplicates', () => {
    const { habits, matrix } = correlationMatrix(wide, ctx, {
      ...range,
      habitIds: [outcome.id, 'nope', driver.id, outcome.id, archived.id],
    });
    expect(habits.map((h) => h.id)).toEqual([outcome.id, driver.id, archived.id]);
    expect(matrix).toHaveLength(3);
    expect(matrix[0][1]).not.toBeNull();
    expect(matrix[0][2]).toBeNull(); // archived habit has no logs
  });

  it('returns an all-null matrix for an empty window', () => {
    const { habits, matrix } = correlationMatrix(wide, ctx, { start: TODAY, end: TODAY });
    expect(habits).toHaveLength(3);
    expect(matrix.flat().every((cell) => cell === null)).toBe(true);
  });

  it('returns an empty matrix when no habit is selected', () => {
    const empty = correlationMatrix(wide, ctx, { ...range, habitIds: [] });
    expect(empty.habits).toEqual([]);
    expect(empty.matrix).toEqual([]);
  });
});

describe('compareOutcome', () => {
  const START = addDays(YESTERDAY, -19); // 20 days, ending yesterday
  const range = { start: START, end: TODAY };
  // 4 for ten days, then 8 for ten
  const mood = metricHabit('Mood');
  const moodLogs = logDays(START, [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8]);

  function withDriver(driver: Habit, driverLogs: Record<DayKey, LogEntry>, relapses: Relapse[] = []): AppData {
    return makeData([driver, mood], { [driver.id]: driverLogs, [mood.id]: moodLogs }, relapses);
  }

  it('splits a check habit on "done"', () => {
    const gym = habit({ name: 'Gym', type: 'check' });
    const logs: Record<DayKey, LogEntry> = {};
    for (let i = 10; i < 20; i++) logs[addDays(START, i)] = entry(1);
    const res = compareOutcome(withDriver(gym, logs), ctx, gym, mood, range)!;
    expect(res.split).toBe('done');
    expect(res.splitLabel).toBe('done');
    expect(res.withN).toBe(10);
    expect(res.withoutN).toBe(10);
    expect(res.withAvg).toBe(8);
    expect(res.withoutAvg).toBe(4);
    expect(res.delta).toBe(4);
    expect(res.deltaPct).toBe(1);
    expect(res.measure).toBe('average');
    expect(res.threshold).toBeUndefined();
  });

  it('splits a daily numeric goal on "goal met"', () => {
    const water = habit({ name: 'Water', type: 'quantity', target: 8, unit: 'glasses', step: 1 });
    const logs = logDays(START, [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9]);
    const res = compareOutcome(withDriver(water, logs), ctx, water, mood, range)!;
    expect(res.split).toBe('goalMet');
    expect(res.splitLabel).toBe('goal met');
    expect(res.threshold).toBe(8);
    expect(res.withAvg).toBe(8);
    expect(res.withoutAvg).toBe(4);
  });

  it('falls back to a median split when the goal split is lopsided', () => {
    // 17 of 20 days meet the 8-glass goal, which leaves only 3 days on one side
    const water = habit({ name: 'Water', type: 'quantity', target: 8, unit: 'glasses', step: 1 });
    const logs = logDays(START, [2, 2, 2, 8, 8, 8, 8, 8, 8, 8, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12]);
    const res = compareOutcome(withDriver(water, logs), ctx, water, mood, range)!;
    expect(res.split).toBe('atLeast');
    expect(res.threshold).toBe(10);
    expect(res.splitLabel).toBe('≥ 10 glasses');
    expect(res.withN).toBe(10);
    expect(res.withoutN).toBe(10);
    expect(res.withAvg).toBe(8);
    expect(res.withoutAvg).toBe(4);
    expect(res.deltaPct).toBe(1);
  });

  it('splits a weekly numeric goal on "logged"', () => {
    const run = habit({ name: 'Run', type: 'quantity', period: 'week', target: 15, unit: 'km', step: 1 });
    const logs: Record<DayKey, LogEntry> = {};
    for (let i = 10; i < 20; i++) logs[addDays(START, i)] = entry(5);
    const res = compareOutcome(withDriver(run, logs), ctx, run, mood, range)!;
    expect(res.split).toBe('logged');
    expect(res.splitLabel).toBe('logged');
    expect(res.withN).toBe(10);
    expect(res.withoutN).toBe(10);
    expect(res.withAvg).toBe(8);
  });

  it('splits a metric above its median when "at least" is lopsided', () => {
    const steps = habit({ name: 'Steps', type: 'quantity', kind: 'metric', unit: 'steps', step: 100 });
    const logs = logDays(START, [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 7, 7, 7, 7, 7, 7]);
    const res = compareOutcome(withDriver(steps, logs), ctx, steps, mood, range)!;
    expect(res.split).toBe('above');
    expect(res.threshold).toBe(5);
    expect(res.splitLabel).toBe('> 5 steps');
    expect(res.withN).toBe(6);
    expect(res.withoutN).toBe(14);
  });

  it('splits a metric at its median when both sides are big enough', () => {
    const steps = habit({ name: 'Steps2', type: 'quantity', kind: 'metric', unit: 'steps', step: 100 });
    const logs = logDays(START, [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9]);
    const res = compareOutcome(withDriver(steps, logs), ctx, steps, mood, range)!;
    expect(res.split).toBe('atLeast');
    expect(res.threshold).toBe(5.5);
    expect(res.splitLabel).toBe('≥ 5.5 steps');
    expect(res.withN).toBe(10);
  });

  it('falls back to "logged" when a metric median is 0', () => {
    const screens = habit({ name: 'Screens', type: 'duration', kind: 'metric', step: 15 });
    const logs = logDays(START, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 45, 45, 45, 45, 45, 45, 45, 45]);
    const res = compareOutcome(withDriver(screens, logs), ctx, screens, mood, range)!;
    expect(res.split).toBe('logged');
    expect(res.withN).toBe(8);
    expect(res.withoutN).toBe(12);
  });

  it('splits a quit habit on clean days', () => {
    const quit = habit({ name: 'No Doomscrolling', type: 'quit', target: 30 });
    const relapses = [0, 2, 4, 6, 8].map((i) => relapseOn(quit.id, addDays(START, i)));
    const data = makeData([quit, mood], { [mood.id]: moodLogs }, relapses);
    const res = compareOutcome(data, ctx, quit, mood, range)!;
    expect(res.split).toBe('clean');
    expect(res.splitLabel).toBe('clean day');
    expect(res.withN).toBe(15);
    expect(res.withoutN).toBe(5);
    expect(res.withAvg).toBeCloseTo((4 * 5 + 8 * 10) / 15, 10);
    expect(res.withoutAvg).toBe(4);
  });

  it('reports a rate when the outcome is a check habit', () => {
    const check = habit({ name: 'Brush', type: 'check' });
    const checkLogs: Record<DayKey, LogEntry> = {};
    for (let i = 10; i < 20; i++) checkLogs[addDays(START, i)] = entry(1);
    const data = makeData([mood, check], { [mood.id]: moodLogs, [check.id]: checkLogs });
    const res = compareOutcome(data, ctx, mood, check, range)!;
    expect(res.measure).toBe('rate');
    expect(res.split).toBe('atLeast');
    expect(res.splitLabel).toBe('≥ 6/10');
    expect(res.withAvg).toBe(1);
    expect(res.withoutAvg).toBe(0);
    expect(res.deltaPct).toBe(0); // no baseline to divide by
  });

  it('needs at least five days on each side', () => {
    const rare = habit({ name: 'Rare', type: 'check' });
    const logs: Record<DayKey, LogEntry> = {};
    for (let i = 16; i < 20; i++) logs[addDays(START, i)] = entry(1);
    expect(compareOutcome(withDriver(rare, logs), ctx, rare, mood, range)).toBeNull();
  });

  it('pairs the next day at lag 1', () => {
    const { start, driver, outcome, data } = lagFixture();
    const sameDay = compareOutcome(data, ctx, driver, outcome, { start, end: TODAY, lag: 0 })!;
    const nextDay = compareOutcome(data, ctx, driver, outcome, { start, end: TODAY, lag: 1 })!;
    // the outcome repeats the driver's previous value, so the next-day split separates it perfectly
    expect(nextDay.delta).toBeGreaterThan(Math.abs(sameDay.delta));
    expect(nextDay.withAvg).toBeGreaterThan(nextDay.withoutAvg);
  });

  it('returns null for a same-day self comparison and for an empty window', () => {
    const gym = habit({ name: 'Gym2', type: 'check' });
    const logs: Record<DayKey, LogEntry> = {};
    for (let i = 10; i < 20; i++) logs[addDays(START, i)] = entry(1);
    const data = withDriver(gym, logs);
    expect(compareOutcome(data, ctx, gym, gym, range)).toBeNull();
    expect(compareOutcome(data, ctx, gym, mood, { start: TODAY, end: TODAY })).toBeNull();
  });
});

describe('weekdayProfile', () => {
  // Mon 2026-08-03 to Sun 2026-09-13, six whole weeks
  const FROM = '2026-08-03';
  const TO = '2026-09-13';

  function mondayHabit() {
    const h = habit({ name: 'Mondays', type: 'check', startDate: FROM });
    const logs: Record<DayKey, LogEntry> = {};
    for (let d = FROM; d <= TO; d = addDays(d, 1)) if (weekday(d) === 1) logs[d] = entry(1);
    return { h, data: makeData([h], { [h.id]: logs }) };
  }

  it('returns one entry per weekday, indexed 0 = Sunday', () => {
    const { h, data } = mondayHabit();
    const profile = weekdayProfile(h, data, ctx, FROM, TO);
    expect(profile).toHaveLength(7);
    profile.forEach((stat, i) => expect(stat.weekday).toBe(i));
  });

  it('puts the rate on the right weekday', () => {
    const { h, data } = mondayHabit();
    const profile = weekdayProfile(h, data, ctx, FROM, TO);
    expect(profile[1].rate).toBe(1);
    expect(profile[1].average).toBe(1);
    expect(profile[0].rate).toBe(0);
    expect(profile[4].rate).toBe(0);
    expect(profile.every((s) => s.n === 6)).toBe(true);
  });

  it('counts values (not opportunities) for metrics and leaves rate null', () => {
    const m = metricHabit('Mood');
    const logs: Record<DayKey, LogEntry> = {};
    // three Mondays at 9, two Fridays at 5
    for (const d of ['2026-08-03', '2026-08-10', '2026-08-17']) logs[d] = entry(9);
    for (const d of ['2026-08-07', '2026-08-14']) logs[d] = entry(5);
    const profile = weekdayProfile(m, makeData([m], { [m.id]: logs }), ctx, FROM, TO);
    expect(profile.every((s) => s.rate === null)).toBe(true);
    expect(profile[1].average).toBe(9);
    expect(profile[1].n).toBe(3);
    expect(profile[5].average).toBe(5);
    expect(profile[5].n).toBe(2);
    expect(profile[2].average).toBeNull();
    expect(profile[2].n).toBe(0);
  });

  it('clips the range to today and handles an empty range', () => {
    const { h, data } = mondayHabit();
    const clipped = weekdayProfile(h, data, ctx, FROM, '2026-12-31');
    const untilToday = weekdayProfile(h, data, ctx, FROM, TODAY);
    expect(clipped).toEqual(untilToday);
    const empty = weekdayProfile(h, data, ctx, '2026-10-01', '2026-09-01');
    expect(empty).toHaveLength(7);
    expect(empty.every((s) => s.n === 0 && s.rate === null && s.average === null)).toBe(true);
  });

  it("leaves today's still-growing value out of the average", () => {
    const water = habit({ name: 'Water', type: 'quantity', target: 8, unit: 'glasses', startDate: '2026-09-01' });
    const logs: Record<DayKey, LogEntry> = {};
    logs[TODAY] = entry(10); // already over the goal → counted as an opportunity
    logs[addDays(TODAY, -7)] = entry(4);
    const profile = weekdayProfile(water, makeData([water], { [water.id]: logs }), ctx, addDays(TODAY, -7), TODAY);
    expect(weekday(TODAY)).toBe(4);
    expect(profile[4].average).toBe(4); // today's growing value is excluded
    expect(profile[4].n).toBe(2);
    expect(profile[4].rate).toBe(0.5);
  });
});

describe('habitTrend', () => {
  it('measures goal check habits as a rate', () => {
    const h = habit({ name: 'Trend', type: 'check', startDate: '2026-07-01' });
    const logs: Record<DayKey, LogEntry> = {};
    for (let i = 0; i < 14; i++) logs[addDays(TODAY, -i)] = entry(1);
    for (let i = 14; i < 28; i++) if (i % 2 === 0) logs[addDays(TODAY, -i)] = entry(1);
    const trend = habitTrend(h, makeData([h], { [h.id]: logs }), ctx)!;
    expect(trend.measure).toBe('rate');
    expect(trend.current).toBe(1);
    expect(trend.previous).toBe(0.5);
    expect(trend.change).toBe(0.5);
  });

  it('measures ratings as an average even when they are goals', () => {
    const h = habit({ name: 'Sleep quality', type: 'rating', target: 7, startDate: '2026-07-01' });
    const logs: Record<DayKey, LogEntry> = {};
    for (let i = 0; i < 28; i++) logs[addDays(TODAY, -i)] = entry(i < 14 ? 8 : 5);
    const trend = habitTrend(h, makeData([h], { [h.id]: logs }), ctx)!;
    expect(trend.measure).toBe('average');
    expect(trend.current).toBe(8);
    expect(trend.previous).toBe(5);
    expect(trend.change).toBe(3);
  });

  it('measures metrics as an average and leaves out a growing today', () => {
    const h = habit({ name: 'Steps', type: 'quantity', kind: 'metric', unit: 'steps', startDate: '2026-07-01' });
    const logs: Record<DayKey, LogEntry> = {};
    logs[TODAY] = entry(999);
    for (let i = 1; i < 14; i++) logs[addDays(TODAY, -i)] = entry(2);
    for (let i = 14; i < 28; i++) logs[addDays(TODAY, -i)] = entry(5);
    const trend = habitTrend(h, makeData([h], { [h.id]: logs }), ctx)!;
    expect(trend.measure).toBe('average');
    expect(trend.current).toBe(2);
    expect(trend.previous).toBe(5);
    expect(trend.change).toBe(-3);
  });

  it('measures quit habits as a clean-day rate', () => {
    const q = habit({ name: 'No Sugar', type: 'quit', target: 30 });
    const relapses = [2, 5, 9, 12, 16, 20, 24].map((i) => relapseOn(q.id, addDays(TODAY, -i)));
    const trend = habitTrend(q, makeData([q], {}, relapses), ctx)!;
    expect(trend.measure).toBe('rate');
    // four relapses in the last 14 days, three in the 14 before
    expect(trend.current).toBeCloseTo(1 - 4 / 14, 10);
    expect(trend.previous).toBeCloseTo(1 - 3 / 14, 10);
    expect(trend.change).toBeLessThan(0);
  });

  it('honours windowDays', () => {
    const h = habit({ name: 'Windowed', type: 'check', startDate: '2026-06-01' });
    const logs: Record<DayKey, LogEntry> = {};
    for (let i = 0; i < 7; i++) logs[addDays(TODAY, -i)] = entry(1);
    const data = makeData([h], { [h.id]: logs });
    const week = habitTrend(h, data, ctx, 7)!;
    expect(week.current).toBe(1);
    expect(week.previous).toBe(0);
    expect(week.change).toBe(1);
    const fortnight = habitTrend(h, data, ctx, 14)!;
    expect(fortnight.current).toBe(0.5);
  });

  it('returns null when either window is too thin', () => {
    const h = habit({ name: 'Sparse', type: 'rating', kind: 'metric', startDate: '2026-07-01' });
    const logs: Record<DayKey, LogEntry> = {};
    for (const i of [1, 2, 3]) logs[addDays(TODAY, -i)] = entry(7); // 3 < minCount 5
    for (let i = 14; i < 28; i++) logs[addDays(TODAY, -i)] = entry(4);
    expect(habitTrend(h, makeData([h], { [h.id]: logs }), ctx)).toBeNull();

    const fresh = habit({ name: 'Brand new', type: 'check', startDate: addDays(TODAY, -3) });
    expect(habitTrend(fresh, makeData([fresh]), ctx)).toBeNull();
  });

  it('needs only one opportunity per window for period goals', () => {
    const gym = habit({ name: 'Gym', type: 'check', period: 'week', target: 3, startDate: '2026-07-01' });
    const logs: Record<DayKey, LogEntry> = {};
    for (let i = 0; i < 28; i++) if (i % 2 === 0) logs[addDays(TODAY, -i)] = entry(1);
    const trend = habitTrend(gym, makeData([gym], { [gym.id]: logs }), ctx)!;
    expect(trend).not.toBeNull();
    expect(trend.measure).toBe('rate');
  });
});

describe('describeR', () => {
  it('describes each band in plain language', () => {
    expect(describeR(0)).toBe('no correlation');
    expect(describeR(0.05)).toBe('no correlation');
    expect(describeR(-0.09)).toBe('no correlation');
    expect(describeR(0.2)).toBe('weak positive');
    expect(describeR(-0.2)).toBe('weak negative');
    expect(describeR(0.35)).toBe('moderate positive');
    expect(describeR(-0.45)).toBe('moderate negative');
    expect(describeR(0.9)).toBe('strong positive');
    expect(describeR(-1)).toBe('strong negative');
  });
});

const BROKEN = /NaN|Infinity|undefined|null|\[object/;

function textOf(insight: Insight): string {
  return [insight.id, insight.title, insight.detail, ...(insight.stats ?? []).flatMap((s) => [s.label, s.value])].join(' | ');
}

function pairOf(insight: Insight): string {
  return [...insight.habitIds].sort().join('|');
}

describe('generateInsights', () => {
  const demo = generateDemoData(180, 7, { now: NOW });
  const demoCtx = makeCtx(demo.settings, NOW);
  const insights = generateInsights(demo, demoCtx);

  it('finds a good mix of insights in the demo data', () => {
    expect(insights.length).toBeGreaterThan(10);
    const kinds = new Set(insights.map((i) => i.kind));
    expect(kinds.has('correlation')).toBe(true);
    expect(kinds.has('streak')).toBe(true);
    expect(kinds.has('trend')).toBe(true);
    expect(kinds.has('weekday')).toBe(true);
    expect(kinds.size).toBeGreaterThanOrEqual(5);
  });

  it('is deterministic', () => {
    expect(generateInsights(demo, demoCtx)).toEqual(insights);
  });

  it('gives every insight a unique, stable, structured id', () => {
    const ids = insights.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const insight of insights) {
      expect(insight.id.startsWith(`${insight.kind}:`)).toBe(true);
      if (insight.kind === 'correlation') {
        const parts = insight.id.slice('correlation:'.length).split(':');
        expect(parts).toEqual([...parts].sort());
        expect(new Set(parts)).toEqual(new Set(insight.habitIds));
      }
    }
  });

  it('never repeats a habit pair within correlations or within lagged links', () => {
    for (const kind of ['correlation', 'lagged'] as const) {
      const pairs = insights.filter((i) => i.kind === kind).map(pairOf);
      expect(new Set(pairs).size).toBe(pairs.length);
    }
  });

  it('caps how often one habit shows up in correlations', () => {
    const counts = new Map<string, number>();
    for (const insight of insights) {
      if (insight.kind !== 'correlation' && insight.kind !== 'lagged') continue;
      for (const id of insight.habitIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const count of counts.values()) expect(count).toBeLessThanOrEqual(3);
  });

  it('is sorted by descending score', () => {
    for (let i = 1; i < insights.length; i++) {
      expect(insights[i].score).toBeLessThanOrEqual(insights[i - 1].score);
    }
    expect(insights[0].score).toBeGreaterThan(0);
  });

  it('ranks the strongest planted relationship first', () => {
    const sleepHours = demo.habits.find((h) => h.name === 'Sleep Hours')!;
    const goodSleep = demo.habits.find((h) => h.name === 'Good Sleep')!;
    expect(insights[0].kind).toBe('correlation');
    expect([...insights[0].habitIds].sort()).toEqual([goodSleep.id, sleepHours.id].sort());
  });

  it('writes complete, well-formed copy', () => {
    for (const insight of insights) {
      expect(insight.title.length).toBeGreaterThan(0);
      expect(insight.detail.length).toBeGreaterThan(0);
      expect(insight.habitIds.length).toBeGreaterThan(0);
      expect(['positive', 'negative', 'neutral']).toContain(insight.sentiment);
      expect(['low', 'medium', 'high']).toContain(insight.confidence);
      expect(Number.isFinite(insight.score)).toBe(true);
      expect(textOf(insight)).not.toMatch(BROKEN);
      for (const stat of insight.stats ?? []) {
        expect(stat.label.length).toBeGreaterThan(0);
        expect(stat.value.length).toBeGreaterThan(0);
      }
    }
  });

  it('only references habits that exist', () => {
    const ids = new Set(demo.habits.map((h) => h.id));
    for (const insight of insights) {
      for (const id of insight.habitIds) expect(ids.has(id)).toBe(true);
    }
  });

  it('filters to a single habit', () => {
    const gym = demo.habits.find((h) => h.name === 'Go to the Gym')!;
    const focused = generateInsights(demo, demoCtx, { habitId: gym.id });
    expect(focused.length).toBeGreaterThan(0);
    for (const insight of focused) expect(insight.habitIds).toContain(gym.id);
    expect(focused.some((i) => i.kind === 'correlation' || i.kind === 'lagged')).toBe(true);
  });

  it('returns nothing for an unknown habit id', () => {
    expect(generateInsights(demo, demoCtx, { habitId: 'nope' })).toEqual([]);
  });

  it('honours limit', () => {
    expect(generateInsights(demo, demoCtx, { limit: 5 })).toHaveLength(5);
    expect(generateInsights(demo, demoCtx, { limit: 0 })).toEqual([]);
    expect(generateInsights(demo, demoCtx, { limit: 5 })).toEqual(insights.slice(0, 5));
    expect(generateInsights(demo, demoCtx, { limit: 9999 }).length).toBe(insights.length);
  });

  it('returns nothing for an inverted range', () => {
    expect(generateInsights(demo, demoCtx, { start: '2026-09-10', end: '2026-01-01' })).toEqual([]);
  });

  it('finds no correlations in a range that is too short', () => {
    const narrow = generateInsights(demo, demoCtx, { start: addDays(TODAY, -4), end: TODAY });
    expect(narrow.every((i) => i.kind !== 'correlation' && i.kind !== 'lagged')).toBe(true);
  });

  it('finds nothing at all in an empty dataset', () => {
    expect(generateInsights(makeData([]), ctx)).toEqual([]);
  });

  it('survives a dataset with habits but no logs', () => {
    const a = habit({ name: 'A', type: 'check', startDate: TODAY });
    const b = metricHabit('B');
    expect(generateInsights(makeData([a, b]), ctx)).toEqual([]);
  });
});

describe('days with nothing logged', () => {
  // 60 days, both habits done every day except days the app wasn't opened at all
  const START = addDays(YESTERDAY, -59);
  const blank = new Set([3, 9, 17, 22, 31, 40, 44, 52].map((i) => addDays(START, i)));
  const floss = habit({ type: 'check', startDate: START });
  const gym = habit({ type: 'check', startDate: START });
  const doneExceptBlank = () => {
    const out: Record<DayKey, LogEntry> = {};
    for (let i = 0; i < 60; i++) {
      const day = addDays(START, i);
      if (!blank.has(day)) out[day] = entry(1);
    }
    return out;
  };

  it('are not read as both habits being skipped together', () => {
    const data = makeData([floss, gym], { [floss.id]: doneExceptBlank(), [gym.id]: doneExceptBlank() });
    expect(correlate(data, ctx, floss, gym, { start: START, end: YESTERDAY })).toBeNull();
  });

  it('still count as misses when something else was logged that day', () => {
    const journal = habit({ type: 'quantity', kind: 'metric' });
    const journalLogs: Record<DayKey, LogEntry> = {};
    for (const day of blank) journalLogs[day] = entry(1);
    const data = makeData([floss, gym, journal], {
      [floss.id]: doneExceptBlank(),
      [gym.id]: doneExceptBlank(),
      [journal.id]: journalLogs,
    });
    const result = correlate(data, ctx, floss, gym, { start: START, end: YESTERDAY });
    expect(result?.r).toBeCloseTo(1, 6);
    expect(result?.n).toBe(60);
  });
});

describe('noise guards', () => {
  it('ignores a single missed weekday', () => {
    const start = addDays(YESTERDAY, -28);
    const floss = habit({ type: 'check', startDate: start });
    const logs: Record<DayKey, LogEntry> = {};
    let skippedOne = false;
    for (let i = 0; i <= 28; i++) {
      const day = addDays(start, i);
      if (!skippedOne && weekday(day) === 2) {
        skippedOne = true;
        continue;
      }
      logs[day] = entry(1);
    }
    const insights = generateInsights(makeData([floss], { [floss.id]: logs }), ctx, { start });
    expect(insights.filter((i) => i.kind === 'weekday')).toEqual([]);
  });

  it('never celebrates the total of a limit', () => {
    const start = addDays(TODAY, -50);
    const coffee = habit({ type: 'quantity', direction: 'atMost', target: 2, unit: 'cups', startDate: start });
    const water = habit({ type: 'quantity', target: 2, unit: 'glasses', startDate: start });
    const twoADay = logDays(start, new Array(51).fill(2));
    const data = makeData([coffee, water], { [coffee.id]: twoADay, [water.id]: twoADay });
    const milestones = generateInsights(data, ctx).filter((i) => i.kind === 'milestone');
    expect(milestones.map((i) => i.habitIds[0])).toEqual([water.id]);
  });
});
