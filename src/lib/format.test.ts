import { describe, expect, it } from 'vitest';
import type { Habit, HabitType, StreakInfo } from '@/types';
import { blankHabit } from './defaults';
import {
  cheer, formatElapsed, formatGoal, formatHours, formatMinutes, formatNumber, formatPercent, formatStopwatch,
  formatStreak, formatValue, formatValueCompact, periodLabel, periodNoun, pluralize, scheduleLabel, typeDescription,
  typeLabel,
} from './format';

function habit(patch: Partial<Habit> = {}): Habit {
  return { ...blankHabit(0), name: 'Test', ...patch };
}

const HOUR = 3_600_000;
const MINUTE = 60_000;
const DAY = 24 * HOUR;

describe('numbers', () => {
  it('formatMinutes', () => {
    expect(formatMinutes(90)).toBe('1h 30m');
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(120)).toBe('2h');
    expect(formatMinutes(0)).toBe('0m');
    expect(formatMinutes(89.6)).toBe('1h 30m');
    expect(formatMinutes(6000)).toBe('100h');
    expect(formatMinutes(90, 'long')).toBe('1 hr 30 min');
    expect(formatMinutes(120, 'long')).toBe('2 hr');
    expect(formatMinutes(5, 'long')).toBe('5 min');
    expect(formatMinutes(Number.NaN)).toBe('0m');
    expect(formatMinutes(-30)).toBe('-30m');
  });

  it('formatHours', () => {
    expect(formatHours(90)).toBe('1.5h');
    expect(formatHours(120)).toBe('2h');
    expect(formatHours(100)).toBe('1.7h');
    expect(formatHours(0)).toBe('0h');
  });

  it('formatNumber', () => {
    expect(formatNumber(8000)).toBe('8,000');
    expect(formatNumber(2.5)).toBe('2.5');
    expect(formatNumber(2.5, 2)).toBe('2.5');
    expect(formatNumber(3)).toBe('3');
    expect(formatNumber(1234567.891, 2)).toBe('1,234,567.89');
    expect(formatNumber(2.25, 0)).toBe('2');
    expect(formatNumber(-0.01)).toBe('0');
    expect(formatNumber(Number.NaN)).toBe('0');
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('0');
  });

  it('formatPercent', () => {
    expect(formatPercent(0.834)).toBe('83%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.125, 1)).toBe('12.5%');
    expect(formatPercent(0.5, 1)).toBe('50.0%');
    expect(formatPercent(Number.NaN)).toBe('0%');
  });

  it('pluralize', () => {
    expect(pluralize(1, 'day')).toBe('1 day');
    expect(pluralize(3, 'day')).toBe('3 days');
    expect(pluralize(0, 'day')).toBe('0 days');
    expect(pluralize(2, 'glass', 'glasses')).toBe('2 glasses');
    expect(pluralize(2, 'glass')).toBe('2 glasses');
    expect(pluralize(4, 'entry')).toBe('4 entries');
    expect(pluralize(1000, 'day')).toBe('1,000 days');
  });
});

