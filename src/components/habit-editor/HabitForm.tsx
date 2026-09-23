import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Ban, Clock, Hash, Info, SquareCheckBig, Star, X } from 'lucide-react';
import type { Habit, HabitType } from '@/types';
import { formatGoal, formatMinutes, periodLabel, typeDescription, typeLabel } from '@/lib/format';
import { orderedWeekdays, toDateTimeLocalValue } from '@/lib/dates';
import { useCategories, useReducedMotion, useSettings } from '@/store/hooks';
import { actions } from '@/store/store';
import {
  Badge,
  Button,
  Chip,
  ColorPicker,
  cn,
  DurationField,
  EmojiPicker,
  IconButton,
  Input,
  NumberField,
  Popover,
  Segmented,
  Select,
  Slider,
  Textarea,
} from '@/components/ui';
import {
  applyDirection,
  applyKind,
  applyPeriod,
  applyRatingMax,
  applyType,
  DURATION_STEPS,
  HABIT_TYPE_ORDER,
  maxPeriodCount,
  presetOf,
  QUIT_MILESTONES,
  SCHEDULE_PRESETS,
  showsDirection,
  showsPeriod,
  showsSchedule,
  supportsMetric,
  toggleWeekday,
  UNIT_SUGGESTIONS,
  type DraftErrors,
} from './draft';

const NEW_CATEGORY = '__new_category__';

const TYPE_META: Record<HabitType, { icon: ReactNode; caption: string }> = {
  check: { icon: <SquareCheckBig />, caption: 'One tap' },
  quantity: { icon: <Hash />, caption: '8 glasses' },
  duration: { icon: <Clock />, caption: '2 hours' },
  rating: { icon: <Star />, caption: 'Out of 10' },
  quit: { icon: <Ban />, caption: 'Days clean' },
};

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('border-t border-line pt-5', className)}>
      <h3 className="eyebrow mb-3">{title}</h3>
      {children}
    </section>
  );
}

function Hint({ children, icon = true }: { children: ReactNode; icon?: boolean }) {
  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-fg-3">
      {icon && <Info className="mt-px size-3.5 shrink-0 text-fg-4" aria-hidden />}
      <span>{children}</span>
    </p>
  );
}

function TypeCard({
  type,
  selected,
  onSelect,
}: {
  type: HabitType;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2.5 text-center',
        'transition-[border-color,background-color,color,box-shadow] duration-150 focus-visible:outline-offset-2',
        selected
          ? 'border-[color-mix(in_oklab,var(--accent)_50%,transparent)] bg-accent/12 text-accent shadow-[inset_0_1px_0_color-mix(in_oklab,var(--accent)_25%,transparent)] light:text-[color-mix(in_oklab,var(--accent)_82%,black)]'
          : 'border-line bg-surface-2 text-fg-3 hover:border-line-strong hover:bg-surface-3 hover:text-fg-2',
      )}
    >
      <span className={cn('[&_svg]:size-[18px]', selected ? '' : 'text-fg-3')} aria-hidden>
        {TYPE_META[type].icon}
      </span>
      <span className="text-[13px] font-semibold leading-none">{typeLabel(type)}</span>
      <span className="text-[10px] leading-none text-fg-4">{TYPE_META[type].caption}</span>
    </button>
  );
}

export interface HabitFormProps {
  draft: Habit;
  onChange: (next: Habit) => void;
  errors: DraftErrors;
  showErrors: boolean;
  formId: string;
  onSubmit: () => void;
}

