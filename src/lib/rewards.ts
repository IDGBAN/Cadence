// everything here is cached by object reference, so AppData has to be treated as immutable
import type { AppData, DayCell, DayKey, Habit, ISODate, LogEntry, PeriodProgress } from '@/types';
import type { EngineCtx, HabitMode } from './habitMath';
import { dayCells, habitMode, habitStartDay, isScheduledOn, periodsInRange, relapsesFor } from './habitMath';
import { addDays, diffDays, fromDayKey, logicalDayOf, weekday } from './dates';

export interface LevelInfo {
  level: number;
  title: string;
  xp: number;
  levelStartXp: number;
  nextLevelXp: number;
  intoLevel: number;
  levelSpan: number;
  progress: number; // 0..1
}

const LEVEL_XP_UNIT = 50;

export function xpForLevel(level: number): number {
  if (Number.isNaN(level) || level <= 1) return 0;
  const l = Math.floor(level);
  return LEVEL_XP_UNIT * (l - 1) * l;
}

const LEVEL_TITLES: ReadonlyArray<readonly [minLevel: number, title: string]> = [
  [100, 'Transcendent'],
  [75, 'Mythic'],
  [50, 'Legend'],
  [40, 'Grandmaster'],
  [30, 'Master'],
  [25, 'Unstoppable'],
  [20, 'Relentless'],
  [16, 'Disciplined'],
  [12, 'Committed'],
  [8, 'Regular'],
  [5, 'Starter'],
  [3, 'Sprout'],
  [1, 'Seedling'],
];

export function levelTitle(level: number): string {
  for (const [minLevel, title] of LEVEL_TITLES) {
    if (level >= minLevel) return title;
  }
  return 'Seedling';
}

export function levelFromXp(xp: number): LevelInfo {
  const total = Number.isFinite(xp) && xp > 0 ? xp : 0;
  // invert the curve, then nudge to absorb float error
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * total) / LEVEL_XP_UNIT)) / 2));
  while (xpForLevel(level + 1) <= total) level++;
  while (level > 1 && xpForLevel(level) > total) level--;
  const levelStartXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const levelSpan = nextLevelXp - levelStartXp;
  const intoLevel = total - levelStartXp;
  return {
    level,
    title: levelTitle(level),
    xp: total,
    levelStartXp,
    nextLevelXp,
    intoLevel,
    levelSpan,
    progress: levelSpan > 0 ? Math.min(1, Math.max(0, intoLevel / levelSpan)) : 0,
  };
}

export interface XpBreakdown {
  total: number;
  byDay: Record<DayKey, number>; // only days with XP
  // every habit plus the three XP_KEY_* entries, 0 when nothing was earned
  byHabit: Record<string, number>;
  today: number;
}

export const XP_RULES = {
  dailyDone: 10,
  streakBonusPerWeek: 2,
  streakBonusMax: 10,
  partialMax: 5,
  bonusDay: 5,
  periodDay: 5,
  weekSuccess: 40,
  monthSuccess: 120,
  metricDay: 3,
  quitCleanDay: 4,
  perfectDay: 25,
  dayNote: 1,
} as const;

// awarded once per clean run, so a relapse makes them available again
export const QUIT_MILESTONE_XP: ReadonlyArray<readonly [days: number, xp: number]> = [
  [7, 50],
  [30, 200],
  [90, 500],
  [180, 900],
  [365, 2000],
];

export const PERFECT_DAY_MIN_HABITS = 3;

export const XP_KEY_ACHIEVEMENTS = '__achievements';
export const XP_KEY_PERFECT = '__perfect';
export const XP_KEY_NOTES = '__notes';

export function computeXp(data: AppData, ctx: EngineCtx): XpBreakdown {
  const agg = aggregatesFor(data, ctx);
  const unlocked = storedUnlocks(data);
  const hit = xpCache.get(agg);
  if (hit && hit.unlocked === unlocked) return hit.value;
  const value = withAchievementXp(agg.base, unlocked, ctx);
  xpCache.set(agg, { unlocked, value });
  return value;
}

export function perfectDays(data: AppData, ctx: EngineCtx): DayKey[] {
  return aggregatesFor(data, ctx).perfectDays.slice();
}

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
export type AchievementGroup = 'streaks' | 'consistency' | 'volume' | 'quit' | 'journey' | 'secret';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: AchievementTier;
  group: AchievementGroup;
  xp: number;
  secret?: boolean; // name and description stay hidden until unlocked
}

export const TIER_XP: Record<AchievementTier, number> = {
  bronze: 50,
  silver: 150,
  gold: 400,
  platinum: 1000,
  diamond: 2500,
};

// measured over the whole history, so back-filled logs and imports unlock achievements too
interface RewardStats {
  loggedDays: number;
  trackedHabits: number; // archived included; a quit habit counts once it has a clean day or a relapse
  typesUsed: number;
  notes: number;
  baseLevel: number; // ignores achievement XP, otherwise level achievements would feed each other
  bestDailyStreak: number;
  bestWeeklyStreak: number;
  bestMonthlyStreak: number;
  mostOnWeekStreak: number; // most daily habits on a 7+ day streak at the same time
  perfectDays: number;
  perfectWeekendDays: number;
  bestPerfectRun: number;
  best30DayRate: number; // percent, floored
  best80Weeks: number;
  checkins: number;
  durationMinutes: number;
  maxQuantityTotal: number;
  maxDurationDay: number;
  bestQuitDays: number;
  phoenixDays: number; // longest clean run that started at a relapse
  nightOwl: boolean;
  comeback: boolean;
  doubled: boolean;
  topMarks: boolean;
  newYear: boolean;
}

interface AchievementRule {
  def: AchievementDef;
  target: number;
  measure: (s: RewardStats) => number;
}

interface RuleSpec {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: AchievementTier;
  target: number;
  measure: (s: RewardStats) => number;
}

