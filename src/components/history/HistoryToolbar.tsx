import { useState } from 'react';
import { Archive, CalendarDays, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import type { DayKey } from '@/types';
import { Button, IconButton, Input, MiniCalendar, Popover, cn } from '@/components/ui';
import type { HistoryView } from './model';

export interface HistoryToolbarProps {
  view: HistoryView;
  anchor: DayKey;
  today: DayKey;
  weekStartsOn: 0 | 1;
  rangeLabel: string;
  atPresent: boolean;
  onStep: (direction: -1 | 1) => void;
  onJump: (day: DayKey) => void;
  showArchived: boolean;
  onShowArchivedChange: (next: boolean) => void;
  hasArchived: boolean;
  query: string;
  onQueryChange: (next: string) => void;
}

export function HistoryToolbar({
  view,
  anchor,
  today,
  weekStartsOn,
  rangeLabel,
  atPresent,
  onStep,
  onJump,
  showArchived,
  onShowArchivedChange,
  hasArchived,
  query,
  onQueryChange,
}: HistoryToolbarProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const isTimeline = view === 'timeline';
  const presentLabel = view === 'month' ? 'This month' : 'This week';

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {!isTimeline && (
        <>
          <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
            <IconButton
              label={view === 'month' ? 'Previous month' : 'Previous week'}
              size="sm"
              variant="ghost"
              onClick={() => onStep(-1)}
            >
              <ChevronLeft />
            </IconButton>

            <Popover
              open={calendarOpen}
              onOpenChange={setCalendarOpen}
              placement="bottom"
              padding="sm"
              aria-label="Jump to a date"
              trigger={
                <button
                  type="button"
                  className={cn(
                    'flex min-w-[9.5rem] items-center justify-center gap-2 rounded-lg px-2.5 py-1.5',
                    'text-[13px] font-semibold text-fg transition-colors duration-150 hover:bg-surface-2',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  )}
                >
                  <CalendarDays className="size-4 shrink-0 text-fg-3" aria-hidden />
                  <span className="truncate tabular">{rangeLabel}</span>
                </button>
              }
            >
              <MiniCalendar
                value={anchor}
                today={today}
                max={today}
                weekStartsOn={weekStartsOn}
                onChange={(day) => {
                  onJump(day);
                  setCalendarOpen(false);
                }}
              />
            </Popover>

            <IconButton
              label={view === 'month' ? 'Next month' : 'Next week'}
              size="sm"
              variant="ghost"
              disabled={atPresent}
              onClick={() => onStep(1)}
            >
              <ChevronRight />
            </IconButton>
          </div>

          <Button size="sm" variant="secondary" disabled={atPresent} onClick={() => onJump(today)}>
            {presentLabel}
          </Button>
        </>
      )}

      {isTimeline && (
        <div className="min-w-0 flex-1 sm:max-w-sm">
          <Input
            size="sm"
            type="search"
            value={query}
            placeholder="Search notes and habits…"
            aria-label="Search history"
            leading={<Search className="size-4" aria-hidden />}
            trailing={
              query ? (
                <IconButton label="Clear search" size="xs" variant="ghost" onClick={() => onQueryChange('')}>
                  <X />
                </IconButton>
              ) : undefined
            }
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>
      )}

      <div className="ms-auto flex items-center gap-2">
        {hasArchived && (
          <Button
            size="sm"
            variant={showArchived ? 'soft' : 'ghost'}
            icon={<Archive />}
            aria-pressed={showArchived}
            onClick={() => onShowArchivedChange(!showArchived)}
            className={showArchived ? undefined : 'text-fg-3'}
          >
            Archived
          </Button>
        )}
      </div>
    </div>
  );
}
