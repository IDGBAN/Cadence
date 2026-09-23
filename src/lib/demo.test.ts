import { describe, expect, it } from 'vitest';
import type { AppData, DayKey, Habit } from '@/types';
import { addDays, logicalDayOf } from './dates';
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from './defaults';
import { dayOverview, makeCtx, streakInfo } from './habitMath';
import { computeXp, levelFromXp } from './rewards';
import { compareOutcome, correlate, generateInsights, pearson, weekdayProfile } from './insights';
import { generateDemoData } from './demo';

// pinned clock so every assertion is reproducible

const NOW = new Date(2026, 8, 17, 12, 0, 0);
const TODAY = '2026-09-17';
const SPAN = 150;
const START = addDays(TODAY, -SPAN);

const demo = generateDemoData(SPAN, 7, { now: NOW });
const ctx = makeCtx(demo.settings, NOW);

function byName(data: AppData, name: string): Habit {
  const habit = data.habits.find((h) => h.name === name);
  if (!habit) throw new Error(`demo habit not found: ${name}`);
  return habit;
}

function entries(data: AppData) {
  return Object.entries(data.logs).flatMap(([habitId, byDay]) =>
    Object.entries(byDay).map(([day, entry]) => ({ habitId, day, entry })));
}

// timestamps depend on the clock, so compare values only
function valuesOnly(data: AppData): string {
  return JSON.stringify(Object.entries(data.logs).sort().map(([id, byDay]) =>
    [id, Object.entries(byDay).sort().map(([day, e]) => [day, e.value, e.note ?? '', e.skipped ?? false])]));
}

const RANGE = { start: START, end: TODAY };

describe('generateDemoData determinism', () => {
  it('returns deep-equal data for the same seed and clock', () => {
    expect(generateDemoData(SPAN, 7, { now: NOW })).toEqual(demo);
  });

  it('truncates a fractional seed', () => {
    expect(valuesOnly(generateDemoData(SPAN, 7.9, { now: NOW }))).toBe(valuesOnly(demo));
  });

  it('produces a different history for a different seed', () => {
    const other = generateDemoData(SPAN, 8, { now: NOW });
    expect(valuesOnly(other)).not.toBe(valuesOnly(demo));
    expect(other.habits.map((h) => h.id)).toEqual(demo.habits.map((h) => h.id));
  });

  it('logs the same values whatever time of day it runs', () => {
    const evening = generateDemoData(SPAN, 7, { now: new Date(2026, 8, 17, 21, 30) });
    expect(valuesOnly(evening)).toBe(valuesOnly(demo));
    expect(evening.relapses.map((r) => r.id)).toEqual(demo.relapses.map((r) => r.id));
  });

  it('clamps the requested span', () => {
    expect(generateDemoData(0, 1, { now: NOW }).habits[0].startDate).toBe(addDays(TODAY, -1));
    expect(generateDemoData(-20, 1, { now: NOW }).habits[0].startDate).toBe(addDays(TODAY, -1));
    expect(generateDemoData(Number.NaN, 1, { now: NOW }).habits[0].startDate).toBe(addDays(TODAY, -150));
    expect(generateDemoData(30.7, 1, { now: NOW }).habits[0].startDate).toBe(addDays(TODAY, -30));
  });

  it('falls back to the default settings for out-of-range options', () => {
    const bad = generateDemoData(30, 1, { now: NOW, dayStartHour: 9, weekStartsOn: 5 as 0 | 1 });
    expect(bad.settings.dayStartHour).toBe(DEFAULT_SETTINGS.dayStartHour);
    expect(bad.settings.weekStartsOn).toBe(DEFAULT_SETTINGS.weekStartsOn);
    const custom = generateDemoData(30, 1, { now: NOW, dayStartHour: 0, weekStartsOn: 0 });
    expect(custom.settings.dayStartHour).toBe(0);
    expect(custom.settings.weekStartsOn).toBe(0);
  });

  it('handles the smallest possible history without throwing', () => {
    const tiny = generateDemoData(1, 5, { now: NOW });
    expect(tiny.habits).toHaveLength(demo.habits.length);
    expect(tiny.relapses).toEqual([]);
    expect(Object.keys(tiny.logs).length).toBeGreaterThan(0);
  });
});

