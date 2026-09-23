import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { motion } from 'motion/react';
import { LoaderCircle } from 'lucide-react';
import { cn } from './cn';
import { springPress, useReducedMotionPref } from './motion';
import { Tooltip } from './Tooltip';

// motion.button types these handlers differently, so the DOM versions get dropped
type ConflictingHandlers =
  | 'onDrag'
  | 'onDragStart'
  | 'onDragEnd'
  | 'onAnimationStart'
  | 'onAnimationEnd'
  | 'onAnimationIteration';

function stripConflicts<T extends Partial<Record<ConflictingHandlers, unknown>>>(props: T): Omit<T, ConflictingHandlers> {
  const {
    onDrag: _a,
    onDragStart: _b,
    onDragEnd: _c,
    onAnimationStart: _d,
    onAnimationEnd: _e,
    onAnimationIteration: _f,
    ...rest
  } = props;
  return rest;
}

// bigger tap target on touch screens without changing layout
export const touchHitArea = 'pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5';

const base = cn(
  'relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-semibold tracking-[-0.005em]',
  'transition-[background-color,border-color,color,box-shadow,filter,opacity] duration-150 ease-out',
  'disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:shrink-0',
);

const variants = {
  primary: cn(
    'accent-gradient text-accent-fg',
    'shadow-[inset_0_1px_0_rgb(255_255_255/0.24),0_1px_2px_rgb(0_0_0/0.12),0_8px_22px_-10px_color-mix(in_oklab,var(--accent)_85%,transparent)]',
    'hover:brightness-[1.08] active:brightness-[0.96] disabled:hover:brightness-100',
  ),
  secondary: cn(
    'border border-line-strong bg-surface-2 text-fg',
    'shadow-[inset_0_1px_0_color-mix(in_oklab,var(--fg)_6%,transparent),0_1px_2px_rgb(0_0_0/0.08)]',
    'hover:border-[color-mix(in_oklab,var(--fg)_16%,var(--line-strong))] hover:bg-surface-3',
    'light:bg-surface light:hover:bg-surface-2',
  ),
  soft: cn(
    'bg-accent/14 text-accent hover:bg-accent/22',
    'light:text-[color-mix(in_oklab,var(--accent)_82%,black)]',
  ),
  ghost: 'text-fg-2 hover:bg-surface-2 hover:text-fg light:hover:bg-surface-3',
  outline: 'border border-line-strong text-fg hover:border-fg-4 hover:bg-surface-2 light:hover:bg-surface-3/60',
  danger: cn(
    'bg-[color-mix(in_oklab,var(--danger)_80%,black)] text-white',
    'shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_8px_22px_-10px_color-mix(in_oklab,var(--danger)_85%,transparent)]',
    'hover:brightness-110 active:brightness-95 disabled:hover:brightness-100',
  ),
} as const;

const sizes = {
  xs: cn('h-7 gap-1.5 rounded-lg px-2.5 text-xs [&_svg]:size-3.5', touchHitArea),
  sm: cn('h-8 gap-1.5 rounded-[10px] px-3 text-[13px] [&_svg]:size-4', 'pointer-coarse:after:absolute pointer-coarse:after:-inset-1'),
  md: 'h-10 gap-2 rounded-xl px-4 text-sm [&_svg]:size-[18px]',
  lg: 'h-12 gap-2.5 rounded-[14px] px-5 text-[15px] [&_svg]:size-5',
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'soft' | 'ghost' | 'outline' | 'danger';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  type = 'button',
  ref,
  ...rest
}: ButtonProps) {
  const reduced = useReducedMotionPref();
  const isDisabled = Boolean(disabled || loading);
  const lead = loading ? <LoaderCircle className="animate-spin" aria-hidden /> : icon;

  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      whileTap={isDisabled || reduced ? undefined : { scale: 0.97 }}
      transition={springPress}
      className={cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className)}
      {...stripConflicts(rest)}
    >
      {lead}
      {children !== undefined && children !== null && children !== false && (
        <span className="min-w-0 truncate">{children}</span>
      )}
      {iconRight}
    </motion.button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Also shown as a tooltip unless tooltip={false}. */
  label: string;
  variant?: 'ghost' | 'soft' | 'secondary' | 'primary' | 'danger';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  tooltip?: boolean;
  active?: boolean;
  children: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

const iconVariants = {
  ghost: 'text-fg-3 hover:bg-surface-2 hover:text-fg light:hover:bg-surface-3',
  soft: 'bg-accent/12 text-accent hover:bg-accent/20 light:text-[color-mix(in_oklab,var(--accent)_82%,black)]',
  secondary: cn(
    'border border-line-strong bg-surface-2 text-fg-2 hover:bg-surface-3 hover:text-fg',
    'shadow-[inset_0_1px_0_color-mix(in_oklab,var(--fg)_6%,transparent)] light:bg-surface light:hover:bg-surface-2',
  ),
  primary: variants.primary,
  danger: 'bg-danger/10 text-danger hover:bg-danger/18',
} as const;

const iconActive = {
  ghost: 'bg-surface-3 text-fg light:bg-surface-3',
  soft: 'bg-accent/24',
  secondary: 'border-[color-mix(in_oklab,var(--accent)_45%,var(--line-strong))] bg-surface-3 text-fg',
  primary: 'brightness-110',
  danger: 'bg-danger/20',
} as const;

const iconSizes = {
  xs: cn('size-7 rounded-lg [&_svg]:size-3.5', touchHitArea),
  sm: cn('size-8 rounded-[10px] [&_svg]:size-4', 'pointer-coarse:after:absolute pointer-coarse:after:-inset-1'),
  md: 'size-10 rounded-xl [&_svg]:size-[18px]',
  lg: 'size-12 rounded-[14px] [&_svg]:size-[22px]',
} as const;

export function IconButton({
  label,
  variant = 'ghost',
  size = 'md',
  tooltip = true,
  active,
  children,
  className,
  disabled,
  type = 'button',
  ref,
  ...rest
}: IconButtonProps) {
  const reduced = useReducedMotionPref();
  const button = (
    <motion.button
      ref={ref}
      type={type}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      whileTap={disabled || reduced ? undefined : { scale: 0.92 }}
      transition={springPress}
      className={cn(base, iconVariants[variant], iconSizes[size], active && iconActive[variant], className)}
      {...stripConflicts(rest)}
    >
      {children}
    </motion.button>
  );
  if (!tooltip) return button;
  return <Tooltip content={label}>{button}</Tooltip>;
}
