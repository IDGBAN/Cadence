import type { ReactNode } from 'react';
import { ChartNoAxesColumn } from 'lucide-react';
import { cn } from '@/components/ui';

export interface ChartCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  height?: number;
  empty?: boolean;
  emptyLabel?: ReactNode;
}

const present = (node: ReactNode): boolean => node !== null && node !== undefined && node !== false && node !== '';

export function ChartCard({
  title,
  subtitle,
  action,
  children,
  className,
  height = 220,
  empty = false,
  emptyLabel,
}: ChartCardProps) {
  return (
    <section className={cn('card flex min-w-0 flex-col p-4 sm:p-5', className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[15px] font-semibold leading-tight tracking-tight text-fg sm:text-base">
            {title}
          </h3>
          {present(subtitle) && <p className="mt-1 text-xs leading-relaxed text-fg-3">{subtitle}</p>}
        </div>
        {present(action) && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
      <div className="relative min-w-0" style={{ height }}>
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line px-4 text-center">
            <ChartNoAxesColumn className="size-5 text-fg-4" aria-hidden />
            <p className="text-xs text-fg-3">{emptyLabel ?? 'Not enough data yet.'}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

export interface ChartTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ name?: string | number; value?: unknown; color?: string; dataKey?: unknown; payload?: unknown }>;
  label?: string | number;
  labelFormatter?: (label: string | number | undefined, payload: unknown) => ReactNode;
  valueFormatter?: (value: number, name: string, item: unknown) => ReactNode;
  hideEmpty?: boolean;
}

export function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
  hideEmpty = true,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const rows = payload.filter((item) => {
    if (!hideEmpty) return true;
    return item.value !== null && item.value !== undefined && item.value !== '';
  });
  if (rows.length === 0) return null;

  const heading = labelFormatter ? labelFormatter(label, payload) : label;

  return (
    <div className="glass pointer-events-none min-w-[8.5rem] max-w-[15rem] rounded-xl px-3 py-2 shadow-pop">
      {present(heading) && (
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3">{heading}</div>
      )}
      <ul className="flex flex-col gap-1">
        {rows.map((item, index) => {
          const name = typeof item.name === 'string' ? item.name : String(item.name ?? '');
          const numeric = typeof item.value === 'number' ? item.value : Number(item.value);
          const formatted =
            valueFormatter && Number.isFinite(numeric)
              ? valueFormatter(numeric, name, item)
              : String(item.value ?? '');
          return (
            <li key={`${name}-${index}`} className="flex items-center justify-between gap-3 text-xs">
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: item.color ?? 'var(--accent)' }}
                />
                <span className="truncate text-fg-3">{name}</span>
              </span>
              <span className="shrink-0 font-semibold text-fg tabular">{formatted}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export interface RangeOption {
  value: string;
  label: string;
  // null = all time
  days: number | null;
}
export const RANGE_OPTIONS: RangeOption[] = [
  { value: '7d', label: '7D', days: 7 },
  { value: '30d', label: '30D', days: 30 },
  { value: '90d', label: '90D', days: 90 },
  { value: '1y', label: '1Y', days: 365 },
  { value: 'all', label: 'All', days: null },
];

export function LegendItem({
  color,
  label,
  shape = 'dot',
}: {
  color: string;
  label: ReactNode;
  shape?: 'dot' | 'square' | 'line' | 'stripes';
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium text-fg-3">
      <span
        aria-hidden
        className={cn(
          'shrink-0',
          shape === 'dot' && 'size-2 rounded-full',
          shape === 'square' && 'size-2.5 rounded-[3px]',
          shape === 'stripes' && 'stripes size-2.5 rounded-[3px] border border-line-strong',
          shape === 'line' && 'h-0.5 w-4 rounded-full',
        )}
        style={shape === 'stripes' ? undefined : { background: color }}
      />
      {label}
    </span>
  );
}
