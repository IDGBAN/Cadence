// engine calls happen once per habit per range, never per cell, so the month grid stays smooth
import type { AppData, Category, DayCell, DayKey, Habit, PeriodProgress } from '@/types';
import { eachDay } from '@/lib/dates';
import { formatMinutes, formatNumber, pluralize } from '@/lib/format';
import { dayCells, habitStartDay, overallCompletionSeries, periodsInRange, type EngineCtx } from '@/lib/habitMath';

export type HistoryView = 'week' | 'month' | 'timeline';

function isPeriodGoal(habit: Habit): boolean {
  return habit.kind === 'goal' && habit.type !== 'rating' && habit.type !== 'quit' && habit.period !== 'day';
}

export interface RowSummary {
  text: string;
  unit: string;
  progress: number;
  complete: boolean;
  hint: string;
}

export interface GridRow {
  habit: Habit;
  cells: DayCell[];
  summary: RowSummary;
}

export interface GridGroup {
  id: string;
  name: string;
  icon: string;
  rows: GridRow[];
}

export interface DayTotal {
  day: DayKey;
  rate: number | null;
  completed: number;
  total: number;
}

export interface GridModel {
  days: DayKey[];
  groups: GridGroup[];
  // flattened in render order, used for keyboard navigation
  rows: GridRow[];
  totals: DayTotal[];
}

function periodAmount(habit: Habit, amount: number): string {
  if (habit.type === 'duration') return formatMinutes(amount);
  return formatNumber(amount, amount >= 10 ? 0 : 1);
}

function singlePeriodSummary(habit: Habit, period: PeriodProgress): RowSummary {
  if (habit.type === 'check') {
    const achieved = Math.round(period.achieved);
    const target = Math.round(period.target);
    return {
      text: `${achieved}/${target}`,
      unit: 'days',
      progress: period.progress,
      complete: period.success,
      hint: `${achieved} of ${pluralize(target, 'day')} done, ${period.success ? 'goal met' : 'goal not met yet'}.`,
    };
  }
  return {
    text: periodAmount(habit, period.achieved),
    unit: `of ${periodAmount(habit, period.target)}`,
    progress: period.progress,
    complete: period.success,
    hint: `${periodAmount(habit, period.achieved)} of ${periodAmount(habit, period.target)}, ${
      period.success ? 'goal met' : 'goal not met yet'
    }.`,
  };
}

function multiPeriodSummary(habit: Habit, periods: PeriodProgress[]): RowSummary {
  const counted = periods.filter((p) => !p.skipped && (!p.current || p.success));
  const successes = counted.filter((p) => p.success).length;
  const unit = habit.period === 'month' ? 'months' : 'weeks';
  return {
    text: `${successes}/${counted.length}`,
    unit,
    progress: counted.length > 0 ? successes / counted.length : 0,
    complete: counted.length > 0 && successes === counted.length,
    hint: `${successes} of ${counted.length} ${unit} hit the goal.`,
  };
}

function dailySummary(habit: Habit, cells: DayCell[]): RowSummary {
  let good = 0;
  let counted = 0;
  for (const cell of cells) {
    switch (cell.status) {
      case 'done':
        good++;
        counted++;
        break;
      case 'logged':
        good++;
        counted++;
        break;
      case 'partial':
      case 'missed':
      case 'pending':
        counted++;
        break;
      case 'empty':
        if (habit.kind === 'metric') counted++;
        break;
      default:
        break;
    }
  }
  const unit = habit.type === 'quit' ? 'clean' : habit.kind === 'metric' ? 'logged' : 'days';
  const hint =
    habit.type === 'quit'
      ? `${good} of ${pluralize(counted, 'day')} stayed clean.`
      : habit.kind === 'metric'
        ? `Logged on ${good} of ${pluralize(counted, 'day')}.`
        : `${good} of ${pluralize(counted, 'scheduled day')} done.`;
  return {
    text: `${good}/${counted}`,
    unit,
    progress: counted > 0 ? good / counted : 0,
    complete: counted > 0 && good === counted,
    hint,
  };
}

function summarize(habit: Habit, cells: DayCell[], data: AppData, start: DayKey, end: DayKey, ctx: EngineCtx): RowSummary {
  if (!isPeriodGoal(habit)) return dailySummary(habit, cells);
  const periods = periodsInRange(habit, data, start, end, ctx);
  if (periods.length === 0) return { text: '-', unit: '', progress: 0, complete: false, hint: 'Nothing tracked yet.' };
  if (periods.length === 1) return singlePeriodSummary(habit, periods[0]);
  return multiPeriodSummary(habit, periods);
}

const OTHER_GROUP = { id: '__other', name: 'Other', icon: '📦' };

/** `habits` should already be filtered and sorted. */
export function buildGridModel(
  habits: Habit[],
  categories: Category[],
  data: AppData,
  start: DayKey,
  end: DayKey,
  ctx: EngineCtx,
): GridModel {
  const days = eachDay(start, end);
  const rows: GridRow[] = habits.map((habit) => {
    const cells = dayCells(habit, data, start, end, ctx);
    return { habit, cells, summary: summarize(habit, cells, data, start, end, ctx) };
  });

  const byCategory = new Map<string, GridRow[]>();
  for (const row of rows) {
    const key = categories.some((c) => c.id === row.habit.categoryId) ? row.habit.categoryId : OTHER_GROUP.id;
    const list = byCategory.get(key);
    if (list) list.push(row);
    else byCategory.set(key, [row]);
  }

  const groups: GridGroup[] = [];
  for (const category of categories) {
    const list = byCategory.get(category.id);
    if (list && list.length > 0) groups.push({ id: category.id, name: category.name, icon: category.icon, rows: list });
  }
  const others = byCategory.get(OTHER_GROUP.id);
  if (others && others.length > 0) groups.push({ ...OTHER_GROUP, rows: others });

  return {
    days,
    groups,
    rows: groups.flatMap((group) => group.rows),
    totals: overallCompletionSeries(data, start, end, ctx),
  };
}

export const EMPTY_GRID_MODEL: GridModel = { days: [], groups: [], rows: [], totals: [] };

export function earliestHistoryDay(habits: Habit[], data: AppData, ctx: EngineCtx): DayKey {
  let earliest = ctx.today;
  for (const habit of habits) {
    const start = habitStartDay(habit, data, ctx);
    if (start < earliest) earliest = start;
  }
  for (const day of Object.keys(data.dayNotes)) {
    if (day < earliest && day <= ctx.today) earliest = day;
  }
  return earliest;
}
