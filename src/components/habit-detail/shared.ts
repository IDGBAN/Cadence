import type { DayCell, DayKey, DayStatus, Habit } from '@/types';
import { addDays, diffDays } from '@/lib/dates';

export const STATUS_LABELS: Record<DayStatus, string> = {
  done: 'Done',
  partial: 'Partial',
  missed: 'Missed',
  skipped: 'Skipped',
  pending: 'Due today',
  notDue: 'Not scheduled',
  future: 'Upcoming',
  beforeStart: 'Before start',
  logged: 'Logged',
  empty: 'Nothing logged',
};

// needs --habit set on an ancestor
export function statusCellClass(status: DayStatus): string {
  switch (status) {
    case 'done':
      return 'habit-tint-strong habit-border text-fg';
    case 'logged':
      return 'habit-tint habit-border text-fg';
    case 'partial':
      return 'habit-tint border-[color-mix(in_oklab,var(--habit)_34%,transparent)] text-fg';
    case 'missed':
      return 'border-danger/35 bg-danger/8 text-fg-2';
    case 'skipped':
      return 'stripes border-line bg-surface-2 text-fg-3';
    case 'pending':
      return 'border-dashed habit-border bg-surface-2 text-fg-2';
    case 'notDue':
      return 'border-line/60 bg-surface-2/40 text-fg-4';
    case 'future':
      return 'border-line/40 bg-surface/30 text-fg-4';
    case 'beforeStart':
      return 'border-transparent bg-transparent text-fg-4';
    default:
      return 'border-line bg-surface-2 text-fg-3';
  }
}

export function statusSwatchClass(status: DayStatus): string {
  switch (status) {
    case 'done':
      return 'habit-fill';
    case 'partial':
      return 'habit-tint-strong habit-border border';
    case 'missed':
      return 'bg-danger/25 border border-danger/45';
    case 'skipped':
      return 'stripes border border-line bg-surface-2';
    case 'pending':
      return 'border border-dashed habit-border bg-surface-2';
    default:
      return 'border border-line bg-surface-2';
  }
}

export type RangeValue = '30d' | '90d' | '1y' | 'all';

export const DETAIL_RANGES: Array<{ value: RangeValue; label: string; days: number | null }> = [
  { value: '30d', label: '30D', days: 30 },
  { value: '90d', label: '90D', days: 90 },
  { value: '1y', label: '1Y', days: 365 },
  { value: 'all', label: 'All', days: null },
];

export function rangeStartDay(range: RangeValue, today: DayKey, historyStart: DayKey): DayKey {
  const option = DETAIL_RANGES.find((r) => r.value === range);
  if (!option || option.days === null) return historyStart;
  const start = addDays(today, -(option.days - 1));
  return start < historyStart ? historyStart : start;
}

export function rangeLabel(range: RangeValue): string {
  switch (range) {
    case '30d':
      return 'last 30 days';
    case '90d':
      return 'last 90 days';
    case '1y':
      return 'last 12 months';
    default:
      return 'all time';
  }
}

export function movingAverage(values: Array<number | null>, window: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  const queue: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (value !== null && Number.isFinite(value)) {
      queue.push(value);
      sum += value;
      if (queue.length > window) sum -= queue.shift() ?? 0;
    }
    out[i] = queue.length >= Math.min(window, 3) ? sum / queue.length : null;
  }
  return out;
}

export interface StreakRun {
  start: DayKey;
  end: DayKey;
  length: number;
}

// same rules as the streak engine: skipped, unscheduled and bonus days don't break a run
export function streakRuns(cells: DayCell[], isScheduled: (day: DayKey) => boolean): StreakRun[] {
  const runs: StreakRun[] = [];
  let start: DayKey | null = null;
  let end: DayKey | null = null;
  let length = 0;

  const flush = () => {
    if (start && end && length > 0) runs.push({ start, end, length });
    start = null;
    end = null;
    length = 0;
  };

  for (const cell of cells) {
    const { status, day } = cell;
    if (status === 'done') {
      if (!isScheduled(day)) continue;
      if (!start) start = day;
      end = day;
      length++;
    } else if (status === 'skipped' || status === 'notDue' || status === 'pending' || status === 'future') {
    } else {
      flush();
    }
  }
  flush();

  return runs.sort((a, b) => b.length - a.length || (a.start < b.start ? 1 : -1));
}

export function quitRunLengths(quitStartMs: number, relapseTimes: number[], nowMs: number): number[] {
  const bounds = [quitStartMs, ...relapseTimes.filter((t) => t >= quitStartMs && t <= nowMs).sort((a, b) => a - b), nowMs];
  const runs: number[] = [];
  for (let i = 1; i < bounds.length; i++) runs.push(Math.max(0, (bounds[i] - bounds[i - 1]) / 86_400_000));
  return runs;
}

export function daySpan(start: DayKey, end: DayKey): number {
  return Math.max(0, diffDays(start, end) + 1);
}

export function hasValueTrend(habit: Habit): boolean {
  return habit.type === 'quantity' || habit.type === 'duration' || habit.type === 'rating';
}