function rules(group: AchievementGroup, specs: RuleSpec[]): AchievementRule[] {
  return specs.map(({ id, name, description, icon, tier, target, measure }) => {
    const def: AchievementDef = { id, name, description, icon, tier, group, xp: TIER_XP[tier] };
    if (group === 'secret') def.secret = true;
    return { def, target, measure };
  });
}

const flag = (value: boolean): number => (value ? 1 : 0);
const hours = (minutes: number): number => Math.floor(minutes / 6) / 10;

// perfect-day-1 doubles as the first consistency tier. habits-5 only counts habits that were
// actually logged, so the default habit set doesn't hand it out for free.
const RULES: AchievementRule[] = [
  ...rules('journey', [
    { id: 'first-log', name: 'First Step', description: 'Log your first habit.', icon: '👣', tier: 'bronze', target: 1, measure: (s) => s.loggedDays },
    { id: 'perfect-day-1', name: 'Perfect Day', description: 'Complete every daily habit due on a day (at least 3).', icon: '🌟', tier: 'bronze', target: 1, measure: (s) => s.perfectDays },
    { id: 'habits-5', name: 'Architect', description: 'Log 5 different habits at least once.', icon: '🏗️', tier: 'bronze', target: 5, measure: (s) => s.trackedHabits },
    { id: 'days-7', name: 'Week One', description: 'Log habits on 7 different days.', icon: '📅', tier: 'bronze', target: 7, measure: (s) => s.loggedDays },
    { id: 'days-30', name: 'Showing Up', description: 'Log habits on 30 different days.', icon: '🙋', tier: 'silver', target: 30, measure: (s) => s.loggedDays },
    { id: 'days-100', name: 'Centurion', description: 'Log habits on 100 different days.', icon: '🛡️', tier: 'gold', target: 100, measure: (s) => s.loggedDays },
    { id: 'days-365', name: 'Year Logged', description: 'Log habits on 365 different days.', icon: '🎆', tier: 'platinum', target: 365, measure: (s) => s.loggedDays },
    { id: 'all-types', name: 'Jack of All Trades', description: 'Use every habit type: check, quantity, duration, rating and quit.', icon: '🧰', tier: 'silver', target: 5, measure: (s) => s.typesUsed },
    { id: 'notes-10', name: 'Dear Diary', description: 'Write journal notes on 10 days.', icon: '📓', tier: 'bronze', target: 10, measure: (s) => s.notes },
    { id: 'notes-50', name: 'Memoirist', description: 'Write journal notes on 50 days.', icon: '🖋️', tier: 'silver', target: 50, measure: (s) => s.notes },
    { id: 'level-5', name: 'Finding Your Feet', description: 'Reach level 5 without counting achievement XP.', icon: '🥾', tier: 'bronze', target: 5, measure: (s) => s.baseLevel },
    { id: 'level-10', name: 'Double Digits', description: 'Reach level 10 without counting achievement XP.', icon: '🔟', tier: 'silver', target: 10, measure: (s) => s.baseLevel },
    { id: 'level-25', name: 'Quarter Century', description: 'Reach level 25 without counting achievement XP.', icon: '🎖️', tier: 'gold', target: 25, measure: (s) => s.baseLevel },
    { id: 'level-50', name: 'Half Century', description: 'Reach level 50 without counting achievement XP.', icon: '👑', tier: 'platinum', target: 50, measure: (s) => s.baseLevel },
  ]),
  ...rules('streaks', [
    { id: 'streak-3', name: 'Kindling', description: 'Do a daily habit 3 days in a row.', icon: '🕯️', tier: 'bronze', target: 3, measure: (s) => s.bestDailyStreak },
    { id: 'streak-7', name: 'On Fire', description: 'Do a daily habit 7 days in a row.', icon: '🔥', tier: 'bronze', target: 7, measure: (s) => s.bestDailyStreak },
    { id: 'streak-14', name: 'Two Weeks Straight', description: 'Do a daily habit 14 days in a row.', icon: '⚡', tier: 'silver', target: 14, measure: (s) => s.bestDailyStreak },
    { id: 'streak-30', name: 'Month Strong', description: 'Do a daily habit 30 days in a row.', icon: '🌕', tier: 'silver', target: 30, measure: (s) => s.bestDailyStreak },
    { id: 'streak-66', name: 'Habit Formed', description: 'Do a daily habit 66 days in a row.', icon: '🧬', tier: 'gold', target: 66, measure: (s) => s.bestDailyStreak },
    { id: 'streak-100', name: 'Hundred Club', description: 'Do a daily habit 100 days in a row.', icon: '💯', tier: 'platinum', target: 100, measure: (s) => s.bestDailyStreak },
    { id: 'streak-365', name: 'Full Year', description: 'Do a daily habit 365 days in a row.', icon: '🏆', tier: 'diamond', target: 365, measure: (s) => s.bestDailyStreak },
    { id: 'weekly-streak-4', name: 'Weekly Rhythm', description: 'Hit a weekly goal 4 weeks in a row.', icon: '🥁', tier: 'silver', target: 4, measure: (s) => s.bestWeeklyStreak },
    { id: 'weekly-streak-12', name: 'Full Quarter', description: 'Hit a weekly goal 12 weeks in a row.', icon: '📈', tier: 'gold', target: 12, measure: (s) => s.bestWeeklyStreak },
    { id: 'monthly-streak-3', name: 'Seasoned', description: 'Hit a monthly goal 3 months in a row.', icon: '🍂', tier: 'silver', target: 3, measure: (s) => s.bestMonthlyStreak },
    { id: 'monthly-streak-6', name: 'Six Months Running', description: 'Hit a monthly goal 6 months in a row.', icon: '🗻', tier: 'gold', target: 6, measure: (s) => s.bestMonthlyStreak },
    { id: 'streak-trio', name: 'Triple Threat', description: 'Have 3 daily habits on 7+ day streaks at once.', icon: '🔱', tier: 'silver', target: 3, measure: (s) => s.mostOnWeekStreak },
  ]),
  ...rules('consistency', [
    { id: 'perfect-days-7', name: 'Seven Stars', description: 'Collect 7 perfect days.', icon: '✨', tier: 'silver', target: 7, measure: (s) => s.perfectDays },
    { id: 'perfect-days-30', name: 'Constellation', description: 'Collect 30 perfect days.', icon: '🌌', tier: 'gold', target: 30, measure: (s) => s.perfectDays },
    { id: 'perfect-days-100', name: 'Supernova', description: 'Collect 100 perfect days.', icon: '🌠', tier: 'platinum', target: 100, measure: (s) => s.perfectDays },
    { id: 'perfect-week', name: 'Flawless Week', description: 'Have 7 perfect days in a row.', icon: '💫', tier: 'gold', target: 7, measure: (s) => s.bestPerfectRun },
    { id: 'perfect-month', name: 'Immaculate', description: 'Have 30 perfect days in a row.', icon: '💎', tier: 'diamond', target: 30, measure: (s) => s.bestPerfectRun },
    { id: 'rate-90-30', name: 'Clockwork', description: 'Hit 90% completion over 30 days with 3 or more daily habits.', icon: '⏱️', tier: 'gold', target: 90, measure: (s) => s.best30DayRate },
    { id: 'weeks-80-4', name: 'Steady Hands', description: 'Hit 80% overall completion 4 weeks in a row.', icon: '🧘', tier: 'silver', target: 4, measure: (s) => s.best80Weeks },
  ]),
  ...rules('volume', [
    { id: 'checkins-100', name: 'Hundred Hits', description: 'Complete habits 100 times.', icon: '✅', tier: 'bronze', target: 100, measure: (s) => s.checkins },
    { id: 'checkins-1000', name: 'Thousand Club', description: 'Complete habits 1,000 times.', icon: '🎯', tier: 'gold', target: 1000, measure: (s) => s.checkins },
    { id: 'checkins-5000', name: 'Well-Oiled Machine', description: 'Complete habits 5,000 times.', icon: '⚙️', tier: 'platinum', target: 5000, measure: (s) => s.checkins },
    { id: 'hours-10', name: 'Time Invested', description: 'Log 10 hours on duration habits.', icon: '⏳', tier: 'bronze', target: 10, measure: (s) => hours(s.durationMinutes) },
    { id: 'hours-100', name: 'Hundred Hours', description: 'Log 100 hours on duration habits.', icon: '🌊', tier: 'silver', target: 100, measure: (s) => hours(s.durationMinutes) },
    { id: 'hours-500', name: 'Scholar', description: 'Log 500 hours on duration habits.', icon: '🎓', tier: 'platinum', target: 500, measure: (s) => hours(s.durationMinutes) },
    { id: 'units-1000', name: 'Stockpile', description: 'Log 1,000 units on a single quantity habit.', icon: '📦', tier: 'silver', target: 1000, measure: (s) => Math.round(s.maxQuantityTotal * 100) / 100 },
    { id: 'deep-focus', name: 'Deep Focus', description: 'Log 4+ hours on a duration habit in one day.', icon: '🧠', tier: 'silver', target: 4, measure: (s) => hours(s.maxDurationDay) },
  ]),
  ...rules('quit', [
    { id: 'quit-1', name: 'Clean Slate', description: 'Stay clean for a full day on a quit habit.', icon: '🌱', tier: 'bronze', target: 1, measure: (s) => s.bestQuitDays },
    { id: 'quit-7', name: 'One Week Free', description: 'Stay clean 7 days in a row on a quit habit.', icon: '🍃', tier: 'bronze', target: 7, measure: (s) => s.bestQuitDays },
    { id: 'quit-30', name: 'One Month Free', description: 'Stay clean 30 days in a row on a quit habit.', icon: '⛓️', tier: 'silver', target: 30, measure: (s) => s.bestQuitDays },
    { id: 'quit-90', name: 'New Normal', description: 'Stay clean 90 days in a row on a quit habit.', icon: '🌅', tier: 'gold', target: 90, measure: (s) => s.bestQuitDays },
    { id: 'quit-180', name: 'Half-Year Free', description: 'Stay clean 180 days in a row on a quit habit.', icon: '🦅', tier: 'platinum', target: 180, measure: (s) => s.bestQuitDays },
    { id: 'quit-365', name: 'Free Spirit', description: 'Stay clean for a whole year on a quit habit.', icon: '🕊️', tier: 'diamond', target: 365, measure: (s) => s.bestQuitDays },
    { id: 'phoenix', name: 'Phoenix', description: 'Get back to 7 clean days after a relapse.', icon: '🌄', tier: 'silver', target: 7, measure: (s) => s.phoenixDays },
  ]),
  ...rules('secret', [
    { id: 'night-owl', name: 'Night Owl', description: 'Log a habit between midnight and 5 AM.', icon: '🦉', tier: 'bronze', target: 1, measure: (s) => flag(s.nightOwl) },
    { id: 'weekend-warrior', name: 'Weekend Warrior', description: 'Have 10 perfect days on weekends.', icon: '⚔️', tier: 'silver', target: 10, measure: (s) => s.perfectWeekendDays },
    { id: 'comeback', name: 'The Comeback', description: 'Complete a habit after 14+ days of not logging anything.', icon: '🔄', tier: 'silver', target: 1, measure: (s) => flag(s.comeback) },
    { id: 'overachiever', name: 'Overachiever', description: 'Log double your daily target on a quantity or duration habit.', icon: '🚀', tier: 'bronze', target: 1, measure: (s) => flag(s.doubled) },
    { id: 'top-marks', name: 'Top Marks', description: 'Give a rating habit its maximum score.', icon: '🥇', tier: 'bronze', target: 1, measure: (s) => flag(s.topMarks) },
    { id: 'fresh-start', name: 'Fresh Start', description: 'Log a habit on New Year’s Day.', icon: '🎉', tier: 'bronze', target: 1, measure: (s) => flag(s.newYear) },
  ]),
];

