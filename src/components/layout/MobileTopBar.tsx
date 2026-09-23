import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { Search, Settings } from 'lucide-react';
import { IconButton } from '@/components/ui';
import { LevelProgress } from '@/components/rewards/LevelProgress';
import { useUI } from '@/store/ui';
import { BrandMark, BrandWordmark } from './BrandMark';
import { useRouteMeta } from './routeMeta';
import { useScrolled } from './useScrolled';
import { HeaderTimer, useRunningTimers } from './RunningTimer';

const SWAP = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
} as const;

export function MobileTopBar() {
  const { title, nav } = useRouteMeta();
  const scrolled = useScrolled(4);
  const showTitle = useScrolled(56);
  const navigate = useNavigate();
  const setCommandPalette = useUI((s) => s.setCommandPalette);
  // a running timer replaces the level pill, it matters more right now
  const timing = useRunningTimers().length > 0;

  return (
    <header
      className={clsx(
        'fixed inset-x-0 top-0 z-40 border-b pt-[env(safe-area-inset-top)] transition-[background-color,border-color,box-shadow] duration-300 md:hidden',
        scrolled
          ? 'glass border-x-0 border-t-0 shadow-[0_10px_30px_-20px_rgba(0,0,0,0.55)]'
          : 'border-transparent bg-transparent',
      )}
    >
      <div className="flex h-14 items-center gap-1 pr-2 pl-4">
        <div className="relative h-full min-w-0 flex-1">
          <AnimatePresence initial={false}>
            {showTitle ? (
              <motion.div key="title" {...SWAP} className="absolute inset-0 flex items-center">
                <span className="truncate font-display text-lg font-semibold tracking-tight text-fg">{title}</span>
              </motion.div>
            ) : (
              <motion.div key="brand" {...SWAP} className="absolute inset-0 flex items-center">
                <Link to="/" aria-label="Cadence, go to Today" className="flex items-center gap-2 rounded-lg">
                  <BrandMark size={28} glow />
                  <BrandWordmark className="text-xl" />
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {timing ? (
          <HeaderTimer className="mr-1 shrink-0" />
        ) : (
          <LevelProgress variant="header" className="mr-1 shrink-0" />
        )}
        <IconButton label="Search and commands" tooltip={false} size="md" onClick={() => setCommandPalette(true)}>
          <Search aria-hidden="true" />
        </IconButton>
        <IconButton
          label="Settings"
          tooltip={false}
          size="md"
          active={nav === 'settings'}
          // it navigates, it isn't a toggle
          aria-pressed={undefined}
          aria-current={nav === 'settings' ? 'page' : undefined}
          onClick={() => navigate('/settings')}
        >
          <Settings aria-hidden="true" />
        </IconButton>
      </div>
    </header>
  );
}
