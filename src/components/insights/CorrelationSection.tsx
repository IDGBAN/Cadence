import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Grid2x2, Info, List } from 'lucide-react';
import type { Habit } from '@/types';
import type { CorrelationResult } from '@/lib/insights';
import { describeR } from '@/lib/insights';
import { Badge, Button, Card, EmptyState, SectionHeader, Segmented, Tooltip, cn } from '@/components/ui';
import { HabitIcon } from '@/components/ui';
import { formatNumber, pluralize } from '@/lib/format';
import { useMediaQuery } from '@/store/hooks';
import { CONFIDENCE_TONE, correlationFill, correlationTextColor, signedR, strengthLabel, type Lag } from './insightsData';
import { lagHint } from './lag';
import type { CorrelationData } from './useInsightsData';

const ROW_LABEL_WIDTH = 132;
const ROW_LABEL_WIDTH_SM = 104;
const MIN_CELL = 38;
const MAX_CELL = 66;
const LABEL_CELL = 46;
const COLUMN_NAME_CELL = 52;

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

function shortLabel(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 10) return trimmed;
  const firstWord = trimmed.split(/\s+/)[0];
  return firstWord.length >= 4 && firstWord.length <= 10 ? firstWord : `${trimmed.slice(0, 9)}…`;
}

type MatrixView = 'grid' | 'pairs';

interface MatrixGridProps {
  habits: Habit[];
  matrix: Array<Array<CorrelationResult | null>>;
  lag: Lag;
  onSelect: (driver: Habit, outcome: Habit) => void;
}