const RULES_BY_ID = new Map<string, AchievementRule>(RULES.map((rule) => [rule.def.id, rule]));

export const ACHIEVEMENTS: AchievementDef[] = RULES.map((rule) => rule.def);

export interface AchievementStatus {
  def: AchievementDef;
  current: number;
  target: number;
  progress: number;
  unlocked: boolean; // met now, or stored as unlocked earlier
  unlockedAt?: ISODate;
}

export function evaluateAchievements(data: AppData, ctx: EngineCtx): AchievementStatus[] {
  const agg = aggregatesFor(data, ctx);
  const unlocked = storedUnlocks(data);
  const hit = statusCache.get(agg);
  if (hit && hit.unlocked === unlocked) return hit.value;
  const value = RULES.map((rule): AchievementStatus => {
    const raw = rule.measure(agg.stats);
    const unlockedAt = unlocked && hasOwn(unlocked, rule.def.id) ? unlocked[rule.def.id] : undefined;
    const isUnlocked = raw >= rule.target || unlockedAt !== undefined;
    // clamp to the target once unlocked so the badge shows a full bar
    const current = isUnlocked ? rule.target : Math.max(0, raw);
    const status: AchievementStatus = {
      def: rule.def,
      current,
      target: rule.target,
      progress: isUnlocked ? 1 : rule.target > 0 ? Math.min(1, current / rule.target) : 0,
      unlocked: isUnlocked,
    };
    if (typeof unlockedAt === 'string') status.unlockedAt = unlockedAt;
    return status;
  });
  statusCache.set(agg, { unlocked, value });
  return value;
}

