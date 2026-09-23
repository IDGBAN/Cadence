import { Crown, Flame, Info, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import type { DayKey, StreakInfo } from '@/types';
import type { DayOverview } from '@/lib/habitMath';
import { AnimatedNumber, Badge, ProgressRing, cn } from '@/components/ui';
import { formatDayLong } from '@/lib/dates';
import { cheer, formatNumber, pluralize } from '@/lib/format';
import { useMediaQuery, useReducedMotion } from '@/store/hooks';

export interface TopStreak {
  habitName: string;
  count: number;
  unit: StreakInfo['unit'];
}

export interface DaySummaryProps {
  day: DayKey;
  today: DayKey;
  overview: DayOverview;
  // the ring only counts daily goals. if none are due, fall back to what the list shows
  // so a weekly-only user doesn't see "Nothing due" above a screen full of cards
  listCounts?: { all: number; done: number };
  xp: number;
  topStreak?: TopStreak;
  className?: string;
}

function headline(completed: number, total: number): string {
  if (total === 0) return 'Nothing due';
  if (completed === total) return 'Every habit done';
  return `${completed} of ${total} done`;
}

export function DaySummary({ day, today, overview, listCounts, xp, topStreak, className }: DaySummaryProps) {
  const reduced = useReducedMotion();
  const wide = useMediaQuery('(min-width: 640px)');
  const { perfect } = overview;
  const past = day < today;

  // `perfect` always comes from the engine so this never disagrees with rewards
  const fallback = overview.total === 0 && listCounts !== undefined && listCounts.all > 0;
  const total = fallback ? listCounts.all : overview.total;
  const completed = fallback ? listCounts.done : overview.completed;
  const progress = fallback ? completed / total : overview.progress;

  const kind = total === 0 ? 'empty' : perfect ? 'perfect' : completed === 0 ? 'empty' : 'partial';
  const line = cheer(kind, `${day}:${completed}`);

  return (
    <motion.section
      layout={reduced ? false : 'position'}
      aria-label={`Summary for ${formatDayLong(day)}`}
      className={cn(
        'card relative isolate overflow-hidden p-5 transition-colors duration-500 sm:p-7',
        perfect
          ? 'sheen border-accent/45 shadow-[0_0_0_1px_color-mix(in_oklab,var(--accent)_35%,transparent),0_24px_60px_-30px_color-mix(in_oklab,var(--accent)_85%,transparent)]'
          : 'border-line',
        className,
      )}
    >
      {perfect && (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 -z-10 size-56 rounded-full bg-accent/20 blur-3xl"
        />
      )}

      <div className="flex items-center gap-4 sm:gap-6">
        <ProgressRing
          value={progress}
          size={wide ? 124 : 96}
          stroke={wide ? 10 : 8}
          color="var(--accent)"
          aria-label={`${completed} of ${total} habits complete`}
          className="shrink-0"
        >
          <div className="flex flex-col items-center leading-none">
            <span className="font-display text-2xl font-semibold tracking-tight text-fg tabular sm:text-[32px]">
              <AnimatedNumber value={completed} format={(n) => formatNumber(Math.round(n), 0)} />
            </span>
            <span className="mt-1 text-[11px] font-medium text-fg-3 tabular">of {total}</span>
          </div>
        </ProgressRing>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {perfect && <Crown aria-hidden className="size-5 text-accent" />}
            <h2 className="font-display text-xl font-semibold leading-tight tracking-tight text-fg sm:text-2xl">
              {headline(completed, total)}
            </h2>
          </div>
          <p className="mt-1.5 text-sm leading-snug text-pretty text-fg-3">{line}</p>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Badge tone={xp > 0 ? 'xp' : 'neutral'} icon={<Zap aria-hidden />}>
              <span className="tabular">{xp > 0 ? `+${formatNumber(xp, 0)} XP` : 'No XP yet'}</span>
            </Badge>
            {topStreak && topStreak.count > 0 && (
              <Badge tone="flame" icon={<Flame aria-hidden />}>
                <span className="truncate">
                  <span className="tabular">{pluralize(topStreak.count, topStreak.unit)}</span> · {topStreak.habitName}
                </span>
              </Badge>
            )}
            {perfect && (
              <Badge tone="accent" icon={<Crown aria-hidden />}>
                Perfect day
              </Badge>
            )}
          </div>
        </div>
      </div>

      {past && (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs leading-snug text-fg-3">
          <Info aria-hidden className="mt-px size-3.5 shrink-0 text-fg-3" />
          <span>
            Editing <span className="font-medium text-fg-2">{formatDayLong(day)}</span>. Your streaks, stats and XP
            update as you go.
          </span>
        </p>
      )}
    </motion.section>
  );
}
