import { create } from 'zustand';

export interface ShellStore {
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
}

export const useShell = create<ShellStore>()((set) => ({
  shortcutsOpen: false,
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
}));

export function openShortcuts(): void {
  useShell.getState().setShortcutsOpen(true);
}
