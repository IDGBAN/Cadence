import type { ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { cn } from '../cn';

export type FieldSize = 'sm' | 'md' | 'lg';

export const controlBase = cn(
  'relative flex w-full items-center border border-line bg-surface-2 text-fg',
  'shadow-[inset_0_1px_2px_rgb(0_0_0/0.12)] light:shadow-[inset_0_1px_2px_rgb(17_20_39/0.04)]',
  'transition-[border-color,box-shadow,background-color] duration-150 ease-out',
  'hover:border-line-strong',
  'focus-within:border-[color-mix(in_oklab,var(--accent)_65%,var(--line-strong))] focus-within:ring-4 focus-within:ring-accent/15',
);

export const controlInvalid = cn(
  'border-[color-mix(in_oklab,var(--danger)_60%,var(--line))] hover:border-[color-mix(in_oklab,var(--danger)_75%,var(--line))]',
  'focus-within:border-danger focus-within:ring-danger/15',
);

export const controlDisabled = 'pointer-events-none opacity-50';

export const controlSizes: Record<FieldSize, string> = {
  sm: 'h-8 rounded-[10px] text-sm',
  md: 'h-10 rounded-xl text-sm',
  lg: 'h-12 rounded-[14px] text-base',
};

// 16px text on touch screens stops iOS from zooming in on focus
export const nativeInputClass =
  'h-full w-full min-w-0 bg-transparent text-fg outline-none placeholder:text-fg-4 focus-visible:outline-none disabled:cursor-not-allowed pointer-coarse:text-base';

export function FieldLabel({ htmlFor, id, children, className }: { htmlFor?: string; id?: string; children: ReactNode; className?: string }) {
  return (
    <label htmlFor={htmlFor} id={id} className={cn('mb-1.5 block text-[13px] font-medium text-fg-2', className)}>
      {children}
    </label>
  );
}

export function FieldMessage({ id, hint, error }: { id: string; hint?: ReactNode; error?: ReactNode }) {
  if (error !== undefined && error !== null && error !== false && error !== '') {
    return (
      <p id={id} className="mt-1.5 flex items-start gap-1.5 text-xs font-medium leading-snug text-danger">
        <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>{error}</span>
      </p>
    );
  }
  if (hint !== undefined && hint !== null && hint !== false && hint !== '') {
    return (
      <p id={id} className="mt-1.5 text-xs leading-snug text-fg-3">
        {hint}
      </p>
    );
  }
  return null;
}

export function hasContent(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false && node !== '';
}
