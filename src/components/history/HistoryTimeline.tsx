import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Check, NotebookPen, Plus, SearchX, TriangleAlert } from 'lucide-react';
import type { DayCell, DayKey, Habit, Relapse } from '@/types';
import { habitStyle } from '@/lib/colors';
import { eachDay, diffDays, formatDayLong, formatTime, relativeDayLabel } from '@/lib/dates';
import { formatValue, formatValueCompact } from '@/lib/format';
import { dayCells, overallCompletionSeries, type EngineCtx } from '@/lib/habitMath';
import { useData, useReducedMotion } from '@/store/hooks';
import { useUI } from '@/store/ui';
import { relapsesByDayIndex } from '@/components/log/quitDay';
import { statusMeta } from '@/components/log/statusMeta';
import { Badge, Button, EmptyState, HabitIcon, ProgressRing, cn } from '@/components/ui';
import { earliestHistoryDay } from './model';

export interface HistoryTimelineProps {
  habits: Habit[];
  today: DayKey;
  ctx: EngineCtx;
  query: string;
  onClearQuery: () => void;
}

const PAGE = 30;

interface TimelineItem {
  habit: Habit;
  cell: DayCell;
}

interface TimelineDay {
  day: DayKey;
  completed: number;
  total: number;
  rate: number | null;
  items: TimelineItem[];
  notes: TimelineItem[];
  relapses: Relapse[];
  note: string;
}

function isChipworthy(habit: Habit, cell: DayCell): boolean {
  if (habit.type === 'quit') return false; // relapses get their own list
  switch (cell.status) {
    case 'done':
    case 'partial':
    case 'logged':
    case 'skipped':
    case 'missed':
      return true;
    default:
      return false;
  }
}

function chipClass(cell: DayCell): string {
  switch (cell.status) {
    case 'done':
      return 'habit-tint-strong habit-border habit-text';
    case 'partial':
    case 'logged':
      return 'habit-tint border-[color-mix(in_oklab,var(--habit)_28%,transparent)] habit-text';
    case 'skipped':
      return 'stripes border-line text-fg-3';
    default:
      return 'border-danger/25 bg-danger/8 text-danger/85';
  }
}

