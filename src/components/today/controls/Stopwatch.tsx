import { Play, Square, X } from 'lucide-react';
import { motion } from 'motion/react';
import type { DayKey, Habit, RunningTimer } from '@/types';
import { Button, IconButton, cn, confirmDialog } from '@/components/ui';
import { formatDayShort } from '@/lib/dates';
import { formatStopwatch } from '@/lib/format';
import { cancelTimerWithFeedback, startTimerWithFeedback, stopTimerWithFeedback } from '@/lib/logActions';
import { useNow, useReducedMotion, useToday } from '@/store/hooks';
import { useStore } from '@/store/store';

export function timerElapsedMs(timer: RunningTimer, now: Date): number {
  const startedAt = Date.parse(timer.startedAt);
  return Number.isFinite(startedAt) ? Math.max(0, now.getTime() - startedAt) : 0;
}

// timers aren't in undo history and × sits right next to Stop, so confirm after a minute
export async function discardTimer(habit: Habit, timer: RunningTimer): Promise<void> {
  const elapsed = timerElapsedMs(timer, new Date());
  if (elapsed >= 60_000) {
    const ok = await confirmDialog({
      title: 'Discard this timer?',
      description: `${formatStopwatch(elapsed)} of ${habit.name} won’t be logged. Hit Stop instead if you want to keep it.`,
      confirmLabel: 'Discard time',
      cancelLabel: 'Keep timing',
      tone: 'danger',
      icon: '⏱️',
    });
    if (!ok) return;
  }
  cancelTimerWithFeedback(habit.id);
}

// ticks on its own so only the readout re-renders every second
export function StopwatchReadout({ timer, className }: { timer: RunningTimer; className?: string }) {
  const now = useNow(1000);
  return <span className={cn('tabular', className)}>{formatStopwatch(timerElapsedMs(timer, now))}</span>;
}

export interface StopwatchControlProps {
  habit: Habit;
  day: DayKey;
  size?: 'sm' | 'md';
  className?: string;
}

export function StopwatchControl({ habit, day, size = 'sm', className }: StopwatchControlProps) {
  const timer = useStore((s) => s.data.timers[habit.id]);
  const today = useToday();
  const reduced = useReducedMotion();

  if (timer) {
    return (
      <div className={cn('flex flex-col items-end gap-1', className)}>
        <motion.div
          role="timer"
          aria-label={`Timer running for ${habit.name}`}
          initial={reduced ? false : { opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-1.5 rounded-2xl border habit-border habit-tint py-1 pl-2.5 pr-1"
        >
          <span aria-hidden className="relative flex size-2 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full habit-fill opacity-70" />
            <span className="relative inline-flex size-2 rounded-full habit-fill" />
          </span>
          <StopwatchReadout
            timer={timer}
            className={cn('font-display font-semibold leading-none habit-text', size === 'md' ? 'text-lg' : 'text-base')}
          />
          <Button
            size="sm"
            variant="secondary"
            icon={<Square aria-hidden fill="currentColor" />}
            onClick={(e) => stopTimerWithFeedback(habit.id, e.currentTarget)}
          >
            Stop
          </Button>
          <IconButton label="Discard timer" size="sm" variant="ghost" onClick={() => void discardTimer(habit, timer)}>
            <X />
          </IconButton>
        </motion.div>
        {timer.day !== day && (
          <p className="text-xs text-fg-3">Running. The time goes to {formatDayShort(timer.day)}.</p>
        )}
      </div>
    );
  }

  // a stopwatch measures time spent now, so only offer it on today
  if (day !== today) return null;

  return (
    <Button
      size={size}
      variant="soft"
      className={className}
      icon={<Play aria-hidden />}
      onClick={() => startTimerWithFeedback(habit.id, today)}
    >
      Start timer
    </Button>
  );
}
