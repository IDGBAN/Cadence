import { describe, expect, it } from 'vitest';
import type { AppData, DayKey, Habit, LogEntry, Relapse } from '@/types';
import { addDays } from './dates';
import { blankHabit, createInitialData } from './defaults';
import { dayOverview, makeCtx, quitStats, streakInfo } from './habitMath';
import {
  ACHIEVEMENTS, TIER_XP, achievementById, computeXp, evaluateAchievements, findNewlyUnlocked, levelFromXp,
  levelTitle, perfectDays, xpForLevel,
  type AchievementStatus,
} from './rewards';

// fixed clock: Thu 2026-09-17 12:00 local. Sep 7 and Sep 14 are Mondays, Sep 12-13 a weekend

const NOW = new Date(2026, 8, 17, 12, 0, 0);
const TODAY = '2026-09-17';
const ctx = makeCtx({ weekStartsOn: 1, dayStartHour: 0 }, NOW);

let seq = 0;

function habit(patch: Partial<Habit> = {}): Habit {
  seq += 1;
  return {
    ...blankHabit(seq),
    id: `h_rw_${seq}`,
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

// month is 1-based
function at(y: number, m: number, d: number, h = 12, min = 0): string {
  return new Date(y, m - 1, d, h, min).toISOString();
}

function makeData(
  habits: Habit[],
  logs: Record<string, Record<DayKey, LogEntry>> = {},
  relapses: Relapse[] = [],
  patch: Partial<AppData> = {},
): AppData {
  return { ...createInitialData(), habits, logs, relapses, ...patch };
}

function fill(from: DayKey, to: DayKey, value: number, into: Record<DayKey, LogEntry> = {}): Record<DayKey, LogEntry> {
  for (let d = from; d <= to; d = addDays(d, 1)) into[d] = entry(value);
  return into;
}

function relapse(habitId: string, iso: string): Relapse {
  return { id: `r_${habitId}_${iso}`, habitId, at: iso };
}

function statusOf(data: AppData, id: string, c = ctx): AchievementStatus {
  const status = evaluateAchievements(data, c).find((s) => s.def.id === id);
  if (!status) throw new Error(`unknown achievement ${id}`);
  return status;
}

function unlockedIds(data: AppData): string[] {
  return evaluateAchievements(data, ctx).filter((s) => s.unlocked).map((s) => s.def.id);
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('level curve', () => {
  it('xpForLevel follows 50 * (L-1) * L', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(300);
    expect(xpForLevel(4)).toBe(600);
    expect(xpForLevel(5)).toBe(1000);
    expect(xpForLevel(10)).toBe(4500);
    expect(xpForLevel(20)).toBe(19000);
    expect(xpForLevel(50)).toBe(122500);
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(Number.NaN)).toBe(0);
  });

  it('levelFromXp resolves level boundaries', () => {
    const cases: Array<[number, number]> = [
      [0, 1], [99, 1], [100, 2], [299, 2], [300, 3], [599, 3], [600, 4], [999, 4], [1000, 5],
      [4499, 9], [4500, 10], [18999, 19], [19000, 20], [122499, 49], [122500, 50],
    ];
    for (const [xp, level] of cases) expect(levelFromXp(xp).level, `xp ${xp}`).toBe(level);
  });

  it('levelFromXp matches the curve definition everywhere', () => {
    for (let xp = 0; xp <= 60000; xp += 7) {
      const { level } = levelFromXp(xp);
      expect(xpForLevel(level) <= xp && xp < xpForLevel(level + 1), `xp ${xp}`).toBe(true);
    }
  });

  it('levelFromXp reports progress inside the level', () => {
    expect(levelFromXp(0)).toEqual({
      level: 1, title: 'Seedling', xp: 0, levelStartXp: 0, nextLevelXp: 100, intoLevel: 0, levelSpan: 100, progress: 0,
    });
    expect(levelFromXp(1150)).toEqual({
      level: 5, title: 'Starter', xp: 1150, levelStartXp: 1000, nextLevelXp: 1500, intoLevel: 150, levelSpan: 500, progress: 0.3,
    });
  });

  it('levelFromXp sanitizes invalid totals', () => {
    for (const xp of [-50, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(levelFromXp(xp)).toMatchObject({ level: 1, xp: 0, progress: 0 });
    }
  });

  it('levelTitle uses the level bands', () => {
    const cases: Array<[number, string]> = [
      [1, 'Seedling'], [2, 'Seedling'], [3, 'Sprout'], [5, 'Starter'], [7, 'Starter'], [8, 'Regular'],
      [12, 'Committed'], [16, 'Disciplined'], [20, 'Relentless'], [25, 'Unstoppable'], [30, 'Master'],
      [39, 'Master'], [40, 'Grandmaster'], [50, 'Legend'], [75, 'Mythic'], [100, 'Transcendent'], [250, 'Transcendent'],
    ];
    for (const [level, title] of cases) expect(levelTitle(level), `level ${level}`).toBe(title);
  });
});

describe('computeXp: daily habits', () => {
  it('awards 10 XP per done day plus the weekly streak bonus', () => {
    const h = habit({ startDate: '2026-09-11' });
    const xp = computeXp(makeData([h], { [h.id]: fill('2026-09-11', TODAY, 1) }), ctx);
    expect(xp.byDay).toEqual({
      '2026-09-11': 10, '2026-09-12': 10, '2026-09-13': 10, '2026-09-14': 10, '2026-09-15': 10, '2026-09-16': 10,
      '2026-09-17': 12,
    });
    expect(xp.total).toBe(72);
    expect(xp.today).toBe(12);
    expect(xp.byHabit).toEqual({ [h.id]: 72, __achievements: 0, __perfect: 0, __notes: 0 });
  });

  it('caps the streak bonus at +10', () => {
    const start = addDays(TODAY, -49);
    const h = habit({ startDate: start });
    const xp = computeXp(makeData([h], { [h.id]: fill(start, TODAY, 1) }), ctx);
    // runs 1-6: +0, 7-13: +2, 14-20: +4, 21-27: +6, 28-34: +8, 35-50: +10
    expect(xp.total).toBe(60 + 7 * 12 + 7 * 14 + 7 * 16 + 7 * 18 + 16 * 20);
    expect(xp.today).toBe(20);
  });

  it('awards round(5 * dayScore) for partial days, which reset the running streak', () => {
    const h = habit({ type: 'quantity', target: 8, unit: 'glasses' });
    const logs = fill('2026-09-01', '2026-09-07', 8);
    logs['2026-09-08'] = entry(4);
    logs['2026-09-09'] = entry(8);
    const data = makeData([h], { [h.id]: logs });
    const xp = computeXp(data, ctx);
    expect(xp.byDay['2026-09-07']).toBe(12);
    expect(xp.byDay['2026-09-08']).toBe(3); // round(2.5)
    expect(xp.byDay['2026-09-09']).toBe(10); // streak restarted at 1
    expect(xp.total).toBe(72 + 3 + 10);
    expect(xp.today).toBe(0); // pending

    const partialToday = makeData([h], { [h.id]: { ...logs, [TODAY]: entry(3) } });
    expect(computeXp(partialToday, ctx).today).toBe(2); // round(1.875)
  });

  it('gives 5 XP for bonus days and nothing for skipped days, neither breaking the streak', () => {
    const h = habit({ startDate: '2026-09-07', schedule: [1, 2, 3, 4, 5] });
    const logs = fill('2026-09-07', '2026-09-11', 1);
    logs['2026-09-12'] = entry(1); // Saturday, not due → bonus
    logs['2026-09-14'] = entry(1);
    logs['2026-09-15'] = entry(1);
    logs['2026-09-16'] = entry(0, { skipped: true });
    logs[TODAY] = entry(1);
    const xp = computeXp(makeData([h], { [h.id]: logs }), ctx);
    expect(xp.byDay['2026-09-12']).toBe(5);
    expect(xp.byDay['2026-09-13']).toBeUndefined();
    expect(xp.byDay['2026-09-14']).toBe(10); // due-day streak 6
    expect(xp.byDay['2026-09-15']).toBe(12); // due-day streak 7
    expect(xp.byDay['2026-09-16']).toBeUndefined();
    expect(xp.byDay[TODAY]).toBe(12); // streak 8, carried over the skip
    expect(xp.total).toBe(50 + 5 + 10 + 12 + 12);
  });
});

describe('computeXp: period, metric and quit habits', () => {
  it('awards the weekly success bonus once, on the day the target is reached', () => {
    const gym = habit({ startDate: '2026-09-07', period: 'week', target: 3 });
    const logs = fill('2026-09-07', '2026-09-10', 1);
    logs['2026-09-14'] = entry(1);
    logs['2026-09-15'] = entry(1);
    const xp = computeXp(makeData([gym], { [gym.id]: logs }), ctx);
    expect(xp.byDay).toEqual({
      '2026-09-07': 5, '2026-09-08': 5, '2026-09-09': 45, '2026-09-10': 5, '2026-09-14': 5, '2026-09-15': 5,
    });
    expect(xp.total).toBe(70);

    // hitting the target mid-week credits the bonus right away
    const reached = computeXp(makeData([gym], { [gym.id]: { ...logs, '2026-09-16': entry(1) } }), ctx);
    expect(reached.byDay['2026-09-16']).toBe(45);
    expect(reached.total).toBe(115);
  });

  it('awards the monthly success bonus on the day the total is reached', () => {
    const h = habit({ type: 'quantity', period: 'month', target: 10, unit: 'km', startDate: '2026-08-01' });
    const logs = { '2026-08-05': entry(6), '2026-08-20': entry(6), '2026-08-25': entry(3) };
    const xp = computeXp(makeData([h], { [h.id]: logs }), ctx);
    expect(xp.byDay).toEqual({ '2026-08-05': 5, '2026-08-20': 125, '2026-08-25': 5 });
    expect(xp.total).toBe(135);
  });

  it('awards 3 XP per logged metric day', () => {
    const mood = habit({ type: 'rating', kind: 'metric', target: 6 });
    const logs = { '2026-09-02': entry(6), '2026-09-03': entry(3), '2026-09-04': entry(0, { note: 'meh' }), [TODAY]: entry(8) };
    const xp = computeXp(makeData([mood], { [mood.id]: logs }), ctx);
    expect(xp.total).toBe(9);
    expect(xp.today).toBe(3);
  });

  it('awards 4 XP per clean day and the 7-day milestone', () => {
    const q = habit({ type: 'quit' });
    const xp = computeXp(makeData([q]), ctx);
    expect(xp.total).toBe(17 * 4 + 50);
    expect(xp.byDay['2026-09-08']).toBe(54); // 7 days after Sep 1 09:00
    expect(xp.today).toBe(4);
  });

  it('gives nothing for relapse days and restarts milestones per run', () => {
    const q = habit({ type: 'quit' });
    const xp = computeXp(makeData([q], {}, [relapse(q.id, at(2026, 9, 5, 12))]), ctx);
    expect(xp.byDay['2026-09-05']).toBeUndefined();
    expect(xp.byDay['2026-09-08']).toBe(4); // first run never reached 7 days
    expect(xp.byDay['2026-09-12']).toBe(54); // second run: Sep 5 12:00 + 7 days
    expect(xp.total).toBe(16 * 4 + 50);

    const long = habit({ type: 'quit', startDate: '2026-08-01', quitStart: at(2026, 8, 1, 9) });
    const multi = computeXp(makeData([long], {}, [relapse(long.id, at(2026, 9, 9, 10))]), ctx);
    expect(multi.byDay['2026-08-08']).toBe(54);
    expect(multi.byDay['2026-08-31']).toBe(204); // 30-day milestone
    expect(multi.byDay['2026-09-16']).toBe(54); // run 2 reaches 7 days
    expect(multi.total).toBe(47 * 4 + 50 + 200 + 50);
  });
});

describe('computeXp: perfect days, notes and achievements', () => {
  it('adds +25 XP for perfect days with at least 3 daily habits', () => {
    const hs = [habit({ startDate: '2026-09-14' }), habit({ startDate: '2026-09-14' }), habit({ startDate: '2026-09-14' })];
    const logs: AppData['logs'] = {};
    hs.forEach((h, i) => {
      logs[h.id] = fill('2026-09-14', '2026-09-16', 1);
      if (i < 2) logs[h.id][TODAY] = entry(1);
    });
    const data = makeData(hs, logs);
    const xp = computeXp(data, ctx);
    expect(xp.byHabit.__perfect).toBe(75);
    expect(xp.byDay['2026-09-16']).toBe(3 * 10 + 25);
    expect(xp.today).toBe(20); // 2 of 3 done: not perfect (yet)
    expect(xp.total).toBe(3 * 30 + 20 + 75);
    expect(perfectDays(data, ctx)).toEqual(['2026-09-14', '2026-09-15', '2026-09-16']);

    const twoHabits = makeData(hs.slice(0, 2), logs);
    expect(computeXp(twoHabits, ctx).byHabit.__perfect).toBe(0);
    expect(perfectDays(twoHabits, ctx)).toEqual([]);
  });

  it('agrees with dayOverview on which days are perfect', () => {
    const rand = mulberry32(7);
    const habits = [
      habit({ startDate: '2026-08-01' }),
      habit({ startDate: '2026-08-01', type: 'quantity', target: 8, schedule: [1, 2, 3, 4, 5] }),
      habit({ startDate: '2026-08-01', type: 'rating', target: 7 }),
      habit({ startDate: '2026-08-10', type: 'duration', direction: 'atMost', target: 120 }),
      habit({ startDate: '2026-08-01', period: 'week', target: 3 }),
      habit({ startDate: '2026-08-01', type: 'rating', kind: 'metric' }),
      habit({ startDate: '2026-08-01', type: 'quit', quitStart: at(2026, 8, 1, 9) }),
      habit({ startDate: '2026-08-01', archived: true }),
    ];
    const logs: AppData['logs'] = {};
    for (const h of habits) {
      logs[h.id] = {};
      for (let d = '2026-08-01'; d <= TODAY; d = addDays(d, 1)) {
        const r = rand();
        if (r < 0.04) logs[h.id][d] = entry(0, { skipped: true });
        else if (r < 0.9) {
          const value = h.type === 'quantity' ? 8 : h.type === 'rating' ? 8 : h.type === 'duration' ? 90 : 1;
          logs[h.id][d] = entry(value);
        } else if (r < 0.95 && h.type !== 'check') {
          logs[h.id][d] = entry(h.type === 'duration' ? 200 : 3);
        }
      }
    }
    const data = makeData(habits, logs, [relapse(habits[6].id, at(2026, 8, 20, 22))]);
    const actual = new Set(perfectDays(data, ctx));
    let perfectCount = 0;
    let otherCount = 0;
    for (let d = '2026-08-01'; d <= TODAY; d = addDays(d, 1)) {
      const overview = dayOverview(data, d, ctx);
      const expected = overview.perfect && overview.total >= 3;
      expect(actual.has(d), d).toBe(expected);
      if (expected) perfectCount++;
      else otherCount++;
    }
    expect(perfectCount).toBeGreaterThan(0);
    expect(otherCount).toBeGreaterThan(0);
    expect(computeXp(data, ctx).byHabit.__perfect).toBe(perfectCount * 25);
  });

  it('adds +1 XP per day with a journal note (up to today)', () => {
    const data = makeData([], {}, [], {
      dayNotes: { '2026-09-10': 'Felt great', '2026-09-11': '   ', '2026-09-20': 'Future plans' },
    });
    const xp = computeXp(data, ctx);
    expect(xp.total).toBe(1);
    expect(xp.byDay).toEqual({ '2026-09-10': 1 });
    expect(xp.byHabit.__notes).toBe(1);
  });

  it('credits stored achievements on the logical day they were unlocked', () => {
    const data = makeData([], {}, [], {
      rewards: {
        unlocked: { 'first-log': at(2026, 9, 16, 2), 'streak-7': at(2026, 9, 17, 8), 'no-such-achievement': at(2026, 9, 10) },
        lastSeenLevel: 1,
        celebratedPerfectDays: [],
      },
    });
    const xp = computeXp(data, ctx);
    expect(xp.total).toBe(TIER_XP.bronze * 2);
    expect(xp.byHabit.__achievements).toBe(100);
    expect(xp.byDay).toEqual({ '2026-09-16': 50, [TODAY]: 50 });
    expect(xp.today).toBe(50);

    // with a 04:00 day start, 02:00 on Sep 16 still belongs to Sep 15
    const lateCtx = makeCtx({ weekStartsOn: 1, dayStartHour: 4 }, NOW);
    expect(computeXp(data, lateCtx).byDay).toEqual({ '2026-09-15': 50, [TODAY]: 50 });
  });

  it('is memoized and ignores unrelated data changes', () => {
    const h = habit();
    const data = makeData([h], { [h.id]: fill('2026-09-01', TODAY, 1) });
    const first = computeXp(data, ctx);
    expect(computeXp(data, ctx)).toBe(first);
    const themed = { ...data, settings: { ...data.settings, theme: 'dusk' as const } };
    expect(computeXp(themed, ctx)).toBe(first);
  });

  it('recomputes only what changed and stays exact', () => {
    const a = habit();
    const b = habit({ type: 'quantity', target: 3 });
    const logs = { [a.id]: fill('2026-09-01', TODAY, 1), [b.id]: fill('2026-09-01', '2026-09-10', 3) };
    const data = makeData([a, b], logs);
    computeXp(data, ctx);
    const edited = makeData([a, b], { ...logs, [b.id]: { ...logs[b.id], '2026-09-11': entry(2) } });
    expect(computeXp(edited, ctx)).toEqual(computeXp(structuredClone(edited), ctx));
    expect(computeXp(edited, ctx).total).toBe(computeXp(data, ctx).total + 3);
  });
});

describe('achievement catalog', () => {
  it('has at least 40 well-formed achievements with unique ids', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.name.length, a.id).toBeGreaterThan(0);
      expect(a.description.length, a.id).toBeGreaterThan(0);
      expect(a.icon.length, a.id).toBeGreaterThan(0);
      expect(a.xp, a.id).toBe(TIER_XP[a.tier]);
      expect(a.secret === true, a.id).toBe(a.group === 'secret');
    }
    const groups = new Set(ACHIEVEMENTS.map((a) => a.group));
    expect([...groups].sort()).toEqual(['consistency', 'journey', 'quit', 'secret', 'streaks', 'volume']);
  });

  it('covers the required milestones', () => {
    const required = [
      'first-log', 'perfect-day-1', 'habits-5', 'days-7', 'days-30', 'days-100', 'days-365', 'all-types', 'notes-10',
      'level-5', 'level-10', 'level-25',
      'streak-3', 'streak-7', 'streak-14', 'streak-30', 'streak-66', 'streak-100', 'streak-365', 'weekly-streak-4', 'weekly-streak-12',
      'perfect-days-7', 'perfect-days-30', 'perfect-days-100', 'perfect-week', 'rate-90-30', 'weeks-80-4',
      'checkins-100', 'checkins-1000', 'hours-10', 'hours-100', 'hours-500', 'units-1000',
      'quit-1', 'quit-7', 'quit-30', 'quit-90', 'quit-365', 'phoenix',
      'night-owl', 'weekend-warrior', 'comeback',
    ];
    for (const id of required) expect(achievementById(id)?.id, id).toBe(id);
    expect(achievementById('streak-66')?.name).toBe('Habit Formed');
    expect(achievementById('nope')).toBeUndefined();
  });
});

