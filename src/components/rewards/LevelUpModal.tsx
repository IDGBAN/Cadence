import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { useReducedMotion } from '@/store/hooks';
import { useXp } from '@/store/rewardHooks';
import { levelTitle, xpForLevel } from '@/lib/rewards';
import { confettiCelebration, haptic, playSound } from '@/lib/feedback';
import { formatNumber } from '@/lib/format';
import { Medallion } from './Medallion';

export interface LevelUpModalProps {
  level: number;
  onClose: () => void;
}

const EXIT_MS = 260;

export function LevelUpModal({ level, onClose }: LevelUpModalProps) {
  const xp = useXp();
  const reduced = useReducedMotion();
  const fired = useRef(false);
  const [open, setOpen] = useState(true);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    confettiCelebration('levelUp');
    playSound('levelUp');
    haptic([18, 70, 18, 70, 28]);
  }, []);

  useEffect(() => {
    if (open) return undefined;
    const timer = window.setTimeout(() => closeRef.current(), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  const close = () => setOpen(false);

  const nextLevel = level + 1;
  const nextAt = xpForLevel(nextLevel);
  const toGo = Math.max(0, nextAt - xp.total);

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      aria-label={`You reached level ${level}`}
      className="text-center"
      footer={
        <Button data-autofocus onClick={onClose} fullWidth>
          Continue
        </Button>
      }
    >
      <div className="relative -mt-2 flex flex-col items-center px-1 pb-1">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-16 h-52 opacity-80 blur-3xl"
          style={{ background: 'radial-gradient(55% 55% at 50% 50%, color-mix(in oklab, var(--xp) 40%, transparent), transparent)' }}
        />

        <motion.div
          className={reduced ? undefined : 'animate-float'}
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.5, rotate: -18 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={reduced ? { duration: 0.2 } : { type: 'spring', stiffness: 200, damping: 13 }}
        >
          <Medallion level={level} progress={1} size={124} showcase label="Level" />
        </motion.div>

        <div className="eyebrow mt-6 flex items-center justify-center gap-1.5 text-xp light:text-[color-mix(in_oklab,var(--xp)_82%,black)]">
          <Sparkles className="size-3.5" aria-hidden />
          Level up
        </div>
        <h2 className="mt-2 font-display text-[28px] font-bold leading-tight tracking-tight text-fg">
          Level {level}
        </h2>
        <p className="mt-1 text-sm text-fg-2">
          You are now <span className="font-semibold text-gradient">{levelTitle(level)}</span>
        </p>

        <div className="mt-5 w-full rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-left">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-fg-3">Total XP</span>
            <span className="font-display text-base font-bold tabular text-fg">{formatNumber(xp.total, 0)}</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-line pt-2">
            <span className="text-[13px] text-fg-3">
              Level {nextLevel} · {levelTitle(nextLevel)}
            </span>
            <span className="text-[13px] font-semibold tabular text-xp light:text-[color-mix(in_oklab,var(--xp)_82%,black)]">{formatNumber(toGo, 0)} XP to go</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
