import type { CSSProperties } from 'react';
import type { DayCell, DayStatus, Habit } from '@/types';
import { habitStyle } from '@/lib/colors';
import { formatMonthDay } from '@/lib/dates';
import { formatPercent, pluralize } from '@/lib/format';
import { cn } from '@/components/ui';
import { tallyCells, useHabitCells } from './useHabitCells';

const STATUS_WORD: Record<DayStatus, string> = {
  done: 'Done',
  partial: 'Partial',
  missed: 'Missed',
  skipped: 'Skipped',
  pending: 'Due today',
  notDue: 'Not scheduled',
  future: 'Upcoming',
  beforeStart: 'Before you started',
  logged: 'Logged',
  empty: 'Nothing logged',
};

function fillFor(status: DayStatus): string {
  switch (status) {
    case 'done':
      return 'var(--habit)';
    case 'logged':
      return 'color-mix(in oklab, var(--habit) 68%, transparent)';
    case 'partial':
      return 'color-mix(in oklab, var(--habit) 50%, transparent)';
    case 'pending':
      return 'color-mix(in oklab, var(--habit) 26%, transparent)';
    case 'missed':
      return 'color-mix(in oklab, var(--danger) 46%, transparent)';
    case 'skipped':
      return 'color-mix(in oklab, var(--fg) 16%, transparent)';
    default:
      return 'color-mix(in oklab, var(--fg) 8%, transparent)';
  }
}

function heightFor(cell: DayCell): string {
  switch (cell.status) {
    case 'done':
    case 'logged':
    case 'missed':
    case 'skipped':
      return '100%';
    case 'partial':
    case 'pending':
      return `${Math.round(Math.min(1, Math.max(0.22, cell.progress)) * 100)}%`;
    default:
      return '38%';
  }
}

export interface HabitStripProps {
  habit: Habit;
  days?: number;
  className?: string;
}

export function HabitStrip({ habit, days = 30, className }: HabitStripProps) {
  const cells = useHabitCells(habit, days);
  const tally = tallyCells(cells);
  const rate = tally.evaluated > 0 ? tally.done / tally.evaluated : 0;

  const label =
    habit.kind === 'metric'
      ? tally.logged > 0
        ? `Last ${days} days: logged on ${pluralize(tally.logged, 'day')}`
        : `Last ${days} days: nothing logged yet`
      : tally.evaluated > 0
        ? `Last ${days} days: ${tally.done} of ${tally.evaluated} done (${formatPercent(rate)})`
        : `Last ${days} days: nothing counted yet`;

  return (
    <div
      role="img"
      aria-label={label}
      title={label}
      style={habitStyle(habit.color)}
      className={cn('flex h-6 items-end gap-px', className)}
    >
      {cells.map((cell) => {
        const style: CSSProperties = { height: heightFor(cell), background: fillFor(cell.status) };
        return (
          <span
            key={cell.day}
            aria-hidden
            title={`${formatMonthDay(cell.day)} · ${STATUS_WORD[cell.status]}`}
            className={cn('min-w-[2px] flex-1 rounded-[2px]', cell.status === 'skipped' && 'stripes')}
            style={style}
          />
        );
      })}
    </div>
  );
}
