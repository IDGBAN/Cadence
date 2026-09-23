import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive,
  ChartLine,
  Ellipsis,
  MessageSquareText,
  NotebookPen,
  PenLine,
  SkipForward,
  Undo2,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { DayKey } from '@/types';
import type { DayOverviewItem } from '@/lib/habitMath';
import { Badge, Chip, HabitIcon, IconButton, Menu, StreakBadge, cn } from '@/components/ui';
import type { MenuItem } from '@/components/ui';
import { habitStyle } from '@/lib/colors';
import { formatDayShort } from '@/lib/dates';
import { formatGoal } from '@/lib/format';
import { setSkippedWithFeedback } from '@/lib/logActions';
import { setHabitArchived } from '@/components/habits/habitActions';
import { useHabitSummary, useReducedMotion } from '@/store/hooks';
import { useUI } from '@/store/ui';
import { CheckControl } from './controls/CheckControl';
import { DurationControl } from './controls/DurationControl';
import { QuantityControl } from './controls/QuantityControl';
import { QuitControl } from './controls/QuitControl';
import { RatingControl } from './controls/RatingControl';
import { PeriodRow } from './PeriodRow';
import { cardEntrance, cardState, isPeriodGoal, loggedValue, stateLabel, type CardState } from './shared';

export interface HabitCardProps {
  item: DayOverviewItem;
  day: DayKey;
  today: DayKey;
  index: number;
  onSelectDay: (day: DayKey) => void;
}

const STATE_CLASS: Record<CardState, string> = {
  done: 'habit-border bg-[color-mix(in_oklab,var(--habit)_9%,var(--surface))]',
  logged: 'habit-border bg-[color-mix(in_oklab,var(--habit)_6%,var(--surface))]',
  partial: 'border-line-strong',
  skipped: 'border-line',
  missed: 'border-[color-mix(in_oklab,var(--danger)_28%,transparent)]',
  pending: 'border-line',
  neutral: 'border-line',
};

const STATE_BADGE: Partial<Record<CardState, 'neutral' | 'danger'>> = {
  skipped: 'neutral',
  missed: 'danger',
};

