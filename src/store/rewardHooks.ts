import { useMemo } from 'react';
import type { AchievementStatus, LevelInfo, XpBreakdown } from '@/lib/rewards';
import { computeXp, evaluateAchievements, levelFromXp } from '@/lib/rewards';
import { useData, useEngineCtx } from './hooks';

export function useXp(): XpBreakdown {
  const data = useData();
  const ctx = useEngineCtx();
  const { today, weekStartsOn, dayStartHour } = ctx;
  // ctx is shared per (today, weekStartsOn, dayStartHour), so these fields identify it
  return useMemo(() => computeXp(data, ctx), [data, today, weekStartsOn, dayStartHour]);
}

export function useLevel(): LevelInfo {
  const { total } = useXp();
  return useMemo(() => levelFromXp(total), [total]);
}

export function useAchievements(): AchievementStatus[] {
  const data = useData();
  const ctx = useEngineCtx();
  const { today, weekStartsOn, dayStartHour } = ctx;
  return useMemo(() => evaluateAchievements(data, ctx), [data, today, weekStartsOn, dayStartHour]);
}
