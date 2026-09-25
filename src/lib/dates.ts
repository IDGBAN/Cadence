// Day keys are local "YYYY-MM-DD" strings. Don't build them with toISOString(),
// that's UTC and gives the wrong day around midnight.
import type { DayKey } from '@/types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toDayKey(d: Date): DayKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDayKey(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** With dayStartHour = 4, 01:30 on Sep 18 still counts as Sep 17. */
export function logicalToday(dayStartHour = 0, now: Date = new Date()): DayKey {
  const shifted = new Date(now.getTime());
  shifted.setHours(shifted.getHours() - dayStartHour);
  return toDayKey(shifted);
}

export function logicalDayOf(date: Date | string, dayStartHour = 0): DayKey {
  const d = typeof date === 'string' ? new Date(date) : date;
  return logicalToday(dayStartHour, d);
}

export function addDays(key: DayKey, n: number): DayKey {
  const d = fromDayKey(key);
  d.setDate(d.getDate() + n);
  return toDayKey(d);
}

export function addMonths(key: DayKey, n: number): DayKey {
  const d = fromDayKey(key);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const max = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, max));
  return toDayKey(d);
}

/** b - a in whole days. Uses UTC so DST can't skew it. */
export function diffDays(a: DayKey, b: DayKey): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** 0 = Sunday .. 6 = Saturday */
export function weekday(key: DayKey): number {
  return fromDayKey(key).getDay();
}

export function eachDay(start: DayKey, end: DayKey): DayKey[] {
  const out: DayKey[] = [];
  if (end < start) return out;
  let cur = start;
  // guard against runaway loops
  for (let i = 0; i < 20000 && cur <= end; i++) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function startOfWeek(key: DayKey, weekStartsOn: 0 | 1 = 1): DayKey {
  const wd = weekday(key);
  const delta = (wd - weekStartsOn + 7) % 7;
  return addDays(key, -delta);
}

export function endOfWeek(key: DayKey, weekStartsOn: 0 | 1 = 1): DayKey {
  return addDays(startOfWeek(key, weekStartsOn), 6);
}

export function startOfMonth(key: DayKey): DayKey {
  return `${key.slice(0, 7)}-01`;
}

export function endOfMonth(key: DayKey): DayKey {
  const d = fromDayKey(key);
  return toDayKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** [weekdayIndex, label] pairs, starting at weekStartsOn. */
export function orderedWeekdays(weekStartsOn: 0 | 1 = 1): Array<[number, string]> {
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return Array.from({ length: 7 }, (_, i) => {
    const idx = (i + weekStartsOn) % 7;
    return [idx, labels[idx]] as [number, string];
  });
}

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "Thu, Sep 17" */
export function formatDayShort(key: DayKey): string {
  const d = fromDayKey(key);
  return `${WEEKDAY_SHORT[d.getDay()]}, ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/** "Thursday, September 17, 2026" */
export function formatDayLong(key: DayKey): string {
  const d = fromDayKey(key);
  return `${WEEKDAY_LONG[d.getDay()]}, ${MONTH_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "Sep 17" */
export function formatMonthDay(key: DayKey): string {
  const d = fromDayKey(key);
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/** "September 2026" */
export function formatMonthYear(key: DayKey): string {
  const d = fromDayKey(key);
  return `${MONTH_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Sep 14-20" or "Sep 28 - Oct 4" */
export function formatRange(start: DayKey, end: DayKey): string {
  const a = fromDayKey(start);
  const b = fromDayKey(end);
  if (a.getFullYear() !== b.getFullYear()) {
    return `${MONTH_SHORT[a.getMonth()]} ${a.getDate()}, ${a.getFullYear()} - ${MONTH_SHORT[b.getMonth()]} ${b.getDate()}, ${b.getFullYear()}`;
  }
  if (a.getMonth() === b.getMonth()) return `${MONTH_SHORT[a.getMonth()]} ${a.getDate()}-${b.getDate()}`;
  return `${MONTH_SHORT[a.getMonth()]} ${a.getDate()} - ${MONTH_SHORT[b.getMonth()]} ${b.getDate()}`;
}

export function relativeDayLabel(key: DayKey, today: DayKey): string {
  const diff = diffDays(today, key);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  if (diff < 0 && diff >= -6) return `${-diff} days ago`;
  return formatDayShort(key);
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Good night';
}

/** "HH:mm" in local time */
export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ISO -> value for <input type="datetime-local">, or '' if the date is invalid */
export function toDateTimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return `${toDayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value -> ISO, or '' when the field is empty or invalid */
export function fromDateTimeLocalValue(v: string): string {
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : '';
}
