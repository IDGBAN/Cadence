import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check } from 'lucide-react';
import type { DayKey } from '@/types';
import { Textarea } from '@/components/ui';
import { actions } from '@/store/store';
import { useFlushOnHide } from './flushOnHide';

const DEBOUNCE_MS = 500;
const SAVED_VISIBLE_MS = 1600;

export interface NoteFieldProps {
  habitId: string;
  day: DayKey;
  note: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function NoteField({ habitId, day, note, label = 'Note', placeholder, disabled, autoFocus }: NoteFieldProps) {
  const target = `${habitId}|${day}`;
  const [text, setText] = useState(note);
  const [savedAt, setSavedAt] = useState(0);
  const [tracked, setTracked] = useState({ target, note });

  const wrapperRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ habitId: string; day: DayKey; value: string } | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = null;
  }, []);

  const flush = useCallback(() => {
    const pending = pendingRef.current;
    cancel();
    if (!pending) return false;
    actions().setLog(pending.habitId, pending.day, { note: pending.value });
    return true;
  }, [cancel]);

  // switched day, or the note changed from outside (e.g. a skip reason chip)
  if (tracked.target !== target || tracked.note !== note) {
    const switching = tracked.target !== target;
    setTracked({ target, note });
    if (switching) {
      flush();
      setText(note);
      setSavedAt(0);
    } else if (note !== text) {
      cancel();
      setText(note);
    }
  }

  // flush on unmount so closing the modal doesn't drop the last keystrokes
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => void flushRef.current(), []);

  // on mobile, hiding the page may be the last event it ever gets
  useFlushOnHide(flush);

  // Modal focuses data-autofocus without scrolling, so on a phone the field ends up off-screen
  useEffect(() => {
    if (!autoFocus) return;
    const id = requestAnimationFrame(() => wrapperRef.current?.scrollIntoView({ block: 'nearest' }));
    return () => cancelAnimationFrame(id);
  }, [autoFocus]);

  useEffect(() => {
    if (savedAt === 0) return;
    const id = setTimeout(() => setSavedAt(0), SAVED_VISIBLE_MS);
    return () => clearTimeout(id);
  }, [savedAt]);

  const onChange = (value: string) => {
    setText(value);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    pendingRef.current = { habitId, day, value };
    timerRef.current = setTimeout(() => {
      if (flush()) setSavedAt(Date.now());
    }, DEBOUNCE_MS);
  };

  return (
    <div ref={wrapperRef}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-fg-2">{label}</span>
        <div aria-live="polite" className="h-4">
          <AnimatePresence>
            {savedAt > 0 && (
              <motion.span
                key="saved"
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-1 text-[11px] font-semibold text-success"
              >
                <Check className="size-3" strokeWidth={3} aria-hidden />
                Saved
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
      <Textarea
        autoGrow
        maxRows={6}
        value={text}
        disabled={disabled}
        placeholder={placeholder ?? 'How did it go?'}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (flush()) setSavedAt(Date.now());
        }}
        aria-label={label}
        data-autofocus={autoFocus ? true : undefined}
      />
    </div>
  );
}
