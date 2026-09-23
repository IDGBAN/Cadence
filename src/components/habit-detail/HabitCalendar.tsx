import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AppData, DayCell, DayKey, DayStatus, Habit } from '@/types';
import type { EngineCtx } from '@/lib/habitMath';
import { dayCells } from '@/lib/habitMath';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  formatDayLong,
  formatMonthYear,
  orderedWeekdays,
  startOfMonth,
  startOfWeek,
} from '@/lib/dates';
import { formatPercent, formatValueCompact } from '@/lib/format';
import { habitStyle } from '@/lib/colors';
import { Button, IconButton, cn } from '@/components/ui';
import { useUI } from '@/store/ui';
import { STATUS_LABELS, statusCellClass, statusSwatchClass } from './shared';

export interface HabitCalendarProps {
  habit: Habit;
  data: AppData;
  ctx: EngineCtx;
  weekStartsOn: 0 | 1;
}

const LEGEND_ORDER: DayStatus[] = ['done', 'partial', 'logged', 'missed', 'skipped', 'pending', 'notDue'];

interface MonthGrid {
  cells: DayCell[];
  monthStart: DayKey;
  monthEnd: DayKey;
  counts: Record<string, number>;
  inMonth: number;
  legend: DayStatus[];
}

function buildMonth(habit: Habit, data: AppData, ctx: EngineCtx, view: DayKey, weekStartsOn: 0 | 1): MonthGrid {
  const monthStart = startOfMonth(view);
  const monthEnd = endOfMonth(view);
  const gridStart = startOfWeek(monthStart, weekStartsOn);
  const gridEnd = endOfWeek(monthEnd, weekStartsOn);
  const cells = dayCells(habit, data, gridStart, gridEnd, ctx);

  const counts: Record<string, number> = {};
  let inMonth = 0;
  const present = new Set<DayStatus>();
  for (const cell of cells) {
    if (cell.day < monthStart || cell.day > monthEnd) continue;
    inMonth++;
    counts[cell.status] = (counts[cell.status] ?? 0) + 1;
    present.add(cell.status);
  }
  return {
    cells,
    monthStart,
    monthEnd,
    counts,
    inMonth,
    legend: LEGEND_ORDER.filter((status) => present.has(status)),
  };
}

