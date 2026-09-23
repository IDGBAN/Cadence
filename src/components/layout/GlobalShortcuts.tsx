import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Kbd } from '@/components/ui';
import { useUI } from '@/store/ui';
import { NAV_ITEMS } from './nav';
import { isEditableTarget, isModalOpen } from './platform';
import { openShortcuts } from './shellStore';
import { redoWithToast, undoWithToast } from './commands';

const GO_TIMEOUT_MS = 1000;

export function GlobalShortcuts() {
  const navigate = useNavigate();
  const [goPending, setGoPending] = useState(false);
  const goTimer = useRef<number | null>(null);

  useEffect(() => {
    const clearGo = () => {
      if (goTimer.current !== null) window.clearTimeout(goTimer.current);
      goTimer.current = null;
      setGoPending(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const ui = useUI.getState();
      if (ui.commandPalette || isModalOpen()) {
        if (goTimer.current !== null) clearGo();
        return;
      }

      const key = e.key.toLowerCase();
      const typing = isEditableTarget(e.target);
      const mod = (e.ctrlKey || e.metaKey) && !e.altKey;

      if (mod) {
        if (key === 'k' || e.code === 'KeyK') {
          e.preventDefault();
          clearGo();
          ui.setCommandPalette(true);
          return;
        }
        // leave native text undo alone while typing
        if (typing) return;
        if (key === 'z' || e.code === 'KeyZ') {
          e.preventDefault();
          if (e.shiftKey) redoWithToast();
          else undoWithToast();
          return;
        }
        if ((key === 'y' || e.code === 'KeyY') && !e.shiftKey) {
          e.preventDefault();
          redoWithToast();
        }
        return;
      }

      if (typing || e.altKey || e.ctrlKey || e.metaKey) return;

      // second key of a "g" sequence
      if (goTimer.current !== null) {
        if (key === 'shift') return;
        const target = NAV_ITEMS.find((item) => item.goKey === key);
        if (target || key === 'escape') {
          e.preventDefault();
          clearGo();
          if (target) navigate(target.to);
          return;
        }
        clearGo();
      }

      if (e.repeat) return;
      switch (key) {
        case 'g':
          e.preventDefault();
          setGoPending(true);
          goTimer.current = window.setTimeout(clearGo, GO_TIMEOUT_MS);
          return;
        case 'n':
          e.preventDefault();
          ui.openHabitEditor(null);
          return;
        case '/':
          e.preventDefault();
          ui.setCommandPalette(true);
          return;
        case '?':
          e.preventDefault();
          openShortcuts();
          return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (goTimer.current !== null) window.clearTimeout(goTimer.current);
      goTimer.current = null;
    };
  }, [navigate]);

  return (
    <AnimatePresence>
      {goPending && (
        <div
          key="go-hint"
          className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-[70] flex justify-center px-4 md:bottom-8"
        >
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 520, damping: 34 }}
            className="glass flex max-w-full flex-wrap items-center justify-center gap-x-3.5 gap-y-2 rounded-2xl px-4 py-2.5 text-xs text-fg-2 shadow-pop"
          >
            <span className="font-display text-sm font-semibold text-fg">Go to…</span>
            {NAV_ITEMS.map((item) => (
              <span key={item.key} className="flex items-center gap-1.5">
                <Kbd>{item.goKey.toUpperCase()}</Kbd>
                {item.label}
              </span>
            ))}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