describe('evaluateAchievements', () => {
  it('unlocks nothing without data', () => {
    const data = makeData([]);
    const statuses = evaluateAchievements(data, ctx);
    expect(statuses.map((s) => s.def.id)).toEqual(ACHIEVEMENTS.map((a) => a.id));
    expect(statuses.filter((s) => s.unlocked)).toEqual([]);
    expect(findNewlyUnlocked(data, ctx)).toEqual([]);
  });

  it('unlocks the first log', () => {
    const h = habit();
    const data = makeData([h], { [h.id]: { '2026-09-10': entry(1) } });
    expect(statusOf(data, 'first-log')).toMatchObject({ unlocked: true, current: 1, target: 1, progress: 1 });
    expect(statusOf(data, 'first-log').unlockedAt).toBeUndefined();
    expect(statusOf(data, 'days-7')).toMatchObject({ unlocked: false, current: 1, target: 7 });
    expect(statusOf(data, 'days-7').progress).toBeCloseTo(1 / 7);
    expect(findNewlyUnlocked(data, ctx).map((a) => a.id)).toEqual(['first-log']);
  });

  it('unlocks the 7-day streak', () => {
    const h = habit({ startDate: '2026-09-11' });
    const data = makeData([h], { [h.id]: fill('2026-09-11', TODAY, 1) });
    expect(unlockedIds(data)).toEqual(['first-log', 'days-7', 'streak-3', 'streak-7']);
    expect(statusOf(data, 'streak-14')).toMatchObject({ unlocked: false, current: 7, progress: 0.5 });
  });

  it('unlocks the 7-day quit run', () => {
    const q = habit({ type: 'quit', quitStart: at(2026, 9, 9, 12), startDate: '2026-09-09' });
    const data = makeData([q]);
    expect(unlockedIds(data)).toEqual(['quit-1', 'quit-7']);
    expect(statusOf(data, 'quit-30')).toMatchObject({ unlocked: false, current: 8, target: 30 });
  });

  it('unlocks the first perfect day', () => {
    const hs = [habit(), habit(), habit()];
    const logs: AppData['logs'] = {};
    for (const h of hs) logs[h.id] = { '2026-09-16': entry(1) };
    const data = makeData(hs, logs);
    expect(statusOf(data, 'perfect-day-1').unlocked).toBe(true);
    expect(statusOf(data, 'perfect-days-7')).toMatchObject({ unlocked: false, current: 1 });
    expect(findNewlyUnlocked(data, ctx).map((a) => a.id)).toContain('perfect-day-1');
  });

  it('findNewlyUnlocked excludes achievements already stored', () => {
    const h = habit({ startDate: '2026-09-11' });
    const data = makeData([h], { [h.id]: fill('2026-09-11', TODAY, 1) }, [], {
      rewards: { unlocked: { 'first-log': at(2026, 9, 11, 9), 'streak-3': at(2026, 9, 13, 9) }, lastSeenLevel: 1, celebratedPerfectDays: [] },
    });
    expect(findNewlyUnlocked(data, ctx).map((a) => a.id)).toEqual(['days-7', 'streak-7']);
    expect(statusOf(data, 'first-log').unlockedAt).toBe(at(2026, 9, 11, 9));
  });

  it('keeps stored unlocks even when the condition no longer holds', () => {
    const stamp = at(2026, 6, 1, 10);
    const data = makeData([], {}, [], { rewards: { unlocked: { 'streak-100': stamp }, lastSeenLevel: 1, celebratedPerfectDays: [] } });
    expect(statusOf(data, 'streak-100')).toMatchObject({ unlocked: true, unlockedAt: stamp, progress: 1, current: 100 });
    expect(findNewlyUnlocked(data, ctx)).toEqual([]);
  });

  it('measures level achievements without achievement XP', () => {
    const start = addDays(TODAY, -49);
    const h = habit({ startDate: start });
    const data = makeData([h], { [h.id]: fill(start, TODAY, 1) }, [], {
      rewards: { unlocked: { 'streak-365': at(2026, 9, 1) }, lastSeenLevel: 1, celebratedPerfectDays: [] },
    });
    expect(computeXp(data, ctx).total).toBe(800 + TIER_XP.diamond);
    expect(levelFromXp(computeXp(data, ctx).total).level).toBe(8);
    expect(statusOf(data, 'level-5')).toMatchObject({ unlocked: false, current: 4 }); // 800 habit XP → level 4
  });

  it('measures streak & quit records exactly like the engine', () => {
    const rand = mulberry32(99);
    const daily = [habit({ startDate: '2026-06-01' }), habit({ startDate: '2026-06-01', schedule: [1, 3, 5], archived: true })];
    const weekly = habit({ startDate: '2026-06-01', period: 'week', target: 2 });
    const quit = habit({ type: 'quit', startDate: '2026-06-01', quitStart: at(2026, 6, 1, 8) });
    const logs: AppData['logs'] = {};
    for (const h of [...daily, weekly]) {
      logs[h.id] = {};
      for (let d = '2026-06-01'; d <= TODAY; d = addDays(d, 1)) {
        const r = rand();
        if (r < 0.05) logs[h.id][d] = entry(0, { skipped: true });
        else if (r < (h === weekly ? 0.4 : 0.93)) logs[h.id][d] = entry(1);
      }
    }
    const relapses = [relapse(quit.id, at(2026, 7, 4, 23)), relapse(quit.id, at(2026, 8, 2, 7))];
    const data = makeData([...daily, weekly, quit], logs, relapses);
    const bestDaily = Math.max(...daily.map((h) => streakInfo(h, data, ctx).best));
    expect(bestDaily).toBeGreaterThan(3);
    expect(statusOf(data, 'streak-365').current).toBe(bestDaily);
    expect(statusOf(data, 'weekly-streak-12').current).toBe(Math.min(12, streakInfo(weekly, data, ctx).best));
    expect(statusOf(data, 'quit-365').current).toBe(quitStats(quit, data, ctx).bestDays);
    expect(statusOf(data, 'phoenix').unlocked).toBe(true);
  });

  it('unlocks Phoenix only for a clean run that follows a relapse', () => {
    const q = habit({ type: 'quit', startDate: '2026-08-01', quitStart: at(2026, 8, 1, 9) });
    expect(statusOf(makeData([q]), 'phoenix')).toMatchObject({ unlocked: false, current: 0 });
    const bounced = makeData([q], {}, [relapse(q.id, at(2026, 9, 5, 12))]);
    expect(statusOf(bounced, 'phoenix').unlocked).toBe(true);
    const recent = makeData([q], {}, [relapse(q.id, at(2026, 9, 14, 12))]);
    expect(statusOf(recent, 'phoenix')).toMatchObject({ unlocked: false, current: 3 });
  });

  it('unlocks consistency achievements for a long perfect run', () => {
    const start = '2026-07-01';
    const hs = [habit({ startDate: start }), habit({ startDate: start }), habit({ startDate: start })];
    const logs: AppData['logs'] = {};
    for (const h of hs) logs[h.id] = fill(start, TODAY, 1);
    const data = makeData(hs, logs);
    const ids = unlockedIds(data);
    for (const id of ['perfect-days-30', 'perfect-week', 'perfect-month', 'rate-90-30', 'weeks-80-4', 'weekend-warrior', 'streak-trio', 'streak-66']) {
      expect(ids, id).toContain(id);
    }
    expect(statusOf(data, 'perfect-days-100')).toMatchObject({ unlocked: false, current: 79 });
  });

  it('requires full 30-day windows over 3+ habits for Clockwork, and completed weeks for Steady Hands', () => {
    const hs = [habit(), habit(), habit()];
    const logs: AppData['logs'] = {};
    for (const h of hs) logs[h.id] = fill('2026-09-01', TODAY, 1);
    const young = makeData(hs, logs);
    expect(statusOf(young, 'rate-90-30')).toMatchObject({ unlocked: false, current: 0 });
    expect(statusOf(young, 'weeks-80-4')).toMatchObject({ unlocked: false, current: 1 }); // only Sep 7-13 is a full, finished week

    const old = hs.slice(0, 2).map((h) => ({ ...h, startDate: '2026-07-01' }));
    const oldLogs: AppData['logs'] = {};
    for (const h of old) oldLogs[h.id] = fill('2026-07-01', TODAY, 1);
    expect(statusOf(makeData(old, oldLogs), 'rate-90-30').current).toBe(0); // only 2 habits

    // starting 30 days ago leaves exactly one window: 3 habits × (29 past days + today) = 90 opportunities
    const start = addDays(TODAY, -29);
    const trio = [habit({ startDate: start }), habit({ startDate: start }), habit({ startDate: start })];
    const trioLogs: AppData['logs'] = {};
    for (const h of trio) trioLogs[h.id] = fill(start, TODAY, 1);
    for (const day of ['2026-08-20', '2026-08-23', '2026-08-26', '2026-08-29', '2026-09-01', '2026-09-04', '2026-09-07', '2026-09-10', '2026-09-13']) {
      delete trioLogs[trio[0].id][day];
    }
    expect(statusOf(makeData(trio, trioLogs), 'rate-90-30')).toMatchObject({ unlocked: true }); // 81 / 90

    const { '2026-09-15': _dropped, ...fewer } = trioLogs[trio[1].id];
    const oneMore = makeData(trio, { ...trioLogs, [trio[1].id]: fewer });
    expect(statusOf(oneMore, 'rate-90-30')).toMatchObject({ unlocked: false, current: 88 }); // 80 / 90
  });

  it('tracks volume records', () => {
    const study = habit({ type: 'duration', target: 60 });
    const water = habit({ type: 'quantity', target: 100, unit: 'ml' });
    const sleep = habit({ type: 'rating', target: 7, ratingMax: 10 });
    const logs: AppData['logs'] = {
      [study.id]: { ...fill('2026-09-01', '2026-09-09', 40), '2026-09-10': entry(240) },
      [water.id]: fill('2026-09-01', '2026-09-10', 100),
      [sleep.id]: { '2026-09-05': entry(10) },
    };
    const data = makeData([study, water, sleep], logs);
    expect(statusOf(data, 'hours-10')).toMatchObject({ unlocked: true }); // 360 + 240 minutes
    expect(statusOf(data, 'hours-100')).toMatchObject({ unlocked: false, current: 10 });
    expect(statusOf(data, 'deep-focus').unlocked).toBe(true);
    expect(statusOf(data, 'overachiever').unlocked).toBe(true); // 240 >= 2 × 60
    expect(statusOf(data, 'units-1000').unlocked).toBe(true);
    expect(statusOf(data, 'top-marks').unlocked).toBe(true);
    expect(statusOf(data, 'checkins-100')).toMatchObject({ unlocked: false, current: 1 + 10 + 1 });

    const modest = makeData([study], { [study.id]: fill('2026-09-01', '2026-09-05', 90) });
    expect(statusOf(modest, 'deep-focus')).toMatchObject({ unlocked: false, current: 1.5 });
    expect(statusOf(modest, 'overachiever').unlocked).toBe(false);
    expect(statusOf(modest, 'hours-10').current).toBe(7.5);
  });

  it('counts tracked habits, habit types and journal notes', () => {
    const types: Array<Partial<Habit>> = [
      { type: 'check' }, { type: 'quantity', target: 2 }, { type: 'duration', target: 30 }, { type: 'rating', target: 7 },
    ];
    const hs = types.map((t) => habit(t));
    const logs: AppData['logs'] = {};
    for (const h of hs) logs[h.id] = { '2026-09-10': entry(h.type === 'rating' ? 8 : h.type === 'duration' ? 30 : 2) };
    const quit = habit({ type: 'quit' });
    const notes: Record<DayKey, string> = {};
    for (let i = 1; i <= 10; i++) notes[`2026-09-${String(i).padStart(2, '0')}`] = `Note ${i}`;
    const data = makeData([...hs, quit, habit()], logs, [], { dayNotes: notes });
    expect(statusOf(data, 'all-types').unlocked).toBe(true);
    expect(statusOf(data, 'habits-5').unlocked).toBe(true); // the never-logged habit doesn't count
    expect(statusOf(data, 'notes-10').unlocked).toBe(true);

    const fresh = habit({ type: 'quit', quitStart: at(2026, 9, 17, 8), startDate: TODAY });
    const notYet = makeData([...hs, fresh], logs);
    expect(statusOf(notYet, 'all-types')).toMatchObject({ unlocked: false, current: 4 });
  });

  it('unlocks secret achievements', () => {
    const h = habit({ startDate: '2025-12-20' });
    const night = makeData([h], { [h.id]: { '2026-09-10': entry(1, { updatedAt: at(2026, 9, 11, 2, 30) }) } });
    expect(statusOf(night, 'night-owl').unlocked).toBe(true);
    expect(statusOf(night, 'night-owl').def.secret).toBe(true);
    const morning = makeData([h], { [h.id]: { '2026-09-10': entry(1, { updatedAt: at(2026, 9, 11, 5, 0) }) } });
    expect(statusOf(morning, 'night-owl').unlocked).toBe(false);

    // has to agree with Date#getHours in whatever timezone the machine runs in
    const stamps: string[] = ['2026-09-10T02:30:00+02:00', '2026-09-10T23:59:59-05:00', '2026-09-10T03:15Z', 'not a date'];
    for (const base of ['2026-03-08', '2026-03-29', '2026-10-25', '2026-11-01', '2026-04-05', '2026-09-10']) {
      for (let hour = 0; hour < 24; hour++) stamps.push(`${base}T${String(hour).padStart(2, '0')}:30:00.000Z`);
    }
    for (const updatedAt of stamps) {
      const parsed = new Date(updatedAt);
      const expected = !Number.isNaN(parsed.getTime()) && parsed.getHours() < 5;
      const data = makeData([h], { [h.id]: { '2026-09-10': entry(1, { updatedAt }) } });
      expect(statusOf(data, 'night-owl').unlocked, updatedAt).toBe(expected);
    }

    const newYear = makeData([h], { [h.id]: { '2026-01-01': entry(1) } });
    expect(statusOf(newYear, 'fresh-start').unlocked).toBe(true);
    expect(statusOf(makeData([h], { [h.id]: { '2026-01-02': entry(1) } }), 'fresh-start').unlocked).toBe(false);
  });

  it('unlocks The Comeback after 14+ days without any log', () => {
    const h = habit({ startDate: '2026-08-01' });
    const comeback = makeData([h], { [h.id]: { ...fill('2026-08-01', '2026-08-05', 1), '2026-08-20': entry(1) } });
    expect(statusOf(comeback, 'comeback').unlocked).toBe(true);
    const shortBreak = makeData([h], { [h.id]: { ...fill('2026-08-01', '2026-08-05', 1), '2026-08-19': entry(1) } });
    expect(statusOf(shortBreak, 'comeback').unlocked).toBe(false); // 13 empty days
  });
});

