// only StopwatchReadout ticks, so the shell doesn't re-render every second
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Square } from 'lucide-react';
import type { Habit, RunningTimer } from '@/types';
import { HabitIcon, IconButton, Tooltip, cn } from '@/components/ui';
import { habitStyle } from '@/lib/colors';
import { stopTimerWithFeedback } from '@/lib/logActions';
import { useReducedMotion } from '@/store/hooks';
import { useStore } from '@/store/store';
import { StopwatchReadout } from '@/components/today/controls/Stopwatch';

interface ActiveTimer {
  habit: Habit;
  timer: RunningTimer;
}

export function useRunningTimers(): ActiveTimer[] {
  const timers = useStore((s) => s.data.timers);
  const habits = useStore((s) => s.data.habits);
  return useMemo(() => {
    const byId = new Map(habits.map((h) => [h.id, h]));
    return Object.values(timers)
      .flatMap((timer) => {
        const habit = byId.get(timer.habitId);
        return habit ? [{ habit, timer }] : [];
      })
      .sort((a, b) => (a.timer.startedAt < b.timer.startedAt ? -1 : 1));
  }, [timers, habits]);
}

function PulseDot() {
  return (
    <span aria-hidden className="relative flex size-2 shrink-0">
      <span className="absolute inline-flex size-full animate-ping rounded-full habit-fill opacity-70" />
      <span className="relative inline-flex size-2 rounded-full habit-fill" />
    </span>
  );
}

function StopButton({ habit, size = 'sm' }: { habit: Habit; size?: 'xs' | 'sm' }) {
  return (
    <IconButton
      label={`Stop the ${habit.name} timer and log it`}
      size={size}
      variant="soft"
      onClick={(e) => stopTimerWithFeedback(habit.id, e.currentTarget)}
    >
      <Square aria-hidden fill="currentColor" />
    </IconButton>
  );
}

const ENTER = {
  initial: { opacity: 0, y: -6, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6, scale: 0.96 },
  transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
} as const;

export function SidebarTimers() {
  const running = useRunningTimers();
  const reduced = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {running.length > 0 && (
        <motion.div
          key="timers"
          {...(reduced ? {} : ENTER)}
          className="flex flex-col gap-2"
          role="region"
          aria-label="Running timers"
        >
          {running.map(({ habit, timer }) => (
            <div
              key={habit.id}
              role="timer"
              aria-label={`${habit.name} timer running`}
              style={habitStyle(habit.color)}
              className="flex flex-col items-center gap-1.5 rounded-2xl border habit-border habit-tint p-2 lg:flex-row lg:gap-2.5 lg:py-2 lg:pl-2 lg:pr-1.5"
            >
              <Tooltip content={`${habit.name} · go to Today`} side="right">
                <Link to="/" className="flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-xl lg:flex-row lg:gap-2.5">
                  <HabitIcon habit={habit} size="sm" />
                  <span className="flex min-w-0 flex-col items-center lg:items-start">
                    <span className="hidden max-w-full truncate text-xs font-medium text-fg-2 lg:block">{habit.name}</span>
                    <span className="flex items-center gap-1.5">
                      <PulseDot />
                      <StopwatchReadout
                        timer={timer}
                        className="font-display text-[13px] font-semibold leading-none habit-text lg:text-sm"
                      />
                    </span>
                  </span>
                </Link>
              </Tooltip>
              <StopButton habit={habit} />
            </div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function HeaderTimer({ className }: { className?: string }) {
  const running = useRunningTimers();
  const first = running[0];
  if (!first) return null;
  const { habit, timer } = first;
  const more = running.length - 1;

  return (
    <div
      role="timer"
      aria-label={`${habit.name} timer running${more > 0 ? `, and ${more} more` : ''}`}
      style={habitStyle(habit.color)}
      className={cn('flex h-10 items-center gap-1.5 rounded-full border habit-border habit-tint pl-2.5 pr-1', className)}
    >
      <Link to="/" aria-label={`${habit.name} timer, go to Today`} className="flex items-center gap-1.5 rounded-full">
        <PulseDot />
        <StopwatchReadout timer={timer} className="font-display text-sm font-semibold leading-none habit-text" />
        {more > 0 && <span className="text-[11px] font-semibold text-fg-3">+{more}</span>}
      </Link>
      <StopButton habit={habit} size="xs" />
    </div>
  );
}
