import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Minus, Plus } from 'lucide-react';
import type { Habit } from '@/types';
import { habitStyle } from '@/lib/colors';
import { formatElapsed, formatGoal, formatMinutes, formatNumber, pluralize, scheduleLabel } from '@/lib/format';
import { useNow, useSettings } from '@/store/hooks';
import { cn, HabitIcon, ProgressBar, ProgressRing, RatingPicker } from '@/components/ui';

const DAY_MS = 86_400_000;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function CheckControl({ done, onToggle }: { done: boolean; onToggle: () => void }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 520, damping: 30, mass: 0.6 }}
      aria-pressed={done}
      aria-label={done ? 'Preview: mark as not done' : 'Preview: mark as done'}
      onClick={onToggle}
      className={cn(
        'relative flex size-12 shrink-0 items-center justify-center rounded-2xl border transition-colors duration-200',
        done
          ? 'habit-border habit-fill habit-on-fill shadow-[0_8px_22px_-10px_var(--habit)]'
          : 'border-line-strong bg-surface-2 text-fg-3 hover:border-[color-mix(in_oklab,var(--habit)_55%,transparent)] hover:text-fg',
      )}
    >
      <motion.span
        initial={false}
        animate={done ? { scale: 1, opacity: 1 } : { scale: 0.6, opacity: 0.55 }}
        transition={{ type: 'spring', stiffness: 520, damping: 26 }}
      >
        <Check className="size-6" strokeWidth={3} />
      </motion.span>
    </motion.button>
  );
}

function AmountControl({
  value,
  progress,
  display,
  onStep,
}: {
  value: number;
  progress: number;
  display: string;
  onStep: (delta: number) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        aria-label="Preview: decrease"
        disabled={value <= 0}
        onClick={() => onStep(-1)}
        className="flex size-9 items-center justify-center rounded-xl border border-line-strong bg-surface-2 text-fg-2 transition-colors hover:bg-surface-3 hover:text-fg disabled:opacity-40"
      >
        <Minus className="size-4" />
      </button>
      <ProgressRing value={progress} size={54} stroke={5} animateOnMount={false}>
        <span className="tabular text-[13px] font-semibold leading-none text-fg">{display}</span>
      </ProgressRing>
      <button
        type="button"
        aria-label="Preview: increase"
        onClick={() => onStep(1)}
        className="flex size-9 items-center justify-center rounded-xl border border-line-strong bg-surface-2 text-fg-2 transition-colors hover:bg-surface-3 hover:text-fg"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

export interface HabitPreviewProps {
  draft: Habit;
  className?: string;
}

// mirrors the Today card; the controls work but nothing is saved
export function HabitPreview({ draft, className }: HabitPreviewProps) {
  const settings = useSettings();
  const [value, setValue] = useState(0);
  const [rating, setRating] = useState<number | undefined>(undefined);

  useEffect(() => {
    setValue(0);
    setRating(undefined);
  }, [draft.type]);

  const isQuit = draft.type === 'quit';
  const now = useNow(isQuit ? 1000 : 0);
  const goal = draft.target > 0 ? draft.target : 1;
  const progress = draft.kind === 'metric' ? (value > 0 ? 1 : 0) : Math.min(1, value / goal);
  const name = draft.name.trim() === '' ? 'Your habit' : draft.name.trim();
  // formatGoal already says "Every day" for daily check habits, don't repeat it
  const goalText = formatGoal(draft);
  const schedule = scheduleLabel(draft, settings.weekStartsOn);
  const goalLine = goalText === schedule ? goalText : `${goalText} · ${schedule}`;

  const elapsedMs = isQuit ? Math.max(0, now.getTime() - new Date(draft.quitStart).getTime()) : 0;
  const elapsedDays = elapsedMs / DAY_MS;
  const milestoneProgress = draft.target > 0 ? Math.min(1, elapsedDays / draft.target) : 0;

  return (
    <section
      aria-label="Preview"
      style={habitStyle(draft.color)}
      className={cn(
        'relative overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-card',
        'habit-border bg-[linear-gradient(180deg,color-mix(in_oklab,var(--habit)_10%,transparent),transparent_70%)]',
        className,
      )}
    >
      <div className="eyebrow mb-3 flex items-center gap-1.5">
        <span className="size-1.5 rounded-full habit-fill" aria-hidden />
        Live preview · Today
      </div>

      <div className="flex items-center gap-3">
        <HabitIcon habit={draft} size="lg" filled={!isQuit && progress >= 1} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[17px] font-semibold leading-tight tracking-tight text-fg">{name}</p>
          <p className="mt-0.5 truncate text-[13px] text-fg-3">{goalLine}</p>
        </div>

        {draft.type === 'check' && <CheckControl done={value > 0} onToggle={() => setValue((v) => (v > 0 ? 0 : 1))} />}

        {draft.type === 'quantity' && (
          <AmountControl
            value={value}
            progress={progress}
            display={formatNumber(value, 1)}
            onStep={(d) => setValue((v) => Math.max(0, round2(v + d * (draft.step > 0 ? draft.step : 1))))}
          />
        )}

        {draft.type === 'duration' && (
          <AmountControl
            value={value}
            progress={progress}
            display={formatMinutes(value)}
            onStep={(d) => setValue((v) => Math.max(0, v + d * (draft.step > 0 ? draft.step : 15)))}
          />
        )}

        {isQuit && (
          <div className="shrink-0 text-right">
            <div className="tabular font-display text-xl font-semibold leading-none habit-text">
              {formatElapsed(elapsedMs, 'compact')}
            </div>
            <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.1em] text-fg-3">clean</div>
          </div>
        )}
      </div>

      {draft.type === 'rating' && (
        <div className="mt-3">
          <RatingPicker
            value={rating}
            onChange={setRating}
            max={draft.ratingMax}
            target={draft.kind === 'goal' ? draft.target : undefined}
            size="sm"
            aria-label="Preview rating"
          />
        </div>
      )}

      {isQuit && draft.target > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-fg-3">
            <span>Milestone</span>
            <span className="tabular">
              {formatNumber(Math.floor(elapsedDays), 0)} / {pluralize(draft.target, 'day')}
            </span>
          </div>
          <ProgressBar value={milestoneProgress} height={6} aria-label="Milestone progress" />
        </div>
      )}

      {(draft.type === 'quantity' || draft.type === 'duration') && draft.kind === 'goal' && (
        <div className="mt-3">
          <ProgressBar value={progress} height={6} aria-label="Preview progress" />
        </div>
      )}
    </section>
  );
}
