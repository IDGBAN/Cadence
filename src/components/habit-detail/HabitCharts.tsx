import { useId, useMemo, useState, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AppData, DayKey, Habit } from '@/types';
import type { EngineCtx } from '@/lib/habitMath';
import { dailyValueSeries, dayCells, habitStartDay, isScheduledOn, periodsInRange, strengthSeries } from '@/lib/habitMath';
import { weekdayProfile } from '@/lib/insights';
import {
  MONTH_SHORT,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  formatMonthDay,
  formatRange,
  orderedWeekdays,
  startOfWeek,
} from '@/lib/dates';
import { formatMinutes, formatNumber, formatPercent, formatValue, periodLabel, pluralize } from '@/lib/format';
import { habitHex, habitStyle, withAlpha } from '@/lib/colors';
import { Segmented } from '@/components/ui';
import { ChartCard, ChartTooltip, LegendItem } from '@/components/charts/ChartParts';
import { CHART_MARGIN, Y_AXIS_FIT, axisTick, useChartTheme } from '@/components/charts/chartTheme';
import {
  DETAIL_RANGES,
  hasValueTrend,
  movingAverage,
  rangeLabel,
  rangeStartDay,
  streakRuns,
  type RangeValue,
} from './shared';

export interface HabitChartsProps {
  habit: Habit;
  data: AppData;
  ctx: EngineCtx;
  weekStartsOn: 0 | 1;
}

const MA_WINDOW = 7;

// otherwise recharts picks integer ticks and a 0..1 axis shows only 0% and 100%
const RATIO_TICKS = [0, 0.25, 0.5, 0.75, 1];

interface TrendPoint {
  day: DayKey;
  value: number | null;
  avg: number | null;
}

interface WeekPoint {
  week: DayKey;
  label: string;
  rate: number | null;
  done: number;
  opportunities: number;
  logged: number;
}

interface PeriodPoint {
  label: string;
  start: DayKey;
  end: DayKey;
  achieved: number;
  target: number;
  success: boolean;
  current: boolean;
}

interface WeekdayPoint {
  weekday: number;
  label: string;
  rate: number | null;
  average: number | null;
  n: number;
}

interface RunPoint {
  label: string;
  length: number;
  range: string;
}

function periodTick(start: DayKey, period: Habit['period']): string {
  if (period === 'month') return `${MONTH_SHORT[Number(start.slice(5, 7)) - 1]} '${start.slice(2, 4)}`;
  return formatMonthDay(start);
}

function buildRangeSeries(habit: Habit, data: AppData, ctx: EngineCtx, weekStartsOn: 0 | 1, start: DayKey) {
  const end = ctx.today;
  const isMetric = habit.kind === 'metric';
  const isPeriod = !isMetric && habit.type !== 'quit' && habit.type !== 'rating' && habit.period !== 'day';

  const values = dailyValueSeries(habit, data, start, end, ctx);
  const averages = movingAverage(
    values.map((point) => point.value),
    MA_WINDOW,
  );
  const trend: TrendPoint[] = values.map((point, index) => ({
    day: point.day,
    value: point.value,
    avg: averages[index],
  }));

  const strength = isMetric
    ? []
    : strengthSeries(habit, data, start, end, ctx).map((point) => ({ day: point.day, value: point.value }));

  const cells = dayCells(habit, data, start, end, ctx);
  const weekMap = new Map<DayKey, WeekPoint>();
  for (const cell of cells) {
    const week = startOfWeek(cell.day, weekStartsOn);
    let bucket = weekMap.get(week);
    if (!bucket) {
      bucket = { week, label: formatMonthDay(week), rate: null, done: 0, opportunities: 0, logged: 0 };
      weekMap.set(week, bucket);
    }
    if (cell.status === 'done') {
      bucket.done++;
      bucket.opportunities++;
    } else if (cell.status === 'missed' || cell.status === 'partial') {
      bucket.opportunities++;
    }
    if (cell.value !== undefined && cell.status !== 'skipped') bucket.logged++;
  }
  const weeks = [...weekMap.values()].sort((a, b) => (a.week < b.week ? -1 : 1));
  for (const bucket of weeks) bucket.rate = bucket.opportunities > 0 ? bucket.done / bucket.opportunities : null;

  const periods: PeriodPoint[] = isPeriod
    ? periodsInRange(habit, data, start, end, ctx).map((period) => ({
        label: periodTick(period.start, habit.period),
        start: period.start,
        end: period.end,
        achieved: Math.round(period.achieved * 100) / 100,
        target: Math.round(period.target * 100) / 100,
        success: period.success,
        current: period.current,
      }))
    : [];

  const profile = weekdayProfile(habit, data, ctx, start, end);
  const weekdays: WeekdayPoint[] = orderedWeekdays(weekStartsOn).map(([index]) => ({
    weekday: index,
    label: WEEKDAY_SHORT[index],
    rate: profile[index].rate,
    average: profile[index].average,
    n: profile[index].n,
  }));

  return { trend, strength, weeks, periods, weekdays, isPeriod, isMetric };
}

