import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Archive, ArchiveRestore, ChevronLeft, Copy, Ellipsis, Trash, TriangleAlert } from 'lucide-react';
import type { Habit } from '@/types';
import { ALL_TEMPLATES, blankHabit, habitFromTemplate, type HabitTemplate } from '@/lib/defaults';
import { typeLabel } from '@/lib/format';
import { actions, countLogValueChanges, getData } from '@/store/store';
import { toast, useUI } from '@/store/ui';
import { useAllHabits, useReducedMotion } from '@/store/hooks';
import { Button, confirmDialog, IconButton, Menu, Modal, type MenuItem } from '@/components/ui';
import {
  celebrateCreation,
  confirmDeleteHabit,
  duplicateHabitWithToast,
  loggedDayCount,
  nextHabitOrder,
  setHabitArchived,
} from '@/components/habits/habitActions';
import { HabitForm } from './HabitForm';
import { HabitPreview } from './HabitPreview';
import { TemplateGallery } from './TemplateGallery';
import { MOD_KEY } from '@/components/layout/platform';
import { cleanDraft, hasErrors, isDirty, validateDraft, type DraftErrors } from './draft';

type Step = 'gallery' | 'form';

// same order as the fields in the form
const ERROR_ORDER: Array<keyof DraftErrors> = ['name', 'target', 'step', 'quitStart', 'schedule', 'startDate'];

function firstError(errors: DraftErrors): string | undefined {
  for (const key of ERROR_ORDER) {
    const message = errors[key];
    if (message) return message;
  }
  return undefined;
}

function savePatch(draft: Habit): Partial<Habit> {
  const { id: _id, createdAt: _createdAt, order: _order, archived: _archived, ...patch } = draft;
  return patch;
}

