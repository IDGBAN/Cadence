import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarDays, Flame, Pencil, RotateCcw, Shield, Sparkles, Trash, Trophy } from 'lucide-react';
import type { AppData, Habit, Relapse } from '@/types';
import type { EngineCtx } from '@/lib/habitMath';
import { Badge, Button, IconButton, Input, Modal, ProgressBar, StatTile, Textarea, confirmDialog, cn } from '@/components/ui';
import { ChartCard, ChartTooltip } from '@/components/charts/ChartParts';
import { CHART_MARGIN, Y_AXIS_FIT, useChartTheme, axisTick } from '@/components/charts/chartTheme';
import { actions } from '@/store/store';
import { useQuitCtx, useQuitStats } from '@/store/hooks';
import { toast } from '@/store/ui';
import { habitHex, habitStyle, withAlpha } from '@/lib/colors';
import { formatDayLong, formatTime, fromDateTimeLocalValue, logicalDayOf, toDateTimeLocalValue } from '@/lib/dates';
import { cheer, formatNumber, formatPercent, pluralize } from '@/lib/format';
import { haptic, playSound } from '@/lib/feedback';
import { quitRunLengths } from './shared';

export interface QuitHeroProps {
  habit: Habit;
  data: AppData;
  ctx: EngineCtx;
}

const LADDER = [1, 3, 7, 14, 30, 60, 90, 180, 365];

const DAY_MS = 86_400_000;

interface CounterPart {
  label: string;
  value: number;
  pad: number;
}

function counterParts(ms: number): CounterPart[] {
  const total = Math.max(0, Math.floor(ms / 1000));
  return [
    { label: 'days', value: Math.floor(total / 86_400), pad: 1 },
    { label: 'hours', value: Math.floor((total % 86_400) / 3600), pad: 2 },
    { label: 'min', value: Math.floor((total % 3600) / 60), pad: 2 },
    { label: 'sec', value: total % 60, pad: 2 },
  ];
}

function ladderFor(habit: Habit): number[] {
  const target = Math.round(habit.target);
  const rungs = target > 0 && !LADDER.includes(target) ? [...LADDER, target] : [...LADDER];
  return rungs.sort((a, b) => a - b);
}

function RelapseEditor({ relapse, onClose }: { relapse: Relapse; onClose: () => void }) {
  const [at, setAt] = useState(() => toDateTimeLocalValue(relapse.at));
  const [note, setNote] = useState(relapse.note ?? '');
  const [error, setError] = useState('');

  const save = () => {
    const iso = fromDateTimeLocalValue(at);
    if (iso === '') {
      setError('Pick a date and time.');
      return;
    }
    // the counter ignores slips that haven't happened yet, so a future time would quietly do nothing
    if (Date.parse(iso) > Date.now()) {
      setError('That time is in the future.');
      return;
    }
    actions().updateRelapse(relapse.id, { at: iso, note: note.trim() });
    toast({ title: 'Slip updated', tone: 'default', icon: '📝' });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit slip"
      description="Fix the time so your run history stays accurate."
      icon="🕰️"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save changes</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="When it happened"
          type="datetime-local"
          value={at}
          max={toDateTimeLocalValue(new Date().toISOString())}
          error={error}
          data-autofocus
          onChange={(event) => {
            setAt(event.target.value);
            setError('');
          }}
        />
        <Textarea
          label="Note (optional)"
          placeholder="What led up to it? What would help next time?"
          value={note}
          autoGrow
          rows={3}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
    </Modal>
  );
}

interface QuitLiveProps {
  habit: Habit;
  dayStartHour: number;
  ladder: number[];
  onSlip: () => void;
}

