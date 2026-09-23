import { useNavigate, useParams } from 'react-router-dom';
import { Archive, ArchiveRestore, Compass } from 'lucide-react';
import { Page } from '@/components/layout/PageHeader';
import { Button, EmptyState } from '@/components/ui';
import { HabitDetailHeader } from '@/components/habit-detail/HabitDetailHeader';
import { HabitStats } from '@/components/habit-detail/HabitStats';
import { QuitHero } from '@/components/habit-detail/QuitHero';
import { HabitCalendar } from '@/components/habit-detail/HabitCalendar';
import { HabitHeatmap } from '@/components/habit-detail/HabitHeatmap';
import { HabitCharts } from '@/components/habit-detail/HabitCharts';
import { HabitInsights } from '@/components/habit-detail/HabitInsights';
import { HabitNotes } from '@/components/habit-detail/HabitNotes';
import { setHabitArchived } from '@/components/habits/habitActions';
import { useUI } from '@/store/ui';
import { useCategory, useData, useEngineCtx, useHabit, useHabitSummary, useSettings } from '@/store/hooks';

export default function HabitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const habit = useHabit(id);
  const data = useData();
  const ctx = useEngineCtx();
  const settings = useSettings();
  // a quit habit's summary ticks every second, which would re-render every chart on the page
  const summary = useHabitSummary(habit?.type === 'quit' ? undefined : id);
  const category = useCategory(habit?.categoryId);
  const openLogEditor = useUI((s) => s.openLogEditor);

  if (!habit || (habit.type !== 'quit' && !summary)) {
    return (
      <Page width="default">
        <EmptyState
          icon={<Compass />}
          title="Habit not found"
          description="It may have been deleted, or the link is out of date."
          action={<Button onClick={() => navigate('/habits')}>Back to habits</Button>}
        />
      </Page>
    );
  }

  const isQuit = habit.type === 'quit';
  const weekStartsOn = settings.weekStartsOn;

  const restore = () => setHabitArchived(habit, false);

  return (
    <Page width="wide">
      <HabitDetailHeader habit={habit} category={category} data={data} weekStartsOn={weekStartsOn} />

      {habit.archived && (
        <div
          role="status"
          className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-warning/30 bg-warning/8 px-4 py-3"
        >
          <Archive className="size-4 shrink-0 text-warning" aria-hidden />
          <p className="min-w-0 flex-1 text-sm leading-relaxed text-fg-2">
            This habit is archived. It's hidden from Today and your daily rings, but your history is still here.
          </p>
          <Button variant="secondary" size="sm" icon={<ArchiveRestore />} onClick={restore}>
            Restore
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-5 sm:gap-6">
        {isQuit || !summary ? (
          <QuitHero habit={habit} data={data} ctx={ctx} />
        ) : (
          <HabitStats habit={habit} data={data} ctx={ctx} summary={summary} />
        )}

        <HabitCalendar habit={habit} data={data} ctx={ctx} weekStartsOn={weekStartsOn} />

        <HabitHeatmap
          habit={habit}
          data={data}
          ctx={ctx}
          weekStartsOn={weekStartsOn}
          onDayClick={(day) => openLogEditor(habit.id, day)}
        />

        <HabitCharts habit={habit} data={data} ctx={ctx} weekStartsOn={weekStartsOn} />

        <HabitInsights habit={habit} data={data} ctx={ctx} />

        {!isQuit && <HabitNotes habit={habit} data={data} ctx={ctx} />}
      </div>
    </Page>
  );
}
