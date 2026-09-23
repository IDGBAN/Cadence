import { useCallback, useEffect, useRef, useSyncExternalStore, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';

export function useMediaQueryMatch(query: string, serverFallback = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  const get = useCallback(
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : serverFallback),
    [query, serverFallback],
  );
  return useSyncExternalStore(subscribe, get, () => serverFallback);
}

/** Press-and-hold repeat for steppers. Keyboard activation fires once. */
export function useAutoRepeat(action: () => void, disabled = false) {
  const actionRef = useRef(action);
  useEffect(() => {
    actionRef.current = action;
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => stop, [stop]);
  useEffect(() => {
    if (disabled) stop();
  }, [disabled, stop]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (disabled || e.button !== 0) return;
      e.preventDefault(); // keep focus where it is and avoid selecting text
      actionRef.current();
      let delay = 110;
      const tick = () => {
        actionRef.current();
        delay = Math.max(40, delay * 0.9);
        timer.current = setTimeout(tick, delay);
      };
      stop();
      timer.current = setTimeout(tick, 420);
    },
    [disabled, stop],
  );

  const onClick = useCallback(
    (e: ReactMouseEvent<HTMLElement>) => {
      // pointer presses already fired on pointerdown, so only keyboard clicks (detail 0) act here
      if (!disabled && e.detail === 0) actionRef.current();
    },
    [disabled],
  );

  return {
    onPointerDown,
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onClick,
    onContextMenu: (e: ReactMouseEvent) => e.preventDefault(),
  };
}

// strip characters that break url(#id) references
export function svgSafeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '');
}

export const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif';
