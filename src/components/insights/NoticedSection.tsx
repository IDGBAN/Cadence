import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarDays, ChevronDown, Flame, Link2, Sparkles, Target, Trophy, TrendingUp } from 'lucide-react';
import type { Habit } from '@/types';
import type { Insight, InsightKind } from '@/lib/insights';
import { Badge, Button, Card, Chip, HabitIcon, ProgressBar, SectionHeader, Tooltip } from '@/components/ui';
import { formatNumber, formatPercent } from '@/lib/format';
import { useReducedMotion } from '@/store/hooks';
import { CONFIDENCE_HINT, CONFIDENCE_TONE } from './insightsData';

export const CORRELATION_WARMUP_DAYS = 14;

type FilterKey = 'all' | 'correlation' | 'weekday' | 'trend' | 'streak' | 'consistency' | 'milestone';

const FILTERS: Array<{ value: FilterKey; label: string; icon: typeof Link2; kinds: InsightKind[] }> = [
  { value: 'correlation', label: 'Correlations', icon: Link2, kinds: ['correlation', 'lagged'] },
  { value: 'weekday', label: 'Weekdays', icon: CalendarDays, kinds: ['weekday'] },
  { value: 'trend', label: 'Trends', icon: TrendingUp, kinds: ['trend'] },
  { value: 'streak', label: 'Streaks', icon: Flame, kinds: ['streak'] },
  { value: 'consistency', label: 'Consistency', icon: Target, kinds: ['consistency'] },
  { value: 'milestone', label: 'Milestones', icon: Trophy, kinds: ['milestone'] },
];

const SENTIMENT_RING: Record<Insight['sentiment'], string> = {
  positive: 'border-success/30 bg-success/10 text-success light:text-[color-mix(in_oklab,var(--success)_82%,black)]',
  negative: 'border-warning/30 bg-warning/10 text-warning light:text-[color-mix(in_oklab,var(--warning)_78%,black)]',
  neutral: 'border-line-strong bg-surface-2 text-fg-2',
};

const INITIAL_VISIBLE = 6;

