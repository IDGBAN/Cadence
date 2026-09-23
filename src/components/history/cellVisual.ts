import type { DayCell, DayStatus, Habit } from '@/types';
import { formatDayShort } from '@/lib/dates';
import { formatValue, formatValueCompact } from '@/lib/format';
import { statusMeta } from '@/components/log/statusMeta';

export type CellGlyph = 'check' | 'value' | 'dot' | 'cross' | 'none';

export interface CellVisual {
  box: string;
  glyph: CellGlyph;
  fill: number;
  blank: boolean;
}

const BOX: Record<DayStatus, string> = {
  done: 'habit-tint-strong habit-border habit-text',
  logged: 'habit-tint habit-border habit-text',
  partial: 'habit-tint border-[color-mix(in_oklab,var(--habit)_28%,transparent)] habit-text',
  missed: 'border-danger/25 bg-danger/10 text-danger',
  skipped: 'stripes border-line text-fg-4',
  pending: 'border-dashed border-line-strong bg-surface-2 text-fg-4 light:bg-surface',
  notDue: 'border-transparent bg-transparent text-fg-4',
  empty: 'border-line bg-surface-2 text-fg-4 light:bg-surface',
  future: 'border-transparent bg-transparent text-fg-4',
  beforeStart: 'border-transparent bg-transparent text-fg-4',
};

function glyphFor(habit: Habit, cell: DayCell): CellGlyph {
  switch (cell.status) {
    case 'done':
      if (habit.type === 'quit') return 'dot';
      if (habit.type === 'check') return 'check';
      return formatValueCompact(habit, cell.value) ? 'value' : 'check';
    case 'logged':
    case 'partial':
      return formatValueCompact(habit, cell.value) ? 'value' : 'dot';
    case 'missed':
      if (habit.type === 'quit') return 'cross';
      return formatValueCompact(habit, cell.value) ? 'value' : 'none';
    case 'notDue':
      return 'dot';
    default:
      return 'none';
  }
}

export function statusBox(status: DayStatus): string {
  return BOX[status] ?? BOX.empty;
}

export function cellVisual(habit: Habit, cell: DayCell): CellVisual {
  return {
    box: BOX[cell.status] ?? BOX.empty,
    glyph: glyphFor(habit, cell),
    fill: cell.status === 'partial' ? Math.min(1, Math.max(0, cell.progress)) : 0,
    blank: cell.status === 'future' || cell.status === 'beforeStart',
  };
}

export function cellText(habit: Habit, cell: DayCell): string {
  return formatValueCompact(habit, cell.value);
}

// e.g. "Go to the Gym, Thu, Sep 17: Done, 45m"
export function cellLabel(habit: Habit, cell: DayCell): string {
  const meta = statusMeta(cell.status, habit);
  const value = cell.value === undefined ? '' : formatValue(habit, cell.value);
  const detail = value && value !== '—' && value !== meta.label ? `, ${value}` : '';
  return `${habit.name}, ${formatDayShort(cell.day)}: ${meta.label}${detail}`;
}

export const LEGEND: Array<{ status: DayStatus; label: string; description: string }> = [
  { status: 'done', label: 'Done', description: 'Goal met, or the day counted toward a weekly goal.' },
  { status: 'partial', label: 'Partial', description: 'Logged, but short of the goal.' },
  { status: 'missed', label: 'Missed', description: 'Due that day, but not done.' },
  { status: 'pending', label: 'Today', description: 'Due today and still open.' },
  { status: 'skipped', label: 'Skipped', description: 'Never counts against a streak.' },
  { status: 'empty', label: 'Nothing', description: 'Nothing logged.' },
  { status: 'notDue', label: 'Not scheduled', description: 'Not due on that weekday.' },
];
