// stack of open overlays, so Escape and outside clicks only affect the top one
import { useCallback, useId, useLayoutEffect, useMemo, useRef } from 'react';

interface Layer {
  id: string;
  escape: () => boolean;
}

const stack: Layer[] = [];
let topAtPointerDown: string | null = null;
let listening = false;

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.isComposing) return;
  const top = stack[stack.length - 1];
  if (!top) return;
  // the top layer swallows Escape even when it can't be dismissed, so lower layers stay open
  e.stopPropagation();
  e.preventDefault();
  top.escape();
}

function onPointerDown() {
  topAtPointerDown = stack[stack.length - 1]?.id ?? null;
}

function ensureListeners() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('keydown', onKeyDown, true);
  // window capture runs before floating-ui's document listeners
  window.addEventListener('pointerdown', onPointerDown, true);
}

function removeLayer(id: string) {
  const i = stack.findIndex((l) => l.id === id);
  if (i >= 0) stack.splice(i, 1);
}

export interface LayerHandle {
  id: string;
  isTop: () => boolean;
  wasTopAtPointerDown: () => boolean;
  /** Remove right away instead of waiting for the effect cleanup. */
  release: () => void;
}

/** Pass no onEscape for layers that can't be dismissed (Escape is still swallowed). */
export function useLayer(active: boolean, onEscape?: () => void): LayerHandle {
  const id = useId();
  const escRef = useRef(onEscape);
  useLayoutEffect(() => {
    escRef.current = onEscape;
  });

  useLayoutEffect(() => {
    if (!active) return;
    ensureListeners();
    removeLayer(id);
    stack.push({
      id,
      escape: () => {
        const fn = escRef.current;
        if (!fn) return false;
        fn();
        return true;
      },
    });
    return () => removeLayer(id);
  }, [active, id]);

  const isTop = useCallback(() => stack[stack.length - 1]?.id === id, [id]);
  const wasTopAtPointerDown = useCallback(() => topAtPointerDown === id, [id]);
  const release = useCallback(() => removeLayer(id), [id]);
  return useMemo(() => ({ id, isTop, wasTopAtPointerDown, release }), [id, isTop, wasTopAtPointerDown, release]);
}

// ref-counted so stacked modals don't unlock each other
let lockCount = 0;
let saved: { overflow: string; paddingRight: string } | null = null;

export function lockScroll(): () => void {
  if (typeof document === 'undefined') return () => {};
  if (lockCount === 0) {
    const html = document.documentElement;
    const scrollbar = window.innerWidth - html.clientWidth;
    saved = { overflow: html.style.overflow, paddingRight: document.body.style.paddingRight };
    html.style.overflow = 'hidden';
    if (scrollbar > 0) {
      const current = parseFloat(getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.paddingRight = `${current + scrollbar}px`;
    }
  }
  lockCount++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0 && saved) {
      document.documentElement.style.overflow = saved.overflow;
      document.body.style.paddingRight = saved.paddingRight;
      saved = null;
    }
  };
}

const TABBABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function getTabbables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter((el) => {
    if (el.tabIndex < 0) return false;
    if (el.closest('[inert]')) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0 || el === document.activeElement;
  });
}
