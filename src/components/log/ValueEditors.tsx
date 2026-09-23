import type { MouseEvent, ReactNode } from 'react';
import { motion } from 'motion/react';
import { Check, Minus, Plus, X } from 'lucide-react';
import type { DayCell, DayKey, Habit, LogEntry } from '@/types';
import { formatMinutes, formatNumber, formatValue, formatValueCompact } from '@/lib/format';
import { adjustWithFeedback, setValueWithFeedback } from '@/lib/logActions';
import { Chip, DurationField, NumberField, ProgressBar, RatingPicker, cn } from '@/components/ui';
import { StopwatchControl } from '@/components/today/controls/Stopwatch';

export interface ValueEditorProps {
  habit: Habit;
  day: DayKey;
  entry: LogEntry | undefined;
  cell: DayCell;
  disabled: boolean;
}

const hasGoal = (habit: Habit) => habit.kind === 'goal' && Number.isFinite(habit.target) && habit.target > 0;

// for atMost goals progress counts down from 1, so < 1 means the limit was broken, not "almost there"
function GoalProgress({ habit, cell }: { habit: Habit; cell: DayCell }) {
  if (!hasGoal(habit) || habit.period !== 'day') return null;
  const value = cell.value ?? 0;
  const atMost = habit.direction === 'atMost';
  const over = atMost && value > habit.target;
  const summary = over
    ? `${formatValue(habit, value - habit.target)} over your limit`
    : atMost
      ? 'Within your limit'
      : cell.progress >= 1
        ? 'Goal reached'
        : `${formatValue(habit, habit.target - value)} to go`;

  return (
    <div className="mt-4">
      <ProgressBar
        value={over ? 1 : cell.progress}
        height={10}
        glow={!over && cell.progress >= 1}
        {...(over ? { color: 'var(--danger)' } : {})}
        aria-label={over ? 'Over the limit' : 'Progress toward the goal'}
      />
      <div className="mt-2 flex items-baseline justify-between gap-3 text-xs">
        <span className="font-semibold text-fg-2 tabular">
          {formatValue(habit, value)}
          <span className="font-medium text-fg-3"> of {formatValue(habit, habit.target)}</span>
        </span>
        <span className={cn('truncate tabular', over ? 'font-semibold text-danger' : 'text-fg-3')}>{summary}</span>
      </div>
    </div>
  );
}

function QuickRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-3">
      <div className="eyebrow mb-2">{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function CheckEditor({ habit, day, cell, disabled }: ValueEditorProps) {
  const done = (cell.value ?? 0) > 0;

  const set = (value: number) => (e: MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    setValueWithFeedback(habit.id, day, value, e.currentTarget);
  };

  const pill = (active: boolean, tone: 'done' | 'not') =>
    cn(
      'relative flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-2xl border p-4 text-sm font-semibold',
      'transition-[background-color,border-color,color,box-shadow] duration-200 ease-out',
      'disabled:cursor-not-allowed disabled:opacity-60',
      active && tone === 'done' && 'habit-tint-strong habit-border habit-text habit-glow',
      active && tone === 'not' && 'border-line-strong bg-surface-3 text-fg',
      !active && 'border-line bg-surface-2 text-fg-3 hover:border-line-strong hover:text-fg-2 light:bg-surface',
    );

  return (
    <div className="grid grid-cols-2 gap-3">
      <motion.button
        type="button"
        whileTap={disabled ? undefined : { scale: 0.97 }}
        aria-pressed={done}
        disabled={disabled}
        onClick={set(1)}
        className={pill(done, 'done')}
      >
        <span
          className={cn(
            'flex size-11 items-center justify-center rounded-full border transition-colors duration-200',
            done ? 'habit-fill habit-on-fill border-transparent' : 'border-line-strong bg-surface text-fg-4',
          )}
          aria-hidden
        >
          <Check className="size-6" strokeWidth={3} />
        </span>
        Done
      </motion.button>

      <motion.button
        type="button"
        whileTap={disabled ? undefined : { scale: 0.97 }}
        aria-pressed={!done}
        disabled={disabled}
        onClick={set(0)}
        className={pill(!done, 'not')}
      >
        <span
          className={cn(
            'flex size-11 items-center justify-center rounded-full border transition-colors duration-200',
            !done ? 'border-line-strong bg-surface text-fg-2' : 'border-line-strong bg-surface text-fg-4',
          )}
          aria-hidden
        >
          <X className="size-6" strokeWidth={3} />
        </span>
        Not done
      </motion.button>
    </div>
  );
}

export function QuantityEditor({ habit, day, entry, cell, disabled }: ValueEditorProps) {
  const step = habit.step > 0 ? habit.step : 1;
  const value = entry ? entry.value : undefined;
  const goal = hasGoal(habit);
  const atMost = habit.direction === 'atMost';
  const half = Math.round((habit.target / 2) * 100) / 100;

  const setValue = (next: number | undefined, el?: Element | null) => {
    if (disabled) return;
    setValueWithFeedback(habit.id, day, next, el);
  };
  const adjust = (delta: number, el?: Element | null) => {
    if (disabled) return;
    adjustWithFeedback(habit.id, day, delta, el);
  };

  // atMost habits need an explicit 0 entry for "None", and no preset should go over the limit
  const presets = !goal
    ? []
    : atMost
      ? [
          { label: 'None', amount: 0 },
          ...(half > 0 && half < habit.target ? [{ label: 'Half', amount: half }] : []),
          { label: 'Limit', amount: habit.target },
        ]
      : [
          { label: 'Half', amount: half },
          { label: 'Target', amount: habit.target },
          { label: 'Target +1', amount: habit.target + 1 },
        ].filter((preset) => preset.amount > 0);

  const adds = [step, step * 2, step * 5];

  return (
    <div>
      <NumberField
        size="lg"
        value={value}
        onChange={(next) => setValue(next)}
        min={0}
        step={step}
        suffix={habit.unit || undefined}
        placeholder="0"
        disabled={disabled}
        aria-label={`${habit.name} amount`}
      />

      {presets.length > 0 && (
        <QuickRow label="Set to">
          {presets.map((preset) => (
            <Chip
              key={preset.label}
              tone="habit"
              selected={value === preset.amount}
              disabled={disabled}
              onClick={(e) => setValue(preset.amount, e.currentTarget)}
            >
              {preset.label}
              <span className="text-fg-3 tabular">{formatValueCompact(habit, preset.amount)}</span>
            </Chip>
          ))}
        </QuickRow>
      )}

      <QuickRow label="Quick add">
        <Chip disabled={disabled || (value ?? 0) <= 0} onClick={(e) => adjust(-step, e.currentTarget)} icon={<Minus />}>
          {formatNumber(step, 2)}
        </Chip>
        {adds.map((amount) => (
          <Chip key={amount} disabled={disabled} onClick={(e) => adjust(amount, e.currentTarget)} icon={<Plus />}>
            {formatNumber(amount, 2)}
          </Chip>
        ))}
      </QuickRow>

      <GoalProgress habit={habit} cell={cell} />
    </div>
  );
}

export function DurationEditor({ habit, day, entry, cell, disabled }: ValueEditorProps) {
  const step = habit.step > 0 ? habit.step : 15;
  const adds = [step, step * 2, step * 4];
  const value = entry ? entry.value : undefined;
  const goal = hasGoal(habit);
  const atMost = habit.direction === 'atMost';

  return (
    <div>
      <DurationField
        size="lg"
        value={value}
        step={step}
        disabled={disabled}
        onChange={(minutes) => {
          if (disabled) return;
          setValueWithFeedback(habit.id, day, minutes);
        }}
      />

      {!disabled && (
        <div className="mt-3 flex justify-end empty:hidden">
          <StopwatchControl habit={habit} day={day} size="md" />
        </div>
      )}

      <QuickRow label="Add time">
        {goal && atMost && (
          <Chip
            tone="habit"
            selected={value === 0}
            disabled={disabled}
            onClick={(e) => {
              if (disabled) return;
              setValueWithFeedback(habit.id, day, 0, e.currentTarget);
            }}
          >
            None
          </Chip>
        )}
        {adds.map((minutes) => (
          <Chip
            key={minutes}
            disabled={disabled}
            icon={<Plus />}
            onClick={(e) => {
              if (disabled) return;
              adjustWithFeedback(habit.id, day, minutes, e.currentTarget);
            }}
          >
            {formatMinutes(minutes)}
          </Chip>
        ))}
        {goal && (
          <Chip
            tone="habit"
            selected={value === habit.target}
            disabled={disabled}
            onClick={(e) => {
              if (disabled) return;
              setValueWithFeedback(habit.id, day, habit.target, e.currentTarget);
            }}
          >
            {atMost ? 'Limit' : 'Target'}
            <span className="text-fg-3 tabular">{formatMinutes(habit.target)}</span>
          </Chip>
        )}
        {(value ?? 0) > 0 && (
          <Chip
            disabled={disabled}
            icon={<Minus />}
            onClick={(e) => {
              if (disabled) return;
              adjustWithFeedback(habit.id, day, -Math.min(step, value ?? 0), e.currentTarget);
            }}
          >
            {formatMinutes(Math.min(step, value ?? 0))}
          </Chip>
        )}
      </QuickRow>

      <GoalProgress habit={habit} cell={cell} />
    </div>
  );
}

export function RatingEditor({ habit, day, entry, disabled }: ValueEditorProps) {
  const max = habit.ratingMax > 0 ? habit.ratingMax : 10;
  const value = entry && entry.value > 0 ? entry.value : undefined;
  const target = hasGoal(habit) ? habit.target : undefined;

  return (
    <div>
      <RatingPicker
        size="lg"
        max={max}
        value={value}
        target={target}
        direction={habit.direction}
        disabled={disabled}
        aria-label={`${habit.name} rating`}
        onChange={(next) => {
          if (disabled) return;
          setValueWithFeedback(habit.id, day, next);
        }}
      />
      <div className="mt-2.5 flex items-center justify-between gap-3 text-[11px] font-medium text-fg-3">
        <span>1 · rough</span>
        {target !== undefined && (
          <span className="truncate text-center">
            {habit.direction === 'atMost'
              ? `Goal: ${formatNumber(target, 1)} or less`
              : `Goal: ${formatNumber(target, 1)}+`}
          </span>
        )}
        <span>{`${formatNumber(max, 0)} · great`}</span>
      </div>
    </div>
  );
}
