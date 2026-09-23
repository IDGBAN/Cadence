import { useDeferredValue, useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { Button, EmptyState, Segmented } from '@/components/ui';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { useActiveHabits } from '@/store/hooks';
import { useUI } from '@/store/ui';
import { CategoryBreakdown } from '@/components/insights/CategoryBreakdown';
import { CompletionHeatmap, CompletionTrend } from '@/components/insights/CompletionTrend';
import { CorrelationSection, usePairSelection } from '@/components/insights/CorrelationSection';
import { ExplorePanel } from '@/components/insights/ExplorePanel';
import { Leaderboard } from '@/components/insights/Leaderboard';
import { NoticedSection } from '@/components/insights/NoticedSection';
import { OverviewTiles } from '@/components/insights/OverviewTiles';
import { PairDetailModal } from '@/components/insights/PairDetailModal';
import { WeekdayGrid } from '@/components/insights/WeekdayGrid';
import { INSIGHT_RANGES, type Lag, type RangeKey } from '@/components/insights/insightsData';
import { LAG_OPTIONS } from '@/components/insights/lag';
import {
  useCategoryRows, useCorrelations, useHabitRows, useInsightTotals, useInsights, useOverallStats,
  useResolvedRange, useWeekdayRows,
} from '@/components/insights/useInsightsData';

const RANGE_OPTIONS = INSIGHT_RANGES.map((option) => ({
  value: option.value,
  label: option.label,
  title: option.title,
}));

export default function InsightsPage() {
  const habits = useActiveHabits();
  const openHabitEditor = useUI((s) => s.openHabitEditor);

  const [rangeKey, setRangeKey] = useState<RangeKey>('90d');
  const [lag, setLag] = useState<Lag>(0);
  // correlations over "All" can take a while on phones, so keep the controls responsive
  const deferredRangeKey = useDeferredValue(rangeKey);
  const deferredLag = useDeferredValue(lag);
  const updating = deferredRangeKey !== rangeKey || deferredLag !== lag;

  const range = useResolvedRange(deferredRangeKey);
  const overall = useOverallStats(range);
  const rows = useHabitRows(range);
  const totals = useInsightTotals(range, rows);
  const insights = useInsights(range);
  const correlations = useCorrelations(range, deferredLag);
  const weekdayRows = useWeekdayRows(range);
  const categories = useCategoryRows(rows);
  const pair = usePairSelection(correlations.habits);

  const habitsById = new Map(habits.map((habit) => [habit.id, habit] as const));
  const strongest = correlations.pairs[0];
  const suggested = strongest ? { driverId: strongest.driver.id, outcomeId: strongest.outcome.id } : null;

  return (
    <Page width="wide">
      <PageHeader
        eyebrow={
          <>
            <Sparkles className="size-3.5" aria-hidden />
            Insights
          </>
        }
        title="Your patterns"
        subtitle="Completion, trends and how your habits affect each other, based on what you've logged."
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Segmented
            value={rangeKey}
            onChange={setRangeKey}
            options={RANGE_OPTIONS}
            size="sm"
            aria-label="Time range"
          />
          <div className="flex items-center gap-2">
            <span className="eyebrow hidden text-fg-4 sm:inline">Compare</span>
            <Segmented
              value={lag}
              onChange={setLag}
              options={LAG_OPTIONS}
              size="sm"
              aria-label="Compare habits on the same day or the next day"
            />
          </div>
          <span
            aria-live="polite"
            className={`text-xs text-fg-3 transition-opacity duration-200 ${updating ? 'opacity-100' : 'opacity-0'}`}
          >
            {updating ? 'Updating…' : ''}
          </span>
        </div>
      </PageHeader>

      {habits.length === 0 ? (
        <EmptyState
          icon="📊"
          title="Nothing to analyze yet"
          description="Add a habit or two and log for about a week. Patterns will start showing up here."
          action={
            <Button icon={<Plus />} onClick={() => openHabitEditor(null)}>
              Add a habit
            </Button>
          }
        />
      ) : (
        <div
          aria-busy={updating}
          className={`flex flex-col gap-10 transition-opacity duration-200 md:gap-12 ${updating ? 'opacity-60' : ''}`}
        >
          <OverviewTiles range={range} overall={overall} totals={totals} rows={rows} />

          <div className="flex flex-col gap-4">
            <CompletionTrend range={range} overall={overall} />
            <CompletionHeatmap range={range} overall={overall} />
          </div>

          <NoticedSection insights={insights} habitsById={habitsById} daysTracked={totals.daysTracked} />

          <CorrelationSection correlations={correlations} lag={deferredLag} onSelectPair={pair.select} />

          <ExplorePanel habits={correlations.habits} range={range} suggested={suggested} />

          <Leaderboard rows={rows} range={range} />

          <div className="grid gap-10 md:gap-12 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:gap-8">
            <WeekdayGrid rows={weekdayRows} overall={overall} />
            <CategoryBreakdown categories={categories} />
          </div>
        </div>
      )}

      <PairDetailModal
        open={pair.open}
        onClose={pair.clear}
        driver={pair.driver}
        outcome={pair.outcome}
        // one pair is cheap, so skip the deferred value here
        lag={lag}
        onLagChange={setLag}
        onSwap={pair.swap}
        range={range}
        minN={correlations.minN}
      />
    </Page>
  );
}