export function HabitCalendar({ habit, data, ctx, weekStartsOn }: HabitCalendarProps) {
  const openLogEditor = useUI((s) => s.openLogEditor);
  const [view, setView] = useState<DayKey>(() => startOfMonth(ctx.today));
  const [focusDay, setFocusDay] = useState<DayKey | null>(null);
  const cellRefs = useRef(new Map<DayKey, HTMLButtonElement>());
  const pendingFocus = useRef(false);

  const grid = useMemo(() => buildMonth(habit, data, ctx, view, weekStartsOn), [habit, data, ctx, view, weekStartsOn]);
  const weekdays = orderedWeekdays(weekStartsOn);
  const thisMonth = startOfMonth(ctx.today);
  const showsToday = grid.monthStart <= ctx.today && ctx.today <= grid.monthEnd;

  useEffect(() => {
    if (!pendingFocus.current || !focusDay) return;
    pendingFocus.current = false;
    cellRefs.current.get(focusDay)?.focus();
  }, [focusDay, view]);

  const clickable = (cell: DayCell) => cell.day <= ctx.today;
  const firstClickable = grid.cells.findIndex((cell) => cell.day >= grid.monthStart && clickable(cell));
  const todayIndex = grid.cells.findIndex((cell) => cell.day === ctx.today);
  const focusIndex = focusDay ? grid.cells.findIndex((cell) => cell.day === focusDay) : -1;
  const rovingIndex = focusIndex >= 0 ? focusIndex : todayIndex >= 0 ? todayIndex : firstClickable;

  const goto = (next: DayKey) => {
    setView(startOfMonth(next));
    setFocusDay(null);
  };

  const moveTo = (day: DayKey) => {
    const target = day > ctx.today ? ctx.today : day;
    pendingFocus.current = true;
    if (target < grid.monthStart || target > grid.monthEnd) setView(startOfMonth(target));
    setFocusDay(target);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, cell: DayCell) => {
    const deltas: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (event.key in deltas) {
      event.preventDefault();
      moveTo(addDays(cell.day, deltas[event.key]));
      return;
    }
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      moveTo(addMonths(cell.day, event.key === 'PageUp' ? -1 : 1));
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      moveTo(event.key === 'Home' ? startOfWeek(cell.day, weekStartsOn) : endOfWeek(cell.day, weekStartsOn));
    }
  };

  const rate =
    (grid.counts.done ?? 0) + (grid.counts.missed ?? 0) + (grid.counts.partial ?? 0) > 0
      ? (grid.counts.done ?? 0) / ((grid.counts.done ?? 0) + (grid.counts.missed ?? 0) + (grid.counts.partial ?? 0))
      : null;

  return (
    <section className="card p-3 sm:p-5" style={habitStyle(habit.color)} aria-label={`${habit.name} calendar`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold leading-tight tracking-tight text-fg sm:text-lg">
            {formatMonthYear(grid.monthStart)}
          </h2>
          <p className="mt-0.5 text-xs text-fg-3">
            {rate === null
              ? 'Tap a day to log or edit it'
              : `${grid.counts.done ?? 0} done · ${formatPercent(rate)} success rate`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => goto(thisMonth)}
            disabled={grid.monthStart === thisMonth}
          >
            This month
          </Button>
          <IconButton label="Previous month" variant="secondary" size="sm" onClick={() => goto(addMonths(view, -1))}>
            <ChevronLeft />
          </IconButton>
          <IconButton
            label="Next month"
            variant="secondary"
            size="sm"
            onClick={() => goto(addMonths(view, 1))}
            disabled={grid.monthEnd >= ctx.today}
          >
            <ChevronRight />
          </IconButton>
        </div>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1 sm:gap-1.5" aria-hidden>
        {weekdays.map(([index, label]) => (
          <div key={index} className="pb-1 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-4">
            {label}
          </div>
        ))}
      </div>

      {/* no row elements, so this can't be role=grid. each button carries its own label */}
      <div
        className="grid grid-cols-7 gap-1 sm:gap-1.5"
        role="group"
        aria-label={`Days in ${formatMonthYear(grid.monthStart)}. Arrow keys move, Enter opens the log`}
      >
        {grid.cells.map((cell, index) => {
          const outside = cell.day < grid.monthStart || cell.day > grid.monthEnd;
          const isToday = cell.day === ctx.today;
          const value = formatValueCompact(habit, cell.value);
          const dayNumber = Number(cell.day.slice(8, 10));
          const disabled = !clickable(cell);
          const partial = cell.progress > 0 && cell.progress < 1 && !disabled;

          return (
            <button
              key={cell.day}
              ref={(node) => {
                if (node) cellRefs.current.set(cell.day, node);
                else cellRefs.current.delete(cell.day);
              }}
              type="button"
              disabled={disabled}
              tabIndex={index === rovingIndex ? 0 : -1}
              onClick={() => openLogEditor(habit.id, cell.day)}
              onKeyDown={(event) => onKeyDown(event, cell)}
              onFocus={() => setFocusDay(cell.day)}
              aria-label={`${formatDayLong(cell.day)}: ${STATUS_LABELS[cell.status]}${value ? `, ${value}` : ''}`}
              className={cn(
                'relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 overflow-hidden rounded-xl border',
                'transition-[transform,background-color,border-color] duration-150 sm:min-h-[64px]',
                statusCellClass(cell.status),
                outside && 'opacity-35',
                disabled ? 'cursor-default' : 'hover:scale-[1.04] hover:border-line-strong active:scale-[0.97]',
                isToday && 'ring-2 ring-[color-mix(in_oklab,var(--habit)_70%,transparent)] ring-offset-2 ring-offset-surface',
              )}
            >
              <span className={cn('text-[11px] font-semibold leading-none tabular', isToday && 'habit-text')}>
                {dayNumber}
              </span>
              {value ? (
                <span className="max-w-full truncate px-1 text-[11px] font-semibold leading-none tabular sm:text-xs">
                  {value}
                </span>
              ) : (
                cell.status === 'missed' && <span className="text-[11px] leading-none text-fg-4">·</span>
              )}
              {partial && (
                <span aria-hidden className="absolute inset-x-1 bottom-1 h-[3px] overflow-hidden rounded-full bg-surface-3">
                  <span className="block h-full habit-fill" style={{ width: `${Math.round(cell.progress * 100)}%` }} />
                </span>
              )}
              {cell.note && <span aria-hidden className="absolute right-1 top-1 size-1.5 rounded-full habit-fill opacity-80" />}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {grid.legend.map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-fg-3">
            <span aria-hidden className={cn('size-2.5 shrink-0 rounded-[4px]', statusSwatchClass(status))} />
            {STATUS_LABELS[status]}
          </span>
        ))}
        {showsToday && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-fg-3">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-[4px] ring-2 ring-[color-mix(in_oklab,var(--habit)_70%,transparent)]"
            />
            Today
          </span>
        )}
      </div>
    </section>
  );
}
