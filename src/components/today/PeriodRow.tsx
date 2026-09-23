import { useMemo } from 'react';
import type { DayKey, Habit, PeriodProgress } from '@/types';
import { ProgressBar, Tooltip, cn } from '@/components/ui';
import { eachDay, formatDayShort } from '@/lib/dates';
import { formatPercent, periodNoun } from '@/lib/format';
import { dayCells } from '@/lib/habitMath';
import { useData, useEngineCtx } from '@/store/hooks';
import { barSegments, periodSummary } from './shared';

export interface PeriodRowProps {
  habit: Habit;
  day: DayKey;
  today: DayKey;
  period: PeriodProgress;
  onSelectDay: (day: DayKey) => void;
  className?: string;
}

const DOT_TONES: Record<string, string> = {
  done: 'habit-fill',
  skipped: 'stripes bg-surface-3',
  missed: 'bg-danger/35',
  empty: 'bg-surface-3',
};

export function PeriodRow({ habit, day, today, period, onSelectDay, className }: PeriodRowProps) {
  const data = useData();
  const ctx = useEngineCtx();

  const cells = useMemo(
    () => dayCells(habit, data, period.start, period.end, ctx),
    [habit, data, period.start, period.end, ctx],
  );
  const byDay = useMemo(() => new Map(cells.map((c) => [c.day, c])), [cells]);
  const days = useMemo(() => eachDay(period.start, period.end), [period.start, period.end]);

  const segments = habit.type === 'check' ? barSegments(period.target) : undefined;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-fg-2 tabular">
          {periodSummary(habit, period)} <span className="font-normal text-fg-3">{periodNoun(habit.period)}</span>
        </span>
        <span className={cn('tabular', period.success ? 'habit-text font-semibold' : 'text-fg-3')}>
          {period.success ? 'Goal met' : formatPercent(period.progress)}
        </span>
      </div>

      <ProgressBar
        value={period.progress}
        height={8}
        segments={segments}
        glow={period.success}
        aria-label={`${habit.name} ${periodNoun(habit.period)}: ${periodSummary(habit, period)}`}
      />

      <div className="flex flex-wrap items-center gap-1">
        {days.map((d) => {
          const cell = byDay.get(d);
          const status = cell?.status ?? 'empty';
          const future = d > today;
          const selected = d === day;
          const tone = DOT_TONES[status] ?? 'bg-surface-3';

          return (
            <Tooltip
              key={d}
              content={`${formatDayShort(d)}: ${
                status === 'done' ? 'counted' : status === 'skipped' ? 'skipped' : future ? 'upcoming' : 'nothing logged'
              }`}
            >
              <button
                type="button"
                disabled={future}
                aria-label={`Go to ${formatDayShort(d)}`}
                onClick={() => onSelectDay(d)}
                className={cn(
                  'relative size-4 shrink-0 rounded-[5px] border transition-[transform,background-color,border-color] duration-150',
                  'pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                  future ? 'border-line bg-transparent opacity-45' : 'border-transparent hover:scale-110',
                  !future && tone,
                  selected && 'ring-2 ring-accent/70 ring-offset-1 ring-offset-[var(--surface)]',
                  d === today && !selected && 'border-line-strong',
                )}
              />
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
