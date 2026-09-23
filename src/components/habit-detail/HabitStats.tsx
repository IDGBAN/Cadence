import { useMemo, type ReactNode } from 'react';
import { CalendarCheck, CalendarDays, Flame, Gauge, Notebook, Percent, Sigma, Target, Trophy } from 'lucide-react';
import type { AppData, Habit, HabitSummary } from '@/types';
import type { EngineCtx } from '@/lib/habitMath';
import { completionRate, habitStartDay, periodsInRange } from '@/lib/habitMath';
import { addDays, formatMonthDay, formatRange } from '@/lib/dates';
import { formatHours, formatMinutes, formatNumber, formatPercent, periodNoun, pluralize } from '@/lib/format';
import { habitStyle } from '@/lib/colors';
import { ProgressRing, StatTile } from '@/components/ui';
import { daySpan } from './shared';

export interface HabitStatsProps {
  habit: Habit;
  data: AppData;
  ctx: EngineCtx;
  summary: HabitSummary;
}

function strengthLabel(strength: number): string {
  if (strength >= 0.85) return 'Rock solid';
  if (strength >= 0.6) return 'Strong';
  if (strength >= 0.35) return 'Building';
  if (strength >= 0.15) return 'Fragile';
  return 'Just starting';
}

const trendPoints = (n: number) => `${Math.round(Math.abs(n))} pts`;

