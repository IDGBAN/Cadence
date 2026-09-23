import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import clsx from 'clsx';
import { haptic } from '@/lib/feedback';
import { NAV_ITEMS, navKeyForPath } from './nav';
import { isEditableTarget } from './platform';

const TAB_ITEMS = NAV_ITEMS.filter((item) => item.inTabBar);

// hide the tab bar while typing, otherwise it rides up on top of the Android keyboard
function useEditingText(): boolean {
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      // on focusout activeElement hasn't settled yet
      frame = requestAnimationFrame(() => setEditing(isEditableTarget(document.activeElement)));
    };
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, []);
  return editing;
}

export function BottomNav() {
  const { pathname } = useLocation();
  const activeKey = navKeyForPath(pathname);
  const editing = useEditingText();

  return (
    <nav
      aria-label="Primary"
      className={clsx(
        'glass fixed inset-x-0 bottom-0 z-40 border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_-20px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-out md:hidden',
        editing && 'pointer-events-none translate-y-full',
      )}
    >
      <ul className="mx-auto flex max-w-xl items-stretch px-1">
        {TAB_ITEMS.map((item) => {
          const active = item.key === activeKey;
          const Icon = item.icon;
          return (
            <li key={item.key} className="min-w-0 flex-1">
              <Link
                to={item.to}
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  if (!active) haptic(8);
                }}
                className="flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-xl pt-2 pb-1.5 [-webkit-tap-highlight-color:transparent]"
              >
                <motion.span whileTap={{ scale: 0.86 }} className="relative flex h-8 w-14 items-center justify-center">
                  {active && (
                    <motion.span
                      layoutId="tabbar-active-pill"
                      aria-hidden="true"
                      transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                      className="absolute inset-0 rounded-full bg-accent/15 ring-1 ring-accent/25 ring-inset"
                    />
                  )}
                  <Icon
                    aria-hidden="true"
                    strokeWidth={active ? 2.3 : 2}
                    className={clsx('relative size-[21px] transition-colors duration-200', active ? 'text-accent' : 'text-fg-3')}
                  />
                </motion.span>
                <span
                  className={clsx(
                    'max-w-full truncate px-0.5 text-[11px] leading-none font-medium tracking-tight transition-colors duration-200',
                    active ? 'text-fg' : 'text-fg-3',
                  )}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