export function HistoryTimeline({ habits, today, ctx, query, onClearQuery }: HistoryTimelineProps) {
  const data = useData();
  const reduced = useReducedMotion();
  const openLogEditor = useUI((s) => s.openLogEditor);
  const openHabitEditor = useUI((s) => s.openHabitEditor);
  const [count, setCount] = useState(PAGE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const firstDay = useMemo(() => earliestHistoryDay(habits, data, ctx), [habits, data, ctx]);

  // one engine pass per habit for the whole range, not per day
  const rows = useMemo(
    () => habits.map((habit) => ({ habit, cells: dayCells(habit, data, firstDay, today, ctx) })),
    [habits, data, firstDay, today, ctx],
  );
  const totals = useMemo(() => overallCompletionSeries(data, firstDay, today, ctx), [data, firstDay, today, ctx]);
  const visibleHabitIds = useMemo(() => new Set(habits.map((habit) => habit.id)), [habits]);
  const relapseIndex = useMemo(() => relapsesByDayIndex(data, ctx.dayStartHour), [data, ctx.dayStartHour]);

  const entries = useMemo<TimelineDay[]>(() => {
    const out: TimelineDay[] = [];
    const days = eachDay(firstDay, today);
    for (let index = days.length - 1; index >= 0; index--) {
      const day = days[index];
      const items: TimelineItem[] = [];
      const notes: TimelineItem[] = [];
      for (const row of rows) {
        const cell = row.cells[index];
        if (!cell) continue;
        if ((cell.note ?? '').trim() !== '') notes.push({ habit: row.habit, cell });
        if (isChipworthy(row.habit, cell)) items.push({ habit: row.habit, cell });
      }
      const relapses = (relapseIndex.get(day) ?? []).filter((relapse) => visibleHabitIds.has(relapse.habitId));
      const note = data.dayNotes[day] ?? '';
      const total = totals[index];
      if (items.length === 0 && relapses.length === 0 && notes.length === 0 && note.trim() === '') continue;
      out.push({
        day,
        completed: total?.completed ?? 0,
        total: total?.total ?? 0,
        rate: total?.rate ?? null,
        items,
        notes,
        relapses,
        note,
      });
    }
    return out;
  }, [rows, totals, relapseIndex, visibleHabitIds, data.dayNotes, firstDay, today]);

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (needle === '') return entries;
    return entries.filter((entry) => {
      if (entry.note.toLowerCase().includes(needle)) return true;
      if (entry.relapses.some((relapse) => (relapse.note ?? '').toLowerCase().includes(needle))) return true;
      return entry.items.some(
        (item) =>
          item.habit.name.toLowerCase().includes(needle) || (item.cell.note ?? '').toLowerCase().includes(needle),
      );
    });
  }, [entries, needle]);

  const [trackedNeedle, setTrackedNeedle] = useState(needle);
  if (trackedNeedle !== needle) {
    setTrackedNeedle(needle);
    setCount(PAGE);
  }

  const visible = filtered.slice(0, count);
  const hasMore = filtered.length > visible.length;

  const loadMore = useCallback(() => setCount((current) => current + PAGE), []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || typeof IntersectionObserver !== 'function') return;
    const observer = new IntersectionObserver(
      (records) => {
        if (records.some((record) => record.isIntersecting)) loadMore();
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore, visible.length]);

  if (filtered.length === 0) {
    return (
      <div className="card p-2">
        {needle === '' ? (
          <EmptyState
            icon="🗓️"
            title="Nothing logged yet"
            description="Once you start checking off habits, each day shows up here with its notes and numbers."
            action={
              habits.length === 0 ? (
                <Button icon={<Plus />} onClick={() => openHabitEditor()}>
                  Create a habit
                </Button>
              ) : (
                <Button onClick={() => openLogEditor(habits[0].id, today)}>Log today</Button>
              )
            }
          />
        ) : (
          <EmptyState
            icon={<SearchX />}
            title={`No days match “${query.trim()}”`}
            description="Try a habit name or a word from one of your notes."
            action={
              <Button variant="secondary" onClick={onClearQuery}>
                Clear search
              </Button>
            }
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <ul className="flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {visible.map((entry) => (
            <motion.li
              key={entry.day}
              layout={reduced ? false : 'position'}
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            >
              <DayCard entry={entry} today={today} onOpen={openLogEditor} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <div ref={sentinelRef} className="h-px" aria-hidden />

      {hasMore && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={loadMore}>
            Show {Math.min(PAGE, filtered.length - visible.length)} more days
          </Button>
        </div>
      )}
      {!hasMore && filtered.length > PAGE && (
        <p className="mt-5 text-center text-xs text-fg-4">
          That&rsquo;s all {filtered.length} days, back to {formatDayLong(filtered[filtered.length - 1].day)}.
        </p>
      )}
    </div>
  );
}

function DayCard({
  entry,
  today,
  onOpen,
}: {
  entry: TimelineDay;
  today: DayKey;
  onOpen: (habitId: string, day: DayKey) => void;
}) {
  const perfect = entry.total > 0 && entry.completed === entry.total;
  const daysAgo = diffDays(entry.day, today);

  return (
    <article className="card p-4 sm:p-5">
      <header className="flex items-center gap-3">
        <ProgressRing
          value={entry.rate ?? 0}
          size={46}
          stroke={4}
          color={perfect ? 'var(--success)' : 'var(--accent)'}
          aria-label={`${entry.completed} of ${entry.total} habits done`}
        >
          {perfect ? (
            <Check className="size-4 text-success" strokeWidth={3.5} aria-hidden />
          ) : (
            <span className="text-[11px] font-semibold text-fg-2 tabular">
              {entry.rate === null ? '-' : Math.round(entry.rate * 100)}
            </span>
          )}
        </ProgressRing>

        <Link
          to={`/day/${entry.day}`}
          className="min-w-0 flex-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          title={`Open ${formatDayLong(entry.day)}`}
        >
          <div className="font-display text-base font-semibold leading-tight tracking-tight text-fg">
            {relativeDayLabel(entry.day, today)}
          </div>
          <div className="mt-0.5 truncate text-xs text-fg-3 tabular">
            {formatDayLong(entry.day)}
            {daysAgo > 6 && <span className="text-fg-4"> · {daysAgo} days ago</span>}
          </div>
        </Link>

        <div className="flex shrink-0 items-center gap-1.5">
          {perfect && (
            <Badge tone="success" size="md" icon={<Check />}>
              Perfect
            </Badge>
          )}
          {entry.total > 0 && !perfect && (
            <Badge tone="neutral" size="md">
              {entry.completed}/{entry.total}
            </Badge>
          )}
        </div>
      </header>

      {entry.items.length > 0 && (
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {entry.items.map(({ habit, cell }) => {
            const meta = statusMeta(cell.status, habit);
            const compact = formatValueCompact(habit, cell.value);
            return (
              <button
                key={habit.id}
                type="button"
                style={habitStyle(habit.color)}
                onClick={() => onOpen(habit.id, entry.day)}
                title={`${habit.name}: ${meta.label}${cell.value === undefined ? '' : ` · ${formatValue(habit, cell.value)}`}`}
                aria-label={`Edit ${habit.name} on ${formatDayLong(entry.day)}`}
                className={cn(
                  'flex h-8 max-w-full shrink-0 items-center gap-1.5 rounded-full border pe-2.5 ps-1 text-[12px] font-semibold',
                  'transition-[background-color,border-color,transform] duration-150 ease-out active:scale-[0.96]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  chipClass(cell),
                )}
              >
                <HabitIcon habit={habit} size="xs" />
                <span className="truncate">{habit.name}</span>
                {compact && <span className="shrink-0 tabular opacity-80">{compact}</span>}
                {cell.status === 'skipped' && <span className="shrink-0 text-[10px] uppercase opacity-70">skip</span>}
              </button>
            );
          })}
        </div>
      )}

      {entry.relapses.length > 0 && (
        <ul className="mt-3.5 flex flex-col gap-1.5">
          {entry.relapses.map((relapse) => (
            <li
              key={relapse.id}
              className="flex items-center gap-2 rounded-xl border border-danger/20 bg-danger/8 px-2.5 py-1.5 text-[13px]"
            >
              <TriangleAlert className="size-3.5 shrink-0 text-danger" aria-hidden />
              <span className="shrink-0 font-semibold text-danger tabular">{formatTime(relapse.at)}</span>
              <span className="min-w-0 truncate text-fg-2">{relapse.note?.trim() || 'Relapse'}</span>
            </li>
          ))}
        </ul>
      )}

      {entry.note.trim() !== '' && (
        <div className="mt-3.5 flex gap-2.5 rounded-xl border border-line bg-surface-2 p-3 light:bg-surface">
          <NotebookPen className="mt-0.5 size-4 shrink-0 text-fg-4" aria-hidden />
          <p className="min-w-0 whitespace-pre-line text-[13px] leading-relaxed text-fg-2">{entry.note.trim()}</p>
        </div>
      )}

      {entry.notes.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {entry.notes.map(({ habit, cell }) => (
            <li key={habit.id} style={habitStyle(habit.color)} className="flex items-baseline gap-2 text-[13px]">
              <span className="habit-text shrink-0 font-semibold">{habit.name}</span>
              <span className="min-w-0 flex-1 text-fg-3">{(cell.note ?? '').trim()}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