export function HabitStats({ habit, data, ctx, summary }: HabitStatsProps) {
  const stats = useMemo(() => {
    const start = habitStartDay(habit, data, ctx);
    const current = completionRate(habit, data, addDays(ctx.today, -29), ctx.today, ctx);
    const previous = completionRate(habit, data, addDays(ctx.today, -59), addDays(ctx.today, -30), ctx);
    const comparable = current.opportunities >= 3 && previous.opportunities >= 3;
    const isPeriod = habit.kind !== 'metric' && habit.type !== 'quit' && habit.type !== 'rating' && habit.period !== 'day';
    let periodsHit = 0;
    let periodsTotal = 0;
    if (isPeriod) {
      for (const period of periodsInRange(habit, data, start, ctx.today, ctx)) {
        if (period.skipped || (period.current && !period.success)) continue;
        periodsTotal++;
        if (period.success) periodsHit++;
      }
    }
    return {
      start,
      trackedDays: daySpan(start, ctx.today),
      rate30: current.rate,
      rate30Opportunities: current.opportunities,
      trend: comparable ? (current.rate - previous.rate) * 100 : null,
      isPeriod,
      periodsHit,
      periodsTotal,
    };
  }, [habit, data, ctx]);

  const { streak } = summary;
  const isMetric = habit.kind === 'metric';
  const unitNoun = streak.unit;
  const tiles: ReactNode[] = [];

  // too narrow for ring + label side by side on phones, so stack them there
  tiles.push(
    <div key="strength" className="card flex flex-col items-start gap-2 overflow-hidden p-4 sm:flex-row sm:items-center sm:gap-3">
      <ProgressRing
        value={summary.strength}
        size={52}
        stroke={5}
        aria-label={`Habit strength ${formatPercent(summary.strength)}`}
      >
        <span className="font-display text-[11px] font-semibold leading-none text-fg tabular">
          {formatPercent(summary.strength)}
        </span>
      </ProgressRing>
      <div className="w-full min-w-0">
        <div className="truncate text-xs font-medium text-fg-3">Habit strength</div>
        <div className="mt-1 truncate font-display text-lg font-semibold leading-none tracking-tight text-fg">
          {isMetric ? 'Not scored' : strengthLabel(summary.strength)}
        </div>
        <div className="mt-1 text-xs leading-snug text-fg-3">
          {isMetric ? 'Metrics only track values' : 'Recent days count most'}
        </div>
      </div>
    </div>,
  );

  if (!isMetric) {
    tiles.push(
      <StatTile
        key="streak"
        tone="flame"
        icon={<Flame />}
        label="Current streak"
        value={formatNumber(streak.current, 0)}
        sub={
          streak.current > 0 && streak.currentStart
            ? `Since ${formatMonthDay(streak.currentStart)} · best ${formatNumber(streak.best, 0)}`
            : `Best ${pluralize(streak.best, unitNoun)}`
        }
      />,
      <StatTile
        key="best"
        icon={<Trophy />}
        label="Best streak"
        value={formatNumber(streak.best, 0)}
        sub={
          streak.bestStart && streak.bestEnd
            ? formatRange(streak.bestStart, streak.bestEnd)
            : `${pluralize(streak.best, unitNoun)} in a row`
        }
      />,
      <StatTile
        key="rate30"
        icon={<Percent />}
        label="30-day completion"
        value={formatPercent(stats.rate30)}
        trend={stats.trend}
        trendFormat={trendPoints}
        sub={
          stats.rate30Opportunities > 0
            ? `Across ${pluralize(stats.rate30Opportunities, stats.isPeriod ? unitNoun : 'due day')}`
            : 'Nothing due yet'
        }
      />,
      <StatTile
        key="rateAll"
        icon={<Gauge />}
        label="All-time completion"
        value={formatPercent(summary.completionRate)}
        sub={`Tracked for ${pluralize(stats.trackedDays, 'day')}`}
      />,
    );
  }

  if (stats.isPeriod) {
    tiles.push(
      <StatTile
        key="periods"
        tone="success"
        icon={<Target />}
        label={`${habit.period === 'week' ? 'Weeks' : 'Months'} hit`}
        value={`${formatNumber(stats.periodsHit, 0)}/${formatNumber(stats.periodsTotal, 0)}`}
        sub={stats.periodsTotal > 0 ? `${formatPercent(stats.periodsHit / stats.periodsTotal)} of finished ${habit.period === 'week' ? 'weeks' : 'months'}` : `Nothing finished yet`}
      />,
    );
  }

  if (habit.type === 'check') {
    if (!isMetric) {
      tiles.push(
        <StatTile
          key="total"
          icon={<CalendarCheck />}
          label="Times done"
          value={formatNumber(summary.totalSuccesses, 0)}
          sub={`Since ${formatMonthDay(stats.start)}`}
        />,
      );
    }
  } else if (habit.type === 'duration') {
    tiles.push(
      <StatTile
        key="total"
        tone="accent"
        icon={<Sigma />}
        label="Total time"
        value={formatHours(summary.totalValue)}
        sub={formatMinutes(summary.totalValue, 'long')}
      />,
      <StatTile
        key="average"
        icon={<CalendarDays />}
        label="Average per logged day"
        value={formatMinutes(summary.averageValue)}
        sub={
          habit.kind === 'metric'
            ? 'Across all entries'
            : `${habit.direction === 'atMost' ? 'Limit' : 'Goal'} ${formatMinutes(habit.target)} ${periodNoun(habit.period)}`
        }
      />,
    );
  } else if (habit.type === 'quantity') {
    const unit = (habit.unit ?? '').trim();
    tiles.push(
      <StatTile
        key="total"
        tone="accent"
        icon={<Sigma />}
        label="Total logged"
        value={formatNumber(summary.totalValue, 1)}
        sub={unit ? `${unit} all time` : 'All time'}
      />,
      <StatTile
        key="average"
        icon={<CalendarDays />}
        label="Average per logged day"
        value={formatNumber(summary.averageValue, 1)}
        sub={unit || 'per day'}
      />,
    );
  } else if (habit.type === 'rating') {
    tiles.push(
      <StatTile
        key="average"
        tone="accent"
        icon={<Sigma />}
        label="Average score"
        value={`${formatNumber(summary.averageValue, 1)}/${formatNumber(habit.ratingMax, 0)}`}
        sub={
          habit.kind === 'metric'
            ? 'Across all entries'
            : habit.direction === 'atMost'
              ? `Good day at ${formatNumber(habit.target, 1)} or less`
              : `Good day at ${formatNumber(habit.target, 1)}+`
        }
      />,
    );
  }

  tiles.push(
    <StatTile
      key="logged"
      icon={<Notebook />}
      label="Days logged"
      value={formatNumber(summary.totalLoggedDays, 0)}
      sub={
        stats.trackedDays > 0
          ? `${formatPercent(summary.totalLoggedDays / stats.trackedDays)} of tracked days`
          : 'Nothing logged yet'
      }
    />,
  );

  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4"
      style={habitStyle(habit.color)}
    >
      {tiles}
    </div>
  );
}