export function HabitEditorHost() {
  const editor = useUI((s) => s.habitEditor);
  const closeEditor = useUI((s) => s.closeHabitEditor);
  const habits = useAllHabits();
  const reduced = useReducedMotion();
  const formId = useId();
  const saveRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [original, setOriginal] = useState<Habit | null>(null);
  // what "unsaved changes" is compared against
  const [baseline, setBaseline] = useState<Habit | null>(null);
  const [draft, setDraft] = useState<Habit | null>(null);
  const [step, setStep] = useState<Step>('gallery');
  const [fromGallery, setFromGallery] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  // don't complain about an empty name until the field has been used
  const [nameTouched, setNameTouched] = useState(false);

  // state is left alone on close so the exit animation doesn't flicker
  useEffect(() => {
    if (!editor) return;
    const data = getData();
    const existing = editor.habitId ? data.habits.find((h) => h.id === editor.habitId) : undefined;
    const template = editor.templateId ? ALL_TEMPLATES.find((t) => t.templateId === editor.templateId) : undefined;

    setShowErrors(false);
    setNameTouched(false);
    setFromGallery(false);

    if (existing) {
      const copy: Habit = { ...existing, schedule: [...existing.schedule] };
      setOriginal(existing);
      setBaseline(copy);
      setDraft(copy);
      setStep('form');
      return;
    }

    setOriginal(null);
    if (template) {
      const fresh = habitFromTemplate(template, nextHabitOrder(), data.settings.dayStartHour);
      setBaseline(fresh);
      setDraft(fresh);
      setStep('form');
    } else {
      setBaseline(null);
      setDraft(null);
      setStep('gallery');
    }
  }, [editor]);

  // Modal only autofocuses when it opens, so do it again on each step
  useEffect(() => {
    if (!editor) return;
    const target = contentRef.current?.querySelector<HTMLElement>('[data-autofocus]');
    target?.focus({ preventScroll: true });
  }, [editor, step]);

  const open = editor !== null;
  const isEdit = original !== null;
  const errors = useMemo(() => (draft ? validateDraft(draft) : {}), [draft]);
  const invalid = draft === null || hasErrors(errors);
  const visibleErrors = useMemo<DraftErrors>(
    () => (nameTouched ? errors : { ...errors, name: undefined }),
    [errors, nameTouched],
  );
  const dirty = draft !== null && baseline !== null && isDirty(draft, baseline);

  const existingNames = useMemo(
    () => new Set(habits.map((h) => h.name.trim().toLowerCase())),
    [habits],
  );

  const requestClose = useCallback(async () => {
    if (dirty) {
      const discard = await confirmDialog({
        title: isEdit ? 'Discard your changes?' : 'Discard this habit?',
        description: isEdit
          ? 'Your edits won’t be saved.'
          : 'The habit hasn’t been created yet.',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        tone: 'danger',
        icon: '🗑️',
      });
      if (!discard) return;
    }
    closeEditor();
  }, [closeEditor, dirty, isEdit]);

  const startWith = (habit: Habit) => {
    setBaseline(habit);
    setDraft(habit);
    setFromGallery(true);
    setShowErrors(false);
    setNameTouched(false);
    setStep('form');
  };

  const pickTemplate = (template: HabitTemplate) =>
    startWith(habitFromTemplate(template, nextHabitOrder(), getData().settings.dayStartHour));

  const startFromScratch = () => {
    const data = getData();
    startWith(blankHabit(nextHabitOrder(), editor?.categoryId ?? data.categories[0]?.id));
  };

  const backToGallery = () => {
    setBaseline(null);
    setDraft(null);
    setShowErrors(false);
    setNameTouched(false);
    setStep('gallery');
  };

  const handleChange = (next: Habit) => {
    if (draft && next.name !== draft.name) setNameTouched(true);
    setShowErrors(true);
    setDraft(next);
  };

  const handleSubmit = async () => {
    if (!draft) return;
    if (hasErrors(validateDraft(draft))) {
      setShowErrors(true);
      setNameTouched(true);
      return;
    }
    const cleaned = cleanDraft(draft);

    if (original) {
      const typeChanged = cleaned.type !== original.type;
      const scaleChanged = cleaned.type === 'rating' && cleaned.ratingMax !== original.ratingMax;
      // the store converts logged values on save, so say how many will change first
      const rewritten =
        typeChanged || scaleChanged
          ? countLogValueChanges(getData(), original.id, { type: cleaned.type, ratingMax: cleaned.ratingMax })
          : 0;
      if (typeChanged || rewritten > 0) {
        const days = loggedDayCount(original.id);
        if (days > 0) {
          const what = typeChanged
            ? `Switch ${original.name} to ${typeLabel(cleaned.type).toLowerCase()}?`
            : `Change ${original.name} to a scale out of ${cleaned.ratingMax}?`;
          const detail =
            rewritten > 0
              ? `${rewritten === 1 ? '1 logged value' : `${rewritten} logged values`} will be adjusted to fit. ` +
                `Anything above the new maximum gets lowered to it. Notes and skipped days stay, ` +
                `and ${MOD_KEY}+Z undoes it.`
              : 'Your logged values already fit, so nothing gets converted. Streaks and stats may change.';
          const ok = await confirmDialog({
            title: what,
            description: `This habit has ${days === 1 ? '1 logged day' : `${days} logged days`}. ${detail}`,
            confirmLabel: typeChanged ? 'Change type' : 'Change scale',
            cancelLabel: 'Keep it as is',
            icon: '🔀',
            tone: rewritten > 0 ? 'danger' : 'default',
          });
          if (!ok) return;
        }
      }
      actions().updateHabit(original.id, savePatch(cleaned));
      toast({
        title: `${cleaned.name} updated`,
        description:
          rewritten > 0
            ? `${rewritten === 1 ? '1 logged value was' : `${rewritten} logged values were`} converted. ${MOD_KEY}+Z undoes it.`
            : 'Your history is kept. Streaks and stats now use the new settings.',
        tone: 'success',
        icon: cleaned.icon,
      });
    } else {
      const habit: Habit = { ...cleaned, order: nextHabitOrder() };
      actions().addHabit(habit);
      celebrateCreation(habit, saveRef.current);
    }
    closeEditor();
  };

  const menuItems: MenuItem[] = original
    ? [
        {
          label: 'Duplicate',
          icon: <Copy />,
          onSelect: () => {
            duplicateHabitWithToast(original);
            closeEditor();
          },
        },
        {
          label: original.archived ? 'Restore from archive' : 'Archive',
          icon: original.archived ? <ArchiveRestore /> : <Archive />,
          onSelect: () => {
            setHabitArchived(original, !original.archived);
            closeEditor();
          },
        },
        {
          label: 'Delete habit',
          icon: <Trash />,
          danger: true,
          separator: true,
          onSelect: () => {
            void confirmDeleteHabit(original).then((deleted) => {
              if (deleted) closeEditor();
            });
          },
        },
      ]
    : [];

  const summary = showErrors ? firstError(visibleErrors) : undefined;
  const title = isEdit ? 'Edit habit' : step === 'gallery' ? 'New habit' : draft?.name.trim() || 'New habit';
  const description =
    step === 'gallery'
      ? 'Start from a template or make your own.'
      : isEdit
        ? 'Your history is kept. Streaks and stats update to match the new goal and schedule.'
        : undefined;

  return (
    <Modal
      open={open}
      onClose={() => void requestClose()}
      size="lg"
      title={title}
      description={description}
      icon={step === 'form' && draft ? draft.icon : '✨'}
      bodyClassName="pt-0"
      footer={
        <div className="flex w-full items-center gap-2">
          {step === 'form' && isEdit && (
            <Menu
              items={menuItems}
              placement="top-start"
              trigger={
                <IconButton label="More habit actions" variant="secondary">
                  <Ellipsis />
                </IconButton>
              }
            />
          )}
          {step === 'form' && !isEdit && fromGallery && (
            <Button variant="ghost" icon={<ChevronLeft />} onClick={backToGallery}>
              <span className="max-sm:sr-only">Templates</span>
            </Button>
          )}

          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => void requestClose()}>
              Cancel
            </Button>
            {step === 'form' && (
              <Button ref={saveRef} type="submit" form={formId} disabled={invalid}>
                {isEdit ? 'Save changes' : 'Create habit'}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div ref={contentRef}>
        {step === 'gallery' ? (
          <div className="pt-3">
            <TemplateGallery existingNames={existingNames} onPick={pickTemplate} onScratch={startFromScratch} />
          </div>
        ) : (
          draft && (
            <div>
              <div className="sticky top-0 z-[1] -mx-5 bg-surface px-5 pb-4 pt-2 sm:-mx-6 sm:px-6">
                <HabitPreview draft={draft} />
              </div>

              <HabitForm
                draft={draft}
                onChange={handleChange}
                errors={visibleErrors}
                showErrors={showErrors}
                formId={formId}
                onSubmit={() => void handleSubmit()}
              />

              <AnimatePresence initial={false}>
                {summary && (
                  <motion.p
                    role="status"
                    initial={reduced ? false : { opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="mt-4 flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-[13px] font-medium text-danger"
                  >
                    <TriangleAlert className="size-4 shrink-0" aria-hidden />
                    {summary}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          )
        )}
      </div>
    </Modal>
  );
}
