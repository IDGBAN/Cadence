import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronsUpDown, Minus, Trophy } from 'lucide-react';
import { Card, HabitIcon, ProgressBar, SectionHeader, StreakBadge, cn } from '@/components/ui';
import { habitHex, habitStyle } from '@/lib/colors';
import { formatNumber, formatPercent, formatValue, pluralize, typeLabel } from '@/lib/format';
import type { HabitRow } from './useInsightsData';
import type { ResolvedRange } from './insightsData';

type SortKey = 'name' | 'rate' | 'strength' | 'streak' | 'trend';
type SortDir = 'asc' | 'desc';

const DASH = '—';

// higher is better for every key, so one comparator works for all of them
function sortValue(row: HabitRow, key: SortKey): number | string | null {
  switch (key) {
    case 'name':
      return row.habit.name.toLocaleLowerCase();
    case 'rate':
      return row.rate;
    case 'strength':
      return row.strength;
    case 'streak':
      return row.isMetric ? null : row.streak.current;
    case 'trend': {
      if (!row.trend) return null;
      const magnitude = Math.abs(row.trend.change);
      return row.trend.good ? magnitude : -magnitude;
    }
  }
}

function compare(a: HabitRow, b: HabitRow, key: SortKey, dir: SortDir): number {
  const av = sortValue(a, key);
  const bv = sortValue(b, key);
  // empty rows stay at the bottom in both directions
  if (av === null && bv === null) return a.habit.order - b.habit.order;
  if (av === null) return 1;
  if (bv === null) return -1;
  const sign = dir === 'asc' ? 1 : -1;
  if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * sign;
  return ((av as number) - (bv as number)) * sign;
}

interface HeaderProps {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}

function SortHeader({ label, sortKey, active, dir, onSort, className }: HeaderProps) {
  const isActive = active === sortKey;
  const Icon = !isActive ? ChevronsUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('whitespace-nowrap px-3 py-2 text-left font-medium', className)}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'eyebrow inline-flex items-center gap-1 rounded-md px-1 py-0.5 -mx-1 transition',
          'hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          isActive ? 'text-fg-2' : 'text-fg-4',
        )}
      >
        {label}
        <Icon className="size-3" aria-hidden />
      </button>
    </th>
  );
}

function TrendCell({ row }: { row: HabitRow }) {
  if (!row.trend) return <span className="text-fg-4">{DASH}</span>;
  const flat = Math.abs(row.trend.change) < (row.trend.measure === 'rate' ? 0.005 : 1e-6);
  const Icon = flat ? Minus : row.trend.good ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-semibold tabular',
        flat ? 'text-fg-4' : row.trend.good ? 'text-success' : 'text-warning',
      )}
      title="Last 14 days vs the 14 before"
    >
      <Icon className="size-3.5" aria-hidden />
      {row.trend.label}
    </span>
  );
}

export interface LeaderboardProps {
  rows: HabitRow[];
  range: ResolvedRange;
}

export function Leaderboard({ rows, range }: LeaderboardProps) {
  const navigate = useNavigate();
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'rate', dir: 'desc' });

  const sorted = useMemo(() => [...rows].sort((a, b) => compare(a, b, sort.key, sort.dir)), [rows, sort]);

  const onSort = (key: SortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'desc' ? 'asc' : 'desc' }
        : { key, dir: key === 'name' ? 'asc' : 'desc' },
    );
  };

  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="insights-leaderboard" className="flex flex-col gap-4">
      <SectionHeader
        as="h2"
        icon={<Trophy />}
        eyebrow="All habits"
        title={<span id="insights-leaderboard">Leaderboard</span>}
        subtitle={`${range.label}. Click a column to sort.`}
      />

      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto scroll-fade-x">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line">
                <SortHeader
                  label="Habit"
                  sortKey="name"
                  active={sort.key}
                  dir={sort.dir}
                  onSort={onSort}
                  className="sticky left-0 z-10 bg-surface"
                />
                <SortHeader label={`${range.label.replace('Last ', '')} completion`} sortKey="rate" active={sort.key} dir={sort.dir} onSort={onSort} />
                <SortHeader label="Strength" sortKey="strength" active={sort.key} dir={sort.dir} onSort={onSort} />
                <SortHeader label="Streak" sortKey="streak" active={sort.key} dir={sort.dir} onSort={onSort} />
                <SortHeader label="14-day trend" sortKey="trend" active={sort.key} dir={sort.dir} onSort={onSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr
                  key={row.habit.id}
                  onClick={() => navigate(`/habits/${row.habit.id}`)}
                  style={habitStyle(row.habit.color)}
                  className="group cursor-pointer border-b border-line/60 transition last:border-0 hover:bg-surface-2 light:hover:bg-surface-2"
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-surface px-3 py-3 text-left font-normal transition group-hover:bg-surface-2"
                  >
                    <Link
                      to={`/habits/${row.habit.id}`}
                      onClick={(event) => event.stopPropagation()}
                      className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <HabitIcon habit={row.habit} size="sm" />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium text-fg">{row.habit.name}</span>
                        <span className="truncate text-[11px] text-fg-4">
                          {row.isMetric ? 'Metric' : typeLabel(row.habit.type)}
                          {row.logged > 0 && ` · ${pluralize(row.logged, 'entry', 'entries')}`}
                        </span>
                      </span>
                    </Link>
                  </th>

                  <td className="px-3 py-3">
                    {row.isMetric ? (
                      <span className="text-xs text-fg-3">
                        {row.average === null ? DASH : `${formatValue(row.habit, row.average)} avg`}
                      </span>
                    ) : row.rate === null || row.opportunities === 0 ? (
                      <span className="text-fg-4">{DASH}</span>
                    ) : (
                      <div className="flex min-w-[9rem] items-center gap-2.5">
                        <ProgressBar
                          value={row.rate}
                          color={habitHex(row.habit.color)}
                          height={7}
                          className="flex-1"
                          aria-label={`${row.habit.name} completion`}
                        />
                        <span className="w-10 shrink-0 text-right text-xs font-semibold tabular text-fg-2">
                          {formatPercent(row.rate)}
                        </span>
                      </div>
                    )}
                  </td>

                  <td className="px-3 py-3">
                    {row.strength === null ? (
                      <span className="text-fg-4">{DASH}</span>
                    ) : (
                      <span className="text-xs font-semibold tabular text-fg-2">
                        {formatNumber(row.strength * 100, 0)}
                        <span className="ml-0.5 font-normal text-fg-4">/100</span>
                      </span>
                    )}
                  </td>

                  <td className="px-3 py-3">
                    {row.isMetric ? (
                      <span className="text-fg-4">{DASH}</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <StreakBadge count={row.streak.current} unit={row.streak.unit} size="sm" showZero />
                        <span className="text-[11px] text-fg-4" title="Best streak">
                          best {formatNumber(row.streak.best, 0)}
                        </span>
                      </span>
                    )}
                  </td>

                  <td className="px-3 py-3">
                    <TrendCell row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
