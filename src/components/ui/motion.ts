import { useSyncExternalStore } from 'react';
import { useReducedMotionConfig, type Transition } from 'motion/react';

export const springPress: Transition = { type: 'spring', stiffness: 520, damping: 30, mass: 0.6 };
export const springSnappy: Transition = { type: 'spring', stiffness: 480, damping: 38, mass: 0.8 };
export const springSoft: Transition = { type: 'spring', stiffness: 340, damping: 32, mass: 0.9 };
export const springFill: Transition = { type: 'spring', stiffness: 90, damping: 20, mass: 1 };
export const easeOut = [0.22, 1, 0.36, 1] as const;
export const instant: Transition = { duration: 0 };

const ATTR = 'data-reduce-motion';

function readAttr(): boolean {
  if (typeof document === 'undefined') return false;
  return (
    document.documentElement.getAttribute(ATTR) === 'true' ||
    (document.body?.getAttribute(ATTR) ?? '') === 'true'
  );
}

function subscribeAttr(onChange: () => void): () => void {
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [ATTR] });
  if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: [ATTR] });
  return () => observer.disconnect();
}

/** OS setting, <MotionConfig reducedMotion>, or data-reduce-motion="true" on <html> or <body>. */
export function useReducedMotionPref(): boolean {
  const config = useReducedMotionConfig();
  const attr = useSyncExternalStore(subscribeAttr, readAttr, () => false);
  return Boolean(config) || attr;
}
