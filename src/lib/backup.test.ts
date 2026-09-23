import { describe, expect, it, vi } from 'vitest';
import type { AppData, Habit } from '@/types';
import { blankHabit, createInitialData } from '@/lib/defaults';
import { migrate } from '@/store/store';
import { csvField, exportCsv, exportJson, parseBackup, readBackup } from './backup';

// mock formatValue so copy changes in format.ts don't break these
vi.mock('@/lib/format', () => ({
  formatValue: (habit: Habit, value: number | null | undefined) =>
    habit.type === 'check' ? (value && value > 0 ? 'Done' : 'Not done') : `${value ?? ''}${habit.unit ? ` ${habit.unit}` : ''}`,
}));

function sampleData(): AppData {
  const base = createInitialData();
  const h = (overrides: Partial<Habit> & { id: string }): Habit => ({ ...blankHabit(0, 'cat_a'), ...overrides });
  return migrate({
    ...base,
    categories: [
      { id: 'cat_a', name: 'Health, body', icon: '💪', order: 0 },
      { id: 'cat_b', name: 'Mind', icon: '🧠', order: 1 },
    ],
    habits: [
      h({ id: 'water', name: 'Water', type: 'quantity', unit: 'glasses', target: 8, order: 1 }),
      h({ id: 'vitd', name: 'Vitamin "D"', type: 'check', order: 0 }),
      h({ id: 'scroll', name: 'No Doomscrolling', type: 'quit', order: 2, categoryId: 'cat_b' }),
    ],
    logs: {
      water: {
        '2026-09-16': { value: 6, updatedAt: '2026-09-16T20:00:00.000Z' },
        '2026-09-15': { value: 2, skipped: true, note: 'sick, stayed in', updatedAt: '2026-09-15T20:00:00.000Z' },
      },
      vitd: {
        '2026-09-16': { value: 1, note: 'with\nbreakfast', updatedAt: '2026-09-16T08:00:00.000Z' },
      },
    },
    relapses: [{ id: 'r1', habitId: 'scroll', at: '2026-09-16T21:30:00.000Z', note: '=late night' }],
    dayNotes: { '2026-09-16': 'Solid day' },
  });
}

