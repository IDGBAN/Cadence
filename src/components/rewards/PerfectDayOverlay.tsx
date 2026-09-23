import { useEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { Crown } from 'lucide-react';
import type { DayKey } from '@/types';
import { useData, useEngineCtx, useReducedMotion } from '@/store/hooks';
import { useXp } from '@/store/rewardHooks';
import { perfectDays } from '@/lib/rewards';
import { confettiCelebration, haptic, playSound } from '@/lib/feedback';
import { formatDayLong } from '@/lib/dates';
import { cheer, formatNumber } from '@/lib/format';

export interface PerfectDayOverlayProps {
  day: DayKey;
  onDone: () => void;
}

const AUTO_DISMISS_MS = 2600;

export function PerfectDayOverlay({ day, onDone }: PerfectDayOverlayProps) {
  const data = useData();
  const ctx = useEngineCtx();
  const xp = useXp();
  const reduced = useReducedMotion();
  const fired = useRef(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const count = useMemo(() => perfectDays(data, ctx).length, [data, ctx]);
  const dayXp = xp.byDay[day] ?? 0;

  useEffect(() => {
    if (!fired.current) {
      fired.current = true;
      confettiCelebration('perfect');
      playSound('perfect');
      haptic([14, 60, 14, 60, 22]);
    }
    const timer = window.setTimeout(() => doneRef.current(), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') doneRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center px-6">
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-bg/70 backdrop-blur-[3px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      />
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 cursor-default"
        onClick={() => doneRef.current()}
      />

      <motion.div
        role="status"
        aria-live="polite"
        className="card sheen relative w-full max-w-sm overflow-hidden px-6 py-7 text-center shadow-pop"
        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.86, y: 18 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: -8 }}
        transition={reduced ? { duration: 0.15 } : { type: 'spring', stiffness: 260, damping: 22 }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-24 h-48 opacity-70 blur-2xl"
          style={{ background: 'radial-gradient(60% 60% at 50% 50%, color-mix(in oklab, var(--xp) 45%, transparent), transparent)' }}
        />
        <div className="relative">
          <motion.div
            className="mx-auto flex size-16 items-center justify-center rounded-2xl xp-gradient text-[#422006] shadow-pop"
            initial={reduced ? false : { rotate: -12, scale: 0.7 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 12, delay: 0.05 }}
          >
            <Crown className="size-8" strokeWidth={2.25} aria-hidden />
          </motion.div>

          <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-fg">Perfect day!</h2>
          <p className="mt-1 text-sm text-fg-3">{formatDayLong(day)}</p>
          <p className="mt-3 text-pretty text-sm text-fg-2">{cheer('perfect', day)}</p>

          <div className="mt-5 flex items-stretch justify-center gap-3">
            <div className="min-w-[104px] rounded-xl border border-line bg-surface-2/70 px-3 py-2">
              <div className="font-display text-lg font-bold tabular text-xp light:text-[color-mix(in_oklab,var(--xp)_82%,black)]">+{formatNumber(dayXp, 0)}</div>
              <div className="eyebrow mt-0.5 text-[10px]">XP today</div>
            </div>
            <div className="min-w-[104px] rounded-xl border border-line bg-surface-2/70 px-3 py-2">
              <div className="font-display text-lg font-bold tabular text-fg">{formatNumber(count, 0)}</div>
              <div className="eyebrow mt-0.5 text-[10px]">Perfect days</div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
