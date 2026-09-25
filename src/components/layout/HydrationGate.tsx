import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { StorageIssue } from '@/store/persistence';
import { useStore } from '@/store/store';
import { BrandMark, BrandWordmark } from './BrandMark';

const SLOW_MS = 2500;
const STUCK_MS = 9000;

function SplashScreen() {
  const [stage, setStage] = useState<'loading' | 'slow' | 'stuck'>('loading');

  useEffect(() => {
    const slow = window.setTimeout(() => setStage('slow'), SLOW_MS);
    const stuck = window.setTimeout(() => setStage('stuck'), STUCK_MS);
    return () => {
      window.clearTimeout(slow);
      window.clearTimeout(stuck);
    };
  }, []);

  return (
    <motion.div
      role="status"
      aria-live="polite"
      aria-label="Loading Cadence"
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-bg px-6 text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { delay: 0.15, duration: 0.3 } }}
      exit={{ opacity: 0, transition: { duration: 0.28, ease: 'easeOut' } }}
    >
      <div className="relative isolate">
        <motion.div
          aria-hidden="true"
          className="absolute inset-0 -z-10 rounded-full bg-accent/30 blur-2xl"
          animate={{ opacity: [0.35, 0.8, 0.35], scale: [0.9, 1.15, 0.9] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />
        <BrandMark size={72} animated />
      </div>
      <BrandWordmark className="mt-5 text-3xl" />
      <AnimatePresence mode="wait">
        {stage === 'slow' && (
          <motion.p
            key="slow"
            className="mt-3 text-sm text-fg-3"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            Loading your data…
          </motion.p>
        )}
        {stage === 'stuck' && (
          <motion.div
            key="stuck"
            className="mt-4 flex max-w-sm flex-col items-center gap-4"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <p className="text-sm leading-relaxed text-fg-3">
              This is taking longer than usual. Your browser might be blocking local storage (private windows
              often do).
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-10 rounded-xl border border-line-strong bg-surface-2 px-4 text-sm font-medium text-fg transition-colors hover:bg-surface-3"
            >
              Reload
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// writes are blocked at this point, so the data on disk is still recoverable.
// don't offer a "start fresh" option here, saving anything would overwrite it.
function StorageErrorScreen({ issue }: { issue: StorageIssue }) {
  const corrupt = issue.kind === 'corrupt';
  return (
    <motion.div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="storage-error-title"
      aria-describedby="storage-error-body"
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-bg px-6 text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.3 } }}
    >
      <div className="flex size-16 items-center justify-center rounded-2xl border border-danger/30 bg-danger/10 text-3xl">
        <span aria-hidden="true">{corrupt ? '🧩' : '🔒'}</span>
      </div>
      <h1 id="storage-error-title" className="mt-6 font-display text-2xl font-semibold tracking-tight text-fg">
        Cadence couldn’t open your data
      </h1>
      <div id="storage-error-body" className="mt-3 max-w-md space-y-3 text-sm leading-relaxed text-fg-3">
        <p>
          {corrupt
            ? 'There’s data saved in this browser, but Cadence can’t read it.'
            : 'Your habits are still on this device, but Cadence can’t read them right now.'}{' '}
          Reloading usually fixes it. Nothing was changed or deleted, and Cadence won’t save anything until it
          can read your data again.
        </p>
        <p className="text-fg-4">
          If this keeps happening, close any other Cadence tabs and check that you’re not in a private window.
        </p>
      </div>
      <button
        type="button"
        autoFocus
        onClick={() => window.location.reload()}
        className="accent-gradient mt-7 h-11 rounded-xl px-6 text-sm font-semibold text-accent-fg shadow-glow transition-transform active:scale-[0.97]"
      >
        Reload
      </button>
    </motion.div>
  );
}

export function HydrationGate({ children }: { children: ReactNode }) {
  const hydrated = useStore((s) => s.hydrated);
  const issue = useStore((s) => s.storageError);
  const blocked = !hydrated && issue?.writesBlocked === true;
  return (
    <>
      {hydrated && children}
      <AnimatePresence>
        {blocked ? (
          <StorageErrorScreen key="storage-error" issue={issue} />
        ) : (
          !hydrated && <SplashScreen key="splash" />
        )}
      </AnimatePresence>
    </>
  );
}
