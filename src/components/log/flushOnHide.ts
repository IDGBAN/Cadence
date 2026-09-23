// mobile browsers can discard a hidden page without unmounting anything, so debounced
// editors commit here on pagehide / visibilitychange instead
import { useEffect, useRef } from 'react';
import { flushPersistence } from '@/store/store';

type FlushFn = () => void;

const registered = new Set<FlushFn>();
let listening = false;

function flushAll(): void {
  for (const flush of [...registered]) {
    try {
      flush();
    } catch {
      // one broken editor shouldn't block the rest
    }
  }
  // the store's own listeners already ran before these writes, so persist again
  void flushPersistence();
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'hidden') flushAll();
}

function listen(): void {
  if (listening || typeof window === 'undefined' || typeof document === 'undefined') return;
  listening = true;
  window.addEventListener('pagehide', flushAll);
  document.addEventListener('visibilitychange', onVisibilityChange);
}

/** `flush` can run more than once (hide, show, hide), so it has to be a no-op when nothing is pending. */
export function useFlushOnHide(flush: FlushFn): void {
  const ref = useRef(flush);
  ref.current = flush;
  useEffect(() => {
    const run = () => ref.current();
    listen();
    registered.add(run);
    return () => {
      registered.delete(run);
    };
  }, []);
}
