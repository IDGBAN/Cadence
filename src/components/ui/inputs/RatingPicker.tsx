import { useRef, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { motion } from 'motion/react';
import { Check } from 'lucide-react';
import { cn } from '../cn';
import { springPress, useReducedMotionPref } from '../motion';

export interface RatingPickerProps {
  value: number | undefined;
  /** Clicking the selected value again clears it. */
  onChange: (value: number | undefined) => void;
  max?: number;
  target?: number;
  /** With atMost, values above target count as missed and get the danger color. */
  direction?: 'atLeast' | 'atMost';
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

const pillSizes = {
  sm: 'h-8 rounded-[10px] text-xs',
  md: 'h-10 rounded-xl text-sm',
  lg: 'h-12 rounded-[14px] font-display text-base',
} as const;

// scales above 5 wrap into two rows until the container is ~28rem wide,
// so 1-10 stays tappable on a 360px phone
export function RatingPicker({
  value,
  onChange,
  max = 10,
  target,
  direction = 'atLeast',
  size = 'md',
  color,
  className,
  disabled = false,
  'aria-label': ariaLabel = 'Rating',
}: RatingPickerProps) {
  const reduced = useReducedMotionPref();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const scale = Math.max(1, Math.round(max));
  const values = Array.from({ length: scale }, (_, i) => i + 1);
  const selected = value !== undefined && Number.isFinite(value) ? Math.round(value) : undefined;
  const narrowCols = scale > 5 ? Math.ceil(scale / 2) : scale;
  const c = color ?? 'var(--habit)';
  const atMost = direction === 'atMost';
  const reachedTarget =
    selected !== undefined && target !== undefined && (atMost ? selected <= target : selected >= target);

  const select = (n: number) => {
    if (disabled) return;
    onChange(n === selected ? undefined : n);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>, n: number) => {
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(scale, n + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(1, n - 1);
    else if (e.key === 'Home') next = 1;
    else if (e.key === 'End') next = scale;
    else if (/^[0-9]$/.test(e.key)) {
      const digit = Number(e.key) === 0 ? 10 : Number(e.key);
      if (digit <= scale) next = digit;
    }
    if (next === null) return;
    e.preventDefault();
    if (next !== selected) onChange(next);
    refs.current[next - 1]?.focus();
  };

  return (
    <div className={cn('@container w-full', className)}>
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        aria-disabled={disabled || undefined}
        className={cn(
          'grid gap-1.5 sm:gap-2',
          'grid-cols-[repeat(var(--rating-cols-narrow),minmax(0,1fr))] @md:grid-cols-[repeat(var(--rating-cols),minmax(0,1fr))]',
          disabled && 'pointer-events-none opacity-50',
        )}
        style={{ '--rating-cols': scale, '--rating-cols-narrow': narrowCols, '--rating': c } as CSSProperties}
      >
        {values.map((n) => {
          const isSelected = n === selected;
          const filled = selected !== undefined && n <= selected;
          const isTarget = target !== undefined && n === Math.round(target);
          const tabbable = selected !== undefined && selected >= 1 && selected <= scale ? isSelected : n === 1;
          const ramp = n / scale;
          // past an atMost ceiling: shade it as the bad side instead of ramping up the habit color
          const overLimit = atMost && target !== undefined && n > Math.round(target);
          const pc = overLimit ? 'var(--danger)' : c;

          let background: string;
          let textColor: string | undefined;
          let border: string;
          if (isSelected) {
            background = `linear-gradient(160deg, color-mix(in oklab, ${pc} 88%, white 12%), color-mix(in oklab, ${pc} 92%, black 8%))`;
            textColor = `color-mix(in oklab, ${pc} 22%, black)`;
            border = `color-mix(in oklab, ${pc} 80%, black 5%)`;
          } else if (filled) {
            const pct = Math.round(26 + 44 * (n / (selected ?? scale)));
            background = `color-mix(in oklab, ${pc} ${pct}%, var(--surface-2))`;
            border = `color-mix(in oklab, ${pc} ${Math.min(90, pct + 18)}%, var(--surface-2))`;
          } else {
            const pct = Math.round(3 + 9 * ramp);
            background = `color-mix(in oklab, ${pc} ${pct}%, var(--surface-2))`;
            border = `color-mix(in oklab, ${pc} ${pct + 8}%, var(--line))`;
          }

          return (
            <motion.button
              key={n}
              ref={(node) => {
                refs.current[n - 1] = node;
              }}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={isTarget ? `${n} (${atMost ? 'limit' : 'target'})` : String(n)}
              tabIndex={tabbable ? 0 : -1}
              disabled={disabled}
              onClick={() => select(n)}
              onKeyDown={(e) => onKeyDown(e, n)}
              whileTap={reduced ? undefined : { scale: 0.9 }}
              animate={isSelected && !reduced ? { scale: [1, 1.12, 1] } : { scale: 1 }}
              initial={false}
              transition={isSelected ? { duration: 0.32, ease: [0.34, 1.56, 0.64, 1] } : springPress}
              style={{ background, borderColor: border, color: textColor, '--rating': pc } as CSSProperties}
              className={cn(
                'relative flex min-w-0 select-none items-center justify-center border font-semibold tabular outline-offset-2',
                'transition-[background,border-color,color,box-shadow] duration-200 ease-out',
                pillSizes[size],
                !isSelected && (filled ? 'text-fg' : 'text-fg-3 hover:text-fg'),
                !isSelected && 'hover:brightness-110 light:hover:brightness-[0.97]',
                isSelected &&
                  'z-[1] shadow-[inset_0_1px_0_rgb(255_255_255/0.3),0_8px_20px_-8px_var(--rating)] light:shadow-[inset_0_1px_0_rgb(255_255_255/0.4),0_6px_16px_-8px_var(--rating)]',
              )}
            >
              {n}
              {/* atLeast hides the marker once filled past it. an atMost ceiling stays visible while you're over it */}
              {isTarget && (atMost ? !isSelected : !filled) && (
                <span
                  aria-hidden
                  className="absolute bottom-1 left-1/2 h-[3px] w-3 -translate-x-1/2 rounded-full bg-success/70"
                />
              )}
              {isSelected && reachedTarget && (
                <motion.span
                  aria-hidden
                  initial={reduced ? false : { scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 600, damping: 22, delay: reduced ? 0 : 0.08 }}
                  className="absolute -right-1.5 -top-1.5 flex size-[18px] items-center justify-center rounded-full border-2 border-surface bg-success text-[var(--surface)]"
                >
                  <Check className="size-2.5" strokeWidth={4} />
                </motion.span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
