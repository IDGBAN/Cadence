import { useMemo, useState } from 'react';
import { CalendarDays, CalendarRange, Plus, ScrollText } from 'lucide-react';
import type { DayKey } from '@/types';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  formatMonthYear,
  formatRange,
  startOfMonth,
  startOfWeek,
} from '@/lib/dates';
import { useAllHabits, useCategories, useData, useEngineCtx, useSettings } from '@/store/hooks';
import { useUI } from '@/store/ui';
import { Button, EmptyState, Segmented } from '@/components/ui';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { HistoryGrid } from '@/components/history/HistoryGrid';
import { HistoryTimeline } from '@/components/history/HistoryTimeline';
import { HistoryToolbar } from '@/components/history/HistoryToolbar';
import { StatusLegend } from '@/components/history/StatusLegend';
import { buildGridModel, EMPTY_GRID_MODEL, type HistoryView } from '@/components/history/model';

const VIEW_OPTIONS = [
  { value: 'week' as const, label: 'Week', icon: <CalendarDays />, title: 'One week per habit' },
  { value: 'month' as const, label: 'Month', icon: <CalendarRange />, title: 'The whole month' },
  { value: 'timeline' as const, label: 'Timeline', icon: <ScrollText />, title: 'Day by day, with notes' },
];

export default function HistoryPage() {
  const data = useData();
  const ctx = useEngineCtx();
  const settings = useSettings();
  const allHabits = useAllHabits();
  const categories = useCategories();
  const openHabitEditor = useUI((s) => s.openHabitEditor);

  const [view, setView] = useState<HistoryView>('week');
  const [anchor, setAnchor] = useState<DayKey>(ctx.today);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState('');

  const today = ctx.today;
  const hasArchived = allHabits.some((habit) => habit.archived);
  const habits = useMemo(
    () => (showArchived ? allHabits : allHabits.filter((habit) => !habit.archived)),
    [allHabits, showArchived],
  );

  const range = useMemo(() => {
    if (view === 'month') return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
    return { start: startOfWeek(anchor, settings.weekStartsOn), end: endOfWeek(anchor, settings.weekStartsOn) };
  }, [view, anchor, settings.weekStartsOn]);

  const model = useMemo(
    () =>
      view === 'timeline'
        ? EMPTY_GRID_MODEL
        : buildGridModel(habits, categories, data, range.start, range.end, ctx),
    [view, habits, categories, data, range.start, range.end, ctx],
  );

  const atPresent = today >= range.start && today <= range.end;
  const rangeLabel = view === 'month' ? formatMonthYear(anchor) : formatRange(range.start, range.end);

  const step = (direction: -1 | 1) => {
    const next = view === 'month' ? addMonths(anchor, direction) : addDays(anchor, direction * 7);
    // don't step past the period that contains today
    const start = view === 'month' ? startOfMonth(next) : startOfWeek(next, settings.weekStartsOn);
    if (direction === 1 && start > today) return;
    setAnchor(next > today ? today : next);
  };

  const subtitle =
    view === 'timeline'
      ? 'Every day you tracked, newest first, with your notes.'
      : 'Tap any cell to log or fix it.';

  if (allHabits.length === 0) {
    return (
      <Page width="wide">
        <PageHeader eyebrow="Past days" title="History" subtitle={subtitle} />
        <div className="card p-2">
          <EmptyState
            icon="📊"
            title="No habits yet"
            description="Once you add a habit, this page shows a grid of every day that you can fill in or fix later."
            action={
              <Button icon={<Plus />} onClick={() => openHabitEditor()}>
                Create a habit
              </Button>
            }
          />
        </div>
      </Page>
    );
  }

  return (
    <Page width="wide">
      <PageHeader
        eyebrow="Past days"
        title="History"
        subtitle={subtitle}
        actions={
          <Segmented
            value={view}
            onChange={setView}
            options={VIEW_OPTIONS}
            size="sm"
            aria-label="History view"
            layoutId="history-view"
          />
        }
      />

      <HistoryToolbar
        view={view}
        anchor={anchor}
        today={today}
        weekStartsOn={settings.weekStartsOn}
        rangeLabel={rangeLabel}
        atPresent={atPresent}
        onStep={step}
        onJump={setAnchor}
        showArchived={showArchived}
        onShowArchivedChange={setShowArchived}
        hasArchived={hasArchived}
        query={query}
        onQueryChange={setQuery}
      />

      {view === 'timeline' ? (
        <HistoryTimeline
          habits={habits}
          today={today}
          ctx={ctx}
          query={query}
          onClearQuery={() => setQuery('')}
        />
      ) : habits.length === 0 ? (
        <div className="card p-2">
          <EmptyState
            icon="🗄️"
            title="Every habit is archived"
            description="Turn on “Archived” above to see the history of your archived habits."
            action={
              <Button variant="secondary" onClick={() => setShowArchived(true)}>
                Show archived
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <HistoryGrid key={view} model={model} view={view} today={today} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <StatusLegend />
            <p className="text-[11px] text-fg-4">
              Click to log · Right-click or long-press to edit · Arrow keys to move, E to edit
            </p>
          </div>
        </>
      )}
    </Page>
  );
}
