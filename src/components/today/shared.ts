import type { Transition } from 'motion/react';
import type { DayKey, Habit, PeriodProgress } from '@/types';
import type { DayOverviewItem } from '@/lib/habitMath';
import { formatMinutes, formatNumber, pluralize } from '@/lib/format';

export const springPress: Transition = { type: 'spring', stiffness: 520, damping: 30, mass: 0.6 };
export const springSnappy: Transition = { type: 'spring', stiffness: 460, damping: 34, mass: 0.7 };
export const easeOut = [0.22, 1, 0.36, 1] as const;

export function cardEntrance(index: number, reduced: boolean) {
  if (reduced) return { initial: false as const, animate: { opacity: 1, y: 0 }, transition: { duration: 0 } };
  return {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: 0.36,
      ease: easeOut,
      delay: Math.min(index, 10) * 0.035,
      // own transition so the stagger delay doesn't slow down reorders
      layout: springSnappy,
    },
  };
}

export function isPeriodGoal(habit: Habit): boolean {
  return habit.kind === 'goal' && habit.type !== 'rating' && habit.type !== 'quit' && habit.period !== 'day';
}

export type CardState = 'done' | 'partial' | 'skipped' | 'missed' | 'pending' | 'logged' | 'neutral';

export function cardState(item: DayOverviewItem): CardState {
  const { habit, cell, completeForDay } = item;
  if (cell.status === 'skipped') return 'skipped';
  if (habit.type === 'quit') return cell.status === 'missed' ? 'missed' : 'neutral';
  if (habit.kind === 'metric') return cell.status === 'logged' ? 'logged' : 'neutral';
  if (completeForDay) return 'done';
  if (cell.status === 'missed') return 'missed';
  if (cell.status === 'partial') return 'partial';
  return 'pending';
}

export function stateLabel(state: CardState): string {
  switch (state) {
    case 'skipped':
      return 'Skipped';
    case 'missed':
      return 'Missed';
    case 'logged':
      return 'Logged';
    default:
      return '';
  }
}

export function loggedValue(item: DayOverviewItem): number {
  const { cell } = item;
  if (cell.status === 'skipped') return 0;
  return typeof cell.value === 'number' && Number.isFinite(cell.value) ? cell.value : 0;
}

// "3 / 5 days", "1h 30m / 5h", "12 / 20 pages"
export function periodSummary(habit: Habit, p: PeriodProgress): string {
  if (habit.type === 'duration') return `${formatMinutes(p.achieved)} / ${formatMinutes(p.target)}`;
  if (habit.type === 'check') return `${formatNumber(p.achieved, 0)} / ${formatNumber(Math.ceil(p.target), 0)} days`;
  const unit = (habit.unit ?? '').trim();
  const amount = `${formatNumber(p.achieved, 2)} / ${formatNumber(p.target, 1)}`;
  return unit ? `${amount} ${unit}` : amount;
}

export function milestoneLabel(next: number): string {
  return `Next milestone: ${pluralize(next, 'day')}`;
}

export function barSegments(target: number): number | undefined {
  const n = Math.round(target);
  return Number.isFinite(n) && n > 1 && n <= 12 ? n : undefined;
}

export function dayKeyOf(habit: Habit, day: DayKey): string {
  return `${habit.id}:${day}`;
}
