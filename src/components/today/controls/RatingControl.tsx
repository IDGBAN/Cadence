import { useRef } from 'react';
import type { DayKey, Habit } from '@/types';
import { RatingPicker, cn } from '@/components/ui';
import { formatNumber } from '@/lib/format';
import { setValueWithFeedback, undoAction } from '@/lib/logActions';
import { toast } from '@/store/ui';
import { useMediaQuery } from '@/store/hooks';

export interface RatingControlProps {
  habit: Habit;
  day: DayKey;
  value: number;
  className?: string;
}

export function RatingControl({ habit, day, value, className }: RatingControlProps) {
  const ref = useRef<HTMLDivElement>(null);
  const narrow = useMediaQuery('(max-width: 400px)');
  const max = habit.ratingMax > 0 ? habit.ratingMax : 10;

  return (
    <div ref={ref} className={cn('w-full', className)}>
      <RatingPicker
        value={value > 0 ? value : undefined}
        onChange={(next) => {
          setValueWithFeedback(habit.id, day, next, ref.current);
          // tapping the selected pill clears it, which is easy to do by accident
          if (next === undefined && value > 0) {
            toast({
              title: 'Rating cleared',
              description: `${habit.name} was ${formatNumber(value, 0)}/${formatNumber(max, 0)}.`,
              icon: habit.icon,
              action: undoAction(),
            });
          }
        }}
        max={max}
        aria-label={`${habit.name} rating`}
        {...(habit.kind === 'goal' && habit.target > 0 ? { target: habit.target } : {})}
        direction={habit.direction}
        size={narrow ? 'sm' : 'md'}
        color="var(--habit)"
      />
    </div>
  );
}
