import { describe, expect, it } from 'vitest';
import type { AppData, DayKey, Habit, LogEntry, Relapse } from '@/types';
import { addDays } from './dates';
import { blankHabit, createInitialData } from './defaults';
import {
  activeHabits, completionRate, dailyValueSeries, dayCell, dayCells, dayOverview, getEntry,
  habitStartDay, habitSummary, isScheduledOn, makeCtx,
  overallCompletionSeries, periodProgress, periodsInRange, quitStats, relapsesFor, streakInfo, strengthSeries,
} from './habitMath';

// fixed clock: Thu 2026-09-17 12:00 local (Sep 14 is a Monday)
const NOW = new Date(2026, 8, 17, 12, 0, 0);
const TODAY = '2026-09-17';
const ctx = makeCtx({ weekStartsOn: 1, dayStartHour: 0 }, NOW);
const M_DAY = Math.pow(0.5, 1 / 14);
const M_WEEK = Math.pow(0.5, 1 / 4);

let seq = 0;

function habit(patch: Partial<Habit> = {}): Habit {
  seq += 1;
  return {
    ...blankHabit(seq),
    id: `h_test_${seq}`,
    name: `Habit ${seq}`,
    startDate: '2026-09-01',
    createdAt: new Date(2026, 8, 1, 9).toISOString(),
    quitStart: new Date(2026, 8, 1, 9).toISOString(),
    ...patch,
  };
}

function entry(value: number, extra: Partial<LogEntry> = {}): LogEntry {
  return { value, updatedAt: NOW.toISOString(), ...extra };
}

// local time, month is 1-based
function at(y: number, m: number, d: number, h = 12, min = 0): string {
  return new Date(y, m - 1, d, h, min).toISOString();
}

function makeData(
  habits: Habit[],
  logs: Record<string, Record<DayKey, LogEntry>> = {},
  relapses: Relapse[] = [],
): AppData {
  return { ...createInitialData(), habits, logs, relapses };
}

const strengthOf = (h: Habit, data: AppData) => habitSummary(h, data, ctx).strength;

function fill(from: DayKey, to: DayKey, value: number, into: Record<DayKey, LogEntry> = {}): Record<DayKey, LogEntry> {
  for (let d = from; d <= to; d = addDays(d, 1)) into[d] = entry(value);
  return into;
}

function relapse(habitId: string, iso: string, id = `r_${iso}`): Relapse {
  return { id, habitId, at: iso };
}

describe('makeCtx', () => {
  it('derives the logical day from dayStartHour', () => {
    const late = makeCtx({ weekStartsOn: 1, dayStartHour: 4 }, new Date(2026, 8, 18, 1, 30));
    expect(late.today).toBe('2026-09-17');
    const morning = makeCtx({ weekStartsOn: 0, dayStartHour: 4 }, new Date(2026, 8, 18, 4, 0));
    expect(morning.today).toBe('2026-09-18');
    expect(morning.weekStartsOn).toBe(0);
    expect(morning.dayStartHour).toBe(4);
  });

  it('keeps the provided clock', () => {
    expect(ctx.now).toBe(NOW);
    expect(ctx.today).toBe(TODAY);
  });
});

describe('lookups', () => {
  it('activeHabits drops archived habits and sorts by order', () => {
    const a = habit({ order: 2 });
    const b = habit({ order: 0, archived: true });
    const c = habit({ order: 1 });
    const data = makeData([a, b, c]);
    expect(activeHabits(data).map((h) => h.id)).toEqual([c.id, a.id]);
    expect(data.habits.map((h) => h.id)).toEqual([a.id, b.id, c.id]); // input untouched
  });

  it('getEntry reads (habit, day)', () => {
    const h = habit();
    const data = makeData([h], { [h.id]: { '2026-09-10': entry(3) } });
    expect(getEntry(data, h.id, '2026-09-10')?.value).toBe(3);
    expect(getEntry(data, h.id, '2026-09-11')).toBeUndefined();
    expect(getEntry(data, 'missing', '2026-09-10')).toBeUndefined();
  });

  it('relapsesFor filters by habit and sorts ascending by time', () => {
    const q = habit({ type: 'quit' });
    const late = relapse(q.id, at(2026, 9, 10));
    const early = relapse(q.id, at(2026, 9, 2));
    const other = relapse('someone_else', at(2026, 9, 5));
    const data = makeData([q], {}, [late, other, early]);
    expect(relapsesFor(data, q.id)).toEqual([early, late]);
    // returned array is a copy
    relapsesFor(data, q.id).pop();
    expect(relapsesFor(data, q.id)).toHaveLength(2);
  });
});

describe('habitStartDay', () => {
  it('defaults to startDate', () => {
    const h = habit({ startDate: '2026-09-10' });
    expect(habitStartDay(h, makeData([h]), ctx)).toBe('2026-09-10');
  });

  it('is pulled earlier by older logs but not later ones', () => {
    const h = habit({ startDate: '2026-09-10' });
    const data = makeData([h], { [h.id]: { '2026-09-05': entry(1), '2026-09-12': entry(1) } });
    expect(habitStartDay(h, data, ctx)).toBe('2026-09-05');
    // a new logs object with an older entry moves the start back
    const next: AppData = { ...data, logs: { [h.id]: { ...data.logs[h.id], '2026-08-20': entry(1) } } };
    expect(habitStartDay(h, next, ctx)).toBe('2026-08-20');
  });

  it('older logs change statuses before startDate', () => {
    const h = habit({ startDate: '2026-09-10' });
    const data = makeData([h], { [h.id]: { '2026-09-05': entry(1) } });
    expect(dayCell(h, data, '2026-09-04', ctx).status).toBe('beforeStart');
    expect(dayCell(h, data, '2026-09-05', ctx).status).toBe('done');
    expect(dayCell(h, data, '2026-09-06', ctx).status).toBe('missed');
  });

  it('uses the logical day of quitStart for quit habits', () => {
    const q = habit({ type: 'quit', startDate: '2026-09-10', quitStart: at(2026, 9, 1, 22) });
    expect(habitStartDay(q, makeData([q]), ctx)).toBe('2026-09-01');
    const ctx4 = makeCtx({ weekStartsOn: 1, dayStartHour: 4 }, NOW);
    const nightOwl = habit({ type: 'quit', startDate: '2026-09-10', quitStart: at(2026, 9, 2, 2) });
    expect(habitStartDay(nightOwl, makeData([nightOwl]), ctx4)).toBe('2026-09-01');
  });
});

describe('schedule & due', () => {
  it('isScheduledOn follows the weekday schedule for daily habits only', () => {
    const mwf = habit({ schedule: [1, 3, 5] });
    expect(isScheduledOn(mwf, '2026-09-14')).toBe(true); // Mon
    expect(isScheduledOn(mwf, '2026-09-15')).toBe(false); // Tue
    const weekly = habit({ period: 'week', target: 3, schedule: [1] });
    expect(isScheduledOn(weekly, '2026-09-15')).toBe(true);
    const empty = habit({ schedule: [] });
    expect(isScheduledOn(empty, '2026-09-15')).toBe(true);
  });

  it('treats days before the start date as not due', () => {
    const h = habit({ startDate: '2026-09-10', schedule: [1, 3, 5] });
    const data = makeData([h]);
    expect(dayCell(h, data, '2026-09-07', ctx).status).toBe('beforeStart'); // Mon
    expect(dayCell(h, data, '2026-09-14', ctx).status).toBe('missed');
    expect(dayCell(h, data, '2026-09-15', ctx).status).toBe('notDue'); // Tue
  });
});

