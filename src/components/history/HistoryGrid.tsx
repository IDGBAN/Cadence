import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Link } from 'react-router-dom';
import { Check, Pencil, X } from 'lucide-react';
import type { DayCell, DayKey, Habit } from '@/types';
import { habitStyle } from '@/lib/colors';
import { formatDayShort, fromDayKey, WEEKDAY_SHORT } from '@/lib/dates';
import { haptic } from '@/lib/feedback';
import { toggleCheckWithFeedback, undoAction } from '@/lib/logActions';
import { getData } from '@/store/store';
import { useUI, toast } from '@/store/ui';
import { EMOJI_FONT } from '@/components/ui/hooks';
import { HabitIcon, ProgressBar, cn } from '@/components/ui';
import { cellLabel, cellText, cellVisual } from './cellVisual';
import type { GridModel, RowSummary } from './model';

export interface HistoryGridProps {
  model: GridModel;
  view: 'week' | 'month';
  today: DayKey;
}

const TEMPLATES = {
  week: { habit: 'minmax(8rem,1.7fr)', day: 'minmax(2.5rem,1fr)', total: '5.25rem' },
  month: { habit: '10rem', day: '2.5rem', total: '5.25rem' },
} as const;

const LONG_PRESS_MS = 480;

const clamp = (n: number, min: number, max: number) => (n < min ? min : n > max ? max : n);

function toggleFromGrid(habit: Habit, day: DayKey, source: Element | null): void {
  const before = getData();
  toggleCheckWithFeedback(habit.id, day, source);
  const after = getData();
  if (after === before) return;
  const done = (after.logs[habit.id]?.[day]?.value ?? 0) > 0;
  toast({
    title: done ? `${habit.name} done` : `${habit.name} cleared`,
    description: formatDayShort(day),
    tone: done ? 'success' : 'default',
    icon: habit.icon,
    action: undoAction(),
  });
}

interface GridCellProps {
  habit: Habit;
  cell: DayCell;
  row: number;
  col: number;
  tabbable: boolean;
  isToday: boolean;
  isWeekend: boolean;
  dense: boolean;
  register: (key: string, el: HTMLButtonElement | null) => void;
}

