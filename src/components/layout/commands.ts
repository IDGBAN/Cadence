import { useStore } from '@/store/store';
import { toast, useUI, type ToastInput } from '@/store/ui';
import { downloadBackup } from '@/lib/backup';

// repeated undo/redo replaces the last toast instead of stacking them
let historyToastId: string | null = null;

function announce(input: ToastInput): void {
  if (historyToastId) useUI.getState().dismissToast(historyToastId);
  historyToastId = toast({ duration: 2400, ...input });
}

export function undoWithToast(): boolean {
  const before = useStore.getState().data;
  useStore.getState().undo();
  if (useStore.getState().data === before) return false;
  announce({ title: 'Undone', icon: '↩️', action: { label: 'Redo', onClick: redoWithToast } });
  return true;
}

export function redoWithToast(): boolean {
  const before = useStore.getState().data;
  useStore.getState().redo();
  if (useStore.getState().data === before) return false;
  announce({ title: 'Redone', icon: '↪️', action: { label: 'Undo', onClick: undoWithToast } });
  return true;
}

export function exportBackupWithToast(): void {
  try {
    downloadBackup(useStore.getState().data);
    useStore.getState().markBackup();
    toast({ title: 'Backup saved', description: 'Keep the file somewhere safe.', tone: 'success', icon: '💾' });
  } catch (err) {
    toast({
      title: "Couldn't export the backup",
      description: err instanceof Error ? err.message : 'Please try again.',
      tone: 'danger',
      icon: '⚠️',
    });
  }
}