export function findNewlyUnlocked(data: AppData, ctx: EngineCtx): AchievementDef[] {
  const { stats } = aggregatesFor(data, ctx);
  const unlocked = storedUnlocks(data);
  return RULES
    .filter((rule) => rule.measure(stats) >= rule.target && !(unlocked && hasOwn(unlocked, rule.def.id)))
    .map((rule) => rule.def);
}

export function achievementById(id: string): AchievementDef | undefined {
  return RULES_BY_ID.get(id)?.def;
}

export const TIER_COLORS: Record<AchievementTier, { from: string; to: string; label: string }> = {
  bronze: { from: '#f4a261', to: '#b5651d', label: 'Bronze' },
  silver: { from: '#e5e7eb', to: '#9ca3af', label: 'Silver' },
  gold: { from: '#fde68a', to: '#f59e0b', label: 'Gold' },
  platinum: { from: '#a5f3fc', to: '#818cf8', label: 'Platinum' },
  diamond: { from: '#f0abfc', to: '#22d3ee', label: 'Diamond' },
};

const DAY_MS = 86_400_000;
const EPS = 1e-9;
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const NIGHT_OWL_END_HOUR = 5;
const COMEBACK_GAP_DAYS = 14;
const COMEBACK_GRACE_DAYS = 7; // a completion this soon after coming back still counts
const RATE_WINDOW_DAYS = 30;
const RATE_WINDOW_MIN_HABITS = 3;
const GOOD_WEEK_RATE = 0.8;
const STREAK_TRIO_DAYS = 7;

const finite = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function storedUnlocks(data: AppData): Record<string, ISODate> | undefined {
  const unlocked = data.rewards?.unlocked;
  return unlocked && typeof unlocked === 'object' ? unlocked : undefined;
}

// the engine's "has a value" rule for a non-skipped entry. A rating of 0 means not rated
function entryHasValue(habit: Habit, value: number): boolean {
  if (value > 0) return true;
  if (habit.type === 'quit' || habit.type === 'check' || habit.type === 'rating') return false;
  if (habit.kind === 'metric') return true;
  return habit.direction === 'atMost';
}

const F_ACTIVITY = 1; // a value or a relapse was logged
const F_SUCCESS = 2; // daily 'done' (bonus days too) or a period contribution
const F_COUNTED = 4; // daily goal due and not skipped, counts toward the day ring
const F_COUNTED_DONE = 8;

interface HabitHistory {
  habit: Habit;
  mode: HabitMode;
  start: DayKey;
  n: number; // arrays cover [start, today]; 0 when the habit starts after today
  xp: Float64Array;
  flags: Uint8Array;
  running: Int32Array | undefined; // daily habits only: streak after each day
  xpTotal: number;
  best: number; // in days, or weeks/months for period habits
  phoenixDays: number;
  checkins: number;
  loggedDays: number; // quit habits: relapse days
  valueTotal: number;
  maxDayValue: number;
  doubled: boolean;
  topMarks: boolean;
  nightOwl: boolean;
}

function buildHistory(habit: Habit, data: AppData, ctx: EngineCtx): HabitHistory {
  const mode = habitMode(habit);
  const start = habitStartDay(habit, data, ctx);
  const cells = start <= ctx.today ? dayCells(habit, data, start, ctx.today, ctx) : [];
  const n = cells.length;
  const h: HabitHistory = {
    habit,
    mode,
    start,
    n,
    xp: new Float64Array(n),
    flags: new Uint8Array(n),
    running: mode === 'daily' ? new Int32Array(n) : undefined,
    xpTotal: 0,
    best: 0,
    phoenixDays: 0,
    checkins: 0,
    loggedDays: 0,
    valueTotal: 0,
    maxDayValue: 0,
    doubled: false,
    topMarks: false,
    nightOwl: false,
  };
  switch (mode) {
    case 'daily':
      replayDaily(h, cells);
      break;
    case 'period':
      replayPeriod(h, cells, data, ctx);
      break;
    case 'quit':
      replayQuit(h, cells, data, ctx);
      break;
    default:
      replayMetric(h, cells);
  }
  if (mode !== 'quit') {
    scanValues(h, cells);
    h.nightOwl = hasNightLog(habit, data.logs ? data.logs[habit.id] : undefined, ctx.today);
  }
  let total = 0;
  for (let i = 0; i < n; i++) total += h.xp[i];
  h.xpTotal = total;
  return h;
}

// schedules only depend on the weekday, so one week indexed by k % 7 covers every day
function weeklyDueTable(habit: Habit, start: DayKey): boolean[] {
  const table: boolean[] = [];
  for (let k = 0; k < 7; k++) table.push(isScheduledOn(habit, addDays(start, k)));
  return table;
}