describe('scoring a single past day', () => {
  const DAY = '2026-09-16';
  const check = habit({ type: 'check' });
  const water = habit({ type: 'quantity', target: 8, unit: 'glasses' });
  const zero = habit({ type: 'quantity', target: 0 });
  const coffee = habit({ type: 'quantity', direction: 'atMost', target: 2 });
  const sleep = habit({ type: 'rating', target: 7 });
  const stress = habit({ type: 'rating', direction: 'atMost', target: 3 });
  const gym = habit({ type: 'check', period: 'week', target: 3 });
  const mood = habit({ type: 'rating', kind: 'metric', target: 6 });

  const cell = (h: Habit, e: LogEntry | undefined) =>
    dayCell(h, makeData([h], e ? { [h.id]: { [DAY]: e } } : {}), DAY, ctx);
  const outcome = (h: Habit, e: LogEntry | undefined) => {
    const c = cell(h, e);
    return [c.status, c.progress];
  };

  it('scores check, atLeast and atMost entries', () => {
    expect(outcome(check, entry(1))).toEqual(['done', 1]);
    expect(outcome(check, entry(0))).toEqual(['missed', 0]);
    expect(outcome(check, undefined)).toEqual(['missed', 0]);
    expect(outcome(water, entry(4))).toEqual(['partial', 0.5]);
    expect(outcome(water, entry(12))).toEqual(['done', 1]);
    expect(outcome(zero, entry(0))).toEqual(['done', 1]);
    expect(outcome(coffee, entry(0))).toEqual(['done', 1]);
    expect(outcome(coffee, entry(2))).toEqual(['done', 1]);
    expect(outcome(coffee, entry(3))).toEqual(['missed', 0.5]);
    expect(outcome(coffee, entry(6))).toEqual(['missed', 0]);
    expect(outcome(coffee, undefined)).toEqual(['missed', 0]);
    expect(outcome(water, entry(8, { skipped: true }))).toEqual(['skipped', 0]);
  });

  it('decides success per goal type', () => {
    expect(cell(water, entry(7.5)).status).toBe('partial');
    expect(cell(sleep, entry(7)).status).toBe('done');
    expect(cell(sleep, entry(6)).status).toBe('partial');
    expect(cell(gym, entry(1)).status).toBe('done');
    expect(cell(mood, entry(9)).status).toBe('logged');
  });

  it('never counts an unrated rating entry as a success', () => {
    const noteOnly = entry(0, { note: 'rough night' });
    expect(cell(stress, entry(2)).status).toBe('done');
    expect(cell(stress, noteOnly).status).toBe('missed');
    expect(cell(sleep, noteOnly).status).toBe('missed');
    const data = makeData([stress], { [stress.id]: { [DAY]: noteOnly } });
    expect(streakInfo(stress, data, ctx).current).toBe(0);
    expect(habitSummary(stress, data, ctx).totalLoggedDays).toBe(0);
    const [point] = overallCompletionSeries(data, DAY, DAY, ctx);
    expect(point.completed).toBe(0);
  });
});

describe('dayCell (daily habits)', () => {
  const water = habit({ type: 'quantity', target: 8, unit: 'glasses' });
  const waterData = makeData([water], {
    [water.id]: {
      '2026-09-13': entry(8, { skipped: true, note: 'Sick' }),
      '2026-09-15': entry(8),
      '2026-09-16': entry(3, { note: 'busy' }),
      '2026-09-18': entry(8),
    },
  });

  it('covers done / partial / missed / pending / future / beforeStart / skipped', () => {
    expect(dayCell(water, waterData, '2026-09-15', ctx)).toMatchObject({ status: 'done', value: 8, progress: 1 });
    expect(dayCell(water, waterData, '2026-09-16', ctx)).toMatchObject({ status: 'partial', value: 3, note: 'busy', progress: 0.375 });
    expect(dayCell(water, waterData, '2026-09-14', ctx)).toMatchObject({ status: 'missed', progress: 0 });
    expect(dayCell(water, waterData, TODAY, ctx).status).toBe('pending');
    expect(dayCell(water, waterData, '2026-09-18', ctx).status).toBe('future');
    expect(dayCell(water, waterData, '2026-08-31', ctx).status).toBe('beforeStart');
    expect(dayCell(water, waterData, '2026-09-13', ctx)).toMatchObject({ status: 'skipped', note: 'Sick', progress: 0 });
  });

  it('today with a partial value is partial, not pending', () => {
    const data = makeData([water], { [water.id]: { [TODAY]: entry(2) } });
    expect(dayCell(water, data, TODAY, ctx)).toMatchObject({ status: 'partial', progress: 0.25 });
  });

  it('handles non-due days and bonus completions', () => {
    const mwf = habit({ type: 'check', schedule: [1, 3, 5] });
    const data = makeData([mwf], { [mwf.id]: { '2026-09-15': entry(1) } });
    expect(dayCell(mwf, data, '2026-09-16', ctx).status).toBe('missed'); // Wed, due
    expect(dayCell(mwf, data, '2026-09-12', ctx).status).toBe('notDue'); // Sat
    expect(dayCell(mwf, data, '2026-09-15', ctx).status).toBe('done'); // Tue bonus
  });

  it('check value 0 is pending today and missed in the past', () => {
    const c = habit({ type: 'check' });
    const data = makeData([c], { [c.id]: { [TODAY]: entry(0, { note: 'later' }), '2026-09-16': entry(0, { note: 'no' }) } });
    expect(dayCell(c, data, TODAY, ctx).status).toBe('pending');
    expect(dayCell(c, data, '2026-09-16', ctx).status).toBe('missed');
  });

  it('atMost goals: zero is a success, over the limit is missed (even today)', () => {
    const coffee = habit({ type: 'quantity', direction: 'atMost', target: 2, unit: 'cups' });
    const data = makeData([coffee], {
      [coffee.id]: { '2026-09-15': entry(0), '2026-09-16': entry(2), [TODAY]: entry(3) },
    });
    expect(dayCell(coffee, data, '2026-09-15', ctx).status).toBe('done');
    expect(dayCell(coffee, data, '2026-09-16', ctx).status).toBe('done');
    expect(dayCell(coffee, data, TODAY, ctx)).toMatchObject({ status: 'missed', progress: 0.5 });
    expect(dayCell(coffee, data, '2026-09-14', ctx).status).toBe('missed');
    const fresh = makeData([coffee]);
    expect(dayCell(coffee, fresh, TODAY, ctx).status).toBe('pending');
  });

  it('rating thresholds', () => {
    const sleep = habit({ type: 'rating', target: 7, ratingMax: 10 });
    const data = makeData([sleep], { [sleep.id]: { '2026-09-15': entry(8), '2026-09-16': entry(6) } });
    expect(dayCell(sleep, data, '2026-09-15', ctx).status).toBe('done');
    expect(dayCell(sleep, data, '2026-09-16', ctx)).toMatchObject({ status: 'partial' });
    expect(dayCell(sleep, data, '2026-09-16', ctx).progress).toBeCloseTo(6 / 7, 10);
  });

  it('dayCells matches dayCell for every day in range', () => {
    const cells = dayCells(water, waterData, '2026-08-30', '2026-09-19', ctx);
    expect(cells).toHaveLength(21);
    expect(cells[0].day).toBe('2026-08-30');
    expect(cells[20].day).toBe('2026-09-19');
    for (const cell of cells) expect(cell).toEqual(dayCell(water, waterData, cell.day, ctx));
    expect(dayCells(water, waterData, '2026-09-10', '2026-09-01', ctx)).toEqual([]);
  });
});