function InsightCard({ insight, habits }: { insight: Insight; habits: Habit[] }) {
  return (
    <Card padding="md" className="flex h-full flex-col gap-3">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl border text-lg leading-none ${SENTIMENT_RING[insight.sentiment]}`}
        >
          {insight.icon ?? '✨'}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[15px] font-semibold leading-snug tracking-tight text-fg text-balance">
            {insight.title}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-fg-3 text-pretty">{insight.detail}</p>
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2">
        {habits.length > 0 && (
          <div className="flex min-w-0 items-center gap-1.5">
            {habits.map((habit) => (
              <Tooltip key={habit.id} content={habit.name}>
                <Link
                  to={`/habits/${habit.id}`}
                  aria-label={`Open ${habit.name}`}
                  className="rounded-[7px] transition-transform duration-150 hover:scale-110"
                >
                  <HabitIcon habit={habit} size="xs" />
                </Link>
              </Tooltip>
            ))}
            {habits.length === 1 && <span className="truncate text-xs text-fg-3">{habits[0].name}</span>}
          </div>
        )}
        <Tooltip content={CONFIDENCE_HINT[insight.confidence]}>
          <span>
            <Badge tone={CONFIDENCE_TONE[insight.confidence]} size="xs">
              {insight.confidence} confidence
            </Badge>
          </span>
        </Tooltip>
      </div>

      {insight.stats && insight.stats.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">
          {insight.stats.map((stat) => (
            <span
              key={stat.label}
              className="inline-flex items-baseline gap-1.5 rounded-lg bg-surface-2 px-2 py-1 text-[11px] leading-none light:bg-surface-3"
            >
              <span className="text-fg-4">{stat.label}</span>
              <span className="font-semibold tabular text-fg-2">{stat.value}</span>
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

function WarmupCard({ daysTracked }: { daysTracked: number }) {
  const progress = Math.max(0, Math.min(1, daysTracked / CORRELATION_WARMUP_DAYS));
  const left = Math.max(0, CORRELATION_WARMUP_DAYS - daysTracked);
  return (
    <Card padding="lg" className="sm:col-span-2">
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10 text-xl text-accent"
        >
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-semibold tracking-tight text-fg">
            {left > 0 ? 'Not enough data yet' : 'Nothing stands out yet'}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-fg-3">
            {left > 0
              ? `Correlations need about ${CORRELATION_WARMUP_DAYS} days of data. You have ${formatNumber(daysTracked, 0)}, so about ${formatNumber(left, 0)} more to go.`
              : 'Nothing unusual in this range. Try a longer range, or keep logging and check back later.'}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <ProgressBar
              value={progress}
              color="var(--accent)"
              height={8}
              aria-label="Progress toward enough data for correlations"
              className="flex-1"
            />
            <span className="shrink-0 text-xs font-semibold tabular text-fg-3">{formatPercent(progress)}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

export interface NoticedSectionProps {
  insights: Insight[];
  habitsById: Map<string, Habit>;
  daysTracked: number;
}

export function NoticedSection({ insights, habitsById, daysTracked }: NoticedSectionProps) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [expanded, setExpanded] = useState(false);
  const reduced = useReducedMotion();

  const counts = useMemo(() => {
    const map = new Map<FilterKey, number>();
    for (const option of FILTERS) {
      map.set(option.value, insights.filter((i) => option.kinds.includes(i.kind)).length);
    }
    return map;
  }, [insights]);

  const available = FILTERS.filter((option) => (counts.get(option.value) ?? 0) > 0);
  const activeFilter = available.some((o) => o.value === filter) ? filter : 'all';
  const filtered = useMemo(() => {
    if (activeFilter === 'all') return insights;
    const option = FILTERS.find((o) => o.value === activeFilter);
    return option ? insights.filter((i) => option.kinds.includes(i.kind)) : insights;
  }, [insights, activeFilter]);

  const visible = expanded ? filtered : filtered.slice(0, INITIAL_VISIBLE);
  const hidden = filtered.length - visible.length;

  return (
    <section aria-labelledby="insights-noticed" className="flex flex-col gap-4">
      <SectionHeader
        as="h2"
        icon={<Sparkles />}
        eyebrow="Patterns"
        title={<span id="insights-noticed">Highlights</span>}
        subtitle={
          insights.length > 0
            ? `${formatNumber(insights.length, 0)} ${insights.length === 1 ? 'finding' : 'findings'}, most important first`
            : 'Based on your logs'
        }
      />

      {available.length > 1 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scroll-fade-x">
          <Chip size="sm" selected={activeFilter === 'all'} onClick={() => setFilter('all')}>
            All
            <span className="ml-1 text-fg-4 tabular">{insights.length}</span>
          </Chip>
          {available.map((option) => {
            const Icon = option.icon;
            return (
              <Chip
                key={option.value}
                size="sm"
                selected={activeFilter === option.value}
                onClick={() => setFilter(option.value)}
                icon={<Icon />}
              >
                {option.label}
                <span className="ml-1 text-fg-4 tabular">{counts.get(option.value)}</span>
              </Chip>
            );
          })}
        </div>
      )}

      {insights.length === 0 ? (
        <WarmupCard daysTracked={daysTracked} />
      ) : (
        <>
          <motion.div layout={!reduced} className="grid gap-3 sm:grid-cols-2">
            <AnimatePresence mode="popLayout" initial={false}>
              {visible.map((insight) => (
                <motion.div
                  key={insight.id}
                  layout={!reduced}
                  initial={reduced ? false : { opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                >
                  <InsightCard
                    insight={insight}
                    habits={insight.habitIds
                      .map((id) => habitsById.get(id))
                      .filter((h): h is Habit => Boolean(h))}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
          {hidden > 0 && (
            <div className="flex justify-center">
              <Button variant="secondary" size="sm" iconRight={<ChevronDown />} onClick={() => setExpanded(true)}>
                Show {formatNumber(hidden, 0)} more
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
