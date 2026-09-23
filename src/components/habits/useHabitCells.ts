import { useMemo } from 'react';
import type { AppData, DayCell, Habit } from '@/types';
import { addDays } from '@/lib/dates';
import { dayCells } from '@/lib/habitMath';
import { useEngineCtx } from '@/store/hooks';
import { getData, useStore } from '@/store/store';

// memoized on this habit's own logs so a long list doesn't recompute on unrelated writes
export function useHabitCells(habit: Habit, days: number): DayCell[] {
  const ctx = useEngineCtx();
  const logs = useStore((s) => s.data.logs[habit.id]);
  const relapses = useStore((s) => (habit.type === 'quit' ? s.data.relapses : undefined));

  return useMemo(() => {
    const end = ctx.today;
    const start = addDays(end, -(Math.max(1, days) - 1));
    // dayCells only reads this habit's logs and relapses, so a trimmed copy is enough
    const data: AppData = {
      ...getData(),
      logs: logs ? { [habit.id]: logs } : {},
      relapses: relapses ?? [],
    };
    return dayCells(habit, data, start, end, ctx);
  }, [habit, logs, relapses, ctx, days]);
}

export interface CellTally {
  done: number;
  missed: number;
  // done + partial + missed, i.e. the completion rate denominator
  evaluated: number;
  skipped: number;
  // track-only days with a value
  logged: number;
}

export function tallyCells(cells: readonly DayCell[]): CellTally {
  const tally: CellTally = { done: 0, missed: 0, evaluated: 0, skipped: 0, logged: 0 };
  for (const cell of cells) {
    if (cell.status === 'done') {
      tally.done += 1;
      tally.evaluated += 1;
    } else if (cell.status === 'missed' || cell.status === 'partial') {
      tally.missed += 1;
      tally.evaluated += 1;
    } else if (cell.status === 'skipped') {
      tally.skipped += 1;
    } else if (cell.status === 'logged') {
      tally.logged += 1;
    }
  }
  return tally;
}
