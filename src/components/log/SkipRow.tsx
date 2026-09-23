import { CalendarOff } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { DayKey, Habit, LogEntry } from '@/types';
import { setSkippedWithFeedback } from '@/lib/logActions';
import { actions } from '@/store/store';
import { useReducedMotion } from '@/store/hooks';
import { Chip, Switch, cn } from '@/components/ui';

export interface SkipRowProps {
  habit: Habit;
  day: DayKey;
  entry: LogEntry | undefined;
  disabled: boolean;
}

const REASONS = ['Sick', 'Rest day', 'Travel', 'Busy'] as const;

export function SkipRow({ habit, day, entry, disabled }: SkipRowProps) {
  const skipped = entry?.skipped === true;
  const note = entry?.note ?? '';
  const reduced = useReducedMotion();

  const pickReason = (reason: string) => {
    if (disabled) return;
    const next = note.trim() === reason ? '' : reason;
    actions().setLog(habit.id, day, { note: next });
  };

  return (
    <section
      className={cn(
        'rounded-2xl border p-4 transition-colors duration-200',
        skipped ? 'border-line-strong bg-surface-3 light:bg-surface-2' : 'border-line bg-surface-2 light:bg-surface',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border transition-colors duration-200',
            skipped ? 'border-line-strong bg-surface text-fg-2' : 'border-line bg-surface text-fg-4',
          )}
        >
          <CalendarOff className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-fg">Skip this day</div>
          <p className="mt-0.5 text-[13px] leading-relaxed text-fg-3">
            It won&rsquo;t count against your streak or your completion rate.
          </p>
        </div>
        <Switch
          checked={skipped}
          disabled={disabled}
          aria-label={`Skip ${habit.name} on this day`}
          onChange={(next) => setSkippedWithFeedback(habit.id, day, next)}
        />
      </div>

      <AnimatePresence initial={false}>
        {skipped && (
          <motion.div
            key="reasons"
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-3.5">
              <div className="eyebrow mb-2">Reason</div>
              <div className="flex flex-wrap gap-2">
                {REASONS.map((reason) => (
                  <Chip
                    key={reason}
                    size="sm"
                    selected={note.trim() === reason}
                    disabled={disabled}
                    onClick={() => pickReason(reason)}
                  >
                    {reason}
                  </Chip>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
