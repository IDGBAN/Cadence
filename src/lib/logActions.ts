import type { AppData, DayKey, Habit, PeriodProgress } from '@/types';
import { ACCENTS, habitHex } from '@/lib/colors';
import { formatDayShort } from '@/lib/dates';
import { confettiBurst, confettiFromElement, haptic, playSound } from '@/lib/feedback';
import { cheer, formatElapsed, formatMinutes, formatNumber, periodLabel, pluralize } from '@/lib/format';
import { dayCell, getEntry, makeCtx, periodProgress, quitStats, type EngineCtx } from '@/lib/habitMath';
import { actions, getData } from '@/store/store';
import { toast, type ToastInput } from '@/store/ui';

const finite = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

function ctxFor(data: AppData, now?: Date): EngineCtx {
  return makeCtx(data.settings, now ?? new Date());
}

function habitOf(data: AppData, habitId: string): Habit | undefined {
  return data.habits.find((h) => h.id === habitId);
}

function paletteFor(habit: Habit, data: AppData): string[] {
  return [habitHex(habit.color), ACCENTS[data.settings.accent]?.hex ?? ACCENTS.violet.hex];
}

function isPeriodGoal(habit: Habit): boolean {
  return habit.kind === 'goal' && habit.type !== 'rating' && habit.type !== 'quit' && habit.period !== 'day';
}

// a weekly or monthly limit can only be met once the period is over, so logging never "completes" it
function isPeriodLimit(habit: Habit): boolean {
  return isPeriodGoal(habit) && habit.type !== 'check' && habit.direction === 'atMost';
}

const announcedPeriods = new Set<string>();

/** Whether a "goal hit" toast already went out for this habit's period, so CelebrationHost doesn't repeat it. */
export function periodGoalAnnounced(habitId: string, periodStart: DayKey): boolean {
  return announcedPeriods.has(`${habitId}:${periodStart}`);
}

function periodText(habit: Habit, p: PeriodProgress): string {
  if (habit.type === 'duration') return `${formatMinutes(p.achieved)} / ${formatMinutes(p.target)}`;
  return `${formatNumber(p.achieved, 1)}/${formatNumber(p.target, 1)}`;
}

// call right after the commit. undo() pops a shared stack, so a stale toast could revert some other
// change. every commit swaps the data reference, so if it's unchanged our entry is still on top.
export function undoAction(): NonNullable<ToastInput['action']> {
  const committed = getData();
  return {
    label: 'Undo',
    onClick: () => {
      if (getData() !== committed) {
        toast({
          title: 'Too late to undo',
          description: 'Something else changed since. Press Ctrl+Z to undo one step at a time.',
          icon: '↩️',
        });
        return;
      }
      actions().undo();
      if (getData() !== committed) playSound('undo');
    },
  };
}

function rejectFuture(day: DayKey): void {
  toast({
    title: 'Can’t log the future',
    description: `${formatDayShort(day)} hasn’t happened yet.`,
    tone: 'danger',
    icon: '⏳',
  });
}

interface Snapshot {
  complete: boolean;
  score: number; // 0..1, period progress for week/month goals
  raw: number; // breaks score ties, e.g. logging more on a goal that's already met
  period?: PeriodProgress;
}

function snapshot(habit: Habit, day: DayKey): Snapshot {
  const data = getData();
  const ctx = ctxFor(data);
  if (habit.kind === 'metric') {
    const entry = getEntry(data, habit.id, day);
    const logged = !!entry && !entry.skipped;
    return { complete: logged, score: logged ? 1 : 0, raw: logged ? finite(entry?.value) : 0 };
  }
  if (isPeriodGoal(habit)) {
    const period = periodProgress(habit, data, day, ctx);
    const complete = period.success && !isPeriodLimit(habit);
    return { complete, score: period.progress, raw: period.achieved, period };
  }
  const cell = dayCell(habit, data, day, ctx);
  return { complete: cell.status === 'done', score: cell.progress, raw: finite(cell.value) };
}

// 1 forward, -1 back, 0 if nothing meaningful changed
function movement(habit: Habit, before: Snapshot, after: Snapshot): number {
  if (after.complete !== before.complete) return after.complete ? 1 : -1;
  if (after.score !== before.score) return after.score > before.score ? 1 : -1;
  if (after.raw === before.raw) return 0;
  const up = habit.direction !== 'atMost';
  return (after.raw > before.raw) === up ? 1 : -1;
}

function celebrateComplete(habit: Habit, after: Snapshot, sourceEl?: Element | null): void {
  playSound('complete');
  const colors = paletteFor(habit, getData());
  if (sourceEl) confettiFromElement(sourceEl, colors);
  else confettiBurst(undefined, colors);
  haptic([12, 40, 12]);
  if (isPeriodGoal(habit) && after.period) {
    announcedPeriods.add(`${habit.id}:${after.period.start}`);
    toast({
      title: `${periodLabel(habit.period)} goal hit`,
      description: `${habit.name} · ${periodText(habit, after.period)}`,
      tone: 'streak',
      icon: habit.icon,
    });
  }
}

function applyFeedback(habit: Habit, before: Snapshot, after: Snapshot, sourceEl?: Element | null): void {
  if (!before.complete && after.complete) {
    celebrateComplete(habit, after, sourceEl);
    return;
  }
  const dir = movement(habit, before, after);
  if (dir > 0) {
    playSound('tick');
    haptic(8);
  } else if (dir < 0) {
    playSound('undo');
  }
}

function run(habitId: string, day: DayKey, mutate: (habit: Habit) => void, sourceEl?: Element | null): void {
  const data = getData();
  const habit = habitOf(data, habitId);
  if (!habit) return;
  if (day > ctxFor(data).today) {
    rejectFuture(day);
    return;
  }
  const before = snapshot(habit, day);
  mutate(habit);
  applyFeedback(habit, before, snapshot(habit, day), sourceEl);
}

