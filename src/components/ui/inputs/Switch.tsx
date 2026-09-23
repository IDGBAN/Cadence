import { useId, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '../cn';
import { instant, springSnappy, useReducedMotionPref } from '../motion';
import { hasContent } from './Field';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** With a label, the whole row toggles. */
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  id?: string;
  'aria-label'?: string;
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  size = 'md',
  className,
  id,
  'aria-label': ariaLabel,
}: SwitchProps) {
  const autoId = useId();
  const switchId = id ?? autoId;
  const descId = `${switchId}-desc`;
  const reduced = useReducedMotionPref();
  const travel = size === 'md' ? 20 : 16;
  const withLabel = hasContent(label);

  const control = (
    <button
      id={switchId}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-describedby={hasContent(description) ? descId : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full p-0.5 transition-[background-color,box-shadow,filter] duration-200 ease-out',
        'disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:after:absolute pointer-coarse:after:-inset-2',
        size === 'md' ? 'h-6 w-11' : 'h-5 w-9',
        checked
          ? 'bg-accent shadow-[inset_0_1px_2px_rgb(0_0_0/0.18),0_0_0_1px_color-mix(in_oklab,var(--accent)_50%,transparent),0_4px_14px_-6px_color-mix(in_oklab,var(--accent)_80%,transparent)]'
          : 'bg-surface-3 shadow-[inset_0_0_0_1px_var(--line-strong),inset_0_1px_2px_rgb(0_0_0/0.2)] hover:brightness-110 light:bg-line-strong light:shadow-[inset_0_1px_2px_rgb(17_20_39/0.12)] light:hover:brightness-95',
        !withLabel && className,
      )}
    >
      <motion.span
        aria-hidden
        initial={false}
        animate={{ x: checked ? travel : 0 }}
        transition={reduced ? instant : springSnappy}
        className={cn(
          'block rounded-full shadow-[0_1px_3px_rgb(0_0_0/0.3),0_0_0_0.5px_rgb(0_0_0/0.06)] transition-colors duration-200',
          size === 'md' ? 'size-5' : 'size-4',
          checked ? 'bg-white' : 'bg-fg-3 light:bg-white',
        )}
      />
    </button>
  );

  if (!withLabel) return control;

  return (
    <label
      htmlFor={switchId}
      className={cn(
        'flex items-center justify-between gap-4',
        disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-snug text-fg">{label}</span>
        {hasContent(description) && (
          <span id={descId} className="mt-0.5 block text-[13px] leading-snug text-fg-3">
            {description}
          </span>
        )}
      </span>
      {control}
    </label>
  );
}
