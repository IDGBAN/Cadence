import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { autoUpdate, flip, FloatingPortal, offset, shift, useFloating } from '@floating-ui/react';
import { AnimatePresence, motion } from 'motion/react';
import type { DayKey, DayStatus } from '@/types';
import { addDays, diffDays, endOfWeek, formatDayShort, MONTH_SHORT, orderedWeekdays, startOfWeek, toDayKey } from '@/lib/dates';
import { formatPercent } from '@/lib/format';
import { cn } from '@/components/ui';
import { useReducedMotion } from '@/store/hooks';

export interface HeatmapCell {
  day: DayKey;
  // 0..1, null = no data
  value: number | null;
  status?: DayStatus;
}

export interface HeatmapProps {
  cells: HeatmapCell[];
  color: string;
  weekStartsOn?: 0 | 1;
  onDayClick?: (day: DayKey) => void;
  tooltip?: (cell: HeatmapCell) => ReactNode;
  cellSize?: number;
  className?: string;
  legend?: boolean;
}

const GAP = 3;
const MONTH_ROW_HEIGHT = 16;
const WEEKDAY_LABEL_WIDTH = 26;
const LEVEL_MIX = [0, 26, 50, 74, 100];

// -1 = no data, 0 = nothing done, 1..4 = intensity
function levelOf(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return -1;
  if (value <= 0) return 0;
  if (value >= 1) return 4;
  return 1 + Math.min(2, Math.floor(value * 3));
}

function levelColor(level: number, color: string): string {
  if (level <= 0) return 'var(--cell-empty)';
  return `color-mix(in oklab, ${color} ${LEVEL_MIX[Math.min(4, level)]}%, var(--cell-empty))`;
}

interface Slot {
  day: DayKey;
  cell: HeatmapCell | null;
}

interface MonthLabel {
  column: number;
  label: string;
}

interface Grid {
  slots: Array<Slot | null>;
  weeks: number;
  months: MonthLabel[];
  firstIndex: number;
  lastIndex: number;
}

function buildGrid(cells: HeatmapCell[], weekStartsOn: 0 | 1): Grid | null {
  if (cells.length === 0) return null;
  const byDay = new Map<DayKey, HeatmapCell>();
  let min: DayKey | undefined;
  let max: DayKey | undefined;
  for (const cell of cells) {
    if (!cell || typeof cell.day !== 'string') continue;
    byDay.set(cell.day, cell);
    if (min === undefined || cell.day < min) min = cell.day;
    if (max === undefined || cell.day > max) max = cell.day;
  }
  if (min === undefined || max === undefined) return null;

  const gridStart = startOfWeek(min, weekStartsOn);
  const gridEnd = endOfWeek(max, weekStartsOn);
  const total = diffDays(gridStart, gridEnd) + 1;
  const weeks = Math.max(1, Math.ceil(total / 7));

  const slots: Array<Slot | null> = new Array(weeks * 7).fill(null);
  let firstIndex = -1;
  let lastIndex = -1;
  let cursor = gridStart;
  for (let i = 0; i < weeks * 7; i++) {
    const inRange = cursor >= min && cursor <= max;
    if (inRange) {
      slots[i] = { day: cursor, cell: byDay.get(cursor) ?? null };
      if (firstIndex < 0) firstIndex = i;
      lastIndex = i;
    }
    cursor = addDays(cursor, 1);
  }

  // skip month labels for runs of a single column so they don't overlap
  const columnMonths: string[] = [];
  let weekStart = gridStart;
  for (let w = 0; w < weeks; w++) {
    columnMonths.push(weekStart.slice(0, 7));
    weekStart = addDays(weekStart, 7);
  }
  const months: MonthLabel[] = [];
  let runStart = 0;
  for (let w = 1; w <= weeks; w++) {
    if (w < weeks && columnMonths[w] === columnMonths[runStart]) continue;
    if (w - runStart >= 2) {
      const month = Number(columnMonths[runStart].slice(5, 7)) - 1;
      months.push({ column: runStart, label: MONTH_SHORT[month] ?? '' });
    }
    runStart = w;
  }

  return { slots, weeks, months, firstIndex, lastIndex };
}

