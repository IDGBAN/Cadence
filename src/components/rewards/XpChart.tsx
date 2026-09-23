import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DayKey } from '@/types';
import { ChartCard, ChartTooltip } from '@/components/charts/ChartParts';
import { axisTick, useChartTheme } from '@/components/charts/chartTheme';
import { useEngineCtx } from '@/store/hooks';
import { useXp } from '@/store/rewardHooks';
import { addDays, eachDay, formatDayLong, formatMonthDay } from '@/lib/dates';
import { formatNumber } from '@/lib/format';

const WINDOW_DAYS = 30;

interface Point {
  day: DayKey;
  xp: number;
}

export function XpChart() {
  const ctx = useEngineCtx();
  const xp = useXp();
  const theme = useChartTheme();
  const today = ctx.today;

  const points = useMemo<Point[]>(
    () => eachDay(addDays(today, -(WINDOW_DAYS - 1)), today).map((day) => ({ day, xp: xp.byDay[day] ?? 0 })),
    [xp.byDay, today],
  );

  const total = useMemo(() => points.reduce((sum, p) => sum + p.xp, 0), [points]);
  const best = useMemo(() => points.reduce((max, p) => (p.xp > max ? p.xp : max), 0), [points]);
  const activeDays = useMemo(() => points.filter((p) => p.xp > 0).length, [points]);

  return (
    <ChartCard
      title="XP over the last 30 days"
      subtitle={
        total > 0
          ? `${formatNumber(total, 0)} XP across ${activeDays} of ${WINDOW_DAYS} days · best day ${formatNumber(best, 0)} XP`
          : 'Completed habits show up here'
      }
      height={210}
      empty={total === 0}
      emptyLabel="Log a habit and your first bar shows up here."
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: -20 }} barCategoryGap="18%">
          <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={{ stroke: theme.axis }}
            tick={axisTick(theme)}
            minTickGap={28}
            tickFormatter={(day: string) => formatMonthDay(day)}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            allowDecimals={false}
            tick={axisTick(theme)}
            tickFormatter={(value: number) => formatNumber(value, 0)}
          />
          <Tooltip
            cursor={{ fill: theme.text, fillOpacity: 0.05 }}
            content={
              <ChartTooltip
                labelFormatter={(label) => (typeof label === 'string' ? formatDayLong(label) : '')}
                valueFormatter={(value) => `${formatNumber(value, 0)} XP`}
              />
            }
          />
          <Bar dataKey="xp" name="XP" radius={[5, 5, 2, 2]} isAnimationActive={false}>
            {points.map((point) => (
              <Cell
                key={point.day}
                fill={theme.xp}
                fillOpacity={point.day === today ? 1 : point.xp > 0 ? 0.62 : 0.25}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