describe('values', () => {
  const check = habit({ type: 'check' });
  const water = habit({ type: 'quantity', target: 8, unit: 'glasses' });
  const km = habit({ type: 'quantity', target: 15, unit: 'km', period: 'week' });
  const plain = habit({ type: 'quantity', target: 3, unit: '' });
  const study = habit({ type: 'duration', target: 120 });
  const sleep = habit({ type: 'rating', target: 7, ratingMax: 10 });
  const quit = habit({ type: 'quit', target: 30 });

  it('formatValue', () => {
    expect(formatValue(check, 1)).toBe('Done');
    expect(formatValue(check, 0)).toBe('Not done');
    expect(formatValue(check, undefined)).toBe('Not done');
    expect(formatValue(water, 6)).toBe('6 glasses');
    expect(formatValue(water, 1)).toBe('1 glass');
    expect(formatValue(water, 2.5)).toBe('2.5 glasses');
    expect(formatValue(km, 1)).toBe('1 km');
    expect(formatValue(habit({ type: 'quantity', unit: 'meals' }), 1)).toBe('1 meal');
    expect(formatValue(habit({ type: 'quantity', unit: 'servings' }), 1)).toBe('1 serving');
    expect(formatValue(habit({ type: 'quantity', unit: 'series' }), 1)).toBe('1 series');
    expect(formatValue(plain, 6)).toBe('6');
    expect(formatValue(water, null)).toBe('—');
    expect(formatValue(study, 90)).toBe('1h 30m');
    expect(formatValue(sleep, 7)).toBe('7/10');
    expect(formatValue(quit, 5)).toBe('');
  });

  it('formatValueCompact', () => {
    expect(formatValueCompact(check, 1)).toBe('✓');
    expect(formatValueCompact(check, 0)).toBe('');
    expect(formatValueCompact(water, 6)).toBe('6');
    expect(formatValueCompact(water, 8000)).toBe('8k');
    expect(formatValueCompact(water, 12500)).toBe('12.5k');
    expect(formatValueCompact(study, 90)).toBe('1.5h');
    expect(formatValueCompact(study, 45)).toBe('45m');
    expect(formatValueCompact(sleep, 7)).toBe('7');
    expect(formatValueCompact(water, undefined)).toBe('');
    expect(formatValueCompact(quit, 3)).toBe('');
  });
});

describe('goals & schedules', () => {
  it('formatGoal', () => {
    expect(formatGoal(habit({ type: 'check' }))).toBe('Every day');
    expect(formatGoal(habit({ type: 'check', schedule: [1, 2, 3, 4, 5] }))).toBe('Weekdays');
    expect(formatGoal(habit({ type: 'check', period: 'week', target: 3 }))).toBe('3× per week');
    expect(formatGoal(habit({ type: 'check', period: 'month', target: 2 }))).toBe('2× per month');
    expect(formatGoal(habit({ type: 'quantity', target: 8, unit: 'glasses' }))).toBe('8 glasses per day');
    expect(formatGoal(habit({ type: 'quantity', target: 1, unit: 'glasses' }))).toBe('1 glass per day');
    expect(formatGoal(habit({ type: 'quantity', period: 'week', target: 15, unit: 'km' }))).toBe('15 km per week');
    expect(formatGoal(habit({ type: 'quantity', direction: 'atMost', target: 2, unit: 'cups' }))).toBe('At most 2 cups per day');
    expect(formatGoal(habit({ type: 'duration', target: 120 }))).toBe('2h per day');
    expect(formatGoal(habit({ type: 'duration', period: 'week', target: 300 }))).toBe('5h per week');
    expect(formatGoal(habit({ type: 'rating', target: 7, ratingMax: 10 }))).toBe('7+ out of 10');
    expect(formatGoal(habit({ type: 'rating', direction: 'atMost', target: 3, ratingMax: 10 }))).toBe('≤ 3 out of 10');
    expect(formatGoal(habit({ type: 'quit', target: 30 }))).toBe('30-day goal');
    expect(formatGoal(habit({ type: 'quit', target: 0 }))).toBe('Stay clean');
    expect(formatGoal(habit({ type: 'rating', kind: 'metric', target: 6 }))).toBe('Track only');
  });

  it('scheduleLabel', () => {
    expect(scheduleLabel(habit({ schedule: [0, 1, 2, 3, 4, 5, 6] }))).toBe('Every day');
    expect(scheduleLabel(habit({ schedule: [] }))).toBe('Every day');
    expect(scheduleLabel(habit({ schedule: [5, 4, 3, 2, 1] }))).toBe('Weekdays');
    expect(scheduleLabel(habit({ schedule: [6, 0] }))).toBe('Weekends');
    expect(scheduleLabel(habit({ schedule: [5, 1, 3] }))).toBe('Mon, Wed, Fri');
    expect(scheduleLabel(habit({ schedule: [0, 1] }), 1)).toBe('Mon, Sun');
    expect(scheduleLabel(habit({ schedule: [0, 1] }), 0)).toBe('Sun, Mon');
    expect(scheduleLabel(habit({ schedule: [1] }))).toBe('Every Monday');
    expect(scheduleLabel(habit({ schedule: [1, 2, 3, 4, 5, 6] }))).toBe('Every day but Sun');
    expect(scheduleLabel(habit({ period: 'week' }))).toBe('Weekly');
    expect(scheduleLabel(habit({ period: 'month' }))).toBe('Monthly');
    expect(scheduleLabel(habit({ type: 'rating', period: 'week' }))).toBe('Every day');
  });

  it('period & type labels', () => {
    expect(periodLabel('day')).toBe('Daily');
    expect(periodLabel('week')).toBe('Weekly');
    expect(periodLabel('month')).toBe('Monthly');
    expect(periodNoun('day')).toBe('today');
    expect(periodNoun('week')).toBe('this week');
    expect(periodNoun('month')).toBe('this month');
    expect(typeLabel('check')).toBe('Yes / No');
    expect(typeLabel('quantity')).toBe('Amount');
    expect(typeLabel('duration')).toBe('Time');
    expect(typeLabel('rating')).toBe('Rating');
    expect(typeLabel('quit')).toBe('Quit');
    const types: HabitType[] = ['check', 'quantity', 'duration', 'rating', 'quit'];
    const descriptions = types.map(typeDescription);
    expect(new Set(descriptions).size).toBe(types.length);
    for (const d of descriptions) expect(d.length).toBeGreaterThan(40);
  });
});

