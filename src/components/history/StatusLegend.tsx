import type { CSSProperties } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/components/ui';
import { LEGEND, statusBox } from './cellVisual';

// no habit here, so swatches borrow the accent color
const SWATCH_STYLE = { ['--habit' as string]: 'var(--accent)' } as CSSProperties;

export function StatusLegend({ className }: { className?: string }) {
  return (
    <div className={cn('scroll-fade-x -mx-1 overflow-x-auto px-1', className)}>
      <ul className="flex w-max items-center gap-x-4 gap-y-2 py-1 sm:w-auto sm:flex-wrap">
        {LEGEND.map((item) => (
          <li key={item.status} className="flex shrink-0 items-center gap-1.5" title={item.description}>
            <span
              aria-hidden
              style={SWATCH_STYLE}
              className={cn(
                'relative flex size-4 items-center justify-center overflow-hidden rounded-[5px] border',
                statusBox(item.status),
              )}
            >
              {item.status === 'partial' && (
                <span className="habit-fill absolute inset-x-0 bottom-0 h-1/2 opacity-45" />
              )}
              {item.status === 'done' && <Check className="relative size-2.5" strokeWidth={4} />}
              {item.status === 'notDue' && <span className="relative size-1 rounded-full bg-fg-4/60" />}
            </span>
            <span className="whitespace-nowrap text-[11px] font-medium text-fg-3">{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
