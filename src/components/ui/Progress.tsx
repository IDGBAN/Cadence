import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from './cn';
import { easeOut, instant, springFill, useReducedMotionPref } from './motion';

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

export interface ProgressRingProps {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  trackColor?: string;
  children?: ReactNode;
  className?: string;
  glowOnComplete?: boolean;
  animateOnMount?: boolean;
  'aria-label'?: string;
}

export function ProgressRing({
  value,
  size = 44,
  stroke = 4,
  color = 'var(--habit)',
  trackColor,
  children,
  className,
  glowOnComplete = true,
  animateOnMount = true,
  'aria-label': ariaLabel,
}: ProgressRingProps) {
  const reduced = useReducedMotionPref();
  const v = clamp01(value);
  const complete = v >= 1;
  const r = Math.max(0, (size - stroke) / 2);
  const center = size / 2;
  const glow = complete && glowOnComplete;

  return (
    <motion.div
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
      initial={false}
      animate={complete && !reduced ? { scale: [1, 1.08, 1] } : { scale: 1 }}
      transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 -rotate-90 overflow-visible"
        aria-hidden
      >
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          strokeWidth={stroke}
          style={{ stroke: trackColor ?? `color-mix(in oklab, ${color} 16%, transparent)` }}
        />
        <motion.circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          initial={animateOnMount && !reduced ? { pathLength: 0, opacity: 0 } : false}
          animate={{ pathLength: v, opacity: v > 0.001 ? 1 : 0 }}
          transition={reduced ? instant : { pathLength: springFill, opacity: { duration: 0.15 } }}
          style={{
            stroke: color,
            filter: glow ? `drop-shadow(0 0 ${Math.max(3, stroke * 1.2)}px color-mix(in oklab, ${color} 75%, transparent))` : 'none',
            transition: 'filter 400ms ease',
          }}
        />
      </svg>
      {children !== undefined && children !== null && (
        <div className="relative flex items-center justify-center">{children}</div>
      )}
    </motion.div>
  );
}

export interface ProgressBarProps {
  /** Above 1 renders full with a shimmer. */
  value: number;
  color?: string;
  height?: number;
  className?: string;
  glow?: boolean;
  /** Splits the bar into this many segments. */
  segments?: number;
  /** Should match the surface behind the bar. */
  gapColor?: string;
  'aria-label'?: string;
}

// the dark end of the fill mixes toward --progress-shade. on Daylight that's the ink color,
// otherwise pale habit colors (yellow, lime) look empty against their track
export function ProgressBar({
  value,
  color = 'var(--habit)',
  height = 8,
  className,
  glow = false,
  segments,
  gapColor = 'var(--surface)',
  'aria-label': ariaLabel,
}: ProgressBarProps) {
  const reduced = useReducedMotionPref();
  const raw = Number.isFinite(value) ? Math.max(0, value) : 0;
  const pct = Math.min(1, raw);
  const overflow = raw > 1;
  const ticks = segments && segments > 1 ? Math.min(segments, 60) : 0;

  return (
    <div
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(raw * 100)}
      className={cn('relative w-full rounded-full', className)}
      style={{ height, background: `color-mix(in oklab, ${color} 24%, transparent)` }}
    >
      <motion.div
        className={cn('absolute inset-y-0 left-0 rounded-full', overflow && 'sheen')}
        initial={reduced ? false : { width: '0%' }}
        animate={{ width: `${pct * 100}%` }}
        transition={reduced ? instant : { type: 'spring', stiffness: 110, damping: 22 }}
        style={{
          minWidth: pct > 0 ? height : 0,
          background: `linear-gradient(90deg, color-mix(in oklab, ${color} 70%, var(--progress-shade)), ${color})`,
          boxShadow:
            glow || overflow || pct >= 1
              ? `0 0 ${Math.max(10, height * 1.5)}px -2px color-mix(in oklab, ${color} 70%, transparent), inset 0 1px 0 rgb(255 255 255 / 0.18)`
              : 'inset 0 1px 0 rgb(255 255 255 / 0.14)',
        }}
      />
      {ticks > 0 &&
        Array.from({ length: ticks - 1 }, (_, i) => (
          <span
            key={i}
            aria-hidden
            className="absolute inset-y-0 w-[2px] -translate-x-1/2"
            style={{ left: `${((i + 1) / ticks) * 100}%`, background: gapColor }}
          />
        ))}
    </div>
  );
}

