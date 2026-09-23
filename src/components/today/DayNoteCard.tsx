import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, NotebookPen } from 'lucide-react';
import type { DayKey } from '@/types';
import { Textarea, cn } from '@/components/ui';
import { formatDayLong } from '@/lib/dates';
import { useReducedMotion } from '@/store/hooks';
import { actions, useStore } from '@/store/store';
import { useFlushOnHide } from '@/components/log/flushOnHide';

export interface DayNoteCardProps {
  day: DayKey;
  className?: string;
}

const SAVE_DELAY_MS = 500;
const SAVED_VISIBLE_MS = 2000;

export function DayNoteCard({ day, className }: DayNoteCardProps) {
  const stored = useStore((s) => s.data.dayNotes[day] ?? '');
  const reduced = useReducedMotion();
  const [draft, setDraft] = useState(stored);
  const [status, setStatus] = useState<'idle' | 'pending' | 'saved'>('idle');

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const pending = useRef<{ day: DayKey; text: string } | null>(null);
  const saveTimer = useRef<number | null>(null);
  const savedTimer = useRef<number | null>(null);

  // silent skips state updates, for unmount
  const flush = useCallback((silent: boolean) => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const edit = pending.current;
    pending.current = null;
    if (!edit) return;
    actions().setDayNote(edit.day, edit.text);
    if (silent) return;
    setStatus('saved');
    if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setStatus('idle'), SAVED_VISIBLE_MS);
  }, []);

  // pick up outside changes (undo, import) unless the user is mid-edit
  useEffect(() => {
    if (pending.current === null && stored !== draftRef.current) setDraft(stored);
  }, [stored]);

  useEffect(
    () => () => {
      flush(true);
      if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
    },
    [flush],
  );

  // on mobile the page can get killed in the background without ever unmounting
  useFlushOnHide(() => flush(true));

  const onChange = (text: string) => {
    setDraft(text);
    pending.current = { day, text };
    setStatus('pending');
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => flush(false), SAVE_DELAY_MS);
  };

  return (
    <section className={cn('card p-4 sm:p-5', className)} aria-label={`Note for ${formatDayLong(day)}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold tracking-tight text-fg">
          <NotebookPen aria-hidden className="size-4 text-fg-3" />
          Day note
        </h2>
        <div aria-live="polite" className="flex h-5 items-center text-xs text-fg-3">
          <AnimatePresence mode="wait" initial={false}>
            {status === 'saved' ? (
              <motion.span
                key="saved"
                initial={reduced ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-1 text-success"
              >
                <Check aria-hidden className="size-3.5" />
                Saved
              </motion.span>
            ) : status === 'pending' ? (
              <motion.span key="pending" initial={false} animate={{ opacity: 1 }} className="text-fg-4">
                Saving…
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <Textarea
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => flush(false)}
        autoGrow
        rows={2}
        maxRows={10}
        aria-label={`Note for ${formatDayLong(day)}`}
        placeholder="How did today go? What helped, what didn't…"
        hint="Notes give a bit of XP and show up in History."
      />
    </section>
  );
}
