import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { AnimatedNumber, ProgressBar, Tooltip } from '@/components/ui';
import { useReducedMotion } from '@/store/hooks';
import { useLevel, useXp } from '@/store/rewardHooks';
import { formatNumber } from '@/lib/format';
import type { LevelInfo } from '@/lib/rewards';
import { Medallion } from './Medallion';

export interface LevelProgressProps {
  variant?: 'sidebar' | 'header';
  className?: string;
}

const GAIN_MS = 1800;

interface Gain {
  id: number;
  amount: number;
}

function useXpGain(total: number): Gain | null {
  const previous = useRef(total);
  const [gain, setGain] = useState<Gain | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = total;
    if (total > before) setGain({ id: Date.now(), amount: total - before });
    else if (total < before) setGain(null);
  }, [total]);

  useEffect(() => {
    if (!gain) return undefined;
    const timer = window.setTimeout(() => setGain(null), GAIN_MS);
    return () => window.clearTimeout(timer);
  }, [gain]);

  return gain;
}

function TooltipBody({ level, total }: { level: LevelInfo; total: number }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-semibold text-fg">
        Level {level.level} · {level.title}
      </span>
      <span className="tabular text-fg-3">
        {formatNumber(level.intoLevel, 0)} / {formatNumber(level.levelSpan, 0)} XP into this level
      </span>
      <span className="tabular text-fg-3">{formatNumber(total, 0)} XP earned in total</span>
    </span>
  );
}

function GainChip({ gain, className }: { gain: Gain | null; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <AnimatePresence>
      {gain && !reduced && (
        <motion.span
          key={gain.id}
          aria-hidden
          initial={{ opacity: 0, y: 6, scale: 0.85 }}
          animate={{ opacity: 1, y: -10, scale: 1 }}
          exit={{ opacity: 0, y: -18, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          className={clsx(
            'pointer-events-none absolute rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular text-[#422006] shadow-pop xp-gradient',
            className,
          )}
        >
          +{formatNumber(gain.amount, 0)}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

export function LevelProgress({ variant = 'sidebar', className }: LevelProgressProps) {
  const xp = useXp();
  const level = useLevel();
  const gain = useXpGain(xp.total);
  const pct = Math.round(level.progress * 100);
  const ariaLabel =
    `Level ${level.level}, ${level.title}. ${formatNumber(level.intoLevel, 0)} of ` +
    `${formatNumber(level.levelSpan, 0)} XP to level ${level.level + 1}. Open rewards.`;

  // the medallion already shows the level number, so the pill skips it
  if (variant === 'header') {
    return (
      <Tooltip content={<TooltipBody level={level} total={xp.total} />} side="bottom">
        <Link
          to="/rewards"
          aria-label={ariaLabel}
          className={clsx(
            'relative flex h-10 items-center gap-1.5 rounded-full border border-line bg-surface-2/70 pl-1 pr-2.5',
            'transition-colors hover:border-line-strong hover:bg-surface-2 active:scale-[0.98]',
            className,
          )}
        >
          <Medallion level={level.level} progress={level.progress} size={32} />
          <div className="w-7 sm:w-9">
            <ProgressBar value={level.progress} color="var(--xp)" height={5} aria-label={`${pct}% to level ${level.level + 1}`} />
          </div>
          <GainChip gain={gain} className="-top-1 right-0" />
        </Link>
      </Tooltip>
    );
  }

  return (
    <Tooltip content={<TooltipBody level={level} total={xp.total} />} side="right">
      <Link
        to="/rewards"
        aria-label={ariaLabel}
        className={clsx(
          'relative block rounded-2xl border border-line bg-surface-2/50 p-2.5',
          'transition-colors hover:border-line-strong hover:bg-surface-2',
          className,
        )}
      >
        <div className="flex items-center gap-2.5">
          <Medallion level={level.level} progress={level.progress} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-1.5">
              <span className="font-display text-[13px] font-semibold leading-none text-fg">Level {level.level}</span>
              <span className="truncate text-[11px] leading-none text-fg-3">{level.title}</span>
            </div>
            <div className="mt-2">
              <ProgressBar
                value={level.progress}
                color="var(--xp)"
                height={5}
                aria-label={`${pct}% to level ${level.level + 1}`}
              />
            </div>
            <div className="mt-1.5 text-[11px] leading-none tabular text-fg-3">
              <AnimatedNumber value={level.intoLevel} format={(n) => formatNumber(Math.round(n), 0)} />
              {' / '}
              {formatNumber(level.levelSpan, 0)} XP
            </div>
          </div>
        </div>
        <GainChip gain={gain} className="right-2 top-1" />
      </Link>
    </Tooltip>
  );
}
