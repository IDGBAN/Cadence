/** "YYYY-MM-DD" in the logical calendar (see Settings.dayStartHour). */
export type DayKey = string;

export type ISODate = string;

/**
 * duration values are stored in minutes. quit habits count up from the last relapse
 * and use Relapse records instead of log values.
 */
export type HabitType = 'check' | 'quantity' | 'duration' | 'rating' | 'quit';

/** metric habits are track-only: no target, streaks or success. Only for quantity, duration and rating. */
export type HabitKind = 'goal' | 'metric';

export type Period = 'day' | 'week' | 'month';

// atMost: value <= target is a success (e.g. coffee <= 2)
export type GoalDirection = 'atLeast' | 'atMost';

export type HabitColor =
  | 'rose' | 'orange' | 'amber' | 'yellow' | 'lime' | 'emerald'
  | 'teal' | 'cyan' | 'sky' | 'blue' | 'indigo' | 'violet' | 'purple' | 'pink' | 'slate';

export interface Category {
  id: string;
  name: string;
  icon: string;
  order: number;
}

export interface Habit {
  id: string;
  name: string;
  icon: string;
  color: HabitColor;
  categoryId: string;
  description: string;

  type: HabitType;
  kind: HabitKind;

  /** rating and quit habits are always 'day'. */
  period: Period;

  /** Weekdays it's due (0 = Sunday). Only used when period is 'day'. Never empty. */
  schedule: number[];

  /**
   * check: days per week/month (ignored for daily). quantity/duration: amount per period, in minutes for duration.
   * rating: threshold score. quit: milestone in days, display only.
   */
  target: number;
  direction: GoalDirection;

  /** Plural, e.g. "glasses". */
  unit: string;
  step: number;
  ratingMax: number;

  quitStart: ISODate;

  /** Days before this don't count toward stats. */
  startDate: DayKey;
  createdAt: ISODate;
  archived: boolean;
  order: number;
}

/** A missing entry means nothing was logged. */
export interface LogEntry {
  /** check: 1 = done. rating: 0 = not rated. quit habits don't use it. */
  value: number;
  note?: string;
  /** Excused day: never breaks a streak and doesn't count against completion. value is ignored. */
  skipped?: boolean;
  updatedAt: ISODate;
}

export interface Relapse {
  id: string;
  habitId: string;
  at: ISODate;
  note?: string;
}

export interface RunningTimer {
  habitId: string;
  startedAt: ISODate;
  /** Day the time gets credited to (the day it started). */
  day: DayKey;
}

export type ThemeName = 'midnight' | 'oled' | 'dusk' | 'daylight';
export type AccentName = 'violet' | 'emerald' | 'sky' | 'rose' | 'amber' | 'cyan';

export interface Settings {
  theme: ThemeName;
  accent: AccentName;
  weekStartsOn: 0 | 1;
  /** 0-6. With 4, logging at 01:30 counts for the previous day. */
  dayStartHour: number;
  soundEnabled: boolean;
  confettiEnabled: boolean;
  reduceMotion: boolean;
  todayGroupBy: 'category' | 'none';
  hideCompleted: boolean;
  userName: string;
}

export interface RewardsState {
  /** id -> when it was first unlocked. Never revoked. */
  unlocked: Record<string, ISODate>;
  /** Highest level whose level-up was already celebrated. */
  lastSeenLevel: number;
  celebratedPerfectDays: DayKey[];
}

export interface AppData {
  version: number;
  habits: Habit[];
  categories: Category[];
  /** habitId -> day -> entry */
  logs: Record<string, Record<DayKey, LogEntry>>;
  relapses: Relapse[];
  timers: Record<string, RunningTimer>;
  dayNotes: Record<DayKey, string>;
  settings: Settings;
  rewards: RewardsState;
  meta: {
    createdAt: ISODate;
    lastBackupAt?: ISODate;
    onboarded: boolean;
  };
}

// derived shapes, computed in lib/habitMath.ts

/**
 * pending: due today and not done yet (not a failure). partial: logged but under the daily goal.
 * logged/empty: metric habits, and period-habit days without a contribution.
 */
export type DayStatus =
  | 'done' | 'partial' | 'missed' | 'skipped' | 'pending'
  | 'notDue' | 'future' | 'beforeStart' | 'logged' | 'empty';

export interface DayCell {
  day: DayKey;
  status: DayStatus;
  value?: number;
  note?: string;
  /** 0-1 toward the daily goal, otherwise 0 or 1. */
  progress: number;
}

export interface PeriodProgress {
  start: DayKey;
  end: DayKey;
  /** check: done days (1 or 0 for daily). quantity/duration: sum. rating: that day's score. */
  achieved: number;
  /** Adjusted for skipped days. */
  target: number;
  progress: number;
  success: boolean;
  /** The period contains today. */
  current: boolean;
  /** Every day was skipped or not due. */
  skipped: boolean;
}

export interface StreakInfo {
  /** Days for daily and quit habits, weeks or months for period habits. */
  current: number;
  best: number;
  unit: 'day' | 'week' | 'month';
  currentStart?: DayKey;
  bestStart?: DayKey;
  bestEnd?: DayKey;
}

export interface HabitSummary {
  habitId: string;
  streak: StreakInfo;
  /** 0-1 over the whole history, ignoring pending, skipped and not-due days. */
  completionRate: number;
  completionRate30: number;
  completionRate7: number;
  /** Successful days, or periods for week/month habits. Clean days for quit. */
  totalSuccesses: number;
  totalLoggedDays: number;
  /** Sum for quantity/duration, average for rating. */
  totalValue: number;
  averageValue: number;
  /** 0-1, an exponential moving average of success (like Loop). */
  strength: number;
}
