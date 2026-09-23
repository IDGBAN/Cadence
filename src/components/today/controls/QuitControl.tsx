// live counter on today; on a past day it shows what happened that day and slips are logged there
import { useMemo, useState } from 'react';
import { HeartCrack, Trophy } from 'lucide-react';
import { motion } from 'motion/react';
import type { DayKey, Habit } from '@/types';
import { Button, ProgressBar, cn } from '@/components/ui';
import { formatDayShort } from '@/lib/dates';
import { formatElapsed, formatPercent, pluralize } from '@/lib/format';
import { relapsesOnDay } from '@/components/log/quitDay';
import { useData, useQuitStats, useReducedMotion, useSettings } from '@/store/hooks';
import { milestoneLabel, springSnappy } from '../shared';
import { RelapseDialog } from './RelapseDialog';

export interface QuitControlProps {
  habit: Habit;
  day: DayKey;
  today: DayKey;
  className?: string;
}

export function QuitControl({ habit, day, today, className }: QuitControlProps) {
  const isToday = day === today;
  const stats = useQuitStats(habit.id, isToday ? 1000 : 0);
  const data = useData();
  const { dayStartHour } = useSettings();
  const reduced = useReducedMotion();
  const [dialogOpen, setDialogOpen] = useState(false);

  const relapses = useMemo(
    () => (isToday ? [] : relapsesOnDay(data, habit.id, day, dayStartHour)),
    [isToday, data, habit.id, day, dayStartHour],
  );

  if (!stats) return null;

  const { currentMs, bestMs, milestone, cleanRate, attempts } = stats;
  const isBest = currentMs >= bestMs && currentMs > 0;
  const clean = relapses.length === 0;

  const slipButton = (
    <Button
      size="sm"
      variant="ghost"
      icon={<HeartCrack aria-hidden />}
      onClick={() => setDialogOpen(true)}
      className="text-fg-3 hover:text-fg"
    >
      I slipped
    </Button>
  );

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {isToday ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <p className="eyebrow mb-1">Clean for</p>
              <motion.p
                key={stats.runStartedAt}
                initial={reduced ? false : { scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={springSnappy}
                className="font-display text-2xl font-semibold leading-none tracking-tight tabular habit-text sm:text-[28px]"
              >
                {formatElapsed(currentMs, 'full')}
              </motion.p>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-fg-3">
              <Trophy aria-hidden className={cn('size-3.5', isBest ? 'text-flame' : 'text-fg-4')} />
              <span className="tabular">
                {isBest ? 'Your best run yet' : `Best ${formatElapsed(bestMs, 'compact')}`}
              </span>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
              <span className="text-fg-3">{milestoneLabel(milestone.next)}</span>
              <span className="tabular text-fg-3">{formatPercent(milestone.progress)}</span>
            </div>
            <ProgressBar
              value={milestone.progress}
              height={8}
              aria-label={`Progress to the ${pluralize(milestone.next, 'day')} milestone`}
            />
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="eyebrow mb-1">{formatDayShort(day)}</p>
            <p
              className={cn(
                'font-display text-xl font-semibold leading-none tracking-tight sm:text-2xl',
                clean ? 'text-success' : 'text-danger',
              )}
            >
              {clean ? 'Clean day' : pluralize(relapses.length, 'slip')}
            </p>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-fg-3">
            <Trophy aria-hidden className="size-3.5 text-fg-4" />
            <span className="tabular">Best {formatElapsed(bestMs, 'compact')}</span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fg-3 tabular">
          {formatPercent(cleanRate)} clean days · {pluralize(attempts, 'attempt')}
        </p>
        {slipButton}
      </div>

      <RelapseDialog
        habit={habit}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        day={day}
        today={today}
        currentMs={currentMs}
      />
    </div>
  );
}
