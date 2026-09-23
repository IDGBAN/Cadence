import type { Habit, HabitType, Period, StreakInfo } from '@/types';
import { orderedWeekdays, WEEKDAY_LONG, WEEKDAY_SHORT } from './dates';

// NaN and Infinity render as 0 so the UI never shows "NaN"
const finite = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);
const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

const numberFormatters = new Map<string, Intl.NumberFormat>();

function numberFormatter(minFrac: number, maxFrac: number): Intl.NumberFormat {
  const key = `${minFrac}:${maxFrac}`;
  let formatter = numberFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: minFrac,
      maximumFractionDigits: maxFrac,
      signDisplay: 'negative',
    });
    numberFormatters.set(key, formatter);
  }
  return formatter;
}

function clampDigits(digits: number): number {
  return Math.max(0, Math.min(20, Math.floor(finite(digits))));
}

// tiny negatives can still come out as "-0"
function stripNegativeZero(s: string): string {
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
}

/** 90 → "1h 30m", or "1 hr 30 min" with style 'long'. */
export function formatMinutes(min: number, style: 'short' | 'long' = 'short'): string {
  const total = Math.round(finite(min));
  const abs = Math.abs(total);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const hours = formatNumber(h, 0);
  let out: string;
  if (style === 'long') out = h > 0 ? (m > 0 ? `${hours} hr ${m} min` : `${hours} hr`) : `${m} min`;
  else out = h > 0 ? (m > 0 ? `${hours}h ${m}m` : `${hours}h`) : `${m}m`;
  return total < 0 ? `-${out}` : out;
}

/** 90 → "1.5h" */
export function formatHours(min: number): string {
  return `${formatNumber(finite(min) / 60, 1)}h`;
}

/** 8000 → "8,000", 2.50 → "2.5" */
export function formatNumber(n: number, maxFrac = 1): string {
  return stripNegativeZero(numberFormatter(0, clampDigits(maxFrac)).format(finite(n)));
}

/** 0.834 → "83%" */
export function formatPercent(ratio: number, digits = 0): string {
  const d = clampDigits(digits);
  return `${stripNegativeZero(numberFormatter(d, d).format(finite(ratio) * 100))}%`;
}

function pluralWord(word: string): string {
  if (!word) return word;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}

const UNSINGULARIZABLE = new Set(['series', 'species', 'news', 'lens', 'gas', 'yes', 'abs', 'ms']);

// units are stored plural, so only singularize the obvious cases and leave the rest alone
function singularUnit(unit: string): string {
  const lower = unit.toLowerCase();
  if (unit.length <= 2 || UNSINGULARIZABLE.has(lower) || !/[a-z]$/i.test(unit)) return unit;
  if (/[^aeiou]ies$/i.test(unit)) return `${unit.slice(0, -3)}y`;
  if (/(sses|shes|ches|xes|zzes)$/i.test(unit)) return unit.slice(0, -2);
  if (/(ss|us|is)$/i.test(unit)) return unit;
  if (/s$/i.test(unit)) return unit.slice(0, -1);
  return unit;
}

function unitFor(value: number, unit: string): string {
  return value === 1 ? singularUnit(unit) : unit;
}

export function pluralize(count: number, singular: string, plural?: string): string {
  const n = finite(count);
  const word = Math.abs(n) === 1 ? singular : plural ?? pluralWord(singular);
  return `${formatNumber(n, 1)} ${word}`;
}

/** Missing values show "Not done" for checks and a dash for everything else. */
export function formatValue(habit: Habit, value: number | undefined | null): string {
  if (habit.type === 'quit') return '';
  const missing = value === null || value === undefined || !Number.isFinite(value);
  if (habit.type === 'check') return !missing && value > 0 ? 'Done' : 'Not done';
  if (missing) return '—';
  switch (habit.type) {
    case 'duration':
      return formatMinutes(value);
    case 'rating':
      return `${formatNumber(value, 1)}/${formatNumber(habit.ratingMax, 0)}`;
    default: {
      const unit = (habit.unit ?? '').trim();
      return unit ? `${formatNumber(value, 2)} ${unitFor(value, unit)}` : formatNumber(value, 2);
    }
  }
}

function compactNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${formatNumber(n / 1_000_000, 1)}M`;
  if (abs >= 1000) return `${formatNumber(n / 1000, 1)}k`;
  return formatNumber(n, 1);
}

/** Short form for dense grids. Empty string when there's nothing to show. */
export function formatValueCompact(habit: Habit, value: number | undefined | null): string {
  if (habit.type === 'quit' || value === null || value === undefined || !Number.isFinite(value)) return '';
  switch (habit.type) {
    case 'check':
      return value > 0 ? '✓' : '';
    case 'duration': {
      const minutes = Math.round(value);
      return Math.abs(minutes) < 60 ? `${minutes}m` : `${formatNumber(minutes / 60, 1)}h`;
    }
    case 'rating':
      return formatNumber(value, 1);
    default:
      return compactNumber(value);
  }
}

function perPeriod(period: Period): string {
  return period === 'week' ? 'per week' : period === 'month' ? 'per month' : 'per day';
}

/** "8 glasses per day", "3× per week", "At most 2 cups per day", "7+ out of 10" */
export function formatGoal(habit: Habit): string {
  const target = finite(habit.target);
  if (habit.type === 'quit') return target > 0 ? `${formatNumber(target, 0)}-day goal` : 'Stay clean';
  if (habit.kind === 'metric') return 'Track only';
  const period: Period = habit.type === 'rating' ? 'day' : habit.period;
  const atMost = habit.direction === 'atMost';
  switch (habit.type) {
    case 'check':
      return period === 'day' ? scheduleLabel(habit) : `${formatNumber(target, 0)}× ${perPeriod(period)}`;
    case 'rating': {
      const max = formatNumber(habit.ratingMax, 0);
      return atMost ? `≤ ${formatNumber(target, 1)} out of ${max}` : `${formatNumber(target, 1)}+ out of ${max}`;
    }
    case 'duration': {
      const amount = formatMinutes(target);
      return atMost ? `At most ${amount} ${perPeriod(period)}` : `${amount} ${perPeriod(period)}`;
    }
    default: {
      const unit = (habit.unit ?? '').trim();
      const amount = unit ? `${formatNumber(target, 2)} ${unitFor(target, unit)}` : formatNumber(target, 2);
      return atMost ? `At most ${amount} ${perPeriod(period)}` : `${amount} ${perPeriod(period)}`;
    }
  }
}

/** "Weekdays", "Mon, Wed, Fri", "Every day but Sun". Period habits get "Weekly" or "Monthly". */
export function scheduleLabel(habit: Habit, weekStartsOn: 0 | 1 = 1): string {
  const period: Period = habit.type === 'rating' || habit.type === 'quit' ? 'day' : habit.period;
  if (period === 'week') return 'Weekly';
  if (period === 'month') return 'Monthly';
  if (habit.type === 'quit') return 'Every day';

  const days = new Set<number>();
  for (const d of habit.schedule ?? []) if (Number.isInteger(d) && d >= 0 && d <= 6) days.add(d);
  if (days.size === 0 || days.size === 7) return 'Every day';
  if (days.size === 5 && [1, 2, 3, 4, 5].every((d) => days.has(d))) return 'Weekdays';
  if (days.size === 2 && days.has(0) && days.has(6)) return 'Weekends';
  if (days.size === 1) return `Every ${WEEKDAY_LONG[[...days][0]]}`;
  if (days.size === 6) {
    const missing = [0, 1, 2, 3, 4, 5, 6].find((d) => !days.has(d)) ?? 0;
    return `Every day but ${WEEKDAY_SHORT[missing]}`;
  }
  return orderedWeekdays(weekStartsOn)
    .filter(([idx]) => days.has(idx))
    .map(([, label]) => label)
    .join(', ');
}

export function periodLabel(period: Period): string {
  return period === 'week' ? 'Weekly' : period === 'month' ? 'Monthly' : 'Daily';
}

export function periodNoun(period: Period): string {
  return period === 'week' ? 'this week' : period === 'month' ? 'this month' : 'today';
}

const TYPE_LABELS: Record<HabitType, string> = {
  check: 'Yes / No',
  quantity: 'Amount',
  duration: 'Time',
  rating: 'Rating',
  quit: 'Quit',
};

export function typeLabel(type: HabitType): string {
  return TYPE_LABELS[type] ?? 'Yes / No';
}

const TYPE_DESCRIPTIONS: Record<HabitType, string> = {
  check:
    'Yes or no. One tap marks it done. Good for supplements, a daily lesson or anything you either did or didn’t.',
  quantity:
    'Count toward a number, like glasses of water or meals. Log with + and −. Set a daily, weekly or monthly target, or cap it with an “at most” limit.',
  duration:
    'Track time spent, like studying or reading. Type in hours and minutes or use the timer. Goals can be daily, weekly or monthly.',
  rating:
    'Score something on a scale, like sleep quality out of 10. Pick the score that counts as a good day and keep an eye on your average.',
  quit:
    'For something you’re trying to stop. A counter tracks your time clean and resets when you log a relapse. Your best run is always saved.',
};

export function typeDescription(type: HabitType): string {
  return TYPE_DESCRIPTIONS[type] ?? TYPE_DESCRIPTIONS.check;
}

export function formatStreak(streak: Pick<StreakInfo, 'current' | 'unit'>, which: 'current' | 'best' = 'current', best?: number): string {
  let count = streak.current;
  if (which === 'best') {
    const ownBest = (streak as Partial<StreakInfo>).best;
    count = best ?? (typeof ownBest === 'number' ? ownBest : streak.current);
  }
  return pluralize(Math.max(0, Math.floor(finite(count))), streak.unit);
}

/** full: "12d 04h 23m 09s", compact: "12d 4h" (smaller units under a day), days: "12 days" */
export function formatElapsed(ms: number, parts: 'full' | 'compact' | 'days' = 'compact'): string {
  const totalSeconds = Math.max(0, Math.floor(finite(ms) / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (parts === 'days') return pluralize(days, 'day');
  if (parts === 'full') return `${days}d ${pad2(hours)}h ${pad2(minutes)}m ${pad2(seconds)}s`;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

/** "1:02:09", or "02:09" under an hour */
export function formatStopwatch(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(finite(ms) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0 ? `${hours}:${pad2(minutes)}:${pad2(seconds)}` : `${pad2(minutes)}:${pad2(seconds)}`;
}

type CheerKind = 'done' | 'perfect' | 'streak' | 'relapse' | 'empty' | 'partial';

const CHEERS: Record<CheerKind, readonly string[]> = {
  done: [
    'Nice, one more done.',
    'Done and dusted.',
    'Small wins add up.',
    'Checked off.',
    'That’s how habits get built.',
    'Good, that one’s done.',
    'One step closer to automatic.',
    'Logged. Keep it going.',
    'You showed up. That’s most of it.',
    'Another one done.',
  ],
  perfect: [
    'Perfect day. Everything’s checked off.',
    'Clean sweep. Every habit done today.',
    '100% today. Enjoy that.',
    'Nothing left on the list.',
    'Full ring. Good day.',
    'Every single one, done.',
    'All done. Rest easy tonight.',
    'Today went exactly to plan.',
  ],
  streak: [
    'The streak lives on.',
    'Day after day. It adds up.',
    'Your streak keeps growing.',
    'Look at that run.',
    'Still going strong.',
    'Another link in the chain.',
    'Don’t break the chain now.',
    'Proof you can stick with it.',
  ],
  relapse: [
    'A slip isn’t the end. The counter restarts, and so can you.',
    'Go easy on yourself. Every attempt teaches you something.',
    'One setback doesn’t erase the progress you made.',
    'Reset and go again. You’ve done it before.',
    'The next run starts now.',
    'One slip doesn’t undo everything.',
    'Logging it honestly counts for something.',
    'Your best run is still saved. Start a new one.',
  ],
  empty: [
    'What’s one small thing you can do today?',
    'Nothing logged yet. The day’s still open.',
    'Every streak starts with day one.',
    'Pick one habit and get started.',
    'Clean slate today.',
    'Start with something small.',
    'Your first check-in is one tap away.',
    'No pressure. One thing at a time.',
  ],
  partial: [
    'Good progress. Keep going.',
    'Partway there.',
    'Some is way better than none.',
    'Nice start. The rest is doable.',
    'Every bit counts.',
    'On your way. Don’t stop now.',
    'Logged. Getting closer.',
    'It’s coming along.',
  ],
};

// FNV-1a
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Picks a message from the seed so it doesn't change on every render. */
export function cheer(kind: 'done' | 'perfect' | 'streak' | 'relapse' | 'empty' | 'partial', seed: string): string {
  const list = CHEERS[kind] ?? CHEERS.done;
  return list[hashString(`${kind}:${seed}`) % list.length];
}
