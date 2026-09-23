import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/components/ui';
import { useReducedMotion } from '@/store/hooks';

export interface TodaySectionProps {
  // plain text because it also labels the section landmark
  title: string;
  icon?: ReactNode;
  meta?: ReactNode;
  // passing this (with onToggle) makes the header a disclosure button
  collapsed?: boolean;
  onToggle?: () => void;
  children: ReactNode;
  className?: string;
}

export function TodaySection({ title, icon, meta, collapsed, onToggle, children, className }: TodaySectionProps) {
  const reduced = useReducedMotion();
  const collapsible = collapsed !== undefined && onToggle !== undefined;
  const open = !collapsible || !collapsed;

  const header = (
    <>
      {icon !== undefined && icon !== null && (
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-sm leading-none [&_svg]:size-4"
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 truncate font-display text-sm font-semibold tracking-tight text-fg-2">{title}</span>
      {collapsible && (
        <ChevronDown
          aria-hidden
          className={cn('size-4 shrink-0 text-fg-3 transition-transform duration-200', !collapsed && 'rotate-180')}
        />
      )}
      {meta !== undefined && meta !== null && (
        <span className="ml-auto shrink-0 text-xs text-fg-3 tabular">{meta}</span>
      )}
    </>
  );

  return (
    <section aria-label={title} className={cn('flex flex-col gap-2.5', className)}>
      {collapsible ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className={cn(
            'flex w-full items-center gap-2 rounded-xl px-1 py-1.5 text-left transition-colors hover:bg-surface-2',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          )}
        >
          {header}
        </button>
      ) : (
        <div className="flex items-center gap-2 px-1">{header}</div>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={reduced || !collapsible ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
