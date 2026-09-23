import type { ReactElement, Ref } from 'react';
import type { Placement as FloatingPlacement } from '@floating-ui/react';

export type Placement = 'top' | 'bottom' | 'left' | 'right' | 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end';

// app chrome stays below 60
export const Z = {
  modal: 'z-[70]',
  popover: 'z-[80]',
  toast: 'z-[90]',
  tooltip: 'z-[100]',
} as const;

export type TriggerProps = Record<string, unknown> & { ref?: Ref<HTMLElement> };

// React 19 passes ref as a regular prop
export function triggerPropsOf(el: ReactElement): TriggerProps {
  return (el.props ?? {}) as TriggerProps;
}

export function originFor(placement: FloatingPlacement): string {
  const [side, align] = placement.split('-') as [string, string | undefined];
  const cross = align === 'start' ? 'left' : align === 'end' ? 'right' : 'center';
  const crossY = align === 'start' ? 'top' : align === 'end' ? 'bottom' : 'center';
  switch (side) {
    case 'top':
      return `${cross} bottom`;
    case 'bottom':
      return `${cross} top`;
    case 'left':
      return `right ${crossY}`;
    default:
      return `left ${crossY}`;
  }
}

export function enterOffsetFor(placement: FloatingPlacement, distance = 4): { x: number; y: number } {
  const side = placement.split('-')[0];
  if (side === 'top') return { x: 0, y: distance };
  if (side === 'bottom') return { x: 0, y: -distance };
  if (side === 'left') return { x: distance, y: 0 };
  return { x: -distance, y: 0 };
}

export const floatingPanelClass =
  'rounded-2xl border border-line-strong bg-surface-2 shadow-pop outline-none light:border-line light:bg-surface';
