import { useLayoutEffect, type ReactNode } from 'react';
import { MotionConfig } from 'motion/react';
import { useStore } from '@/store/store';
import { applyAppearance, cacheAppearance } from './appearance';

export function ThemeSync() {
  const hydrated = useStore((s) => s.hydrated);
  const theme = useStore((s) => s.data.settings.theme);
  const accent = useStore((s) => s.data.settings.accent);
  const reduceMotion = useStore((s) => s.data.settings.reduceMotion);

  useLayoutEffect(() => {
    // before hydration the store only has defaults, and main.tsx already applied the cached theme
    if (!hydrated) return;
    const appearance = { theme, accent, reduceMotion };
    applyAppearance(appearance);
    cacheAppearance(appearance);
  }, [hydrated, theme, accent, reduceMotion]);

  return null;
}

export function MotionRoot({ children }: { children: ReactNode }) {
  const reduceMotion = useStore((s) => s.data.settings.reduceMotion);
  return <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>{children}</MotionConfig>;
}
