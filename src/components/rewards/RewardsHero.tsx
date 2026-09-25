import { useMemo } from 'react';
import { motion } from 'motion/react';
import { CalendarRange, Crown, Sparkles, Zap } from 'lucide-react';
import type { DayKey } from '@/types';
import { AnimatedNumber, ProgressBar, StatTile } from '@/components/ui';
import { useData, useEngineCtx, useMediaQuery, useReducedMotion, useSettings } from '@/store/hooks';
import { useAchievements, useLevel, useXp } from '@/store/rewardHooks';
import { levelTitle, perfectDays } from '@/lib/rewards';
import { addDays, eachDay, logicalDayOf, startOfWeek } from '@/lib/dates';
import { formatNumber, pluralize } from '@/lib/format';
import { Medallion } from './Medallion';

const PACE_WINDOW_DAYS = 14;
// below this the estimate is too noisy to show
const MIN_PACE_PER_DAY = 0.5;

function sumDays(byDay: Record<DayKey, number>, days: DayKey[]): number {
  let total = 0;
  for (const day of days) total += byDay[day] ?? 0;
  return total;
}

export function RewardsHero() {
  const data = useData();
  const ctx = useEngineCtx();
  const settings = useSettings();
  const xp = useXp();
  const level = useLevel();
  const achievements = useAchievements();
  const reduced = useReducedMotion();
  const wide = useMediaQuery('(min-width: 640px)');
  const today = ctx.today;

  const perfectCount = useMemo(() => perfectDays(data, ctx).length, [data, ctx]);

  const weekXp = useMemo(() => {
    const start = startOfWeek(today, settings.weekStartsOn);
    return sumDays(xp.byDay, eachDay(start, today));
  }, [xp.byDay, today, settings.weekStartsOn]);

  const pace = useMemo(() => {
    const window = eachDay(addDays(today, -(PACE_WINDOW_DAYS - 1)), today);
    const inWindow = new Set(window);
    // badges are one-off bonuses and would make day-to-day logging look much faster than it is
    let badgeXp = 0;
    for (const status of achievements) {
      if (status.unlockedAt && inWindow.has(logicalDayOf(status.unlockedAt, settings.dayStartHour))) badgeXp += status.def.xp;
    }
    return Math.max(0, sumDays(xp.byDay, window) - badgeXp) / window.length;
  }, [xp.byDay, achievements, today, settings.dayStartHour]);

  const toGo = Math.max(0, level.nextLevelXp - level.xp);
  const daysToNext = pace >= MIN_PACE_PER_DAY ? Math.max(1, Math.ceil(toGo / pace)) : null;
  const nextTitle = levelTitle(level.level + 1);

  const paceLine =
    daysToNext === null
      ? xp.total === 0
        ? 'Log a habit to earn your first XP.'
        : 'Log a habit today to start earning XP again.'
      : `Level ${level.level + 1} in about ${pluralize(daysToNext, 'day')} at your current pace of ${formatNumber(Math.round(pace), 0)} XP a day.`;

  return (
    <section className="card relative isolate overflow-hidden p-5 sm:p-7">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-28 size-72 rounded-full opacity-70 blur-3xl"
        style={{ background: 'radial-gradient(circle, color-mix(in oklab, var(--xp) 32%, transparent), transparent 70%)' }}
      />
      <span aria-hidden className="grain pointer-events-none absolute inset-0" />

      <div className="relative flex flex-col items-center gap-5 text-center sm:flex-row sm:items-center sm:gap-7 sm:text-left">
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.7, rotate: -12 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={reduced ? { duration: 0.2 } : { type: 'spring', stiffness: 180, damping: 15 }}
          className="shrink-0"
        >
          <Medallion level={level.level} progress={level.progress} size={wide ? 132 : 104} showcase label="Level" />
        </motion.div>

        <div className="min-w-0 flex-1">
          <div className="eyebrow flex items-center justify-center gap-1.5 text-xp light:text-[color-mix(in_oklab,var(--xp)_82%,black)] sm:justify-start">
            <Sparkles className="size-3.5" aria-hidden />
            {formatNumber(xp.total, 0)} XP earned
          </div>
          <h2 className="mt-2 font-display text-[26px] font-bold leading-[1.1] tracking-tight text-fg sm:text-3xl">
            Level {level.level} · <span className="text-gradient">{level.title}</span>
          </h2>

          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="font-semibold text-fg-2">
                <AnimatedNumber value={level.intoLevel} format={(n) => formatNumber(Math.round(n), 0)} />
                <span className="text-fg-3">{' / '}{formatNumber(level.levelSpan, 0)} XP</span>
              </span>
              <span className="tabular text-fg-3">{formatNumber(toGo, 0)} to go</span>
            </div>
            <ProgressBar
              value={level.progress}
              color="var(--xp)"
              height={10}
              glow
              className="mt-2"
              aria-label={`${Math.round(level.progress * 100)}% of the way to level ${level.level + 1}`}
            />
            <p className="mt-2.5 text-[13px] leading-relaxed text-fg-3">
              {nextTitle !== level.title && <span className="font-medium text-fg-2">Next title: {nextTitle}. </span>}
              {paceLine}
            </p>
          </div>
        </div>
      </div>

      <div className="relative mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          tone="xp"
          icon={<Zap aria-hidden />}
          label="Total XP"
          value={<AnimatedNumber value={xp.total} format={(n) => formatNumber(Math.round(n), 0)} />}
          sub="all time"
        />
        <StatTile
          tone="accent"
          icon={<Sparkles aria-hidden />}
          label="XP today"
          value={<AnimatedNumber value={xp.today} format={(n) => formatNumber(Math.round(n), 0)} />}
          sub={xp.today > 0 ? 'so far today' : 'nothing yet today'}
        />
        <StatTile
          tone="success"
          icon={<CalendarRange aria-hidden />}
          label="This week"
          value={<AnimatedNumber value={weekXp} format={(n) => formatNumber(Math.round(n), 0)} />}
          sub={`2-week average: ${formatNumber(Math.round(pace), 0)}/day`}
        />
        <StatTile
          tone="flame"
          icon={<Crown aria-hidden />}
          label="Perfect days"
          value={formatNumber(perfectCount, 0)}
          sub="all due habits done"
        />
      </div>
    </section>
  );
}
