import type { BadgeProps } from '@/components/ui';
import type { DayStatus, Habit } from '@/types';

export type StatusTone = NonNullable<BadgeProps['tone']>;

export interface StatusMeta {
  label: string;
  tone: StatusTone;
  hint: string;
}

type HabitShape = Pick<Habit, 'type' | 'period' | 'kind'>;

export function statusMeta(status: DayStatus, habit: HabitShape): StatusMeta {
  const quit = habit.type === 'quit';
  const metric = habit.kind === 'metric';
  const periodic = !metric && !quit && habit.type !== 'rating' && habit.period !== 'day';
  const periodWord = habit.period === 'month' ? 'month' : 'week';

  switch (status) {
    case 'done':
      if (quit) return { label: 'Clean', tone: 'success', hint: 'No slip on this day.' };
      if (periodic)
        return { label: 'Counted', tone: 'success', hint: `Counts toward this ${periodWord}'s goal.` };
      return { label: 'Done', tone: 'success', hint: 'Goal met.' };
    case 'partial':
      return { label: 'Partial', tone: 'warning', hint: 'Logged, but short of the goal.' };
    case 'missed':
      if (quit) return { label: 'Slip', tone: 'danger', hint: 'A slip was logged this day.' };
      return { label: 'Missed', tone: 'danger', hint: "Due this day, but the goal wasn't met." };
    case 'skipped':
      return { label: 'Skipped', tone: 'neutral', hint: "Doesn't count against your streak." };
    case 'pending':
      return { label: 'Not yet', tone: 'accent', hint: "Due today. There's still time." };
    case 'notDue':
      return { label: 'Not scheduled', tone: 'neutral', hint: 'Not scheduled for this day.' };
    case 'future':
      return { label: 'Upcoming', tone: 'neutral', hint: "This day hasn't happened yet." };
    case 'beforeStart':
      return { label: 'Before start', tone: 'neutral', hint: 'Before you started tracking this habit.' };
    case 'logged':
      return { label: 'Logged', tone: 'habit', hint: 'A value was logged this day.' };
    default:
      return {
        label: metric ? 'No value' : periodic ? 'No contribution' : 'Nothing logged',
        tone: 'neutral',
        hint: 'Nothing logged this day.',
      };
  }
}

export function isEditableStatus(status: DayStatus): boolean {
  return status !== 'beforeStart' && status !== 'future';
}