export interface AnimatedNumberProps {
  value: number;
  format?: (n: number) => string;
  /** seconds */
  duration?: number;
  className?: string;
  /** Count up from this on mount. */
  from?: number;
}

function defaultFormat(target: number) {
  const decimals = Number.isInteger(target) ? 0 : Math.min(2, String(target).split('.')[1]?.length ?? 0);
  return (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// animates a motion value so React doesn't re-render every frame
export function AnimatedNumber({ value, format, duration = 0.6, className, from }: AnimatedNumberProps) {
  const reduced = useReducedMotionPref();
  const target = Number.isFinite(value) ? value : 0;
  const motionValue = useMotionValue(from ?? target);
  const formatRef = useRef<(n: number) => string>(format ?? defaultFormat(target));
  useEffect(() => {
    formatRef.current = format ?? defaultFormat(target);
  });
  const text = useTransform(motionValue, (n) => formatRef.current(n));

  useEffect(() => {
    if (reduced || duration <= 0) {
      motionValue.jump(target);
      return;
    }
    const controls = animate(motionValue, target, { duration, ease: easeOut });
    return () => controls.stop();
  }, [target, duration, reduced, motionValue]);

  return <motion.span className={cn('tabular', className)}>{text}</motion.span>;
}

export interface StatTileProps {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  /** Positive is good (green), negative is bad (red). */
  trend?: number | null;
  trendFormat?: (n: number) => string;
  tone?: 'default' | 'accent' | 'flame' | 'xp' | 'success' | 'habit';
  className?: string;
}

const toneColor = {
  default: 'var(--fg-2)',
  accent: 'var(--accent)',
  flame: 'var(--flame)',
  xp: 'var(--xp)',
  success: 'var(--success)',
  habit: 'var(--habit)',
} as const;

function defaultTrendFormat(n: number): string {
  const abs = Math.abs(n);
  const rounded = abs >= 10 ? Math.round(abs) : Math.round(abs * 10) / 10;
  return `${rounded}%`;
}

export function StatTile({ label, value, sub, icon, trend, trendFormat, tone = 'default', className }: StatTileProps) {
  const color = toneColor[tone];
  const hasTrend = trend !== undefined && trend !== null && Number.isFinite(trend);
  const trendDir = hasTrend ? Math.sign(trend) : 0;

  return (
    <div
      className={cn(
        'card relative flex min-w-0 flex-col overflow-hidden p-4',
        tone !== 'default' &&
          'bg-[radial-gradient(130%_90%_at_100%_0%,color-mix(in_oklab,var(--tile)_13%,transparent),transparent_62%)]',
        className,
      )}
      style={{ '--tile': color } as CSSProperties}
    >
      <div className="flex items-center gap-2">
        {icon !== undefined && icon !== null && (
          <span
            aria-hidden
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-lg text-sm leading-none [&_svg]:size-4',
              tone === 'default'
                ? 'bg-surface-2 text-fg-2 light:bg-surface-3'
                : 'bg-[color-mix(in_oklab,var(--tile)_16%,transparent)] text-[var(--tile)]',
            )}
          >
            {icon}
          </span>
        )}
        <span className="min-w-0 truncate text-xs font-medium text-fg-3">{label}</span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-display text-2xl font-semibold leading-none tracking-tight text-fg tabular sm:text-[28px]">
          {value}
        </span>
        {hasTrend && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular',
              trendDir > 0 && 'bg-success/14 text-success light:text-[color-mix(in_oklab,var(--success)_82%,black)]',
              trendDir < 0 && 'bg-danger/14 text-danger light:text-[color-mix(in_oklab,var(--danger)_88%,black)]',
              trendDir === 0 && 'bg-surface-3 text-fg-3',
            )}
            aria-label={`${trendDir > 0 ? 'Up' : trendDir < 0 ? 'Down' : 'No change'} ${(trendFormat ?? defaultTrendFormat)(trend)}`}
          >
            {trendDir > 0 ? (
              <ArrowUpRight className="size-3" strokeWidth={2.75} aria-hidden />
            ) : trendDir < 0 ? (
              <ArrowDownRight className="size-3" strokeWidth={2.75} aria-hidden />
            ) : (
              <Minus className="size-3" strokeWidth={2.75} aria-hidden />
            )}
            {(trendFormat ?? defaultTrendFormat)(trend)}
          </span>
        )}
      </div>
      {sub !== undefined && sub !== null && <div className="mt-1.5 truncate text-xs text-fg-3">{sub}</div>}
    </div>
  );
}
