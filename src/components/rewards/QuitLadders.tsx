import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Ban, Check, Plus } from 'lucide-react';
import type { Habit } from '@/types';
import { Badge, Button, EmptyState, HabitIcon, ProgressBar, SectionHeader, cn } from '@/components/ui';
import { useActiveHabits, useQuitStats } from '@/store/hooks';
import { useUI } from '@/store/ui';
import { QUIT_MILESTONE_XP } from '@/lib/rewards';
import { habitStyle } from '@/lib/colors';
import { formatElapsed, formatNumber, pluralize } from '@/lib/format';

const RUNGS = [1, 3, 7, 14, 30, 60, 90, 180, 365] as const;

const RUNG_XP = new Map<number, number>(QUIT_MILESTONE_XP.map(([days, xp]) => [days, xp]));

const TICK_MS = 60_000;

const XP_RUNGS_TEXT = QUIT_MILESTONE_XP.map(([days]) => formatNumber(days, 0));

function rungLabel(days: number): string {
  if (days >= 365) return `${Math.round(days / 365)}y`;
  if (days >= 30) return `${Math.round(days / 30)}mo`;
  if (days >= 7) return `${Math.round(days / 7)}w`;
  return `${days}d`;
}

// its own component so each habit can run a useQuitStats ticker without hooks in a loop
function QuitLadder({ habit }: { habit: Habit }) {
  const stats = useQuitStats(habit.id, TICK_MS);
  if (!stats) return null;

  const current = stats.currentDays;
  const next = stats.milestone.next;
  const nextXp = RUNG_XP.get(next);
  const toGo = Math.max(1, next - current);
  // custom targets and runs past a year have a next mark the fixed ladder doesn't show
  const rungs: number[] = RUNGS.includes(next as (typeof RUNGS)[number]) ? [...RUNGS] : [...RUNGS, next].sort((a, b) => a - b);

  return (
    <li className="min-w-0 rounded-2xl border border-line bg-surface-2/40 p-3.5" style={habitStyle(habit.color)}>
      <div className="flex items-start gap-3">
        <HabitIcon habit={habit} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <Link
              to={`/habits/${habit.id}`}
              className="truncate text-sm font-semibold text-fg hover:text-[var(--habit)] focus-visible:outline-none focus-visible:underline"
            >
              {habit.name}
            </Link>
            <span className="text-[11px] tabular text-fg-3">
              best {pluralize(stats.bestDays, 'day')} · {pluralize(stats.relapseCount, 'reset')}
            </span>
          </div>
          <div className="mt-0.5 font-display text-lg font-bold leading-tight tabular habit-text">
            {formatElapsed(stats.currentMs, 'compact')} clean
          </div>
        </div>
        {nextXp !== undefined && (
          <Badge tone="xp" size="sm" className="mt-0.5">
            +{formatNumber(nextXp, 0)} XP next
          </Badge>
        )}
      </div>

      <div className="scroll-fade-x -mx-3.5 mt-0.5 overflow-x-auto px-3.5 py-4">
        <ol className="flex min-w-max items-end gap-0">
          {rungs.map((rung, index) => {
            const reached = current >= rung;
            const isNext = rung === next;
            const bonus = RUNG_XP.get(rung);
            return (
              <li key={rung} className="flex items-end">
                {index > 0 && (
                  <span
                    aria-hidden
                    className={cn('mb-4 h-[2px] w-5 shrink-0 rounded-full sm:w-7', reached ? 'habit-fill' : 'bg-line')}
                  />
                )}
                <div className="flex w-11 flex-col items-center gap-1">
                  <span
                    className={cn(
                      'flex size-8 items-center justify-center rounded-full border text-[11px] font-bold tabular transition-colors',
                      reached && 'habit-tint-strong habit-border habit-text',
                      !reached && isNext && 'habit-border habit-tint habit-text animate-pulse-ring',
                      !reached && !isNext && 'border-line bg-surface text-fg-3',
                    )}
                    title={
                      bonus !== undefined
                        ? `${pluralize(rung, 'day')} clean · +${formatNumber(bonus, 0)} XP`
                        : `${pluralize(rung, 'day')} clean`
                    }
                  >
                    {reached ? <Check className="size-4" aria-hidden /> : <span aria-hidden>{rungLabel(rung)}</span>}
                    <span className="sr-only">
                      {pluralize(rung, 'day')}
                      {reached ? ', reached' : ''}
                      {bonus !== undefined ? `, +${formatNumber(bonus, 0)} XP` : ''}
                    </span>
                  </span>
                  <span aria-hidden className={cn('text-[10px] leading-none tabular', reached ? 'text-fg-2' : 'text-fg-3')}>
                    {rung}d
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div>
        <ProgressBar
          value={stats.milestone.progress}
          height={6}
          aria-label={`${Math.round(stats.milestone.progress * 100)}% of the way to ${next} clean days`}
        />
        <p className="mt-1.5 text-[11px] text-fg-3">{`${pluralize(toGo, 'day')} to the ${formatNumber(next, 0)}-day mark.`}</p>
      </div>
    </li>
  );
}

export function QuitLadders() {
  const habits = useActiveHabits();
  const openHabitEditor = useUI((s) => s.openHabitEditor);
  const quitHabits = useMemo(() => habits.filter((habit) => habit.type === 'quit'), [habits]);

  return (
    <section className="card p-4 sm:p-5">
      <SectionHeader
        title="Quit milestones"
        eyebrow="Clean streaks"
        icon={<Ban aria-hidden />}
        subtitle={
          quitHabits.length === 0
            ? 'Habits you’re quitting show up here'
            : `Tracking ${pluralize(quitHabits.length, 'habit')}`
        }
      />

      {quitHabits.length === 0 ? (
        <EmptyState
          className="py-8"
          icon="🚭"
          title="Nothing to quit yet"
          description={`A quit habit counts up from your last reset and pays XP at ${XP_RUNGS_TEXT.slice(0, -1).join(', ')} and ${XP_RUNGS_TEXT[XP_RUNGS_TEXT.length - 1]} clean days.`}
          action={
            <Button variant="secondary" icon={<Plus aria-hidden />} onClick={() => openHabitEditor(null)}>
              Add a quit habit
            </Button>
          }
        />
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {quitHabits.map((habit) => (
            <QuitLadder key={habit.id} habit={habit} />
          ))}
        </ul>
      )}
    </section>
  );
}
