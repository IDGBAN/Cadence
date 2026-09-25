import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Reorder, useDragControls } from 'motion/react';
import { Archive, ArchiveRestore, ChartColumn, CircleCheck, Copy, Ellipsis, GripVertical, Pencil, Trash } from 'lucide-react';
import type { Habit } from '@/types';
import { habitStyle } from '@/lib/colors';
import { formatGoal, formatPercent, scheduleLabel, typeLabel } from '@/lib/format';
import { useHabitSummary, useSettings, useToday } from '@/store/hooks';
import { useUI } from '@/store/ui';
import { Badge, cn, HabitIcon, IconButton, Menu, StreakBadge, Tooltip, type MenuItem } from '@/components/ui';
import { confirmDeleteHabit, duplicateHabitWithToast, setHabitArchived } from './habitActions';
import { HabitStrip } from './HabitStrip';

export interface HabitRowProps {
  habit: Habit;
  reorderable: boolean;
  onMove: (delta: -1 | 1) => void;
}

export function HabitRow({ habit, reorderable, onMove }: HabitRowProps) {
  const controls = useDragControls();
  const navigate = useNavigate();
  const settings = useSettings();
  const today = useToday();
  const summary = useHabitSummary(habit.id);
  const openLogEditor = useUI((s) => s.openLogEditor);
  const openHabitEditor = useUI((s) => s.openHabitEditor);

  const isGoal = habit.kind === 'goal';
  const goal = formatGoal(habit, settings.weekStartsOn);
  const schedule = scheduleLabel(habit, settings.weekStartsOn);
  const goalLine = goal === schedule ? goal : `${goal} · ${schedule}`;
  const strength = summary?.strength ?? 0;

  const startDrag = (event: ReactPointerEvent) => {
    if (!reorderable) return;
    event.preventDefault();
    controls.start(event);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLLIElement>) => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    if (!reorderable) return;
    event.preventDefault();
    onMove(event.key === 'ArrowUp' ? -1 : 1);
  };

  const items: MenuItem[] = [
    { label: 'Log today', icon: <CircleCheck />, onSelect: () => openLogEditor(habit.id, today) },
    { label: 'View details', icon: <ChartColumn />, onSelect: () => navigate(`/habits/${habit.id}`) },
    { label: 'Edit habit', icon: <Pencil />, onSelect: () => openHabitEditor(habit.id) },
    { label: 'Duplicate', icon: <Copy />, onSelect: () => duplicateHabitWithToast(habit) },
    {
      label: habit.archived ? 'Restore' : 'Archive',
      icon: habit.archived ? <ArchiveRestore /> : <Archive />,
      separator: true,
      onSelect: () => setHabitArchived(habit, !habit.archived),
    },
    { label: 'Delete', icon: <Trash />, danger: true, onSelect: () => void confirmDeleteHabit(habit) },
  ];

  return (
    <Reorder.Item
      value={habit.id}
      dragListener={false}
      dragControls={controls}
      layout="position"
      onKeyDown={onKeyDown}
      whileDrag={{ scale: 1.015, zIndex: 30 }}
      transition={{ type: 'spring', stiffness: 520, damping: 42, mass: 0.7 }}
      style={habitStyle(habit.color)}
      className={cn(
        'group relative flex list-none items-center gap-2 rounded-2xl border border-line bg-surface px-2 py-2.5 sm:gap-3 sm:px-3',
        'transition-colors duration-150 hover:border-[color-mix(in_oklab,var(--habit)_38%,var(--line-strong))] hover:bg-surface-2',
        'focus-within:border-[color-mix(in_oklab,var(--habit)_45%,var(--line-strong))]',
      )}
    >
      {reorderable ? (
        <button
          type="button"
          aria-label={`Drag to reorder ${habit.name}. Or hold Alt and press up or down.`}
          onPointerDown={startDrag}
          className={cn(
            'relative z-[1] flex size-10 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-fg-4',
            'transition-colors hover:bg-surface-3 hover:text-fg-2 active:cursor-grabbing max-sm:size-8',
          )}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
      ) : (
        <span className="w-1 shrink-0" aria-hidden />
      )}

      <HabitIcon habit={habit} size="md" />

      <div className="min-w-0 flex-1">
        <Link
          to={`/habits/${habit.id}`}
          className={cn(
            'block truncate text-[15px] font-semibold leading-tight text-fg outline-none',
            'after:absolute after:inset-0 after:rounded-2xl focus-visible:after:outline focus-visible:after:outline-2',
            'focus-visible:after:outline-offset-2 focus-visible:after:outline-accent',
          )}
        >
          {habit.name}
        </Link>
        <p className="mt-0.5 truncate text-xs text-fg-3">{goalLine}</p>
      </div>

      <div className="relative z-[1] flex shrink-0 items-center gap-2 sm:gap-3">
        <Badge tone="habit" size="sm" className="max-[560px]:hidden">
          {typeLabel(habit.type)}
        </Badge>

        <HabitStrip habit={habit} days={30} className="hidden w-28 md:flex lg:w-36" />

        {isGoal ? (
          <Tooltip content="Habit strength: how consistent you've been lately">
            <span className="tabular hidden w-12 text-right text-[13px] font-semibold text-fg-2 lg:block">
              {formatPercent(strength)}
            </span>
          </Tooltip>
        ) : (
          <span className="hidden w-12 text-right text-[13px] font-medium text-fg-4 lg:block">—</span>
        )}

        {isGoal && summary && (
          <StreakBadge
            count={summary.streak.current}
            unit={summary.streak.unit}
            size="sm"
            showZero
            className="max-[440px]:hidden"
          />
        )}

        <Menu
          items={items}
          placement="bottom-end"
          trigger={
            <IconButton label={`Actions for ${habit.name}`} size="sm">
              <Ellipsis />
            </IconButton>
          }
        />
      </div>
    </Reorder.Item>
  );
}
