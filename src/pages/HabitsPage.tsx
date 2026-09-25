import { useDeferredValue, useMemo, useState } from 'react';
import { Reorder } from 'motion/react';
import { Boxes, FolderPlus, Plus, Search, X } from 'lucide-react';
import type { Category, Habit } from '@/types';
import { typeLabel } from '@/lib/format';
import { useAllHabits, useCategories } from '@/store/hooks';
import { actions } from '@/store/store';
import { useUI } from '@/store/ui';
import { Button, EmptyState, IconButton, Input, Tabs } from '@/components/ui';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { ArchivedList } from '@/components/habits/ArchivedList';
import { CategoryCreateModal, CategoryDeleteModal, CategoryEditModal } from '@/components/habits/CategoryDialogs';
import { CategoryGroup } from '@/components/habits/CategoryGroup';
import { QuickAddStrip } from '@/components/habits/QuickAddStrip';
import { useReorderBuffer } from '@/components/habits/useReorderBuffer';

type Tab = 'active' | 'archived';

interface Group {
  category: Category;
  habits: Habit[];
}

function matches(habit: Habit, categoryName: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return [habit.name, habit.description, habit.unit, categoryName, typeLabel(habit.type)]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function moved(ids: string[], id: string, delta: -1 | 1): string[] | null {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const next = ids.slice();
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

export default function HabitsPage() {
  const allHabits = useAllHabits();
  const categories = useCategories();
  const openHabitEditor = useUI((s) => s.openHabitEditor);

  const [tab, setTab] = useState<Tab>('active');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [creatingCategory, setCreatingCategory] = useState(false);

  const active = useMemo(() => allHabits.filter((h) => !h.archived), [allHabits]);
  const archived = useMemo(() => allHabits.filter((h) => h.archived), [allHabits]);
  const existingNames = useMemo(
    () => new Set(allHabits.map((h) => h.name.trim().toLowerCase())),
    [allHabits],
  );

  const habitBuffer = useReorderBuffer<{ categoryId: string; ids: string[] }>((order) =>
    commitHabitOrder(order.categoryId, order.ids),
  );
  const categoryBuffer = useReorderBuffer<string[]>((ids) => actions().reorderCategories(ids));

  const orderedCategories = useMemo(() => {
    const live = categoryBuffer.value;
    if (!live) return categories;
    const byId = new Map(categories.map((c) => [c.id, c]));
    const listed = live.map((id) => byId.get(id)).filter((c): c is Category => c !== undefined);
    return [...listed, ...categories.filter((c) => !live.includes(c.id))];
  }, [categories, categoryBuffer.value]);

  // ignores the search box so reorders are applied to the real order
  const groups: Group[] = useMemo(() => {
    const live = habitBuffer.value;
    return orderedCategories.map((category) => {
      const habits = active.filter((h) => h.categoryId === category.id);
      if (!live || live.categoryId !== category.id) return { category, habits };
      const byId = new Map(habits.map((h) => [h.id, h]));
      const listed = live.ids.map((id) => byId.get(id)).filter((h): h is Habit => h !== undefined);
      return { category, habits: [...listed, ...habits.filter((h) => !live.ids.includes(h.id))] };
    });
  }, [orderedCategories, active, habitBuffer.value]);

  function commitHabitOrder(categoryId: string, ids: string[]) {
    const ordered: string[] = [];
    for (const group of groups) {
      if (group.category.id === categoryId) ordered.push(...ids);
      else ordered.push(...group.habits.map((h) => h.id));
    }
    ordered.push(...archived.map((h) => h.id));
    actions().reorderHabits(ordered);
  }

  const moveHabit = (categoryId: string, habitId: string, delta: -1 | 1) => {
    const group = groups.find((g) => g.category.id === categoryId);
    if (!group) return;
    const next = moved(
      group.habits.map((h) => h.id),
      habitId,
      delta,
    );
    if (next) commitHabitOrder(categoryId, next);
  };

  const moveCategory = (categoryId: string, delta: -1 | 1) => {
    const next = moved(
      orderedCategories.map((c) => c.id),
      categoryId,
      delta,
    );
    if (next) actions().reorderCategories(next);
  };

  // deferred so typing stays smooth on a phone with lots of rows
  const deferredQuery = useDeferredValue(query);
  const searching = deferredQuery.trim() !== '';

  const visibleGroups = useMemo(() => {
    if (!searching) return groups;
    return groups
      .map((g) => ({ ...g, habits: g.habits.filter((h) => matches(h, g.category.name, deferredQuery)) }))
      .filter((g) => g.habits.length > 0);
  }, [groups, deferredQuery, searching]);

  const visibleArchived = useMemo(() => {
    if (!searching) return archived;
    const nameOf = new Map(categories.map((c) => [c.id, c.name]));
    return archived.filter((h) => matches(h, nameOf.get(h.categoryId) ?? '', deferredQuery));
  }, [archived, categories, deferredQuery, searching]);

  const deletingCount = deleting ? allHabits.filter((h) => h.categoryId === deleting.id).length : 0;

  const searchField = (
    <Input
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder="Search habits…"
      aria-label="Search habits"
      autoComplete="off"
      spellCheck={false}
      leading={<Search />}
      className="sm:max-w-sm"
      trailing={
        query !== '' ? (
          <IconButton label="Clear search" size="xs" onClick={() => setQuery('')}>
            <X />
          </IconButton>
        ) : undefined
      }
    />
  );

  return (
    <Page>
      <PageHeader
        eyebrow={
          <>
            <Boxes className="size-3.5" aria-hidden />
            Manage
          </>
        }
        title="Your habits"
        subtitle="Edit and reorder your habits, or archive the ones you're done with."
        actions={
          <>
            <Button variant="secondary" icon={<FolderPlus />} onClick={() => setCreatingCategory(true)}>
              New category
            </Button>
            <Button icon={<Plus />} onClick={() => openHabitEditor(null)}>
              New habit
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {searchField}
          <Tabs
            value={tab}
            onChange={setTab}
            aria-label="Habit list filter"
            tabs={[
              { value: 'active', label: 'Active', count: active.length },
              { value: 'archived', label: 'Archived', count: archived.length },
            ]}
          />
        </div>
      </PageHeader>

      {tab === 'active' ? (
        <div className="flex flex-col gap-8">
          {active.length === 0 ? (
            <EmptyState
              icon="🌱"
              title="No habits yet"
              description="Start from a template (sleep, water, gym, study) or make your own."
              action={
                <Button icon={<Plus />} onClick={() => openHabitEditor(null)}>
                  Create your first habit
                </Button>
              }
            />
          ) : visibleGroups.length === 0 ? (
            <EmptyState
              icon={<Search />}
              title="No habits match"
              description={`Nothing for "${deferredQuery.trim()}". Try another word or add it as a new habit.`}
              action={
                <>
                  <Button variant="secondary" onClick={() => setQuery('')}>
                    Clear search
                  </Button>
                  <Button icon={<Plus />} onClick={() => openHabitEditor(null)}>
                    New habit
                  </Button>
                </>
              }
            />
          ) : (
            <Reorder.Group
              as="div"
              axis="y"
              values={visibleGroups.map((g) => g.category.id)}
              onReorder={(ids: string[]) => categoryBuffer.push(ids)}
              className="flex flex-col gap-7"
            >
              {visibleGroups.map((group) => (
                <CategoryGroup
                  key={group.category.id}
                  category={group.category}
                  habits={group.habits}
                  reorderable={!searching}
                  deletable={categories.length > 1}
                  onReorderHabits={(ids) => habitBuffer.push({ categoryId: group.category.id, ids })}
                  onMoveHabit={(habitId, delta) => moveHabit(group.category.id, habitId, delta)}
                  onMoveCategory={(delta) => moveCategory(group.category.id, delta)}
                  onEditCategory={() => setEditing(group.category)}
                  onDeleteCategory={() => setDeleting(group.category)}
                />
              ))}
            </Reorder.Group>
          )}

          <QuickAddStrip existingNames={existingNames} />
        </div>
      ) : archived.length === 0 ? (
        <EmptyState
          icon="🗃️"
          title="Nothing archived"
          description="Archived habits leave Today and your stats but keep their history. You can archive a habit from its menu."
        />
      ) : visibleArchived.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title="No archived habits match"
          description={`Nothing archived matches "${deferredQuery.trim()}".`}
          action={
            <Button variant="secondary" onClick={() => setQuery('')}>
              Clear search
            </Button>
          }
        />
      ) : (
        <ArchivedList habits={visibleArchived} />
      )}

      <CategoryCreateModal open={creatingCategory} onClose={() => setCreatingCategory(false)} />
      <CategoryEditModal category={editing} onClose={() => setEditing(null)} />
      <CategoryDeleteModal
        category={deleting}
        categories={categories}
        habitCount={deletingCount}
        onClose={() => setDeleting(null)}
      />
    </Page>
  );
}
