import type { DayOverviewItem } from '@/lib/habitMath';
import { isPeriodGoal } from '@/components/today/shared';

// countsForDay only covers daily goals, so weekly/monthly goals and unlogged metrics are
// checked separately. quit habits never show up, there's nothing to go and do.
export function isUpNextToday(item: DayOverviewItem): boolean {
  if (item.completeForDay) return false;
  const { status } = item.cell;
  if (status === 'skipped' || status === 'beforeStart' || status === 'future') return false;
  return item.countsForDay || item.habit.kind === 'metric' || isPeriodGoal(item.habit);
}
