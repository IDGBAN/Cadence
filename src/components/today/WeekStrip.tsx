import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import type { DayKey } from '@/types';
import { IconButton, ProgressRing, cn } from '@/components/ui';
import {
  WEEKDAY_SHORT,
  addDays,
  eachDay,
  endOfWeek,
  formatDayLong,
  formatRange,
  startOfWeek,
  weekday,
} from '@/lib/dates';
import { formatPercent } from '@/lib/format';
import { useReducedMotion } from '@/store/hooks';
import type { DayProgressFn } from './dayProgress';
import { springSnappy } from './shared';

export interface WeekStripProps {
  day: DayKey;
  today: DayKey;
  weekStartsOn: 0 | 1;
  dayProgress: DayProgressFn;
  onSelect: (day: DayKey) => void;
  className?: string;
}

function dayNumber(key: DayKey): string {
  return String(Number(key.slice(8, 10)));
}

export function WeekStrip({ day, today, weekStartsOn, dayProgress, onSelect, className }: WeekStripProps) {
  const reduced = useReducedMotion();
  const start = startOfWeek(day, weekStartsOn);
  const end = endOfWeek(day, weekStartsOn);
  const days = eachDay(start, end);
  const nextWeek = addDays(start, 7);
  const nextDisabled = nextWeek > today;

  return (
    <section aria-label="Week overview" className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <IconButton
          label="Previous week"
          size="sm"
          variant="ghost"
          onClick={() => onSelect(addDays(day, -7))}
        >
          <ChevronLeft />
        </IconButton>
        <p className="min-w-0 truncate text-xs font-medium text-fg-3">{formatRange(start, end)}</p>
        <IconButton
          label="Next week"
          size="sm"
          variant="ghost"
          disabled={nextDisabled}
          onClick={() => onSelect(nextWeek > today ? today : addDays(day, 7))}
        >
          <ChevronRight />
        </IconButton>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {days.map((d) => {
          const selected = d === day;
          const isToday = d === today;
          const future = d > today;
          const rate = future ? null : dayProgress(d);
          const label = `${formatDayLong(d)}${isToday ? ' (today)' : ''}${
            rate === null ? (future ? ', upcoming' : ', nothing due') : `, ${formatPercent(rate)} done`
          }`;

          return (
            <button
              key={d}
              type="button"
              disabled={future}
              aria-label={label}
              aria-current={selected ? 'date' : undefined}
              onClick={() => onSelect(d)}
              className={cn(
                'relative isolate flex flex-col items-center gap-1 rounded-2xl border px-0.5 py-2 transition-colors duration-200',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                future && 'pointer-events-none opacity-35',
                selected
                  ? 'border-transparent text-fg'
                  : 'border-transparent text-fg-3 hover:bg-surface-2 hover:text-fg',
              )}
            >
              {selected &&
                (reduced ? (
                  <span
                    aria-hidden
                    className="absolute inset-0 -z-10 rounded-2xl border border-accent/45 bg-accent/12"
                  />
                ) : (
                  <motion.span
                    aria-hidden
                    layoutId="today-week-active"
                    transition={springSnappy}
                    className="absolute inset-0 -z-10 rounded-2xl border border-accent/45 bg-accent/12"
                  />
                ))}

              <span className="eyebrow text-[10px] leading-none">{WEEKDAY_SHORT[weekday(d)].slice(0, 1)}</span>

              <ProgressRing
                value={rate ?? 0}
                size={34}
                stroke={3}
                color="var(--accent)"
                trackColor={rate === null ? 'color-mix(in oklab, var(--fg-4) 22%, transparent)' : undefined}
                glowOnComplete={false}
                animateOnMount={false}
              >
                <span className={cn('tabular text-[13px] font-semibold leading-none', selected && 'text-fg')}>
                  {dayNumber(d)}
                </span>
              </ProgressRing>

              <span
                aria-hidden
                className={cn('size-1 rounded-full', isToday ? 'bg-accent' : 'bg-transparent')}
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}
