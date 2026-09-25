import type { Habit } from '@/types';
import { habitFromTemplate, type HabitTemplate } from '@/lib/defaults';
import { habitHex } from '@/lib/colors';
import { confettiFromElement, haptic, playSound } from '@/lib/feedback';
import { pluralize } from '@/lib/format';
import { undoAction } from '@/lib/logActions';
import { actions, getData } from '@/store/store';
import { toast, useUI } from '@/store/ui';
import { confirmDialog } from '@/components/ui';
import { MOD_KEY } from '@/components/layout/platform';

export function nextHabitOrder(): number {
  return getData().habits.reduce((max, h) => Math.max(max, h.order), -1) + 1;
}

// relapses count as logged days too
export function loggedDayCount(habitId: string): number {
  const logs = getData().logs[habitId];
  const relapses = getData().relapses.filter((r) => r.habitId === habitId).length;
  return (logs ? Object.keys(logs).length : 0) + relapses;
}

export function celebrateCreation(habit: Habit, sourceEl?: Element | null): void {
  playSound('complete');
  confettiFromElement(sourceEl ?? null, [habitHex(habit.color)]);
  haptic([10, 30, 10]);
  toast({
    title: `${habit.name} added`,
    description: "It's on your Today list.",
    tone: 'success',
    icon: habit.icon,
    action: { label: 'Edit', onClick: () => useUI.getState().openHabitEditor(habit.id) },
  });
}

export function createFromTemplate(template: HabitTemplate, sourceEl?: Element | null): Habit {
  const habit = habitFromTemplate(template, nextHabitOrder(), getData().settings.dayStartHour);
  actions().addHabit(habit);
  celebrateCreation(habit, sourceEl);
  return habit;
}

export function duplicateHabitWithToast(habit: Habit): Habit | undefined {
  const copy = actions().duplicateHabit(habit.id);
  if (!copy) return undefined;
  toast({
    title: `Duplicated ${habit.name}`,
    description: 'The copy starts with no history.',
    icon: copy.icon,
    action: { label: 'Edit', onClick: () => useUI.getState().openHabitEditor(copy.id) },
  });
  return copy;
}

export function setHabitArchived(habit: Habit, archived: boolean): void {
  const before = getData();
  actions().setArchived(habit.id, archived);
  // nothing is committed if it was already in that state, so there's nothing to undo
  const changed = getData() !== before;
  toast({
    title: archived ? `${habit.name} archived` : `${habit.name} restored`,
    description: archived ? "Its history is kept, but it's out of your stats." : "It's back on your Today list.",
    icon: habit.icon,
    tone: archived ? 'default' : 'success',
    ...(changed ? { action: undoAction() } : {}),
  });
}

// undo history is in memory only, so a deleted habit is gone for good after a reload
export async function confirmDeleteHabit(habit: Habit): Promise<boolean> {
  const days = loggedDayCount(habit.id);
  const history = days > 0 ? `${pluralize(days, 'logged day')} will be deleted with it. ` : '';
  const confirmed = await confirmDialog({
    title: `Delete ${habit.name}?`,
    description:
      `${history}You can undo right away (Undo or ${MOD_KEY}+Z), but after a reload it's gone for good. ` +
      'Type the name to confirm, or archive it instead to keep the history.',
    confirmLabel: 'Delete habit',
    tone: 'danger',
    icon: habit.icon,
    requireText: habit.name,
  });
  if (!confirmed) return false;
  const before = getData();
  actions().deleteHabit(habit.id);
  if (getData() === before) return false;
  toast({
    title: `${habit.name} deleted`,
    description: days > 0 ? `${pluralize(days, 'logged day')} went with it.` : undefined,
    tone: 'danger',
    icon: '🗑️',
    duration: 8000,
    action: undoAction(),
  });
  return true;
}
