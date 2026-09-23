import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from './cn';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  icon?: ReactNode;
  size?: 'sm' | 'md';
  tone?: 'accent' | 'habit';
  ref?: Ref<HTMLButtonElement>;
}

export function Chip({
  selected,
  icon,
  size = 'md',
  tone = 'accent',
  className,
  children,
  type = 'button',
  ref,
  ...rest
}: ChipProps) {
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={selected === undefined ? undefined : selected}
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full border font-medium',
        'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.96]',
        'disabled:pointer-events-none disabled:opacity-50',
        size === 'sm'
          ? 'h-7 px-2.5 text-xs [&_svg]:size-3.5 pointer-coarse:after:absolute pointer-coarse:after:-inset-y-1.5 pointer-coarse:after:inset-x-0'
          : 'h-9 px-3.5 text-[13px] [&_svg]:size-4 pointer-coarse:after:absolute pointer-coarse:after:-inset-y-0.5 pointer-coarse:after:inset-x-0',
        selected
          ? tone === 'habit'
            ? 'habit-tint-strong habit-border habit-text shadow-[inset_0_1px_0_color-mix(in_oklab,var(--habit)_22%,transparent)]'
            : cn(
                'border-[color-mix(in_oklab,var(--accent)_45%,transparent)] bg-accent/14 text-accent',
                'shadow-[inset_0_1px_0_color-mix(in_oklab,var(--accent)_22%,transparent)]',
                'light:text-[color-mix(in_oklab,var(--accent)_82%,black)]',
              )
          : 'border-line bg-surface-2 text-fg-2 hover:border-line-strong hover:text-fg light:bg-surface',
        className,
      )}
      {...rest}
    >
      {icon !== undefined && icon !== null && <span className="flex shrink-0 items-center leading-none">{icon}</span>}
      {children}
    </button>
  );
}

export interface BadgeProps {
  children?: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'flame' | 'xp' | 'habit';
  size?: 'xs' | 'sm' | 'md';
  icon?: ReactNode;
  className?: string;
  title?: string;
}

const badgeTones = {
  neutral: 'bg-surface-3 text-fg-2 border-line-strong/60',
  accent: 'bg-accent/14 text-accent border-accent/25 light:text-[color-mix(in_oklab,var(--accent)_82%,black)]',
  success: 'bg-success/14 text-success border-success/25 light:text-[color-mix(in_oklab,var(--success)_82%,black)]',
  warning: 'bg-warning/14 text-warning border-warning/25 light:text-[color-mix(in_oklab,var(--warning)_78%,black)]',
  danger: 'bg-danger/14 text-danger border-danger/25 light:text-[color-mix(in_oklab,var(--danger)_88%,black)]',
  flame: 'bg-flame/14 text-flame border-flame/25 light:text-[color-mix(in_oklab,var(--flame)_85%,black)]',
  xp: 'bg-xp/14 text-xp border-xp/30 light:text-[color-mix(in_oklab,var(--xp)_85%,black)]',
  habit: 'habit-tint habit-text border-[color-mix(in_oklab,var(--habit)_28%,transparent)]',
} as const;

const badgeSizes = {
  xs: 'h-[18px] gap-0.5 px-1.5 text-[10px] [&_svg]:size-2.5',
  sm: 'h-[22px] gap-1 px-2 text-[11px] [&_svg]:size-3',
  md: 'h-[26px] gap-1.5 px-2.5 text-xs [&_svg]:size-3.5',
} as const;

export function Badge({ children, tone = 'neutral', size = 'sm', icon, className, title }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-full border font-semibold leading-none tabular',
        badgeTones[tone],
        badgeSizes[size],
        className,
      )}
    >
      {icon !== undefined && icon !== null && <span className="flex shrink-0 items-center leading-none">{icon}</span>}
      {children}
    </span>
  );
}

export interface KbdProps {
  children: ReactNode;
  className?: string;
}

export function Kbd({ children, className }: KbdProps) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-b-2 border-line-strong bg-surface-2 px-1.5',
        'font-sans text-[11px] font-semibold leading-none text-fg-3 light:bg-surface',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
