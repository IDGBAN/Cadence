// every control writes straight to the store, so there's no "unsaved" state to guard on close
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { CalendarClock, Eraser, Sparkles } from 'lucide-react';
import type { DayKey, Habit } from '@/types';
import { habitStyle } from '@/lib/colors';
import { addDays, formatDayShort } from '@/lib/dates';
import { haptic, playSound } from '@/lib/feedback';
import { formatGoal, formatNumber, typeLabel } from '@/lib/format';
import { adjustWithFeedback, setValueWithFeedback, undoAction } from '@/lib/logActions';
import { dayCell } from '@/lib/habitMath';
import { useData, useEngineCtx, useHabit } from '@/store/hooks';
import { actions } from '@/store/store';
import { useUI, toast } from '@/store/ui';
import { Badge, Button, Kbd, Modal, confirmDialog } from '@/components/ui';
import { DayNavigator } from './DayNavigator';
import { NoteField } from './NoteField';
import { PeriodContext } from './PeriodContext';
import { QuitEditor } from './QuitEditor';
import { SkipRow } from './SkipRow';
import { statusMeta } from './statusMeta';
import { relapsesOnDay } from './quitDay';
import { CheckEditor, DurationEditor, QuantityEditor, RatingEditor, type ValueEditorProps } from './ValueEditors';

function isPeriodGoal(habit: Habit): boolean {
  return habit.kind === 'goal' && habit.type !== 'rating' && habit.type !== 'quit' && habit.period !== 'day';
}

function stepOf(habit: Habit): number {
  if (habit.step > 0) return habit.step;
  return habit.type === 'duration' ? 15 : 1;
}

function ValueEditor(props: ValueEditorProps) {
  switch (props.habit.type) {
    case 'check':
      return <CheckEditor {...props} />;
    case 'quantity':
      return <QuantityEditor {...props} />;
    case 'duration':
      return <DurationEditor {...props} />;
    case 'rating':
      return <RatingEditor {...props} />;
    default:
      return null;
  }
}

// keep the last target around so the modal can animate out
export function LogEditorHost() {
  const editor = useUI((s) => s.logEditor);
  const close = useUI((s) => s.closeLogEditor);
  const lastRef = useRef(editor);
  if (editor) lastRef.current = editor;
  const target = editor ?? lastRef.current;
  if (!target) return null;
  return (
    <LogEditor
      open={editor !== null}
      habitId={target.habitId}
      day={target.day}
      focusNote={target.focus === 'note'}
      onClose={close}
    />
  );
}

interface LogEditorProps {
  open: boolean;
  habitId: string;
  day: DayKey;
  focusNote: boolean;
  onClose: () => void;
}

