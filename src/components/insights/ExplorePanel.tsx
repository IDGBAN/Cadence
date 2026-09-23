import { useMemo, useState } from 'react';
import { ArrowLeftRight, Compass } from 'lucide-react';
import type { Habit } from '@/types';
import { Card, IconButton, Segmented, SectionHeader, Select, type SelectOption } from '@/components/ui';
import { useMediaQuery } from '@/store/hooks';
import { PairChart } from './PairChart';
import { CausationNote, ComparisonSplit, PairStats, usePairAnalysis } from './PairAnalysis';
import type { Lag, ResolvedRange } from './insightsData';
import { LAG_OPTIONS } from './lag';

// lower than the matrix on purpose, the confidence badge flags thin data
const EXPLORE_MIN_N = 5;

function optionsFor(habits: Habit[], excludeId?: string): SelectOption<string>[] {
  return habits
    .filter((habit) => habit.id !== excludeId)
    .map((habit) => ({
      value: habit.id,
      label: habit.name,
      icon: (
        <span aria-hidden className="text-base leading-none">
          {habit.icon}
        </span>
      ),
    }));
}

export interface ExplorePanelProps {
  habits: Habit[];
  range: ResolvedRange;
  suggested?: { driverId: string; outcomeId: string } | null;
}

export function ExplorePanel({ habits, range, suggested }: ExplorePanelProps) {
  const wide = useMediaQuery('(min-width: 640px)');
  const [lag, setLag] = useState<Lag>(0);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [outcomeId, setOutcomeId] = useState<string | null>(null);

  const ids = useMemo(() => new Set(habits.map((h) => h.id)), [habits]);

  const fallbackDriver = suggested && ids.has(suggested.driverId) ? suggested.driverId : habits[0]?.id;
  const fallbackOutcome = suggested && ids.has(suggested.outcomeId) ? suggested.outcomeId : habits[1]?.id;

  const activeDriverId = driverId && ids.has(driverId) ? driverId : fallbackDriver;
  let activeOutcomeId = outcomeId && ids.has(outcomeId) ? outcomeId : fallbackOutcome;
  // a habit vs itself on the same day is meaningless
  if (lag === 0 && activeOutcomeId === activeDriverId) {
    activeOutcomeId = habits.find((h) => h.id !== activeDriverId)?.id ?? activeOutcomeId;
  }

  const driver = habits.find((h) => h.id === activeDriverId) ?? null;
  const outcome = habits.find((h) => h.id === activeOutcomeId) ?? null;

  const analysis = usePairAnalysis(driver, outcome, range, lag, EXPLORE_MIN_N);

  const swap = () => {
    setDriverId(activeOutcomeId ?? null);
    setOutcomeId(activeDriverId ?? null);
  };

  if (habits.length < 2) return null;

  return (
    <section aria-labelledby="insights-explore" className="flex flex-col gap-4">
      <SectionHeader
        as="h2"
        icon={<Compass />}
        eyebrow="Explore"
        title={<span id="insights-explore">Compare two habits</span>}
        subtitle="Pick any two habits and see how they relate"
      />

      <Card padding="md" className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
            <Select
              label="First habit"
              value={activeDriverId ?? ''}
              onChange={setDriverId}
              options={optionsFor(habits)}
              aria-label="Driver habit"
            />
            <div className="flex justify-center pb-1 sm:pb-0">
              <IconButton label="Swap habits" variant="secondary" size="sm" onClick={swap}>
                <ArrowLeftRight />
              </IconButton>
            </div>
            <Select
              label={lag === 1 ? 'Second habit (next day)' : 'Second habit'}
              value={activeOutcomeId ?? ''}
              onChange={setOutcomeId}
              options={optionsFor(habits, lag === 0 ? (activeDriverId ?? undefined) : undefined)}
              aria-label="Outcome habit"
            />
          </div>
          <Segmented
            value={lag}
            onChange={setLag}
            options={LAG_OPTIONS}
            size="sm"
            aria-label="Compare same day or next day"
            className="shrink-0"
          />
        </div>

        {analysis && driver && outcome ? (
          <>
            <p className="text-[15px] leading-relaxed text-pretty text-fg-2">{analysis.finding}</p>

            {analysis.plottable ? (
              <PairChart
                driver={driver}
                outcome={outcome}
                points={analysis.points}
                lag={lag}
                sideLabels={analysis.sideLabels}
                threshold={analysis.threshold}
                thresholdLabel={analysis.thresholdLabel}
                height={wide ? 250 : 200}
              />
            ) : (
              <div className="flex items-center justify-center rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-fg-3">
                Not enough days with both habits logged yet.
              </div>
            )}

            <ComparisonSplit analysis={analysis} />
            <PairStats analysis={analysis} />
            <CausationNote />
          </>
        ) : (
          <p className="py-6 text-center text-sm text-fg-3">Choose two different habits to compare.</p>
        )}
      </Card>
    </section>
  );
}
