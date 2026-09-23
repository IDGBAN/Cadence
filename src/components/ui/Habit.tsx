import { useEffect, useId, useRef } from 'react';
import { useAnimate } from 'motion/react';
import type { Habit } from '@/types';
import { habitStyle } from '@/lib/colors';
import { cn } from './cn';
import { EMOJI_FONT, svgSafeId } from './hooks';
import { useReducedMotionPref } from './motion';

export interface HabitIconProps {
  habit: Pick<Habit, 'icon' | 'color'>;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  /** Solid background instead of a tint, e.g. once completed. */
  filled?: boolean;
}

const habitIconSizes = {
  xs: 'size-6 rounded-[7px] text-[13px]',
  sm: 'size-8 rounded-[10px] text-base',
  md: 'size-10 rounded-xl text-xl',
  lg: 'size-12 rounded-[14px] text-2xl',
  xl: 'size-16 rounded-[20px] text-[34px]',
} as const;

export function HabitIcon({ habit, size = 'md', className, filled = false }: HabitIconProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative isolate inline-flex shrink-0 select-none items-center justify-center leading-none',
        'habit-tint shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--habit)_22%,transparent)]',
        habitIconSizes[size],
        className,
      )}
      style={habitStyle(habit.color)}
    >
      <span
        className={cn(
          'absolute inset-0 -z-10 rounded-[inherit] habit-gradient transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
          'shadow-[inset_0_1px_0_rgb(255_255_255/0.35),inset_0_-1px_0_rgb(0_0_0/0.14),0_6px_16px_-6px_color-mix(in_oklab,var(--habit)_80%,transparent)]',
          'before:absolute before:inset-x-0 before:top-0 before:h-1/2 before:rounded-t-[inherit] before:bg-[linear-gradient(180deg,rgb(255_255_255/0.22),transparent)]',
          filled ? 'scale-100 opacity-100' : 'scale-75 opacity-0',
        )}
      />
      <span className="translate-y-[0.04em]" style={{ fontFamily: EMOJI_FONT }}>
        {habit.icon}
      </span>
    </span>
  );
}

export interface StreakBadgeProps {
  count: number;
  unit?: 'day' | 'week' | 'month';
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
  showZero?: boolean;
  withUnit?: boolean;
  className?: string;
}

// lucide's flame, inlined so it can take a gradient
const FLAME_PATH =
  'M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4';

const streakSizes = {
  sm: { icon: 14, text: 'text-xs', gap: 'gap-0.5' },
  md: { icon: 16, text: 'text-sm', gap: 'gap-1' },
  lg: { icon: 22, text: 'text-lg', gap: 'gap-1.5' },
} as const;

export function StreakBadge({
  count,
  unit = 'day',
  size = 'md',
  active = false,
  showZero = false,
  withUnit = false,
  className,
}: StreakBadgeProps) {
  const gradientId = `flame-${svgSafeId(useId())}`;
  const reduced = useReducedMotionPref();
  const [scope, animateNumber] = useAnimate<HTMLSpanElement>();
  const previous = useRef(count);

  useEffect(() => {
    if (previous.current === count) return;
    const grew = count > previous.current;
    previous.current = count;
    if (reduced || !scope.current) return;
    animateNumber(
      scope.current,
      { scale: grew ? [1, 1.35, 1] : [1, 0.85, 1] },
      { duration: 0.4, ease: [0.34, 1.56, 0.64, 1] },
    );
  }, [count, reduced, scope, animateNumber]);

  const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (safeCount <= 0 && !showZero) return null;

  const lit = safeCount > 0;
  const s = streakSizes[size];
  const unitText = `${unit}${safeCount === 1 ? '' : 's'}`;
  const label = `${safeCount}-${unit} streak`;

  return (
    <span
      role="img"
      aria-label={label}
      title={`${safeCount} ${unitText} streak`}
      className={cn(
        'inline-flex items-center font-display font-semibold leading-none tabular',
        s.gap,
        s.text,
        lit ? (active ? 'text-flame' : 'text-fg') : 'text-fg-4',
        className,
      )}
    >
      <svg
        width={s.icon}
        height={s.icon}
        viewBox="0 0 24 24"
        aria-hidden
        className={cn('shrink-0 overflow-visible', lit && active && 'origin-bottom animate-flicker')}
        style={
          lit && active
            ? { filter: 'drop-shadow(0 0 5px color-mix(in oklab, var(--flame) 70%, transparent))' }
            : undefined
        }
      >
        {lit && (
          <defs>
            <linearGradient id={gradientId} x1="0.35" y1="0" x2="0.6" y2="1">
              <stop offset="0%" stopColor="#ffd166" />
              <stop offset="48%" style={{ stopColor: 'var(--flame)' }} />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
          </defs>
        )}
        <path
          d={FLAME_PATH}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={
            lit
              ? { fill: `url(#${gradientId})`, stroke: `url(#${gradientId})` }
              : { fill: 'color-mix(in oklab, var(--fg-4) 22%, transparent)', stroke: 'var(--fg-4)' }
          }
        />
        {lit && (
          <path
            d={FLAME_PATH}
            transform="translate(12 20.5) scale(0.42) translate(-12 -20.5)"
            style={{ fill: '#fff4c2', opacity: active ? 0.9 : 0.7 }}
          />
        )}
      </svg>
      <span ref={scope} className="inline-block">
        {safeCount}
        {withUnit && <span className="ml-1 font-sans text-[0.8em] font-medium text-fg-3">{unitText}</span>}
      </span>
    </span>
  );
}
