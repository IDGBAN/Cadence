import type { AppData, DayKey, Relapse } from '@/types';
import { fromDayKey, logicalDayOf } from '@/lib/dates';
import { relapsesFor } from '@/lib/habitMath';

export function isoAt(day: DayKey, hours: number, minutes: number): string {
  const d = fromDayKey(day);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

// now if `day` is today, otherwise noon so it never lands outside the day being edited
export function defaultRelapseAt(day: DayKey, dayStartHour: number, now = new Date()): string {
  return logicalDayOf(now, dayStartHour) === day ? now.toISOString() : isoAt(day, 12, 0);
}

export function relapsesOnDay(data: AppData, habitId: string, day: DayKey, dayStartHour: number): Relapse[] {
  return relapsesFor(data, habitId).filter((relapse) => {
    const at = new Date(relapse.at);
    return !Number.isNaN(at.getTime()) && logicalDayOf(at, dayStartHour) === day;
  });
}

export function relapsesByDayIndex(data: AppData, dayStartHour: number): Map<DayKey, Relapse[]> {
  const index = new Map<DayKey, Relapse[]>();
  for (const relapse of data.relapses) {
    const at = new Date(relapse.at);
    if (Number.isNaN(at.getTime())) continue;
    const day = logicalDayOf(at, dayStartHour);
    const list = index.get(day);
    if (list) list.push(relapse);
    else index.set(day, [relapse]);
  }
  for (const list of index.values()) list.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return index;
}
