import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppData, Habit } from '@/types';
import { blankHabit, createInitialData, DATA_VERSION, DEFAULT_SETTINGS } from '@/lib/defaults';
import { migrate } from '@/lib/migrate';
import { createDebouncedStorage, type StorageIssue } from './persistence';
import { clearHistory, countLogValueChanges, flushPersistence, syncFromOtherTab, useStore } from './store';

const DAY = '2026-09-17';
const PREV = '2026-09-16';

function habit(overrides: Partial<Habit> & { id: string }): Habit {
  return { ...blankHabit(0, 'cat_a'), name: overrides.id, ...overrides };
}

function fixture(): AppData {
  const base = createInitialData();
  return {
    ...base,
    categories: [
      { id: 'cat_a', name: 'Alpha', icon: '🅰️', order: 0 },
      { id: 'cat_b', name: 'Beta', icon: '🅱️', order: 1 },
    ],
    habits: [
      habit({ id: 'vitd', type: 'check', order: 0 }),
      habit({ id: 'water', type: 'quantity', target: 8, unit: 'glasses', order: 1 }),
      habit({ id: 'coffee', type: 'quantity', direction: 'atMost', target: 2, unit: 'cups', order: 2, categoryId: 'cat_b' }),
      habit({ id: 'study', type: 'duration', target: 120, step: 15, order: 3, categoryId: 'cat_b' }),
      habit({ id: 'sleep', type: 'rating', target: 7, ratingMax: 10, order: 4 }),
      habit({ id: 'scroll', type: 'quit', target: 30, order: 5 }),
    ],
  };
}

const state = () => useStore.getState();
const data = () => state().data;
const entry = (habitId: string, day = DAY) => data().logs[habitId]?.[day];

beforeAll(async () => {
  await vi.waitFor(() => {
    if (!state().hydrated) throw new Error('store not hydrated yet');
  });
});