function replayDaily(h: HabitHistory, cells: DayCell[]): void {
  const due = weeklyDueTable(h.habit, h.start);
  const running = h.running as Int32Array;
  const todayIndex = h.n - 1;
  let run = 0;
  for (let i = 0; i < h.n; i++) {
    const cell = cells[i];
    switch (cell.status) {
      case 'done':
        h.flags[i] |= F_SUCCESS;
        h.checkins++;
        if (due[i % 7]) {
          run++;
          h.flags[i] |= F_COUNTED | F_COUNTED_DONE;
          h.xp[i] = XP_RULES.dailyDone
            + Math.min(XP_RULES.streakBonusMax, Math.floor(run / 7) * XP_RULES.streakBonusPerWeek);
        } else {
          h.xp[i] = XP_RULES.bonusDay; // bonus day: never touches the streak
        }
        break;
      case 'partial':
        h.flags[i] |= F_COUNTED;
        h.xp[i] = Math.round(XP_RULES.partialMax * Math.min(1, Math.max(0, finite(cell.progress))));
        if (i !== todayIndex) run = 0; // today is still in progress
        break;
      case 'pending':
        h.flags[i] |= F_COUNTED;
        break;
      case 'missed':
        h.flags[i] |= F_COUNTED;
        run = 0;
        break;
      case 'skipped':
      case 'notDue':
      case 'future':
        break;
      default:
        run = 0;
    }
    running[i] = run;
    if (run > h.best) h.best = run;
  }
}

function replayPeriod(h: HabitHistory, cells: DayCell[], data: AppData, ctx: EngineCtx): void {
  const { habit } = h;
  for (let i = 0; i < h.n; i++) {
    if (cells[i].status !== 'done') continue;
    h.xp[i] = XP_RULES.periodDay;
    h.flags[i] |= F_SUCCESS;
    h.checkins++;
  }
  if (h.n === 0) return;
  const bonus = habit.period === 'month' ? XP_RULES.monthSuccess : XP_RULES.weekSuccess;
  const isCheck = habit.type === 'check';
  const atMost = !isCheck && habit.direction === 'atMost';
  let run = 0;
  for (const pp of periodsInRange(habit, data, h.start, ctx.today, ctx)) {
    if (pp.success) {
      const index = periodReachIndex(h, cells, pp, isCheck, atMost);
      if (index >= 0) h.xp[index] += bonus;
      run++;
      if (run > h.best) h.best = run;
    } else if (!pp.skipped && !pp.current) {
      run = 0;
    }
  }
}

// day the goal was first reached (atMost: the first day with an entry), -1 if outside the history.
// at-most days are 'logged' rather than 'done', since only the period total can win
function periodReachIndex(h: HabitHistory, cells: DayCell[], pp: PeriodProgress, isCheck: boolean, atMost: boolean): number {
  const from = Math.max(0, diffDays(h.start, pp.start));
  const to = Math.min(h.n - 1, diffDays(h.start, pp.end));
  let achieved = 0;
  for (let i = from; i <= to; i++) {
    const cell = cells[i];
    const contributed = cell.status === 'done';
    if (contributed) achieved += isCheck ? 1 : finite(cell.value);
    if (atMost) {
      if (cell.status === 'logged') return i;
    } else if (achieved >= pp.target - EPS) {
      return i;
    }
  }
  return to >= from ? to : -1;
}

// same fallback as the engine when quitStart doesn't parse
function quitStartMs(habit: Habit, ctx: EngineCtx): number {
  const parsed = Date.parse(habit.quitStart);
  if (Number.isFinite(parsed)) return parsed;
  let day: DayKey;
  if (typeof habit.startDate === 'string' && DAY_KEY_RE.test(habit.startDate)) {
    day = habit.startDate;
  } else {
    const created = Date.parse(habit.createdAt);
    day = Number.isFinite(created) ? logicalDayOf(new Date(created), ctx.dayStartHour) : ctx.today;
  }
  const date = fromDayKey(day);
  date.setHours(ctx.dayStartHour);
  return date.getTime();
}

function replayQuit(h: HabitHistory, cells: DayCell[], data: AppData, ctx: EngineCtx): void {
  for (let i = 0; i < h.n; i++) {
    const status = cells[i].status;
    if (status === 'done') {
      h.xp[i] = XP_RULES.quitCleanDay;
    } else if (status === 'missed') {
      h.flags[i] |= F_ACTIVITY; // a relapse was logged
      h.loggedDays++;
    }
  }

  const startMs = quitStartMs(h.habit, ctx);
  const nowMs = ctx.now.getTime();
  const resets: number[] = [];
  for (const relapse of relapsesFor(data, h.habit.id)) {
    const t = Date.parse(relapse.at);
    if (Number.isFinite(t) && t >= startMs && t <= nowMs) resets.push(t);
  }

  let runStart = startMs;
  for (let k = 0; k <= resets.length; k++) {
    const runEnd = k < resets.length ? resets[k] : nowMs;
    if (runEnd > runStart) {
      const days = Math.floor((runEnd - runStart) / DAY_MS);
      if (days > h.best) h.best = days;
      if (k > 0 && days > h.phoenixDays) h.phoenixDays = days;
      for (const [milestone, bonus] of QUIT_MILESTONE_XP) {
        const reachedAt = runStart + milestone * DAY_MS;
        if (reachedAt > runEnd) break;
        const index = diffDays(h.start, logicalDayOf(new Date(reachedAt), ctx.dayStartHour));
        if (index >= 0 && index < h.n) h.xp[index] += bonus;
      }
    }
    runStart = runEnd;
  }
}

function replayMetric(h: HabitHistory, cells: DayCell[]): void {
  for (let i = 0; i < h.n; i++) {
    if (cells[i].status === 'logged') h.xp[i] = XP_RULES.metricDay;
  }
}

