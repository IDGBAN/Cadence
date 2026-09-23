import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { Reorder, useDragControls } from 'motion/react';
import { Ellipsis, GripVertical, Pencil, Plus, Trash } from 'lucide-react';
import type { Category, Habit } from '@/types';
import { useUI } from '@/store/ui';
import { Button, cn, IconButton, Menu, type MenuItem } from '@/components/ui';
import { HabitRow } from './HabitRow';

export interface CategoryGroupProps {
  category: Category;
  habits: Habit[];
  // off while searching, since the filtered order isn't the real one
  reorderable: boolean;
  deletable: boolean;
  onReorderHabits: (habitIds: string[]) => void;
  onMoveHabit: (habitId: string, delta: -1 | 1) => void;
  onMoveCategory: (delta: -1 | 1) => void;
  onEditCategory: () => void;
  onDeleteCategory: () => void;
}

export function CategoryGroup({
  category,
  habits,
  reorderable,
  deletable,
  onReorderHabits,
  onMoveHabit,
  onMoveCategory,
  onEditCategory,
  onDeleteCategory,
}: CategoryGroupProps) {
  const controls = useDragControls();
  const openHabitEditor = useUI((s) => s.openHabitEditor);

  const addHere = () => openHabitEditor(null, { categoryId: category.id });

  const startDrag = (event: ReactPointerEvent) => {
    if (!reorderable) return;
    event.preventDefault();
    controls.start(event);
  };

  const onGripKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    if (!reorderable) return;
    event.preventDefault();
    onMoveCategory(event.key === 'ArrowUp' ? -1 : 1);
  };

  const menuItems: MenuItem[] = [
    { label: 'Rename & emoji', icon: <Pencil />, onSelect: onEditCategory },
    { label: 'Add a habit here', icon: <Plus />, onSelect: addHere },
    {
      label: 'Delete category',
      icon: <Trash />,
      danger: true,
      separator: true,
      disabled: !deletable,
      onSelect: onDeleteCategory,
    },
  ];

  return (
    <Reorder.Item
      as="section"
      value={category.id}
      dragListener={false}
      dragControls={controls}
      layout="position"
      whileDrag={{ scale: 1.005, zIndex: 40 }}
      transition={{ type: 'spring', stiffness: 460, damping: 40, mass: 0.8 }}
      aria-label={category.name}
      className="list-none"
    >
      <header className="mb-2 flex items-center gap-1.5 px-1">
        {reorderable ? (
          <button
            type="button"
            aria-label={`Drag to reorder ${category.name}. Or hold Alt and press up or down.`}
            onPointerDown={startDrag}
            onKeyDown={onGripKeyDown}
            className={cn(
              'flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-fg-4',
              'transition-colors hover:bg-surface-2 hover:text-fg-2 active:cursor-grabbing',
            )}
          >
            <GripVertical className="size-3.5" aria-hidden />
          </button>
        ) : (
          <span className="w-1 shrink-0" aria-hidden />
        )}

        <span className="text-base leading-none" aria-hidden>
          {category.icon}
        </span>
        <h2 className="truncate font-display text-[15px] font-semibold tracking-tight text-fg-2">{category.name}</h2>
        <span className="tabular rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-fg-4">
          {habits.length}
        </span>

        <div className="ml-auto flex items-center gap-0.5">
          <IconButton label={`Add a habit to ${category.name}`} size="sm" onClick={addHere}>
            <Plus />
          </IconButton>
          <Menu
            items={menuItems}
            placement="bottom-end"
            trigger={
              <IconButton label={`Options for ${category.name}`} size="sm">
                <Ellipsis />
              </IconButton>
            }
          />
        </div>
      </header>

      {habits.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong px-4 py-5 text-center">
          <p className="text-[13px] text-fg-3">Nothing in {category.name} yet.</p>
          <Button variant="ghost" size="sm" icon={<Plus />} className="mt-2" onClick={addHere}>
            Add a habit here
          </Button>
        </div>
      ) : (
        <Reorder.Group
          as="ul"
          axis="y"
          values={habits.map((h) => h.id)}
          onReorder={onReorderHabits}
          className="flex flex-col gap-2"
        >
          {habits.map((habit) => (
            <HabitRow
              key={habit.id}
              habit={habit}
              reorderable={reorderable}
              onMove={(delta) => onMoveHabit(habit.id, delta)}
            />
          ))}
        </Reorder.Group>
      )}
    </Reorder.Item>
  );
}