beforeEach(() => {
  useStore.setState({ data: fixture() });
  clearHistory();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('setLog', () => {
  it('creates, patches and removes entries', () => {
    state().setLog('water', DAY, { value: 3 });
    expect(entry('water')).toMatchObject({ value: 3 });
    expect(entry('water')?.updatedAt).toEqual(expect.any(String));

    state().setLog('water', DAY, { note: 'with lemon' });
    expect(entry('water')).toMatchObject({ value: 3, note: 'with lemon' });

    state().setLog('water', DAY, { value: 0 });
    expect(entry('water')).toMatchObject({ value: 0, note: 'with lemon' });

    state().setLog('water', DAY, { note: '   ' });
    expect(entry('water')).toBeUndefined();
    expect(data().logs.water).toBeUndefined();
  });

  it('keeps value-0 entries for atMost goal habits', () => {
    state().setLog('coffee', DAY, { value: 0 });
    expect(entry('coffee')).toMatchObject({ value: 0 });
    state().setLog('coffee', DAY, { value: 3 });
    state().setLog('coffee', DAY, { value: 0 });
    expect(entry('coffee')).toMatchObject({ value: 0 });
  });

  it('keeps skipped entries and their value', () => {
    state().setLog('water', DAY, { value: 5 });
    state().setLog('water', DAY, { skipped: true, note: 'sick' });
    expect(entry('water')).toMatchObject({ value: 5, skipped: true, note: 'sick' });
    state().setLog('water', PREV, { skipped: true });
    expect(entry('water', PREV)).toMatchObject({ value: 0, skipped: true });
  });

  it('sanitizes values per habit type', () => {
    state().setLog('water', DAY, { value: 2.3456 });
    expect(entry('water')?.value).toBe(2.35);
    state().setLog('water', PREV, { value: -4 });
    expect(entry('water', PREV)).toBeUndefined();
    state().setLog('study', DAY, { value: 12.345 });
    expect(entry('study')?.value).toBe(12.3);
    state().setLog('sleep', DAY, { value: 14 });
    expect(entry('sleep')?.value).toBe(10);
    state().setLog('sleep', PREV, { value: 0.4 });
    expect(entry('sleep', PREV)?.value).toBe(1);
    state().setLog('vitd', DAY, { value: 5 });
    expect(entry('vitd')?.value).toBe(1);
    state().setLog('water', '2026-09-15', { value: Number.NaN, note: 'n/a' });
    expect(entry('water', '2026-09-15')?.value).toBe(0);
  });

  it('only replaces the touched branches and ignores invalid input', () => {
    state().setLog('vitd', PREV, { value: 1 });
    const before = data();
    state().setLog('water', DAY, { value: 1 });
    const after = data();
    expect(after).not.toBe(before);
    expect(after.logs.vitd).toBe(before.logs.vitd);
    expect(after.habits).toBe(before.habits);
    expect(after.settings).toBe(before.settings);

    state().setLog('water', DAY, { value: 1 });
    expect(data()).toBe(after);
    state().setLog('missing', DAY, { value: 1 });
    state().setLog('water', '2026-02-30', { value: 1 });
    state().setLog('water', 'yesterday', { value: 1 });
    expect(data()).toBe(after);
  });

  it('does not trim notes', () => {
    state().setLog('vitd', DAY, { note: 'felt ' });
    expect(entry('vitd')).toMatchObject({ value: 0, note: 'felt ' });
  });

  it('clearLog removes value, note and skip', () => {
    state().setLog('water', DAY, { value: 4, note: 'x', skipped: true });
    state().clearLog('water', DAY);
    expect(entry('water')).toBeUndefined();
  });
});

describe('adjustLog', () => {
  it('adds deltas with 2-decimal rounding and floors at zero', () => {
    state().adjustLog('water', DAY, 0.1);
    state().adjustLog('water', DAY, 0.2);
    expect(entry('water')?.value).toBe(0.3);
    state().adjustLog('water', DAY, -1);
    expect(entry('water')).toBeUndefined();
  });

  it('keeps zero for atMost habits and clamps ratings', () => {
    state().adjustLog('coffee', DAY, 1);
    state().adjustLog('coffee', DAY, -1);
    expect(entry('coffee')).toMatchObject({ value: 0 });

    state().setLog('sleep', DAY, { value: 10 });
    const before = data();
    state().adjustLog('sleep', DAY, 1);
    expect(data()).toBe(before);
  });

  it('un-skips on a positive delta only', () => {
    state().setLog('water', DAY, { value: 2, skipped: true });
    state().adjustLog('water', DAY, -1);
    expect(entry('water')).toMatchObject({ value: 1, skipped: true });
    state().adjustLog('water', DAY, 1);
    expect(entry('water')).toMatchObject({ value: 2 });
    expect(entry('water')?.skipped).toBeUndefined();
  });

  it('ignores zero and non-finite deltas', () => {
    const before = data();
    state().adjustLog('water', DAY, 0);
    state().adjustLog('water', DAY, Number.POSITIVE_INFINITY);
    expect(data()).toBe(before);
  });
});

describe('toggleCheck', () => {
  it('toggles, keeping the entry only if it has a note', () => {
    state().toggleCheck('vitd', DAY);
    expect(entry('vitd')).toMatchObject({ value: 1 });
    state().toggleCheck('vitd', DAY);
    expect(entry('vitd')).toBeUndefined();

    state().setLog('vitd', DAY, { note: 'with breakfast' });
    state().toggleCheck('vitd', DAY);
    expect(entry('vitd')).toMatchObject({ value: 1, note: 'with breakfast' });
    state().toggleCheck('vitd', DAY);
    expect(entry('vitd')).toMatchObject({ value: 0, note: 'with breakfast' });
  });

  it('clears skipped and marks done', () => {
    state().setSkipped('vitd', DAY, true);
    state().toggleCheck('vitd', DAY);
    expect(entry('vitd')).toMatchObject({ value: 1 });
    expect(entry('vitd')?.skipped).toBeUndefined();
  });
});

describe('setSkipped', () => {
  it('keeps the value when skipping and removes empty days when unskipping', () => {
    state().setLog('water', DAY, { value: 6 });
    state().setSkipped('water', DAY, true);
    expect(entry('water')).toMatchObject({ value: 6, skipped: true });
    state().setSkipped('water', DAY, false);
    expect(entry('water')).toMatchObject({ value: 6 });

    state().setSkipped('vitd', DAY, true);
    expect(entry('vitd')).toMatchObject({ value: 0, skipped: true });
    state().setSkipped('vitd', DAY, false);
    expect(entry('vitd')).toBeUndefined();
  });

  it('setSkippedMany is a single undo step', () => {
    state().setLog('water', DAY, { value: 3 });
    state().setSkippedMany(['vitd', 'water', 'missing'], DAY, true);
    expect(entry('vitd')).toMatchObject({ value: 0, skipped: true });
    expect(entry('water')).toMatchObject({ value: 3, skipped: true });

    state().undo();
    expect(entry('vitd')).toBeUndefined();
    expect(entry('water')).toMatchObject({ value: 3 });
    expect(entry('water')?.skipped).toBeUndefined();

    const before = data();
    state().setSkippedMany([], DAY, true);
    expect(data()).toBe(before);
  });

  it('setSkippedMany does not overwrite existing notes', () => {
    state().setLog('water', DAY, { value: 2, note: 'Had a headache' });
    state().setSkippedMany(['vitd', 'water'], DAY, true, '  Sick ');
    expect(entry('vitd')).toMatchObject({ skipped: true, note: 'Sick' });
    expect(entry('water')).toMatchObject({ value: 2, skipped: true, note: 'Had a headache' });
  });
});

describe('relapses', () => {
  it('adds relapses sorted by time', () => {
    const late = state().addRelapse('scroll', '2026-09-10T22:00:00.000Z', 'late night');
    const early = state().addRelapse('scroll', '2026-09-01T08:30:00.000Z');
    expect(late).toMatchObject({ habitId: 'scroll', at: '2026-09-10T22:00:00.000Z', note: 'late night' });
    expect(early.note).toBeUndefined();
    expect(data().relapses.map((r) => r.id)).toEqual([early.id, late.id]);
  });

  it('defaults `at` to now', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T12:00:00.000Z'));
    const r = state().addRelapse('scroll');
    expect(r.at).toBe('2026-09-17T12:00:00.000Z');
  });

  it('re-sorts on update and deletes by id', () => {
    const a = state().addRelapse('scroll', '2026-09-01T10:00:00.000Z');
    const b = state().addRelapse('scroll', '2026-09-05T10:00:00.000Z');
    const c = state().addRelapse('scroll', '2026-09-09T10:00:00.000Z');
    state().updateRelapse(a.id, { at: '2026-09-12T10:00:00.000Z', note: 'moved' });
    expect(data().relapses.map((r) => r.id)).toEqual([b.id, c.id, a.id]);
    expect(data().relapses[2]).toMatchObject({ note: 'moved' });

    state().updateRelapse(a.id, { note: '' });
    expect(data().relapses[2].note).toBeUndefined();

    state().deleteRelapse(c.id);
    expect(data().relapses.map((r) => r.id)).toEqual([b.id, a.id]);
  });

  it('ignores relapses for unknown habits and invalid updates', () => {
    state().addRelapse('nope', '2026-09-01T10:00:00.000Z');
    expect(data().relapses).toHaveLength(0);
    const r = state().addRelapse('scroll', '2026-09-01T10:00:00.000Z');
    const before = data();
    state().updateRelapse(r.id, { at: 'not a date' });
    expect(data()).toBe(before);
  });
});

describe('timers', () => {
  const start = new Date(2026, 8, 17, 10, 0, 0);

  it('credits rounded minutes to the start day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(start);
    state().setLog('study', DAY, { value: 30 });
    state().startTimer('study', DAY);
    const timer = data().timers.study;
    expect(timer).toMatchObject({ habitId: 'study', day: DAY, startedAt: start.toISOString() });

    vi.setSystemTime(new Date(start.getTime() + 60_000));
    state().startTimer('study', DAY);
    expect(data().timers.study).toBe(timer);

    vi.setSystemTime(new Date(start.getTime() + 25 * 60_000 + 40_000));
    expect(state().stopTimer('study')).toBe(26);
    expect(data().timers.study).toBeUndefined();
    expect(entry('study')?.value).toBe(56);
    expect(state().stopTimer('study')).toBe(0);
  });

  it('ignores runs under 30s', () => {
    vi.useFakeTimers();
    vi.setSystemTime(start);
    state().startTimer('study', DAY);
    vi.setSystemTime(new Date(start.getTime() + 29_000));
    expect(state().stopTimer('study')).toBe(0);
    expect(entry('study')).toBeUndefined();

    state().startTimer('study', DAY);
    vi.setSystemTime(new Date(start.getTime() + 29_000 + 30_000));
    expect(state().stopTimer('study')).toBe(1);
    expect(entry('study')?.value).toBe(1);
  });

  it('caps a forgotten timer at what was left of its day', () => {
    vi.useFakeTimers();
    // logical day ends at 04:00, so 6h are left
    const late = new Date(2026, 8, 17, 22, 0, 0);
    vi.setSystemTime(late);
    state().startTimer('study', DAY);

    vi.setSystemTime(new Date(late.getTime() + 7 * 24 * 3600_000));
    expect(state().stopTimer('study')).toBe(6 * 60);
    expect(entry('study')?.value).toBe(6 * 60);
  });

  it('caps a timer started for an earlier day at 12 h', () => {
    vi.useFakeTimers();
    vi.setSystemTime(start);
    state().startTimer('study', PREV);
    vi.setSystemTime(new Date(start.getTime() + 30 * 3600_000));
    expect(state().stopTimer('study')).toBe(12 * 60);
    expect(entry('study', PREV)?.value).toBe(12 * 60);
  });

  it('only runs for duration habits, and cancel logs nothing', () => {
    state().startTimer('water', DAY);
    expect(data().timers.water).toBeUndefined();
    state().startTimer('study', DAY);
    state().cancelTimer('study');
    expect(data().timers.study).toBeUndefined();
    expect(entry('study')).toBeUndefined();
  });

  it('start is not undoable, undoing a stop restores the timer', () => {
    vi.useFakeTimers();
    vi.setSystemTime(start);
    state().startTimer('study', DAY);
    expect(state().canUndo).toBe(false);
    vi.setSystemTime(new Date(start.getTime() + 10 * 60_000));
    state().stopTimer('study');
    expect(state().canUndo).toBe(true);
    state().undo();
    expect(entry('study')).toBeUndefined();
    expect(data().timers.study).toMatchObject({ startedAt: start.toISOString() });
    state().redo();
    expect(entry('study')?.value).toBe(10);
    expect(data().timers.study).toBeUndefined();
  });
});

