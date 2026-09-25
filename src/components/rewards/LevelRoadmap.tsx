import { useMemo } from 'react';
import { Route } from 'lucide-react';
import { ProgressBar, SectionHeader, cn } from '@/components/ui';
import { useLevel } from '@/store/rewardHooks';
import { levelTitle, xpForLevel } from '@/lib/rewards';
import { formatNumber } from '@/lib/format';

const LOOKAHEAD = 4;

interface Rung {
  level: number;
  title: string;
  threshold: number;
  current: boolean;
  toGo: number;
}

export function LevelRoadmap() {
  const level = useLevel();

  const rungs = useMemo<Rung[]>(() => {
    const out: Rung[] = [];
    for (let i = 0; i <= LOOKAHEAD; i++) {
      const value = level.level + i;
      const threshold = xpForLevel(value);
      out.push({
        level: value,
        title: levelTitle(value),
        threshold,
        current: i === 0,
        toGo: Math.max(0, threshold - level.xp),
      });
    }
    return out;
  }, [level.level, level.xp]);

  return (
    <section className="card flex flex-col p-4 sm:p-5">
      <SectionHeader
        title="Next levels"
        eyebrow="Level roadmap"
        icon={<Route aria-hidden />}
        subtitle={`Each level takes more XP than the last. Level ${level.level + LOOKAHEAD} needs ${formatNumber(xpForLevel(level.level + LOOKAHEAD), 0)} XP total.`}
      />

      <ol className="mt-4 flex flex-col">
        {rungs.map((rung, index) => (
          <li key={rung.level} className="relative flex gap-3 pb-3.5 last:pb-0">
            {index < rungs.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  'absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-[2px] rounded-full',
                  rung.current ? 'xp-gradient' : 'bg-line',
                )}
              />
            )}
            <span
              aria-hidden
              className={cn(
                'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border text-[12px] font-bold tabular',
                rung.current
                  ? 'border-transparent xp-gradient text-[#422006] shadow-[0_0_18px_-4px_var(--xp)]'
                  : 'border-line bg-surface-2 text-fg-3',
              )}
            >
              {rung.level}
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span
                  className={cn(
                    'truncate font-display text-sm font-semibold tracking-tight',
                    rung.current ? 'text-fg' : 'text-fg-2',
                  )}
                >
                  <span className="sr-only">Level {rung.level}: </span>
                  {rung.title}
                  {rung.current && <span className="ml-2 text-[11px] font-medium text-xp light:text-[color-mix(in_oklab,var(--xp)_82%,black)]">you are here</span>}
                </span>
                <span className="shrink-0 text-[11px] tabular text-fg-3">
                  {formatNumber(rung.threshold, 0)} XP
                </span>
              </div>

              {rung.current ? (
                <div className="mt-1.5">
                  <ProgressBar
                    value={level.progress}
                    color="var(--xp)"
                    height={5}
                    aria-label={`${Math.round(level.progress * 100)}% to level ${level.level + 1}`}
                  />
                  <p className="mt-1 text-[11px] tabular text-fg-3">
                    {formatNumber(level.intoLevel, 0)} / {formatNumber(level.levelSpan, 0)} XP into this level
                  </p>
                </div>
              ) : (
                <p className="mt-0.5 text-[11px] tabular text-fg-3">{formatNumber(rung.toGo, 0)} XP to go</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