describe('daily streaks', () => {
  it('counts back from today with today pending', () => {
    const h = habit({ type: 'check' });
    const logs = fill('2026-09-02', '2026-09-06', 1);
    fill('2026-09-10', '2026-09-16', 1, logs);
    const data = makeData([h], { [h.id]: logs });
    expect(streakInfo(h, data, ctx)).toEqual({
      current: 7, best: 7, unit: 'day', currentStart: '2026-09-10', bestStart: '2026-09-10', bestEnd: '2026-09-16',
    });
    const withToday = makeData([h], { [h.id]: { ...logs, [TODAY]: entry(1) } });
    expect(streakInfo(h, withToday, ctx).current).toBe(8);
  });

  it('passes through non-due days; bonus days neither extend nor break', () => {
    const mwf = habit({ type: 'check', schedule: [1, 3, 5], startDate: '2026-09-05' });
    const logs: Record<DayKey, LogEntry> = {
      '2026-09-07': entry(1), '2026-09-09': entry(1), '2026-09-11': entry(1), '2026-09-14': entry(1), '2026-09-16': entry(1),
    };
    const data = makeData([mwf], { [mwf.id]: logs });
    expect(streakInfo(mwf, data, ctx).current).toBe(5);
    const bonus = makeData([mwf], { [mwf.id]: { ...logs, '2026-09-12': entry(1) } });
    expect(streakInfo(mwf, bonus, ctx)).toMatchObject({ current: 5, best: 5, currentStart: '2026-09-07' });
  });

  it('passes through skipped days', () => {
    const h = habit({ type: 'check', startDate: '2026-09-10' });
    const logs = fill('2026-09-10', '2026-09-16', 1);
    logs['2026-09-13'] = entry(0, { skipped: true });
    const data = makeData([h], { [h.id]: logs });
    expect(streakInfo(h, data, ctx).current).toBe(6);
  });

  it('a past partial breaks the streak, but today in progress does not', () => {
    const water = habit({ type: 'quantity', target: 8, startDate: '2026-09-14' });
    const data = makeData([water], {
      [water.id]: { '2026-09-14': entry(8), '2026-09-15': entry(3), '2026-09-16': entry(8), [TODAY]: entry(2) },
    });
    expect(streakInfo(water, data, ctx)).toEqual({
      current: 1, best: 1, unit: 'day', currentStart: '2026-09-16', bestStart: '2026-09-16', bestEnd: '2026-09-16',
    });
  });

  it('an atMost goal already over its limit today breaks the streak', () => {
    const coffee = habit({ type: 'quantity', direction: 'atMost', target: 2, startDate: '2026-09-14' });
    const data = makeData([coffee], {
      [coffee.id]: { '2026-09-14': entry(1), '2026-09-15': entry(0), '2026-09-16': entry(2), [TODAY]: entry(5) },
    });
    const s = streakInfo(coffee, data, ctx);
    expect(s.current).toBe(0);
    expect(s.currentStart).toBeUndefined();
    expect(s.best).toBe(3);
    expect(s.bestStart).toBe('2026-09-14');
  });

  it('keeps the best run when the current one is shorter', () => {
    const h = habit({ type: 'check', startDate: '2026-08-01' });
    const logs = fill('2026-08-01', '2026-08-20', 1);
    fill('2026-09-15', '2026-09-16', 1, logs);
    const s = streakInfo(h, makeData([h], { [h.id]: logs }), ctx);
    expect(s).toMatchObject({ current: 2, best: 20, bestStart: '2026-08-01', bestEnd: '2026-08-20', currentStart: '2026-09-15' });
  });
});

describe('daily completion rate', () => {
  const h = habit({ type: 'check' });
  const logs = fill('2026-09-02', '2026-09-06', 1);
  fill('2026-09-10', '2026-09-16', 1, logs);
  const data = makeData([h], { [h.id]: logs });

  it('excludes today while pending, includes it once done', () => {
    expect(completionRate(h, data, '2026-09-01', TODAY, ctx)).toEqual({ rate: 0.75, successes: 12, opportunities: 16 });
    const done = makeData([h], { [h.id]: { ...logs, [TODAY]: entry(1) } });
    expect(completionRate(h, done, '2026-09-01', TODAY, ctx)).toEqual({ rate: 13 / 17, successes: 13, opportunities: 17 });
  });

  it('clips the range to [habitStart, today]', () => {
    expect(completionRate(h, data, '2026-01-01', '2026-12-31', ctx).opportunities).toBe(16);
    expect(completionRate(h, data, '2026-07-01', '2026-07-31', ctx)).toEqual({ rate: 0, successes: 0, opportunities: 0 });
  });

  it('ignores skipped, not-due and bonus days', () => {
    const mwf = habit({ type: 'check', schedule: [1, 3, 5], startDate: '2026-09-05' });
    const d = makeData([mwf], {
      [mwf.id]: {
        '2026-09-07': entry(1), '2026-09-09': entry(0, { skipped: true }), '2026-09-11': entry(1),
        '2026-09-12': entry(1), '2026-09-14': entry(1),
      },
    });
    // due: 7, 9 (skipped), 11, 14, 16 (missed) → 3 / 4
    expect(completionRate(mwf, d, '2026-09-05', TODAY, ctx)).toEqual({ rate: 0.75, successes: 3, opportunities: 4 });
  });
});

