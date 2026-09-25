import { describe, expect, it } from 'vitest';
import {
  addDays, addMonths, diffDays, eachDay, endOfMonth, endOfWeek, formatRange, fromDateTimeLocalValue, logicalDayOf,
  logicalToday, relativeDayLabel, startOfWeek, toDateTimeLocalValue, weekday,
} from './dates';

describe('logical days', () => {
  it('counts the small hours as the previous day', () => {
    const lateNight = new Date(2026, 8, 18, 1, 30);
    expect(logicalToday(0, lateNight)).toBe('2026-09-18');
    expect(logicalToday(4, lateNight)).toBe('2026-09-17');
    expect(logicalToday(4, new Date(2026, 8, 18, 4, 0))).toBe('2026-09-18');
    expect(logicalDayOf(lateNight.toISOString(), 4)).toBe('2026-09-17');
  });

  it('rolls back across a month and a year', () => {
    expect(logicalToday(4, new Date(2026, 0, 1, 2, 0))).toBe('2025-12-31');
  });
});

describe('day arithmetic', () => {
  it('adds days across month ends and leap days', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('clamps addMonths to the end of shorter months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('keeps whole days across DST changes', () => {
    // spring forward and fall back in most northern zones
    expect(diffDays('2026-03-07', '2026-03-09')).toBe(2);
    expect(diffDays('2026-10-31', '2026-11-02')).toBe(2);
    expect(eachDay('2026-03-07', '2026-03-10')).toEqual(['2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10']);
    expect(eachDay('2026-03-10', '2026-03-07')).toEqual([]);
  });

  it('finds week and month bounds', () => {
    expect(weekday('2026-09-17')).toBe(4);
    expect(startOfWeek('2026-09-17', 1)).toBe('2026-09-14');
    expect(startOfWeek('2026-09-17', 0)).toBe('2026-09-13');
    expect(startOfWeek('2026-09-13', 1)).toBe('2026-09-07');
    expect(endOfWeek('2026-09-17', 0)).toBe('2026-09-19');
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
  });
});

describe('labels', () => {
  it('formats ranges within and across months and years', () => {
    expect(formatRange('2026-09-14', '2026-09-20')).toBe('Sep 14-20');
    expect(formatRange('2026-09-28', '2026-10-04')).toBe('Sep 28 - Oct 4');
    expect(formatRange('2026-12-28', '2027-01-03')).toBe('Dec 28, 2026 - Jan 3, 2027');
  });

  it('names nearby days', () => {
    expect(relativeDayLabel('2026-09-17', '2026-09-17')).toBe('Today');
    expect(relativeDayLabel('2026-09-16', '2026-09-17')).toBe('Yesterday');
    expect(relativeDayLabel('2026-09-18', '2026-09-17')).toBe('Tomorrow');
    expect(relativeDayLabel('2026-09-12', '2026-09-17')).toBe('5 days ago');
    expect(relativeDayLabel('2026-09-01', '2026-09-17')).toBe('Tue, Sep 1');
  });
});

describe('datetime-local values', () => {
  it('round-trips a local time', () => {
    const iso = new Date(2026, 8, 17, 21, 5).toISOString();
    expect(toDateTimeLocalValue(iso)).toBe('2026-09-17T21:05');
    expect(fromDateTimeLocalValue('2026-09-17T21:05')).toBe(iso);
  });

  it('returns an empty string instead of throwing on bad input', () => {
    expect(fromDateTimeLocalValue('')).toBe('');
    expect(fromDateTimeLocalValue('not a date')).toBe('');
    expect(toDateTimeLocalValue('')).toBe('');
  });
});
