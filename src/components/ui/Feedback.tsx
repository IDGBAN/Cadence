import { useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { cn } from './cn';
import { EMOJI_FONT } from './hooks';
import { instant, springSnappy, useReducedMotionPref } from './motion';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
      <div className="relative mb-5" aria-hidden>
        <div className="absolute inset-0 scale-[1.6] rounded-full bg-accent/20 blur-2xl light:bg-accent/15" />
        <div className="animate-float">
          <div
            className={cn(
              'relative flex size-[72px] items-center justify-center rounded-[24px] border border-line-strong text-[34px] leading-none text-accent',
              'bg-[linear-gradient(160deg,var(--surface-3),var(--surface))] light:bg-[linear-gradient(160deg,var(--surface),var(--surface-2))]',
              'shadow-[inset_0_1px_0_color-mix(in_oklab,var(--fg)_10%,transparent),0_18px_40px_-18px_color-mix(in_oklab,var(--accent)_60%,transparent)]',
              '[&_svg]:size-8 light:text-[color-mix(in_oklab,var(--accent)_85%,black)]',
            )}
            style={typeof icon === 'string' ? { fontFamily: EMOJI_FONT } : undefined}
          >
            {icon ?? <Sparkles strokeWidth={1.75} />}
          </div>
        </div>
        <span className="absolute -right-2.5 -top-1 size-2.5 rounded-full bg-accent-2/80 shadow-[0_0_10px_var(--accent-2)]" />
        <span className="absolute -left-3 bottom-3 size-1.5 rounded-full bg-accent/80" />
        <span className="absolute -bottom-1 right-1 size-1 rounded-full bg-fg-3/60" />
      </div>
      <h3 className="font-display text-lg font-semibold tracking-tight text-fg">{title}</h3>
      {description !== undefined && description !== null && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-fg-3">{description}</p>
      )}
      {action !== undefined && action !== null && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>
      )}
    </div>
  );
}

export interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div aria-hidden className={cn('relative overflow-hidden rounded-xl bg-surface-2 light:bg-surface-3', className)}>
      <div className="absolute inset-0 animate-shimmer bg-[linear-gradient(100deg,transparent_25%,color-mix(in_oklab,var(--fg)_7%,transparent)_50%,transparent_75%)] bg-[length:250%_100%] bg-no-repeat" />
    </div>
  );
}

export interface TabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  tabs: Array<{ value: T; label: ReactNode; icon?: ReactNode; count?: number }>;
  className?: string;
  layoutId?: string;
  'aria-label'?: string;
}

export function Tabs<T extends string>({ value, onChange, tabs, className, layoutId, 'aria-label': ariaLabel }: TabsProps<T>) {
  const autoId = useId();
  const indicatorId = layoutId ?? `tabs-${autoId}`;
  const reduced = useReducedMotionPref();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = tabs.findIndex((t) => t.value === value);

  useEffect(() => {
    const el = refs.current[activeIndex];
    const list = el?.parentElement;
    if (!el || !list || list.scrollWidth <= list.clientWidth) return;
    const left = el.offsetLeft; // tablist is the offsetParent
    const right = left + el.offsetWidth;
    if (left < list.scrollLeft) list.scrollTo({ left: left - 16, behavior: reduced ? 'auto' : 'smooth' });
    else if (right > list.scrollLeft + list.clientWidth)
      list.scrollTo({ left: right - list.clientWidth + 16, behavior: reduced ? 'auto' : 'smooth' });
  }, [activeIndex, reduced]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    onChange(tabs[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'relative flex items-center gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--line)]',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {tabs.map((tab, index) => {
        const active = index === activeIndex;
        return (
          <button
            key={tab.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active || (activeIndex === -1 && index === 0) ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              'relative flex h-11 shrink-0 select-none items-center gap-2 whitespace-nowrap px-3 text-sm font-semibold',
              'rounded-t-lg transition-colors duration-150 focus-visible:outline-offset-[-3px]',
              active ? 'text-fg' : 'text-fg-3 hover:text-fg-2',
            )}
          >
            {tab.icon !== undefined && tab.icon !== null && (
              <span className={cn('flex items-center [&_svg]:size-4', active && 'text-accent')}>{tab.icon}</span>
            )}
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  'min-w-5 rounded-full px-1.5 py-[3px] text-center text-[11px] font-semibold leading-none tabular transition-colors',
                  active ? 'bg-accent/15 text-accent' : 'bg-surface-3 text-fg-3',
                )}
              >
                {tab.count}
              </span>
            )}
            {active && (
              <motion.span
                layoutId={indicatorId}
                aria-hidden
                transition={reduced ? instant : springSnappy}
                className="absolute inset-x-2 bottom-0 h-[2.5px] rounded-full accent-gradient shadow-[0_0_10px_color-mix(in_oklab,var(--accent)_60%,transparent)]"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