describe('strength', () => {
  it('rises with adherence following the EMA', () => {
    const h = habit({ type: 'check', startDate: '2026-08-01' });
    const data = makeData([h], { [h.id]: fill('2026-08-01', '2026-09-16', 1) }); // 47 days, today pending
    expect(strengthOf(h, data)).toBeCloseTo(1 - Math.pow(M_DAY, 47), 10);
    const series = strengthSeries(h, data, '2026-08-01', TODAY, ctx);
    for (let i = 1; i < series.length; i++) expect(series[i].value).toBeGreaterThanOrEqual(series[i - 1].value);
    expect(series[series.length - 1].value).toBeCloseTo(strengthOf(h, data), 12);
  });

  it('decays after misses', () => {
    const h = habit({ type: 'check', startDate: '2026-08-01' });
    const data = makeData([h], { [h.id]: fill('2026-08-01', '2026-09-06', 1) });
    const series = strengthSeries(h, data, '2026-09-06', '2026-09-16', ctx);
    expect(series[0].value).toBeCloseTo(1 - Math.pow(M_DAY, 37), 10);
    expect(series[10].value).toBeCloseTo((1 - Math.pow(M_DAY, 37)) * Math.pow(M_DAY, 10), 10);
    expect(strengthOf(h, data)).toBeLessThan(series[0].value);
  });

  it('skipped and non-due days leave strength unchanged; carries forward past today', () => {
    const h = habit({ type: 'check', startDate: '2026-09-10' });
    const logs = fill('2026-09-10', '2026-09-16', 1);
    logs['2026-09-12'] = entry(0, { skipped: true });
    const data = makeData([h], { [h.id]: logs });
    expect(strengthOf(h, data)).toBeCloseTo(1 - Math.pow(M_DAY, 6), 10);
    const series = strengthSeries(h, data, '2026-09-08', '2026-09-20', ctx);
    expect(series[0].value).toBe(0); // before start
    expect(series[4].value).toBe(series[3].value); // Sep 12 skipped
    expect(series[12].value).toBe(series[9].value); // Sep 20 carries today's value
  });

  it('is 0 for metrics', () => {
    const mood = habit({ type: 'rating', kind: 'metric' });
    const data = makeData([mood], { [mood.id]: fill('2026-09-01', TODAY, 8) });
    expect(strengthOf(mood, data)).toBe(0);
  });
});

describe('weekly habits', () => {
  // 3x a week, weeks start Monday: Aug 31-Sep 6 hit (3), Sep 7-13 missed (2), Sep 14-20 current (1 so far)
  const gym = habit({ type: 'check', period: 'week', target: 3, startDate: '2026-08-31' });
  const baseLogs: Record<DayKey, LogEntry> = {
    '2026-09-01': entry(1), '2026-09-03': entry(1), '2026-09-05': entry(1),
    '2026-09-08': entry(1), '2026-09-10': entry(1),
    '2026-09-14': entry(1),
  };
  const data = makeData([gym], { [gym.id]: baseLogs });

  it('computes period progress', () => {
    expect(periodProgress(gym, data, '2026-09-03', ctx)).toEqual({
      start: '2026-08-31', end: '2026-09-06', achieved: 3, target: 3, progress: 1, success: true, current: false, skipped: false,
    });
    const now = periodProgress(gym, data, TODAY, ctx);
    expect(now).toMatchObject({ start: '2026-09-14', end: '2026-09-20', achieved: 1, target: 3, success: false, current: true });
    expect(now.progress).toBeCloseTo(1 / 3, 10);
  });

  it('day cells are done / empty', () => {
    expect(dayCell(gym, data, '2026-09-01', ctx)).toMatchObject({ status: 'done', progress: 1 });
    expect(dayCell(gym, data, '2026-09-02', ctx)).toMatchObject({ status: 'empty', progress: 0 });
    expect(dayCell(gym, data, '2026-08-30', ctx).status).toBe('beforeStart');
  });

  it('respects weekStartsOn', () => {
    const logs = { '2026-09-13': entry(1), '2026-09-14': entry(1) };
    const d = makeData([gym], { [gym.id]: logs });
    const ctxSun = makeCtx({ weekStartsOn: 0, dayStartHour: 0 }, NOW);
    expect(periodProgress(gym, d, TODAY, ctxSun)).toMatchObject({ start: '2026-09-13', end: '2026-09-19', achieved: 2 });
    expect(periodProgress(gym, d, TODAY, ctx)).toMatchObject({ start: '2026-09-14', end: '2026-09-20', achieved: 1 });
  });

  it('the current unfinished week does not break the streak', () => {
    expect(streakInfo(gym, data, ctx)).toMatchObject({ current: 0, best: 1, unit: 'week' });
    const better = makeData([gym], { [gym.id]: { ...baseLogs, '2026-09-12': entry(1) } });
    expect(streakInfo(gym, better, ctx)).toEqual({
      current: 2, best: 2, unit: 'week', currentStart: '2026-08-31', bestStart: '2026-08-31', bestEnd: '2026-09-13',
    });
    const allDone = makeData([gym], { [gym.id]: { ...baseLogs, '2026-09-12': entry(1), '2026-09-15': entry(1), '2026-09-16': entry(1) } });
    expect(streakInfo(gym, allDone, ctx).current).toBe(3);
  });

  it('completion rate excludes the current week unless it already succeeded', () => {
    expect(completionRate(gym, data, '2026-08-31', TODAY, ctx)).toEqual({ rate: 0.5, successes: 1, opportunities: 2 });
    const allDone = makeData([gym], { [gym.id]: { ...baseLogs, '2026-09-15': entry(1), '2026-09-16': entry(1) } });
    expect(completionRate(gym, allDone, '2026-08-31', TODAY, ctx)).toEqual({ rate: 2 / 3, successes: 2, opportunities: 3 });
  });

  it('skipped days reduce the target (ceil for check habits)', () => {
    const twoOff = makeData([gym], {
      [gym.id]: { ...baseLogs, '2026-09-12': entry(0, { skipped: true }), '2026-09-13': entry(0, { skipped: true }) },
    });
    expect(periodProgress(gym, twoOff, '2026-09-08', ctx)).toMatchObject({ target: 3, success: false });
    const fourOff = makeData([gym], {
      [gym.id]: {
        ...baseLogs,
        '2026-09-10': entry(1, { skipped: true }), '2026-09-11': entry(0, { skipped: true }),
        '2026-09-12': entry(0, { skipped: true }), '2026-09-13': entry(0, { skipped: true }),
        '2026-09-09': entry(1),
      },
    });
    // only Mon-Wed active, so target = ceil(3*3/7) = 2. Sep 10 is skipped, its value doesn't count
    expect(periodProgress(gym, fourOff, '2026-09-08', ctx)).toMatchObject({ target: 2, achieved: 2, success: true, progress: 1 });
  });

  it('a fully skipped week is neutral', () => {
    const logs = { ...baseLogs };
    for (let d = '2026-09-07'; d <= '2026-09-13'; d = addDays(d, 1)) logs[d] = entry(0, { skipped: true });
    const d = makeData([gym], { [gym.id]: logs });
    expect(periodProgress(gym, d, '2026-09-09', ctx)).toMatchObject({ skipped: true, success: false, target: 0, progress: 0 });
    expect(streakInfo(gym, d, ctx).current).toBe(1); // skipped week passes through to Aug 31 week
    expect(completionRate(gym, d, '2026-08-31', TODAY, ctx).opportunities).toBe(1);
  });

  it('future skipped days lower the current target; future-dated logs do not count', () => {
    const d = makeData([gym], {
      [gym.id]: {
        '2026-09-14': entry(1), '2026-09-19': entry(1),
        '2026-09-18': entry(0, { skipped: true }), '2026-09-20': entry(0, { skipped: true }),
      },
    });
    // Sep 18 and 20 skipped, target still ceil(3*5/7) = 3. Sep 19 is in the future so it doesn't count yet
    expect(periodProgress(gym, d, TODAY, ctx)).toMatchObject({ achieved: 1, target: 3 });
  });

  it('prorates the first week when the habit starts mid-week', () => {
    const lateGym = habit({ type: 'check', period: 'week', target: 3, startDate: '2026-09-05' }); // Sat
    const d = makeData([lateGym], { [lateGym.id]: { '2026-09-06': entry(1) } });
    expect(periodProgress(lateGym, d, '2026-09-06', ctx)).toMatchObject({
      start: '2026-08-31', target: 1, achieved: 1, success: true,
    });
    const periods = periodsInRange(lateGym, d, '2026-08-01', '2026-12-31', ctx);
    expect(periods.map((p) => p.start)).toEqual(['2026-08-31', '2026-09-07', '2026-09-14']);
    expect(periods[2].current).toBe(true);
  });

  it('atMost weekly totals need at least one entry', () => {
    const drinks = habit({ type: 'quantity', period: 'week', direction: 'atMost', target: 14, startDate: '2026-08-31' });
    const d = makeData([drinks], {
      [drinks.id]: { '2026-09-01': entry(5), '2026-09-04': entry(4), '2026-09-15': entry(20) },
    });
    expect(periodProgress(drinks, d, '2026-09-02', ctx)).toMatchObject({ achieved: 9, success: true, progress: 1 });
    expect(periodProgress(drinks, d, '2026-09-09', ctx)).toMatchObject({ achieved: 0, success: false, progress: 0 });
    expect(periodProgress(drinks, d, TODAY, ctx)).toMatchObject({ achieved: 20, success: false });
  });

  it('strength uses completed periods (and a successful current one)', () => {
    const expected = (1 - M_WEEK) * M_WEEK + (2 / 3) * (1 - M_WEEK);
    expect(strengthOf(gym, data)).toBeCloseTo(expected, 10);
    const series = strengthSeries(gym, data, '2026-09-05', TODAY, ctx);
    expect(series[0].value).toBe(0); // Sep 5: first week not finished yet
    expect(series[1].value).toBeCloseTo(1 - M_WEEK, 10); // Sep 6: week closed
    expect(series[series.length - 1].value).toBeCloseTo(expected, 10);
  });
});

