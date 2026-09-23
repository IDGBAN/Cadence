import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { Keyboard, Moon, Plus, Search, Sun } from 'lucide-react';
import { Button, IconButton, Kbd, Tooltip } from '@/components/ui';
import { LevelProgress } from '@/components/rewards/LevelProgress';
import { useMediaQuery } from '@/store/hooks';
import { useStore } from '@/store/store';
import { useUI } from '@/store/ui';
import { BrandMark, BrandWordmark } from './BrandMark';
import { LevelMedallion } from './LevelMedallion';
import { NAV_BY_KEY, NAV_ITEMS, navKeyForPath, type NavItem } from './nav';
import { isLightTheme, toggleLightDark } from './appearance';
import { MOD_KEY } from './platform';
import { openShortcuts } from './shellStore';
import { SidebarTimers } from './RunningTimer';

const MotionLink = motion.create(Link);

const INDICATOR_SPRING = { type: 'spring', stiffness: 520, damping: 42, mass: 0.9 } as const;

interface SidebarLinkProps {
  item: NavItem;
  active: boolean;
  expanded: boolean;
  showHint?: boolean;
}

function SidebarLink({ item, active, expanded, showHint = true }: SidebarLinkProps) {
  const Icon = item.icon;
  return (
    <Tooltip content={item.label} side="right" disabled={expanded}>
      <MotionLink
        to={item.to}
        aria-current={active ? 'page' : undefined}
        whileTap={{ scale: 0.97 }}
        className={clsx(
          'group relative flex h-11 w-full items-center justify-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors duration-150 lg:justify-start',
          active ? 'text-fg' : 'text-fg-3 hover:bg-surface-2/70 hover:text-fg',
        )}
      >
        {active && (
          <motion.span
            layoutId="sidebar-active-indicator"
            aria-hidden="true"
            transition={INDICATOR_SPRING}
            className="absolute inset-0 rounded-xl border border-line-strong/70 bg-surface-2 shadow-card"
          >
            <motion.span layout className="accent-gradient absolute top-1/2 left-0 -mt-2.5 h-5 w-[3px] rounded-r-full" />
          </motion.span>
        )}
        <Icon
          aria-hidden="true"
          strokeWidth={active ? 2.25 : 2}
          className={clsx(
            'relative size-[19px] shrink-0 transition-colors duration-150',
            active ? 'text-accent' : 'text-fg-3 group-hover:text-fg-2',
          )}
        />
        <span className="relative hidden truncate lg:inline">{item.label}</span>
        <span className="sr-only lg:hidden">{item.label}</span>
        {showHint && (
          <span aria-hidden="true" className="relative ml-auto hidden items-center gap-1 lg:group-hover:flex">
            <Kbd>G</Kbd>
            <Kbd>{item.goKey.toUpperCase()}</Kbd>
          </span>
        )}
      </MotionLink>
    </Tooltip>
  );
}

function ThemeToggle({ expanded }: { expanded: boolean }) {
  const light = useStore((s) => isLightTheme(s.data.settings.theme));
  const label = light ? 'Switch to dark theme' : 'Switch to light theme';
  return (
    <Tooltip content={label} side={expanded ? 'top' : 'right'}>
      <button
        type="button"
        onClick={toggleLightDark}
        aria-label={label}
        className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl text-fg-3 transition-colors hover:bg-surface-2/70 hover:text-fg"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={light ? 'moon' : 'sun'}
            initial={{ opacity: 0, rotate: -60, scale: 0.6 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 60, scale: 0.6 }}
            transition={{ duration: 0.18 }}
            className="flex"
          >
            {light ? <Moon aria-hidden="true" className="size-[18px]" /> : <Sun aria-hidden="true" className="size-[18px]" />}
          </motion.span>
        </AnimatePresence>
      </button>
    </Tooltip>
  );
}