describe('generateDemoData shape', () => {
  it('builds the default habit set with stable demo ids', () => {
    expect(demo.habits.length).toBeGreaterThanOrEqual(16);
    const ids = demo.habits.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith('h_demo_')).toBe(true);
    expect(byName(demo, 'Go to the Gym').id).toBe('h_demo_gym');
    expect(byName(demo, 'No Doomscrolling').id).toBe('h_demo_no-doomscroll');
  });

  it('starts every habit at the beginning of the history', () => {
    for (const h of demo.habits) {
      expect(h.startDate).toBe(START);
      expect(h.archived).toBe(false);
      expect(h.createdAt).toBe(demo.habits[0].createdAt);
      expect(new Date(h.createdAt).getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
    expect(logicalDayOf(demo.habits[0].createdAt, demo.settings.dayStartHour)).toBe(START);
  });

  it('keeps the default categories and marks the app as onboarded', () => {
    expect(demo.categories.map((c) => c.id)).toEqual(DEFAULT_CATEGORIES.map((c) => c.id));
    expect(demo.meta.onboarded).toBe(true);
    expect(demo.version).toBeGreaterThan(0);
  });

  it('leaves no running timers', () => {
    expect(demo.timers).toEqual({});
  });

  it('starts with no unlocked achievements and a level the user has already seen', () => {
    expect(demo.rewards.unlocked).toEqual({});
    expect(demo.rewards.lastSeenLevel).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(demo.rewards.lastSeenLevel)).toBe(true);
    expect(demo.rewards.lastSeenLevel).toBe(levelFromXp(computeXp(demo, ctx).total).level);
  });

  it('only logs habits that exist, and never the quit habit', () => {
    const ids = new Set(demo.habits.map((h) => h.id));
    for (const habitId of Object.keys(demo.logs)) expect(ids.has(habitId)).toBe(true);
    expect(demo.logs[byName(demo, 'No Doomscrolling').id]).toBeUndefined();
    expect(Object.keys(demo.logs).length).toBeGreaterThanOrEqual(demo.habits.length - 1);
  });

  it('keeps every logged day inside the history and out of the future', () => {
    const all = entries(demo);
    expect(all.length).toBeGreaterThan(1000);
    for (const { day } of all) {
      expect(day >= START).toBe(true);
      expect(day <= TODAY).toBe(true);
      expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('writes sane values for every entry', () => {
    for (const { habitId, entry } of entries(demo)) {
      const habit = demo.habits.find((h) => h.id === habitId)!;
      expect(Number.isFinite(entry.value)).toBe(true);
      expect(entry.value).toBeGreaterThanOrEqual(0);
      if (entry.skipped) {
        expect(entry.value).toBe(0);
        expect(['Sick', 'Travel']).toContain(entry.note);
      } else if (habit.type === 'rating') {
        expect(entry.value).toBeGreaterThanOrEqual(1);
        expect(entry.value).toBeLessThanOrEqual(habit.ratingMax);
        expect(Number.isInteger(entry.value)).toBe(true);
      }
    }
  });

  it('timestamps every entry on its own logical day and never after now', () => {
    for (const { day, entry } of entries(demo)) {
      const ms = new Date(entry.updatedAt).getTime();
      expect(Number.isFinite(ms)).toBe(true);
      expect(ms).toBeLessThanOrEqual(NOW.getTime());
      expect(logicalDayOf(entry.updatedAt, demo.settings.dayStartHour)).toBe(day);
    }
  });

  it('includes skipped days for the sick spell and the trip', () => {
    const skipped = entries(demo).filter((e) => e.entry.skipped);
    expect(skipped.length).toBeGreaterThan(0);
    const notes = new Set(skipped.map((e) => e.entry.note));
    expect(notes.has('Sick')).toBe(true);
    expect(notes.has('Travel')).toBe(true);
  });

  it('writes journal notes on past days only', () => {
    const days = Object.keys(demo.dayNotes);
    expect(days.length).toBeGreaterThan(3);
    for (const day of days) {
      expect(day >= START).toBe(true);
      expect(day < TODAY).toBe(true);
      expect(demo.dayNotes[day].length).toBeGreaterThan(0);
    }
  });

  it('records the past perfect days so they are not re-celebrated', () => {
    const perfect = demo.rewards.celebratedPerfectDays;
    expect(perfect.length).toBeGreaterThan(0);
    expect([...perfect].sort()).toEqual(perfect);
    expect(new Set(perfect).size).toBe(perfect.length);
    for (const day of perfect) {
      expect(day >= START).toBe(true);
      expect(day < TODAY).toBe(true);
      expect(dayOverview(demo, day, ctx).perfect).toBe(true);
    }
  });
});

describe('generateDemoData relapses', () => {
  it('creates a handful, all belonging to the quit habit', () => {
    const quit = byName(demo, 'No Doomscrolling');
    expect(demo.relapses.length).toBeGreaterThanOrEqual(3);
    expect(demo.relapses.length).toBeLessThanOrEqual(5);
    for (const relapse of demo.relapses) {
      expect(relapse.habitId).toBe(quit.id);
      expect(relapse.id).toMatch(/^rel_demo_\d+$/);
      if (relapse.note !== undefined) expect(relapse.note.length).toBeGreaterThan(0);
    }
    expect(new Set(demo.relapses.map((r) => r.id)).size).toBe(demo.relapses.length);
  });

  it('sorts them and keeps them inside the history', () => {
    const times = demo.relapses.map((r) => new Date(r.at).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    for (const relapse of demo.relapses) {
      const day = logicalDayOf(relapse.at, demo.settings.dayStartHour);
      expect(day >= START).toBe(true);
      expect(day < TODAY).toBe(true);
      expect(new Date(relapse.at).getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
  });

  it('scales the count with the span', () => {
    expect(generateDemoData(10, 7, { now: NOW }).relapses.length).toBeLessThanOrEqual(1);
    expect(generateDemoData(30, 7, { now: NOW }).relapses.length).toBeLessThanOrEqual(3);
    expect(generateDemoData(200, 7, { now: NOW }).relapses.length).toBeGreaterThanOrEqual(3);
  });
});

describe('generateDemoData today', () => {
  it('leaves today partially logged so the Today page has something to do', () => {
    const overview = dayOverview(demo, TODAY, ctx);
    expect(overview.total).toBeGreaterThan(0);
    expect(overview.completed).toBeGreaterThan(0);
    expect(overview.completed).toBeLessThan(overview.total);
    expect(overview.perfect).toBe(false);
  });

  it('logs the morning routine but not the evening one', () => {
    const logged = (name: string) => demo.logs[byName(demo, name).id]?.[TODAY] !== undefined;
    expect(logged('Drink Water')).toBe(true);
    expect(logged('Brush Teeth')).toBe(true);
    expect(logged('Sleep Hours')).toBe(true);
    expect(logged('Mood')).toBe(false);
    expect(logged('Study')).toBe(false);
  });

  it('keeps a long Vitamin D streak running into today', () => {
    const streak = streakInfo(byName(demo, 'Vitamin D'), demo, ctx);
    expect(streak.unit).toBe('day');
    expect(streak.current).toBeGreaterThanOrEqual(30);
    expect(streak.current).toBe(streak.best);
  });
});

describe('generateDemoData relationships', () => {
  it('links sleep hours to sleep quality', () => {
    const result = correlate(demo, ctx, byName(demo, 'Sleep Hours'), byName(demo, 'Good Sleep'), RANGE)!;
    expect(result).not.toBeNull();
    expect(result.r).toBeGreaterThan(0.5);
    expect(result.strength).toBe('strong');
    expect(result.confidence).toBe('high');
    expect(result.n).toBeGreaterThan(100);
  });

  it('lifts mood on gym days', () => {
    const gym = byName(demo, 'Go to the Gym');
    const mood = byName(demo, 'Mood');
    const result = correlate(demo, ctx, gym, mood, RANGE)!;
    expect(result.r).toBeGreaterThan(0.2);
    expect(result.p).toBeLessThan(0.01);
    const comparison = compareOutcome(demo, ctx, gym, mood, RANGE)!;
    expect(comparison.split).toBe('done');
    expect(comparison.delta).toBeGreaterThan(0.8);
    expect(comparison.withN).toBeGreaterThanOrEqual(20);
    expect(comparison.withoutN).toBeGreaterThanOrEqual(20);
  });

  it('links good sleep to energy and to longer study sessions', () => {
    const goodSleep = byName(demo, 'Good Sleep');
    expect(correlate(demo, ctx, goodSleep, byName(demo, 'Energy'), RANGE)!.r).toBeGreaterThan(0.2);
    const study = compareOutcome(demo, ctx, goodSleep, byName(demo, 'Study'), RANGE)!;
    expect(study.split).toBe('goalMet');
    expect(study.threshold).toBe(7);
    expect(study.withAvg).toBeGreaterThan(study.withoutAvg);
  });

  it('costs the next night of sleep after a doomscrolling slip', () => {
    const quit = byName(demo, 'No Doomscrolling');
    const sleep = byName(demo, 'Sleep Hours');
    // the quit series is 1 on clean days, so a positive lag-1 r means slips cut the next night short
    const lagged = correlate(demo, ctx, quit, sleep, { ...RANGE, lag: 1 })!;
    expect(lagged).not.toBeNull();
    expect(lagged.r).toBeGreaterThan(0);
    const comparison = compareOutcome(demo, ctx, quit, sleep, { ...RANGE, lag: 1 })!;
    expect(comparison.split).toBe('clean');
    expect(comparison.withAvg).toBeGreaterThan(comparison.withoutAvg);
  });

  it('makes Monday the most common gym day', () => {
    const profile = weekdayProfile(byName(demo, 'Go to the Gym'), demo, ctx, START, TODAY);
    const rates = profile.map((s) => s.rate ?? 0);
    expect(Math.max(...rates)).toBe(rates[1]);
    expect(rates[1]).toBeGreaterThan(0.5);
  });

  it('dips on weekends for supplements and Duolingo', () => {
    for (const name of ['Magnesium', 'Vitamin C', 'Duolingo']) {
      const profile = weekdayProfile(byName(demo, name), demo, ctx, START, TODAY);
      const rate = (wd: number) => profile[wd].rate ?? 0;
      const weekend = (rate(0) + rate(6)) / 2;
      const weekdays = (rate(1) + rate(2) + rate(3) + rate(4) + rate(5)) / 5;
      expect(weekend).toBeLessThan(weekdays);
    }
  });

  it('correlates water with eating healthily', () => {
    // both come from a shared daily diet factor, so they line up whatever the seed
    for (const seed of [7, 8, 42]) {
      const data = seed === 7 ? demo : generateDemoData(SPAN, seed, { now: NOW });
      const water = byName(data, 'Drink Water');
      const healthy = byName(data, 'Eat Healthy');
      const xs: number[] = [];
      const ys: number[] = [];
      for (let day = START; day < TODAY; day = addDays(day, 1)) {
        const w = data.logs[water.id]?.[day];
        const h = data.logs[healthy.id]?.[day];
        if (w && !w.skipped && h && !h.skipped) {
          xs.push(w.value);
          ys.push(h.value);
        }
      }
      expect(xs.length).toBeGreaterThan(100);
      const raw = pearson(xs, ys)!;
      expect(raw.r).toBeGreaterThan(0.3);
    }
    // weaker through the engine, where unlogged water days count as 0
    expect(correlate(demo, ctx, byName(demo, 'Drink Water'), byName(demo, 'Eat Healthy'), RANGE)!.r)
      .toBeGreaterThan(0.1);
  });

  it('surfaces the planted links through generateInsights', () => {
    const insights = generateInsights(demo, ctx);
    expect(insights.length).toBeGreaterThan(8);
    const pairs = new Set(insights
      .filter((i) => i.kind === 'correlation' || i.kind === 'lagged')
      .map((i) => [...i.habitIds].sort().join('|')));
    const pair = (a: string, b: string) => [byName(demo, a).id, byName(demo, b).id].sort().join('|');
    expect(pairs.has(pair('Sleep Hours', 'Good Sleep'))).toBe(true);
    expect(pairs.has(pair('Go to the Gym', 'Mood'))).toBe(true);
    const ids = insights.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const insight of insights) {
      expect(`${insight.title} ${insight.detail}`).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  it('gives a fresh demo enough history for insights at other spans', () => {
    for (const span of [60, 365] as const) {
      const data = generateDemoData(span, 11, { now: NOW });
      const c = makeCtx(data.settings, NOW);
      const insights = generateInsights(data, c);
      expect(insights.length).toBeGreaterThan(0);
      for (const insight of insights) expect(insight.habitIds.length).toBeGreaterThan(0);
    }
  });
});

describe('generateDemoData consistency', () => {
  it('produces a day overview for every day of the history', () => {
    const days: DayKey[] = [];
    for (let d = START; d <= TODAY; d = addDays(d, 1)) days.push(d);
    expect(days).toHaveLength(SPAN + 1);
    let perfect = 0;
    for (const day of days) {
      const overview = dayOverview(demo, day, ctx);
      expect(overview.day).toBe(day);
      expect(overview.completed).toBeLessThanOrEqual(overview.total);
      expect(overview.progress).toBeGreaterThanOrEqual(0);
      expect(overview.progress).toBeLessThanOrEqual(1);
      if (overview.perfect) perfect++;
    }
    expect(perfect).toBeGreaterThan(0);
  });

  it('gives most goal habits a meaningful streak history', () => {
    const goals = demo.habits.filter((h) => h.kind === 'goal' && h.type !== 'quit');
    const withStreaks = goals.filter((h) => streakInfo(h, demo, ctx).best >= 3);
    expect(withStreaks.length).toBeGreaterThanOrEqual(goals.length - 2);
  });
});
