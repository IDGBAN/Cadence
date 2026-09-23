import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import clsx from 'clsx';

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}

const present = (node: ReactNode): boolean => node !== null && node !== undefined && node !== false && node !== '';

export function PageHeader({ title, subtitle, eyebrow, actions, className, children }: PageHeaderProps) {
  return (
    <header className={clsx('mb-6 md:mb-8', className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0">
          {present(eyebrow) && <div className="eyebrow mb-2 flex items-center gap-2">{eyebrow}</div>}
          <h1 className="font-display text-3xl font-semibold leading-[1.1] tracking-tight text-balance text-fg md:text-4xl">
            {title}
          </h1>
          {present(subtitle) && (
            <div className="mt-2 max-w-2xl text-sm leading-relaxed text-pretty text-fg-3 md:text-[15px]">{subtitle}</div>
          )}
        </div>
        {present(actions) && (
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">{actions}</div>
        )}
      </div>
      {present(children) && <div className="mt-5 md:mt-6">{children}</div>}
    </header>
  );
}

export interface PageProps {
  children: ReactNode;
  width?: 'narrow' | 'default' | 'wide';
  className?: string;
}

const WIDTHS: Record<NonNullable<PageProps['width']>, string> = {
  narrow: 'max-w-3xl',
  default: 'max-w-5xl',
  wide: 'max-w-7xl',
};

// the padding clears the mobile top bar and tab bar. motion settles the transform to `none`,
// so position: fixed children aren't trapped once the entrance finishes
export function Page({ children, width = 'default', className }: PageProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      className={clsx(
        'mx-auto w-full px-4 sm:px-6 lg:px-10',
        'pt-[calc(env(safe-area-inset-top)+4.75rem)] pb-[calc(env(safe-area-inset-bottom)+7rem)]',
        'md:pt-10 md:pb-16 lg:pt-12',
        WIDTHS[width],
        className,
      )}
    >
      {children}
    </motion.div>
  );
}