function buildRuns(habit: Habit, data: AppData, ctx: EngineCtx): RunPoint[] {
  if (habit.kind === 'metric' || habit.type === 'quit') return [];
  const start = habitStartDay(habit, data, ctx);
  const isPeriod = habit.type !== 'rating' && habit.period !== 'day';

  if (isPeriod) {
    const periods = periodsInRange(habit, data, start, ctx.today, ctx);
    const runs: Array<{ start: DayKey; end: DayKey; length: number }> = [];
    let open: { start: DayKey; end: DayKey; length: number } | null = null;
    for (const period of periods) {
      if (period.success) {
        if (open) {
          open.end = period.end;
          open.length++;
        } else open = { start: period.start, end: period.end, length: 1 };
      } else if (!(period.skipped || period.current)) {
        if (open) runs.push(open);
        open = null;
      }
    }
    if (open) runs.push(open);
    return runs
      .sort((a, b) => b.length - a.length || (a.start < b.start ? 1 : -1))
      .slice(0, 5)
      .map((run) => ({
        label: pluralize(run.length, habit.period === 'week' ? 'week' : 'month'),
        length: run.length,
        range: formatRange(run.start, run.end),
      }));
  }

  const cells = dayCells(habit, data, start, ctx.today, ctx);
  return streakRuns(cells, (day) => isScheduledOn(habit, day))
    .slice(0, 5)
    .map((run) => ({
      label: pluralize(run.length, 'day'),
      length: run.length,
      range: formatRange(run.start, run.end),
    }));
}

