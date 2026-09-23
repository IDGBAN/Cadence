import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { CalendarDays, Database, Info, ListChecks, Palette, User, Volume2 } from 'lucide-react';
import { cn } from '@/components/ui';
import { useReducedMotion } from '@/store/hooks';

export interface SettingsSectionMeta {
  id: string;
  label: string;
  icon: ReactNode;
}

export const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  { id: 'profile', label: 'Profile', icon: <User aria-hidden="true" /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette aria-hidden="true" /> },
  { id: 'days', label: 'Days & weeks', icon: <CalendarDays aria-hidden="true" /> },
  { id: 'feedback', label: 'Feedback', icon: <Volume2 aria-hidden="true" /> },
  { id: 'today', label: 'Today view', icon: <ListChecks aria-hidden="true" /> },
  { id: 'data', label: 'Data', icon: <Database aria-hidden="true" /> },
  { id: 'about', label: 'About', icon: <Info aria-hidden="true" /> },
];

const SECTION_IDS = SETTINGS_SECTIONS.map((s) => s.id);
const SPY_OFFSET = 140;

function useActiveSection(): string {
  const [active, setActive] = useState<string>(SECTION_IDS[0]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = SECTION_IDS[0];
      for (const id of SECTION_IDS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top - SPY_OFFSET <= 0) current = id;
      }
      // the last section can't scroll up to the offset, so pick it once we hit the bottom
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 12) {
        current = SECTION_IDS[SECTION_IDS.length - 1];
      }
      setActive((prev) => (prev === current ? prev : current));
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return active;
}

function useGoToSection(reduced: boolean) {
  return (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  };
}

export function SettingsNav({ className }: { className?: string }) {
  const active = useActiveSection();
  const reduced = useReducedMotion();
  const go = useGoToSection(reduced);

  return (
    <nav aria-label="Settings sections" className={className}>
      <p className="eyebrow mb-3 px-3">Settings</p>
      <ul className="space-y-0.5">
        {SETTINGS_SECTIONS.map((section) => {
          const isActive = section.id === active;
          return (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                aria-current={isActive ? 'true' : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  go(section.id);
                }}
                className={cn(
                  'relative flex h-10 items-center gap-2.5 rounded-xl px-3 text-sm font-medium transition-colors duration-150',
                  '[&_svg]:size-[17px] [&_svg]:shrink-0',
                  isActive ? 'text-fg' : 'text-fg-3 hover:bg-surface-2 hover:text-fg-2',
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="settings-nav-active"
                    aria-hidden="true"
                    transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }}
                    className="absolute inset-0 -z-10 rounded-xl border border-line bg-surface-2"
                  />
                )}
                <span className={cn(isActive ? 'text-accent' : 'text-fg-4')}>{section.icon}</span>
                <span className="truncate">{section.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SettingsQuickNav({ className }: { className?: string }) {
  const active = useActiveSection();
  const reduced = useReducedMotion();
  const go = useGoToSection(reduced);
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rail = railRef.current;
    const chip = rail?.querySelector<HTMLElement>(`[data-section="${active}"]`);
    if (!rail || !chip) return;
    const offset = chip.offsetLeft - rail.clientWidth / 2 + chip.clientWidth / 2;
    rail.scrollTo({ left: Math.max(0, offset), behavior: reduced ? 'auto' : 'smooth' });
  }, [active, reduced]);

  return (
    <nav aria-label="Settings sections" className={className}>
      <div ref={railRef} className="scroll-fade-x -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SETTINGS_SECTIONS.map((section) => {
          const isActive = section.id === active;
          return (
            <a
              key={section.id}
              data-section={section.id}
              href={`#${section.id}`}
              aria-current={isActive ? 'true' : undefined}
              onClick={(e) => {
                e.preventDefault();
                go(section.id);
              }}
              className={cn(
                'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors duration-150',
                '[&_svg]:size-4 [&_svg]:shrink-0',
                isActive
                  ? 'border-[color-mix(in_oklab,var(--accent)_45%,transparent)] bg-accent/14 text-accent light:text-[color-mix(in_oklab,var(--accent)_82%,black)]'
                  : 'border-line bg-surface-2 text-fg-3',
              )}
            >
              {section.icon}
              {section.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
