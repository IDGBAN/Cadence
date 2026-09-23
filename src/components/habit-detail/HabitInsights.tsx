import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Lightbulb, Link2 } from 'lucide-react';
import type { AppData, Habit } from '@/types';
import type { EngineCtx } from '@/lib/habitMath';
import { activeHabits } from '@/lib/habitMath';
import { correlate, describeR, generateInsights, type CorrelationResult } from '@/lib/insights';
import { addDays } from '@/lib/dates';
import { formatNumber, pluralize } from '@/lib/format';
import { habitStyle } from '@/lib/colors';
import { Badge, Button, HabitIcon, cn } from '@/components/ui';
import { useUI } from '@/store/ui';

export interface HabitInsightsProps {
  habit: Habit;
  data: AppData;
  ctx: EngineCtx;
}

const WINDOW_DAYS = 180;
const MIN_R = 0.2;
const MAX_RELATED = 5;

type Direction = 'same' | 'leads' | 'follows';

interface Related {
  key: string;
  other: Habit;
  result: CorrelationResult;
  direction: Direction;
  sentence: string;
}

const SENTIMENT_RING: Record<'positive' | 'negative' | 'neutral', string> = {
  positive: 'border-success/30 bg-success/8',
  negative: 'border-danger/30 bg-danger/8',
  neutral: 'border-line bg-surface-2/50',
};

function sentenceFor(habit: Habit, other: Habit, direction: Direction, r: number): string {
  const higher = r > 0 ? 'higher' : 'lower';
  switch (direction) {
    case 'leads':
      return `After a day with more ${habit.name}, ${other.name} tends to be ${higher} the next day.`;
    case 'follows':
      return `After a day with more ${other.name}, ${habit.name} tends to be ${higher} the next day.`;
    default:
      return r > 0
        ? `${habit.name} and ${other.name} tend to happen on the same days.`
        : `${habit.name} and ${other.name} rarely happen on the same day.`;
  }
}

function buildRelated(habit: Habit, data: AppData, ctx: EngineCtx): Related[] {
  const start = addDays(ctx.today, -(WINDOW_DAYS - 1));
  const end = ctx.today;
  const others = activeHabits(data).filter((candidate) => candidate.id !== habit.id);
  const found: Related[] = [];

  for (const other of others) {
    const pairs: Array<{ direction: Direction; result: CorrelationResult | null }> = [
      { direction: 'same', result: correlate(data, ctx, habit, other, { start, end, lag: 0 }) },
      { direction: 'leads', result: correlate(data, ctx, habit, other, { start, end, lag: 1 }) },
      { direction: 'follows', result: correlate(data, ctx, other, habit, { start, end, lag: 1 }) },
    ];
    for (const pair of pairs) {
      const result = pair.result;
      if (!result || result.confidence === 'low' || Math.abs(result.r) < MIN_R) continue;
      found.push({
        key: `${other.id}-${pair.direction}`,
        other,
        result,
        direction: pair.direction,
        sentence: sentenceFor(habit, other, pair.direction, result.r),
      });
    }
  }

  return found.sort((a, b) => Math.abs(b.result.r) - Math.abs(a.result.r)).slice(0, MAX_RELATED);
}

function RBar({ r }: { r: number }) {
  const width = Math.min(50, Math.abs(r) * 50);
  const positive = r >= 0;
  return (
    <span
      aria-hidden
      className="relative block h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line-strong" />
      <span
        className={cn('absolute inset-y-0 rounded-full', positive ? 'bg-success' : 'bg-danger')}
        style={positive ? { left: '50%', width: `${width}%` } : { right: '50%', width: `${width}%` }}
      />
    </span>
  );
}

export function HabitInsights({ habit, data, ctx }: HabitInsightsProps) {
  const openLogEditor = useUI((s) => s.openLogEditor);
  const insights = useMemo(
    () => generateInsights(data, ctx, { habitId: habit.id, limit: 6 }),
    [data, ctx, habit.id],
  );
  const related = useMemo(() => buildRelated(habit, data, ctx), [habit, data, ctx]);

  return (
    <section className="flex flex-col gap-4 sm:gap-5" aria-label="Insights">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold leading-tight tracking-tight text-fg sm:text-xl">
            Insights
          </h2>
          <p className="mt-0.5 text-sm text-fg-3">Patterns in this habit and the ones you log alongside it.</p>
        </div>
        <Link
          to="/insights"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/10"
        >
          All insights
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          {insights.length === 0 ? (
            <div className="card flex items-start gap-3 p-4 sm:p-5">
              <Lightbulb className="mt-0.5 size-5 shrink-0 text-fg-4" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-fg">No patterns yet</p>
                <p className="mt-1 text-sm leading-relaxed text-fg-3">
                  Insights usually show up after a couple of weeks of logging.
                </p>
                <Button
                  variant="soft"
                  size="sm"
                  className="mt-3"
                  onClick={() => openLogEditor(habit.id, ctx.today)}
                >
                  Log today
                </Button>
              </div>
            </div>
          ) : (
            insights.map((insight) => (
              <article
                key={insight.id}
                className={cn('rounded-2xl border p-4 shadow-card sm:p-5', SENTIMENT_RING[insight.sentiment])}
              >
                <div className="flex items-start gap-3">
                  <span aria-hidden className="text-xl leading-none">
                    {insight.icon ?? '💡'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-[15px] font-semibold leading-snug tracking-tight text-fg">
                      {insight.title}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-pretty text-fg-2">{insight.detail}</p>
                    {insight.stats && insight.stats.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {insight.stats.map((stat) => (
                          <Badge key={`${insight.id}-${stat.label}`} tone="neutral" size="sm">
                            <span className="text-fg-3">{stat.label}</span>
                            <span className="font-semibold text-fg tabular">{stat.value}</span>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>

        <div className="card flex flex-col p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Link2 className="size-4 shrink-0 text-fg-3" aria-hidden />
            <h3 className="font-display text-[15px] font-semibold leading-tight tracking-tight text-fg sm:text-base">
              Related habits
            </h3>
          </div>

          {related.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm leading-relaxed text-fg-3">
              No strong links yet. This needs a few weeks of logs from at least two habits.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {related.map(({ key, other, result, direction, sentence }) => (
                <li key={key} className="py-3 first:pt-0 last:pb-0" style={habitStyle(other.color)}>
                  <Link
                    to={`/habits/${other.id}`}
                    className="group flex items-start gap-3 rounded-xl focus-visible:outline-offset-4"
                  >
                    <HabitIcon habit={other} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-fg group-hover:text-accent">
                          {other.name}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 text-xs font-semibold tabular',
                            result.r >= 0 ? 'text-success' : 'text-danger',
                          )}
                        >
                          {result.r >= 0 ? '+' : '−'}
                          {formatNumber(Math.abs(result.r), 2)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-pretty text-fg-2">{sentence}</p>
                      <div className="mt-2">
                        <RBar r={result.r} />
                      </div>
                      <p className="mt-1.5 text-[11px] text-fg-4">
                        {describeR(result.r)} · {pluralize(result.n, 'day')} compared
                        {direction === 'same' ? '' : ' · next day'}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 text-[11px] leading-relaxed text-fg-4">
            Correlation isn't causation. Treat these as hints, not proof.
          </p>
        </div>
      </div>
    </section>
  );
}
