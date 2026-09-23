import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarRange } from 'lucide-react';
import { Card, HabitIcon, SectionHeader, Tooltip, cn } from '@/components/ui';
import { habitHex } from '@/lib/colors';
import { WEEKDAY_LONG, orderedWeekdays } from '@/lib/dates';
import { formatNumber, formatPercent, formatValue, pluralize } from '@/lib/format';
import { useSettings } from '@/store/hooks';
import { weekdaySummary } from './CompletionTrend';
import type { OverallStats, WeekdayRow } from './useInsightsData';

const MAX_MIX = 92;
const MIN_MIX = 10;

function cellBackground(intensity: number | null, color: string): string {
  if (intensity === null) return 'var(--cell-empty)';
  const mix = MIN_MIX + Math.max(0, Math.min(1, intensity)) * (MAX_MIX - MIN_MIX);
  return `color-mix(in oklab, ${color} ${mix.toFixed(1)}%, var(--cell-empty))`;
}

interface CellProps {
  background: string;
  label: string;
  tooltip: string;
  faded?: boolean;
}

function Cell({ background, label, tooltip, faded }: CellProps) {
  return (
    <Tooltip content={tooltip} delay={160}>
      <div
        role="img"
        aria-label={tooltip}
        className={cn(
          'flex h-9 items-center justify-center rounded-lg border border-line/50 text-[10px] font-semibold tabular transition',
          'hover:scale-105',
          faded ? 'text-fg-4' : 'text-fg',
        )}
        style={{ background }}
      >
        {label}
      </div>
    </Tooltip>
  );
}

export interface WeekdayGridProps {
  rows: WeekdayRow[];
  overall: OverallStats;
}

export function WeekdayGrid({ rows, overall }: WeekdayGridProps) {
  const settings = useSettings();
  const days = useMemo(() => orderedWeekdays(settings.weekStartsOn), [settings.weekStartsOn]);
  const summary = weekdaySummary(overall, WEEKDAY_LONG);
  const hasAny = rows.some((row) => row.intensity.some((value) => value !== null));

  return (
    <section aria-labelledby="insights-weekdays" className="flex flex-col gap-4">
      <SectionHeader
        as="h2"
        icon={<CalendarRange />}
        eyebrow="Weekdays"
        title={<span id="insights-weekdays">By weekday</span>}
        subtitle="How each habit does on each day of the week"
      />

      <Card padding="md" className="flex flex-col gap-4">
        {summary && <p className="text-sm leading-relaxed text-pretty text-fg-2">{summary}</p>}

        {!hasAny ? (
          <p className="py-6 text-center text-sm text-fg-3">
            Log for a few weeks to see how your weekdays compare.
          </p>
        ) : (
          <div className="-mx-1 overflow-x-auto px-1 pb-1 scroll-fade-x">
            <div className="min-w-[20rem]">
              <div
                className="grid items-center gap-1"
                style={{ gridTemplateColumns: `minmax(7rem, 1.4fr) repeat(7, minmax(2.25rem, 1fr))` }}
              >
                <div />
                {days.map(([index, label]) => (
                  <div key={index} className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-fg-4">
                    {label}
                  </div>
                ))}

                <div className="flex items-center gap-2 pr-2 text-xs font-semibold text-fg-2">
                  <span
                    aria-hidden
                    className="flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-accent/15 text-[11px] text-accent"
                  >
                    ∑
                  </span>
                  <span className="truncate">All habits</span>
                </div>
                {days.map(([index]) => {
                  const stat = overall.byWeekday[index];
                  return (
                    <Cell
                      key={index}
                      background={cellBackground(stat.rate, 'var(--accent)')}
                      label={stat.rate === null ? '' : formatNumber(stat.rate * 100, 0)}
                      faded={stat.rate === null || stat.rate < 0.4}
                      tooltip={
                        stat.rate === null
                          ? `${WEEKDAY_LONG[index]}s: nothing tracked yet`
                          : `${WEEKDAY_LONG[index]}s: ${formatPercent(stat.rate)} across ${pluralize(stat.n, 'day')}`
                      }
                    />
                  );
                })}

                {rows.map((row) => {
                  const color = habitHex(row.habit.color);
                  return (
                    <div key={row.habit.id} className="contents">
                      <Link
                        to={`/habits/${row.habit.id}`}
                        className="flex min-w-0 items-center gap-2 rounded-lg pr-2 text-xs text-fg-2 transition hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <HabitIcon habit={row.habit} size="xs" />
                        <span className="truncate">{row.habit.name}</span>
                      </Link>
                      {days.map(([index]) => {
                        const stat = row.stats[index];
                        const intensity = row.intensity[index];
                        const value = row.isMetric ? stat.average : stat.rate;
                        const readable =
                          value === null
                            ? `${WEEKDAY_LONG[index]}s: nothing logged`
                            : row.isMetric
                              ? `${row.habit.name} on ${WEEKDAY_LONG[index]}s: ${formatValue(row.habit, value)} average across ${pluralize(stat.n, 'day')}`
                              : `${row.habit.name} on ${WEEKDAY_LONG[index]}s: ${formatPercent(value)} across ${pluralize(stat.n, 'day')}`;
                        return (
                          <Cell
                            key={index}
                            background={cellBackground(intensity, color)}
                            label={
                              value === null ? '' : row.isMetric ? formatNumber(value, 1) : formatNumber(value * 100, 0)
                            }
                            faded={intensity === null || intensity < 0.4}
                            tooltip={readable}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-fg-4">
          Goal habits show completion. Metrics show their average for that weekday, shaded relative to their best day.
        </p>
      </Card>
    </section>
  );
}
