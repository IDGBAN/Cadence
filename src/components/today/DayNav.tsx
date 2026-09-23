import { CalendarDays, ChevronLeft, ChevronRight, CornerUpLeft } from 'lucide-react';
import type { DayKey } from '@/types';
import { Chip, IconButton, MiniCalendar, Popover, cn } from '@/components/ui';
import { addDays, formatDayLong, formatMonthDay } from '@/lib/dates';
import type { DayProgressFn } from './dayProgress';

export interface DayNavProps {
  day: DayKey;
  today: DayKey;
  weekStartsOn: 0 | 1;
  dayProgress: DayProgressFn;
  onSelect: (day: DayKey) => void;
  className?: string;
}

export function DayNav({ day, today, weekStartsOn, dayProgress, onSelect, className }: DayNavProps) {
  const atToday = day >= today;

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {!atToday && (
        <Chip size="sm" icon={<CornerUpLeft aria-hidden />} onClick={() => onSelect(today)}>
          Back to today
        </Chip>
      )}

      <div className="flex items-center gap-0.5 rounded-full border border-line bg-surface-2 p-0.5">
        <IconButton
          label={`Previous day (${formatDayLong(addDays(day, -1))})`}
          size="sm"
          variant="ghost"
          onClick={() => onSelect(addDays(day, -1))}
        >
          <ChevronLeft />
        </IconButton>

        <Popover
          placement="bottom-end"
          padding="sm"
          aria-label="Pick a day"
          trigger={
            <button
              type="button"
              aria-label={`Pick a day (showing ${formatDayLong(day)})`}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium text-fg-2 tabular',
                'transition-colors hover:bg-surface-3 hover:text-fg',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              )}
            >
              <CalendarDays aria-hidden className="size-4 text-fg-3" />
              {formatMonthDay(day)}
            </button>
          }
        >
          {(close) => (
            <MiniCalendar
              value={day}
              max={today}
              today={today}
              weekStartsOn={weekStartsOn}
              dayProgress={dayProgress}
              onChange={(next) => {
                onSelect(next);
                close();
              }}
            />
          )}
        </Popover>

        <IconButton
          label={`Next day (${formatDayLong(addDays(day, 1))})`}
          size="sm"
          variant="ghost"
          disabled={atToday}
          onClick={() => onSelect(addDays(day, 1))}
        >
          <ChevronRight />
        </IconButton>
      </div>
    </div>
  );
}
