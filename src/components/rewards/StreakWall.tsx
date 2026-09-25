import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Flame, Plus, TriangleAlert } from 'lucide-react';
import type { Habit, StreakInfo } from '@/types';
import { Badge, Button, EmptyState, HabitIcon, SectionHeader, StreakBadge, cn } from '@/components/ui';
import { useActiveHabits, useDayOverview, useReducedMotion, useStreaks } from '@/store/hooks';
import { useUI } from '@/store/ui';
import { habitStyle } from '@/lib/colors';
import { formatStreak, pluralize } from '@/lib/format';

// so a 3-week run outranks a 10-day one
const UNIT_DAYS: Record<StreakInfo['unit'], number> = { day: 1, week: 7, month: 30 };

interface Row {
  habit: Habit;
  streak: StreakInfo;
  weight: number;
  atRisk: boolean;
}

function StreakRow({ row, max }: { row: Row; max: number }) {
  const { habit, streak, atRisk, weight } = row;
  const reduced = useReducedMotion();
  const personalBest = streak.current > 0 && streak.current >= streak.best;
  const fill = max > 0 ? Math.min(1, weight / max) : 0;

  return (
    <motion.li layout={!reduced} style={habitStyle(habit.color)}>
      <Link
        to={`/habits/${habit.id}`}
        className={cn(
          'relative flex items-center gap-3 overflow-hidden rounded-xl border border-line bg-surface-2/50 p-2.5',
          'transition-colors hover:border-line-strong hover:bg-surface-2',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 rounded-xl transition-[width] duration-500"
          style={{
            width: `${Math.max(fill * 100, streak.current > 0 ? 6 : 0)}%`,
            background:
              streak.current > 0
                ? 'linear-gradient(90deg, color-mix(in oklab, var(--flame) 20%, transparent), color-mix(in oklab, var(--flame) 3%, transparent))'
                : 'none',
          }}
        />

        <HabitIcon habit={habit} size="sm" className="relative" />

        <div className="relative min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-fg">{habit.name}</span>
            {personalBest && (
              <Badge size="xs" tone="flame">
                Best
              </Badge>
            )}
            {atRisk && (
              <Badge size="xs" tone="warning" icon={<TriangleAlert />} title="Due today and not done yet">
                At risk
              </Badge>
            )}
          </div>
          <div className="mt-0.5 truncate text-[11px] tabular text-fg-3">
            {streak.current > 0
              ? `${formatStreak(streak, 'current')} · best ${formatStreak(streak, 'best')}`
              : streak.best > 0
                ? `No run going · best was ${formatStreak(streak, 'best')}`
                : 'No streak yet. Start one today'}
          </div>
        </div>

        <div className="relative shrink-0">
          <StreakBadge count={streak.current} unit={streak.unit} size="md" showZero active={personalBest} />
        </div>
      </Link>
    </motion.li>
  );
}

export function StreakWall() {
  const habits = useActiveHabits();
  const streaks = useStreaks(habits);
  const overview = useDayOverview();
  const openHabitEditor = useUI((s) => s.openHabitEditor);

  const openToday = useMemo(() => {
    const ids = new Set<string>();
    for (const item of overview.items) {
      if (item.countsForDay && !item.completeForDay && item.cell.status === 'pending') ids.add(item.habit.id);
    }
    return ids;
  }, [overview]);

  const rows = useMemo<Row[]>(() => {
    // track-only habits never have a streak
    const list = habits.flatMap((habit) => {
      const streak = streaks.get(habit.id);
      if (!streak || habit.kind === 'metric') return [];
      return [{
        habit,
        streak,
        weight: streak.current * UNIT_DAYS[streak.unit],
        atRisk: streak.current > 0 && openToday.has(habit.id),
      }];
    });
    list.sort((a, b) => b.weight - a.weight || b.streak.best - a.streak.best || a.habit.order - b.habit.order);
    return list;
  }, [habits, streaks, openToday]);

  const max = rows.length > 0 ? rows[0].weight : 0;
  const alive = rows.filter((row) => row.streak.current > 0).length;
  const atRiskCount = rows.filter((row) => row.atRisk).length;

  return (
    <section className="card p-4 sm:p-5">
      <SectionHeader
        title="Streak wall"
        eyebrow="Current runs"
        icon={<Flame aria-hidden />}
        subtitle={
          rows.length === 0
            ? 'Your streaks will show up here'
            : atRiskCount > 0
              ? `${alive} running · ${atRiskCount} still open today`
              : `${alive} of ${rows.length} habits on a run`
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          className="py-8"
          icon="🔥"
          title="No habits to track yet"
          description="Add a habit with a goal and its streak shows up here."
          action={
            <Button icon={<Plus aria-hidden />} onClick={() => openHabitEditor(null)}>
              New habit
            </Button>
          }
        />
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {rows.map((row) => (
            <StreakRow key={row.habit.id} row={row} max={max} />
          ))}
        </ul>
      )}

      {rows.length > 0 && atRiskCount > 0 && (
        <p aria-live="polite" className="mt-3 text-[13px] leading-relaxed text-fg-3">
          {pluralize(atRiskCount, 'streak')} can still be saved today.
        </p>
      )}
    </section>
  );
}
