import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ChartCard, ChartTooltip, LegendItem } from '@/components/charts/ChartParts';
import { Heatmap, type HeatmapCell } from '@/components/charts/Heatmap';
import { CHART_MARGIN, Y_AXIS_FIT, axisTick, useChartTheme } from '@/components/charts/chartTheme';
import { formatDayLong, formatMonthDay, diffDays, addDays } from '@/lib/dates';
import { formatPercent, pluralize } from '@/lib/format';
import { useSettings } from '@/store/hooks';
import type { OverallPoint, OverallStats } from './useInsightsData';
import type { ResolvedRange } from './insightsData';

// weekend bands just add noise on longer ranges
const MAX_WEEKEND_BANDS_DAYS = 130;
const MAX_HEATMAP_DAYS = 371;

interface Band {
  from: string;
  to: string;
}

function weekendBands(points: OverallPoint[]): Band[] {
  const bands: Band[] = [];
  let open: Band | null = null;
  for (const point of points) {
    if (point.weekend) {
      if (open) open.to = point.day;
      else open = { from: point.day, to: point.day };
    } else if (open) {
      bands.push(open);
      open = null;
    }
  }
  if (open) bands.push(open);
  return bands;
}

export interface CompletionTrendProps {
  range: ResolvedRange;
  overall: OverallStats;
}

export function CompletionTrend({ range, overall }: CompletionTrendProps) {
  const theme = useChartTheme();
  const points = overall.points;
  const bands = useMemo(
    () => (points.length <= MAX_WEEKEND_BANDS_DAYS ? weekendBands(points) : []),
    [points],
  );
  const empty = overall.evaluatedDays === 0;

  return (
    <ChartCard
      title="Completion over time"
      subtitle={
        empty
          ? 'Nothing due in this range yet'
          : `${formatPercent(overall.rate ?? 0)} of everything due in ${range.label.toLowerCase()}`
      }
      height={260}
      empty={empty}
      emptyLabel="Log a few days to see the trend."
      action={
        <div className="hidden items-center gap-3 sm:flex">
          <LegendItem color={theme.accent} label="Daily" shape="square" />
          <LegendItem color={theme.accent2} label="7-day average" shape="line" />
          {bands.length > 0 && <LegendItem color={theme.surface2} label="Weekend" shape="square" />}
        </div>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ ...CHART_MARGIN, right: 6 }}>
          <defs>
            <linearGradient id="insights-completion" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.accent} stopOpacity={0.42} />
              <stop offset="100%" stopColor={theme.accent} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />
          {bands.map((band) => (
            <ReferenceArea
              key={band.from}
              x1={band.from}
              x2={band.to}
              fill={theme.text}
              fillOpacity={0.045}
              stroke="none"
              ifOverflow="hidden"
            />
          ))}
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={{ stroke: theme.axis }}
            tick={axisTick(theme)}
            minTickGap={44}
            tickFormatter={(day: string) => formatMonthDay(day)}
          />
          <YAxis
            {...Y_AXIS_FIT}
            domain={[0, 1]}
            ticks={[0, 0.25, 0.5, 0.75, 1]}
            tick={axisTick(theme)}
            tickFormatter={(value: number) => formatPercent(value)}
          />
          <Tooltip
            cursor={{ stroke: theme.axis, strokeWidth: 1 }}
            content={
              <ChartTooltip
                labelFormatter={(label) => (typeof label === 'string' ? formatDayLong(label) : '')}
                valueFormatter={(value) => formatPercent(value)}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="rate"
            name="Daily"
            stroke={theme.accent}
            strokeWidth={1.5}
            strokeOpacity={0.7}
            fill="url(#insights-completion)"
            connectNulls={false}
            dot={false}
            activeDot={{ r: 3, fill: theme.accent, stroke: theme.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="average"
            name="7-day average"
            stroke={theme.accent2}
            strokeWidth={2.5}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export interface CompletionHeatmapProps {
  range: ResolvedRange;
  overall: OverallStats;
}

export function CompletionHeatmap({ range, overall }: CompletionHeatmapProps) {
  const theme = useChartTheme();
  const settings = useSettings();
  const navigate = useNavigate();

  const { cells, byDay, from } = useMemo(() => {
    const span = diffDays(range.start, range.end) + 1;
    const start = span > MAX_HEATMAP_DAYS ? addDays(range.end, -(MAX_HEATMAP_DAYS - 1)) : range.start;
    const map = new Map<string, OverallPoint>();
    const list: HeatmapCell[] = [];
    for (const point of overall.points) {
      map.set(point.day, point);
      if (point.day < start) continue;
      list.push({ day: point.day, value: point.total > 0 ? point.rate : null });
    }
    return { cells: list, byDay: map, from: start };
  }, [overall.points, range]);

  const empty = overall.evaluatedDays === 0;

  return (
    <ChartCard
      title="Daily completion"
      subtitle={
        empty
          ? 'Fills in as you log'
          : from === range.start
            ? 'Darker means more habits done. Click a day to open it.'
            : 'Last 12 months. Click a day to open it.'
      }
      height={cells.length > 0 ? 176 : 140}
      empty={empty}
      emptyLabel="No completed days in this range yet."
    >
      <div className="flex h-full items-center">
        <Heatmap
          cells={cells}
          color={theme.accent}
          weekStartsOn={settings.weekStartsOn}
          onDayClick={(day) => navigate(`/day/${day}`)}
          tooltip={(cell) => {
            const point = byDay.get(cell.day);
            return (
              <div className="text-xs">
                <div className="font-semibold text-fg">{formatDayLong(cell.day)}</div>
                <div className="mt-0.5 text-fg-3">
                  {point && point.total > 0
                    ? `${point.completed}/${point.total} done · ${formatPercent(point.rate ?? 0)}`
                    : 'Nothing was due'}
                </div>
              </div>
            );
          }}
        />
      </div>
    </ChartCard>
  );
}

export function weekdaySummary(overall: OverallStats, weekdayNames: string[]): string | null {
  if (overall.bestWeekday === null || overall.worstWeekday === null) return null;
  const best = overall.byWeekday[overall.bestWeekday];
  const worst = overall.byWeekday[overall.worstWeekday];
  if (best.rate === null || worst.rate === null) return null;
  if (overall.bestWeekday === overall.worstWeekday || best.rate - worst.rate < 0.05) {
    return `Every day of the week lands near ${formatPercent(best.rate)}.`;
  }
  return `Best on ${weekdayNames[overall.bestWeekday]}s (${formatPercent(best.rate)}), worst on ${weekdayNames[overall.worstWeekday]}s (${formatPercent(worst.rate)}). Based on ${pluralize(overall.evaluatedDays, 'tracked day')}.`;
}
