import { useMemo, type ReactNode } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts';
import type { Habit } from '@/types';
import { habitHex } from '@/lib/colors';
import { formatPercent, pluralize } from '@/lib/format';
import { CHART_MARGIN, Y_AXIS_FIT, axisTick, useChartTheme } from '@/components/charts/chartTheme';
import {
  averageLabel, axisDomain, axisTickLabel, axisTitle, axisValueLabel, bucketPoints, isBinaryHabit, linearFit,
  type BucketPoint, type Lag, type PairPoint,
} from './insightsData';

function TooltipCard({ children }: { children: ReactNode }) {
  return (
    <div className="glass rounded-xl px-3 py-2 text-xs shadow-pop">
      {children}
    </div>
  );
}

interface ScatterTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
  driver: Habit;
  outcome: Habit;
  lag: Lag;
}

function ScatterTooltip({ active, payload, driver, outcome, lag }: ScatterTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as BucketPoint | undefined;
  if (!point) return null;
  return (
    <TooltipCard>
      <div className="flex items-center gap-1.5 font-semibold text-fg">
        <span aria-hidden>{driver.icon}</span>
        {axisValueLabel(driver, point.x)}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-fg-2">
        <span aria-hidden>{outcome.icon}</span>
        {axisValueLabel(outcome, point.y)}
        {lag === 1 && <span className="text-fg-4">next day</span>}
      </div>
      <div className="mt-1 text-fg-4">{pluralize(point.count, 'day')}</div>
    </TooltipCard>
  );
}

interface BarTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
  outcome: Habit;
  rate: boolean;
}

interface BarDatum {
  name: string;
  value: number;
  n: number;
  on: boolean;
}

function BarTooltip({ active, payload, outcome, rate }: BarTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]?.payload as BarDatum | undefined;
  if (!datum) return null;
  return (
    <TooltipCard>
      <div className="font-semibold text-fg">{datum.name}</div>
      <div className="mt-1 text-fg-2">
        {outcome.name}: {rate ? formatPercent(datum.value) : averageLabel(outcome, datum.value)}
      </div>
      <div className="mt-0.5 text-fg-4">{pluralize(datum.n, 'day')}</div>
    </TooltipCard>
  );
}

export interface PairChartProps {
  driver: Habit;
  outcome: Habit;
  points: PairPoint[];
  lag: Lag;
  sideLabels?: { on: string; off: string };
  threshold?: number;
  thresholdLabel?: string;
  height?: number;
}

