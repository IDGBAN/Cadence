import { useMemo } from 'react';
import type { AppData, DayCell, DayKey, Habit } from '@/types';
import type { EngineCtx } from '@/lib/habitMath';
import { dayCells } from '@/lib/habitMath';
import { addDays, formatDayShort } from '@/lib/dates';
import { formatPercent, formatValue } from '@/lib/format';
import { habitHex } from '@/lib/colors';
import { Heatmap, type HeatmapCell } from '@/components/charts/Heatmap';
import { STATUS_LABELS } from './shared';

export interface HabitHeatmapProps {
  habit: Habit;
  data: AppData;
  ctx: EngineCtx;
  weekStartsOn: 0 | 1;
  onDayClick: (day: DayKey) => void;
}

const DAYS = 364;

function intensityOf(habit: Habit, cell: DayCell): number | null {
  switch (cell.status) {
    case 'future':
    case 'beforeStart':
    case 'skipped':
      return null;
    case 'notDue':
      // unscheduled days only show up if something was logged anyway
      return cell.value === undefined ? null : cell.progress;
    case 'empty':
      return habit.kind === 'metric' ? null : 0;
    case 'pending':
      return cell.progress > 0 ? cell.progress : null;
    default:
      return cell.progress;
  }
}

export function HabitHeatmap({ habit, data, ctx, weekStartsOn, onDayClick }: HabitHeatmapProps) {
  const { cells, byDay, loggedDays } = useMemo(() => {
    const raw = dayCells(habit, data, addDays(ctx.today, -DAYS), ctx.today, ctx);
    const map = new Map<DayKey, DayCell>();
    let logged = 0;
    const mapped: HeatmapCell[] = raw.map((cell) => {
      map.set(cell.day, cell);
      if (cell.status === 'done' || cell.status === 'logged') logged++;
      return { day: cell.day, value: intensityOf(habit, cell), status: cell.status };
    });
    return { cells: mapped, byDay: map, loggedDays: logged };
  }, [habit, data, ctx]);

  const tooltip = (cell: HeatmapCell) => {
    const source = byDay.get(cell.day);
    const day = formatDayShort(cell.day);
    if (!source) return day;
    const value = habit.type === 'quit' ? '' : formatValue(habit, source.value);
    const detail = source.value !== undefined && value ? value : STATUS_LABELS[source.status];
    const score =
      source.status === 'partial' && source.progress > 0 ? ` · ${formatPercent(source.progress)}` : '';
    return (
      <span className="flex flex-col gap-0.5">
        <span>{day}</span>
        <span className="font-normal text-fg-2">
          {detail}
          {score}
        </span>
      </span>
    );
  };

  return (
    <section className="card p-4 sm:p-5" aria-label="Last 12 months">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-semibold leading-tight tracking-tight text-fg sm:text-lg">
            Last 12 months
          </h2>
          <p className="mt-0.5 text-xs text-fg-3">
            {loggedDays > 0 ? `${loggedDays} days logged. Click a square to edit it.` : 'Click a square to log that day.'}
          </p>
        </div>
      </div>
      <Heatmap
        cells={cells}
        color={habitHex(habit.color)}
        weekStartsOn={weekStartsOn}
        onDayClick={onDayClick}
        tooltip={tooltip}
      />
    </section>
  );
}