describe('time', () => {
  it('formatStreak', () => {
    expect(formatStreak({ current: 12, unit: 'day' })).toBe('12 days');
    expect(formatStreak({ current: 1, unit: 'month' })).toBe('1 month');
    expect(formatStreak({ current: 3, unit: 'week' })).toBe('3 weeks');
    expect(formatStreak({ current: 3, unit: 'day' }, 'best', 20)).toBe('20 days');
    const info: StreakInfo = { current: 2, best: 9, unit: 'week' };
    expect(formatStreak(info, 'best')).toBe('9 weeks');
  });

  it('formatElapsed', () => {
    const ms = 12 * DAY + 4 * HOUR + 23 * MINUTE + 9_000;
    expect(formatElapsed(ms, 'full')).toBe('12d 04h 23m 09s');
    expect(formatElapsed(ms)).toBe('12d 4h');
    expect(formatElapsed(ms, 'days')).toBe('12 days');
    expect(formatElapsed(4 * HOUR + 23 * MINUTE + 5_000)).toBe('4h 23m');
    expect(formatElapsed(23 * MINUTE + 59_999)).toBe('23m');
    expect(formatElapsed(42_500)).toBe('42s');
    expect(formatElapsed(-5_000)).toBe('0s');
    expect(formatElapsed(DAY + 1, 'days')).toBe('1 day');
    expect(formatElapsed(5 * MINUTE, 'full')).toBe('0d 00h 05m 00s');
  });

  it('formatStopwatch', () => {
    expect(formatStopwatch(HOUR + 2 * MINUTE + 9_000)).toBe('1:02:09');
    expect(formatStopwatch(2 * MINUTE + 9_400)).toBe('02:09');
    expect(formatStopwatch(0)).toBe('00:00');
    expect(formatStopwatch(-1)).toBe('00:00');
  });
});

describe('cheer', () => {
  const kinds = ['done', 'perfect', 'streak', 'relapse', 'empty', 'partial'] as const;

  it('is deterministic per seed', () => {
    for (const kind of kinds) expect(cheer(kind, '2026-09-17')).toBe(cheer(kind, '2026-09-17'));
  });

  it('offers at least 8 distinct, non-empty messages per kind', () => {
    for (const kind of kinds) {
      const seen = new Set<string>();
      for (let i = 0; i < 400; i++) seen.add(cheer(kind, `seed-${i}`));
      expect(seen.size).toBeGreaterThanOrEqual(8);
      for (const message of seen) expect(message.trim().length).toBeGreaterThan(5);
    }
  });

  it('kinds use different copy', () => {
    const done = new Set(Array.from({ length: 100 }, (_, i) => cheer('done', String(i))));
    const relapse = Array.from({ length: 100 }, (_, i) => cheer('relapse', String(i)));
    expect(relapse.some((m) => done.has(m))).toBe(false);
  });
});
