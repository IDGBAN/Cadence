import type { AccentName, Settings, ThemeName } from '@/types';
import { ACCENTS } from '@/lib/colors';
import { actions, getData } from '@/store/store';

export type Appearance = Pick<Settings, 'theme' | 'accent' | 'reduceMotion'>;

const APPEARANCE_KEY = 'habit-appearance';
const LAST_DARK_THEME_KEY = 'habit-last-dark-theme';
const THEMES: readonly ThemeName[] = ['midnight', 'oled', 'dusk', 'daylight'];

const isTheme = (v: unknown): v is ThemeName => typeof v === 'string' && (THEMES as readonly string[]).includes(v);
const isAccent = (v: unknown): v is AccentName => typeof v === 'string' && Object.prototype.hasOwnProperty.call(ACCENTS, v);

export function isLightTheme(theme: ThemeName): boolean {
  return theme === 'daylight';
}

export function applyAppearance(appearance: Appearance): void {
  const root = document.documentElement;
  root.dataset.theme = appearance.theme;
  root.dataset.accent = appearance.accent;
  root.dataset.mode = isLightTheme(appearance.theme) ? 'light' : 'dark';
  root.dataset.reduceMotion = String(appearance.reduceMotion);

  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (!bg) return;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = bg;
}

export function readCachedAppearance(): Appearance | null {
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { theme, accent, reduceMotion } = parsed as Record<string, unknown>;
    if (!isTheme(theme) || !isAccent(accent)) return null;
    return { theme, accent, reduceMotion: reduceMotion === true };
  } catch {
    return null;
  }
}

// cached in localStorage so the first paint (before IndexedDB loads) doesn't flash the wrong theme
export function cacheAppearance(appearance: Appearance): void {
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance));
    if (!isLightTheme(appearance.theme)) localStorage.setItem(LAST_DARK_THEME_KEY, appearance.theme);
  } catch {
    // private mode or quota, not a big deal
  }
}

function lastDarkTheme(): ThemeName {
  try {
    const stored = localStorage.getItem(LAST_DARK_THEME_KEY);
    if (isTheme(stored) && !isLightTheme(stored)) return stored;
  } catch {
    // ignore
  }
  return 'midnight';
}

export function toggleLightDark(): void {
  const { theme } = getData().settings;
  actions().updateSettings({ theme: isLightTheme(theme) ? lastDarkTheme() : 'daylight' });
}