function scanValues(h: HabitHistory, cells: DayCell[]): void {
  const { habit } = h;
  const isAmount = habit.type === 'quantity' || habit.type === 'duration';
  const target = finite(habit.target);
  const doubleAt = h.mode === 'daily' && isAmount && habit.direction !== 'atMost' && target > 0 ? 2 * target : Infinity;
  const ratingMax = finite(habit.ratingMax);
  const topAt = habit.type === 'rating' && ratingMax > 0 ? ratingMax : Infinity;
  for (let i = 0; i < h.n; i++) {
    const cell = cells[i];
    if (cell.value === undefined || cell.status === 'skipped') continue;
    const value = finite(cell.value);
    if (!entryHasValue(habit, value)) continue;
    h.flags[i] |= F_ACTIVITY;
    h.loggedDays++;
    // amounts logged against a limit aren't something to reward
    if (isAmount && value > 0 && habit.direction !== 'atMost') {
      h.valueTotal += value;
      if (value > h.maxDayValue) h.maxDayValue = value;
    }
    if (value >= doubleAt) h.doubled = true;
    if (value >= topAt) h.topMarks = true;
  }
}

function hasNightLog(habit: Habit, logs: Record<DayKey, LogEntry> | undefined, today: DayKey): boolean {
  if (!logs) return false;
  syncTzOffsetCache();
  for (const day in logs) {
    if (day > today) continue;
    const entry = logs[day];
    if (!entry || entry.skipped || !entryHasValue(habit, finite(entry.value))) continue;
    const hour = localHourOf(entry.updatedAt);
    if (hour >= 0 && hour < NIGHT_OWL_END_HOUR) return true;
  }
  return false;
}

// offsets only change on hour boundaries, so cache getTimezoneOffset per UTC hour
const tzOffsetByUtcHour = new Map<number, number>();
const TZ_OFFSET_CACHE_LIMIT = 50_000;
// winter|summer offsets, to notice when the device timezone changes
let tzFingerprint = '';

function syncTzOffsetCache(): void {
  const fingerprint = `${new Date(946_684_800_000).getTimezoneOffset()}|${new Date(962_409_600_000).getTimezoneOffset()}`;
  if (fingerprint !== tzFingerprint) {
    tzOffsetByUtcHour.clear();
    tzFingerprint = fingerprint;
  }
}

// decodes toISOString output by hand with a cached offset. a Date per entry dominated the replay
function localHourOf(iso: string): number {
  if (typeof iso !== 'string') return -1;
  const n = iso.length;
  if (n >= 17 && iso.charCodeAt(n - 1) === 90 /* Z */ && iso.charCodeAt(10) === 84 /* T */ && iso.charCodeAt(13) === 58 /* : */) {
    const y = digits(iso, 0, 4);
    const mo = digits(iso, 5, 2);
    const d = digits(iso, 8, 2);
    const h = digits(iso, 11, 2);
    const mi = digits(iso, 14, 2);
    if (y >= 0 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && h >= 0 && h <= 23 && mi >= 0 && mi <= 59) {
      const utcMs = Date.UTC(y, mo - 1, d, h, mi);
      const hourNumber = Math.floor(utcMs / 3_600_000);
      let offset = tzOffsetByUtcHour.get(hourNumber);
      if (offset === undefined) {
        if (tzOffsetByUtcHour.size >= TZ_OFFSET_CACHE_LIMIT) tzOffsetByUtcHour.clear();
        offset = new Date(utcMs).getTimezoneOffset();
        tzOffsetByUtcHour.set(hourNumber, offset);
      }
      const localMinutes = (((h * 60 + mi - offset) % 1440) + 1440) % 1440;
      return Math.floor(localMinutes / 60);
    }
  }
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).getHours() : -1;
}

function digits(s: string, from: number, count: number): number {
  let value = 0;
  for (let i = from; i < from + count; i++) {
    const c = s.charCodeAt(i) - 48;
    if (c < 0 || c > 9) return -1;
    value = value * 10 + c;
  }
  return value;
}

interface HistoryCacheEntry {
  logs: Record<DayKey, LogEntry> | undefined;
  relapses: AppData['relapses'] | undefined;
  today: DayKey;
  weekStartsOn: number;
  dayStartHour: number;
  nowMs: number;
  history: HabitHistory;
}

const historyCache = new WeakMap<Habit, HistoryCacheEntry>();

function historyFor(habit: Habit, data: AppData, ctx: EngineCtx): HabitHistory {
  const logs = data.logs ? data.logs[habit.id] : undefined;
  const isQuit = habit.type === 'quit';
  const relapses = isQuit ? data.relapses : undefined;
  const nowMs = isQuit ? ctx.now.getTime() : 0;
  const hit = historyCache.get(habit);
  if (
    hit && hit.logs === logs && hit.relapses === relapses && hit.today === ctx.today
    && hit.weekStartsOn === ctx.weekStartsOn && hit.dayStartHour === ctx.dayStartHour && hit.nowMs === nowMs
  ) {
    return hit.history;
  }
  const history = buildHistory(habit, data, ctx);
  historyCache.set(habit, {
    logs, relapses, today: ctx.today, weekStartsOn: ctx.weekStartsOn, dayStartHour: ctx.dayStartHour, nowMs, history,
  });
  return history;
}

interface Aggregates {
  base: XpBreakdown; // without achievement XP
  stats: RewardStats;
  perfectDays: DayKey[];
}

interface AggregateCacheEntry {
  habits: AppData['habits'];
  logs: AppData['logs'];
  relapses: AppData['relapses'];
  dayNotes: AppData['dayNotes'];
  today: DayKey;
  weekStartsOn: number;
  dayStartHour: number;
  nowMs: number;
  value: Aggregates;
}

const AGGREGATE_CACHE_SIZE = 4;
let aggregateCache: AggregateCacheEntry[] = [];

const xpCache = new WeakMap<Aggregates, { unlocked: Record<string, ISODate> | undefined; value: XpBreakdown }>();
const statusCache = new WeakMap<Aggregates, { unlocked: Record<string, ISODate> | undefined; value: AchievementStatus[] }>();

