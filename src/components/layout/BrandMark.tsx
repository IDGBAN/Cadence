import { useId, type CSSProperties } from 'react';
import { motion } from 'motion/react';
import clsx from 'clsx';

const ARC = 'M24 6a18 18 0 1 1-16.67 11.18';
const CHECK = 'M16.5 24.5l5.25 5.25L32 19.25';

export interface BrandMarkProps {
  size?: number;
  animated?: boolean;
  glow?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function BrandMark({ size = 32, animated = false, glow = false, className, style }: BrandMarkProps) {
  const gradientId = `brand-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const stroke = `url(#${gradientId})`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={clsx('shrink-0 text-fg', className)}
      style={{
        ...(glow ? { filter: 'drop-shadow(0 6px 16px color-mix(in oklab, var(--accent) 45%, transparent))' } : null),
        ...style,
      }}
    >
      <defs>
        <linearGradient id={gradientId} x1="8" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: 'var(--accent)' }} />
          <stop offset="1" style={{ stopColor: 'var(--accent-2)' }} />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="18" stroke="currentColor" strokeOpacity={0.13} strokeWidth={5.5} />
      {animated ? (
        <>
          <motion.path
            d={ARC}
            stroke={stroke}
            strokeWidth={5.5}
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1, ease: [0.65, 0, 0.35, 1] }}
          />
          <motion.path
            d={CHECK}
            stroke="currentColor"
            strokeWidth={4.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.45, delay: 0.8, ease: 'easeOut' }}
          />
        </>
      ) : (
        <>
          <path d={ARC} stroke={stroke} strokeWidth={5.5} strokeLinecap="round" />
          <path d={CHECK} stroke="currentColor" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

export function BrandWordmark({ className }: { className?: string }) {
  return <span className={clsx('font-display font-bold tracking-[-0.03em] text-fg', className)}>Cadence</span>;
}
