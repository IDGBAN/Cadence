// debounced IndexedDB writes with retries, and a lock that keeps a failed read from ever being overwritten
import type { PersistStorage, StorageValue } from 'zustand/middleware';
import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval';
import type { AppData } from '@/types';
import { isRecord } from '@/lib/migrate';

const WRITE_DEBOUNCE_MS = 200;
const WRITE_MAX_WAIT_MS = 1000;
// doubles after each failed write, up to MAX_WRITE_RETRY_MS
const WRITE_RETRY_MS = 2000;
const MAX_WRITE_RETRY_MS = 60_000;

export type PersistedState = { data: AppData };

export type StorageIssueKind = 'read' | 'corrupt' | 'write';

export interface StorageIssue {
  kind: StorageIssueKind;
  // set after a failed read, so the stored data is never overwritten
  writesBlocked: boolean;
  at: number;
  message?: string;
}

export interface KeyValueBackend {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
  del: (key: string) => Promise<void>;
}

export function indexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

export function createMemoryBackend(): KeyValueBackend {
  const map = new Map<string, unknown>();
  const clone = <T,>(v: T): T => (typeof structuredClone === 'function' ? structuredClone(v) : v);
  return {
    get: async (key) => clone(map.get(key)),
    set: async (key, value) => {
      map.set(key, clone(value));
    },
    del: async (key) => {
      map.delete(key);
    },
  };
}

export const idbBackend: KeyValueBackend = {
  get: (key) => idbGet(key),
  set: (key, value) => idbSet(key, value),
  del: (key) => idbDel(key),
};

export interface DebouncedStorage extends PersistStorage<PersistedState, void> {
  flush: () => Promise<void>;
  hadStoredValue: () => boolean;
  issue: () => StorageIssue | null;
  pendingSince: () => number;
  /** Call after loading `data` so it isn't written straight back. */
  markSaved: (data: AppData) => void;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}

export function sameIssue(a: StorageIssue | null, b: StorageIssue | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.kind === b.kind && a.writesBlocked === b.writesBlocked;
}

const ISSUE_LOG: Record<StorageIssueKind, string> = {
  read: 'Could not read the stored data. Nothing will be saved this session so your data stays intact.',
  corrupt: 'The stored record is unreadable. Nothing will be saved this session so it stays recoverable.',
  write: 'Could not save data to IndexedDB. The change is kept and will be retried.',
};

export function createDebouncedStorage(
  backend: KeyValueBackend,
  hooks: { onSaved?: () => void; onIssue?: (issue: StorageIssue | null) => void } = {},
): DebouncedStorage {
  let pending: { name: string; value: StorageValue<PersistedState> } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstPendingAt = 0;
  let lastWrittenData: AppData | null = null;
  // hold writes until the first read succeeds, so defaults can't overwrite real data
  let loaded = false;
  let blocked = false;
  let storedValueFound = false;
  let issue: StorageIssue | null = null;
  let retryDelay = WRITE_RETRY_MS;
  // one write at a time, so a retry can't race the write it's retrying
  let chain: Promise<void> = Promise.resolve();

  const cancelTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const setIssue = (next: StorageIssue | null) => {
    if (sameIssue(issue, next)) return;
    issue = next;
    if (next) console.warn(`[habit] ${ISSUE_LOG[next.kind]}`, next.message ?? '');
    hooks.onIssue?.(next);
  };

  const fail = (kind: StorageIssueKind, err: unknown) => {
    setIssue({ kind, writesBlocked: kind !== 'write', at: Date.now(), message: errorMessage(err) });
  };

  const scheduleRetry = () => {
    if (!pending || blocked) return;
    cancelTimer();
    timer = setTimeout(() => void flush(), retryDelay);
    retryDelay = Math.min(retryDelay * 2, MAX_WRITE_RETRY_MS);
  };

  const writeOnce = async (): Promise<void> => {
    if (!pending || !loaded || blocked) return;
    const queued = pending;
    const data = queued.value.state.data;
    if (data === lastWrittenData) {
      if (pending === queued) pending = null;
      return;
    }
    try {
      await backend.set(queued.name, queued.value);
      lastWrittenData = data;
      // a change queued during the write has its own timer, keep it
      if (pending === queued) pending = null;
      retryDelay = WRITE_RETRY_MS;
      setIssue(null);
      hooks.onSaved?.();
    } catch (err) {
      lastWrittenData = null;
      fail('write', err);
      scheduleRetry();
    }
  };

  const flush = (): Promise<void> => {
    cancelTimer();
    chain = chain.then(writeOnce, writeOnce);
    return chain;
  };

  return {
    async getItem(name) {
      let raw: unknown;
      try {
        raw = await backend.get(name);
      } catch (err) {
        blocked = true;
        fail('read', err);
        throw err instanceof Error ? err : new Error(errorMessage(err));
      }
      if (raw === undefined || raw === null) {
        storedValueFound = false;
        loaded = true;
        return null; // first run
      }
      let value: unknown = raw;
      if (typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch {
          value = undefined;
        }
      }
      if (!isRecord(value) || !isRecord(value.state) || !isRecord((value.state as Record<string, unknown>).data)) {
        // something is stored but we can't read it. leave it alone, it may be recoverable by hand
        blocked = true;
        const err = new Error('The stored record is not readable Cadence data.');
        fail('corrupt', err);
        throw err;
      }
      storedValueFound = true;
      loaded = true;
      return {
        state: value.state as PersistedState,
        version: typeof value.version === 'number' ? value.version : undefined,
      };
    },
    setItem(name, value) {
      if (blocked) return;
      if (!pending) firstPendingAt = Date.now();
      pending = { name, value };
      cancelTimer();
      const wait = Math.max(0, Math.min(WRITE_DEBOUNCE_MS, firstPendingAt + WRITE_MAX_WAIT_MS - Date.now()));
      timer = setTimeout(() => void flush(), wait);
    },
    async removeItem(name) {
      if (blocked) return;
      cancelTimer();
      pending = null;
      lastWrittenData = null;
      await backend.del(name);
    },
    flush,
    hadStoredValue: () => storedValueFound,
    issue: () => issue,
    pendingSince: () => (pending ? firstPendingAt : 0),
    markSaved(data) {
      cancelTimer();
      pending = null;
      lastWrittenData = data;
    },
  };
}
