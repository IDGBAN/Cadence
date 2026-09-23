import { useEffect, useRef } from 'react';
import { AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import type { DayKey, Habit } from '@/types';
import { useData, useEngineCtx, useNow } from '@/store/hooks';
import { useLevel } from '@/store/rewardHooks';
import { useStore } from '@/store/store';
import { useUI, type Celebration } from '@/store/ui';
import type { EngineCtx } from '@/lib/habitMath';
import { dayOverview, periodProgress, quitStats } from '@/lib/habitMath';
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
import { LevelUpModal } from './LevelUpModal';
import { PerfectDayOverlay } from './PerfectDayOverlay';

// wait for logging to settle so rapid taps don't spam celebrations
const DEBOUNCE_MS = 400;
// more than this at once (import, demo data) gets a single summary toast
const MAX_INDIVIDUAL_ACHIEVEMENTS = 3;
// more than this is a bulk edit or import, so stay quiet
const MAX_BACKFILLED_PERFECT_TOASTS = 2;
const TOAST_STAGGER_MS = 800;
const QUIT_MILESTONES = [1, 3, 7, 14, 30, 60, 90, 180, 365] as const;

interface SeenState {
  // the first pass only records a baseline
  initialized: boolean;
  pastPerfect: Set<DayKey>;
  // the store stamp lands a tick later, so remember it here too
  celebratedToday: Set<DayKey>;
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

function celebrationKey(c: Celebration): string {
  switch (c.kind) {
    case 'perfectDay':
      return `perfectDay:${c.day}`;
    case 'levelUp':
      return `levelUp:${c.level}`;
    case 'achievement':
      return `achievement:${c.achievementId}`;
    case 'milestone':
      return `milestone:${c.habitId}:${c.days}`;
    case 'periodGoal':
      return `periodGoal:${c.habitId}:${c.period}`;
  }
}

function milestoneFor(days: number): number {
  let reached = 0;
  for (const milestone of QUIT_MILESTONES) {
    if (days >= milestone) reached = milestone;
    else break;
  }
  return reached;
}

function hasToastFor(name: string): boolean {
  const needle = name.trim().toLowerCase();
  if (needle === '') return false;
  return useUI
    .getState()
    .toasts.some((t) => `${t.title} ${t.description ?? ''}`.toLowerCase().includes(needle));
}

function isPeriodGoal(habit: Habit): boolean {
  return (
    !habit.archived &&
    habit.kind === 'goal' &&
    habit.type !== 'quit' &&
    habit.type !== 'rating' &&
    (habit.period === 'week' || habit.period === 'month')
  );
}

export function CelebrationHost() {
  const hydrated = useStore((s) => s.hydrated);
  const data = useData();
  const ctx = useEngineCtx();
  const level = useLevel();
  // a quit run can cross a milestone without any data change
  const minute = useNow(60_000);
  const navigate = useNavigate();
  const seen = useRef<SeenState>(createSeen());

  useEffect(() => {
    if (!hydrated || !data.meta.onboarded) return undefined;

    const timer = window.setTimeout(() => {
      const store = useStore.getState();
      const fresh = store.data;
      if (!fresh.meta.onboarded) return;
      const state = seen.current;
      const { celebrate, pushToast } = useUI.getState();

      const newly = findNewlyUnlocked(fresh, ctx);
      if (newly.length > 0) {
        store.unlockAchievements(newly.map((def) => def.id));
        if (newly.length <= MAX_INDIVIDUAL_ACHIEVEMENTS) {
          for (const def of newly) celebrate({ kind: 'achievement', achievementId: def.id });
        } else {
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

      const levelNow = levelFromXp(computeXp(fresh, ctx).total).level;
      if (levelNow > fresh.rewards.lastSeenLevel) {
        celebrate({ kind: 'levelUp', level: levelNow });
        store.setLastSeenLevel(levelNow);
      } else if (levelNow < fresh.rewards.lastSeenLevel) {
        store.setLastSeenLevel(levelNow); // edited or imported data, sync without celebrating
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
        celebrate({ kind: 'perfectDay', day: today });
      }
      const allPerfect = perfectDays(fresh, ctx);
      if (!state.initialized) {
        for (const day of allPerfect) state.pastPerfect.add(day);
      } else {
        const backfilled = allPerfect.filter((day) => day !== today && !state.pastPerfect.has(day));
        for (const day of backfilled) state.pastPerfect.add(day);
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

      const nowDate = new Date();
      for (const habit of fresh.habits) {
        if (habit.type !== 'quit' || habit.archived) continue;
        const stats = quitStats(habit, fresh, { ...ctx, now: nowDate });
        const reached = milestoneFor(stats.currentDays);
        const previous = state.quitMilestones.get(habit.id);
        state.quitMilestones.set(habit.id, reached);
        if (!state.initialized || previous === undefined || reached <= previous) continue;
        celebrate({ kind: 'milestone', habitId: habit.id, days: reached });
      }

      for (const habit of fresh.habits) {
        if (!isPeriodGoal(habit)) continue;
        const progress = periodProgress(habit, fresh, today, ctx);
        const key = `${habit.id}:${progress.start}`;
        const was = state.periods.get(key);
        state.periods.set(key, progress.success);
        if (!state.initialized || was === undefined || was || !progress.success) continue;
        if (hasToastFor(habit.name)) continue; // logActions already toasted it
        celebrate({ kind: 'periodGoal', habitId: habit.id, period: habit.period === 'month' ? 'month' : 'week' });
      }

      state.initialized = true;
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [hydrated, data, ctx, level.level, minute, navigate]);

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
    const timer = window.setTimeout(() => shiftCelebration(), TOAST_STAGGER_MS);
    return () => window.clearTimeout(timer);
  }, [head, headKey, ctx, navigate, shiftCelebration]);

  return (
    <AnimatePresence>
      {head?.kind === 'levelUp' && (
        <LevelUpModal key={headKey} level={head.level} onClose={() => shiftCelebration()} />
      )}
      {head?.kind === 'perfectDay' && (
        <PerfectDayOverlay
          key={headKey}
          day={head.day}
          onDone={() => {
            useStore.getState().markPerfectDayCelebrated(head.day);
            shiftCelebration();
          }}
        />
      )}
    </AnimatePresence>
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