describe('performance', () => {
  function bigData(): AppData {
    const days: DayKey[] = [];
    for (let d = addDays(TODAY, -729); d <= TODAY; d = addDays(d, 1)) days.push(d);
    const start = days[0];
    const specs: Array<Partial<Habit>> = [
      ...Array.from({ length: 8 }, () => ({ type: 'check' as const })),
      ...Array.from({ length: 3 }, () => ({ type: 'quantity' as const, target: 8 })),
      ...Array.from({ length: 2 }, () => ({ type: 'duration' as const, target: 60 })),
      ...Array.from({ length: 2 }, () => ({ type: 'rating' as const, target: 7 })),
      { type: 'check', period: 'week', target: 3 },
      { type: 'quantity', period: 'month', target: 100 },
      { type: 'rating', kind: 'metric' },
      { type: 'check', schedule: [1, 3, 5] },
      { type: 'quit', quitStart: at(2024, 9, 18, 9) },
    ];
    const habits = specs.map((spec) => habit({ ...spec, startDate: start }));
    const logs: AppData['logs'] = {};
    // evening stamps that differ per entry, like real usage
    const stamps = days.map((day, i) => new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), 18 + (i % 5), i % 60).toISOString());
    habits.forEach((h, k) => {
      if (h.type === 'quit') return;
      const map: Record<DayKey, LogEntry> = {};
      days.forEach((day, i) => {
        const r = (i * 31 + k * 17) % 10;
        if (r < 7) {
          const value = h.type === 'check' ? 1 : h.type === 'quantity' ? 8 : h.type === 'duration' ? 75 : 7;
          map[day] = { value, updatedAt: stamps[i] };
        } else if (r === 9 && i % 5 === 0) {
          map[day] = { value: 0, skipped: true, updatedAt: stamps[i] };
        }
      });
      logs[h.id] = map;
    });
    const quit = habits[habits.length - 1];
    const relapses = days.filter((_, i) => i % 45 === 20).map((day) => relapse(quit.id, `${day}T20:00:00.000Z`));
    return makeData(habits, logs, relapses, {
      dayNotes: Object.fromEntries(days.filter((_, i) => i % 3 === 0).map((day) => [day, 'note'])),
    });
  }

  it('computes XP and achievements for 20 habits × 2 years in under 50 ms each', () => {
    // take the best of a few runs so a busy machine doesn't flake the budget. fresh data each time
    // because the caches are keyed by object
    const TRIALS = 5;
    let xpMs = Infinity;
    let achievementsMs = Infinity;
    let cachedMs = Infinity;
    for (let i = 0; i < TRIALS; i++) {
      const a = bigData();
      let t0 = performance.now();
      const xp = computeXp(a, ctx);
      xpMs = Math.min(xpMs, performance.now() - t0);
      expect(xp.total).toBeGreaterThan(0);

      const b = bigData();
      t0 = performance.now();
      const statuses = evaluateAchievements(b, ctx);
      achievementsMs = Math.min(achievementsMs, performance.now() - t0);
      expect(statuses.some((s) => s.unlocked)).toBe(true);

      // shared cache, so these should be nearly free
      t0 = performance.now();
      evaluateAchievements(a, ctx);
      computeXp(b, ctx);
      cachedMs = Math.min(cachedMs, performance.now() - t0);
    }

    expect(xpMs).toBeLessThan(50);
    expect(achievementsMs).toBeLessThan(50);
    expect(cachedMs).toBeLessThan(5);
  });
});
