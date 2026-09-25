import { useStore } from '@/store/store';
import { toast, useUI, type ToastInput } from '@/store/ui';

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
