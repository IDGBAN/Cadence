import { useEffect, useRef } from 'react';
import { AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import type { DayKey, Habit } from '@/types';
import { useData } from '@/store/hooks';
import { useRewardsCtx } from '@/store/rewardHooks';
import { useStore } from '@/store/store';
import { celebrationKey, useUI, type Celebration } from '@/store/ui';
import type { EngineCtx } from '@/lib/habitMath';
import { dayOverview, habitMode, periodProgress, quitStats } from '@/lib/habitMath';
import {
  PERFECT_DAY_MIN_HABITS,
  achievementById,
  computeXp,
  findNewlyUnlocked,
  levelFromXp,
  perfectDays,
} from '@/lib/rewards';
import { confettiCelebration, haptic, playSound } from '@/lib/feedback';
import { formatDayShort } from '@/lib/dates';
import { formatNumber, formatValueCompact, periodLabel, pluralize } from '@/lib/format';
import { periodGoalAnnounced } from '@/lib/logActions';
import { LevelUpModal } from './LevelUpModal';
import { PerfectDayOverlay } from './PerfectDayOverlay';

// wait for logging to settle so rapid taps don't spam celebrations
const DEBOUNCE_MS = 400;
// more than this at once (import, demo data) gets a single summary toast and no level-up
const MAX_INDIVIDUAL_ACHIEVEMENTS = 3;
// more than this is a bulk edit or import, so stay quiet
const MAX_BACKFILLED_PERFECT_TOASTS = 2;
const TOAST_STAGGER_MS = 800;

interface SeenState {
  // the first pass only records a baseline
  initialized: boolean;
  pastPerfect: Set<DayKey>;
  // the store stamp lands a tick later, so remember it here too
  celebratedToday: Set<DayKey>;
  // highest milestone seen per quit run, keyed by habit and run start, so undoing a relapse stays quiet
  quitMilestones: Map<string, number>;
  periods: Map<string, boolean>;
}

function createSeen(): SeenState {
  return {
    initialized: false,
    pastPerfect: new Set(),
    celebratedToday: new Set(),
    quitMilestones: new Map(),
    periods: new Map(),
  };
}

// limits are only met once the period is over, so there's nothing to celebrate mid-week
function isPeriodGoal(habit: Habit): boolean {
  if (habit.archived || habitMode(habit) !== 'period') return false;
  return habit.type === 'check' || habit.direction !== 'atMost';
}

export function CelebrationHost() {
  const hydrated = useStore((s) => s.hydrated);
  const data = useData();
  // ticks every minute while a quit habit exists, since a run can cross a milestone without any data change
  const ctx = useRewardsCtx();
  const navigate = useNavigate();
  const seen = useRef<SeenState>(createSeen());

  useEffect(() => {
    if (!hydrated || !data.meta.onboarded) return undefined;

    const timer = window.setTimeout(() => {
      const store = useStore.getState();
      if (!store.data.meta.onboarded) return;
      const state = seen.current;
      const { celebrate, pushToast } = useUI.getState();
      // a background tab keeps its baselines current and leaves the announcing to the tab being looked at
      const loud = document.visibilityState === 'visible';

      const newly = findNewlyUnlocked(store.data, ctx);
      const bulk = newly.length > MAX_INDIVIDUAL_ACHIEVEMENTS;
      if (newly.length > 0) {
        store.unlockAchievements(newly.map((def) => def.id));
        if (loud && !bulk) {
          for (const def of newly) celebrate({ kind: 'achievement', achievementId: def.id });
        } else if (loud) {
          pushToast({
            title: `${newly.length} achievements unlocked`,
            description: 'Check them out on the Rewards page.',
            tone: 'achievement',
            icon: '🏆',
            duration: 6000,
            action: { label: 'See Rewards', onClick: () => navigate('/rewards') },
          });
        }
      }

      // read after unlocking, since badges add XP
      const fresh = useStore.getState().data;
      const levelNow = levelFromXp(computeXp(fresh, ctx).total).level;
      // the stored level only goes up, so dipping under a boundary and crossing it again doesn't replay the modal
      if (levelNow > fresh.rewards.lastSeenLevel) {
        if (loud && !bulk) celebrate({ kind: 'levelUp', level: levelNow });
        store.setLastSeenLevel(levelNow);
      }

      const today = ctx.today;
      const overview = dayOverview(fresh, today, ctx);
      if (
        overview.perfect &&
        overview.total >= PERFECT_DAY_MIN_HABITS &&
        !fresh.rewards.celebratedPerfectDays.includes(today) &&
        !state.celebratedToday.has(today)
      ) {
        state.celebratedToday.add(today);
        if (loud) celebrate({ kind: 'perfectDay', day: today });
        else store.markPerfectDayCelebrated(today);
      }

      const allPerfect = perfectDays(fresh, ctx);
      if (state.initialized && loud) {
        const backfilled = allPerfect.filter((day) => day !== today && !state.pastPerfect.has(day));
        if (backfilled.length > 0 && backfilled.length <= MAX_BACKFILLED_PERFECT_TOASTS) {
          for (const day of backfilled) {
            pushToast({
              title: 'Perfect day filled in',
              description: `${formatDayShort(day)} · everything due that day is done`,
              tone: 'success',
              icon: '👑',
            });
          }
        }
      }
      // today goes in too, so it doesn't count as backfilled once the day rolls over
      for (const day of allPerfect) state.pastPerfect.add(day);

      const nowDate = new Date();
      for (const habit of fresh.habits) {
        if (habit.type !== 'quit' || habit.archived) continue;
        const stats = quitStats(habit, fresh, { ...ctx, now: nowDate });
        const run = `${habit.id}:${stats.runStartedAt}`;
        const reached = stats.milestone.previous;
        const before = state.quitMilestones.get(run);
        state.quitMilestones.set(run, Math.max(reached, before ?? 0));
        if (!state.initialized || before === undefined || reached <= before || !loud) continue;
        celebrate({ kind: 'milestone', habitId: habit.id, days: reached });
      }

      for (const habit of fresh.habits) {
        if (!isPeriodGoal(habit)) continue;
        const progress = periodProgress(habit, fresh, today, ctx);
        const key = `${habit.id}:${progress.start}`;
        const was = state.periods.get(key);
        state.periods.set(key, progress.success);
        if (!state.initialized || was === undefined || was || !progress.success || !loud) continue;
        if (periodGoalAnnounced(habit.id, progress.start)) continue;
        celebrate({
          kind: 'periodGoal',
          habitId: habit.id,
          period: habit.period === 'month' ? 'month' : 'week',
          start: progress.start,
        });
      }

      state.initialized = true;
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [hydrated, data, ctx, navigate]);

  const queue = useUI((s) => s.celebrations);
  const shiftCelebration = useUI((s) => s.shiftCelebration);
  const head = queue.length > 0 ? queue[0] : undefined;
  const headKey = head ? celebrationKey(head) : null;
  const playedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!head || !headKey) return undefined;
    if (head.kind === 'levelUp' || head.kind === 'perfectDay') return undefined;

    if (playedKey.current !== headKey) {
      playedKey.current = headKey;
      playToast(head, ctx, navigate);
    }
    const timer = window.setTimeout(() => shiftCelebration(headKey), TOAST_STAGGER_MS);
    return () => window.clearTimeout(timer);
  }, [head, headKey, ctx, navigate, shiftCelebration]);

  return (
    <>
      {/* the overlay mounts together with its text, which screen readers often skip */}
      <div role="status" aria-live="polite" className="sr-only">
        {head?.kind === 'perfectDay' ? 'Perfect day. Everything due today is done.' : ''}
      </div>
      <AnimatePresence>
        {head?.kind === 'levelUp' && headKey && (
          <LevelUpModal key={headKey} level={head.level} onClose={() => shiftCelebration(headKey)} />
        )}
        {head?.kind === 'perfectDay' && headKey && (
          <PerfectDayOverlay
            key={headKey}
            day={head.day}
            onDone={() => {
              useStore.getState().markPerfectDayCelebrated(head.day);
              shiftCelebration(headKey);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function playToast(celebration: Celebration, ctx: EngineCtx, navigate: (to: string) => void): void {
  const { pushToast } = useUI.getState();
  const data = useStore.getState().data;

  if (celebration.kind === 'achievement') {
    const def = achievementById(celebration.achievementId);
    if (!def) return;
    pushToast({
      title: def.name,
      description: `Achievement unlocked · +${formatNumber(def.xp, 0)} XP`,
      tone: 'achievement',
      icon: def.icon,
      duration: 5000,
      action: { label: 'See Rewards', onClick: () => navigate('/rewards') },
    });
    playSound('achievement');
    haptic([12, 50, 12]);
    if (def.tier !== 'bronze' && def.tier !== 'silver') confettiCelebration('achievement');
    return;
  }

  if (celebration.kind === 'milestone') {
    const habit = data.habits.find((h) => h.id === celebration.habitId);
    if (!habit) return;
    pushToast({
      title: `${pluralize(celebration.days, 'day')} clean`,
      description: habit.name,
      tone: 'streak',
      icon: habit.icon,
      duration: 5000,
      action: { label: 'View', onClick: () => navigate(`/habits/${habit.id}`) },
    });
    playSound(celebration.days >= 30 ? 'achievement' : 'complete');
    haptic([12, 40, 12]);
    if (celebration.days >= 30) confettiCelebration('achievement');
    return;
  }

  if (celebration.kind === 'periodGoal') {
    const habit = data.habits.find((h) => h.id === celebration.habitId);
    if (!habit) return;
    const progress = periodProgress(habit, data, ctx.today, ctx);
    const amount = (value: number) =>
      habit.type === 'check' ? formatNumber(value, 0) : formatValueCompact(habit, value);
    pushToast({
      title: `${periodLabel(celebration.period)} goal hit`,
      description: `${habit.name} · ${amount(progress.achieved)} / ${amount(progress.target)}`,
      tone: 'streak',
      icon: habit.icon,
      duration: 4500,
      action: { label: 'View', onClick: () => navigate(`/habits/${habit.id}`) },
    });
    playSound('complete');
    haptic([12, 40, 12]);
  }
}
