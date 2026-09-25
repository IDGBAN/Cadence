// whole-dataset actions with their toasts, shared by Settings, onboarding and the command palette
import { downloadBackup, downloadCsv } from '@/lib/backup';
import { generateDemoData } from '@/lib/demo';
import { actions, getData } from '@/store/store';
import { toast } from '@/store/ui';

export const DEMO_DAYS = 150;
const DEMO_SEED = 42;

function failure(title: string, err: unknown): void {
  toast({
    title,
    description: err instanceof Error ? err.message : 'Please try again.',
    tone: 'danger',
    icon: '⚠️',
  });
}

export function exportBackupWithToast(): void {
  try {
    downloadBackup(getData());
    actions().markBackup();
    toast({
      title: 'Backup saved',
      description: 'Keep the .json file somewhere safe. It restores everything.',
      tone: 'success',
      icon: '💾',
    });
  } catch (err) {
    failure("Couldn't save the backup", err);
  }
}

export function exportCsvWithToast(): void {
  try {
    downloadCsv(getData());
    toast({ title: 'CSV exported', description: 'One row per logged value, ready for a spreadsheet.', tone: 'success', icon: '📊' });
  } catch (err) {
    failure("Couldn't export the CSV", err);
  }
}

/** Replaces everything with sample history but keeps the current settings. Returns false if it failed. */
export function loadDemoData(): boolean {
  try {
    const settings = getData().settings;
    const demo = generateDemoData(DEMO_DAYS, DEMO_SEED, {
      dayStartHour: settings.dayStartHour,
      weekStartsOn: settings.weekStartsOn,
    });
    actions().replaceData({ ...demo, settings: { ...settings } });
    return true;
  } catch (err) {
    failure("Couldn't load the demo", err);
    return false;
  }
}
