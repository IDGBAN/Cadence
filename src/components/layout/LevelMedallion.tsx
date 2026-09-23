import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ProgressRing, Tooltip } from '@/components/ui';
import { useLevel } from '@/store/rewardHooks';
import { formatNumber } from '@/lib/format';

export function LevelMedallion({ className }: { className?: string }) {
  const level = useLevel();
  const pct = Math.round(level.progress * 100);

  return (
    <Tooltip
      side="right"
      content={
        <span className="flex flex-col">
          <span className="font-semibold text-fg">
            Level {level.level} · {level.title}
          </span>
          <span className="tabular text-fg-3">
            {formatNumber(level.intoLevel, 0)} / {formatNumber(level.levelSpan, 0)} XP
          </span>
        </span>
      }
    >
      <Link
        to="/rewards"
        aria-label={`Level ${level.level}, ${level.title}. ${pct}% of the way to the next level.`}
        className={clsx(
          'mx-auto flex size-12 items-center justify-center rounded-full transition-transform duration-200 hover:scale-105 active:scale-95',
          className,
        )}
      >
        <ProgressRing value={level.progress} size={44} stroke={3.5} color="var(--xp)" glowOnComplete={false}>
          <span className="font-display text-sm font-bold tabular text-fg">{level.level}</span>
        </ProgressRing>
      </Link>
    </Tooltip>
  );
}
