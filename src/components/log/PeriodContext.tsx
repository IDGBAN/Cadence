import { useMemo } from 'react';
import type { DayKey, DayStatus, Habit } from '@/types';
import { formatDayShort, formatRange, fromDayKey, WEEKDAY_SHORT } from '@/lib/dates';
import { formatMinutes, formatNumber, formatValueCompact } from '@/lib/format';
import { dayCells, periodProgress } from '@/lib/habitMath';
import { useData, useEngineCtx } from '@/store/hooks';
import { ProgressBar, cn } from '@/components/ui';

export interface PeriodContextProps {
  habit: Habit;
  day: DayKey;
  onSelectDay: (day: DayKey) => void;
}

function achievedText(habit: Habit, achieved: number, target: number): string {
  if (habit.type === 'duration') return `${formatMinutes(achieved)} / ${formatMinutes(target)}`;
  if (habit.type === 'check') return `${formatNumber(achieved, 0)} / ${formatNumber(target, 0)} days`;
  const unit = (habit.unit ?? '').trim();
  const numbers = `${formatNumber(achieved, 1)} / ${formatNumber(target, 1)}`;
  return unit ? `${numbers} ${unit}` : numbers;
}

const dotClass = (status: DayStatus, selected: boolean): string =>
  cn(
    'relative flex size-8 shrink-0 items-center justify-center rounded-[10px] border text-[11px] font-semibold leading-none tabular',
    'transition-[background-color,border-color,color] duration-150 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
    status === 'done' && 'habit-tint-strong habit-border habit-text',
    status === 'skipped' && 'stripes border-line text-fg-4',
    status === 'future' && 'border-dashed border-line text-fg-4',
    status === 'beforeStart' && 'border-line/60 text-fg-4',
    (status === 'empty' || status === 'missed' || status === 'partial' || status === 'pending' || status === 'notDue' || status === 'logged') &&
      'border-line bg-surface-3 text-fg-3 light:bg-surface-2',
    selected && 'ring-2 ring-accent ring-offset-2 ring-offset-surface',
  );

export function PeriodContext({ habit, day, onSelectDay }: PeriodContextProps) {
  const data = useData();
  const ctx = useEngineCtx();

  const progress = useMemo(() => periodProgress(habit, data, day, ctx), [habit, data, day, ctx]);
  const cells = useMemo(
    () => dayCells(habit, data, progress.start, progress.end, ctx),
    [habit, data, progress.start, progress.end, ctx],
  );

  const monthly = habit.period === 'month';
  const title = progress.current ? (monthly ? 'This month' : 'This week') : formatRange(progress.start, progress.end);
  const segments = habit.type === 'check' ? Math.round(progress.target) : 0;

  return (
    <section
      aria-label={`${monthly ? 'Month' : 'Week'} progress`}
      className="rounded-2xl border border-line bg-surface-2 p-4 light:bg-surface"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-display text-[15px] font-semibold tracking-tight text-fg">{title}</div>
          {progress.current && (
            <div className="mt-0.5 truncate text-[11px] text-fg-4 tabular">
              {formatRange(progress.start, progress.end)}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-base font-semibold tracking-tight text-fg tabular">
            {achievedText(habit, progress.achieved, progress.target)}
          </div>
          <div className={cn('mt-0.5 text-[11px] font-semibold', progress.success ? 'text-success' : 'text-fg-4')}>
            {progress.success ? 'Goal met' : `${formatNumber(progress.progress * 100, 0)}%`}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <ProgressBar
          value={progress.progress}
          height={10}
          glow={progress.success}
          segments={segments > 1 && segments <= 31 ? segments : undefined}
          gapColor="var(--surface-2)"
          aria-label={`${monthly ? 'Month' : 'Week'} progress`}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {cells.map((cell) => {
          const selected = cell.day === day;
          const label = monthly ? String(fromDayKey(cell.day).getDate()) : WEEKDAY_SHORT[fromDayKey(cell.day).getDay()][0];
          const value = formatValueCompact(habit, cell.value);
          return (
            <button
              key={cell.day}
              type="button"
              aria-current={selected ? 'date' : undefined}
              title={`${formatDayShort(cell.day)}${value ? ` · ${value}` : ''}`}
              aria-label={`${formatDayShort(cell.day)}${value ? `, ${value}` : ''}`}
              onClick={() => onSelectDay(cell.day)}
              className={dotClass(cell.status, selected)}
            >
              {label}
              {cell.status === 'done' && (
                <span aria-hidden className="habit-fill absolute -bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
