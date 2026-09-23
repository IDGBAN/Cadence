import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { DayKey } from '@/types';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  formatDayLong,
  fromDayKey,
  MONTH_LONG,
  orderedWeekdays,
  startOfMonth,
  startOfWeek,
  toDayKey,
  WEEKDAY_LONG,
} from '@/lib/dates';
import { cn } from './cn';
import { Button, IconButton } from './Button';
import { easeOut, useReducedMotionPref } from './motion';

export interface MiniCalendarProps {
  value: DayKey;
  onChange: (day: DayKey) => void;
  max?: DayKey;
  min?: DayKey;
  weekStartsOn?: 0 | 1;
  /** 0-1 completion, drawn as a small ring under the number. */
  dayProgress?: (day: DayKey) => number | null;
  className?: string;
  /** Defaults to `max` when that's before the calendar date. */
  today?: DayKey;
}

export function MiniCalendar({
  value,
  onChange,
  max,
  min,
  weekStartsOn = 1,
  dayProgress,
  className,
  today: todayProp,
}: MiniCalendarProps) {
  const reduced = useReducedMotionPref();
  const calendarToday = toDayKey(new Date());
  const today = todayProp ?? (max && max < calendarToday ? max : calendarToday);

  const [view, setView] = useState(() => startOfMonth(value));
  const [direction, setDirection] = useState(0);
  const [focusDay, setFocusDay] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  const gridRef = useRef<HTMLDivElement>(null);
  const keyboardNav = useRef(false);

  if (prevValue !== value) {
    setPrevValue(value);
    setFocusDay(value);
    const month = startOfMonth(value);
    if (month !== view) {
      setDirection(month > view ? 1 : -1);
      setView(month);
    }
  }

  const isDisabled = (day: DayKey) => Boolean((max && day > max) || (min && day < min));
  const clampDay = (day: DayKey) => (max && day > max ? max : min && day < min ? min : day);

  const showMonth = (month: DayKey) => {
    if (month === view) return;
    setDirection(month > view ? 1 : -1);
    setView(month);
  };

  const canPrev = !min || endOfMonth(addMonths(view, -1)) >= min;
  const canNext = !max || addMonths(view, 1) <= max;

  const goMonth = (delta: number) => {
    const month = addMonths(view, delta);
    showMonth(month);
    const target = clampDay(addMonths(focusDay, delta));
    if (startOfMonth(target) === month) setFocusDay(target);
  };

  const goToday = () => {
    showMonth(startOfMonth(today));
    setFocusDay(today);
    if (!isDisabled(today) && today !== value) onChange(today);
  };

  useEffect(() => {
    if (!keyboardNav.current) return;
    keyboardNav.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-view="${view}"] [data-day="${focusDay}"]`)?.focus();
  }, [focusDay, view]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>, day: DayKey) => {
    let next: DayKey | null = null;
    switch (e.key) {
      case 'ArrowLeft':
        next = addDays(day, -1);
        break;
      case 'ArrowRight':
        next = addDays(day, 1);
        break;
      case 'ArrowUp':
        next = addDays(day, -7);
        break;
      case 'ArrowDown':
        next = addDays(day, 7);
        break;
      case 'Home':
        next = startOfWeek(day, weekStartsOn);
        break;
      case 'End':
        next = endOfWeek(day, weekStartsOn);
        break;
      case 'PageUp':
        next = addMonths(day, e.shiftKey ? -12 : -1);
        break;
      case 'PageDown':
        next = addMonths(day, e.shiftKey ? 12 : 1);
        break;
      default:
        return;
    }
    e.preventDefault();
    const target = clampDay(next);
    keyboardNav.current = true;
    setFocusDay(target);
    showMonth(startOfMonth(target));
  };

  const firstCell = startOfWeek(view, weekStartsOn);
  const days = Array.from({ length: 42 }, (_, i) => addDays(firstCell, i));
  const weeks = Array.from({ length: 6 }, (_, w) => days.slice(w * 7, w * 7 + 7));
  const viewDate = fromDayKey(view);
  const monthPrefix = view.slice(0, 7);

  // roving tabindex: one tabbable day in the grid
  const inGrid = (d: DayKey) => d >= days[0] && d <= days[41];
  const tabbableDay = inGrid(focusDay)
    ? focusDay
    : inGrid(value)
      ? value
      : (days.find((d) => d.startsWith(monthPrefix) && !isDisabled(d)) ?? view);

  return (
    <div className={cn('w-full select-none', className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-1.5 pl-1" aria-live="polite">
          <span className="truncate font-display text-base font-semibold tracking-tight text-fg">
            {MONTH_LONG[viewDate.getMonth()]}
          </span>
          <span className="font-display text-base font-medium text-fg-3 tabular">{viewDate.getFullYear()}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            size="xs"
            variant="ghost"
            onClick={goToday}
            disabled={value === today && view === startOfMonth(today)}
            className="mr-1"
          >
            Today
          </Button>
          <IconButton label="Previous month" size="sm" tooltip={false} disabled={!canPrev} onClick={() => goMonth(-1)}>
            <ChevronLeft />
          </IconButton>
          <IconButton label="Next month" size="sm" tooltip={false} disabled={!canNext} onClick={() => goMonth(1)}>
            <ChevronRight />
          </IconButton>
        </div>
      </div>

      <div className="grid grid-cols-7 pb-1" aria-hidden>
        {orderedWeekdays(weekStartsOn).map(([index, short]) => (
          <abbr
            key={index}
            title={WEEKDAY_LONG[index]}
            className="py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-fg-4 no-underline"
          >
            {short.slice(0, 1)}
          </abbr>
        ))}
      </div>

      <div ref={gridRef} className="relative overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout" custom={direction}>
          <motion.div
            key={view}
            data-view={view}
            role="grid"
            aria-label={`${MONTH_LONG[viewDate.getMonth()]} ${viewDate.getFullYear()}`}
            custom={direction}
            variants={{
              enter: (d: number) => (reduced ? { opacity: 0 } : { opacity: 0, x: d * 28 }),
              center: { opacity: 1, x: 0 },
              exit: (d: number) => (reduced ? { opacity: 0 } : { opacity: 0, x: d * -28 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: reduced ? 0.1 : 0.24, ease: easeOut }}
            className="flex flex-col gap-0.5"
          >
            {weeks.map((week) => (
              <div key={week[0]} role="row" className="grid grid-cols-7 gap-0.5">
                {week.map((day) => {
                  const inMonth = day.startsWith(monthPrefix);
                  const selected = day === value;
                  const isToday = day === today;
                  const disabled = isDisabled(day);
                  const progress = dayProgress && !disabled ? dayProgress(day) : null;
                  return (
                    <div key={day} role="gridcell" aria-selected={selected}>
                      <button
                        type="button"
                        data-day={day}
                        tabIndex={day === tabbableDay ? 0 : -1}
                        disabled={disabled}
                        aria-label={formatDayLong(day)}
                        aria-current={isToday ? 'date' : undefined}
                        onClick={() => {
                          setFocusDay(day);
                          if (!inMonth) showMonth(startOfMonth(day));
                          if (day !== value) onChange(day);
                        }}
                        onKeyDown={(e) => onKeyDown(e, day)}
                        className={cn(
                          'relative flex h-10 w-full flex-col items-center justify-center gap-[3px] rounded-xl text-sm tabular',
                          'transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-offset-0',
                          selected
                            ? cn(
                                'accent-gradient font-semibold text-accent-fg',
                                'shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_6px_16px_-8px_color-mix(in_oklab,var(--accent)_85%,transparent)]',
                              )
                            : disabled
                              ? 'cursor-not-allowed text-fg-4/60'
                              : cn(
                                  'hover:bg-surface-2 light:hover:bg-surface-3',
                                  inMonth ? 'font-medium text-fg-2 hover:text-fg' : 'text-fg-4 hover:text-fg-3',
                                  isToday && 'font-semibold text-accent shadow-[inset_0_0_0_1.5px_color-mix(in_oklab,var(--accent)_45%,transparent)] hover:text-accent',
                                ),
                        )}
                      >
                        <span className="leading-none">{fromDayKey(day).getDate()}</span>
                        {progress !== null && progress !== undefined && Number.isFinite(progress) && (
                          <DayProgressMark value={progress} selected={selected} faded={!inMonth} />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function DayProgressMark({ value, selected, faded }: { value: number; selected: boolean; faded: boolean }) {
  const v = Math.max(0, Math.min(1, value));
  const color = selected ? 'var(--accent-fg)' : v >= 1 ? 'var(--success)' : 'var(--accent)';
  if (v >= 1) {
    return (
      <span
        aria-hidden
        className={cn('block size-[6px] rounded-full', faded && 'opacity-50')}
        style={{ background: color, boxShadow: selected ? undefined : `0 0 6px ${color}` }}
      />
    );
  }
  if (v <= 0) {
    return (
      <span
        aria-hidden
        className={cn('block size-[5px] rounded-full', faded && 'opacity-50')}
        style={{ background: selected ? 'color-mix(in oklab, var(--accent-fg) 45%, transparent)' : 'var(--line-strong)' }}
      />
    );
  }
  const size = 9;
  const stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg aria-hidden width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn('-rotate-90', faded && 'opacity-50')}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        style={{ stroke: selected ? 'color-mix(in oklab, var(--accent-fg) 35%, transparent)' : 'var(--line-strong)' }}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * v} ${c}`}
        style={{ stroke: color }}
      />
    </svg>
  );
}
