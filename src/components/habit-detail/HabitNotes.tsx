import { useMemo, useState } from 'react';
import { NotebookPen } from 'lucide-react';
import type { AppData, DayKey, Habit, LogEntry } from '@/types';
import type { EngineCtx } from '@/lib/habitMath';
import { formatDayLong, relativeDayLabel } from '@/lib/dates';
import { formatNumber, formatValue } from '@/lib/format';
import { habitStyle } from '@/lib/colors';
import { Badge, Button, cn } from '@/components/ui';
import { useUI } from '@/store/ui';

export interface HabitNotesProps {
  habit: Habit;
  data: AppData;
  ctx: EngineCtx;
}

const PAGE = 6;

interface NoteRow {
  day: DayKey;
  entry: LogEntry;
  note: string;
}

export function HabitNotes({ habit, data, ctx }: HabitNotesProps) {
  const openLogEditor = useUI((s) => s.openLogEditor);
  const [shown, setShown] = useState(PAGE);

  const rows = useMemo<NoteRow[]>(() => {
    const logs = data.logs[habit.id];
    if (!logs) return [];
    const out: NoteRow[] = [];
    for (const day of Object.keys(logs)) {
      const entry = logs[day];
      const note = entry?.note?.trim();
      if (note) out.push({ day, entry, note });
    }
    return out.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  }, [data.logs, habit.id]);

  const visible = rows.slice(0, shown);

  return (
    <section className="card p-4 sm:p-5" style={habitStyle(habit.color)} aria-label="Notes">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold leading-tight tracking-tight text-fg sm:text-lg">Notes</h2>
        {rows.length > 0 && (
          <Badge tone="neutral" size="md">
            {formatNumber(rows.length, 0)} noted {rows.length === 1 ? 'day' : 'days'}
          </Badge>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex items-start gap-3 rounded-xl border border-dashed border-line px-4 py-5">
          <NotebookPen className="mt-0.5 size-5 shrink-0 text-fg-4" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm text-fg-2">No notes yet.</p>
            <p className="mt-1 text-sm leading-relaxed text-fg-3">
              Add a note when you log to remember why a day went well or what got in the way.
            </p>
            <Button variant="soft" size="sm" className="mt-3" onClick={() => openLogEditor(habit.id, ctx.today)}>
              Add a note for today
            </Button>
          </div>
        </div>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-line">
            {visible.map((row) => {
              const value = habit.type === 'quit' ? '' : formatValue(habit, row.entry.skipped ? null : row.entry.value);
              return (
                <li key={row.day}>
                  <button
                    type="button"
                    onClick={() => openLogEditor(habit.id, row.day)}
                    className={cn(
                      'group flex w-full items-start gap-3 rounded-xl px-1 py-3 text-left transition-colors',
                      'hover:bg-surface-2 focus-visible:outline-offset-2',
                    )}
                  >
                    <span
                      aria-hidden
                      className="mt-1 flex size-2 shrink-0 rounded-full habit-fill opacity-80 group-hover:opacity-100"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-sm font-semibold text-fg">{formatDayLong(row.day)}</span>
                        <span className="text-xs text-fg-4">{relativeDayLabel(row.day, ctx.today)}</span>
                        {row.entry.skipped ? (
                          <Badge tone="neutral" size="xs">
                            Skipped
                          </Badge>
                        ) : (
                          value && (
                            <Badge tone="habit" size="xs">
                              {value}
                            </Badge>
                          )
                        )}
                      </span>
                      <span className="mt-1 block text-sm leading-relaxed text-pretty text-fg-2">{row.note}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {rows.length > visible.length && (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShown((n) => n + PAGE)}>
              Show {Math.min(PAGE, rows.length - visible.length)} more
            </Button>
          )}
          {rows.length > PAGE && rows.length === visible.length && (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShown(PAGE)}>
              Show less
            </Button>
          )}
        </>
      )}
    </section>
  );
}
