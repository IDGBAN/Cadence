import { useId, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '../cn';
import { instant, springSnappy, useReducedMotionPref } from '../motion';

export interface SegmentedProps<T extends string | number> {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: ReactNode; icon?: ReactNode; title?: string; disabled?: boolean }>;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  className?: string;
  layoutId?: string;
  'aria-label'?: string;
}

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  size = 'md',
  fullWidth = false,
  className,
  layoutId,
  'aria-label': ariaLabel,
}: SegmentedProps<T>) {
  const autoId = useId();
  const pillId = layoutId ?? `segmented-${autoId}`;
  const reduced = useReducedMotionPref();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = options.findIndex((o) => o.value === value);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    let next: number | null = null;
    if (e.key in keys) {
      const dir = keys[e.key];
      for (let step = 1; step <= options.length; step++) {
        const candidate = (index + dir * step + options.length * step) % options.length;
        if (!options[candidate].disabled) {
          next = candidate;
          break;
        }
      }
    } else if (e.key === 'Home') next = options.findIndex((o) => !o.disabled);
    else if (e.key === 'End') {
      for (let i = options.length - 1; i >= 0; i--) {
        if (!options[i].disabled) {
          next = i;
          break;
        }
      }
    }
    if (next === null || next < 0) return;
    e.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'relative isolate items-center border border-line bg-surface-2 light:bg-surface-3/70',
        'shadow-[inset_0_1px_2px_rgb(0_0_0/0.15)] light:shadow-[inset_0_1px_2px_rgb(17_20_39/0.05)]',
        fullWidth ? 'flex w-full' : 'inline-flex max-w-full',
        size === 'md' ? 'h-10 gap-0.5 rounded-xl p-[3px]' : 'h-8 gap-0.5 rounded-[10px] p-[2px]',
        className,
      )}
    >
      {options.map((option, index) => {
        const active = index === activeIndex;
        const tabbable = active || (activeIndex === -1 && index === 0);
        return (
          <button
            key={String(option.value)}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={tabbable ? 0 : -1}
            title={option.title}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              'relative flex h-full min-w-0 select-none items-center justify-center gap-1.5 whitespace-nowrap font-semibold',
              'transition-colors duration-150 focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-40',
              size === 'md' ? 'rounded-[9px] px-3.5 text-sm [&_svg]:size-4' : 'rounded-lg px-2.5 text-xs [&_svg]:size-3.5',
              fullWidth && 'flex-1',
              active ? 'text-fg' : 'text-fg-3 hover:text-fg-2',
            )}
          >
            {active && (
              <motion.span
                layoutId={pillId}
                aria-hidden
                transition={reduced ? instant : springSnappy}
                className={cn(
                  'absolute inset-0 -z-10 rounded-[inherit] bg-surface-3',
                  'shadow-[0_1px_2px_rgb(0_0_0/0.3),inset_0_1px_0_color-mix(in_oklab,var(--fg)_9%,transparent)]',
                  'light:bg-surface light:shadow-[0_1px_3px_rgb(17_20_39/0.12),0_0_0_0.5px_rgb(17_20_39/0.06)]',
                )}
              />
            )}
            {option.icon}
            {option.label !== undefined && option.label !== null && option.label !== '' && (
              <span className="truncate">{option.label}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
