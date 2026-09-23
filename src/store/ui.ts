import { create } from 'zustand';
import type { DayKey } from '@/types';
import { uid } from '@/lib/defaults';

export type ToastTone = 'default' | 'success' | 'danger' | 'xp' | 'streak' | 'achievement';

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  icon?: string;
  action?: { label: string; onClick: () => void };
  /** ms, 0 = sticky */
  duration?: number;
}

export interface Toast extends ToastInput {
  id: string;
  createdAt: number;
}

export type Celebration =
  | { kind: 'perfectDay'; day: DayKey }
  | { kind: 'levelUp'; level: number }
  | { kind: 'achievement'; achievementId: string }
  | { kind: 'milestone'; habitId: string; days: number }
  | { kind: 'periodGoal'; habitId: string; period: 'week' | 'month' };

export interface UIStore {
  /** `focus: 'note'` opens it with the note field focused. */
  logEditor: { habitId: string; day: DayKey; focus?: 'note' } | null;
  openLogEditor: (habitId: string, day: DayKey, focus?: 'note') => void;
  closeLogEditor: () => void;

  /** habitId null = new habit */
  habitEditor: { habitId: string | null; templateId?: string; categoryId?: string } | null;
  openHabitEditor: (habitId?: string | null, opts?: { templateId?: string; categoryId?: string }) => void;
  closeHabitEditor: () => void;

  commandPalette: boolean;
  setCommandPalette: (open: boolean) => void;

  /** null = logical today */
  selectedDay: DayKey | null;
  setSelectedDay: (day: DayKey | null) => void;

  toasts: Toast[];
  /** Keeps the newest 4. Returns the toast id. */
  pushToast: (t: ToastInput) => string;
  dismissToast: (id: string) => void;

  /** CelebrationHost shows the head of the queue. Duplicates of a queued celebration are ignored. */
  celebrations: Celebration[];
  celebrate: (c: Celebration) => void;
  shiftCelebration: () => void;
}

export const MAX_VISIBLE_TOASTS = 4;
export const DEFAULT_TOAST_DURATION = 3500;

function celebrationKey(c: Celebration): string {
  switch (c.kind) {
    case 'perfectDay':
      return `perfectDay:${c.day}`;
    case 'levelUp':
      return `levelUp:${c.level}`;
    case 'achievement':
      return `achievement:${c.achievementId}`;
    case 'milestone':
      return `milestone:${c.habitId}:${c.days}`;
    case 'periodGoal':
      return `periodGoal:${c.habitId}:${c.period}`;
  }
}

export const useUI = create<UIStore>()((set, get) => ({
  logEditor: null,
  openLogEditor: (habitId, day, focus) =>
    set({ logEditor: focus ? { habitId, day, focus } : { habitId, day }, commandPalette: false }),
  closeLogEditor: () => set({ logEditor: null }),

  habitEditor: null,
  openHabitEditor: (habitId = null, opts) =>
    set({
      habitEditor: {
        habitId: habitId ?? null,
        ...(opts?.templateId ? { templateId: opts.templateId } : {}),
        ...(opts?.categoryId ? { categoryId: opts.categoryId } : {}),
      },
      commandPalette: false,
    }),
  closeHabitEditor: () => set({ habitEditor: null }),

  commandPalette: false,
  setCommandPalette: (open) => set({ commandPalette: open }),

  selectedDay: null,
  setSelectedDay: (day) => set({ selectedDay: day }),

  toasts: [],
  pushToast: (input) => {
    const toast: Toast = {
      ...input,
      tone: input.tone ?? 'default',
      duration: input.duration !== undefined && Number.isFinite(input.duration) && input.duration >= 0
        ? input.duration
        : DEFAULT_TOAST_DURATION,
      id: uid('t'),
      createdAt: Date.now(),
    };
    set({ toasts: [...get().toasts, toast].slice(-MAX_VISIBLE_TOASTS) });
    return toast.id;
  },
  dismissToast: (id) => {
    const toasts = get().toasts;
    if (toasts.some((t) => t.id === id)) set({ toasts: toasts.filter((t) => t.id !== id) });
  },

  celebrations: [],
  celebrate: (c) => {
    const key = celebrationKey(c);
    const queue = get().celebrations;
    if (queue.some((q) => celebrationKey(q) === key)) return;
    set({ celebrations: [...queue, c] });
  },
  shiftCelebration: () => {
    const queue = get().celebrations;
    if (queue.length > 0) set({ celebrations: queue.slice(1) });
  },
}));

export function toast(t: ToastInput): string {
  return useUI.getState().pushToast(t);
}