export function HabitCharts({ habit, data, ctx, weekStartsOn }: HabitChartsProps) {
  const theme = useChartTheme();
  const gradientId = useId().replace(/:/g, '');
  const hex = habitHex(habit.color);
  const [range, setRange] = useState<RangeValue>('90d');

  const historyStart = useMemo(() => habitStartDay(habit, data, ctx), [habit, data, ctx]);
  const start = rangeStartDay(range, ctx.today, historyStart);

  const series = useMemo(
    () => buildRangeSeries(habit, data, ctx, weekStartsOn, start),
    [habit, data, ctx, weekStartsOn, start],
  );
  const runs = useMemo(() => buildRuns(habit, data, ctx), [habit, data, ctx]);

  const { trend, strength, weeks, periods, weekdays, isPeriod, isMetric } = series;
  const hasValueAxis = hasValueTrend(habit);

  const primary: 'value' | 'period' | 'weekly' = hasValueAxis ? 'value' : isPeriod ? 'period' : 'weekly';
  const secondary: 'period' | 'weekly' | 'logged' | null = isPeriod
    ? primary === 'period'
      ? null
      : 'period'
    : isMetric
      ? 'logged'
      : habit.type === 'check' || habit.type === 'quit'
        ? null
        : 'weekly';

  const axisValue = (value: number) => (habit.type === 'duration' ? formatMinutes(value) : formatNumber(value, 1));
  const dayLabel = (day: string | number | undefined) => (typeof day === 'string' ? formatMonthDay(day) : '');

  const targetLine = useMemo(() => {
    if (isMetric || !hasValueAxis || !(habit.target > 0)) return null;
    if (habit.type === 'rating' || habit.period === 'day') return { value: habit.target, label: 'Goal' };
    return { value: habit.target / (habit.period === 'week' ? 7 : 30), label: 'Daily pace' };
  }, [habit, isMetric, hasValueAxis]);

  const valuePoints = trend.filter((point) => point.value !== null).length;
  const ratedWeeks = weeks.filter((week) => week.rate !== null).length;

  const metricOf = (day: WeekdayPoint) => (isMetric ? day.average : day.rate);
  const best = weekdays.reduce<WeekdayPoint | null>((acc, day) => {
    const value = metricOf(day);
    if (value === null || day.n === 0) return acc;
    const accValue = acc ? metricOf(acc) : null;
    return accValue === null || value > accValue ? day : acc;
  }, null);
  const worst = weekdays.reduce<WeekdayPoint | null>((acc, day) => {
    const value = metricOf(day);
    if (value === null || day.n === 0) return acc;
    const accValue = acc ? metricOf(acc) : null;
    return accValue === null || value < accValue ? day : acc;
  }, null);
  const weekdaySentence =
    best && worst && best.weekday !== worst.weekday
      ? isMetric
        ? `Highest on ${WEEKDAY_LONG[best.weekday]}s (${formatNumber(best.average ?? 0, 1)}), lowest on ${WEEKDAY_LONG[worst.weekday]}s (${formatNumber(worst.average ?? 0, 1)}).`
        : `Best on ${WEEKDAY_LONG[best.weekday]}s (${formatPercent(best.rate ?? 0)}), worst on ${WEEKDAY_LONG[worst.weekday]}s (${formatPercent(worst.rate ?? 0)}).`
      : 'Log a few more weeks to compare weekdays.';

  const valueChart = (
    <ChartCard
      key="value"
      title={isMetric ? 'Value over time' : 'Progress toward your goal'}
      subtitle={`Daily values with a ${MA_WINDOW}-day moving average`}
      height={260}
      empty={valuePoints < 2}
      emptyLabel="Log at least two days to see a trend."
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={trend} margin={CHART_MARGIN}>
          <defs>
            <linearGradient id={`${gradientId}-value`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={hex} stopOpacity={0.5} />
              <stop offset="100%" stopColor={hex} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="day"
            tick={axisTick(theme)}
            tickLine={false}
            axisLine={{ stroke: theme.grid }}
            minTickGap={28}
            tickFormatter={(day: string) => formatMonthDay(day)}
          />
          <YAxis
            {...Y_AXIS_FIT}
            tick={axisTick(theme)}
            domain={habit.type === 'rating' ? [0, habit.ratingMax] : [0, 'auto']}
            tickFormatter={axisValue}
          />
          <Tooltip
            cursor={{ stroke: theme.axis, strokeWidth: 1 }}
            content={
              <ChartTooltip
                labelFormatter={dayLabel}
                valueFormatter={(value, name) =>
                  name.includes('average') ? axisValue(Math.round(value * 100) / 100) : formatValue(habit, value)
                }
              />
            }
          />
          {targetLine && (
            <ReferenceLine
              y={targetLine.value}
              stroke={theme.success}
              strokeDasharray="5 5"
              strokeWidth={1.5}
              label={{ value: targetLine.label, position: 'insideTopRight', fill: theme.textMuted, fontSize: 10 }}
            />
          )}
          <Area
            type="monotone"
            dataKey="value"
            name={habit.name}
            stroke={hex}
            strokeWidth={2}
            fill={`url(#${gradientId}-value)`}
            connectNulls={false}
            dot={false}
            activeDot={{ r: 4, fill: hex, stroke: theme.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="avg"
            name={`${MA_WINDOW}-day average`}
            stroke={theme.accent2}
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  const weeklyChart = (variant: 'rate' | 'logged', height: number) => (
    <ChartCard
      key={`weekly-${variant}`}
      title={variant === 'logged' ? 'Days logged by week' : habit.type === 'quit' ? 'Clean days by week' : 'Completion by week'}
      subtitle={
        variant === 'logged'
          ? 'Days with a value logged'
          : habit.type === 'quit'
            ? 'Share of days you stayed clean'
            : 'Share of scheduled days you completed'
      }
      height={height}
      empty={variant === 'logged' ? weeks.length < 2 : ratedWeeks < 2}
      emptyLabel="Needs at least two weeks of history."
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={weeks} margin={CHART_MARGIN}>
          <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={axisTick(theme)} tickLine={false} axisLine={{ stroke: theme.grid }} minTickGap={16} />
          <YAxis
            {...Y_AXIS_FIT}
            tick={axisTick(theme)}
            domain={variant === 'logged' ? [0, 7] : [0, 1]}
            allowDecimals={variant !== 'logged'}
            ticks={variant === 'logged' ? undefined : RATIO_TICKS}
            tickFormatter={(value: number) => (variant === 'logged' ? formatNumber(value, 0) : formatPercent(value))}
          />
          <Tooltip
            cursor={{ fill: theme.surface2, opacity: 0.5 }}
            content={
              <ChartTooltip
                labelFormatter={(label) => `Week of ${String(label)}`}
                valueFormatter={(value, _name, item) => {
                  if (variant === 'logged') return pluralize(value, 'day');
                  const point = (item as { payload?: WeekPoint } | undefined)?.payload;
                  return point ? `${formatPercent(value)} · ${point.done}/${point.opportunities}` : formatPercent(value);
                }}
              />
            }
          />
          <Bar
            dataKey={variant === 'logged' ? 'logged' : 'rate'}
            name={variant === 'logged' ? 'Days logged' : 'Completion'}
            radius={[6, 6, 0, 0]}
            maxBarSize={30}
            isAnimationActive={false}
          >
            {weeks.map((week) => (
              <Cell
                key={week.week}
                fill={variant === 'rate' && week.rate !== null && week.rate >= 1 ? hex : withAlpha(hex, 0.55)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  const periodChart = (height: number) => (
    <ChartCard
      key="period"
      title={`${periodLabel(habit.period)} totals`}
      subtitle="Your total vs. the target for each period"
      height={height}
      empty={periods.length < 1}
      emptyLabel="Finish a period to compare it with your target."
      action={
        <div className="flex items-center gap-3">
          <LegendItem color={hex} label="Achieved" shape="square" />
          <LegendItem color={withAlpha(theme.textMuted, 0.45)} label="Target" shape="square" />
        </div>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={periods} margin={CHART_MARGIN}>
          <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={axisTick(theme)} tickLine={false} axisLine={{ stroke: theme.grid }} minTickGap={16} />
          <YAxis
            {...Y_AXIS_FIT}
            tick={axisTick(theme)}
            tickFormatter={(value: number) => (habit.type === 'check' ? formatNumber(value, 0) : axisValue(value))}
          />
          <Tooltip
            cursor={{ fill: theme.surface2, opacity: 0.5 }}
            content={
              <ChartTooltip
                labelFormatter={(_label, payload) => {
                  const point = (payload as Array<{ payload?: PeriodPoint }> | undefined)?.[0]?.payload;
                  return point ? formatRange(point.start, point.end) : '';
                }}
                valueFormatter={(value) => (habit.type === 'check' ? pluralize(value, 'day') : axisValue(value))}
              />
            }
          />
          <Bar
            dataKey="target"
            name="Target"
            fill={withAlpha(theme.textMuted, 0.3)}
            radius={[6, 6, 0, 0]}
            maxBarSize={22}
            isAnimationActive={false}
          />
          <Bar dataKey="achieved" name="Achieved" radius={[6, 6, 0, 0]} maxBarSize={22} isAnimationActive={false}>
            {periods.map((period) => (
              <Cell key={period.start} fill={period.success ? hex : withAlpha(hex, 0.45)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  const strengthChart = (
    <ChartCard
      key="strength"
      title="Habit strength"
      subtitle="A weighted score where recent days count more than old ones"
      height={220}
      empty={strength.length < 3}
      emptyLabel="Check back after a few days."
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={strength} margin={CHART_MARGIN}>
          <defs>
            <linearGradient id={`${gradientId}-strength`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.accent} stopOpacity={0.45} />
              <stop offset="100%" stopColor={theme.accent} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="day"
            tick={axisTick(theme)}
            tickLine={false}
            axisLine={{ stroke: theme.grid }}
            minTickGap={28}
            tickFormatter={(day: string) => formatMonthDay(day)}
          />
          <YAxis
            {...Y_AXIS_FIT}
            tick={axisTick(theme)}
            domain={[0, 1]}
            ticks={RATIO_TICKS}
            tickFormatter={(value: number) => formatPercent(value)}
          />
          <Tooltip
            cursor={{ stroke: theme.axis, strokeWidth: 1 }}
            content={<ChartTooltip labelFormatter={dayLabel} valueFormatter={(value) => formatPercent(value)} />}
          />
          <Area
            type="monotone"
            dataKey="value"
            name="Strength"
            stroke={theme.accent}
            strokeWidth={2}
            fill={`url(#${gradientId}-strength)`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  const weekdayChart = (
    <ChartCard
      key="weekday"
      title="By weekday"
      subtitle={weekdaySentence}
      height={220}
      empty={weekdays.every((day) => day.n === 0)}
      emptyLabel="Nothing to compare across weekdays yet."
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={weekdays} margin={CHART_MARGIN}>
          <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={axisTick(theme)} tickLine={false} axisLine={{ stroke: theme.grid }} />
          <YAxis
            {...Y_AXIS_FIT}
            tick={axisTick(theme)}
            domain={isMetric ? [0, 'auto'] : [0, 1]}
            ticks={isMetric ? undefined : RATIO_TICKS}
            tickFormatter={(value: number) => (isMetric ? axisValue(value) : formatPercent(value))}
          />
          <Tooltip
            cursor={{ fill: theme.surface2, opacity: 0.5 }}
            content={
              <ChartTooltip
                labelFormatter={(label) => {
                  const match = weekdays.find((day) => day.label === label);
                  return match ? WEEKDAY_LONG[match.weekday] : String(label ?? '');
                }}
                valueFormatter={(value, _name, item) => {
                  const point = (item as { payload?: WeekdayPoint } | undefined)?.payload;
                  const shown = isMetric ? axisValue(value) : formatPercent(value);
                  return point ? `${shown} · ${pluralize(point.n, 'day')}` : shown;
                }}
              />
            }
          />
          <Bar
            dataKey={isMetric ? 'average' : 'rate'}
            name={isMetric ? 'Average' : 'Completion'}
            radius={[6, 6, 0, 0]}
            maxBarSize={38}
            isAnimationActive={false}
          >
            {weekdays.map((day) => (
              <Cell
                key={day.weekday}
                fill={
                  best && day.weekday === best.weekday
                    ? hex
                    : worst && day.weekday === worst.weekday
                      ? withAlpha(hex, 0.3)
                      : withAlpha(hex, 0.6)
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  const streakChart = (
    <ChartCard
      key="streaks"
      title="Longest streaks"
      subtitle="Top 5, all time"
      height={220}
      empty={runs.length === 0}
      emptyLabel="No streaks yet."
    >
      <ResponsiveContainer width="100%" height="100%">
        {/* date labels wrap inside the 108px axis. left: 8 covers recharts' tick gap */}
        <BarChart data={runs} layout="vertical" margin={{ top: 4, right: 20, bottom: 0, left: 8 }} barCategoryGap="22%">
          <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={axisTick(theme)} tickLine={false} axisLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="range" tick={axisTick(theme)} tickLine={false} axisLine={false} width={108} />
          <Tooltip
            cursor={{ fill: theme.surface2, opacity: 0.5 }}
            content={
              <ChartTooltip
                labelFormatter={(label) => String(label ?? '')}
                valueFormatter={(_value, _name, item) =>
                  (item as { payload?: RunPoint } | undefined)?.payload?.label ?? ''
                }
              />
            }
          />
          <Bar dataKey="length" name="Streak" radius={[0, 6, 6, 0]} maxBarSize={22} isAnimationActive={false}>
            {runs.map((run, index) => (
              <Cell key={run.range} fill={index === 0 ? hex : withAlpha(hex, 0.55)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  const secondaryChart: ReactNode =
    secondary === 'period'
      ? periodChart(220)
      : secondary === 'weekly'
        ? weeklyChart('rate', 220)
        : secondary === 'logged'
          ? weeklyChart('logged', 220)
          : null;

  return (
    <section className="flex flex-col gap-4 sm:gap-5" style={habitStyle(habit.color)} aria-label="Trends">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold leading-tight tracking-tight text-fg sm:text-xl">
            Trends
          </h2>
          <p className="mt-0.5 text-sm text-fg-3">
            Showing the {rangeLabel(range)}. Streaks cover all time.
          </p>
        </div>
        <Segmented
          value={range}
          onChange={setRange}
          size="sm"
          aria-label="Chart range"
          options={DETAIL_RANGES.map((option) => ({ value: option.value, label: option.label }))}
        />
      </div>

      {primary === 'value' ? valueChart : primary === 'period' ? periodChart(260) : weeklyChart('rate', 240)}

      <div className="grid gap-4 sm:gap-5 xl:grid-cols-2">
        {!isMetric && strengthChart}
        {secondaryChart}
        {weekdayChart}
        {!isMetric && habit.type !== 'quit' && streakChart}
      </div>
    </section>
  );
}