describe('monthly habits', () => {
  const run = habit({ type: 'quantity', period: 'month', target: 30, unit: 'km', startDate: '2026-07-01' });
  const logs: Record<DayKey, LogEntry> = {
    '2026-07-10': entry(10), '2026-07-20': entry(25),
    '2026-08-05': entry(10), '2026-08-31': entry(5),
    '2026-09-01': entry(12),
  };
  const data = makeData([run], { [run.id]: logs });

  it('sums values inside calendar months', () => {
    expect(periodProgress(run, data, '2026-07-31', ctx)).toMatchObject({ start: '2026-07-01', end: '2026-07-31', achieved: 35, success: true });
    expect(periodProgress(run, data, '2026-08-15', ctx)).toMatchObject({ start: '2026-08-01', end: '2026-08-31', achieved: 15, target: 30, success: false });
    const sep = periodProgress(run, data, TODAY, ctx);
    expect(sep).toMatchObject({ start: '2026-09-01', end: '2026-09-30', achieved: 12, current: true });
    expect(sep.progress).toBeCloseTo(0.4, 10);
  });

  it('adjusts quantity targets for skipped days without rounding', () => {
    const skipLogs = { ...logs };
    for (let d = '2026-08-01'; d <= '2026-08-10'; d = addDays(d, 1)) skipLogs[d] = entry(0, { skipped: true });
    const d = makeData([run], { [run.id]: skipLogs });
    const aug = periodProgress(run, d, '2026-08-20', ctx);
    expect(aug.target).toBeCloseTo((30 * 21) / 31, 10);
    expect(aug.achieved).toBe(5); // Aug 5 was skipped
  });

  it('prorates a mid-month start and counts streaks in months', () => {
    const late = habit({ type: 'quantity', period: 'month', target: 30, startDate: '2026-07-17' });
    const d = makeData([late], { [late.id]: { '2026-07-20': entry(15), '2026-08-02': entry(31) } });
    const jul = periodProgress(late, d, '2026-07-20', ctx);
    expect(jul.target).toBeCloseTo((30 * 15) / 31, 10);
    expect(jul.success).toBe(true);
    expect(streakInfo(late, d, ctx)).toMatchObject({ current: 2, best: 2, unit: 'month', currentStart: '2026-07-01' });
    expect(streakInfo(run, data, ctx)).toMatchObject({ current: 0, best: 1, unit: 'month' });
  });
});

