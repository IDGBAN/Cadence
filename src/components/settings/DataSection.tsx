import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Database,
  Download,
  FileSpreadsheet,
  FlaskConical,
  HardDrive,
  ShieldCheck,
  Trash,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import type { AppData } from '@/types';
import { MAX_BACKUP_BYTES, readBackup, type BackupDropReport } from '@/lib/backup';
import { DEMO_DAYS, exportBackupWithToast, exportCsvWithToast, loadDemoData } from '@/lib/dataActions';
import { formatNumber } from '@/lib/format';
import { diffDays, formatDayShort, formatTime, logicalDayOf, relativeDayLabel, toDayKey } from '@/lib/dates';
import { actions, flushPersistence, getData, useStore } from '@/store/store';
import { useData, useToday } from '@/store/hooks';
import { toast } from '@/store/ui';
import { undoAction } from '@/lib/logActions';
import { Badge, Button, confirmDialog } from '@/components/ui';
import { SettingDivider, SettingNote, SettingRow, SettingsSection } from './SettingsSection';
import { ImportPreviewModal, summarizeBackup, type BackupSummary } from './ImportPreview';

const BACKUP_STALE_DAYS = 14;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${formatNumber(kb, kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${formatNumber(mb, mb < 10 ? 1 : 0)} MB`;
  return `${formatNumber(mb / 1024, 2)} GB`;
}

interface StorageInfo {
  supported: boolean;
  usage?: number;
  quota?: number;
  persisted?: boolean;
}

function useStorageInfo(refreshKey: number): StorageInfo {
  const [info, setInfo] = useState<StorageInfo>({ supported: true });

  useEffect(() => {
    let cancelled = false;
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!storage || typeof storage.estimate !== 'function') {
      setInfo({ supported: false });
      return;
    }
    void (async () => {
      try {
        const estimate = await storage.estimate();
        const persisted = typeof storage.persisted === 'function' ? await storage.persisted() : undefined;
        if (cancelled) return;
        setInfo({
          supported: true,
          usage: estimate.usage,
          quota: estimate.quota,
          ...(persisted === undefined ? {} : { persisted }),
        });
      } catch {
        if (!cancelled) setInfo({ supported: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return info;
}

export function DataSection() {
  const data = useData();
  const today = useToday();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{
    data: AppData;
    summary: BackupSummary;
    fileName: string;
    dropped: BackupDropReport;
    hasSettings: boolean;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [storageKey, setStorageKey] = useState(0);
  const storage = useStorageInfo(storageKey);

  // writes are debounced, so measure once the change has actually landed
  const refreshStorage = useCallback(() => {
    void flushPersistence().finally(() => setStorageKey((k) => k + 1));
  }, []);

  const saveFailed = useStore((s) => s.storageError?.kind === 'write');
  const [retrying, setRetrying] = useState(false);
  const retrySave = useCallback(async () => {
    setRetrying(true);
    try {
      await flushPersistence();
    } finally {
      setRetrying(false);
    }
    const stillFailing = useStore.getState().storageError?.kind === 'write';
    toast(
      stillFailing
        ? { title: 'Still can’t save', description: 'Keep this tab open and export a backup.', tone: 'danger', icon: '⚠️' }
        : { title: 'Saved', description: 'Everything is stored in this browser again.', tone: 'success', icon: '💾' },
    );
  }, []);

  const lastBackupAt = data.meta.lastBackupAt;
  const lastBackupDay = lastBackupAt ? logicalDayOf(lastBackupAt, data.settings.dayStartHour) : undefined;
  const backupAgeDays = lastBackupDay === undefined ? Infinity : Math.max(0, diffDays(lastBackupDay, today));
  const backupStale = backupAgeDays >= BACKUP_STALE_DAYS;

  const onFilePicked = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('This file is too big to be a Cadence backup.');
      const { data: parsed, dropped, hasSettings, exportedAt } = readBackup(await file.text());
      setPending({
        data: parsed,
        summary: summarizeBackup(parsed, { hasSettings, exportedAt }),
        fileName: file.name,
        dropped,
        hasSettings,
      });
    } catch (error) {
      toast({
        title: 'That file can’t be imported',
        description: error instanceof Error ? error.message : 'The file could not be read.',
        tone: 'danger',
        icon: '⚠️',
        duration: 6000,
      });
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const confirmImport = () => {
    if (!pending) return;
    // a file without settings would otherwise reset theme, week start and day start to the defaults
    actions().replaceData(pending.hasSettings ? pending.data : { ...pending.data, settings: getData().settings });
    setPending(null);
    refreshStorage();
    toast({
      title: 'Data imported',
      description: 'Everything was replaced by the backup. Press Ctrl+Z to undo.',
      tone: 'success',
      icon: '📥',
      duration: 7000,
      action: undoAction(),
    });
  };

  const loadDemo = async () => {
    const ok = await confirmDialog({
      title: 'Load demo data?',
      description:
        `This replaces everything in Cadence with ${DEMO_DAYS} days of sample history, including streaks, relapses, ` +
        'notes and correlations. Export a backup first if you want to keep your own logs. ' +
        'You can remove the demo later with “Delete all data”.',
      confirmLabel: 'Load demo data',
      cancelLabel: 'Cancel',
      icon: '🧪',
    });
    if (!ok) return;
    setDemoBusy(true);
    // let the spinner paint before the generator blocks the main thread
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      if (!loadDemoData()) return;
      refreshStorage();
      toast({
        title: 'Demo data loaded',
        description: 'Five months of history. Check Insights for correlations.',
        tone: 'success',
        icon: '🧪',
        duration: 6000,
        action: undoAction(),
      });
    } finally {
      setDemoBusy(false);
    }
  };

  const resetEverything = async () => {
    const ok = await confirmDialog({
      title: 'Delete all data?',
      description:
        'Every habit, log, note, streak and achievement in this browser is permanently deleted, and you go back to ' +
        'the welcome screen. This can’t be undone, so export a backup first if you might want it back.',
      confirmLabel: 'Delete everything',
      cancelLabel: 'Keep my data',
      tone: 'danger',
      icon: '🗑️',
      requireText: 'RESET',
    });
    if (!ok) return;
    actions().resetData();
    refreshStorage();
    toast({ title: 'All data deleted', description: 'Starting fresh.', tone: 'default', icon: '🧹' });
  };

  return (
    <>
      <SettingsSection
        id="data"
        title="Data"
        subtitle="Your habits live in this browser. Back them up, move them, or start over."
        icon={<Database aria-hidden="true" />}
      >
        {saveFailed && (
          <div
            role="alert"
            className="mb-4 flex flex-col gap-3 rounded-xl border border-danger/35 bg-danger/10 p-4 sm:flex-row sm:items-center"
          >
            <TriangleAlert className="size-5 shrink-0 text-danger" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fg">Cadence can’t save to this browser</p>
              <p className="mt-0.5 text-xs leading-relaxed text-fg-3">
                Your recent changes are only in this tab. Export a backup now, then try saving again.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="danger" icon={<Download aria-hidden="true" />} onClick={exportBackupWithToast}>
                Export
              </Button>
              <Button size="sm" variant="secondary" loading={retrying} onClick={retrySave}>
                Try again
              </Button>
            </div>
          </div>
        )}
        <SettingRow
          label="Backup"
          description="A single .json file with every habit, log, relapse and achievement. Import it here to restore."
          control={
            <Button variant="secondary" icon={<Download aria-hidden="true" />} onClick={exportBackupWithToast}>
              Export backup
            </Button>
          }
        >
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-3">
            <span>
              Last backup:{' '}
              <span className="font-medium text-fg-2">
                {lastBackupAt && lastBackupDay
                  ? `${relativeDayLabel(lastBackupDay, today)} at ${formatTime(lastBackupAt)}`
                  : 'never'}
              </span>
            </span>
            {backupStale && (
              <Badge tone="warning" icon={<TriangleAlert aria-hidden="true" />}>
                {lastBackupAt ? 'Time for a fresh one' : 'Not backed up yet'}
              </Badge>
            )}
          </div>
        </SettingRow>

        <SettingDivider />

        <SettingRow
          label="Import a backup"
          description="Replaces everything in the app. You’ll see a preview first."
          control={
            <>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(e) => void onFilePicked(e.target.files?.[0])}
              />
              <Button
                variant="secondary"
                icon={<Upload aria-hidden="true" />}
                loading={importing}
                onClick={() => fileInput.current?.click()}
              >
                Choose file
              </Button>
            </>
          }
        />

        <SettingDivider />

        <SettingRow
          label="Export as CSV"
          description="Long format (one row per logged value, relapse and journal note) for spreadsheets and analysis."
          control={
            <Button variant="secondary" icon={<FileSpreadsheet aria-hidden="true" />} onClick={exportCsvWithToast}>
              Export CSV
            </Button>
          }
        />

        <SettingDivider />

        <div className="relative overflow-hidden rounded-2xl border border-accent/25 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--accent)_12%,transparent),transparent_62%)] p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
                  <FlaskConical className="size-4" aria-hidden="true" />
                </span>
                <h3 className="font-display text-base font-semibold tracking-tight text-fg">Try the demo data</h3>
              </div>
              <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-fg-2">
                {DEMO_DAYS} days of sample history (streaks, a sick week, a few relapses) so Insights, History and
                Rewards have something to show. It replaces your current data.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button variant="ghost" icon={<Download aria-hidden="true" />} onClick={exportBackupWithToast}>
                Back up first
              </Button>
              <Button icon={<FlaskConical aria-hidden="true" />} loading={demoBusy} onClick={() => void loadDemo()}>
                Load demo data
              </Button>
            </div>
          </div>
        </div>

        <SettingDivider />

        <SettingRow
          label={<span className="text-danger">Delete all data</span>}
          description="Wipes every habit and log from this browser and returns to the welcome screen. There is no server copy."
          control={
            <Button variant="danger" icon={<Trash aria-hidden="true" />} onClick={() => void resetEverything()}>
              Delete all data
            </Button>
          }
        />

        <SettingDivider />

        <SettingRow
          label="Storage"
          description="Cadence stores everything in this browser's IndexedDB. Nothing is uploaded."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-surface-2 p-3.5">
              <div className="flex items-center gap-2 text-fg-3">
                <HardDrive className="size-4" aria-hidden="true" />
                <span className="eyebrow">On this device</span>
              </div>
              <p className="mt-2 font-display text-xl font-semibold tabular text-fg" aria-live="polite">
                {storage.supported && storage.usage !== undefined ? formatBytes(storage.usage) : 'Not reported'}
              </p>
              <p className="mt-1 text-[12px] leading-snug text-fg-3">
                {storage.supported && storage.usage !== undefined
                  ? storage.quota
                    ? `used of about ${formatBytes(storage.quota)} available`
                    : 'used by Cadence in this browser'
                  : 'Your browser doesn’t share storage numbers.'}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface-2 p-3.5">
              <div className="flex items-center gap-2 text-fg-3">
                <ShieldCheck className="size-4" aria-hidden="true" />
                <span className="eyebrow">Durability</span>
              </div>
              <p className="mt-2 text-sm font-medium text-fg">
                {storage.persisted === true
                  ? 'Persistent storage granted'
                  : storage.persisted === false
                    ? 'Best-effort storage'
                    : 'Not reported'}
              </p>
              <p className="mt-1 text-[12px] leading-snug text-fg-3">
                {storage.persisted === true
                  ? 'The browser won’t evict your habits to free up space.'
                  : 'Clearing site data or a browser cleanup would remove your habits, so keep a backup.'}
              </p>
            </div>
          </div>
          <SettingNote className="mt-3" icon={<ShieldCheck aria-hidden="true" />}>
            No account, sync or analytics. Your data was created on{' '}
            {formatDayShort(toDayKey(new Date(data.meta.createdAt)))} and has never left this device.
          </SettingNote>
        </SettingRow>
      </SettingsSection>

      <ImportPreviewModal
        preview={pending ?? undefined}
        onCancel={() => setPending(null)}
        onConfirm={confirmImport}
      />
    </>
  );
}
