import { useCallback, useEffect, useRef, useState } from 'react';

// Reorder.Group fires onReorder on every frame of a drag. buffer it and commit once
// on pointerup, otherwise every frame lands in the undo history.

export interface ReorderBuffer<T> {
  value: T | null;
  push: (next: T) => void;
}

export function useReorderBuffer<T>(commit: (value: T) => void): ReorderBuffer<T> {
  const [value, setValue] = useState<T | null>(null);
  const pending = useRef<T | null>(null);
  const release = useRef<(() => void) | null>(null);
  const commitRef = useRef(commit);
  commitRef.current = commit;

  // still commit if we unmount mid-drag (route change etc.)
  useEffect(() => () => release.current?.(), []);

  const push = useCallback((next: T) => {
    pending.current = next;
    setValue(next);
    if (release.current) return;

    const finish = () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      release.current = null;
      const order = pending.current;
      pending.current = null;
      setValue(null);
      if (order !== null) commitRef.current(order);
    };

    release.current = finish;
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }, []);

  return { value, push };
}
