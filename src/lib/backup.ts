import type { AppData, Category, DayKey, Habit } from '@/types';
import { migrate } from '@/lib/migrate';
import { DATA_VERSION } from '@/lib/defaults';
import { formatTime, logicalDayOf, toDayKey } from '@/lib/dates';
import { formatValue } from '@/lib/format';

export const BACKUP_APP_ID = 'cadence';
// backups made before the rename
const LEGACY_APP_IDS = new Set(['habit']);
// a habit id becomes a key in the logs object, where these would touch its prototype
const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype']);
// real backups are a few MB at most. anything bigger is the wrong file and would freeze the tab while it's read
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

export interface BackupEnvelope {
  app: typeof BACKUP_APP_ID;
  exportedAt: string;
  version: number;
  data: AppData;
}

export function exportJson(data: AppData): string {
  const envelope: BackupEnvelope = {
    app: BACKUP_APP_ID,
    exportedAt: new Date().toISOString(),
    version: data.version,
    data,
  };
  return JSON.stringify(envelope, null, 2);
}

function downloadText(text: string, filename: string, mime: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error("This browser can't download files.");
  }
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // revoking right away can cancel the download in some browsers
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadBackup(data: AppData): void {
  downloadText(exportJson(data), `cadence-backup-${toDayKey(new Date())}.json`, 'application/json');
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// migrate() quietly drops anything it can't read, so count the losses and warn before importing
export interface BackupDropReport {
  habits: number;
  logEntries: number;
  relapses: number;
  dayNotes: number;
  achievements: number;
  timers: number; // never imported on purpose, so not part of total
  total: number;
}

export interface ParsedBackup {
  data: AppData;
  dropped: BackupDropReport;
  /** false for raw or hand-made files, whose settings would otherwise reset to the defaults */
  hasSettings: boolean;
  exportedAt?: string;
}

function countRecordKeys(raw: unknown): number {
  return isRecord(raw) ? Object.keys(raw).length : 0;
}

function countRawLogEntries(raw: unknown): number {
  if (!isRecord(raw)) return 0;
  let n = 0;
  for (const days of Object.values(raw)) n += countRecordKeys(days);
  return n;
}

function countLogEntries(logs: AppData['logs']): number {
  let n = 0;
  for (const days of Object.values(logs)) n += Object.keys(days).length;
  return n;
}

function dropReport(input: Record<string, unknown>, data: AppData, timers: number): BackupDropReport {
  const lost = (raw: number, kept: number) => Math.max(0, raw - kept);
  const rewards = isRecord(input.rewards) ? input.rewards : {};
  const report: BackupDropReport = {
    habits: lost(Array.isArray(input.habits) ? input.habits.length : 0, data.habits.length),
    logEntries: lost(countRawLogEntries(input.logs), countLogEntries(data.logs)),
    relapses: lost(Array.isArray(input.relapses) ? input.relapses.length : 0, data.relapses.length),
    dayNotes: lost(countRecordKeys(input.dayNotes), Object.keys(data.dayNotes).length),
    achievements: lost(countRecordKeys(rewards.unlocked), Object.keys(data.rewards.unlocked).length),
    timers,
    total: 0,
  };
  report.total = report.habits + report.logEntries + report.relapses + report.dayNotes + report.achievements;
  return report;
}

/** Like parseBackup, but also reports what the import would drop. */
export function readBackup(text: string): ParsedBackup {
  const { data: raw, exportedAt } = validateBackup(text);
  const migrated = migrate(raw);
  // an old running stopwatch would dump weeks of time onto a past day when stopped
  const timers = countRecordKeys(raw.timers);
  const data = Object.keys(migrated.timers).length > 0 ? { ...migrated, timers: {} } : migrated;
  const parsed: ParsedBackup = { data, dropped: dropReport(raw, data, timers), hasSettings: isRecord(raw.settings) };
  if (exportedAt !== undefined) parsed.exportedAt = exportedAt;
  return parsed;
}

/** Accepts an exported envelope or raw AppData. Throws with a readable message if the file is bad. */
export function parseBackup(text: string): AppData {
  return readBackup(text).data;
}

function validExportedAt(v: unknown): string | undefined {
  return typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : undefined;
}

function validateBackup(text: string): { data: Record<string, unknown>; exportedAt?: string } {
  if (typeof text !== 'string' || text.replace(/^\uFEFF/, '').trim() === '') {
    throw new Error('This file is empty.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error("This file isn't valid JSON. Pick a .json backup exported from Cadence.");
  }

  if (!isRecord(parsed)) {
    throw new Error("This file doesn't contain Cadence data.");
  }

  let data: unknown = parsed;
  if ('app' in parsed) {
    if (parsed.app !== BACKUP_APP_ID && !LEGACY_APP_IDS.has(parsed.app as string)) {
      const from = typeof parsed.app === 'string' && parsed.app.trim() !== '' ? ` ("${parsed.app}")` : '';
      throw new Error(`This backup was made by a different app${from}, so it can't be imported.`);
    }
    if (!isRecord(parsed.data)) {
      throw new Error('This backup is missing its data section. The file might be damaged.');
    }
    data = parsed.data;
  } else if (!Array.isArray(parsed.habits) && isRecord(parsed.data)) {
    // envelope without an app marker
    data = parsed.data;
  }

  if (!isRecord(data)) {
    throw new Error("This file doesn't contain Cadence data.");
  }

  const envelopeVersion = isRecord(parsed) && data !== parsed ? parsed.version : undefined;
  const version = typeof data.version === 'number' ? data.version : envelopeVersion;
  if (typeof version === 'number' && Number.isFinite(version) && version > DATA_VERSION) {
    throw new Error('This backup is from a newer version of Cadence. Update the app and try again.');
  }

  if (!('habits' in data)) {
    throw new Error("This file has no habits in it. It doesn't look like a Cadence backup.");
  }
  if (!Array.isArray(data.habits)) {
    throw new Error("The habits in this file are unreadable, so it can't be imported.");
  }
  const badIndex = data.habits.findIndex((h) => !isRecord(h) || typeof h.id !== 'string' || h.id.trim() === '');
  if (badIndex >= 0) {
    throw new Error(`Habit #${badIndex + 1} in this file is damaged (it has no id), so the backup can't be imported.`);
  }
  const reservedIndex = data.habits.findIndex((h) => RESERVED_IDS.has((h as { id: string }).id));
  if (reservedIndex >= 0) {
    throw new Error(`Habit #${reservedIndex + 1} in this file has an id Cadence can't use, so the backup can't be imported.`);
  }
  if ('logs' in data && data.logs !== undefined && !isRecord(data.logs)) {
    throw new Error("The logs in this file are damaged, so the backup can't be imported.");
  }
  if ('relapses' in data && data.relapses !== undefined && !Array.isArray(data.relapses)) {
    throw new Error("The relapse history in this file is damaged, so the backup can't be imported.");
  }
  if ('categories' in data && data.categories !== undefined && !Array.isArray(data.categories)) {
    throw new Error("The categories in this file are damaged, so the backup can't be imported.");
  }

  const exportedAt = data !== parsed ? validExportedAt(parsed.exportedAt) : undefined;
  return exportedAt === undefined ? { data } : { data, exportedAt };
}

export const CSV_COLUMNS = ['date', 'habit', 'category', 'type', 'value', 'display_value', 'skipped', 'note'] as const;

// RFC 4180 quoting. Text fields that start like a formula get a leading ' so spreadsheets don't run them.
export function csvField(value: string | number | boolean | null | undefined, opts: { text?: boolean } = {}): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (opts.text && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s) || s !== s.trim()) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

interface CsvRow {
  date: DayKey;
  habitOrder: number;
  sub: string; // log row first, then relapses by time
  cells: string[];
}

/** One row per log, relapse and journal note, sorted by date then habit order. */
export function exportCsv(data: AppData): string {
  const categories = new Map<string, Category>(data.categories.map((c) => [c.id, c]));
  const habits: Habit[] = data.habits.slice().sort((a, b) => a.order - b.order);
  const habitIndex = new Map<string, number>(habits.map((h, i) => [h.id, i]));
  const rows: CsvRow[] = [];

  const row = (cells: Array<[string | number | boolean | undefined, boolean?]>) =>
    cells.map(([v, text]) => csvField(v, { text: text === true }));

  for (const habit of habits) {
    const categoryName = categories.get(habit.categoryId)?.name ?? '';
    const order = habitIndex.get(habit.id) ?? 0;
    for (const [day, entry] of Object.entries(data.logs[habit.id] ?? {})) {
      const display = entry.skipped ? 'Skipped' : habit.type === 'quit' ? '' : formatValue(habit, entry.value);
      rows.push({
        date: day,
        habitOrder: order,
        sub: '0',
        cells: row([
          [day], [habit.name, true], [categoryName, true], [habit.type],
          [habit.type === 'quit' ? '' : entry.value], [display, true], [entry.skipped === true],
          [entry.note ?? '', true],
        ]),
      });
    }
  }

  for (const relapse of data.relapses) {
    const habit = data.habits.find((h) => h.id === relapse.habitId);
    if (!habit) continue;
    const day = logicalDayOf(relapse.at, data.settings.dayStartHour);
    rows.push({
      date: day,
      habitOrder: habitIndex.get(habit.id) ?? 0,
      sub: `1${relapse.at}`,
      cells: row([
        [day], [habit.name, true], [categories.get(habit.categoryId)?.name ?? '', true], ['relapse'],
        [relapse.at], [`Relapse at ${formatTime(relapse.at)}`, true], [false], [relapse.note ?? '', true],
      ]),
    });
  }

  for (const [day, note] of Object.entries(data.dayNotes)) {
    rows.push({
      date: day,
      habitOrder: Number.MAX_SAFE_INTEGER,
      sub: '2',
      cells: row([[day], [''], [''], ['journal'], [''], [''], [false], [note, true]]),
    });
  }

  rows.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1
      : a.habitOrder !== b.habitOrder ? a.habitOrder - b.habitOrder
        : a.sub < b.sub ? -1 : a.sub > b.sub ? 1 : 0);

  const lines = [CSV_COLUMNS.join(','), ...rows.map((r) => r.cells.join(','))];
  return `${lines.join('\r\n')}\r\n`;
}

export function downloadCsv(data: AppData, filename = `cadence-export-${toDayKey(new Date())}.csv`): void {
  // BOM so Excel reads it as UTF-8
  downloadText(`\uFEFF${exportCsv(data)}`, filename, 'text/csv;charset=utf-8');
}
