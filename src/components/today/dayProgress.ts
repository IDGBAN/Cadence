import { useMemo } from 'react';
import type { DayKey } from '@/types';
import { addDays } from '@/lib/dates';
import { overallCompletionSeries } from '@/lib/habitMath';
import { useData, useEngineCtx } from '@/store/hooks';

// older days just render without a fill
const LOOKBACK_DAYS = 365;

export type DayProgressFn = (day: DayKey) => number | null;

export function useDayProgress(): DayProgressFn {
  const data = useData();
  const ctx = useEngineCtx();

  return useMemo(() => {
    const series = overallCompletionSeries(data, addDays(ctx.today, -LOOKBACK_DAYS), ctx.today, ctx);
    const rates = new Map<DayKey, number>();
    for (const point of series) if (point.rate !== null) rates.set(point.day, point.rate);
    return (day: DayKey) => rates.get(day) ?? null;
  }, [data, ctx]);
}