describe('habits', () => {
  it('deleteHabit removes its logs, relapses and timer', () => {
    state().setLog('study', DAY, { value: 30 });
    state().setLog('water', DAY, { value: 2 });
    state().startTimer('study', DAY);
    const r = state().addRelapse('scroll', '2026-09-01T10:00:00.000Z');
    state().deleteHabit('study');
    expect(data().habits.some((h) => h.id === 'study')).toBe(false);
    expect(data().logs.study).toBeUndefined();
    expect(data().timers.study).toBeUndefined();
    expect(entry('water')?.value).toBe(2);
    expect(data().relapses).toEqual([r]);

    state().deleteHabit('scroll');
    expect(data().relapses).toEqual([]);
  });

  it('duplicateHabit inserts a fresh copy right after the original', () => {
    state().setLog('water', DAY, { value: 3 });
    const copy = state().duplicateHabit('water');
    expect(copy).toBeDefined();
    const sorted = [...data().habits].sort((a, b) => a.order - b.order);
    expect(sorted.map((h) => h.order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(sorted[1].id).toBe('water');
    expect(sorted[2]).toEqual(copy);
    expect(copy).toMatchObject({ name: 'water (copy)', type: 'quantity', target: 8, unit: 'glasses', archived: false });
    expect(copy?.id).not.toBe('water');
    expect(data().logs[copy!.id]).toBeUndefined();
    expect(state().duplicateHabit('missing')).toBeUndefined();
  });

  it('reorderHabits puts listed ids first', () => {
    state().reorderHabits(['sleep', 'ghost', 'vitd', 'sleep']);
    const ids = [...data().habits].sort((a, b) => a.order - b.order).map((h) => h.id);
    expect(ids).toEqual(['sleep', 'vitd', 'water', 'coffee', 'study', 'scroll']);
    expect([...data().habits].map((h) => h.order).sort()).toEqual([0, 1, 2, 3, 4, 5]);

    const before = data();
    state().reorderHabits(['sleep', 'vitd']);
    expect(data()).toBe(before);
  });

  it('addHabit / updateHabit normalize input', () => {
    const h = habit({ id: 'new', type: 'rating', period: 'week', schedule: [], ratingMax: 5, target: 9, categoryId: 'nope', order: 9 });
    state().addHabit(h);
    const added = data().habits.find((x) => x.id === 'new');
    expect(added).toMatchObject({ period: 'day', schedule: [0, 1, 2, 3, 4, 5, 6], target: 5, categoryId: 'cat_a' });

    state().addHabit(habit({ id: 'new', name: 'dup id' }));
    expect(data().habits.find((x) => x.name === 'dup id')?.id).not.toBe('new');

    state().updateHabit('water', { kind: 'metric', step: 0, schedule: [3, 1, 1] });
    expect(data().habits.find((x) => x.id === 'water')).toMatchObject({ kind: 'metric', step: 1, schedule: [1, 3] });
    state().updateHabit('vitd', { kind: 'metric' });
    expect(data().habits.find((x) => x.id === 'vitd')?.kind).toBe('goal');

    const before = data();
    state().updateHabit('water', { schedule: [1, 3] });
    expect(data()).toBe(before);
  });

  it('setArchived archives and stops a running timer', () => {
    state().startTimer('study', DAY);
    state().setArchived('study', true);
    expect(data().habits.find((h) => h.id === 'study')?.archived).toBe(true);
    expect(data().timers.study).toBeUndefined();
  });

  it('updateHabit rewrites logged values when the type changes', () => {
    state().setLog('water', DAY, { value: 7, note: 'with lemon' });
    state().setLog('water', PREV, { value: 5 });
    const logged = data().logs.water;

    state().updateHabit('water', { type: 'check' });
    expect(entry('water')).toMatchObject({ value: 1, note: 'with lemon' });
    expect(entry('water', PREV)?.value).toBe(1);
    expect(migrate(data()).logs.water).toEqual(data().logs.water);

    state().undo();
    expect(data().logs.water).toEqual(logged);
  });

  it('updateHabit clamps logged values to a lowered rating scale', () => {
    state().setLog('sleep', DAY, { value: 9 });
    state().setLog('sleep', PREV, { value: 4 });
    expect(countLogValueChanges(data(), 'sleep', { type: 'rating', ratingMax: 5 })).toBe(1);

    state().updateHabit('sleep', { ratingMax: 5 });
    expect(entry('sleep')?.value).toBe(5);
    expect(entry('sleep', PREV)?.value).toBe(4);

    const unchanged = entry('sleep', PREV);
    state().updateHabit('sleep', { ratingMax: 4 });
    expect(entry('sleep', PREV)).toBe(unchanged);
    expect(entry('sleep')?.value).toBe(4);
  });

  it('updateHabit leaves logs alone otherwise', () => {
    state().setLog('water', DAY, { value: 7 });
    const logs = data().logs;
    state().updateHabit('water', { name: 'Hydration', target: 10 });
    expect(data().logs).toBe(logs);
    expect(countLogValueChanges(data(), 'water', { type: 'quantity', ratingMax: 10 })).toBe(0);
  });
});

describe('categories', () => {
  it('deleteCategory moves habits to the chosen or first remaining category', () => {
    const c = state().addCategory({ name: '  Gamma ', icon: '' });
    expect(c).toMatchObject({ name: 'Gamma', icon: '📁', order: 2 });

    state().deleteCategory('cat_b', c.id);
    expect(data().categories.map((x) => x.id)).toEqual(['cat_a', c.id]);
    expect(data().habits.filter((h) => h.categoryId === c.id).map((h) => h.id)).toEqual(['coffee', 'study']);

    state().deleteCategory(c.id);
    expect(data().habits.every((h) => h.categoryId === 'cat_a')).toBe(true);
  });

  it('never deletes the last category', () => {
    state().deleteCategory('cat_b');
    const before = data();
    state().deleteCategory('cat_a');
    expect(data()).toBe(before);
    expect(data().categories).toHaveLength(1);
  });

  it('reorders and updates categories', () => {
    state().reorderCategories(['cat_b']);
    expect(data().categories.find((c) => c.id === 'cat_b')?.order).toBe(0);
    state().updateCategory('cat_a', { name: 'Renamed', icon: '   ' });
    expect(data().categories.find((c) => c.id === 'cat_a')).toMatchObject({ name: 'Renamed', icon: '🅰️' });
  });
});

describe('journal, settings & rewards', () => {
  it('setDayNote sets and removes notes', () => {
    state().setDayNote(DAY, 'Great day');
    expect(data().dayNotes[DAY]).toBe('Great day');
    state().setDayNote(DAY, '  ');
    expect(DAY in data().dayNotes).toBe(false);
  });

  it('updateSettings sanitizes values', () => {
    state().updateSettings({ theme: 'daylight', dayStartHour: 9, weekStartsOn: 5 as unknown as 0 });
    expect(data().settings).toMatchObject({ theme: 'daylight', dayStartHour: 6, weekStartsOn: DEFAULT_SETTINGS.weekStartsOn });
    const before = data();
    state().updateSettings({ theme: 'daylight' });
    expect(data()).toBe(before);
  });

  it('rewards mutations stamp once', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T09:00:00.000Z'));
    state().unlockAchievements(['first-log', 'first-log']);
    vi.setSystemTime(new Date('2026-09-18T09:00:00.000Z'));
    state().unlockAchievements(['first-log', 'streak-7']);
    expect(data().rewards.unlocked).toEqual({ 'first-log': '2026-09-17T09:00:00.000Z', 'streak-7': '2026-09-18T09:00:00.000Z' });

    state().setLastSeenLevel(4.7);
    expect(data().rewards.lastSeenLevel).toBe(4);
    state().markPerfectDayCelebrated(DAY);
    state().markPerfectDayCelebrated(PREV);
    state().markPerfectDayCelebrated(DAY);
    expect(data().rewards.celebratedPerfectDays).toEqual([PREV, DAY]);
    expect(state().canUndo).toBe(false);
  });
});

describe('undo / redo', () => {
  it('undoes and redoes log mutations; a new mutation clears redo', () => {
    state().setLog('water', DAY, { value: 3 });
    state().adjustLog('water', DAY, 1);
    expect(state()).toMatchObject({ canUndo: true, canRedo: false });

    state().undo();
    expect(entry('water')?.value).toBe(3);
    expect(state().canRedo).toBe(true);
    state().undo();
    expect(entry('water')).toBeUndefined();
    expect(state().canUndo).toBe(false);

    state().redo();
    expect(entry('water')?.value).toBe(3);
    state().toggleCheck('vitd', DAY);
    expect(state().canRedo).toBe(false);
    state().redo();
    expect(entry('water')?.value).toBe(3);
  });

  it('ignores non-undoable changes', () => {
    state().setLog('water', DAY, { value: 3 });
    state().undo();
    expect(state().canRedo).toBe(true);

    state().updateSettings({ theme: 'oled' });
    state().setOnboarded(true);
    state().markBackup();
    expect(state()).toMatchObject({ canUndo: false, canRedo: true });

    state().redo();
    expect(entry('water')?.value).toBe(3);
    state().startTimer('study', DAY);
    state().undo();
    expect(entry('water')).toBeUndefined();
    expect(data().settings.theme).toBe('oled');
    expect(data().meta.onboarded).toBe(true);
    expect(data().meta.lastBackupAt).toEqual(expect.any(String));
    expect(data().timers.study).toBeDefined();
  });

  it('undo of a habit deletion restores habit, logs and relapses', () => {
    state().setLog('scroll', DAY, { note: 'hard day' });
    state().addRelapse('scroll', '2026-09-10T22:00:00.000Z');
    const snapshot = data();
    state().deleteHabit('scroll');
    state().undo();
    expect(data().habits).toBe(snapshot.habits);
    expect(data().logs).toBe(snapshot.logs);
    expect(data().relapses).toBe(snapshot.relapses);
  });

  it('undoes imports and resets, including their settings changes', () => {
    state().setLog('water', DAY, { value: 5 });
    const original = data();
    const imported = migrate({ ...fixture(), habits: [], settings: { ...DEFAULT_SETTINGS, accent: 'rose' } });
    state().replaceData(imported);
    expect(data().habits).toHaveLength(0);
    expect(data().settings.accent).toBe('rose');
    state().undo();
    expect(data().habits).toBe(original.habits);
    expect(data().settings.accent).toBe(original.settings.accent);

    state().updateSettings({ theme: 'dusk' });
    state().resetData();
    expect(data().logs).toEqual({});
    expect(data().settings.theme).toBe('dusk');
    state().undo();
    expect(entry('water')?.value).toBe(5);
  });

  it('keeps at most 50 undo steps', () => {
    for (let i = 1; i <= 60; i++) state().setLog('water', DAY, { value: i });
    let steps = 0;
    while (state().canUndo) {
      state().undo();
      steps++;
    }
    expect(steps).toBe(50);
    expect(entry('water')?.value).toBe(10);
  });

  it('does not record no-op mutations', () => {
    state().clearLog('water', DAY);
    state().deleteHabit('missing');
    state().setDayNote(DAY, '');
    expect(state().canUndo).toBe(false);
  });
});

describe('migrate', () => {
  it('returns fresh initial data for garbage input', () => {
    for (const garbage of [null, undefined, 'x', 42, [], true]) {
      const d = migrate(garbage);
      expect(d.version).toBe(DATA_VERSION);
      expect(d.habits.length).toBeGreaterThan(0);
      expect(d.categories.length).toBeGreaterThan(0);
      expect(d.settings).toEqual(DEFAULT_SETTINGS);
      expect(d.meta.onboarded).toBe(false);
    }
  });

  it('is idempotent on valid data', () => {
    const initial = createInitialData();
    expect(migrate(initial)).toEqual(initial);
    state().setLog('water', DAY, { value: 3, note: 'hi' });
    state().addRelapse('scroll', '2026-09-10T22:00:00.000Z');
    state().setDayNote(DAY, 'note');
    const once = migrate(data());
    expect(migrate(once)).toEqual(once);
    expect(once).toEqual(data());
  });

  it('fills and repairs partial data', () => {
    const d = migrate({
      habits: [
        { id: 'a', name: 'Sleep', type: 'rating', period: 'month', ratingMax: 'ten', target: 50, schedule: [], kind: 'metric' },
        { id: 'b', type: 'check', kind: 'metric', step: 0, schedule: [9, 2, 2, -1], categoryId: 'ghost' },
        { id: 'c', type: 'quit', period: 'week', createdAt: '2026-01-02T12:00:00.000Z' },
        { id: 'd', type: 'nonsense', color: 'plaid', target: -3, order: 'first' },
        { id: 'a', name: 'duplicate id' },
        'not a habit',
      ],
      categories: [{ id: 'x', name: 'X' }, { name: 'no id' }, 5],
      logs: {
        a: { '2026-09-17': { value: 42 }, '2026-13-01': { value: 3 }, '2026-09-16': 'bad' },
        b: { '2026-09-17': { value: 3, skipped: true, note: '  ' } },
        ghost: { '2026-09-17': { value: 1 } },
      },
      relapses: [
        { id: 'r2', habitId: 'c', at: '2026-09-10T00:00:00.000Z' },
        { id: 'r1', habitId: 'c', at: '2026-09-01T00:00:00.000Z', note: 'oops' },
        { id: 'r3', habitId: 'ghost', at: '2026-09-02T00:00:00.000Z' },
        { id: 'r4', habitId: 'c', at: 'never' },
      ],
      timers: { a: { startedAt: '2026-09-17T10:00:00.000Z' }, d: { startedAt: 'nope' } },
      dayNotes: { '2026-09-17': 'good', '2026-09-18': '', bad: 'x' },
      settings: { theme: 'dusk', dayStartHour: 12, soundEnabled: 'yes' },
      rewards: { unlocked: { first: '2026-09-01T00:00:00.000Z', broken: 'never' }, lastSeenLevel: -2, celebratedPerfectDays: ['2026-09-17', 'x', '2026-09-17'] },
      meta: { lastBackupAt: 'nope' },
    });

    expect(d.version).toBe(DATA_VERSION);
    expect(d.habits.map((h) => h.id)).toEqual(['a', 'b', 'c', 'd']);
    const [a, b, c, dd] = d.habits;
    expect(a).toMatchObject({ period: 'day', ratingMax: 10, target: 10, schedule: [0, 1, 2, 3, 4, 5, 6], kind: 'metric', categoryId: 'x' });
    expect(b).toMatchObject({ kind: 'goal', step: 1, schedule: [2], categoryId: 'x', name: 'Untitled habit', target: 1 });
    expect(c).toMatchObject({ period: 'day', quitStart: '2026-01-02T12:00:00.000Z', startDate: '2026-01-02', target: 0 });
    expect(dd).toMatchObject({ type: 'check', color: 'violet', order: 3, direction: 'atLeast', archived: false });
    expect(typeof dd.createdAt).toBe('string');

    expect(d.categories).toHaveLength(2);
    expect(d.categories[0]).toEqual({ id: 'x', name: 'X', icon: '📁', order: 0 });
    expect(d.categories[1]).toMatchObject({ id: expect.any(String), name: 'no id', icon: '📁', order: 1 });

    expect(d.logs).toEqual({
      a: { '2026-09-17': { value: 10, updatedAt: expect.any(String) } },
      b: { '2026-09-17': { value: 1, skipped: true, updatedAt: expect.any(String) } },
    });
    expect(d.relapses.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(d.relapses[0].note).toBe('oops');
    expect(d.timers).toEqual({});
    expect(d.dayNotes).toEqual({ '2026-09-17': 'good' });
    expect(d.settings).toEqual({ ...DEFAULT_SETTINGS, theme: 'dusk', dayStartHour: 6 });
    expect(d.rewards).toEqual({ unlocked: { first: '2026-09-01T00:00:00.000Z' }, lastSeenLevel: 1, celebratedPerfectDays: ['2026-09-17'] });
    expect(d.meta.lastBackupAt).toBeUndefined();
    expect(d.meta.onboarded).toBe(true);
  });

  it('keeps timers only for existing duration habits', () => {
    const startedAt = new Date(Date.now() - 20 * 60_000).toISOString();
    const d = migrate({
      habits: [{ id: 's', type: 'duration' }, { id: 'w', type: 'quantity' }],
      timers: {
        s: { habitId: 's', startedAt, day: '2026-09-17' },
        w: { habitId: 'w', startedAt, day: '2026-09-17' },
      },
    });
    expect(Object.keys(d.timers)).toEqual(['s']);
  });

  it('drops stale and future-dated timers', () => {
    const habits = [{ id: 's', type: 'duration' }];
    const timer = (ms: number) => ({ habitId: 's', startedAt: new Date(Date.now() + ms).toISOString(), day: '2026-09-17' });

    expect(Object.keys(migrate({ habits, timers: { s: timer(-11 * 3600_000) } }).timers)).toEqual(['s']);
    expect(migrate({ habits, timers: { s: timer(-7 * 24 * 3600_000) } }).timers).toEqual({});
    expect(migrate({ habits, timers: { s: timer(-13 * 3600_000) } }).timers).toEqual({});
    expect(migrate({ habits, timers: { s: timer(5 * 60_000) } }).timers).toEqual({});
  });

  it('fills default habits and repairs categories when habits are missing', () => {
    const d = migrate({ categories: [{ id: 'only', name: 'Only', icon: '⭐', order: 0 }] });
    expect(d.habits.length).toBeGreaterThan(0);
    expect(d.habits.every((h) => h.categoryId === 'only')).toBe(true);
    expect(d.meta.onboarded).toBe(false);
  });
});

describe('storage failures', () => {
  const stored = (d: AppData) => ({ state: { data: d }, version: DATA_VERSION });

  function backend(overrides: Partial<{ get: () => Promise<unknown>; set: (k: string, v: unknown) => Promise<void> }> = {}) {
    const records = new Map<string, unknown>();
    return {
      records,
      get: vi.fn(overrides.get ?? (async (key: string) => records.get(key))),
      set: vi.fn(overrides.set ?? (async (key: string, value: unknown) => void records.set(key, value))),
      del: vi.fn(async (key: string) => void records.delete(key)),
    };
  }

  it('never writes after a read that threw, and reports it', async () => {
    const b = backend({ get: async () => { throw new Error('IDB is on fire'); } });
    const before = stored(fixture());
    b.records.set('habit-app', before);
    const issues: Array<StorageIssue | null> = [];
    const s = createDebouncedStorage(b, { onIssue: (i) => issues.push(i) });

    await expect(s.getItem('habit-app')).rejects.toThrow('IDB is on fire');
    expect(s.issue()).toMatchObject({ kind: 'read', writesBlocked: true });
    expect(issues).toHaveLength(1);

    s.setItem('habit-app', stored(createInitialData()));
    await s.flush();
    await s.removeItem('habit-app');
    expect(b.set).not.toHaveBeenCalled();
    expect(b.del).not.toHaveBeenCalled();
    expect(b.records.get('habit-app')).toBe(before);
  });

  it.each([
    ['a half-written record', { state: 'not-an-object' }],
    ['a record with no data', { state: {}, version: DATA_VERSION }],
    ['unparseable JSON', '{"state":'],
  ])('does not overwrite %s', async (_label, record) => {
    const b = backend();
    b.records.set('habit-app', record);
    const s = createDebouncedStorage(b);

    await expect(s.getItem('habit-app')).rejects.toThrow(/not readable/);
    expect(s.issue()).toMatchObject({ kind: 'corrupt', writesBlocked: true });
    expect(s.hadStoredValue()).toBe(false);

    s.setItem('habit-app', stored(createInitialData()));
    await s.flush();
    expect(b.set).not.toHaveBeenCalled();
    expect(b.records.get('habit-app')).toEqual(record);
  });

  it('treats an absent key as a first run and writes normally', async () => {
    const b = backend();
    const saved: string[] = [];
    const s = createDebouncedStorage(b, { onSaved: () => saved.push('saved') });

    expect(await s.getItem('habit-app')).toBeNull();
    expect(s.hadStoredValue()).toBe(false);
    expect(s.issue()).toBeNull();

    const d = fixture();
    s.setItem('habit-app', stored(d));
    expect(s.pendingSince()).toBeGreaterThan(0);
    await s.flush();
    expect(b.records.get('habit-app')).toEqual(stored(d));
    expect(s.pendingSince()).toBe(0);
    expect(saved).toEqual(['saved']);

    s.setItem('habit-app', stored(d));
    await s.flush();
    expect(b.set).toHaveBeenCalledTimes(1);
  });

  it('retries a failed write and clears the issue once it succeeds', async () => {
    let failing = true;
    const b = backend({ set: async () => { if (failing) throw new Error('QuotaExceededError'); } });
    const issues: Array<StorageIssue | null> = [];
    const s = createDebouncedStorage(b, { onIssue: (i) => issues.push(i) });
    await s.getItem('habit-app');

    const d = fixture();
    s.setItem('habit-app', stored(d));
    await s.flush();
    expect(s.issue()).toMatchObject({ kind: 'write', writesBlocked: false });
    expect(s.pendingSince()).toBeGreaterThan(0);

    await s.flush();
    expect(issues).toHaveLength(1);

    failing = false;
    await s.flush();
    expect(b.set).toHaveBeenCalledTimes(3);
    expect(s.issue()).toBeNull();
    expect(s.pendingSince()).toBe(0);
    expect(issues.map((i) => i?.kind ?? null)).toEqual(['write', null]);
  });

  it('holds writes until the first read finished', async () => {
    const b = backend();
    const s = createDebouncedStorage(b);
    s.setItem('habit-app', stored(fixture()));
    await s.flush();
    expect(b.set).not.toHaveBeenCalled();

    await s.getItem('habit-app');
    await s.flush();
    expect(b.set).toHaveBeenCalledTimes(1);
  });
});

describe('persistence', () => {
  it('round-trips through storage', async () => {
    state().setLog('water', DAY, { value: 7, note: 'persist me' });
    const saved = data();
    await flushPersistence();

    useStore.setState({ data: createInitialData() });
    await useStore.persist.rehydrate();

    expect(state().hydrated).toBe(true);
    expect(data()).toEqual(saved);
    expect(data()).not.toBe(saved);
    expect(state()).toMatchObject({ canUndo: false, canRedo: false });
  });

  it('cross-tab sync flushes a queued edit before reloading', async () => {
    await flushPersistence();
    state().setLog('water', DAY, { value: 3 });
    expect(state().canUndo).toBe(true);

    await syncFromOtherTab(Date.now() + 1000);

    expect(entry('water')?.value).toBe(3);
    expect(state()).toMatchObject({ canUndo: false, canRedo: false });
  });

  it('cross-tab sync keeps a newer local edit', async () => {
    await flushPersistence();
    const savedAt = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 2));
    state().setLog('water', DAY, { value: 9 });

    await syncFromOtherTab(savedAt);

    expect(entry('water')?.value).toBe(9);
    expect(state().canUndo).toBe(true);
  });

  it('drops undo history even when a rehydrate finds nothing stored', async () => {
    state().setLog('water', DAY, { value: 3 });
    state().undo();
    expect(state()).toMatchObject({ canUndo: false, canRedo: true });

    await useStore.persist.clearStorage();
    await useStore.persist.rehydrate();

    expect(state()).toMatchObject({ canUndo: false, canRedo: false, hydrated: true });
    const current = data();
    state().redo();
    state().undo();
    expect(data()).toBe(current);
  });
});
