import { describe, expect, it } from 'vitest';
import type { AppData, DayKey, Habit, LogEntry } from '@/types';
import { blankHabit, createInitialData } from '@/lib/defaults';
import { dayOverview, makeCtx } from '@/lib/habitMath';
import { isUpNextToday } from './upNext';

// thursday; weeks start monday, so this week is 09-14 to 09-20
const NOW = new Date(2026, 8, 17, 12, 0, 0);
const TODAY: DayKey = '2026-09-17';
const ctx = makeCtx({ weekStartsOn: 1, dayStartHour: 0 }, NOW);

let seq = 0;

function habit(patch: Partial<Habit> = {}): Habit {
  seq += 1;
  return {
    ...blankHabit(seq),
    id: `h_${seq}`,
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

function makeData(habits: Habit[], logs: Record<string, Record<DayKey, LogEntry>> = {}): AppData {
  return { ...createInitialData(), habits, logs };
}

function upNext(data: AppData): string[] {
  return dayOverview(data, TODAY, ctx)
    .items.filter(isUpNextToday)
    .map((item) => item.habit.id);
}

describe('isUpNextToday', () => {
  it('lists due, unfinished daily habits only', () => {
    const due = habit({ name: 'Floss' });
    const done = habit({ name: 'Vitamin' });
    const notToday = habit({ name: 'Laundry', schedule: [0] }); // sundays only
    const data = makeData([due, done, notToday], { [done.id]: { [TODAY]: entry(1) } });

    expect(upNext(data)).toEqual([due.id]);
  });

  it('lists a weekly goal with sessions left', () => {
    const gym = habit({ name: 'Gym', type: 'check', period: 'week', target: 3 });
    const data = makeData([gym], { [gym.id]: { '2026-09-15': entry(1) } });

    const item = dayOverview(data, TODAY, ctx).items[0];
    expect(item.countsForDay).toBe(false);
    expect(upNext(data)).toEqual([gym.id]);
  });

  it('drops a weekly goal once it is met', () => {
    const gym = habit({ name: 'Gym', type: 'check', period: 'week', target: 3 });
    const data = makeData([gym], {
      [gym.id]: { '2026-09-14': entry(1), '2026-09-15': entry(1), '2026-09-16': entry(1) },
    });

    expect(upNext(data)).toEqual([]);
  });

  it('lists a metric until it is logged', () => {
    const weight = habit({ name: 'Weight', kind: 'metric', type: 'quantity', unit: 'kg' });
    const empty = makeData([weight]);
    expect(upNext(empty)).toEqual([weight.id]);

    const logged = makeData([weight], { [weight.id]: { [TODAY]: entry(72) } });
    expect(upNext(logged)).toEqual([]);
  });

  it('never lists quit habits', () => {
    const clean = habit({ name: 'No smoking', type: 'quit' });
    const data = makeData([clean]);

    expect(upNext(data)).toEqual([]);
  });

  it('drops anything skipped today', () => {
    const daily = habit({ name: 'Run' });
    const weekly = habit({ name: 'Gym', type: 'check', period: 'week', target: 3 });
    const metric = habit({ name: 'Weight', kind: 'metric', type: 'quantity' });
    const data = makeData([daily, weekly, metric], {
      [daily.id]: { [TODAY]: entry(0, { skipped: true }) },
      [weekly.id]: { [TODAY]: entry(0, { skipped: true }) },
      [metric.id]: { [TODAY]: entry(0, { skipped: true }) },
    });

    expect(upNext(data)).toEqual([]);
  });
});