function LogEditor({ open, habitId, day, focusNote, onClose }: LogEditorProps) {
  const habit = useHabit(habitId);
  const data = useData();
  const ctx = useEngineCtx();
  const openLogEditor = useUI((s) => s.openLogEditor);
  const bodyRef = useRef<HTMLDivElement>(null);

  const today = ctx.today;
  const future = day > today;
  const entry = data.logs[habitId]?.[day];

  const cell = useMemo(() => (habit ? dayCell(habit, data, day, ctx) : undefined), [habit, data, day, ctx]);
  const relapses = useMemo(
    () => (habit?.type === 'quit' ? relapsesOnDay(data, habit.id, day, ctx.dayStartHour) : []),
    [habit, data, day, ctx.dayStartHour],
  );

  const goTo = useCallback(
    (next: DayKey) => {
      if (next > today) return;
      openLogEditor(habitId, next);
    },
    [habitId, openLogEditor, today],
  );

  // habit got deleted or archived while the editor was open
  useEffect(() => {
    if (open && !habit) onClose();
  }, [open, habit, onClose]);

  useEffect(() => {
    if (!open || !habit) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const dialog = bodyRef.current?.closest('[role="dialog"]');
      const active = document.activeElement;
      // a confirm dialog on top should get the keys instead
      if (!dialog || !(active instanceof HTMLElement) || !dialog.contains(active)) return;
      const tag = active.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active.isContentEditable) return;

      if (event.key === 'Enter') {
        if (tag === 'BUTTON' || tag === 'A') return;
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goTo(addDays(day, -1));
        return;
      }
      if (event.key === 'ArrowRight') {
        if (day >= today) return;
        event.preventDefault();
        goTo(addDays(day, 1));
        return;
      }
      if (future) return;

      if (habit.type === 'rating' && event.key >= '0' && event.key <= '9') {
        const max = habit.ratingMax > 0 ? habit.ratingMax : 10;
        const value = event.key === '0' ? 10 : Number(event.key);
        if (value < 1 || value > max) return;
        event.preventDefault();
        setValueWithFeedback(habit.id, day, value);
        return;
      }
      if (habit.type === 'quantity' || habit.type === 'duration') {
        const step = stepOf(habit);
        if (event.key === '+' || event.key === '=') {
          event.preventDefault();
          adjustWithFeedback(habit.id, day, step);
        } else if (event.key === '-' || event.key === '_') {
          event.preventDefault();
          adjustWithFeedback(habit.id, day, -step);
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, habit, day, today, future, goTo, onClose]);

  if (!habit || !cell) return null;

  const meta = statusMeta(cell.status, habit);
  const ratingMax = habit.ratingMax > 0 ? habit.ratingMax : 10;
  const hasAnything = entry !== undefined || relapses.length > 0;

  const clearLog = async () => {
    if (hasAnything) {
      const ok = await confirmDialog({
        title: 'Clear this log?',
        description:
          relapses.length > 0
            ? `This removes the note and ${relapses.length === 1 ? 'the relapse' : `all ${relapses.length} relapses`} on ${formatDayShort(day)}.`
            : `This removes the value, note and skip for ${habit.name} on ${formatDayShort(day)}.`,
        confirmLabel: 'Clear',
        tone: 'danger',
        icon: '🧹',
      });
      if (!ok) return;
    }
    const operations = relapses.length + (entry ? 1 : 0);
    for (const relapse of relapses) actions().deleteRelapse(relapse.id);
    if (entry) actions().clearLog(habit.id, day);
    if (operations === 0) return;
    playSound('undo');
    haptic(8);
    toast({
      title: 'Log cleared',
      description: `${habit.name} · ${formatDayShort(day)}`,
      icon: '🧹',
      ...(operations === 1 ? { action: undoAction() } : {}),
    });
  };

  const editorProps: ValueEditorProps = { habit, day, entry, cell, disabled: future };
  const showPeriod = isPeriodGoal(habit);
  const showSkip = habit.type !== 'quit';
  const sectionLabel = habit.type === 'quit' ? 'This day' : habit.kind === 'metric' ? 'Value' : typeLabel(habit.type);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      icon={habit.icon}
      title={habit.name}
      description={formatGoal(habit)}
      footer={
        <div className="flex w-full items-center gap-2">
          <Button
            variant="ghost"
            size="md"
            icon={<Eraser />}
            disabled={!hasAnything}
            onClick={clearLog}
            className="text-fg-3 hover:bg-danger/12 hover:text-danger disabled:opacity-40"
          >
            Clear log
          </Button>
          <div className="flex-1" />
          <Button size="md" onClick={onClose} className="min-w-24">
            Done
          </Button>
        </div>
      }
    >
      <div ref={bodyRef} style={habitStyle(habit.color)} className="flex flex-col gap-5">
        <div className="sticky top-0 z-10 -mx-5 -mt-2 bg-surface px-5 pb-2 pt-2 sm:-mx-6 sm:px-6">
          <DayNavigator habit={habit} day={day} today={today} onChange={goTo} />
          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge tone={meta.tone} size="md">
              {meta.label}
            </Badge>
            <span className="min-w-0 flex-1 truncate text-xs text-fg-3">{meta.hint}</span>
          </div>
        </div>

        {future && (
          <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface-2 p-4 light:bg-surface">
            <span
              aria-hidden
              className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-fg-3"
            >
              <CalendarClock className="size-[18px]" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-fg">{formatDayShort(day)} hasn&rsquo;t happened yet</div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-fg-3">
                You can&rsquo;t log future days. Use the arrow above to go back.
              </p>
            </div>
          </div>
        )}

        {!future && cell.status === 'beforeStart' && (
          <div className="flex items-start gap-3 rounded-2xl border border-info/25 bg-info/10 p-4">
            <span
              aria-hidden
              className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-info/15 text-info"
            >
              <Sparkles className="size-[18px]" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-fg">Before this habit started</div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-fg-3">
                If you log this day, {habit.name} will count from here on.
              </p>
            </div>
          </div>
        )}

        {habit.type === 'quit' ? (
          <QuitEditor habit={habit} day={day} disabled={future} />
        ) : (
          <section>
            <div className="eyebrow mb-2.5">{sectionLabel}</div>
            <ValueEditor {...editorProps} />
          </section>
        )}

        {showPeriod && !future && <PeriodContext habit={habit} day={day} onSelectDay={goTo} />}

        <NoteField
          habitId={habit.id}
          day={day}
          note={entry?.note ?? ''}
          disabled={future}
          autoFocus={focusNote && !future}
          placeholder={
            habit.type === 'quit'
              ? 'How was the day? Triggers, wins, anything else…'
              : 'How did it go?'
          }
        />

        {showSkip && <SkipRow habit={habit} day={day} entry={entry} disabled={future} />}

        <div className="hidden flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-fg-4 sm:flex">
          <span className="flex items-center gap-1.5">
            <Kbd>←</Kbd>
            <Kbd>→</Kbd> change day
          </span>
          {habit.type === 'rating' && (
            <span className="flex items-center gap-1.5">
              {/* keys above the scale are ignored, so don't advertise them */}
              <Kbd>1</Kbd> to <Kbd>{ratingMax >= 10 ? '0' : formatNumber(ratingMax, 0)}</Kbd> set score
            </span>
          )}
          {(habit.type === 'quantity' || habit.type === 'duration') && (
            <span className="flex items-center gap-1.5">
              <Kbd>+</Kbd>
              <Kbd>−</Kbd> adjust
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Kbd>Enter</Kbd> done
          </span>
        </div>
      </div>
    </Modal>
  );
}
