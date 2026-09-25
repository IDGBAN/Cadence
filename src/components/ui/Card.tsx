import type { HTMLAttributes, KeyboardEvent, ReactNode, Ref } from 'react';
import { cn } from './cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** With onClick it also works from the keyboard. */
  interactive?: boolean;
  glow?: boolean;
  ref?: Ref<HTMLDivElement>;
}

const paddings = {
  none: '',
  sm: 'p-3',
  md: 'p-4 sm:p-5',
  lg: 'p-5 sm:p-7',
} as const;

export function Card({
  padding = 'md',
  interactive = false,
  glow = false,
  className,
  ref,
  onClick,
  onKeyDown,
  role,
  tabIndex,
  ...rest
}: CardProps) {
  const clickable = interactive && Boolean(onClick);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented || e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.currentTarget.click();
    }
  };

  // a clickable card behaves as a button, so it also gets the role, focus and keys of one
  const behavior = clickable
    ? { role: role ?? 'button', tabIndex: tabIndex ?? 0, onClick, onKeyDown: handleKeyDown }
    : { role, tabIndex, onClick, onKeyDown };

  return (
    <div
      ref={ref}
      {...behavior}
      className={cn(
        'card relative',
        paddings[padding],
        interactive &&
          cn(
            'cursor-pointer transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out',
            'hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop active:translate-y-0 active:scale-[0.995]',
            'focus-visible:outline-offset-2',
          ),
        glow &&
          cn(
            'habit-border habit-glow',
            'bg-[linear-gradient(180deg,color-mix(in_oklab,var(--habit)_9%,transparent),transparent_65%)]',
          ),
        className,
      )}
      {...rest}
    />
  );
}

export interface SectionHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  as?: 'h1' | 'h2' | 'h3';
}

export function SectionHeader({ title, subtitle, eyebrow, icon, action, className, as: Heading = 'h2' }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <div className="flex min-w-0 items-center gap-3">
        {icon !== undefined && icon !== null && (
          <div
            aria-hidden
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-lg leading-none text-fg-2',
              'shadow-[inset_0_1px_0_color-mix(in_oklab,var(--fg)_6%,transparent)] [&_svg]:size-[18px]',
            )}
          >
            {icon}
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
          <Heading
            className={cn(
              'truncate font-display font-semibold tracking-tight text-fg',
              Heading === 'h1' ? 'text-2xl sm:text-[28px]' : Heading === 'h2' ? 'text-lg sm:text-xl' : 'text-base sm:text-lg',
            )}
          >
            {title}
          </Heading>
          {subtitle && <p className="mt-0.5 text-sm text-fg-3">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