function GridCell({ habit, cell, row, col, tabbable, isToday, isWeekend, dense, register }: GridCellProps) {
  const openLogEditor = useUI((s) => s.openLogEditor);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);

  const visual = cellVisual(habit, cell);
  const readOnly = cell.status === 'future';
  const isCheckToggle = habit.type === 'check' && !readOnly;
  const label = cellLabel(habit, cell);

  const openEditor = useCallback(() => openLogEditor(habit.id, cell.day), [openLogEditor, habit.id, cell.day]);

  const cancelPress = () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  useEffect(() => cancelPress, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== 'touch' || readOnly) return;
    suppressClick.current = false;
    cancelPress();
    timerRef.current = setTimeout(() => {
      suppressClick.current = true;
      haptic(12);
      openEditor();
    }, LONG_PRESS_MS);
  };

  const onClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    cancelPress();
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (readOnly) return;
    if (isCheckToggle) toggleFromGrid(habit, cell.day, event.currentTarget);
    else openEditor();
  };

  const text = visual.glyph === 'value' ? cellText(habit, cell) : '';

  return (
    <div
      className={cn(
        'group/cell relative flex items-center justify-center',
        isWeekend && 'bg-surface-2/50 light:bg-surface-2/70',
      )}
    >
      <button
        type="button"
        ref={(el) => register(`${row},${col}`, el)}
        data-pos={`${row},${col}`}
        tabIndex={tabbable ? 0 : -1}
        aria-label={label}
        title={label}
        // not `disabled`, or arrow keys would dead-end on future cells
        aria-disabled={readOnly || undefined}
        aria-pressed={isCheckToggle ? cell.status === 'done' : undefined}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
        onPointerLeave={cancelPress}
        onContextMenu={(event) => {
          if (readOnly) return;
          event.preventDefault();
          openEditor();
        }}
        className={cn(
          'relative m-[3px] flex flex-1 select-none items-center justify-center overflow-hidden rounded-[9px] border',
          'font-semibold leading-none tabular transition-[background-color,border-color,color,transform] duration-150 ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
          dense ? 'h-[30px] text-[10px]' : 'h-9 max-w-[4.5rem] text-[11px]',
          // cells are ~30px on phones, so pad the touch target
          !readOnly && 'pointer-coarse:after:absolute pointer-coarse:after:-inset-1',
          readOnly ? 'cursor-default' : 'cursor-pointer active:scale-[0.92]',
          visual.box,
          isToday && 'ring-1 ring-accent/60',
        )}
      >
        {visual.fill > 0 && (
          <span
            aria-hidden
            className="habit-fill absolute inset-x-0 bottom-0 opacity-45"
            style={{ height: `${Math.round(visual.fill * 100)}%` }}
          />
        )}
        <span className="relative">
          {visual.glyph === 'check' && <Check className={dense ? 'size-3' : 'size-3.5'} strokeWidth={3.5} aria-hidden />}
          {visual.glyph === 'cross' && <X className={dense ? 'size-3' : 'size-3.5'} strokeWidth={3.5} aria-hidden />}
          {visual.glyph === 'dot' && (
            <span
              aria-hidden
              className={cn(
                'block rounded-full',
                cell.status === 'notDue' ? 'size-1 bg-fg-4/60' : 'size-1.5 bg-[var(--habit)]',
              )}
            />
          )}
          {visual.glyph === 'value' && text}
        </span>
      </button>

      {isCheckToggle && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Edit ${habit.name} on ${formatDayShort(cell.day)}`}
          onClick={(event) => {
            event.stopPropagation();
            openEditor();
          }}
          className={cn(
            'absolute right-0 top-0 hidden size-[18px] items-center justify-center rounded-full border border-line-strong bg-surface-3 text-fg-2',
            'shadow-sm transition-colors duration-150 hover:bg-accent hover:text-accent-fg',
            'pointer-fine:group-hover/cell:flex',
          )}
        >
          <Pencil className="size-2.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

function RowTotal({ summary }: { summary: RowSummary }) {
  return (
    <div className="flex flex-col items-end justify-center gap-0.5 px-2.5 py-1" title={summary.hint}>
      <div className={cn('text-[12px] font-semibold leading-none tabular', summary.complete ? 'text-success' : 'text-fg-2')}>
        {summary.text}
      </div>
      {summary.unit !== '' && (
        <div className="max-w-full truncate text-[9px] font-medium leading-none text-fg-4">{summary.unit}</div>
      )}
      <div className="mt-0.5 w-full">
        <ProgressBar
          value={summary.progress}
          height={3}
          color={summary.complete ? 'var(--success)' : 'var(--habit)'}
          aria-label={summary.hint}
        />
      </div>
    </div>
  );
}

export function HistoryGrid({ model, view, today }: HistoryGridProps) {
  const { days, groups, rows, totals } = model;
  const scrollRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());
  const [focus, setFocus] = useState({ row: 0, col: 0 });

  const openLogEditor = useUI((s) => s.openLogEditor);

  const dense = view === 'month';
  const sizes = TEMPLATES[view];
  const template = `${sizes.habit} repeat(${days.length}, ${sizes.day}) ${sizes.total}`;
  const todayCol = days.indexOf(today);
  const rowIndexOf = useMemo(() => new Map(rows.map((row, index) => [row.habit.id, index])), [rows]);

  const register = useCallback((key: string, el: HTMLButtonElement | null) => {
    if (el) cellRefs.current.set(key, el);
    else cellRefs.current.delete(key);
  }, []);

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || view !== 'month') return;
    const max = scroller.scrollWidth - scroller.clientWidth;
    if (max <= 0) return;
    const column = todayCol >= 0 ? todayCol : days.length - 1;
    const habitWidth = 160;
    const target = habitWidth + (column + 1) * 36 - scroller.clientWidth / 2;
    scroller.scrollLeft = clamp(target, 0, max);
  }, [view, todayCol, days.length]);

  const focusCell = (row: number, col: number) => {
    setFocus({ row, col });
    cellRefs.current.get(`${row},${col}`)?.focus();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const pos = target.dataset.pos;
    if (!pos) return;
    const [row, col] = pos.split(',').map(Number);
    if (!Number.isFinite(row) || !Number.isFinite(col)) return;

    if (event.key === 'Escape') {
      target.blur();
      setFocus({ row: 0, col: 0 });
      return;
    }
    // plain Enter toggles check habits, so E / Shift+Enter opens the editor
    if (event.key === 'e' || event.key === 'E' || (event.key === 'Enter' && event.shiftKey)) {
      const habit = rows[row]?.habit;
      const day = days[col];
      if (!habit || !day || day > today) return;
      event.preventDefault();
      openLogEditor(habit.id, day);
      return;
    }
    let nextRow = row;
    let nextCol = col;
    switch (event.key) {
      case 'ArrowLeft':
        nextCol = col - 1;
        break;
      case 'ArrowRight':
        nextCol = col + 1;
        break;
      case 'ArrowUp':
        nextRow = row - 1;
        break;
      case 'ArrowDown':
        nextRow = row + 1;
        break;
      case 'Home':
        nextCol = 0;
        break;
      case 'End':
        nextCol = days.length - 1;
        break;
      case 'PageUp':
        nextRow = 0;
        break;
      case 'PageDown':
        nextRow = rows.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    nextRow = clamp(nextRow, 0, rows.length - 1);
    nextCol = clamp(nextCol, 0, days.length - 1);
    if (nextRow !== row || nextCol !== col) focusCell(nextRow, nextCol);
  };

  const activeRow = clamp(focus.row, 0, Math.max(0, rows.length - 1));
  const activeCol = clamp(focus.col, 0, Math.max(0, days.length - 1));

  return (
    <div className="card overflow-hidden">
      <div
        ref={scrollRef}
        className={cn(
          'overflow-x-auto overscroll-x-contain',
          // fade only the right edge, the pinned habit column has to stay sharp
          dense
            ? '[mask-image:linear-gradient(to_right,black_calc(100%_-_28px),transparent)]'
            : 'max-md:[mask-image:linear-gradient(to_right,black_calc(100%_-_28px),transparent)]',
        )}
      >
        <div
          role="group"
          aria-label={`Habit history, ${days.length} days`}
          onKeyDown={onKeyDown}
          className={dense ? 'min-w-max' : 'min-w-[28rem]'}
        >
          <div className="grid border-b border-line" style={{ gridTemplateColumns: template }}>
            <div className="sticky left-0 z-20 flex items-end bg-surface px-3 pb-2 pt-3">
              <span className="eyebrow">Habit</span>
            </div>
            {days.map((day) => {
              const date = fromDayKey(day);
              const weekend = date.getDay() === 0 || date.getDay() === 6;
              const current = day === today;
              return (
                <div
                  key={day}
                  className={cn(
                    'flex flex-col items-center justify-end gap-0.5 px-0.5 pb-2 pt-3',
                    weekend && 'bg-surface-2/50 light:bg-surface-2/70',
                  )}
                >
                  <span
                    className={cn(
                      'text-[9px] font-semibold uppercase leading-none tracking-wider',
                      current ? 'text-accent' : weekend ? 'text-fg-4' : 'text-fg-3',
                    )}
                  >
                    {WEEKDAY_SHORT[date.getDay()][0]}
                    {!dense && WEEKDAY_SHORT[date.getDay()].slice(1)}
                  </span>
                  <span
                    className={cn(
                      'flex size-[18px] items-center justify-center rounded-full text-[11px] font-semibold leading-none tabular',
                      current ? 'bg-accent text-accent-fg' : weekend ? 'text-fg-3' : 'text-fg-2',
                    )}
                  >
                    {date.getDate()}
                  </span>
                </div>
              );
            })}
            <div className="flex items-end justify-end px-2.5 pb-2 pt-3">
              <span className="eyebrow">Total</span>
            </div>
          </div>

          {groups.map((group) => (
            <div key={group.id}>
              <div className="border-b border-line/60 bg-bg-soft/60 light:bg-surface-2/60">
                <div className="sticky left-0 flex w-max items-center gap-1.5 px-3 py-1.5">
                  <span aria-hidden className="text-[11px] leading-none" style={{ fontFamily: EMOJI_FONT }}>
                    {group.icon}
                  </span>
                  <span className="eyebrow">{group.name}</span>
                </div>
              </div>

              {group.rows.map((row) => {
                const index = rowIndexOf.get(row.habit.id) ?? 0;
                return (
                  <div
                    key={row.habit.id}
                    className="grid border-b border-line/40 last:border-b-0 hover:bg-surface-2/40"
                    style={{ ...habitStyle(row.habit.color), gridTemplateColumns: template }}
                  >
                    <Link
                      to={`/habits/${row.habit.id}`}
                      className={cn(
                        'sticky left-0 z-10 flex min-w-0 items-center gap-2 bg-surface px-3 py-1',
                        'transition-colors duration-150 hover:bg-surface-2 focus-visible:outline-none',
                        'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                        row.habit.archived && 'opacity-60',
                      )}
                      title={`Open ${row.habit.name}`}
                    >
                      <HabitIcon habit={row.habit} size="xs" />
                      <span className="truncate text-[13px] font-medium text-fg-2">{row.habit.name}</span>
                    </Link>

                    {row.cells.map((cell, col) => (
                      <GridCell
                        key={cell.day}
                        habit={row.habit}
                        cell={cell}
                        row={index}
                        col={col}
                        dense={dense}
                        tabbable={index === activeRow && col === activeCol}
                        isToday={cell.day === today}
                        isWeekend={[0, 6].includes(fromDayKey(cell.day).getDay())}
                        register={register}
                      />
                    ))}

                    <RowTotal summary={row.summary} />
                  </div>
                );
              })}
            </div>
          ))}

          <div className="grid border-t border-line bg-surface-2" style={{ gridTemplateColumns: template }}>
            <div className="sticky left-0 z-10 flex items-center bg-surface-2 px-3 py-2">
              <span className="eyebrow">Day %</span>
            </div>
            {totals.map((total) => {
              const percent = total.rate === null ? null : Math.round(total.rate * 100);
              // rate is null both when nothing was due and for future days
              const future = total.day > today;
              return (
                <div
                  key={total.day}
                  className={cn('flex items-center justify-center px-0.5 py-2', future && 'opacity-50')}
                  title={
                    future
                      ? `${formatDayShort(total.day)}: hasn’t happened yet`
                      : total.rate === null
                        ? `${formatDayShort(total.day)}: nothing scheduled`
                        : `${formatDayShort(total.day)}: ${total.completed} of ${total.total} done`
                  }
                >
                  <span
                    className={cn(
                      'text-[10px] font-semibold leading-none tabular',
                      percent === null
                        ? 'text-fg-4'
                        : percent >= 100
                          ? 'text-success'
                          : percent >= 60
                            ? 'text-fg-2'
                            : percent > 0
                              ? 'text-warning'
                              : 'text-fg-4',
                    )}
                  >
                    {percent === null ? '·' : percent}
                  </span>
                </div>
              );
            })}
            <div />
          </div>
        </div>
      </div>
    </div>
  );
}
