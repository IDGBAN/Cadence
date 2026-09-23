import { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Plus } from 'lucide-react';
import type { Category, Habit } from '@/types';
import { formatGoal, typeLabel } from '@/lib/format';
import { useActiveHabits, useCategories, useReducedMotion } from '@/store/hooks';
import { useUI } from '@/store/ui';
import { Button, EmptyState, HabitIcon, cn } from '@/components/ui';

export interface HabitChecklistProps {
  // unticking deletes the habit, the parent keeps it here so it can be put back
  removed: Habit[];
  onToggle: (habit: Habit, keep: boolean) => void;
}

interface Group {
  category: Category | undefined;
  habits: Array<{ habit: Habit; kept: boolean }>;
}

export function HabitChecklist({ removed, onToggle }: HabitChecklistProps) {
  const habits = useActiveHabits();
  const categories = useCategories();
  const openHabitEditor = useUI((s) => s.openHabitEditor);
  const reduced = useReducedMotion();

  const groups = useMemo<Group[]>(() => {
    const all = [
      ...habits.map((habit) => ({ habit, kept: true })),
      ...removed.map((habit) => ({ habit, kept: false })),
    ].sort((a, b) => a.habit.order - b.habit.order);

    const byCategory = new Map<string, Group['habits']>();
    for (const row of all) {
      const list = byCategory.get(row.habit.categoryId);
      if (list) list.push(row);
      else byCategory.set(row.habit.categoryId, [row]);
    }

    const ordered: Group[] = [];
    for (const category of categories) {
      const rows = byCategory.get(category.id);
      if (rows && rows.length > 0) {
        ordered.push({ category, habits: rows });
        byCategory.delete(category.id);
      }
    }
    // habits whose category was deleted
    for (const rows of byCategory.values()) ordered.push({ category: undefined, habits: rows });
    return ordered;
  }, [habits, removed, categories]);

  const keptCount = habits.length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p aria-live="polite" className="text-[13px] text-fg-3">
          <span className="font-semibold text-fg">{keptCount}</span> {keptCount === 1 ? 'habit' : 'habits'} ready to
          track
        </p>
        <Button
          variant="soft"
          size="sm"
          icon={<Plus aria-hidden="true" />}
          onClick={() => openHabitEditor(null)}
        >
          Browse more
        </Button>
      </div>

      {groups.length === 0 && (
        <EmptyState
          icon="🌱"
          title="No habits yet"
          description="Pick a few from the gallery. You can add more later."
          action={
            <Button icon={<Plus aria-hidden="true" />} onClick={() => openHabitEditor(null)}>
              Browse habits
            </Button>
          }
        />
      )}

      <div className="space-y-4">
        {groups.map((group, index) => (
          <section key={group.category?.id ?? `group-${index}`}>
            <h3 className="eyebrow mb-1.5 flex items-center gap-1.5">
              <span aria-hidden="true">{group.category?.icon ?? '✨'}</span>
              {group.category?.name ?? 'Other'}
            </h3>
            <ul className="space-y-1.5">
              {group.habits.map(({ habit, kept }) => (
                <li key={habit.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={kept}
                    onClick={() => onToggle(habit, !kept)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors duration-200',
                      kept
                        ? 'border-line bg-surface-2 hover:border-line-strong'
                        : 'border-dashed border-line bg-transparent opacity-60 hover:opacity-90',
                    )}
                  >
                    <HabitIcon habit={habit} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-sm font-medium', kept ? 'text-fg' : 'text-fg-3 line-through')}>
                        {habit.name}
                      </span>
                      <span className="block truncate text-[12px] text-fg-3">
                        {typeLabel(habit.type)} · {formatGoal(habit)}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex size-[22px] shrink-0 items-center justify-center rounded-md border transition-colors duration-200',
                        kept ? 'border-transparent bg-accent text-accent-fg' : 'border-line-strong text-transparent',
                      )}
                    >
                      <AnimatePresence initial={false}>
                        {kept && (
                          <motion.span
                            key="check"
                            initial={reduced ? false : { scale: 0.4, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={reduced ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 480, damping: 24 }}
                            className="flex"
                          >
                            <Check className="size-3.5" strokeWidth={3.5} />
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