describe('quit habits', () => {
  const quit = habit({ type: 'quit', target: 30, startDate: '2026-08-01', quitStart: at(2026, 8, 1, 9) });
  const r1 = relapse(quit.id, at(2026, 8, 11, 21), 'r1');
  const r2 = relapse(quit.id, at(2026, 8, 31, 23), 'r2');
  const r3 = relapse(quit.id, at(2026, 9, 10, 8), 'r3');
  const data = makeData([quit], {}, [r3, r1, r2]);

  it('day statuses', () => {
    expect(dayCell(quit, data, '2026-07-31', ctx).status).toBe('beforeStart');
    expect(dayCell(quit, data, '2026-08-11', ctx)).toMatchObject({ status: 'missed', progress: 0 });
    expect(dayCell(quit, data, '2026-08-12', ctx)).toMatchObject({ status: 'done', progress: 1 });
    expect(dayCell(quit, data, TODAY, ctx).status).toBe('done');
    expect(dayCell(quit, data, '2026-09-18', ctx).status).toBe('future');
  });

  it('current and best runs across multiple relapses', () => {
    // runs: 10d12h, 20d2h, 9d9h, current 7d4h
    expect(streakInfo(quit, data, ctx)).toEqual({
      current: 7, best: 20, unit: 'day', currentStart: '2026-09-10', bestStart: '2026-08-11', bestEnd: '2026-08-31',
    });
  });

  it('uses the live clock from ctx.now', () => {
    const later = makeCtx({ weekStartsOn: 1, dayStartHour: 0 }, new Date(2026, 8, 20, 12));
    expect(streakInfo(quit, data, later)).toMatchObject({ current: 10, best: 20 });
    const muchLater = makeCtx({ weekStartsOn: 1, dayStartHour: 0 }, new Date(2026, 9, 5, 12));
    expect(streakInfo(quit, data, muchLater)).toMatchObject({ current: 25, best: 25, bestStart: '2026-09-10', bestEnd: '2026-10-05' });
    // relapses after ctx.now don't count yet
    const beforeR3 = makeCtx({ weekStartsOn: 1, dayStartHour: 0 }, new Date(2026, 8, 10, 7));
    expect(quitStats(quit, data, beforeR3).relapseCount).toBe(2);
  });

  it('quitStats', () => {
    const s = quitStats(quit, data, ctx);
    expect(s.currentDays).toBe(7);
    expect(s.bestDays).toBe(20);
    expect(s.currentMs).toBe(NOW.getTime() - Date.parse(r3.at));
    expect(s.runStartedAt).toBe(r3.at);
    expect(s.relapseCount).toBe(3);
    expect(s.attempts).toBe(4);
    expect(s.lastRelapse).toBe(r3);
    expect(Object.keys(s.relapsesByDay).sort()).toEqual(['2026-08-11', '2026-08-31', '2026-09-10']);
    expect(s.relapsesByDay['2026-08-31']).toEqual([r2]);
    expect(s.milestone.previous).toBe(7);
    expect(s.milestone.next).toBe(14);
    expect(s.milestone.progress).toBeGreaterThan(0);
    expect(s.milestone.progress).toBeLessThan(0.1);
    expect(s.cleanRate).toBeCloseTo(45 / 48, 10);
    expect(s.averageRunDays).toBeCloseTo((NOW.getTime() - Date.parse(quit.quitStart)) / 4 / 86_400_000, 10);
  });

  it('milestones include the habit target and continue past the ladder', () => {
    const tenDay = habit({ type: 'quit', target: 10, quitStart: at(2026, 9, 9, 9) });
    const m = quitStats(tenDay, makeData([tenDay]), ctx).milestone;
    expect(m).toMatchObject({ previous: 7, next: 10 });
    const veteran = habit({ type: 'quit', target: 0, quitStart: at(2022, 6, 1, 9) });
    const v = quitStats(veteran, makeData([veteran]), ctx);
    expect(v.relapseCount).toBe(0);
    expect(v.runStartedAt).toBe(veteran.quitStart);
    expect(v.milestone).toMatchObject({ previous: 1460, next: 1825 });
  });

  it('ignores relapses before quitStart for runs but lists them', () => {
    const old = relapse(quit.id, at(2026, 7, 20), 'r0');
    const d = makeData([quit], {}, [r1, r2, r3, old]);
    const s = quitStats(quit, d, ctx);
    expect(s.relapseCount).toBe(3);
    expect(s.relapsesByDay['2026-07-20']).toEqual([old]);
    expect(dayCell(quit, d, '2026-07-20', ctx).status).toBe('beforeStart');
  });

  it('completion rate counts clean days including today', () => {
    expect(completionRate(quit, data, '2026-09-01', TODAY, ctx)).toEqual({ rate: 16 / 17, successes: 16, opportunities: 17 });
  });

  it('relapse days follow dayStartHour', () => {
    const q = habit({ type: 'quit', quitStart: at(2026, 9, 1, 9) });
    const d = makeData([q], {}, [relapse(q.id, at(2026, 9, 15, 1, 30))]);
    const ctx4 = makeCtx({ weekStartsOn: 1, dayStartHour: 4 }, NOW);
    expect(dayCell(q, d, '2026-09-14', ctx4).status).toBe('missed');
    expect(dayCell(q, d, '2026-09-15', ctx4).status).toBe('done');
    expect(dayCell(q, d, '2026-09-15', ctx).status).toBe('missed');
  });

  it('strength is lowered by relapses and summary uses clean days', () => {
    const clean = makeData([quit]);
    expect(strengthOf(quit, clean)).toBeCloseTo(1 - Math.pow(M_DAY, 48), 10);
    expect(strengthOf(quit, data)).toBeLessThan(strengthOf(quit, clean));
    const summary = habitSummary(quit, data, ctx);
    expect(summary.totalSuccesses).toBe(45);
    expect(summary.completionRate).toBeCloseTo(quitStats(quit, data, ctx).cleanRate, 12);
    expect(summary.streak.current).toBe(7);
  });

  it('picks up new relapses through immutable updates', () => {
    const r4 = relapse(quit.id, at(2026, 9, 16, 10), 'r4');
    const next: AppData = { ...data, relapses: [...data.relapses, r4] };
    expect(streakInfo(quit, next, ctx).current).toBe(1);
    expect(streakInfo(quit, data, ctx).current).toBe(7);
  });
});

describe('metric habits', () => {
  const mood = habit({ type: 'rating', kind: 'metric', target: 6, startDate: '2026-09-10' });
  const data = makeData([mood], {
    [mood.id]: {
      '2026-09-10': entry(7), '2026-09-12': entry(5), '2026-09-14': entry(8),
      '2026-09-15': entry(0, { note: 'note only' }), '2026-09-16': entry(6, { skipped: true }),
    },
  });

  it('cells are logged / empty (skips stay skipped)', () => {
    expect(dayCell(mood, data, '2026-09-10', ctx)).toMatchObject({ status: 'logged', progress: 1 });
    expect(dayCell(mood, data, '2026-09-11', ctx)).toMatchObject({ status: 'empty', progress: 0 });
    expect(dayCell(mood, data, '2026-09-15', ctx).status).toBe('empty');
    expect(dayCell(mood, data, '2026-09-16', ctx).status).toBe('skipped');
  });

  it('have no streaks and a logging rate', () => {
    expect(streakInfo(mood, data, ctx)).toEqual({ current: 0, best: 0, unit: 'day' });
    // Sep 10..16 minus skipped Sep 16 = 6 days, today not logged → 3 / 6
    expect(completionRate(mood, data, '2026-09-01', TODAY, ctx)).toEqual({ rate: 0.5, successes: 3, opportunities: 6 });
    const summary = habitSummary(mood, data, ctx);
    expect(summary.totalSuccesses).toBe(0);
    expect(summary.totalLoggedDays).toBe(3);
    expect(summary.averageValue).toBeCloseTo(20 / 3, 10);
    expect(summary.totalValue).toBeCloseTo(20 / 3, 10);
    expect(summary.strength).toBe(0);
  });
});

