import { useMemo } from 'react';
import type { EngineCtx } from '@/lib/habitMath';
import type { AchievementStatus, LevelInfo, XpBreakdown } from '@/lib/rewards';
import { computeXp, evaluateAchievements, levelFromXp } from '@/lib/rewards';
import { useData, useEngineCtx, useNow } from './hooks';
import { useStore } from './store';

// quit XP and badges move with the clock, so rewards need a live `now`
const REWARDS_TICK_MS = 60_000;
const rewardsCtxCache = new Map<string, EngineCtx>();

// rounding up to the minute puts every caller on the same ctx, which keeps the rewards cache warm,
// and still counts a relapse logged a few seconds ago
function sharedRewardsCtx(ctx: EngineCtx, clockMs: number): EngineCtx {
  const nowMs = Math.ceil(clockMs / REWARDS_TICK_MS) * REWARDS_TICK_MS;
  const key = `${ctx.today}|${ctx.weekStartsOn}|${ctx.dayStartHour}|${nowMs}`;
  let shared = rewardsCtxCache.get(key);
  if (!shared) {
    shared = { ...ctx, now: new Date(nowMs) };
    rewardsCtxCache.clear();
    rewardsCtxCache.set(key, shared);
  }
  return shared;
}

/** Ctx for XP and achievements. Only ticks while there's an active quit habit. */
export function useRewardsCtx(): EngineCtx {
  const ctx = useEngineCtx();
  const tracksQuit = useStore((s) => s.data.habits.some((h) => h.type === 'quit' && !h.archived));
  const clock = useNow(tracksQuit ? REWARDS_TICK_MS : 0);
  return useMemo(() => (tracksQuit ? sharedRewardsCtx(ctx, clock.getTime()) : ctx), [tracksQuit, ctx, clock]);
}

export function useXp(): XpBreakdown {
  const data = useData();
  const ctx = useRewardsCtx();
  return useMemo(() => computeXp(data, ctx), [data, ctx]);
}

export function useLevel(): LevelInfo {
  const { total } = useXp();
  return useMemo(() => levelFromXp(total), [total]);
}

export function useAchievements(): AchievementStatus[] {
  const data = useData();
  const ctx = useRewardsCtx();
  return useMemo(() => evaluateAchievements(data, ctx), [data, ctx]);
}
