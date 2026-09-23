import { Check } from 'lucide-react';
import { motion } from 'motion/react';
import type { DayKey, Habit } from '@/types';
import { cn } from '@/components/ui';
import { toggleCheckWithFeedback } from '@/lib/logActions';
import { useReducedMotion } from '@/store/hooks';
import { springPress, springSnappy } from '../shared';

export interface CheckControlProps {
  habit: Habit;
  day: DayKey;
  done: boolean;
  size?: 'md' | 'lg';
  className?: string;
}

export function CheckControl({ habit, day, done, size = 'md', className }: CheckControlProps) {
  const reduced = useReducedMotion();

  return (
    <motion.button
      type="button"
      aria-pressed={done}
      aria-label={done ? `Mark ${habit.name} as not done` : `Mark ${habit.name} as done`}
      onClick={(e) => toggleCheckWithFeedback(habit.id, day, e.currentTarget)}
      whileTap={reduced ? undefined : { scale: 0.88 }}
      transition={springPress}
      className={cn(
        'relative isolate flex shrink-0 items-center justify-center rounded-full',
        'border-2 transition-colors duration-200',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        size === 'lg' ? 'size-13' : 'size-11',
        done
          ? 'habit-border habit-glow'
          : 'border-line-strong text-fg-4 hover:border-[color-mix(in_oklab,var(--habit)_55%,transparent)] hover:text-[var(--habit)]',
        className,
      )}
    >
      <motion.span
        aria-hidden
        className="absolute inset-0 -z-10 rounded-full habit-gradient"
        initial={false}
        animate={{ scale: done ? 1 : 0.35, opacity: done ? 1 : 0 }}
        transition={reduced ? { duration: 0 } : springSnappy}
      />
      <motion.span
        aria-hidden
        className="flex items-center justify-center"
        initial={false}
        animate={{ scale: done ? 1 : 0.72, opacity: done ? 1 : 0.55 }}
        transition={reduced ? { duration: 0 } : springSnappy}
      >
        <Check
          className={cn(size === 'lg' ? 'size-7' : 'size-6', done && 'habit-on-fill')}
          strokeWidth={done ? 3.25 : 2.25}
        />
      </motion.span>
    </motion.button>
  );
}
