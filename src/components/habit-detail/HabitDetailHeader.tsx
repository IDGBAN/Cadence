import { Link, useNavigate } from 'react-router-dom';
import { Archive, ArchiveRestore, ChevronRight, Copy, Download, Ellipsis, Pencil, Plus, Trash } from 'lucide-react';
import type { AppData, Category, Habit } from '@/types';
import { Badge, Button, IconButton, HabitIcon, Menu } from '@/components/ui';
import { confirmDeleteHabit, setHabitArchived } from '@/components/habits/habitActions';
import { PageHeader } from '@/components/layout/PageHeader';
import { actions } from '@/store/store';
import { useToday } from '@/store/hooks';
import { useUI, toast } from '@/store/ui';
import { exportCsv } from '@/lib/backup';
import { formatGoal, periodLabel, scheduleLabel, typeLabel } from '@/lib/format';
import { toDayKey } from '@/lib/dates';
import { habitStyle } from '@/lib/colors';

export interface HabitDetailHeaderProps {
  habit: Habit;
  category: Category | undefined;
  data: AppData;
  weekStartsOn: 0 | 1;
}

function fileSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'habit';
}

function exportHabitCsv(data: AppData, habit: Habit): void {
  const scoped: AppData = {
    ...data,
    habits: [habit],
    logs: { [habit.id]: data.logs[habit.id] ?? {} },
    relapses: data.relapses.filter((r) => r.habitId === habit.id),
    dayNotes: {},
  };
  // leading BOM so Excel opens it as utf-8
  const blob = new Blob([`﻿${exportCsv(scoped)}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileSlug(habit.name)}-${toDayKey(new Date())}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast({ title: 'CSV exported', description: `All logged days for ${habit.name}.`, tone: 'success', icon: '📄' });
}

export function HabitDetailHeader({ habit, category, data, weekStartsOn }: HabitDetailHeaderProps) {
  const navigate = useNavigate();
  const today = useToday();
  const openLogEditor = useUI((s) => s.openLogEditor);
  const openHabitEditor = useUI((s) => s.openHabitEditor);

  const duplicate = () => {
    const copy = actions().duplicateHabit(habit.id);
    if (!copy) return;
    toast({ title: 'Habit duplicated', description: copy.name, tone: 'success', icon: '📋' });
    navigate(`/habits/${copy.id}`);
  };

  const toggleArchive = () => setHabitArchived(habit, !habit.archived);

  const remove = async () => {
    if (await confirmDeleteHabit(habit)) navigate('/habits');
  };

  const goal = formatGoal(habit);
  const schedule = scheduleLabel(habit, weekStartsOn);

  return (
    <PageHeader
      eyebrow={
        <span className="flex min-w-0 items-center gap-1">
          <Link
            to="/habits"
            className="rounded-md text-fg-3 transition-colors hover:text-fg focus-visible:outline-offset-2"
          >
            Habits
          </Link>
          <ChevronRight className="size-3 shrink-0 text-fg-4" aria-hidden />
          <span className="truncate text-fg-3">{category ? `${category.icon} ${category.name}` : 'Uncategorized'}</span>
        </span>
      }
      title={
        <span className="flex min-w-0 items-center gap-3 sm:gap-4">
          <HabitIcon habit={habit} size="xl" className="hidden sm:inline-flex" />
          <HabitIcon habit={habit} size="lg" className="sm:hidden" />
          <span className="min-w-0 break-words">{habit.name}</span>
        </span>
      }
      subtitle={habit.description?.trim() ? habit.description : undefined}
      actions={
        <>
          <Button icon={<Plus />} onClick={() => openLogEditor(habit.id, today)}>
            Log today
          </Button>
          <Button variant="secondary" icon={<Pencil />} onClick={() => openHabitEditor(habit.id)}>
            Edit
          </Button>
          <Menu
            aria-label={`More actions for ${habit.name}`}
            trigger={
              <IconButton label="More actions" variant="secondary">
                <Ellipsis />
              </IconButton>
            }
            items={[
              { label: 'Duplicate habit', icon: <Copy />, onSelect: duplicate },
              {
                label: habit.archived ? 'Restore habit' : 'Archive habit',
                icon: habit.archived ? <ArchiveRestore /> : <Archive />,
                onSelect: toggleArchive,
              },
              { label: 'Export CSV', icon: <Download />, onSelect: () => exportHabitCsv(data, habit) },
              { label: 'Delete habit', icon: <Trash />, danger: true, separator: true, onSelect: () => void remove() },
            ]}
          />
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2" style={habitStyle(habit.color)}>
        <Badge tone="habit" size="md">
          {goal}
        </Badge>
        {schedule !== goal && (
          <Badge tone="neutral" size="md">
            {schedule}
          </Badge>
        )}
        <Badge tone="neutral" size="md">
          {typeLabel(habit.type)}
        </Badge>
        {habit.kind === 'metric' ? (
          <Badge tone="accent" size="md">
            Metric
          </Badge>
        ) : (
          habit.type !== 'quit' &&
          habit.period !== 'day' && (
            <Badge tone="neutral" size="md">
              {periodLabel(habit.period)}
            </Badge>
          )
        )}
      </div>
    </PageHeader>
  );
}