describe('dailyValueSeries', () => {
  it('check (daily) follows the schedule', () => {
    const mwf = habit({ type: 'check', schedule: [1, 3, 5], startDate: '2026-09-05' });
    const data = makeData([mwf], { [mwf.id]: { '2026-09-14': entry(1), '2026-09-15': entry(1) } });
    const values = dailyValueSeries(mwf, data, '2026-09-04', '2026-09-18', ctx).map((v) => v.value);
    // Sep 4 (before start), 5 Sat, 6 Sun, 7 Mon, 8 Tue, 9 Wed, 10 Thu, 11 Fri, 12 Sat, 13 Sun, 14 Mon ✓, 15 Tue bonus, 16 Wed, 17 today (not due), 18 future
    expect(values).toEqual([null, null, null, 0, null, 0, null, 0, null, null, 1, 1, 0, null, null]);
    const daily = habit({ type: 'check' });
    const pending = makeData([daily], { [daily.id]: { [TODAY]: entry(0, { note: 'soon' }) } });
    expect(dailyValueSeries(daily, pending, TODAY, TODAY, ctx)[0].value).toBeNull();
  });

  it('check (period) counts past days as 0/1 and today only when logged', () => {
    const gym = habit({ type: 'check', period: 'week', target: 3 });
    const data = makeData([gym], { [gym.id]: { '2026-09-15': entry(1) } });
    expect(dailyValueSeries(gym, data, '2026-09-15', TODAY, ctx).map((v) => v.value)).toEqual([1, 0, null]);
    const logged = makeData([gym], { [gym.id]: { [TODAY]: entry(1) } });
    expect(dailyValueSeries(gym, logged, TODAY, TODAY, ctx)[0].value).toBe(1);
  });

  it('quantity: value, 0 for past due days, null otherwise', () => {
    const water = habit({ type: 'quantity', target: 8, startDate: '2026-09-14' });
    const data = makeData([water], { [water.id]: { '2026-09-14': entry(6), '2026-09-15': entry(8, { skipped: true }) } });
    expect(dailyValueSeries(water, data, '2026-09-13', '2026-09-18', ctx).map((v) => v.value)).toEqual([null, 6, null, 0, null, null]);
    const steps = habit({ type: 'quantity', kind: 'metric', startDate: '2026-09-14' });
    const metricData = makeData([steps], { [steps.id]: { '2026-09-15': entry(9000) } });
    expect(dailyValueSeries(steps, metricData, '2026-09-14', '2026-09-16', ctx).map((v) => v.value)).toEqual([null, 9000, null]);
  });

  it('rating only returns logged scores', () => {
    const sleep = habit({ type: 'rating', target: 7, startDate: '2026-09-14' });
    const data = makeData([sleep], { [sleep.id]: { '2026-09-14': entry(8), '2026-09-16': entry(0, { note: 'n/a' }) } });
    expect(dailyValueSeries(sleep, data, '2026-09-14', TODAY, ctx).map((v) => v.value)).toEqual([8, null, null, null]);
  });

  it('quit: 0 on relapse days, 1 otherwise (today included)', () => {
    const q = habit({ type: 'quit', quitStart: at(2026, 9, 14, 8) });
    const data = makeData([q], {}, [relapse(q.id, at(2026, 9, 15, 20))]);
    expect(dailyValueSeries(q, data, '2026-09-13', '2026-09-18', ctx).map((v) => v.value)).toEqual([null, 1, 0, 1, 1, null]);
  });
});

describe('dayOverview', () => {
  const vitamin = habit({ type: 'check', order: 0 });
  const water = habit({ type: 'quantity', target: 8, order: 1 });
  const mwf = habit({ type: 'check', schedule: [1, 3, 5], order: 2 });
  const gym = habit({ type: 'check', period: 'week', target: 3, order: 3 });
  const quit = habit({ type: 'quit', order: 4 });
  const mood = habit({ type: 'rating', kind: 'metric', order: 5 });
  const archived = habit({ type: 'check', order: 6, archived: true });
  const future = habit({ type: 'check', order: 7, startDate: '2026-09-20' });
  const habits = [future, archived, mood, quit, gym, mwf, water, vitamin];

  const logs = {
    [vitamin.id]: { [TODAY]: entry(1) },
    [water.id]: { [TODAY]: entry(8) },
    [gym.id]: { [TODAY]: entry(1) },
    [mood.id]: { [TODAY]: entry(7) },
  };

  it('builds a perfect day from due daily goal habits', () => {
    const o = dayOverview(makeData(habits, logs), TODAY, ctx);
    expect(o.items.map((i) => i.habit.id)).toEqual([vitamin.id, water.id, mwf.id, gym.id, quit.id, mood.id]);
    expect(o).toMatchObject({ day: TODAY, total: 2, completed: 2, progress: 1, perfect: true });
    const byId = new Map(o.items.map((i) => [i.habit.id, i]));
    expect(byId.get(mwf.id)).toMatchObject({ countsForDay: false, completeForDay: false });
    expect(byId.get(mwf.id)?.cell.status).toBe('notDue');
    expect(byId.get(gym.id)).toMatchObject({ countsForDay: false, completeForDay: true });
    expect(byId.get(gym.id)?.period).toMatchObject({ start: '2026-09-14', achieved: 1, target: 3 });
    expect(byId.get(quit.id)).toMatchObject({ countsForDay: false, completeForDay: true });
    expect(byId.get(mood.id)).toMatchObject({ countsForDay: false, completeForDay: true });
    expect(byId.get(water.id)?.period).toMatchObject({ start: TODAY, end: TODAY, achieved: 8, target: 8, success: true, current: true });
  });

  it('partial progress and skipped habits', () => {
    const partial = dayOverview(makeData(habits, { ...logs, [water.id]: { [TODAY]: entry(3) } }), TODAY, ctx);
    expect(partial).toMatchObject({ total: 2, completed: 1, progress: 0.5, perfect: false });
    const skipped = dayOverview(makeData(habits, { ...logs, [water.id]: { [TODAY]: entry(0, { skipped: true }) } }), TODAY, ctx);
    expect(skipped).toMatchObject({ total: 1, completed: 1, perfect: true });
    const nothing = dayOverview(makeData([mood, gym]), TODAY, ctx);
    expect(nothing).toMatchObject({ total: 0, completed: 0, progress: 0, perfect: false });
  });

  it('includes a habit from its start day on', () => {
    const o = dayOverview(makeData(habits, logs), '2026-09-21', ctx);
    expect(o.items.some((i) => i.habit.id === future.id)).toBe(true);
  });
});

describe('overallCompletionSeries', () => {
  it('rates daily goal habits per day', () => {
    const a = habit({ type: 'check', order: 0, startDate: '2026-09-14' });
    const b = habit({ type: 'check', order: 1, startDate: '2026-09-14', schedule: [2, 3, 4] }); // Tue-Thu
    const gym = habit({ type: 'check', period: 'week', target: 3, order: 2 });
    const data = makeData([a, b, gym], {
      [a.id]: { '2026-09-14': entry(1), '2026-09-15': entry(1), '2026-09-16': entry(1) },
      [b.id]: { '2026-09-16': entry(1) },
      [gym.id]: { '2026-09-15': entry(1) },
    });
    expect(overallCompletionSeries(data, '2026-09-13', '2026-09-18', ctx)).toEqual([
      { day: '2026-09-13', rate: null, completed: 0, total: 0 },
      { day: '2026-09-14', rate: 1, completed: 1, total: 1 },
      { day: '2026-09-15', rate: 0.5, completed: 1, total: 2 },
      { day: '2026-09-16', rate: 1, completed: 2, total: 2 },
      { day: TODAY, rate: 0, completed: 0, total: 2 },
      { day: '2026-09-18', rate: null, completed: 0, total: 0 },
    ]);
  });
});

