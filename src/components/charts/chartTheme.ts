// recharts writes colors into SVG attributes, where var() and color-mix() aren't reliable,
// so resolve the theme tokens to concrete strings and refresh when <html> attributes change.
import { useSyncExternalStore } from 'react';

export interface ChartTheme {
  mode: 'dark' | 'light';
  grid: string;
  axis: string;
  text: string;
  textMuted: string;
  surface: string;
  surface2: string;
  border: string;
  accent: string;
  accent2: string;
  success: string;
  danger: string;
  warning: string;
  info: string;
  flame: string;
  xp: string;
  cellEmpty: string;
}

const VARS = {
  grid: '--line',
  axis: '--line-strong',
  text: '--fg',
  textMuted: '--fg-3',
  surface: '--surface',
  surface2: '--surface-2',
  border: '--line',
  accent: '--accent',
  accent2: '--accent-2',
  success: '--success',
  danger: '--danger',
  warning: '--warning',
  info: '--info',
  flame: '--flame',
  xp: '--xp',
  cellEmpty: '--cell-empty',
} as const;

type ColorKey = keyof typeof VARS;

const COLOR_KEYS = Object.keys(VARS) as ColorKey[];

// mirrors the default theme in index.css
const FALLBACK: ChartTheme = {
  mode: 'dark',
  grid: '#1d2133',
  axis: '#2a3048',
  text: '#eceef7',
  textMuted: '#7c8299',
  surface: '#0f111c',
  surface2: '#151826',
  border: '#1d2133',
  accent: '#8b7bff',
  accent2: '#c084fc',
  success: '#34d399',
  danger: '#f87171',
  warning: '#fbbf24',
  info: '#60a5fa',
  flame: '#ff8a3d',
  xp: '#fcd34d',
  cellEmpty: '#151826',
};

const ATTRIBUTES = ['data-theme', 'data-accent', 'data-mode'] as const;

let cached: ChartTheme | null = null;
let cachedKey = '';

const MAX_RETRIES = 5;
let retries = 0;
let retryHandle: number | null = null;

const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;

function signature(root: HTMLElement): string {
  return ATTRIBUTES.map((attr) => root.getAttribute(attr) ?? '').join('|');
}

function invalidate(): void {
  cached = null;
  cachedKey = '';
  for (const listener of listeners) listener();
}

// a partial read still gets cached (useSyncExternalStore needs a stable snapshot),
// so retry a few frames later instead
function scheduleRetry(): void {
  if (retryHandle !== null || retries >= MAX_RETRIES) return;
  if (typeof requestAnimationFrame !== 'function') return;
  retries++;
  retryHandle = requestAnimationFrame(() => {
    retryHandle = null;
    invalidate();
  });
}

export function readChartTheme(): ChartTheme {
  if (typeof document === 'undefined' || typeof window === 'undefined') return FALLBACK;
  const root = document.documentElement;
  const key = signature(root);
  if (cached && cachedKey === key) return cached;

  const styles = window.getComputedStyle(root);
  const colors = {} as Record<ColorKey, string>;
  let complete = true;
  for (const colorKey of COLOR_KEYS) {
    const value = styles.getPropertyValue(VARS[colorKey]).trim();
    if (value) colors[colorKey] = value;
    else {
      colors[colorKey] = FALLBACK[colorKey];
      complete = false;
    }
  }

  cached = { mode: root.getAttribute('data-mode') === 'light' ? 'light' : 'dark', ...colors };
  cachedKey = key;
  if (complete) retries = 0;
  else scheduleRetry();
  return cached;
}

function subscribe(onChange: () => void): () => void {
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return () => undefined;
  listeners.add(onChange);
  if (!observer) {
    observer = new MutationObserver(() => {
      retries = 0;
      invalidate();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [...ATTRIBUTES] });
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size > 0 || !observer) return;
    observer.disconnect();
    observer = null;
  };
}

const serverSnapshot = (): ChartTheme => FALLBACK;

/** Returns the same object until the theme changes, so it's safe in dependency arrays. */
export function useChartTheme(): ChartTheme {
  return useSyncExternalStore(subscribe, readChartTheme, serverSnapshot);
}

// keep in sync with --font-sans in index.css
export const CHART_FONT = "'Plus Jakarta Sans Variable', ui-sans-serif, system-ui, sans-serif";

export function axisTick(theme: ChartTheme): { fill: string; fontSize: number; fontFamily: string } {
  return { fill: theme.textMuted, fontSize: 11, fontFamily: CHART_FONT };
}

// let recharts measure the left axis labels. a negative left margin eats into that space
// and clips labels ("100%" renders as "00%"), so always pair this with CHART_MARGIN.
export const Y_AXIS_FIT = { width: 'auto', tickLine: false, axisLine: false } as const;

export const CHART_MARGIN = { top: 8, right: 8, bottom: 0, left: 0 } as const;