function aggregatesFor(data: AppData, ctx: EngineCtx): Aggregates {
  const nowMs = ctx.now.getTime();
  const hit = aggregateCache.find((e) =>
    e.habits === data.habits && e.logs === data.logs && e.relapses === data.relapses && e.dayNotes === data.dayNotes
    && e.today === ctx.today && e.weekStartsOn === ctx.weekStartsOn && e.dayStartHour === ctx.dayStartHour
    && e.nowMs === nowMs);
  if (hit) return hit.value;
  const value = buildAggregates(data, ctx);
  aggregateCache = [
    {
      habits: data.habits, logs: data.logs, relapses: data.relapses, dayNotes: data.dayNotes,
      today: ctx.today, weekStartsOn: ctx.weekStartsOn, dayStartHour: ctx.dayStartHour, nowMs, value,
    },
    ...aggregateCache,
  ].slice(0, AGGREGATE_CACHE_SIZE);
  return value;
}

interface Placed {
  h: HabitHistory;
  off: number; // index of h.start on the global timeline
}

function buildAggregates(data: AppData, ctx: EngineCtx): Aggregates {
  const today = ctx.today;
  const habits = Array.isArray(data.habits) ? data.habits : [];
  const histories = habits.map((habit) => historyFor(habit, data, ctx));

  let origin: DayKey | undefined;
  for (const h of histories) {
    if (h.n > 0 && (origin === undefined || h.start < origin)) origin = h.start;
  }
  const N = origin === undefined ? 0 : diffDays(origin, today) + 1;
  const todayIndex = N - 1;
  const xpDay = new Float64Array(N);
  const dayFlags = new Uint8Array(N);
  const counted = new Uint16Array(N);
  const countedDone = new Uint16Array(N);
  const onWeekStreak = new Uint16Array(N);

  const byHabit: Record<string, number> = {};
  const activeDaily: Placed[] = [];
  const typesUsed = new Set<string>();
  const stats: RewardStats = {
    loggedDays: 0, trackedHabits: 0, typesUsed: 0, notes: 0, baseLevel: 1,
    bestDailyStreak: 0, bestWeeklyStreak: 0, bestMonthlyStreak: 0, mostOnWeekStreak: 0,
    perfectDays: 0, perfectWeekendDays: 0, bestPerfectRun: 0, best30DayRate: 0, best80Weeks: 0,
    checkins: 0, durationMinutes: 0, maxQuantityTotal: 0, maxDurationDay: 0,
    bestQuitDays: 0, phoenixDays: 0,
    nightOwl: false, comeback: false, doubled: false, topMarks: false, newYear: false,
  };

  for (const h of histories) {
    const { habit } = h;
    byHabit[habit.id] = (byHabit[habit.id] ?? 0) + h.xpTotal;

    const used = h.loggedDays > 0 || (h.mode === 'quit' && h.best >= 1);
    if (used) {
      stats.trackedHabits++;
      typesUsed.add(habit.type);
    }
    stats.checkins += h.checkins;
    stats.nightOwl ||= h.nightOwl;
    stats.doubled ||= h.doubled;
    stats.topMarks ||= h.topMarks;
    if (habit.type === 'duration') {
      stats.durationMinutes += h.valueTotal;
      stats.maxDurationDay = Math.max(stats.maxDurationDay, h.maxDayValue);
    } else if (habit.type === 'quantity') {
      stats.maxQuantityTotal = Math.max(stats.maxQuantityTotal, h.valueTotal);
    }
    if (h.mode === 'daily') stats.bestDailyStreak = Math.max(stats.bestDailyStreak, h.best);
    else if (h.mode === 'period' && habit.period === 'month') stats.bestMonthlyStreak = Math.max(stats.bestMonthlyStreak, h.best);
    else if (h.mode === 'period') stats.bestWeeklyStreak = Math.max(stats.bestWeeklyStreak, h.best);
    else if (h.mode === 'quit') {
      stats.bestQuitDays = Math.max(stats.bestQuitDays, h.best);
      stats.phoenixDays = Math.max(stats.phoenixDays, h.phoenixDays);
    }

    if (h.n === 0 || origin === undefined) continue;
    const off = diffDays(origin, h.start);
    const countsForDay = h.mode === 'daily' && !habit.archived;
    if (countsForDay) activeDaily.push({ h, off });
    const running = h.running;
    for (let i = 0; i < h.n; i++) {
      const g = off + i;
      const f = h.flags[i];
      xpDay[g] += h.xp[i];
      dayFlags[g] |= f & (F_ACTIVITY | F_SUCCESS);
      if (countsForDay && (f & F_COUNTED)) {
        counted[g]++;
        if (f & F_COUNTED_DONE) countedDone[g]++;
      }
      if (running && running[i] >= STREAK_TRIO_DAYS) onWeekStreak[g]++;
    }
  }
  stats.typesUsed = typesUsed.size;

  const perfectDayKeys: DayKey[] = [];
  const originWeekday = origin === undefined ? 0 : weekday(origin);
  let perfectXp = 0;
  let perfectRun = 0;
  for (let g = 0; g < N; g++) {
    if (dayFlags[g] & F_ACTIVITY) stats.loggedDays++;
    if (onWeekStreak[g] > stats.mostOnWeekStreak) stats.mostOnWeekStreak = onWeekStreak[g];
    const total = counted[g];
    const done = countedDone[g];
    if (total >= PERFECT_DAY_MIN_HABITS && done === total) {
      xpDay[g] += XP_RULES.perfectDay;
      perfectXp += XP_RULES.perfectDay;
      perfectDayKeys.push(addDays(origin as DayKey, g));
      stats.perfectDays++;
      const wd = (originWeekday + g) % 7;
      if (wd === 0 || wd === 6) stats.perfectWeekendDays++;
      perfectRun++;
      if (perfectRun > stats.bestPerfectRun) stats.bestPerfectRun = perfectRun;
    } else if (done !== total && g !== todayIndex) {
      perfectRun = 0; // a miss breaks the run; days with no misses (and today) are neutral
    }
  }

  stats.best30DayRate = Math.floor(bestWindowRate(activeDaily, N) * 100 + EPS);
  stats.best80Weeks = bestGoodWeekRun(counted, countedDone, N, originWeekday, ctx.weekStartsOn);
  stats.comeback = hasComeback(dayFlags, N);
  if (origin !== undefined) stats.newYear = hasNewYearLog(dayFlags, origin, today);

  const byDay: Record<DayKey, number> = {};
  let total = 0;
  for (let g = 0; g < N; g++) {
    if (xpDay[g] === 0) continue;
    byDay[addDays(origin as DayKey, g)] = xpDay[g];
    total += xpDay[g];
  }
  let notesXp = 0;
  const dayNotes = data.dayNotes && typeof data.dayNotes === 'object' ? data.dayNotes : {};
  for (const day in dayNotes) {
    if (!hasOwn(dayNotes, day) || !DAY_KEY_RE.test(day) || day > today) continue;
    const note = dayNotes[day];
    if (typeof note !== 'string' || note.trim() === '') continue;
    stats.notes++;
    notesXp += XP_RULES.dayNote;
    byDay[day] = (byDay[day] ?? 0) + XP_RULES.dayNote;
  }
  total += notesXp;

  byHabit[XP_KEY_PERFECT] = perfectXp;
  byHabit[XP_KEY_NOTES] = notesXp;
  byHabit[XP_KEY_ACHIEVEMENTS] = 0;
  stats.baseLevel = levelFromXp(total).level;

  return {
    base: { total, byDay, byHabit, today: byDay[today] ?? 0 },
    stats,
    perfectDays: perfectDayKeys,
  };
}