function MatrixGrid({ habits, matrix, lag, onSelect }: MatrixGridProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const compact = useMediaQuery('(max-width: 639px)');
  const labelWidth = compact ? ROW_LABEL_WIDTH_SM : ROW_LABEL_WIDTH;
  const size = habits.length;

  const cell = useMemo(() => {
    if (width <= 0 || size === 0) return MIN_CELL;
    const ideal = Math.floor((width - labelWidth) / size);
    return Math.max(MIN_CELL, Math.min(MAX_CELL, ideal));
  }, [width, size, labelWidth]);

  const showValues = cell >= LABEL_CELL;
  const showColumnNames = cell >= COLUMN_NAME_CELL;

  // roving tabindex: the whole grid is a single tab stop
  const [active, setActive] = useState({ r: 0, c: 1 });
  const activeRow = Math.min(active.r, Math.max(0, size - 1));
  const activeColumn = Math.min(active.c, Math.max(0, size - 1));

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let r = activeRow;
    let c = activeColumn;
    switch (event.key) {
      case 'ArrowUp':
        r -= 1;
        break;
      case 'ArrowDown':
        r += 1;
        break;
      case 'ArrowLeft':
        c -= 1;
        break;
      case 'ArrowRight':
        c += 1;
        break;
      case 'Home':
        c = 0;
        break;
      case 'End':
        c = size - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    r = Math.max(0, Math.min(size - 1, r));
    c = Math.max(0, Math.min(size - 1, c));
    setActive({ r, c });
    ref.current?.querySelector<HTMLElement>(`[data-cell="${r}-${c}"]`)?.focus();
  };

  const tabIndexFor = (i: number, j: number) => (i === activeRow && j === activeColumn ? 0 : -1);

  return (
    <div ref={ref} className="-mx-1 overflow-x-auto px-1 pb-1 scroll-fade-x">
      <div
        role="grid"
        aria-label={`Correlations between habits, ${lag === 1 ? 'next day' : 'same day'}`}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          const key = (event.target as HTMLElement).dataset?.cell;
          if (!key) return;
          const [r, c] = key.split('-').map(Number);
          if (Number.isInteger(r) && Number.isInteger(c)) setActive({ r, c });
        }}
        className="grid w-max gap-1"
        style={{ gridTemplateColumns: `${labelWidth}px repeat(${size}, ${cell}px)` }}
      >
        <div role="row" className="contents">
          <div role="presentation" className="sticky left-0 z-20 bg-surface" style={{ width: labelWidth }} />
          {habits.map((habit) => (
            <div
              key={habit.id}
              role="columnheader"
              className="flex flex-col items-center justify-end gap-1 pb-1"
              title={habit.name}
            >
              <HabitIcon habit={habit} size="xs" />
              {showColumnNames && (
                <span className="w-full truncate text-center text-[9px] leading-tight text-fg-4">
                  {shortLabel(habit.name)}
                </span>
              )}
            </div>
          ))}
        </div>

        {habits.map((rowHabit, i) => (
          <div role="row" className="contents" key={rowHabit.id}>
            <div
              role="rowheader"
              className="sticky left-0 z-20 flex items-center gap-2 bg-surface pr-2"
              style={{ width: labelWidth, height: cell }}
              title={rowHabit.name}
            >
              <HabitIcon habit={rowHabit} size="xs" />
              <span className="truncate text-xs text-fg-2">{rowHabit.name}</span>
            </div>

            {habits.map((columnHabit, j) => {
              if (i === j) {
                return (
                  <div
                    key={columnHabit.id}
                    role="gridcell"
                    data-cell={`${i}-${j}`}
                    tabIndex={tabIndexFor(i, j)}
                    aria-label={`${rowHabit.name} against itself`}
                    className="flex items-center justify-center rounded-lg border border-line bg-surface-2 text-fg-4 outline-none focus-visible:ring-2 focus-visible:ring-accent light:bg-surface-3"
                    style={{ height: cell }}
                  >
                    <span aria-hidden className="text-[10px]">
                      ·
                    </span>
                  </div>
                );
              }

              const result = matrix[i]?.[j] ?? null;
              if (!result) {
                return (
                  <div
                    key={columnHabit.id}
                    role="gridcell"
                    data-cell={`${i}-${j}`}
                    tabIndex={tabIndexFor(i, j)}
                    aria-label={`${rowHabit.name} and ${columnHabit.name}: not enough shared days`}
                    className="flex items-center justify-center rounded-lg border border-dashed border-line/70 outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    style={{ height: cell }}
                  >
                    <span aria-hidden className="text-[11px] text-fg-4/60">
                      –
                    </span>
                  </div>
                );
              }

              return (
                <Tooltip
                  key={columnHabit.id}
                  delay={180}
                  content={
                    <span className="block max-w-[15rem] text-xs">
                      <span className="block font-semibold text-fg">
                        {rowHabit.name} {lag === 1 ? '→ next-day' : '↔'} {columnHabit.name}
                      </span>
                      <span className="mt-0.5 block text-fg-3">
                        r {signedR(result.r)} · {describeR(result.r)} · {pluralize(result.n, 'day')}
                      </span>
                    </span>
                  }
                >
                  <button
                    type="button"
                    role="gridcell"
                    data-cell={`${i}-${j}`}
                    tabIndex={tabIndexFor(i, j)}
                    onClick={() => onSelect(rowHabit, columnHabit)}
                    aria-label={`${rowHabit.name} and ${columnHabit.name}: r ${signedR(result.r)}, ${describeR(result.r)}, ${result.n} days. Open details.`}
                    className={cn(
                      'flex items-center justify-center rounded-lg border border-line/50 transition',
                      'hover:z-10 hover:scale-[1.08] hover:border-fg-4 focus-visible:z-10 focus-visible:scale-[1.08]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
                    )}
                    style={{ height: cell, background: correlationFill(result.r) }}
                  >
                    {showValues && (
                      <span
                        className="text-[11px] font-semibold tabular"
                        style={{ color: correlationTextColor(result.r) }}
                      >
                        {signedR(result.r)}
                      </span>
                    )}
                  </button>
                </Tooltip>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

const PAIRS_PAGE = 10;

interface TopPairsProps {
  pairs: CorrelationData['pairs'];
  lag: Lag;
  onSelect: (driver: Habit, outcome: Habit) => void;
}

function TopPairs({ pairs, lag, onSelect }: TopPairsProps) {
  const [limit, setLimit] = useState(PAIRS_PAGE);
  const visible = pairs.slice(0, limit);

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {visible.map(({ driver, outcome, result }) => (
          <li key={`${driver.id}-${outcome.id}`}>
            <button
              type="button"
              onClick={() => onSelect(driver, outcome)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border border-line bg-surface-2 p-2.5 text-left transition',
                'hover:border-line-strong hover:bg-surface-3 light:bg-surface light:hover:bg-surface-2',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              )}
            >
              <span
                aria-hidden
                className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line/60 text-xs font-semibold tabular"
                style={{ background: correlationFill(result.r), color: correlationTextColor(result.r) }}
              >
                {signedR(result.r)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <HabitIcon habit={driver} size="xs" />
                  <span className="truncate text-sm font-medium text-fg">{driver.name}</span>
                  <span className="shrink-0 text-fg-4" aria-hidden>
                    {lag === 1 ? '→' : '↔'}
                  </span>
                  <HabitIcon habit={outcome} size="xs" />
                  <span className="truncate text-sm font-medium text-fg">{outcome.name}</span>
                </span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-fg-3">
                  <span>{strengthLabel(result.strength)}</span>
                  <span aria-hidden className="text-fg-4">
                    ·
                  </span>
                  <span className="tabular">{pluralize(result.n, 'day')}</span>
                  {lag === 1 && <span className="text-fg-4">next day</span>}
                </span>
              </span>
              <Badge tone={CONFIDENCE_TONE[result.confidence]} size="xs" className="shrink-0">
                {result.confidence}
              </Badge>
            </button>
          </li>
        ))}
      </ul>
      {pairs.length > limit && (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setLimit((n) => n + PAIRS_PAGE)}>
            Show {formatNumber(Math.min(PAIRS_PAGE, pairs.length - limit), 0)} more
          </Button>
        </div>
      )}
    </div>
  );
}

function Scale() {
  return (
    <div className="flex items-center gap-2 text-[10px] text-fg-4">
      <span>−1</span>
      <span
        aria-hidden
        className="h-2 w-24 rounded-full border border-line/60"
        style={{
          background:
            'linear-gradient(90deg, color-mix(in oklab, var(--danger) 74%, transparent), color-mix(in oklab, var(--danger) 8%, transparent), color-mix(in oklab, var(--success) 8%, transparent), color-mix(in oklab, var(--success) 74%, transparent))',
        }}
      />
      <span>+1</span>
      <span className="ml-1 hidden sm:inline">darker = stronger link</span>
    </div>
  );
}

export interface CorrelationSectionProps {
  correlations: CorrelationData;
  lag: Lag;
  onSelectPair: (driver: Habit, outcome: Habit) => void;
}

export function CorrelationSection({ correlations, lag, onSelectPair }: CorrelationSectionProps) {
  const { habits, matrix, pairs, strongest, tested, possible, minN } = correlations;
  const isPhone = useMediaQuery('(max-width: 639px)');
  const [chosenView, setChosenView] = useState<MatrixView | null>(null);
  const view: MatrixView = chosenView ?? (isPhone ? 'pairs' : 'grid');

  const enoughHabits = habits.length >= 2;

  const subtitle = !enoughHabits
    ? 'Needs at least two habits'
    : tested === 0
      ? `No pair has ${pluralize(minN, 'day')} logged together yet`
      : strongest
        ? `Strongest link: ${strongest.driver.name} ${lag === 1 ? '→' : '↔'} ${strongest.outcome.name} (r ${signedR(strongest.result.r)})`
        : `${formatNumber(tested, 0)} of ${formatNumber(possible, 0)} pairs have enough data`;

  return (
    <section aria-labelledby="insights-correlations" className="flex flex-col gap-4">
      <SectionHeader
        as="h2"
        icon={<Grid2x2 />}
        eyebrow="Correlations"
        title={<span id="insights-correlations">How your habits relate</span>}
        subtitle={subtitle}
        action={
          enoughHabits && tested > 0 ? (
            <Segmented
              value={view}
              onChange={setChosenView}
              size="sm"
              options={[
                { value: 'grid', label: <Grid2x2 />, title: 'Matrix' },
                { value: 'pairs', label: <List />, title: 'Top pairs' },
              ]}
              aria-label="Correlation view"
            />
          ) : undefined
        }
      />

      <Card padding="md" className="flex flex-col gap-4">
        {!enoughHabits ? (
          <EmptyState
            icon={<Grid2x2 />}
            title="Add a second habit"
            description="You need at least two habits to compare."
          />
        ) : tested === 0 ? (
          <EmptyState
            icon={<Grid2x2 />}
            title="Not enough shared days yet"
            description={`Each pair needs about ${pluralize(minN, 'day')} where both habits were logged. The grid fills in as you go.`}
          />
        ) : view === 'grid' ? (
          <MatrixGrid habits={habits} matrix={matrix} lag={lag} onSelect={onSelectPair} />
        ) : (
          <TopPairs pairs={pairs} lag={lag} onSelect={onSelectPair} />
        )}

        {tested > 0 && (
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            {view === 'grid' && (
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <Scale />
                <span className="text-[10px] text-fg-4">Arrow keys move through the grid · Enter opens a pair</span>
              </div>
            )}
            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-fg-4">
              <Info className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>
                {lagHint(lag)} Pairs need at least {pluralize(minN, 'day')} logged together.{' '}
                {formatNumber(tested, 0)} of {formatNumber(possible, 0)}{' '}
                {possible === 1 ? 'pair has' : 'pairs have'} that. Today isn't counted until it's over.
              </span>
            </p>
          </div>
        )}
      </Card>
    </section>
  );
}

// clears the selection when either habit drops out of range
export function usePairSelection(habits: Habit[]) {
  const [pair, setPair] = useState<{ driverId: string; outcomeId: string } | null>(null);

  const byId = useMemo(() => new Map(habits.map((h) => [h.id, h] as const)), [habits]);

  useEffect(() => {
    if (pair && (!byId.has(pair.driverId) || !byId.has(pair.outcomeId))) setPair(null);
  }, [pair, byId]);

  const select = useCallback((driver: Habit, outcome: Habit) => {
    setPair({ driverId: driver.id, outcomeId: outcome.id });
  }, []);
  const clear = useCallback(() => setPair(null), []);
  const swap = useCallback(() => {
    setPair((current) => (current ? { driverId: current.outcomeId, outcomeId: current.driverId } : current));
  }, []);

  return {
    driver: pair ? byId.get(pair.driverId) ?? null : null,
    outcome: pair ? byId.get(pair.outcomeId) ?? null : null,
    open: pair !== null,
    select,
    clear,
    swap,
  };
}