describe('JSON backups', () => {
  it('round-trips export → parse', () => {
    const data = sampleData();
    const json = exportJson(data);
    const envelope = JSON.parse(json);
    expect(envelope).toMatchObject({ app: 'cadence', version: data.version, exportedAt: expect.any(String) });
    expect(json).toContain('\n  "app": "cadence"');
    expect(parseBackup(json)).toEqual(data);
  });

  it('accepts raw AppData and a leading BOM', () => {
    const data = sampleData();
    expect(parseBackup(JSON.stringify(data))).toEqual(data);
    expect(parseBackup(`\uFEFF${exportJson(data)}`)).toEqual(data);
  });

  it('fills missing fields through migrate', () => {
    const parsed = parseBackup(JSON.stringify({ app: 'habit', version: 1, data: { habits: [{ id: 'x', name: 'Read' }] } }));
    expect(parsed.habits).toHaveLength(1);
    expect(parsed.habits[0]).toMatchObject({ id: 'x', name: 'Read', type: 'check', schedule: [0, 1, 2, 3, 4, 5, 6] });
    expect(parsed.categories.length).toBeGreaterThan(0);
    expect(parsed.settings.theme).toBe('midnight');
  });

  it('reports what the import had to drop, and never restores a running timer', () => {
    const text = JSON.stringify({
      habits: [{ id: 'a', name: 'Study', type: 'duration' }, { id: 'a', name: 'Same id' }],
      logs: {
        a: { '2026-09-16': { value: 30 }, 'someday': { value: 10 } },
        ghost: { '2026-09-16': { value: 9 }, '2026-09-15': { value: 8 } },
      },
      relapses: [{ id: 'r1', habitId: 'a', at: 'whenever' }],
      dayNotes: { '2026-09-16': 'Solid day', 'last tuesday': 'lost' },
      rewards: { unlocked: { first: '2026-09-01T00:00:00.000Z', second: 'nope' } },
      timers: { a: { habitId: 'a', startedAt: new Date().toISOString(), day: '2026-09-16' } },
    });
    const { data, dropped } = readBackup(text);

    expect(dropped).toEqual({ habits: 1, logEntries: 3, relapses: 1, dayNotes: 1, achievements: 1, timers: 1, total: 7 });
    expect(data.timers).toEqual({});
    expect(data.logs).toEqual({ a: { '2026-09-16': expect.objectContaining({ value: 30 }) } });
    expect(parseBackup(text).timers).toEqual({});
  });

  it('reports nothing dropped for a complete backup', () => {
    expect(readBackup(exportJson(sampleData())).dropped).toEqual({
      habits: 0, logEntries: 0, relapses: 0, dayNotes: 0, achievements: 0, timers: 0, total: 0,
    });
  });

  it.each([
    ['', /empty/],
    ['   ', /empty/],
    ['{not json', /isn’t valid JSON/],
    ['[1,2,3]', /doesn’t contain Cadence data/],
    ['"hello"', /doesn’t contain Cadence data/],
    [JSON.stringify({ app: 'other-tracker', data: { habits: [] } }), /different app \(“other-tracker”\)/],
    [JSON.stringify({ app: 'habit' }), /missing its data section/],
    [JSON.stringify({ app: 'habit', data: { settings: {} } }), /no habits/],
    [JSON.stringify({ settings: {} }), /no habits/],
    [JSON.stringify({ habits: 'lots' }), /habits in this file are unreadable/],
    [JSON.stringify({ habits: [{ id: 'a' }, { name: 'no id' }] }), /Habit #2 .*damaged/],
    [JSON.stringify({ habits: [], logs: [] }), /logs in this file are damaged/],
    [JSON.stringify({ habits: [], relapses: {} }), /relapse history/],
    [JSON.stringify({ habits: [], categories: 'x' }), /categories in this file are damaged/],
    [JSON.stringify({ app: 'habit', version: 99, data: { habits: [] } }), /newer version/],
    [JSON.stringify({ version: 99, habits: [] }), /newer version/],
  ])('rejects invalid input %#', (text, message) => {
    expect(() => parseBackup(text)).toThrow(message);
  });
});

describe('CSV export', () => {
  it('escapes fields per RFC 4180 and neutralizes formulas', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField(12.5)).toBe('12.5');
    expect(csvField(true)).toBe('true');
    expect(csvField(undefined)).toBe('');
    expect(csvField(null)).toBe('');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line\nbreak')).toBe('"line\nbreak"');
    expect(csvField('cr\rlf')).toBe('"cr\rlf"');
    expect(csvField(' padded ')).toBe('" padded "');
    expect(csvField('=SUM(A1:A3)', { text: true })).toBe("'=SUM(A1:A3)");
    expect(csvField('@cmd', { text: true })).toBe("'@cmd");
    expect(csvField('+1, -2', { text: true })).toBe(`"'+1, -2"`);
    expect(csvField('=not text')).toBe('=not text');
  });

  it('exports long-format rows sorted by date then habit order', () => {
    const csv = exportCsv(sampleData());
    expect(csv.endsWith('\r\n')).toBe(true);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe('date,habit,category,type,value,display_value,skipped,note');
    expect(lines.slice(1)).toEqual([
      '2026-09-15,Water,"Health, body",quantity,2,Skipped,true,"sick, stayed in"',
      '2026-09-16,"Vitamin ""D""","Health, body",check,1,Done,false,"with\nbreakfast"',
      '2026-09-16,Water,"Health, body",quantity,6,6 glasses,false,',
      expect.stringMatching(/^2026-09-16,No Doomscrolling,Mind,relapse,2026-09-16T21:30:00\.000Z,Relapse at \d\d:\d\d,false,'=late night$/),
      '2026-09-16,,,journal,,,false,Solid day',
    ]);
  });

  it('assigns relapses to their logical day', () => {
    const data = sampleData();
    const at = new Date(2026, 8, 17, 2, 15).toISOString(); // 02:15 local → previous logical day with dayStartHour 4
    const csv = exportCsv({ ...data, relapses: [{ id: 'r', habitId: 'scroll', at }], dayNotes: {} });
    const relapseLine = csv.split('\r\n').find((l) => l.includes(',relapse,'));
    expect(relapseLine?.startsWith('2026-09-16,')).toBe(true);
  });

  it('exports just the header when there is nothing logged', () => {
    expect(exportCsv(createInitialData())).toBe('date,habit,category,type,value,display_value,skipped,note\r\n');
  });
});
