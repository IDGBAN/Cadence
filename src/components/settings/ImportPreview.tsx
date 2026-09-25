import { useState, type ReactNode } from 'react';
import { CalendarRange, FileText, Flame, ListChecks, Repeat, StickyNote, TriangleAlert, Trophy } from 'lucide-react';
import type { AppData, DayKey } from '@/types';
import { formatDayLong, formatRange, formatTime, logicalDayOf, toDayKey } from '@/lib/dates';
import { formatNumber, pluralize } from '@/lib/format';
import type { BackupDropReport } from '@/lib/backup';
import { Button, Modal } from '@/components/ui';
import { SettingNote } from './SettingsSection';

export interface BackupSummary {
  habits: number;
  archivedHabits: number;
  categories: number;
  entries: number;
  loggedDays: number;
  relapses: number;
  dayNotes: number;
  achievements: number;
  firstDay?: DayKey;
  lastDay?: DayKey;
  exportedAt?: string;
  hasSettings: boolean;
  theme: string;
  userName: string;
}

function noun(count: number, singular: string, plural = `${singular}s`): string {
  return Math.abs(count) === 1 ? singular : plural;
}

export function summarizeBackup(
  data: AppData,
  file: { hasSettings: boolean; exportedAt?: string } = { hasSettings: true },
): BackupSummary {
  const days = new Set<DayKey>();
  let entries = 0;
  let firstDay: DayKey | undefined;
  let lastDay: DayKey | undefined;

  const track = (day: DayKey) => {
    if (firstDay === undefined || day < firstDay) firstDay = day;
    if (lastDay === undefined || day > lastDay) lastDay = day;
  };

  for (const habitLogs of Object.values(data.logs)) {
    for (const [day, entry] of Object.entries(habitLogs)) {
      if (!entry) continue;
      entries += 1;
      days.add(day);
      track(day);
    }
  }
  for (const day of Object.keys(data.dayNotes)) track(day);
  for (const relapse of data.relapses) track(logicalDayOf(relapse.at, data.settings.dayStartHour));

  const { exportedAt, hasSettings } = file;

  return {
    habits: data.habits.filter((h) => !h.archived).length,
    archivedHabits: data.habits.filter((h) => h.archived).length,
    categories: data.categories.length,
    entries,
    loggedDays: days.size,
    relapses: data.relapses.length,
    dayNotes: Object.keys(data.dayNotes).length,
    achievements: Object.keys(data.rewards.unlocked).length,
    ...(firstDay === undefined ? {} : { firstDay }),
    ...(lastDay === undefined ? {} : { lastDay }),
    ...(exportedAt === undefined ? {} : { exportedAt }),
    hasSettings,
    theme: data.settings.theme,
    userName: data.settings.userName,
  };
}

function Stat({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3">
      <div className="flex items-center gap-1.5 text-fg-4 [&_svg]:size-3.5" aria-hidden="true">
        {icon}
      </div>
      <p className="mt-1.5 font-display text-lg leading-none font-semibold tabular text-fg">{formatNumber(value, 0)}</p>
      <p className="mt-1 text-[12px] leading-snug text-fg-3">{label}</p>
    </div>
  );
}

export interface BackupPreview {
  summary: BackupSummary;
  fileName: string;
  dropped?: BackupDropReport;
}

