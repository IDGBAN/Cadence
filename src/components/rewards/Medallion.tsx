import { useId } from 'react';
import { motion } from 'motion/react';
import clsx from 'clsx';
import { useReducedMotion } from '@/store/hooks';

export interface MedallionProps {
  level: number;
  // 0-1
  progress: number;
  size?: number;
  stroke?: number;
  // glow and sheen for the hero and the level-up modal
  showcase?: boolean;
  // only shown at 72px and up
  label?: string;
  className?: string;
  'aria-hidden'?: boolean;
}

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

// drawn by hand instead of ProgressRing because it needs a gradient stroke
export function Medallion({
  level,
  progress,
  size = 48,
  stroke,
  showcase = false,
  label,
  className,
  'aria-hidden': ariaHidden = true,
}: MedallionProps) {
  const reduced = useReducedMotion();
  const gradientId = useId();
  const value = clamp01(progress);
  const width = stroke ?? Math.max(3, size / 11);
  const radius = Math.max(1, (size - width) / 2);
  const center = size / 2;
  const showLabel = Boolean(label) && size >= 72;

  return (
    <div
      aria-hidden={ariaHidden || undefined}
      className={clsx('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      {showcase && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full blur-xl"
          style={{ background: 'radial-gradient(circle, color-mix(in oklab, var(--xp) 55%, transparent), transparent 70%)' }}
        />
      )}

      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90 overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#fde68a' }} />
            <stop offset="55%" style={{ stopColor: 'var(--xp)' }} />
            <stop offset="100%" style={{ stopColor: '#f59e0b' }} />
          </linearGradient>
        </defs>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={width}
          style={{ stroke: 'color-mix(in oklab, var(--xp) 16%, transparent)' }}
        />
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={width}
          strokeLinecap="round"
          stroke={`url(#${gradientId})`}
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: value, opacity: value > 0.002 ? 1 : 0 }}
          transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 90, damping: 20 }}
          style={{
            filter: showcase
              ? `drop-shadow(0 0 ${Math.max(4, width * 1.6)}px color-mix(in oklab, var(--xp) 70%, transparent))`
              : 'none',
          }}
        />
      </svg>

      <div
        className={clsx(
          'relative flex flex-col items-center justify-center rounded-full border border-line/70',
          showcase && 'sheen',
        )}
        style={{
          width: size - width * 2.6,
          height: size - width * 2.6,
          background:
            'radial-gradient(120% 120% at 30% 20%, color-mix(in oklab, var(--xp) 22%, var(--surface-2)), var(--surface))',
          boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.12)',
        }}
      >
        <span
          className="font-display font-extrabold leading-none tracking-tight tabular text-fg"
          style={{ fontSize: Math.max(11, Math.round(size * (showLabel ? 0.3 : 0.36))) }}
        >
          {level}
        </span>
        {showLabel && (
          <span
            className="mt-0.5 font-semibold uppercase leading-none tracking-[0.18em] text-fg-3"
            style={{ fontSize: Math.max(7, Math.round(size * 0.075)) }}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