export function toggleCheckWithFeedback(habitId: string, day: DayKey, sourceEl?: Element | null): void {
  run(habitId, day, (habit) => actions().toggleCheck(habit.id, day), sourceEl);
}

export function adjustWithFeedback(habitId: string, day: DayKey, delta: number, sourceEl?: Element | null): void {
  if (!Number.isFinite(delta) || delta === 0) return;
  run(habitId, day, (habit) => actions().adjustLog(habit.id, day, delta), sourceEl);
}

/** undefined clears the value. The entry stays if it has a note or a skip. */
export function setValueWithFeedback(habitId: string, day: DayKey, value: number | undefined, sourceEl?: Element | null): void {
  run(
    habitId,
    day,
    (habit) => {
      if (value === undefined) {
        const entry = getEntry(getData(), habit.id, day);
        const keep = !!entry && (entry.skipped === true || (entry.note ?? '').trim() !== '');
        if (keep) actions().setLog(habit.id, day, { value: 0 });
        else actions().clearLog(habit.id, day);
        return;
      }
      const next = Math.max(0, finite(value));
      actions().setLog(habit.id, day, next > 0 ? { value: next, skipped: false } : { value: next });
    },
    sourceEl,
  );
}

export function setSkippedWithFeedback(habitId: string, day: DayKey, skipped: boolean): void {
  const data = getData();
  const habit = habitOf(data, habitId);
  if (!habit) return;
  if (day > ctxFor(data).today) {
    rejectFuture(day);
    return;
  }
  actions().setSkipped(habitId, day, skipped);
  if (getData() === data) return;
  playSound(skipped ? 'tick' : 'undo');
  haptic(8);
  toast({
    title: skipped ? 'Day skipped' : 'Skip removed',
    description: skipped
      ? `${habit.name} · ${formatDayShort(day)} won’t count for or against your streak.`
      : `${habit.name} · ${formatDayShort(day)} counts again.`,
    icon: skipped ? '⏭️' : '↩️',
    action: undoAction(),
  });
}

/** One commit, one toast and one Undo for the lot (a sick day, a day off). Logged values are kept. */
export function skipManyWithFeedback(habitIds: readonly string[], day: DayKey, reason?: string): void {
  if (habitIds.length === 0) return;
  const data = getData();
  if (day > ctxFor(data).today) {
    rejectFuture(day);
    return;
  }
  actions().setSkippedMany(habitIds, day, true, reason);
  const after = getData();
  if (after === data) return;
  const count = habitIds.filter((id) => after.logs[id]?.[day]?.skipped === true && data.logs[id]?.[day]?.skipped !== true).length;
  playSound('tick');
  haptic(8);
  toast({
    title: `${pluralize(count, 'habit')} skipped${reason?.trim() ? ` · ${reason.trim()}` : ''}`,
    description: `${formatDayShort(day)} won’t count for or against those streaks.`,
    icon: '⏭️',
    action: undoAction(),
  });
}

export function relapseWithFeedback(habitId: string, at?: string, note?: string): void {
  const data = getData();
  const habit = habitOf(data, habitId);
  if (!habit || habit.type !== 'quit') return;
  const parsed = at ? new Date(at) : new Date();
  const when = Number.isFinite(parsed.getTime()) ? parsed : new Date();
  const previousMs = quitStats(habit, data, ctxFor(data, when)).currentMs;
  actions().addRelapse(habitId, at, note);
  if (getData() === data) return;
  playSound('relapse');
  haptic([18, 60, 18]);
  toast({
    title: `Counter reset after ${formatElapsed(previousMs, 'compact')}`,
    description: cheer('relapse', `${habitId}:${when.toISOString().slice(0, 13)}`),
    icon: habit.icon,
    duration: 7000,
    action: undoAction(),
  });
}

export function startTimerWithFeedback(habitId: string, day: DayKey): void {
  const data = getData();
  const habit = habitOf(data, habitId);
  if (!habit || habit.type !== 'duration' || data.timers[habitId]) return;
  if (day > ctxFor(data).today) {
    rejectFuture(day);
    return;
  }
  actions().startTimer(habitId, day);
  if (getData() === data) return;
  playSound('timerStart');
  haptic(10);
}

export function stopTimerWithFeedback(habitId: string, sourceEl?: Element | null): void {
  const data = getData();
  const habit = habitOf(data, habitId);
  const timer = data.timers[habitId];
  if (!habit || !timer) return;
  const day = timer.day;
  const before = snapshot(habit, day);
  const minutes = actions().stopTimer(habitId);
  if (minutes <= 0) {
    playSound('timerStop');
    toast({ title: 'Timer stopped', description: 'Under a minute, so nothing was logged.', icon: '⏱️' });
    return;
  }
  const after = snapshot(habit, day);
  if (!before.complete && after.complete) {
    celebrateComplete(habit, after, sourceEl);
  } else {
    playSound('timerStop');
    haptic(8);
  }
  const total = finite(getEntry(getData(), habit.id, day)?.value);
  toast({
    title: `+${formatMinutes(minutes)} added to ${habit.name}`,
    description: `${formatDayShort(day)} · ${formatMinutes(total)} total`,
    tone: 'success',
    icon: '⏱️',
    action: undoAction(),
  });
}

export function cancelTimerWithFeedback(habitId: string): void {
  const data = getData();
  if (!data.timers[habitId]) return;
  actions().cancelTimer(habitId);
  playSound('undo');
  haptic(8);
  toast({ title: 'Timer discarded', description: 'Nothing was logged.', icon: '⏱️' });
}
