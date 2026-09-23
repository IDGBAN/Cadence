import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { DayKey, Habit } from '@/types';
import { Button, Chip, IconButton, NumberField, Popover, ProgressBar, cn } from '@/components/ui';
import { formatDayShort } from '@/lib/dates';
import { formatNumber, formatValue } from '@/lib/format';
import { adjustWithFeedback, setValueWithFeedback } from '@/lib/logActions';
import { useStore } from '@/store/store';
import { barSegments } from '../shared';

export interface QuantityControlProps {
  habit: Habit;
  day: DayKey;
  value: number;
  // omitted for period habits, they have their own row
  progress?: number;
  target?: number;
  className?: string;
}

function ExactAmount({ habit, day, value, close }: { habit: Habit; day: DayKey; value: number; close: () => void }) {
  const [draft, setDraft] = useState<number | undefined>(value > 0 ? value : undefined);
  const unit = (habit.unit ?? '').trim();

  const save = () => {
    setValueWithFeedback(habit.id, day, draft);
    close();
  };

  return (
    <form
      className="flex w-56 flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <NumberField
        value={draft}
        onChange={setDraft}
        min={0}
        step={habit.step > 0 ? habit.step : 1}
        size="md"
        label={`Exact amount${unit ? ` (${unit})` : ''}`}
        placeholder="0"
        autoFocus
      />
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

export function QuantityControl({ habit, day, value, progress, target, className }: QuantityControlProps) {
  // an atMost day with no entry counts as missed, so "none" has to be a real 0 entry.
  // the stepper can't create one, hence the chip
  const entry = useStore((s) => s.data.logs[habit.id]?.[day]);
  const atMost = habit.kind === 'goal' && habit.direction === 'atMost';
  const noneLogged = entry !== undefined && entry.skipped !== true && entry.value === 0;
  const step = habit.step > 0 ? habit.step : 1;
  const unit = (habit.unit ?? '').trim();
  const segments = target !== undefined ? barSegments(target) : undefined;

  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <div className="flex items-center gap-3">
        <div className="flex shrink-0 items-center gap-1 rounded-2xl border border-line bg-surface-2 p-1">
          <IconButton
            label={`Remove ${formatNumber(step, 2)} from ${habit.name}`}
            size="md"
            variant="ghost"
            disabled={value <= 0}
            onClick={(e) => adjustWithFeedback(habit.id, day, -step, e.currentTarget)}
          >
            <Minus />
          </IconButton>

          <Popover
            placement="top"
            padding="md"
            trigger={
              <button
                type="button"
                aria-label={`Set exact amount for ${habit.name}`}
                className={cn(
                  'min-w-16 rounded-xl px-2 py-1.5 text-center font-display text-xl font-semibold leading-none tabular',
                  'transition-colors hover:bg-surface-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                  value > 0 ? 'habit-text' : 'text-fg-3',
                )}
              >
                {formatNumber(value, 2)}
              </button>
            }
          >
            {(close) => <ExactAmount habit={habit} day={day} value={value} close={close} />}
          </Popover>

          <IconButton
            label={`Add ${formatNumber(step, 2)} to ${habit.name}`}
            size="md"
            variant="ghost"
            onClick={(e) => adjustWithFeedback(habit.id, day, step, e.currentTarget)}
          >
            <Plus />
          </IconButton>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-fg-3">{unit || 'logged'}</span>
            {target !== undefined && target > 0 && (
              <span className="shrink-0 tabular text-fg-3">
                {formatNumber(value, 2)} / {formatNumber(target, 2)}
              </span>
            )}
          </div>
          {progress !== undefined && (
            <ProgressBar
              value={progress}
              height={8}
              segments={segments}
              gapColor="var(--surface)"
              className="mt-1.5"
              aria-label={`${habit.name} progress: ${formatValue(habit, value)}`}
            />
          )}
        </div>
      </div>

      {atMost && (
        <div className="flex flex-wrap gap-1.5">
          <Chip
            size="sm"
            tone="habit"
            selected={noneLogged}
            aria-label={`Record none for ${habit.name} on ${formatDayShort(day)}`}
            onClick={(e) => setValueWithFeedback(habit.id, day, 0, e.currentTarget)}
          >
            None
          </Chip>
        </div>
      )}
    </div>
  );
}