// ticks every second, so it's split out to keep the rest of the page from re-rendering
function QuitLive({ habit, dayStartHour, ladder, onSlip }: QuitLiveProps) {
  const stats = useQuitStats(habit.id, 1000);
  if (!stats) return null;
  const hex = habitHex(habit.color);
  const exactDays = stats.currentMs / DAY_MS;
  const nextRung = ladder.find((rung) => rung > Math.floor(exactDays));
  const previousRung = [...ladder].reverse().find((rung) => rung <= Math.floor(exactDays)) ?? 0;
  const ladderProgress = nextRung
    ? Math.min(1, Math.max(0, (exactDays - previousRung) / (nextRung - previousRung)))
    : 1;

  return (
    <>
      <section className="card sheen relative overflow-hidden p-5 sm:p-7" aria-label="Clean time">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background: `radial-gradient(120% 120% at 50% -30%, color-mix(in oklab, ${hex} 26%, transparent), transparent 62%)`,
          }}
        />
        <div className="relative flex flex-col items-center gap-5 text-center">
          <span className="eyebrow habit-text">Clean for</span>
          <div className="flex w-full items-start justify-center gap-2 sm:gap-4">
            {counterParts(stats.currentMs).map((part) => (
              <div
                key={part.label}
                className="flex min-w-0 flex-1 basis-0 flex-col items-center gap-1.5 rounded-2xl border border-line bg-surface-2/70 px-1 py-3 sm:px-3 sm:py-4"
              >
                <span className="font-display text-[clamp(1.75rem,9vw,3.25rem)] font-semibold leading-none tracking-tight text-fg tabular">
                  {String(part.value).padStart(part.pad, '0')}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-3 sm:text-[11px]">
                  {part.label}
                </span>
              </div>
            ))}
          </div>
          <p className="text-sm text-fg-3">
            Running since {formatDayLong(logicalDayOf(stats.runStartedAt, dayStartHour))} ·{' '}
            {formatTime(stats.runStartedAt)}
          </p>
          <Button variant="secondary" icon={<RotateCcw />} onClick={onSlip}>
            I slipped
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          tone="flame"
          icon={<Flame />}
          label="Current run"
          value={formatNumber(stats.currentDays, 0)}
          sub={pluralize(stats.currentDays, 'day')}
        />
        <StatTile
          icon={<Trophy />}
          label="Best run"
          value={formatNumber(stats.bestDays, 0)}
          sub={stats.bestDays > stats.currentDays ? `${pluralize(stats.bestDays - stats.currentDays, 'day')} to beat it` : 'Your best so far'}
        />
        <StatTile
          icon={<RotateCcw />}
          label="Attempts"
          value={formatNumber(stats.attempts, 0)}
          sub={`${pluralize(stats.relapseCount, 'slip')} logged`}
        />
        <StatTile
          tone="success"
          icon={<Shield />}
          label="Clean rate"
          value={formatPercent(stats.cleanRate)}
          sub={`Avg run ${formatNumber(stats.averageRunDays, 1)}d`}
        />
      </div>

      <section className="card p-4 sm:p-5" aria-label="Milestones">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold leading-tight tracking-tight text-fg sm:text-lg">
              Milestones
            </h2>
            <p className="mt-0.5 text-xs text-fg-3">
              {nextRung
                ? `${pluralize(Math.max(0, Math.ceil(nextRung - exactDays)), 'day')} to the ${formatNumber(nextRung, 0)}-day badge`
                : 'All milestones reached.'}
            </p>
          </div>
          {nextRung && (
            <Badge tone="habit" size="md" icon={<Sparkles />}>
              {formatPercent(ladderProgress)} there
            </Badge>
          )}
        </div>

        <ProgressBar
          value={ladderProgress}
          height={10}
          glow={ladderProgress >= 1}
          aria-label={nextRung ? `Progress to ${nextRung} days` : 'All milestones reached'}
        />

        <ul className="mt-4 flex flex-wrap gap-2">
          {ladder.map((rung) => {
            const achieved = Math.floor(exactDays) >= rung;
            const isNext = rung === nextRung;
            return (
              <li key={rung}>
                <span
                  className={cn(
                    'flex h-[58px] w-[62px] flex-col items-center justify-center gap-0.5 rounded-2xl border text-center transition-colors',
                    achieved && 'habit-tint-strong habit-border text-fg',
                    !achieved && isNext && 'border-dashed habit-border bg-surface-2 text-fg-2',
                    !achieved && !isNext && 'border-line bg-surface-2/50 text-fg-4',
                  )}
                  title={
                    achieved
                      ? `${rung}-day badge earned`
                      : isNext
                        ? `Next: ${rung} days`
                        : `${rung} days`
                  }
                >
                  <span className="font-display text-lg font-semibold leading-none tabular">{formatNumber(rung, 0)}</span>
                  <span className="text-[10px] font-medium uppercase tracking-[0.08em]">
                    {achieved ? 'earned' : isNext ? 'next' : 'days'}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

export function QuitHero({ habit, data, ctx }: QuitHeroProps) {
  const theme = useChartTheme();
  const hex = habitHex(habit.color);
  const [editing, setEditing] = useState<Relapse | null>(null);
  const [showAll, setShowAll] = useState(false);
  // ctx.now is frozen when the page mounts, so a slip logged later would get filtered out
  const liveNow = useQuitCtx().now;

  const relapses = useMemo(
    () =>
      data.relapses
        .filter((r) => r.habitId === habit.id)
        .slice()
        .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)),
    [data.relapses, habit.id],
  );

  const runs = useMemo(() => {
    const quitStartMs = Date.parse(habit.quitStart);
    if (!Number.isFinite(quitStartMs)) return [];
    const times = relapses.map((r) => Date.parse(r.at)).filter((t) => Number.isFinite(t));
    const lengths = quitRunLengths(quitStartMs, times, liveNow.getTime());
    return lengths.map((days, index) => ({
      name: index === lengths.length - 1 ? 'Now' : `#${index + 1}`,
      days: Math.round(days * 10) / 10,
      current: index === lengths.length - 1,
    }));
  }, [habit.quitStart, relapses, liveNow]);

  const bestRunDays = runs.reduce((max, run) => Math.max(max, run.days), 0);
  const ladder = useMemo(() => ladderFor(habit), [habit]);

  const slipped = async () => {
    const confirmed = await confirmDialog({
      title: 'Log a slip?',
      description:
        'Your best run stays on record and a new one starts now. You can fix the time later.',
      confirmLabel: 'Reset counter',
      cancelLabel: 'Cancel',
      icon: '💛',
    });
    if (!confirmed) return;
    const relapse = actions().addRelapse(habit.id);
    playSound('relapse');
    haptic([14, 60, 14]);
    toast({
      title: 'Counter reset',
      description: cheer('relapse', relapse.id),
      tone: 'default',
      icon: '🌱',
      action: { label: 'Undo', onClick: () => actions().deleteRelapse(relapse.id) },
    });
  };

  const removeRelapse = async (relapse: Relapse) => {
    const confirmed = await confirmDialog({
      title: 'Delete this slip?',
      description: 'Your runs will be recalculated without it.',
      confirmLabel: 'Delete',
      tone: 'danger',
      icon: '🗑️',
    });
    if (!confirmed) return;
    actions().deleteRelapse(relapse.id);
    toast({ title: 'Slip deleted', tone: 'default', icon: '🗑️' });
  };

  const visible = showAll ? relapses : relapses.slice(0, 5);

  return (
    <div className="flex flex-col gap-4 sm:gap-5" style={habitStyle(habit.color)}>
      <QuitLive habit={habit} dayStartHour={ctx.dayStartHour} ladder={ladder} onSlip={() => void slipped()} />

      <ChartCard
        title="Clean runs"
        subtitle={runs.length > 1 ? `Longest ${pluralize(Math.round(bestRunDays), 'day')}` : 'Your first run is still going.'}
        height={200}
        empty={runs.length < 2}
        emptyLabel="Shows up after your first slip."
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={runs} margin={{ ...CHART_MARGIN, top: 6, right: 6 }}>
            <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={axisTick(theme)} tickLine={false} axisLine={{ stroke: theme.grid }} />
            <YAxis {...Y_AXIS_FIT} tick={axisTick(theme)} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: theme.surface2, opacity: 0.5 }}
              content={
                <ChartTooltip
                  labelFormatter={(label) => (label === 'Now' ? 'Current run' : `Run ${String(label).replace('#', '')}`)}
                  valueFormatter={(value) => pluralize(value, 'day')}
                />
              }
            />
            <Bar dataKey="days" name="Clean days" radius={[6, 6, 0, 0]} maxBarSize={44}>
              {runs.map((run) => (
                <Cell key={run.name} fill={run.current ? hex : withAlpha(hex, 0.45)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <section className="card p-4 sm:p-5" aria-label="Slip history">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-base font-semibold leading-tight tracking-tight text-fg sm:text-lg">
            Slip history
          </h2>
          <Badge tone="neutral" size="md">
            {pluralize(relapses.length, 'slip')}
          </Badge>
        </div>

        {relapses.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-line px-4 py-5">
            <CalendarDays className="size-5 shrink-0 text-fg-4" aria-hidden />
            <p className="text-sm text-fg-3">
              No slips yet. The counter has been running since day one.
            </p>
          </div>
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-line">
              {visible.map((relapse) => (
                <li key={relapse.id} className="flex items-start gap-3 py-3 first:pt-0">
                  <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-danger/70" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-sm font-semibold text-fg">
                        {formatDayLong(logicalDayOf(relapse.at, ctx.dayStartHour))}
                      </span>
                      <span className="text-xs text-fg-3 tabular">{formatTime(relapse.at)}</span>
                    </div>
                    {relapse.note?.trim() && (
                      <p className="mt-1 text-sm leading-relaxed text-pretty text-fg-2">{relapse.note}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <IconButton label="Edit slip" size="sm" onClick={() => setEditing(relapse)}>
                      <Pencil />
                    </IconButton>
                    <IconButton label="Delete slip" size="sm" onClick={() => void removeRelapse(relapse)}>
                      <Trash />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
            {relapses.length > 5 && (
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show less' : `Show all ${formatNumber(relapses.length, 0)}`}
              </Button>
            )}
          </>
        )}
      </section>

      {editing && <RelapseEditor relapse={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
