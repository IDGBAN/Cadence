import { useState } from 'react';
import type { DayKey, Habit } from '@/types';
import { Button, Chip, DurationField, Popover, ProgressBar, cn } from '@/components/ui';
import { formatDayShort } from '@/lib/dates';
import { formatMinutes } from '@/lib/format';
import { adjustWithFeedback, setValueWithFeedback } from '@/lib/logActions';
import { useStore } from '@/store/store';
import { StopwatchControl } from './Stopwatch';

export interface DurationControlProps {
  habit: Habit;
  day: DayKey;
  value: number;
  progress?: number;
  target?: number;
  className?: string;
}

function ExactDuration({ habit, day, value, close }: { habit: Habit; day: DayKey; value: number; close: () => void }) {
  const [draft, setDraft] = useState<number | undefined>(value > 0 ? value : undefined);

  return (
    <form
      className="flex w-60 flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setValueWithFeedback(habit.id, day, draft);
        close();
      }}
    >
      <DurationField value={draft} onChange={setDraft} label="Exact time" step={habit.step > 0 ? habit.step : 5} autoFocus />
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" fullWidth onClick={() => { setValueWithFeedback(habit.id, day, undefined); close(); }}>
          Clear
        </Button>
        <Button type="submit" size="sm" fullWidth>
          Save
        </Button>
      </div>
    </form>
  );
}

export function DurationControl({ habit, day, value, progress, target, className }: DurationControlProps) {
  const entry = useStore((s) => s.data.logs[habit.id]?.[day]);
  const step = habit.step > 0 ? habit.step : 15;
  const quickAdds = [step, step * 2, step * 4];
  // see QuantityControl for why atMost needs a "None" chip
  const atMost = habit.kind === 'goal' && habit.direction === 'atMost';
  const noneLogged = entry !== undefined && entry.skipped !== true && entry.value === 0;

  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Popover
          placement="top"
          padding="md"
          trigger={
            <button
              type="button"
              aria-label={`Set exact time for ${habit.name}`}
              className={cn(
                'rounded-xl px-2 py-1 text-left font-display text-xl font-semibold leading-none tracking-tight tabular',
                'transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                value > 0 ? 'habit-text' : 'text-fg-3',
              )}
            >
              {formatMinutes(value)}
              {target !== undefined && target > 0 && (
                <span className="ml-1 font-sans text-sm font-medium text-fg-3">/ {formatMinutes(target)}</span>
              )}
            </button>
          }
        >
          {(close) => <ExactDuration habit={habit} day={day} value={value} close={close} />}
        </Popover>

        <StopwatchControl habit={habit} day={day} />
      </div>

      {progress !== undefined && (
        <ProgressBar value={progress} height={8} aria-label={`${habit.name} progress: ${formatMinutes(value)}`} />
      )}

      <div className="flex flex-wrap gap-1.5">
        {atMost && (
          <Chip
            size="sm"
            tone="habit"
            selected={noneLogged}
            aria-label={`Record none for ${habit.name} on ${formatDayShort(day)}`}
            onClick={(e) => setValueWithFeedback(habit.id, day, 0, e.currentTarget)}
          >
            None
          </Chip>
        )}
        {quickAdds.map((minutes) => (
          <Chip
            key={minutes}
            size="sm"
            tone="habit"
            onClick={(e) => adjustWithFeedback(habit.id, day, minutes, e.currentTarget)}
          >
            +{formatMinutes(minutes)}
          </Chip>
        ))}
        {value > 0 && (
          <Chip size="sm" onClick={(e) => adjustWithFeedback(habit.id, day, -Math.min(step, value), e.currentTarget)}>
            −{formatMinutes(Math.min(step, value))}
          </Chip>
        )}
      </div>
    </div>
  );
}