export function Sidebar() {
  const { pathname } = useLocation();
  const activeKey = navKeyForPath(pathname);
  const expanded = useMediaQuery('(min-width: 1024px)');
  const openHabitEditor = useUI((s) => s.openHabitEditor);
  const setCommandPalette = useUI((s) => s.setCommandPalette);

  const mainItems = NAV_ITEMS.filter((item) => item.key !== 'settings');
  const settings = NAV_BY_KEY.settings;

  return (
    <aside
      aria-label="Sidebar"
      className="fixed inset-y-0 left-0 z-30 hidden w-[76px] flex-col border-r border-line bg-bg-soft/75 backdrop-blur-xl md:flex lg:w-[248px]"
    >
      <div className="flex h-full flex-col overflow-x-hidden overflow-y-auto px-3 pt-5 pb-4 lg:px-4">
        <Link
          to="/"
          aria-label="Cadence, go to Today"
          className="mb-6 flex h-11 items-center justify-center gap-2.5 rounded-xl lg:justify-start lg:px-2"
        >
          <BrandMark size={34} glow />
          <BrandWordmark className="hidden text-[23px] lg:inline" />
        </Link>

        <div className="flex flex-col gap-2">
          <div className="hidden lg:block">
            <Button variant="primary" fullWidth icon={<Plus aria-hidden="true" />} onClick={() => openHabitEditor(null)}>
              New habit
            </Button>
          </div>
          <div className="flex justify-center lg:hidden">
            <Tooltip content="New habit" side="right">
              <IconButton label="New habit" variant="primary" tooltip={false} onClick={() => openHabitEditor(null)}>
                <Plus aria-hidden="true" />
              </IconButton>
            </Tooltip>
          </div>

          <Tooltip content={`Search · ${MOD_KEY} K`} side="right" disabled={expanded}>
            <button
              type="button"
              onClick={() => setCommandPalette(true)}
              aria-label="Search and commands"
              aria-keyshortcuts="Control+K Meta+K"
              className="group flex h-10 w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-surface/60 text-sm text-fg-3 transition-colors hover:border-line-strong hover:bg-surface hover:text-fg-2 lg:justify-start lg:px-3"
            >
              <Search aria-hidden="true" className="size-4 shrink-0" />
              <span className="hidden flex-1 text-left lg:inline">Search…</span>
              <span aria-hidden="true" className="hidden items-center gap-1 lg:flex">
                <Kbd>{MOD_KEY}</Kbd>
                <Kbd>K</Kbd>
              </span>
            </button>
          </Tooltip>
        </div>

        <div className="mt-4 empty:hidden">
          <SidebarTimers />
        </div>

        <nav aria-label="Main" className="mt-6">
          <p className="eyebrow mb-2 hidden px-3 lg:block">Menu</p>
          <ul className="flex flex-col gap-1">
            {mainItems.map((item) => (
              <li key={item.key}>
                <SidebarLink item={item} active={activeKey === item.key} expanded={expanded} />
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-auto flex flex-col gap-3 pt-6">
          <div className="hidden lg:block">
            <LevelProgress variant="sidebar" />
          </div>
          <div className="lg:hidden">
            <LevelMedallion />
          </div>

          <div className="flex flex-col items-center gap-1 border-t border-line pt-3 lg:flex-row">
            <nav aria-label="Preferences" className="w-full lg:min-w-0 lg:flex-1">
              <SidebarLink item={settings} active={activeKey === 'settings'} expanded={expanded} showHint={false} />
            </nav>
            <ThemeToggle expanded={expanded} />
            <Tooltip content="Keyboard shortcuts · ?" side={expanded ? 'top' : 'right'}>
              <button
                type="button"
                onClick={openShortcuts}
                aria-label="Keyboard shortcuts"
                aria-keyshortcuts="?"
                className="flex size-10 shrink-0 items-center justify-center rounded-xl text-fg-3 transition-colors hover:bg-surface-2/70 hover:text-fg"
              >
                <Keyboard aria-hidden="true" className="size-[18px]" />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </aside>
  );
}
