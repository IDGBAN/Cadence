import type { CSSProperties } from 'react';
import type { HabitColor } from '@/types';

// picked to work on both the dark and light themes. Components set --habit with habitStyle()
// and use the habit-* utilities in index.css.
export const HABIT_COLORS: Record<HabitColor, { hex: string; label: string }> = {
  rose: { hex: '#fb7185', label: 'Rose' },
  orange: { hex: '#fb923c', label: 'Orange' },
  amber: { hex: '#fbbf24', label: 'Amber' },
  yellow: { hex: '#facc15', label: 'Yellow' },
  lime: { hex: '#a3e635', label: 'Lime' },
  emerald: { hex: '#34d399', label: 'Emerald' },
  teal: { hex: '#2dd4bf', label: 'Teal' },
  cyan: { hex: '#22d3ee', label: 'Cyan' },
  sky: { hex: '#38bdf8', label: 'Sky' },
  blue: { hex: '#60a5fa', label: 'Blue' },
  indigo: { hex: '#818cf8', label: 'Indigo' },
  violet: { hex: '#a78bfa', label: 'Violet' },
  purple: { hex: '#c084fc', label: 'Purple' },
  pink: { hex: '#f472b6', label: 'Pink' },
  slate: { hex: '#94a3b8', label: 'Slate' },
};

export const HABIT_COLOR_KEYS = Object.keys(HABIT_COLORS) as HabitColor[];

export function habitHex(color: HabitColor): string {
  return HABIT_COLORS[color]?.hex ?? HABIT_COLORS.violet.hex;
}

export function habitStyle(color: HabitColor, extra?: CSSProperties): CSSProperties {
  return { ['--habit' as string]: habitHex(color), ...extra } as CSSProperties;
}

// for canvas/recharts, where CSS vars don't work
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// keep in sync with the data-accent rules in index.css
export const ACCENTS = {
  violet: { hex: '#8b7bff', label: 'Violet' },
  emerald: { hex: '#34d399', label: 'Emerald' },
  sky: { hex: '#38bdf8', label: 'Sky' },
  rose: { hex: '#fb7185', label: 'Rose' },
  amber: { hex: '#fbbf24', label: 'Amber' },
  cyan: { hex: '#22d3ee', label: 'Cyan' },
} as const;
