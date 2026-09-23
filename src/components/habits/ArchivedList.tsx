import { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArchiveRestore, Trash } from 'lucide-react';
import type { Habit } from '@/types';
import { habitStyle } from '@/lib/colors';
import { formatDayShort } from '@/lib/dates';
import { formatGoal, pluralize, typeLabel } from '@/lib/format';
import { useReducedMotion } from '@/store/hooks';
import { useStore } from '@/store/store';
import { Badge, Button, cn, HabitIcon, IconButton } from '@/components/ui';
import { confirmDeleteHabit, setHabitArchived } from './habitActions';

function ArchivedRow({ habit }: { habit: Habit }) {
  const logs = useStore((s) => s.data.logs[habit.id]);
  const reduced = useReducedMotion();

  const history = useMemo(() => {
    const days = logs ? Object.keys(logs) : [];
    if (days.length === 0) return 'Never logged';
    let latest = days[0];
    for (const day of days) if (day > latest) latest = day;
    return `${pluralize(days.length, 'day')} logged · last on ${formatDayShort(latest)}`;
  }, [logs]);

  return (
    <motion.li
      layout={reduced ? false : 'position'}
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      style={habitStyle(habit.color)}
      className={cn(
        'flex items-center gap-3 rounded-2xl border border-line bg-surface-2/60 px-3 py-2.5',
        'transition-colors duration-150 hover:border-line-strong hover:bg-surface-2',
      )}
    >
      <HabitIcon habit={habit} size="md" className="opacity-70" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-tight text-fg-2">{habit.name}</p>
        <p className="mt-0.5 truncate text-xs text-fg-4">
          {formatGoal(habit)} · {history}
        </p>
      </div>

      <Badge tone="neutral" size="sm" className="max-[560px]:hidden">
        {typeLabel(habit.type)}
      </Badge>

      <Button
        size="sm"
        variant="secondary"
        icon={<ArchiveRestore />}
        onClick={() => setHabitArchived(habit, false)}
        className="shrink-0"
      >
        <span className="max-[440px]:sr-only">Restore</span>
      </Button>

      <IconButton
        label={`Delete ${habit.name} forever`}
        size="sm"
        variant="ghost"
        className="text-fg-4 hover:text-danger"
        onClick={() => void confirmDeleteHabit(habit)}
      >
        <Trash />
      </IconButton>
    </motion.li>
  );
}

export interface ArchivedListProps {
  habits: Habit[];
}

export function ArchivedList({ habits }: ArchivedListProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-2xl border border-line bg-surface-2/50 px-4 py-3 text-[13px] leading-relaxed text-fg-3">
        Archived habits keep their history, but they stay off Today and out of your streaks, completion rates
        and insights. Restore one to pick up where you left off.
      </p>

      <ul className="flex list-none flex-col gap-2">
        <AnimatePresence initial={false} mode="popLayout">
          {habits.map((habit) => (
            <ArchivedRow key={habit.id} habit={habit} />
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