// e.g. "3 log entries and 1 relapse"
function describeDropped(dropped: BackupDropReport): string {
  const parts = [
    dropped.habits > 0 && pluralize(dropped.habits, 'habit'),
    dropped.logEntries > 0 && pluralize(dropped.logEntries, 'log entry', 'log entries'),
    dropped.relapses > 0 && pluralize(dropped.relapses, 'relapse'),
    dropped.dayNotes > 0 && pluralize(dropped.dayNotes, 'journal note'),
    dropped.achievements > 0 && pluralize(dropped.achievements, 'achievement'),
  ].filter((part): part is string => typeof part === 'string');
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export interface ImportPreviewModalProps {
  preview: BackupPreview | undefined;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ImportPreviewModal({ preview, onCancel, onConfirm }: ImportPreviewModalProps) {
  // keep the last preview so the dialog doesn't go blank while it animates out
  const [shown, setShown] = useState<BackupPreview | undefined>(preview);
  if (preview !== undefined && preview !== shown) setShown(preview);

  const current = preview ?? shown;
  const summary = current?.summary;
  const fileName = current?.fileName;
  const dropped = current?.dropped;

  const range =
    summary?.firstDay !== undefined && summary.lastDay !== undefined
      ? summary.firstDay === summary.lastDay
        ? formatDayLong(summary.firstDay)
        : formatRange(summary.firstDay, summary.lastDay)
      : 'Nothing logged yet';

  return (
    <Modal
      open={preview !== undefined}
      onClose={onCancel}
      title="Import this backup?"
      description={fileName}
      icon="📥"
      size="lg"
      footer={
        <>
          <Button variant="secondary" data-autofocus onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Replace my data
          </Button>
        </>
      }
    >
      {summary && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-fg-3">
            <span className="inline-flex items-center gap-1.5">
              <FileText className="size-4" aria-hidden="true" />
              Cadence backup
            </span>
            {summary.exportedAt !== undefined && (
              <span>
                Exported {formatDayLong(toDayKey(new Date(summary.exportedAt)))} at {formatTime(summary.exportedAt)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Stat
              icon={<ListChecks />}
              value={summary.habits}
              label={
                summary.archivedHabits > 0
                  ? `${noun(summary.habits, 'habit')} · ${summary.archivedHabits} archived`
                  : noun(summary.habits, 'habit')
              }
            />
            <Stat icon={<Flame />} value={summary.loggedDays} label={`logged ${noun(summary.loggedDays, 'day')}`} />
            <Stat icon={<Repeat />} value={summary.relapses} label={noun(summary.relapses, 'relapse')} />
            <Stat icon={<Trophy />} value={summary.achievements} label={noun(summary.achievements, 'achievement')} />
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-2 px-3.5 py-3">
              <CalendarRange className="mt-0.5 size-4 shrink-0 text-fg-4" aria-hidden="true" />
              <div className="min-w-0 text-[13px] leading-relaxed">
                <p className="font-medium text-fg">{range}</p>
                <p className="text-fg-3">
                  {formatNumber(summary.entries, 0)} {noun(summary.entries, 'entry', 'entries')} in{' '}
                  {formatNumber(summary.categories, 0)} {noun(summary.categories, 'category', 'categories')}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-2 px-3.5 py-3">
              <StickyNote className="mt-0.5 size-4 shrink-0 text-fg-4" aria-hidden="true" />
              <div className="min-w-0 text-[13px] leading-relaxed">
                <p className="font-medium text-fg">
                  {formatNumber(summary.dayNotes, 0)} journal {noun(summary.dayNotes, 'note')}
                </p>
                <p className="truncate text-fg-3">
                  {summary.hasSettings
                    ? `Settings included · ${summary.theme} theme${summary.userName === '' ? '' : ` · for ${summary.userName}`}`
                    : 'No settings in this file, so yours stay as they are'}
                </p>
              </div>
            </div>
          </div>

          {dropped && dropped.total > 0 && (
            <SettingNote tone="warning" icon={<TriangleAlert aria-hidden="true" />}>
              Part of this file is damaged and <strong className="font-semibold text-fg">won’t be imported</strong>:{' '}
              {describeDropped(dropped)}. The numbers above are what will be restored.
            </SettingNote>
          )}
          {dropped && dropped.timers > 0 && (
            <p className="text-[13px] leading-relaxed text-fg-3">
              {dropped.timers === 1 ? 'A running stopwatch' : `${dropped.timers} running stopwatches`} in the file
              won’t be restored, since old timers would count hours you didn’t spend.
            </p>
          )}

          <SettingNote tone="warning" icon={<TriangleAlert aria-hidden="true" />}>
            Importing <strong className="font-semibold text-fg">replaces everything</strong> in Cadence: habits, logs,
            streaks, achievements{summary.hasSettings ? ' and settings' : ''}. You can undo it right after with Ctrl+Z
            (Cmd+Z on a Mac).
          </SettingNote>
        </div>
      )}
    </Modal>
  );
}
