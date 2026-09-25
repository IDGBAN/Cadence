import type { DayKey, GoalDirection, Habit, HabitKind, HabitType, Period } from '@/types';

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function finite(n: unknown, fallback = 0): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

export function maxPeriodCount(period: Period): number {
  return period === 'week' ? 7 : period === 'month' ? 31 : 1;
}

// 70% of the scale, rounded up. same default the store uses
export function defaultRatingTarget(ratingMax: number): number {
  return Math.max(1, Math.ceil(finite(ratingMax, 10) * 0.7));
}

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKeyLike(v: string): v is DayKey {
  if (!DAY_KEY_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export const HABIT_TYPE_ORDER: HabitType[] = ['check', 'quantity', 'duration', 'rating', 'quit'];

export const UNIT_SUGGESTIONS = ['glasses', 'ml', 'meals', 'times', 'pages', 'km', 'steps', 'g', 'servings', 'cups'];

export const DURATION_STEPS = [5, 10, 15, 30, 60];

export const QUIT_MILESTONES = [7, 30, 90, 365];

export type SchedulePreset = 'all' | 'weekdays' | 'weekends' | 'custom';

export const SCHEDULE_PRESETS: Array<{ id: Exclude<SchedulePreset, 'custom'>; label: string; days: number[] }> = [
  { id: 'all', label: 'Every day', days: ALL_WEEKDAYS },
  { id: 'weekdays', label: 'Weekdays', days: [1, 2, 3, 4, 5] },
  { id: 'weekends', label: 'Weekends', days: [0, 6] },
];

export function presetOf(schedule: number[]): SchedulePreset {
  const days = new Set(schedule);
  for (const preset of SCHEDULE_PRESETS) {
    if (days.size === preset.days.length && preset.days.every((d) => days.has(d))) return preset.id;
  }
  return 'custom';
}

export function toggleWeekday(schedule: number[], day: number): number[] {
  const next = schedule.includes(day) ? schedule.filter((d) => d !== day) : [...schedule, day];
  return next.sort((a, b) => a - b);
}

export function supportsMetric(type: HabitType): boolean {
  return type === 'quantity' || type === 'duration' || type === 'rating';
}

// ratings and quits are always daily
export function showsPeriod(draft: Habit): boolean {
  return draft.kind === 'goal' && (draft.type === 'check' || draft.type === 'quantity' || draft.type === 'duration');
}

export function showsSchedule(draft: Habit): boolean {
  return draft.kind === 'goal' && draft.type !== 'quit' && draft.period === 'day';
}

export function showsDirection(draft: Habit): boolean {
  return draft.kind === 'goal' && (draft.type === 'quantity' || draft.type === 'duration' || draft.type === 'rating');
}

function defaultTarget(type: HabitType, period: Period, ratingMax: number): number {
  switch (type) {
    case 'check':
      return period === 'day' ? 1 : period === 'week' ? 3 : 4;
    case 'quantity':
      return period === 'day' ? 1 : period === 'week' ? 5 : 20;
    case 'duration':
      return period === 'day' ? 30 : period === 'week' ? 300 : 1200;
    case 'rating':
      return defaultRatingTarget(ratingMax);
    case 'quit':
      return 30;
  }
}

export function applyType(draft: Habit, type: HabitType, now = new Date()): Habit {
  if (draft.type === type) return draft;
  const next: Habit = { ...draft, type };

  if (type === 'rating' || type === 'quit') next.period = 'day';
  if (!supportsMetric(type)) next.kind = 'goal';

  switch (type) {
    case 'check':
      next.unit = '';
      next.step = 1;
      next.direction = 'atLeast';
      next.target = next.period === 'day' ? 1 : clamp(Math.round(finite(draft.target, 3)) || 3, 1, maxPeriodCount(next.period));
      break;
    case 'quantity':
      next.unit = draft.unit.trim() === '' ? 'times' : draft.unit;
      next.step = 1;
      next.target = defaultTarget('quantity', next.period, next.ratingMax);
      break;
    case 'duration':
      next.unit = '';
      next.step = 15;
      next.target = defaultTarget('duration', next.period, next.ratingMax);
      break;
    case 'rating':
      next.unit = '';
      next.step = 1;
      next.ratingMax = draft.ratingMax === 5 ? 5 : 10;
      next.target = defaultRatingTarget(next.ratingMax);
      break;
    case 'quit':
      next.unit = '';
      next.step = 1;
      next.direction = 'atLeast';
      next.target = 30;
      next.quitStart = now.toISOString();
      break;
  }
  return next;
}

export function applyKind(draft: Habit, kind: HabitKind): Habit {
  if (draft.kind === kind) return draft;
  if (kind === 'metric') {
    return { ...draft, kind, period: 'day', schedule: [...ALL_WEEKDAYS], direction: 'atLeast' };
  }
  return { ...draft, kind, target: defaultTarget(draft.type, draft.period, draft.ratingMax) };
}

export function applyPeriod(draft: Habit, period: Period): Habit {
  if (draft.period === period) return draft;
  const next: Habit = { ...draft, period };
  if (period === 'day') {
    next.schedule = draft.schedule.length > 0 ? draft.schedule : [...ALL_WEEKDAYS];
  } else {
    // any day in the week/month counts, so the weekday schedule no longer applies
    next.schedule = [...ALL_WEEKDAYS];
  }
  if (draft.type === 'check') {
    next.target = period === 'day' ? 1 : clamp(Math.round(finite(draft.target, 0)) || 0, 1, maxPeriodCount(period));
    if (draft.period === 'day') next.target = defaultTarget('check', period, next.ratingMax);
  }
  return next;
}

export function applyRatingMax(draft: Habit, ratingMax: number): Habit {
  const max = ratingMax === 5 ? 5 : 10;
  if (draft.ratingMax === max) return draft;
  const ratio = draft.ratingMax > 0 ? finite(draft.target, 0) / draft.ratingMax : 0.7;
  return { ...draft, ratingMax: max, target: clamp(Math.round(ratio * max) || defaultRatingTarget(max), 1, max) };
}

export function applyDirection(draft: Habit, direction: GoalDirection): Habit {
  return draft.direction === direction ? draft : { ...draft, direction };
}

export function cleanDraft(draft: Habit): Habit {
  return {
    ...draft,
    name: draft.name.trim(),
    description: draft.description.trim(),
    unit: draft.unit.trim(),
    icon: draft.icon.trim() === '' ? '✨' : draft.icon,
    schedule: draft.schedule.length > 0 ? [...draft.schedule].sort((a, b) => a - b) : [...ALL_WEEKDAYS],
  };
}

export interface DraftErrors {
  name?: string;
  target?: string;
  step?: string;
  schedule?: string;
  quitStart?: string;
  startDate?: string;
}

export function validateDraft(draft: Habit, now = new Date()): DraftErrors {
  const errors: DraftErrors = {};

  if (draft.name.trim() === '') errors.name = 'Give your habit a name.';
  else if (draft.name.trim().length > 60) errors.name = 'Keep the name under 60 characters.';

  const target = finite(draft.target, Number.NaN);
  if (draft.kind === 'goal') {
    if (draft.type === 'check' && draft.period !== 'day') {
      const max = maxPeriodCount(draft.period);
      if (!Number.isFinite(target) || target < 1 || target > max || !Number.isInteger(target)) {
        errors.target = `Pick a whole number between 1 and ${max}.`;
      }
    } else if (draft.type === 'quantity' || draft.type === 'duration') {
      if (!Number.isFinite(target) || target <= 0) errors.target = 'Set a target above 0.';
    } else if (draft.type === 'rating') {
      if (!Number.isFinite(target) || target < 1 || target > draft.ratingMax) {
        errors.target = `Pick a score between 1 and ${draft.ratingMax}.`;
      }
    }
  }

  if (draft.type === 'quantity' || draft.type === 'duration') {
    const step = finite(draft.step, Number.NaN);
    if (!Number.isFinite(step) || step <= 0) errors.step = 'The step must be above 0.';
  }

  if (showsSchedule(draft) && draft.schedule.length === 0) errors.schedule = 'Pick at least one day.';

  if (draft.type === 'quit') {
    const at = new Date(draft.quitStart).getTime();
    if (!Number.isFinite(at)) errors.quitStart = 'Pick when you quit.';
    else if (at > now.getTime() + 60_000) errors.quitStart = "The quit date can't be in the future.";
  }

  if (!isDayKeyLike(draft.startDate)) errors.startDate = 'Pick a valid start date.';

  return errors;
}

export function hasErrors(errors: DraftErrors): boolean {
  return Object.values(errors).some((e) => e !== undefined);
}

export function isDirty(a: Habit, b: Habit): boolean {
  const keys = Object.keys(a) as Array<keyof Habit>;
  for (const key of keys) {
    if (key === 'schedule') {
      if (a.schedule.length !== b.schedule.length || a.schedule.some((d, i) => d !== b.schedule[i])) return true;
    } else if (a[key] !== b[key]) {
      return true;
    }
  }
  return false;
}
