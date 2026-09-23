import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import type { DayKey, Habit } from '@/types';
import { addDays, formatDayLong, relativeDayLabel } from '@/lib/dates';
import { dayCell } from '@/lib/habitMath';
import { useData, useEngineCtx } from '@/store/hooks';
import { Button, IconButton, MiniCalendar, Popover, cn } from '@/components/ui';

export interface DayNavigatorProps {
  habit: Habit;
  day: DayKey;
  today: DayKey;
  onChange: (day: DayKey) => void;
}

export function DayNavigator({ habit, day, today, onChange }: DayNavigatorProps) {
  const data = useData();
  const ctx = useEngineCtx();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const canGoForward = day < today;

  return (
    <div className="flex items-center gap-1.5 rounded-2xl border border-line bg-surface-2 p-1.5 light:bg-surface">
      <IconButton label="Previous day" size="sm" variant="ghost" onClick={() => onChange(addDays(day, -1))}>
        <ChevronLeft />
      </IconButton>

      <Popover
        open={calendarOpen}
        onOpenChange={setCalendarOpen}
        placement="bottom"
        padding="sm"
        aria-label="Pick a day"
        trigger={
          <button
            type="button"
            className={cn(
              'flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-2 py-1.5',
              'transition-colors duration-150 hover:bg-surface-3 light:hover:bg-surface-2',
            )}
          >
            <CalendarDays className="size-4 shrink-0 text-fg-3" aria-hidden />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold leading-tight text-fg">
                {relativeDayLabel(day, today)}
              </span>
              <span className="block truncate text-[11px] leading-tight text-fg-3">{formatDayLong(day)}</span>
            </span>
          </button>
        }
      >
        <MiniCalendar
          value={day}
          today={today}
          max={today}
          weekStartsOn={ctx.weekStartsOn}
          dayProgress={(d) => {
            const cell = dayCell(habit, data, d, ctx);
            if (cell.status === 'beforeStart' || cell.status === 'future' || cell.status === 'notDue') return null;
            return cell.progress;
          }}
          onChange={(next) => {
            onChange(next);
            setCalendarOpen(false);
          }}
        />
      </Popover>

      {day !== today && (
        <Button size="sm" variant="ghost" onClick={() => onChange(today)} className="shrink-0">
          Today
        </Button>
      )}

      <IconButton
        label="Next day"
        size="sm"
        variant="ghost"
        disabled={!canGoForward}
        onClick={() => onChange(addDays(day, 1))}
      >
        <ChevronRight />
      </IconButton>
    </div>
  );
}
