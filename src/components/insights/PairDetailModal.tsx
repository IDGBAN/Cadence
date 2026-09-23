import { ArrowLeftRight, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Habit } from '@/types';
import { Button, HabitIcon, Modal, Segmented } from '@/components/ui';
import { formatRange } from '@/lib/dates';
import { useMediaQuery } from '@/store/hooks';
import { PairChart } from './PairChart';
import { CausationNote, ComparisonSplit, PairStats, usePairAnalysis } from './PairAnalysis';
import type { Lag, ResolvedRange } from './insightsData';
import { LAG_OPTIONS } from './lag';

export interface PairDetailModalProps {
  open: boolean;
  onClose: () => void;
  driver: Habit | null;
  outcome: Habit | null;
  lag: Lag;
  onLagChange: (lag: Lag) => void;
  onSwap: () => void;
  range: ResolvedRange;
  minN: number;
}

export function PairDetailModal({
  open, onClose, driver, outcome, lag, onLagChange, onSwap, range, minN,
}: PairDetailModalProps) {
  const navigate = useNavigate();
  const wide = useMediaQuery('(min-width: 640px)');
  const analysis = usePairAnalysis(driver, outcome, range, lag, minN);

  const open2 = open && driver !== null && outcome !== null;

  return (
    <Modal
      open={open2}
      onClose={onClose}
      size="lg"
      aria-label="Habit pair details"
      title={
        driver && outcome ? (
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="flex min-w-0 items-center gap-2">
              <HabitIcon habit={driver} size="xs" />
              <span className="truncate">{driver.name}</span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-fg-4" aria-hidden />
            <span className="flex min-w-0 items-center gap-2">
              <HabitIcon habit={outcome} size="xs" />
              <span className="truncate">{outcome.name}</span>
            </span>
          </span>
        ) : undefined
      }
      description={`${formatRange(range.start, range.end)} · ${lag === 1 ? 'next day' : 'same day'}`}
      footer={
        driver && outcome ? (
          <>
            <Button variant="ghost" size="sm" icon={<ArrowLeftRight />} onClick={onSwap}>
              Swap direction
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onClose();
                navigate(`/habits/${outcome.id}`);
              }}
            >
              Open {outcome.name}
            </Button>
          </>
        ) : undefined
      }
    >
      {analysis && driver && outcome && (
        <div className="flex flex-col gap-5">
          <p className="text-[15px] leading-relaxed text-pretty text-fg-2">{analysis.finding}</p>

          <Segmented
            value={lag}
            onChange={onLagChange}
            options={LAG_OPTIONS}
            size="sm"
            fullWidth
            aria-label="Compare same day or next day"
          />

          {analysis.plottable ? (
            <PairChart
              driver={driver}
              outcome={outcome}
              points={analysis.points}
              lag={lag}
              sideLabels={analysis.sideLabels}
              threshold={analysis.threshold}
              thresholdLabel={analysis.thresholdLabel}
              height={wide ? 260 : 210}
            />
          ) : (
            <div className="flex items-center justify-center rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-fg-3">
              Not enough overlapping days to plot yet.
            </div>
          )}

          <ComparisonSplit analysis={analysis} />
          <PairStats analysis={analysis} />
          <CausationNote />
        </div>
      )}
    </Modal>
  );
}
