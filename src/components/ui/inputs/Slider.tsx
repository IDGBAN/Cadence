import type { CSSProperties } from 'react';
import { cn } from '../cn';

export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  color?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-valuetext'?: string;
}

const THUMB = 22;

// the native range input sits invisibly on top, so keyboard, touch and a11y come for free
export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  color,
  className,
  disabled = false,
  id,
  'aria-label': ariaLabel,
  'aria-valuetext': ariaValueText,
}: SliderProps) {
  const span = max - min;
  const safe = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
  const pct = span > 0 ? (safe - min) / span : 0;
  const style = { '--slider': color ?? 'var(--habit)', '--pct': pct } as CSSProperties;

  return (
    <div
      className={cn('group/slider relative flex h-10 w-full touch-pan-y items-center', disabled && 'opacity-50', className)}
      style={style}
    >
      <div
        aria-hidden
        className="absolute inset-x-0 h-2 rounded-full bg-[color-mix(in_oklab,var(--slider)_16%,var(--surface-3))] shadow-[inset_0_1px_2px_rgb(0_0_0/0.18)] light:shadow-[inset_0_1px_2px_rgb(17_20_39/0.08)]"
      />
      <div
        aria-hidden
        className="absolute left-0 h-2 rounded-full bg-[linear-gradient(90deg,color-mix(in_oklab,var(--slider)_55%,var(--surface-3)),var(--slider))]"
        style={{ width: `calc(var(--pct) * (100% - ${THUMB}px) + ${THUMB / 2}px)` }}
      />
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={safe}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-valuetext={ariaValueText}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(
          'peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0 disabled:cursor-not-allowed',
          '[&::-webkit-slider-thumb]:size-[22px] [&::-webkit-slider-thumb]:appearance-none',
          '[&::-moz-range-thumb]:size-[22px] [&::-moz-range-thumb]:border-0',
        )}
      />
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute top-1/2 size-[22px] -translate-y-1/2 rounded-full border-[3px] border-surface bg-[var(--slider)]',
          'shadow-[0_0_0_1px_color-mix(in_oklab,var(--slider)_45%,transparent),0_4px_12px_-2px_color-mix(in_oklab,var(--slider)_65%,transparent)]',
          'transition-[transform,box-shadow] duration-150 ease-out',
          'group-hover/slider:scale-105 peer-active:scale-115',
          'peer-focus-visible:shadow-[0_0_0_1px_color-mix(in_oklab,var(--slider)_45%,transparent),0_0_0_6px_color-mix(in_oklab,var(--slider)_28%,transparent)]',
        )}
        style={{ left: `calc(var(--pct) * (100% - ${THUMB}px))` }}
      />
    </div>
  );
}
