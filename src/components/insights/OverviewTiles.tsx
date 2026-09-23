import { CalendarDays, Check, Clock, Flame, Layers, Sparkles, Target, TrendingUp } from 'lucide-react';
import { StatTile } from '@/components/ui';
import { formatNumber, formatPercent, pluralize } from '@/lib/format';
import type { HabitRow, InsightTotals, OverallStats } from './useInsightsData';
import type { ResolvedRange } from './insightsData';

export interface OverviewTilesProps {
  range: ResolvedRange;
  overall: OverallStats;
  totals: InsightTotals;
  rows: HabitRow[];
}

const DASH = '—';

function pointsFormat(n: number): string {
  const rounded = Math.abs(n) >= 10 ? Math.round(Math.abs(n)) : Math.round(Math.abs(n) * 10) / 10;
  return `${rounded} pts`;
}

export function OverviewTiles({ range, overall, totals, rows }: OverviewTilesProps) {
  const metrics = rows.filter((r) => r.isMetric).length;
  const goals = rows.length - metrics;
  const hours = totals.focusedMinutes / 60;
  const improved = totals.mostImproved;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <StatTile
        icon={<Target />}
        tone="accent"
        label="Completion"
        value={overall.rate === null ? DASH : formatPercent(overall.rate)}
        trend={overall.changePoints}
        trendFormat={pointsFormat}
        sub={
          overall.previousRate === null
            ? `${overall.evaluatedDays} tracked ${overall.evaluatedDays === 1 ? 'day' : 'days'}`
            : `vs ${formatPercent(overall.previousRate)} the ${range.days} days before`
        }
      />
      <StatTile
        icon={<Sparkles />}
        tone="success"
        label="Perfect days"
        value={formatNumber(overall.perfectDays, 0)}
        sub={
          overall.evaluatedDays > 0
            ? `${formatPercent(overall.perfectDays / overall.evaluatedDays)} of tracked days`
            : 'Every due habit done'
        }
      />
      <StatTile
        icon={<Flame />}
        tone="flame"
        label="Best active streak"
        value={totals.bestStreak ? formatNumber(totals.bestStreak.streak.current, 0) : DASH}
        sub={
          totals.bestStreak
            ? `${totals.bestStreak.habit.icon} ${totals.bestStreak.habit.name} · ${pluralize(totals.bestStreak.streak.current, totals.bestStreak.streak.unit)}`
            : 'No active streaks'
        }
      />
      <StatTile
        icon={<Check />}
        label="Check-ins"
        value={formatNumber(totals.checkIns, 0)}
        sub={`Across ${pluralize(totals.habitsTracked, 'habit')}`}
      />
      <StatTile
        icon={<Clock />}
        label="Focused time"
        value={hours >= 1 || hours === 0 ? `${formatNumber(hours, 1)}h` : `${formatNumber(totals.focusedMinutes, 0)}m`}
        sub="Total across timed habits"
      />
      <StatTile
        icon={<Layers />}
        label="Habits tracked"
        value={formatNumber(totals.habitsTracked, 0)}
        sub={metrics > 0 ? `${goals} with goals · ${metrics} ${metrics === 1 ? 'metric' : 'metrics'}` : 'All with goals'}
      />
      <StatTile
        icon={<CalendarDays />}
        label="Days tracked"
        value={formatNumber(totals.daysTracked, 0)}
        sub={`Out of ${range.days} days`}
      />
      <StatTile
        icon={<TrendingUp />}
        tone={improved ? 'success' : 'default'}
        label="Most improved"
        value={
          improved ? (
            <span className="flex min-w-0 items-center gap-1.5 text-[17px] sm:text-xl">
              <span aria-hidden>{improved.habit.icon}</span>
              <span className="truncate">{improved.habit.name}</span>
            </span>
          ) : (
            DASH
          )
        }
        sub={improved ? `${improved.improvement?.label} vs the first half` : 'Needs a longer range to compare'}
      />
    </div>
  );
}