// only habits tracked for the whole window count, and a window needs at least RATE_WINDOW_MIN_HABITS.
// today only counts once it's done, same as completionRate
function bestWindowRate(activeDaily: Placed[], N: number): number {
  if (N < RATE_WINDOW_DAYS || activeDaily.length < RATE_WINDOW_MIN_HABITS) return 0;
  const placed = activeDaily.slice().sort((a, b) => a.off - b.off);
  const prefixes = placed.map(({ h }) => {
    const opp = new Int32Array(h.n + 1);
    const succ = new Int32Array(h.n + 1);
    for (let i = 0; i < h.n; i++) {
      const f = h.flags[i];
      const done = (f & F_COUNTED_DONE) !== 0;
      const isOpportunity = (f & F_COUNTED) !== 0 && (i !== h.n - 1 || done);
      opp[i + 1] = opp[i] + (isOpportunity ? 1 : 0);
      succ[i + 1] = succ[i] + (done ? 1 : 0);
    }
    return { opp, succ };
  });
  let best = 0;
  for (let end = RATE_WINDOW_DAYS - 1; end < N; end++) {
    const windowStart = end - RATE_WINDOW_DAYS + 1;
    let habits = 0;
    let opportunities = 0;
    let successes = 0;
    for (let k = 0; k < placed.length; k++) {
      const off = placed[k].off;
      if (off > windowStart) break;
      habits++;
      const a = windowStart - off;
      const b = end - off + 1;
      opportunities += prefixes[k].opp[b] - prefixes[k].opp[a];
      successes += prefixes[k].succ[b] - prefixes[k].succ[a];
    }
    if (habits >= RATE_WINDOW_MIN_HABITS && opportunities > 0) best = Math.max(best, successes / opportunities);
  }
  return best;
}

// only full weeks that ended before today; weeks with nothing due don't break the run
function bestGoodWeekRun(counted: Uint16Array, countedDone: Uint16Array, N: number, originWeekday: number, weekStartsOn: number): number {
  const lead = (originWeekday - weekStartsOn + 7) % 7;
  let run = 0;
  let best = 0;
  for (let w = lead === 0 ? 0 : 7 - lead; w + 6 < N - 1; w += 7) {
    let opportunities = 0;
    let successes = 0;
    for (let g = w; g < w + 7; g++) {
      opportunities += counted[g];
      successes += countedDone[g];
    }
    if (opportunities === 0) continue;
    if (successes / opportunities >= GOOD_WEEK_RATE - EPS) {
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

function hasComeback(dayFlags: Uint8Array, N: number): boolean {
  let lastActivity = -1;
  for (let g = 0; g < N; g++) {
    if (!(dayFlags[g] & F_ACTIVITY)) continue;
    if (lastActivity >= 0 && g - lastActivity - 1 >= COMEBACK_GAP_DAYS) {
      const until = Math.min(N - 1, g + COMEBACK_GRACE_DAYS - 1);
      for (let j = g; j <= until; j++) {
        if (dayFlags[j] & F_SUCCESS) return true;
      }
    }
    lastActivity = g;
  }
  return false;
}

function hasNewYearLog(dayFlags: Uint8Array, origin: DayKey, today: DayKey): boolean {
  const lastYear = Number(today.slice(0, 4));
  for (let year = Number(origin.slice(0, 4)); year <= lastYear; year++) {
    const g = diffDays(origin, `${year}-01-01`);
    if (g >= 0 && g < dayFlags.length && (dayFlags[g] & F_ACTIVITY)) return true;
  }
  return false;
}

function withAchievementXp(base: XpBreakdown, unlocked: Record<string, ISODate> | undefined, ctx: EngineCtx): XpBreakdown {
  if (!unlocked) return base;
  let byDay: Record<DayKey, number> | undefined;
  let achievementXp = 0;
  for (const id in unlocked) {
    if (!hasOwn(unlocked, id)) continue;
    const def = achievementById(id);
    if (!def) continue;
    const t = Date.parse(unlocked[id]);
    const day = Number.isFinite(t) ? logicalDayOf(new Date(t), ctx.dayStartHour) : ctx.today; // bad stamps count today
    byDay ??= { ...base.byDay };
    byDay[day] = (byDay[day] ?? 0) + def.xp;
    achievementXp += def.xp;
  }
  if (!byDay) return base;
  return {
    total: base.total + achievementXp,
    byDay,
    byHabit: { ...base.byHabit, [XP_KEY_ACHIEVEMENTS]: achievementXp },
    today: byDay[ctx.today] ?? 0,
  };
}
