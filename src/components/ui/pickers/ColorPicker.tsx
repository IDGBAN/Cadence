import { useId, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { motion } from 'motion/react';
import { Check } from 'lucide-react';
import type { HabitColor } from '@/types';
import { HABIT_COLORS, HABIT_COLOR_KEYS, habitHex, habitStyle } from '@/lib/colors';
import { cn } from '../cn';
import { instant, springSnappy, useReducedMotionPref } from '../motion';

export interface ColorPickerProps {
  value: HabitColor;
  onChange: (color: HabitColor) => void;
  className?: string;
}

export function ColorPicker({ value, onChange, className }: ColorPickerProps) {
  const ringId = `color-ring-${useId()}`;
  const reduced = useReducedMotionPref();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = HABIT_COLOR_KEYS.indexOf(value);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const n = HABIT_COLOR_KEYS.length;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next === null) return;
    e.preventDefault();
    onChange(HABIT_COLOR_KEYS[next]);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label="Color" className={cn('flex flex-wrap gap-2.5', className)}>
      {HABIT_COLOR_KEYS.map((key, index) => {
        const selected = key === value;
        const tabbable = selected || (selectedIndex === -1 && index === 0);
        return (
          <button
            key={key}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={HABIT_COLORS[key].label}
            title={HABIT_COLORS[key].label}
            tabIndex={tabbable ? 0 : -1}
            onClick={() => onChange(key)}
            onKeyDown={(e) => onKeyDown(e, index)}
            style={habitStyle(key)}
            className={cn(
              'group relative flex size-9 shrink-0 items-center justify-center rounded-full pointer-coarse:size-10',
              'focus-visible:outline-offset-[5px]',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'absolute inset-0 rounded-full habit-gradient transition-transform duration-200 ease-out',
                'shadow-[inset_0_1px_0_rgb(255_255_255/0.32),inset_0_-1px_0_rgb(0_0_0/0.12),0_4px_12px_-4px_color-mix(in_oklab,var(--habit)_75%,transparent)]',
                selected ? 'scale-[0.86]' : 'group-hover:scale-110 group-active:scale-95',
              )}
            />
            {selected && (
              <motion.span
                layoutId={ringId}
                aria-hidden
                transition={reduced ? instant : springSnappy}
                className="absolute -inset-[3px] rounded-full border-2"
                style={{ borderColor: habitHex(key) }}
              />
            )}
            {selected && (
              <motion.span
                aria-hidden
                initial={reduced ? false : { scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 600, damping: 24 }}
                className="relative habit-on-fill"
              >
                <Check className="size-4" strokeWidth={3.25} />
              </motion.span>
            )}
          </button>
        );
      })}
    </div>
  );
}
