import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CircleCheck, Plus, Trash, TriangleAlert } from 'lucide-react';
import type { DayKey, Habit, Relapse } from '@/types';
import { formatTime } from '@/lib/dates';
import { formatElapsed, pluralize } from '@/lib/format';
import { relapseWithFeedback } from '@/lib/logActions';
import { useData, useQuitStats, useSettings } from '@/store/hooks';
import { actions } from '@/store/store';
import { Button, IconButton, Input, confirmDialog } from '@/components/ui';
import { defaultRelapseAt, relapsesOnDay } from './quitDay';

export interface QuitEditorProps {
  habit: Habit;
  day: DayKey;
  disabled: boolean;
}

function RelapseRow({ relapse, disabled }: { relapse: Relapse; disabled: boolean }) {
  const [note, setNote] = useState(relapse.note ?? '');
  const [tracked, setTracked] = useState(relapse.note ?? '');
  const lastCommitted = useRef(relapse.note ?? '');

  const stored = relapse.note ?? '';
  if (tracked !== stored) {
    setTracked(stored);
    if (stored !== note && stored !== lastCommitted.current) setNote(stored);
  }

  const commitNote = () => {
    if (note === (relapse.note ?? '')) return;
    lastCommitted.current = note;
    actions().updateRelapse(relapse.id, { note });
  };

  const setTime = (value: string) => {
    const [hours, minutes] = value.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return;
    const d = new Date(relapse.at);
    if (Number.isNaN(d.getTime())) return;
    d.setHours(hours, minutes, 0, 0);
    actions().updateRelapse(relapse.id, { at: d.toISOString() });
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: 'Delete this relapse?',
      description: 'Your clean count will be worked out again as if it never happened.',
      confirmLabel: 'Delete',
      tone: 'danger',
      icon: '🗑️',
    });
    if (ok) actions().deleteRelapse(relapse.id);
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.22 }}
      className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 p-2 light:bg-surface"
    >
      <div className="w-[6.5rem] shrink-0">
        <Input
          size="sm"
          type="time"
          value={formatTime(relapse.at)}
          disabled={disabled}
          aria-label="Relapse time"
          inputClassName="tabular"
          onChange={(e) => setTime(e.target.value)}
        />
      </div>
      <div className="min-w-0 flex-1">
        <Input
          size="sm"
          value={note}
          disabled={disabled}
          placeholder="What happened? (optional)"
          aria-label="Relapse note"
          onChange={(e) => setNote(e.target.value)}
          onBlur={commitNote}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
      </div>
      <IconButton
        label="Delete relapse"
        size="sm"
        disabled={disabled}
        onClick={remove}
        className="shrink-0 hover:bg-danger/12 hover:text-danger"
      >
        <Trash />
      </IconButton>
    </motion.li>
  );
}

export function QuitEditor({ habit, day, disabled }: QuitEditorProps) {
  const data = useData();
  const settings = useSettings();
  const stats = useQuitStats(habit.id, 0);

  const relapses = useMemo(
    () => relapsesOnDay(data, habit.id, day, settings.dayStartHour),
    [data, habit.id, day, settings.dayStartHour],
  );

  const add = () => {
    if (disabled) return;
    relapseWithFeedback(habit.id, defaultRelapseAt(day, settings.dayStartHour));
  };

  const clean = relapses.length === 0;

  return (
    <div>
      <div
        className={
          clean
            ? 'flex items-center gap-3 rounded-2xl border border-success/25 bg-success/10 p-4'
            : 'flex items-center gap-3 rounded-2xl border border-danger/25 bg-danger/10 p-4'
        }
      >
        <span
          aria-hidden
          className={
            clean
              ? 'flex size-10 shrink-0 items-center justify-center rounded-xl bg-success/15 text-success'
              : 'flex size-10 shrink-0 items-center justify-center rounded-xl bg-danger/15 text-danger'
          }
        >
          {clean ? <CircleCheck className="size-5" /> : <TriangleAlert className="size-5" />}
        </span>
        <div className="min-w-0">
          <div className="font-display text-base font-semibold tracking-tight text-fg">
            {clean ? 'Clean day' : `${pluralize(relapses.length, 'relapse')} on this day`}
          </div>
          <div className="text-[13px] text-fg-3">
            {clean
              ? 'Nothing logged, so this day counts toward your streak.'
              : 'Jot down what set it off. It helps next time.'}
          </div>
        </div>
      </div>

      {stats && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-3">
          <span>
            Current run <span className="font-semibold text-fg-2 tabular">{formatElapsed(stats.currentMs, 'compact')}</span>
          </span>
          <span>
            Best <span className="font-semibold text-fg-2 tabular">{formatElapsed(stats.bestMs, 'days')}</span>
          </span>
          <span>
            Attempts <span className="font-semibold text-fg-2 tabular">{stats.attempts}</span>
          </span>
        </div>
      )}

      {relapses.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {relapses.map((relapse) => (
              <RelapseRow key={relapse.id} relapse={relapse} disabled={disabled} />
            ))}
          </AnimatePresence>
        </ul>
      )}

      <Button variant="secondary" size="sm" icon={<Plus />} disabled={disabled} onClick={add} className="mt-4">
        Add a relapse
      </Button>
    </div>
  );
}