describe('habitSummary', () => {
  it('matches the individual functions for a daily habit', () => {
    const h = habit({ type: 'check' });
    const logs = fill('2026-09-02', '2026-09-06', 1);
    fill('2026-09-10', '2026-09-16', 1, logs);
    const data = makeData([h], { [h.id]: logs });
    const s = habitSummary(h, data, ctx);
    expect(s.habitId).toBe(h.id);
    expect(s.streak).toEqual(streakInfo(h, data, ctx));
    expect(s.completionRate).toBe(0.75);
    expect(s.completionRate30).toBe(completionRate(h, data, addDays(TODAY, -29), TODAY, ctx).rate);
    expect(s.completionRate7).toBe(1);
    expect(s.totalSuccesses).toBe(12);
    expect(s.totalLoggedDays).toBe(12);
    expect(s.totalValue).toBe(0);
    expect(s.strength).toBeCloseTo(strengthSeries(h, data, TODAY, TODAY, ctx)[0].value, 12);
  });

  it('totals for quantity and period habits', () => {
    const water = habit({ type: 'quantity', target: 8, startDate: '2026-09-14' });
    const data = makeData([water], { [water.id]: { '2026-09-14': entry(6), '2026-09-15': entry(10), [TODAY]: entry(2) } });
    const s = habitSummary(water, data, ctx);
    expect(s).toMatchObject({ totalLoggedDays: 3, totalValue: 18, averageValue: 6, totalSuccesses: 1 });
    expect(s.completionRate).toBeCloseTo(1 / 3, 10);

    const gym = habit({ type: 'check', period: 'week', target: 1, startDate: '2026-08-31' });
    const gymData = makeData([gym], { [gym.id]: { '2026-09-02': entry(1), '2026-09-09': entry(1), [TODAY]: entry(1) } });
    const g = habitSummary(gym, gymData, ctx);
    expect(g).toMatchObject({ totalSuccesses: 3, totalLoggedDays: 3, completionRate: 1, completionRate7: 1 });
    expect(g.streak).toMatchObject({ current: 3, unit: 'week' });
  });

  it('stays fast with 20 habits over 2 years', () => {
    const habits: Habit[] = [];
    const logs: Record<string, Record<DayKey, LogEntry>> = {};
    const start = addDays(TODAY, -730);
    const kinds: Array<Partial<Habit>> = [
      { type: 'check' }, { type: 'quantity', target: 8 }, { type: 'duration', target: 120 },
      { type: 'rating', target: 7 }, { type: 'check', period: 'week', target: 3 },
      { type: 'quantity', period: 'month', target: 60 }, { type: 'check', schedule: [1, 3, 5] },
      { type: 'quantity', direction: 'atMost', target: 2 }, { type: 'rating', kind: 'metric' }, { type: 'quit' },
    ];
    for (let i = 0; i < 20; i++) {
      const h = habit({ ...kinds[i % kinds.length], startDate: start, quitStart: at(2024, 9, 17, 9) });
      habits.push(h);
      const map: Record<DayKey, LogEntry> = {};
      let d = start;
      for (let k = 0; k <= 730; k++, d = addDays(d, 1)) {
        if ((k * 7 + i * 3) % 10 < 7) map[d] = entry(((k + i) % 9) + 1);
      }
      logs[h.id] = map;
    }
    const data = makeData(habits, logs);
    // warm up the JIT first
    for (const h of habits) habitSummary(h, data, ctx);
    const t0 = performance.now();
    for (const h of habits) habitSummary(h, data, ctx);
    const elapsed = performance.now() - t0;
    // ~30ms locally; loose bound so slow CI doesn't flake
    expect(elapsed).toBeLessThan(250);
  });
});

describe('at-most goals and period edge cases', () => {
  it('judges an at-most weekly goal on the week, not on each day', () => {
    const drinks = habit({ type: 'quantity', period: 'week', direction: 'atMost', target: 14 });
    const data = makeData([drinks], { [drinks.id]: { '2026-09-15': entry(6), '2026-09-16': entry(0) } });
    expect(dayCell(drinks, data, '2026-09-15', ctx).status).toBe('logged');
    expect(dayCell(drinks, data, '2026-09-16', ctx).status).toBe('logged');
    expect(dayCell(drinks, data, '2026-09-14', ctx).status).toBe('empty');

    const within = makeData([drinks], { [drinks.id]: { [TODAY]: entry(3) } });
    const over = makeData([drinks], { [drinks.id]: { [TODAY]: entry(20) } });
    expect(dayOverview(within, TODAY, ctx).items[0].completeForDay).toBe(true);
    expect(dayOverview(over, TODAY, ctx).items[0].completeForDay).toBe(false);
  });

  it('caps a check target at the days the month actually has', () => {
    const daily = habit({ type: 'check', period: 'month', target: 31, startDate: '2026-02-01' });
    const logs = fill('2026-02-01', '2026-02-28', 1);
    fill('2026-06-01', '2026-06-30', 1, logs);
    const data = makeData([daily], { [daily.id]: logs });
    expect(periodProgress(daily, data, '2026-02-10', ctx)).toMatchObject({ target: 28, achieved: 28, success: true });
    expect(periodProgress(daily, data, '2026-06-10', ctx)).toMatchObject({ target: 30, achieved: 30, success: true });
  });

  it('ignores an excused day before the start date', () => {
    const h = habit({ type: 'check', startDate: '2026-09-10' });
    const logs = fill('2026-09-10', '2026-09-16', 1);
    logs['2026-09-05'] = entry(0, { skipped: true, note: 'Sick' });
    const data = makeData([h], { [h.id]: logs });
    expect(habitStartDay(h, data, ctx)).toBe('2026-09-10');
    expect(completionRate(h, data, '2026-09-01', '2026-09-16', ctx)).toMatchObject({ successes: 7, opportunities: 7 });
  });

  it('leaves forgotten days of a daily limit out of the value series', () => {
    const coffee = habit({ type: 'quantity', direction: 'atMost', target: 2 });
    const data = makeData([coffee], { [coffee.id]: { '2026-09-15': entry(5) } });
    expect(dailyValueSeries(coffee, data, '2026-09-14', '2026-09-16', ctx).map((p) => p.value)).toEqual([null, 5, null]);
  });

  it('counts a limit broken today in the rate as well as the streak', () => {
    const coffee = habit({ type: 'quantity', direction: 'atMost', target: 2, startDate: '2026-09-14' });
    const data = makeData([coffee], { [coffee.id]: { ...fill('2026-09-14', '2026-09-16', 1), [TODAY]: entry(5) } });
    expect(streakInfo(coffee, data, ctx).current).toBe(0);
    expect(completionRate(coffee, data, '2026-09-14', TODAY, ctx)).toMatchObject({ successes: 3, opportunities: 4 });
  });

  it('counts a week in only one of two back-to-back windows', () => {
    const gym = habit({ type: 'check', period: 'week', target: 1, startDate: '2026-08-03' });
    const data = makeData([gym], { [gym.id]: { '2026-08-18': entry(1) } });
    const earlier = completionRate(gym, data, '2026-08-10', '2026-08-19', ctx);
    const later = completionRate(gym, data, '2026-08-20', '2026-08-30', ctx);
    expect(earlier).toMatchObject({ successes: 0, opportunities: 1 });
    expect(later).toMatchObject({ successes: 1, opportunities: 2 });
  });
});