// unchanged overview items keep their reference, so keep props stable and only the tapped card re-renders
export const HabitCard = memo(function HabitCard({ item, day, today, index, onSelectDay }: HabitCardProps) {
  const { habit, cell, period } = item;
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const summary = useHabitSummary(habit.id);
  const openLogEditor = useUI((s) => s.openLogEditor);
  const openHabitEditor = useUI((s) => s.openHabitEditor);

  const state = cardState(item);
  const value = loggedValue(item);
  const skipped = cell.status === 'skipped';
  const periodic = isPeriodGoal(habit);
  const isGoal = habit.kind === 'goal';
  const streak = summary?.streak;
  const note = (cell.note ?? '').trim();
  // formatGoal says "Track only" for metrics, which the badge already shows
  const goalText = isGoal ? formatGoal(habit) : '';
  const badgeTone = STATE_BADGE[state];
  const label = stateLabel(state);

  const menuItems: MenuItem[] = [
    {
      label: 'Edit log and note',
      icon: <PenLine aria-hidden />,
      onSelect: () => openLogEditor(habit.id, day),
    },
    ...(note
      ? []
      : [
          {
            label: 'Add a note',
            icon: <NotebookPen aria-hidden />,
            onSelect: () => openLogEditor(habit.id, day, 'note'),
          },
        ]),
    ...(habit.type === 'quit'
      ? []
      : [
          {
            label: skipped ? 'Remove skip' : 'Skip this day',
            icon: skipped ? <Undo2 aria-hidden /> : <SkipForward aria-hidden />,
            onSelect: () => setSkippedWithFeedback(habit.id, day, !skipped),
          },
        ]),
    {
      label: 'View details',
      icon: <ChartLine aria-hidden />,
      separator: true,
      onSelect: () => navigate(`/habits/${habit.id}`),
    },
    {
      label: 'Edit habit',
      icon: <PenLine aria-hidden />,
      onSelect: () => openHabitEditor(habit.id),
    },
    {
      label: 'Archive',
      icon: <Archive aria-hidden />,
      danger: true,
      onSelect: () => setHabitArchived(habit, true),
    },
  ];

  const control = (() => {
    if (skipped) return null;
    switch (habit.type) {
      case 'quantity':
        return (
          <QuantityControl
            habit={habit}
            day={day}
            value={value}
            {...(periodic || !isGoal ? {} : { progress: cell.progress, target: habit.target })}
          />
        );
      case 'duration':
        return (
          <DurationControl
            habit={habit}
            day={day}
            value={value}
            {...(periodic || !isGoal ? {} : { progress: cell.progress, target: habit.target })}
          />
        );
      case 'rating':
        return <RatingControl habit={habit} day={day} value={value} />;
      case 'quit':
        return <QuitControl habit={habit} day={day} today={today} />;
      default:
        return null;
    }
  })();

  const showPeriodRow = periodic && !skipped;
  const hasBody = control !== null || showPeriodRow || skipped;

  return (
    <motion.article
      layout={reduced ? false : 'position'}
      {...cardEntrance(index, reduced)}
      exit={reduced ? undefined : { opacity: 0, scale: 0.97, transition: { duration: 0.16 } }}
      style={habitStyle(habit.color)}
      aria-label={`${habit.name}${label ? `, ${label}` : ''}`}
      className={cn(
        'card relative isolate overflow-hidden p-3.5 transition-colors duration-300 sm:p-4',
        STATE_CLASS[state],
      )}
    >
      {skipped && <span aria-hidden className="stripes pointer-events-none absolute inset-0 -z-10 opacity-40" />}

      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => navigate(`/habits/${habit.id}`)}
          aria-label={`Open ${habit.name} details`}
          className="shrink-0 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span
            className={cn(
              'block transition-transform duration-200',
              !reduced && 'hover:scale-105',
              state === 'done' && !reduced && 'animate-pop',
            )}
          >
            <HabitIcon habit={habit} size="md" filled={item.completeForDay} />
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="min-w-0 truncate font-display text-[15px] font-semibold leading-tight text-fg sm:text-base">
              {habit.name}
            </h3>
            {badgeTone && (
              <Badge size="xs" tone={badgeTone}>
                {label}
              </Badge>
            )}
            {!isGoal && (
              <Badge size="xs" tone="neutral" title="Tracked for insights only. There's no pass or fail.">
                Track only
              </Badge>
            )}
          </div>

          {(goalText !== '' || (streak && streak.current > 0)) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-3">
              {goalText !== '' && <span className="truncate">{goalText}</span>}
              {streak && streak.current > 0 && (
                <StreakBadge
                  count={streak.current}
                  unit={streak.unit}
                  size="sm"
                  active={item.completeForDay}
                  withUnit
                />
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {habit.type === 'check' && !skipped && (
            <CheckControl habit={habit} day={day} done={cell.status === 'done'} />
          )}
          <Menu
            aria-label={`${habit.name} actions`}
            items={menuItems}
            trigger={
              <IconButton label={`${habit.name} actions`} size="sm" variant="ghost">
                <Ellipsis />
              </IconButton>
            }
          />
        </div>
      </div>

      {hasBody && (
        <div className="mt-3 flex flex-col gap-3">
          {skipped && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-fg-3">
                Skipped on {formatDayShort(day)}. It won’t count for or against your streak.
              </p>
              <Chip size="sm" icon={<Undo2 aria-hidden />} onClick={() => setSkippedWithFeedback(habit.id, day, false)}>
                Unskip
              </Chip>
            </div>
          )}
          {control}
          {showPeriodRow && (
            <PeriodRow habit={habit} day={day} today={today} period={period} onSelectDay={onSelectDay} />
          )}
        </div>
      )}

      {note && (
        <button
          type="button"
          onClick={() => openLogEditor(habit.id, day, 'note')}
          className={cn(
            'mt-3 flex w-full items-start gap-2 rounded-xl border border-line bg-surface-2 px-2.5 py-2 text-left text-xs text-fg-2',
            'transition-colors hover:border-line-strong hover:bg-surface-3',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          )}
        >
          <MessageSquareText aria-hidden className="mt-px size-3.5 shrink-0 text-fg-3" />
          <span className="line-clamp-2 leading-snug">{note}</span>
          <span className="sr-only">Edit this note</span>
        </button>
      )}
    </motion.article>
  );
});
