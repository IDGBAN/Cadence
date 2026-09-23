import { Check } from 'lucide-react';
import { motion } from 'motion/react';
import type { AccentName, ThemeName } from '@/types';
import { ACCENTS, habitStyle } from '@/lib/colors';
import { cn } from '@/components/ui';
import { useReducedMotion } from '@/store/hooks';

export const THEMES: Array<{ value: ThemeName; label: string; blurb: string }> = [
  { value: 'midnight', label: 'Midnight', blurb: 'Deep navy · the default' },
  { value: 'oled', label: 'OLED', blurb: 'True black · saves battery' },
  { value: 'dusk', label: 'Dusk', blurb: 'Warm plum · easy at night' },
  { value: 'daylight', label: 'Daylight', blurb: 'Bright and crisp' },
];

const modeFor = (theme: ThemeName): 'light' | 'dark' => (theme === 'daylight' ? 'light' : 'dark');

export const ACCENT_KEYS = Object.keys(ACCENTS) as AccentName[];

const PREVIEW_CELLS = [1, 0.75, 1, 0.35, 1, 0.6, 0];

// data-theme on the wrapper makes every token inside resolve to that theme's real values
function ThemeMiniature({ theme, accent }: { theme: ThemeName; accent: AccentName }) {
  return (
    <div
      data-theme={theme}
      data-accent={accent}
      data-mode={modeFor(theme)}
      aria-hidden="true"
      className="pointer-events-none select-none bg-bg p-2.5"
    >
      <div className="mb-2 flex items-center gap-1.5">
        <span className="size-2 rounded-full accent-gradient" />
        <span className="h-1.5 w-8 rounded-full bg-fg-4/60" />
        <span className="ml-auto h-1.5 w-4 rounded-full bg-fg-4/40" />
      </div>

      <div className="rounded-[10px] border border-line bg-surface p-2 shadow-card" style={habitStyle('sky')}>
        <div className="flex items-center gap-1.5">
          <span className="flex size-5 items-center justify-center rounded-md habit-gradient text-[10px] leading-none">
            💧
          </span>
          <span className="flex-1">
            <span className="block h-1.5 w-10 rounded-full bg-fg/70" />
            <span className="mt-1 block h-1 w-6 rounded-full bg-fg-4/70" />
          </span>
          <span className="flex size-4 items-center justify-center rounded-full bg-success/20">
            <Check className="size-2.5 text-success" strokeWidth={3.5} />
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
          <div className="h-full w-[68%] rounded-full accent-gradient" />
        </div>
      </div>

      <div className="mt-2 flex gap-1">
        {PREVIEW_CELLS.map((v, i) => (
          <span
            key={i}
            className="h-3 flex-1 rounded-[3px]"
            style={{
              background:
                v === 0
                  ? 'var(--cell-empty)'
                  : `color-mix(in oklab, var(--accent) ${Math.round(28 + v * 72)}%, var(--cell-empty))`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export interface ThemePickerProps {
  value: ThemeName;
  accent: AccentName;
  onChange: (theme: ThemeName) => void;
  className?: string;
}

export function ThemePicker({ value, accent, onChange, className }: ThemePickerProps) {
  const reduced = useReducedMotion();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn('grid grid-cols-2 gap-3 xl:grid-cols-4', className)}
    >
      {THEMES.map((theme) => {
        const selected = theme.value === value;
        return (
          <button
            key={theme.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(theme.value)}
            className={cn(
              'group relative overflow-hidden rounded-2xl border text-left transition-[border-color,box-shadow,transform] duration-200',
              'hover:-translate-y-0.5 active:translate-y-0',
              selected
                ? 'border-accent/70 shadow-[0_0_0_1px_var(--accent),0_12px_30px_-14px_color-mix(in_oklab,var(--accent)_75%,transparent)]'
                : 'border-line hover:border-line-strong',
            )}
          >
            <ThemeMiniature theme={theme.value} accent={accent} />
            <span className="flex items-center gap-1.5 border-t border-line bg-surface px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-fg">{theme.label}</span>
                <span className="block truncate text-[11px] leading-tight text-fg-3">{theme.blurb}</span>
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-[18px] shrink-0 items-center justify-center rounded-full border transition-colors duration-200',
                  selected ? 'border-transparent bg-accent text-accent-fg' : 'border-line-strong text-transparent',
                )}
              >
                {selected && (
                  <motion.span
                    initial={reduced ? false : { scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                    className="flex"
                  >
                    <Check className="size-3" strokeWidth={3.5} />
                  </motion.span>
                )}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export interface AccentPickerProps {
  value: AccentName;
  // the light theme tweaks some accents, so swatches render in the current theme
  theme: ThemeName;
  onChange: (accent: AccentName) => void;
  className?: string;
}

export function AccentPicker({ value, theme, onChange, className }: AccentPickerProps) {
  return (
    <div role="radiogroup" aria-label="Accent color" className={cn('flex flex-wrap items-center gap-2.5', className)}>
      {ACCENT_KEYS.map((accent) => {
        const selected = accent === value;
        return (
          <button
            key={accent}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={ACCENTS[accent].label}
            title={ACCENTS[accent].label}
            data-theme={theme}
            data-accent={accent}
            data-mode={modeFor(theme)}
            onClick={() => onChange(accent)}
            className={cn(
              'relative flex size-10 items-center justify-center rounded-full transition-transform duration-200',
              'hover:scale-105 active:scale-95',
              selected
                ? 'shadow-[0_0_0_2px_var(--bg),0_0_0_4px_var(--accent)]'
                : 'shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fg)_14%,transparent)]',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex size-7 items-center justify-center rounded-full accent-gradient text-accent-fg',
                'shadow-[inset_0_1px_0_rgb(255_255_255/0.3)]',
              )}
            >
              {selected && <Check className="size-3.5" strokeWidth={3.5} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
