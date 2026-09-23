import { useMemo, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import type { Habit } from '@/types';
import {
  compareOutcome, correlate, describeR, type Comparison, type CorrelationResult,
} from '@/lib/insights';
import { Badge, Tooltip } from '@/components/ui';
import { formatNumber, pluralize } from '@/lib/format';
import { useData, useEngineCtx } from '@/store/hooks';
import {
  CONFIDENCE_HINT, CONFIDENCE_TONE, averageLabel, describeComparison, describeCorrelationOnly, formatP,
  pairedValues, signedR, splitSideLabels, strengthLabel, type Lag, type PairPoint, type ResolvedRange,
} from './insightsData';

export const MIN_PLOTTABLE = 4;

export interface PairAnalysis {
  driver: Habit;
  outcome: Habit;
  lag: Lag;
  result: CorrelationResult | null;
  // null when either side of the split has fewer than 5 days
  comparison: Comparison | null;
  points: PairPoint[];
  finding: string;
  plottable: boolean;
  threshold?: number;
  thresholdLabel?: string;
  sideLabels?: { on: string; off: string };
}

export function usePairAnalysis(
  driver: Habit | null | undefined,
  outcome: Habit | null | undefined,
  range: ResolvedRange,
  lag: Lag,
  minN: number,
): PairAnalysis | null {
  const data = useData();
  const ctx = useEngineCtx();

  return useMemo(() => {
    if (!driver || !outcome) return null;
    if (lag === 0 && driver.id === outcome.id) return null;
    const opts = { start: range.start, end: range.end, lag };
    const result = correlate(data, ctx, driver, outcome, { ...opts, minN });
    const comparison = compareOutcome(data, ctx, driver, outcome, opts);
    const points = pairedValues(data, ctx, driver, outcome, opts);

    let finding: string;
    if (comparison) finding = describeComparison(driver, outcome, comparison, lag);
    else if (result) finding = describeCorrelationOnly(driver, outcome, result.r, result.n, lag);
    else if (points.length === 0) {
      finding = `You haven't logged ${driver.name} and ${outcome.name} on the same days yet in this range.`;
    } else {
      finding =
        `Only ${pluralize(points.length, 'overlapping day')} so far. You need about ${formatNumber(minN, 0)} ` +
        `before a link between ${driver.name} and ${outcome.name} means anything.`;
    }

    const sideLabels = comparison ? splitSideLabels(driver, comparison) : undefined;
    return {
      driver,
      outcome,
      lag,
      result,
      comparison,
      points,
      finding,
      plottable: points.length >= MIN_PLOTTABLE,
      threshold: comparison?.threshold,
      thresholdLabel: comparison?.splitLabel,
      sideLabels,
    };
  }, [driver, outcome, data, ctx, range.start, range.end, lag, minN]);
}

function StatPill({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  const pill = (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-line bg-surface-2 px-3 py-2 light:bg-surface">
      <span className="eyebrow text-fg-4">{label}</span>
      <span className="truncate text-sm font-semibold tabular text-fg">{value}</span>
    </div>
  );
  return hint ? <Tooltip content={hint}>{pill}</Tooltip> : pill;
}

export function PairStats({ analysis }: { analysis: PairAnalysis }) {
  const { result, points } = analysis;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <StatPill
        label="Correlation"
        value={result ? signedR(result.r) : '—'}
        hint={result ? `${strengthLabel(result.strength)} · ${describeR(result.r)}` : 'Not enough overlapping days'}
      />
      <StatPill
        label="Paired days"
        value={formatNumber(result ? result.n : points.length, 0)}
        hint="Days where both habits have a value. Today isn't included."
      />
      <StatPill
        label="Significance"
        value={result ? formatP(result.p) : '—'}
        hint="How likely a link this strong is to show up by chance."
      />
      <div className="flex items-center rounded-xl border border-line bg-surface-2 px-3 py-2 light:bg-surface">
        {result ? (
          <Tooltip content={CONFIDENCE_HINT[result.confidence]}>
            <span>
              <Badge tone={CONFIDENCE_TONE[result.confidence]} size="sm">
                {result.confidence} confidence
              </Badge>
            </span>
          </Tooltip>
        ) : (
          <Badge tone="neutral" size="sm">
            no reading
          </Badge>
        )}
      </div>
    </div>
  );
}

export function ComparisonSplit({ analysis }: { analysis: PairAnalysis }) {
  const { comparison, outcome, sideLabels } = analysis;
  if (!comparison || !sideLabels) return null;
  const better = comparison.delta >= 0;
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-xl border border-success/25 bg-success/10 px-3 py-2.5">
        <div className="eyebrow text-fg-3">{sideLabels.on}</div>
        <div className="mt-1 font-display text-lg font-semibold tabular text-fg">
          {averageLabel(outcome, comparison.withAvg)}
        </div>
        <div className="mt-0.5 text-[11px] text-fg-4">{pluralize(comparison.withN, 'day')}</div>
      </div>
      <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 light:bg-surface">
        <div className="eyebrow text-fg-3">{sideLabels.off}</div>
        <div className="mt-1 font-display text-lg font-semibold tabular text-fg-2">
          {averageLabel(outcome, comparison.withoutAvg)}
        </div>
        <div className="mt-0.5 text-[11px] text-fg-4">{pluralize(comparison.withoutN, 'day')}</div>
      </div>
      <p className="col-span-2 text-xs text-fg-3">
        Difference{' '}
        <span className={better ? 'font-semibold text-success' : 'font-semibold text-warning'}>
          {better ? '+' : '−'}
          {averageLabel(outcome, Math.abs(comparison.delta))}
        </span>{' '}
        in favor of <span className="text-fg-2">{better ? sideLabels.on.toLowerCase() : sideLabels.off.toLowerCase()}</span>.
      </p>
    </div>
  );
}

export function CausationNote({ className }: { className?: string }) {
  return (
    <p className={`flex items-start gap-2 text-[11px] leading-relaxed text-fg-4 ${className ?? ''}`}>
      <Info className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>
        Correlation isn't causation. Two habits can move together because of something else, like a busy week,
        travel or being sick, or just because you log them at the same time of day.
      </span>
    </p>
  );
}