export function PairChart({
  driver, outcome, points, lag, sideLabels, threshold, thresholdLabel, height = 260,
}: PairChartProps) {
  const theme = useChartTheme();
  const binaryDriver = isBinaryHabit(driver);
  const rateOutcome = isBinaryHabit(outcome);
  const outcomeColor = habitHex(outcome.color);
  const driverColor = habitHex(driver.color);

  const bars = useMemo<BarDatum[]>(() => {
    if (!binaryDriver) return [];
    let onSum = 0;
    let onN = 0;
    let offSum = 0;
    let offN = 0;
    for (const point of points) {
      if (point.x > 0) {
        onSum += point.y;
        onN++;
      } else {
        offSum += point.y;
        offN++;
      }
    }
    const labels = sideLabels ?? (driver.type === 'quit' ? { on: 'Clean day', off: 'Slip day' } : { on: 'Done', off: 'Missed' });
    return [
      { name: labels.on, value: onN > 0 ? onSum / onN : 0, n: onN, on: true },
      { name: labels.off, value: offN > 0 ? offSum / offN : 0, n: offN, on: false },
    ];
  }, [binaryDriver, points, sideLabels, driver.type]);

  const scatter = useMemo(() => (binaryDriver ? [] : bucketPoints(points)), [binaryDriver, points]);
  const fit = useMemo(() => (binaryDriver ? null : linearFit(points)), [binaryDriver, points]);

  const xDomain = useMemo(() => axisDomain(driver, points.map((p) => p.x)), [driver, points]);
  const yDomain = useMemo(() => axisDomain(outcome, points.map((p) => p.y)), [outcome, points]);

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-dashed border-line text-sm text-fg-3" style={{ height }}>
        No overlapping days to plot yet.
      </div>
    );
  }

  if (binaryDriver) {
    const maxValue = Math.max(...bars.map((b) => b.value), rateOutcome ? 1 : 0.001);
    return (
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bars} margin={{ ...CHART_MARGIN, top: 22, bottom: 4 }} barCategoryGap="28%">
            <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: theme.axis }} tick={axisTick(theme)} />
            <YAxis
              {...Y_AXIS_FIT}
              domain={[0, rateOutcome ? 1 : maxValue * 1.15]}
              tick={axisTick(theme)}
              tickFormatter={(value: number) => (rateOutcome ? formatPercent(value) : axisTickLabel(outcome, value))}
            />
            <Tooltip
              cursor={{ fill: theme.surface2, opacity: 0.45 }}
              content={<BarTooltip outcome={outcome} rate={rateOutcome} />}
            />
            <Bar dataKey="value" radius={[8, 8, 4, 4]} isAnimationActive={false} maxBarSize={110}>
              {bars.map((bar) => (
                <Cell key={bar.name} fill={bar.on ? outcomeColor : theme.surface2} />
              ))}
              <LabelList
                dataKey="value"
                position="top"
                offset={8}
                fill={theme.text}
                fontSize={12}
                fontWeight={600}
                formatter={(value) => (rateOutcome ? formatPercent(Number(value)) : averageLabel(outcome, Number(value)))}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="mt-1 text-center text-[11px] text-fg-4">
          {axisTitle(outcome)}
          {lag === 1 ? ' the next day' : ''} · grouped by {driver.name}
        </p>
      </div>
    );
  }

  const fitSegment: readonly [{ x: number; y: number }, { x: number; y: number }] | null = fit
    ? [
        { x: xDomain[0], y: fit.intercept + fit.slope * xDomain[0] },
        { x: xDomain[1], y: fit.intercept + fit.slope * xDomain[1] },
      ]
    : null;

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ ...CHART_MARGIN, top: 12, right: 12, bottom: 4 }}>
          <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="x"
            domain={xDomain}
            tickLine={false}
            axisLine={{ stroke: theme.axis }}
            tick={axisTick(theme)}
            tickFormatter={(value: number) => axisTickLabel(driver, value)}
          />
          <YAxis
            {...Y_AXIS_FIT}
            type="number"
            dataKey="y"
            domain={yDomain}
            tick={axisTick(theme)}
            ticks={rateOutcome ? [0, 1] : undefined}
            tickFormatter={(value: number) => axisTickLabel(outcome, value)}
          />
          <ZAxis type="number" dataKey="count" range={[46, 260]} />
          <Tooltip
            cursor={{ stroke: theme.axis, strokeDasharray: '3 3' }}
            content={<ScatterTooltip driver={driver} outcome={outcome} lag={lag} />}
          />
          {threshold !== undefined && Number.isFinite(threshold) && (
            <ReferenceLine
              x={threshold}
              stroke={driverColor}
              strokeDasharray="4 4"
              strokeOpacity={0.8}
              label={{ value: thresholdLabel ?? 'Goal', position: 'top', fill: theme.textMuted, fontSize: 11 }}
            />
          )}
          {fitSegment && (
            <ReferenceLine
              segment={fitSegment}
              stroke={theme.accent}
              strokeWidth={2}
              strokeDasharray="6 4"
              ifOverflow="hidden"
            />
          )}
          <Scatter
            data={scatter}
            fill={outcomeColor}
            fillOpacity={0.62}
            stroke={outcomeColor}
            strokeOpacity={0.9}
            isAnimationActive={false}
          />
        </ScatterChart>
      </ResponsiveContainer>
      <p className="mt-1 text-center text-[11px] text-fg-4">
        {axisTitle(driver)} → {axisTitle(outcome)}
        {lag === 1 ? ' the next day' : ''} · bigger dots mean more days
      </p>
    </div>
  );
}