export function HabitForm({ draft, onChange, errors, showErrors, formId, onSubmit }: HabitFormProps) {
  const categories = useCategories();
  const settings = useSettings();
  const reduced = useReducedMotion();
  const [newCategory, setNewCategory] = useState<{ name: string; icon: string } | null>(null);

  const err = (key: keyof DraftErrors) => (showErrors ? errors[key] : undefined);
  const patch = (p: Partial<Habit>) => onChange({ ...draft, ...p });

  const periodWord = periodLabel(draft.period);
  const unit = draft.unit.trim();
  const isGoal = draft.kind === 'goal';

  const createCategory = () => {
    const name = newCategory?.name.trim();
    if (!name) return;
    const created = actions().addCategory({ name, icon: newCategory?.icon || '📁' });
    onChange({ ...draft, categoryId: created.id });
    setNewCategory(null);
  };

  const categoryOptions = [
    ...categories.map((c) => ({ value: c.id, label: c.name, icon: <span aria-hidden>{c.icon}</span> })),
    { value: NEW_CATEGORY, label: 'New category…', icon: <span aria-hidden>➕</span> },
  ];

  return (
    <form
      id={formId}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-5"
    >
      <div>
        <div className="flex items-end gap-2">
          <Popover
            placement="bottom-start"
            aria-label="Choose an icon"
            className="w-[min(23rem,calc(100vw-2.5rem))]"
            trigger={
              <button
                type="button"
                aria-label={`Icon: ${draft.icon}. Choose another`}
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-xl leading-none',
                  'shadow-[inset_0_1px_0_color-mix(in_oklab,var(--fg)_6%,transparent)] transition-colors hover:border-line-strong hover:bg-surface-3',
                )}
              >
                <span aria-hidden>{draft.icon}</span>
              </button>
            }
          >
            {(close) => (
              <EmojiPicker
                value={draft.icon}
                onChange={(icon) => {
                  patch({ icon });
                  close();
                }}
              />
            )}
          </Popover>

          <Input
            label="Name"
            data-autofocus
            className="min-w-0 flex-1"
            value={draft.name}
            maxLength={70}
            autoComplete="off"
            spellCheck
            placeholder="Drink water"
            error={err('name')}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </div>

        <div className="mt-3">
          <span className="mb-1.5 block text-[13px] font-medium text-fg-2">Color</span>
          <ColorPicker value={draft.color} onChange={(color) => patch({ color })} />
        </div>

        <div className="mt-3">
          <Select
            label="Category"
            value={draft.categoryId}
            options={categoryOptions}
            onChange={(value) => {
              if (value === NEW_CATEGORY) setNewCategory({ name: '', icon: '📁' });
              else patch({ categoryId: value });
            }}
          />
          <AnimatePresence initial={false}>
            {newCategory && (
              <motion.div
                initial={reduced ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-surface-2 p-2">
                  <Popover
                    placement="bottom-start"
                    aria-label="Choose a category icon"
                    className="w-[min(23rem,calc(100vw-2.5rem))]"
                    trigger={
                      <button
                        type="button"
                        aria-label={`Category icon: ${newCategory.icon}. Choose another`}
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-3 text-lg leading-none transition-colors hover:border-line-strong"
                      >
                        <span aria-hidden>{newCategory.icon}</span>
                      </button>
                    }
                  >
                    {(close) => (
                      <EmojiPicker
                        value={newCategory.icon}
                        onChange={(icon) => {
                          setNewCategory((c) => (c ? { ...c, icon } : c));
                          close();
                        }}
                      />
                    )}
                  </Popover>
                  <Input
                    size="sm"
                    aria-label="New category name"
                    placeholder="Category name"
                    className="min-w-0 flex-1"
                    value={newCategory.name}
                    maxLength={40}
                    autoFocus
                    onChange={(e) => setNewCategory((c) => (c ? { ...c, name: e.target.value } : c))}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      createCategory();
                    }}
                  />
                  <Button size="sm" onClick={createCategory} disabled={newCategory.name.trim() === ''}>
                    Add
                  </Button>
                  <IconButton label="Cancel new category" size="sm" onClick={() => setNewCategory(null)}>
                    <X />
                  </IconButton>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="mt-3">
          <Textarea
            label="Description"
            placeholder="Why it matters or how to do it (optional)"
            rows={2}
            autoGrow
            maxRows={5}
            maxLength={400}
            value={draft.description}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </div>
      </div>

      <Section title="How do you log it?">
        <div role="radiogroup" aria-label="Habit type" className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {HABIT_TYPE_ORDER.map((type) => (
            <TypeCard key={type} type={type} selected={draft.type === type} onSelect={() => onChange(applyType(draft, type))} />
          ))}
        </div>
        <Hint icon={false}>{typeDescription(draft.type)}</Hint>

        {supportsMetric(draft.type) && (
          <div className="mt-3">
            <Segmented
              size="sm"
              fullWidth
              aria-label="Goal or track only"
              value={draft.kind}
              onChange={(kind) => onChange(applyKind(draft, kind))}
              options={[
                { value: 'goal', label: 'Goal' },
                { value: 'metric', label: 'Track only' },
              ]}
            />
            <Hint>
              {isGoal
                ? 'Goals have a target and count toward streaks, XP and completion stats.'
                : 'Track-only habits just record a number, with no target or streaks. They still show up in charts and correlations.'}
            </Hint>
          </div>
        )}
      </Section>

      <Section title={draft.type === 'quit' ? 'Quit details' : 'Goal'}>
        {draft.type === 'check' && draft.period === 'day' && (
          <p className="text-sm text-fg-3">Nothing to set. One tap on Today marks it done.</p>
        )}

        {draft.type === 'check' && draft.period !== 'day' && (
          <NumberField
            label={`How many days per ${draft.period}?`}
            value={draft.target}
            onChange={(v) => patch({ target: v ?? 0 })}
            min={1}
            max={maxPeriodCount(draft.period)}
            step={1}
            suffix={draft.target === 1 ? 'day' : 'days'}
            className="max-w-[16rem]"
            aria-label={`Days per ${draft.period}`}
          />
        )}

        {draft.type === 'quantity' && (
          <div className="flex flex-col gap-3">
            {isGoal && (
              <NumberField
                label={`${periodWord} target`}
                value={draft.target}
                onChange={(v) => patch({ target: v ?? 0 })}
                min={0}
                step={draft.step > 0 ? draft.step : 1}
                suffix={unit || undefined}
                className="max-w-[18rem]"
                aria-label={`${periodWord} target`}
              />
            )}
            <div>
              <Input
                label="Unit"
                value={draft.unit}
                placeholder="glasses"
                maxLength={24}
                autoComplete="off"
                className="max-w-[18rem]"
                onChange={(e) => patch({ unit: e.target.value })}
              />
              <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1 scroll-fade-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {UNIT_SUGGESTIONS.map((u) => (
                  <Chip key={u} size="sm" selected={unit.toLowerCase() === u} onClick={() => patch({ unit: u })}>
                    {u}
                  </Chip>
                ))}
              </div>
            </div>
            <NumberField
              label="+ / − step"
              value={draft.step}
              onChange={(v) => patch({ step: v ?? 0 })}
              min={0}
              step={1}
              suffix={unit || undefined}
              className="max-w-[18rem]"
              aria-label="Step size"
            />
            {showErrors && errors.step && <p className="text-xs font-medium text-danger">{errors.step}</p>}
            {showErrors && errors.target && <p className="text-xs font-medium text-danger">{errors.target}</p>}
          </div>
        )}

        {draft.type === 'duration' && (
          <div className="flex flex-col gap-3">
            {isGoal && (
              <DurationField
                label={`${periodWord} target`}
                value={draft.target}
                onChange={(v) => patch({ target: v ?? 0 })}
                step={draft.step > 0 ? draft.step : 15}
                className="max-w-[20rem]"
              />
            )}
            <div>
              <span className="mb-1.5 block text-[13px] font-medium text-fg-2">+ / − step</span>
              <div className="flex flex-wrap gap-1.5">
                {DURATION_STEPS.map((s) => (
                  <Chip key={s} size="sm" selected={draft.step === s} onClick={() => patch({ step: s })}>
                    {formatMinutes(s)}
                  </Chip>
                ))}
              </div>
            </div>
            {showErrors && errors.target && <p className="text-xs font-medium text-danger">{errors.target}</p>}
            {showErrors && errors.step && <p className="text-xs font-medium text-danger">{errors.step}</p>}
          </div>
        )}

        {draft.type === 'rating' && (
          <div className="flex flex-col gap-4">
            <div>
              <span className="mb-1.5 block text-[13px] font-medium text-fg-2">Scale</span>
              <Segmented
                size="sm"
                aria-label="Rating scale"
                value={draft.ratingMax}
                onChange={(max) => onChange(applyRatingMax(draft, max))}
                options={[
                  { value: 5, label: 'Out of 5' },
                  { value: 10, label: 'Out of 10' },
                ]}
              />
            </div>
            {isGoal && (
              <div>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium text-fg-2">Success threshold</span>
                  <span className="tabular text-sm font-semibold text-accent">
                    {draft.direction === 'atMost'
                      ? `≤ ${draft.target} counts as success`
                      : `${draft.target}+ counts as success`}
                  </span>
                </div>
                <Slider
                  value={draft.target}
                  onChange={(target) => patch({ target })}
                  min={1}
                  max={draft.ratingMax}
                  step={1}
                  color="var(--accent)"
                  aria-label="Success threshold"
                  aria-valuetext={`${draft.target} out of ${draft.ratingMax}`}
                />
                {showErrors && errors.target && <p className="text-xs font-medium text-danger">{errors.target}</p>}
              </div>
            )}
          </div>
        )}

        {draft.type === 'quit' && (
          <div className="flex flex-col gap-3">
            <Input
              type="datetime-local"
              label="Quit date & time"
              className="max-w-[20rem]"
              value={toDateTimeLocalValue(draft.quitStart)}
              error={err('quitStart')}
              hint="The counter starts from here. Past dates are fine."
              onChange={(e) => {
                const v = e.target.value;
                const date = new Date(v);
                if (v === '' || Number.isNaN(date.getTime())) return;
                patch({ quitStart: date.toISOString() });
              }}
            />
            <div>
              <span className="mb-1.5 block text-[13px] font-medium text-fg-2">Milestone</span>
              <div className="flex flex-wrap gap-1.5">
                <Chip size="sm" selected={!(draft.target > 0)} onClick={() => patch({ target: 0 })}>
                  No milestone
                </Chip>
                {QUIT_MILESTONES.map((d) => (
                  <Chip key={d} size="sm" selected={draft.target === d} onClick={() => patch({ target: d })}>
                    {d} days
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        )}

        {showsDirection(draft) && (
          <div className="mt-4">
            <Segmented
              size="sm"
              aria-label="Goal direction"
              value={draft.direction}
              onChange={(direction) => onChange(applyDirection(draft, direction))}
              options={[
                { value: 'atLeast', label: 'At least' },
                { value: 'atMost', label: 'At most' },
              ]}
            />
            <Hint>
              {draft.direction === 'atMost'
                ? `A day counts as a win if you stay within “${formatGoal(draft)}”.`
                : `A day counts as a win if you hit “${formatGoal(draft)}”.`}
            </Hint>
          </div>
        )}
      </Section>

      <Section title="Frequency">
        {showsPeriod(draft) && (
          <Segmented
            fullWidth
            aria-label="How often the goal is evaluated"
            value={draft.period}
            onChange={(period) => onChange(applyPeriod(draft, period))}
            options={[
              { value: 'day', label: 'Daily' },
              { value: 'week', label: 'Weekly' },
              { value: 'month', label: 'Monthly' },
            ]}
          />
        )}

        {showsSchedule(draft) && (
          <div className={cn(showsPeriod(draft) && 'mt-4')}>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {SCHEDULE_PRESETS.map((preset) => (
                <Chip
                  key={preset.id}
                  size="sm"
                  selected={presetOf(draft.schedule) === preset.id}
                  onClick={() => patch({ schedule: [...preset.days] })}
                >
                  {preset.label}
                </Chip>
              ))}
              {presetOf(draft.schedule) === 'custom' && (
                <Badge tone="accent" size="md">
                  Custom
                </Badge>
              )}
            </div>
            <div role="group" aria-label="Days of the week" className="grid grid-cols-7 gap-1">
              {orderedWeekdays(settings.weekStartsOn).map(([index, label]) => {
                const on = draft.schedule.includes(index);
                return (
                  <button
                    key={index}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => patch({ schedule: toggleWeekday(draft.schedule, index) })}
                    className={cn(
                      'h-10 min-w-0 rounded-xl border text-[13px] font-semibold transition-colors duration-150 focus-visible:outline-offset-2',
                      on
                        ? 'border-[color-mix(in_oklab,var(--accent)_45%,transparent)] bg-accent/14 text-accent light:text-[color-mix(in_oklab,var(--accent)_82%,black)]'
                        : 'border-line bg-surface-2 text-fg-3 hover:border-line-strong hover:text-fg-2',
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {showErrors && errors.schedule && <p className="mt-2 text-xs font-medium text-danger">{errors.schedule}</p>}
          </div>
        )}

        {draft.kind === 'goal' && draft.period !== 'day' && (
          <Hint>Log on any day. It all adds up toward “{formatGoal(draft)}”.</Hint>
        )}
        {draft.type === 'rating' && <Hint>Ratings are logged once a day, so they are always daily.</Hint>}
        {draft.type === 'quit' && <Hint>The counter runs every day and only resets when you log a relapse.</Hint>}
        {draft.kind === 'metric' && <Hint>Track-only habits can be logged any day. Nothing is ever “due”.</Hint>}
      </Section>

      <Section title="History">
        <Input
          type="date"
          label="Start date"
          className="max-w-[16rem]"
          value={draft.startDate}
          error={err('startDate')}
          hint="Days before this don’t count against you."
          onChange={(e) => {
            if (e.target.value === '') return;
            patch({ startDate: e.target.value });
          }}
        />
      </Section>

      {/* lets Enter submit, since the real Save button is in the modal footer */}
      <button type="submit" className="sr-only" tabIndex={-1} aria-hidden>
        Save
      </button>
    </form>
  );
}