function defaultTooltip(cell: HeatmapCell): ReactNode {
  const day = formatDayShort(cell.day);
  if (cell.status === 'skipped') return `${day} · Skipped`;
  if (cell.value === null || cell.value === undefined) return day;
  return `${day} · ${formatPercent(cell.value)}`;
}

export function Heatmap({
  cells,
  color,
  weekStartsOn = 1,
  onDayClick,
  tooltip,
  cellSize = 13,
  className,
  legend = true,
}: HeatmapProps) {
  const reduced = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef(new Map<number, HTMLElement>());
  const grid = useMemo(() => buildGrid(cells, weekStartsOn), [cells, weekStartsOn]);
  const [hovered, setHovered] = useState<HeatmapCell | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const moveFocus = useRef(false);
  const today = toDayKey(new Date());

  const { refs, floatingStyles } = useFloating({
    open: hovered !== null,
    placement: 'top',
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
  });
  const setPositionReference = refs.setPositionReference;

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollLeft = node.scrollWidth;
  }, [grid]);

  useEffect(() => {
    if (!moveFocus.current || focusIndex === null) return;
    moveFocus.current = false;
    cellRefs.current.get(focusIndex)?.focus();
  }, [focusIndex]);

  const step = cellSize + GAP;

  if (!grid) {
    return (
      <div className={cn('flex h-24 items-center justify-center rounded-xl border border-dashed border-line', className)}>
        <p className="text-xs text-fg-3">No days to show yet.</p>
      </div>
    );
  }

  const { slots, weeks, months, firstIndex, lastIndex } = grid;
  const rovingIndex = focusIndex ?? (lastIndex >= 0 ? lastIndex : firstIndex);

  const seek = (from: number, delta: number): number | null => {
    for (let i = from + delta; i >= 0 && i < slots.length; i += delta) {
      if (slots[i]) return i;
    }
    return null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>, index: number) => {
    const deltas: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 };
    let next: number | null = null;
    if (event.key in deltas) next = seek(index, deltas[event.key]);
    else if (event.key === 'Home') next = firstIndex >= 0 ? firstIndex : null;
    else if (event.key === 'End') next = lastIndex >= 0 ? lastIndex : null;
    else return;
    event.preventDefault();
    if (next === null) return;
    moveFocus.current = true;
    setFocusIndex(next);
  };

  const weekdayLabels = orderedWeekdays(weekStartsOn);

  const show = (cell: HeatmapCell | null, node: HTMLElement | null) => {
    if (!cell || !node) return;
    setPositionReference(node);
    setHovered(cell);
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div
        ref={scrollRef}
        className="scroll-fade-x -mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]"
        onMouseLeave={() => setHovered(null)}
      >
        <div className="flex w-max gap-2">
          <div
            aria-hidden
            className="flex shrink-0 flex-col"
            style={{ paddingTop: MONTH_ROW_HEIGHT, width: WEEKDAY_LABEL_WIDTH }}
          >
            {weekdayLabels.map(([weekday, label], row) => (
              <div
                key={weekday}
                className="flex items-center text-[10px] font-medium leading-none text-fg-4"
                style={{ height: cellSize, marginBottom: row === 6 ? 0 : GAP }}
              >
                {row % 2 === 1 ? label : ''}
              </div>
            ))}
          </div>

          <div className="min-w-0">
            <div className="relative" style={{ height: MONTH_ROW_HEIGHT, width: weeks * step - GAP }} aria-hidden>
              {months.map((month) => (
                <span
                  key={`${month.label}-${month.column}`}
                  className="absolute top-0 text-[10px] font-semibold leading-none text-fg-3"
                  style={{ left: month.column * step }}
                >
                  {month.label}
                </span>
              ))}
            </div>

            <div className="flex" style={{ gap: GAP }}>
              {Array.from({ length: weeks }, (_w, week) => (
                <div key={week} className="flex flex-col" style={{ gap: GAP }}>
                  {Array.from({ length: 7 }, (_d, row) => {
                    const index = week * 7 + row;
                    const slot = slots[index];
                    if (!slot) {
                      return <span key={row} style={{ width: cellSize, height: cellSize }} aria-hidden />;
                    }
                    const cell: HeatmapCell = slot.cell ?? { day: slot.day, value: null };
                    const level = levelOf(cell.value);
                    const isFuture = cell.status === 'future' || (!cell.status && slot.day > today);
                    const skipped = cell.status === 'skipped';
                    const missed = cell.status === 'missed';
                    const label = `${formatDayShort(slot.day)}${
                      cell.value === null || cell.value === undefined ? '' : `: ${formatPercent(cell.value)}`
                    }`;
                    const commonProps = {
                      ref: (node: HTMLElement | null) => {
                        if (node) cellRefs.current.set(index, node);
                        else cellRefs.current.delete(index);
                      },
                      className: cn(
                        'relative rounded-[3px] transition-[transform,box-shadow] duration-150',
                        skipped && 'stripes',
                        isFuture && 'opacity-40',
                        onDayClick && 'cursor-pointer hover:scale-[1.22] focus-visible:outline-offset-1',
                      ),
                      style: {
                        width: cellSize,
                        height: cellSize,
                        background: skipped ? 'var(--cell-empty)' : levelColor(level, color),
                        opacity: level < 0 && !isFuture ? 0.55 : undefined,
                        boxShadow: missed
                          ? 'inset 0 0 0 1px color-mix(in oklab, var(--danger) 34%, transparent)'
                          : level >= 3
                            ? `0 0 0 1px color-mix(in oklab, ${color} 26%, transparent)`
                            : 'inset 0 0 0 1px color-mix(in oklab, var(--fg) 5%, transparent)',
                      },
                      onMouseEnter: (event: { currentTarget: HTMLElement }) => show(cell, event.currentTarget),
                      onFocus: (event: { currentTarget: HTMLElement }) => show(cell, event.currentTarget),
                      onBlur: () => setHovered(null),
                    };

                    if (!onDayClick) {
                      return <span key={row} {...commonProps} role="img" aria-label={label} tabIndex={-1} />;
                    }
                    return (
                      <button
                        key={row}
                        type="button"
                        aria-label={label}
                        tabIndex={index === rovingIndex ? 0 : -1}
                        onClick={() => onDayClick(slot.day)}
                        onKeyDown={(event) => onKeyDown(event, index)}
                        {...commonProps}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {legend && (
        <div className="flex items-center justify-end gap-1.5 pr-1 text-[10px] font-medium text-fg-4">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <span
              key={level}
              aria-hidden
              className="rounded-[3px]"
              style={{
                width: cellSize - 2,
                height: cellSize - 2,
                background: levelColor(level, color),
                boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--fg) 5%, transparent)',
              }}
            />
          ))}
          <span>More</span>
        </div>
      )}

      <AnimatePresence>
        {hovered && (
          <FloatingPortal>
            <div ref={refs.setFloating} style={floatingStyles} className="pointer-events-none z-[100]">
              <motion.div
                initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 3 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: reduced ? 1 : 0.96, transition: { duration: 0.08 } }}
                transition={{ duration: 0.13, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  'max-w-[16rem] rounded-lg border border-line-strong bg-surface-3 px-2.5 py-1.5 text-xs font-semibold leading-snug text-fg shadow-pop',
                  'light:border-line light:bg-surface',
                )}
              >
                {tooltip ? tooltip(hovered) : defaultTooltip(hovered)}
              </motion.div>
            </div>
          </FloatingPortal>
        )}
      </AnimatePresence>
    </div>
  );
}
