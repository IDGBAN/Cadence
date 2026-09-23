import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Compass, House, Search } from 'lucide-react';
import { Button } from '@/components/ui';
import { Page } from '@/components/layout/PageHeader';
import { useUI } from '@/store/ui';

export default function NotFoundPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const setCommandPalette = useUI((s) => s.setCommandPalette);

  return (
    <Page width="narrow">
      <div className="flex min-h-[62dvh] flex-col items-center justify-center text-center">
        <div className="relative isolate mb-8">
          <div aria-hidden="true" className="absolute inset-0 -z-10 scale-[1.8] rounded-full bg-accent/20 blur-3xl" />
          <motion.div
            aria-hidden="true"
            animate={{ y: [0, -7, 0], rotate: [0, -6, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            className="flex size-24 items-center justify-center rounded-[28px] border border-line-strong bg-surface-2 shadow-pop"
          >
            <Compass className="size-11 text-accent" strokeWidth={1.75} />
          </motion.div>
        </div>

        <p aria-hidden="true" className="font-display text-7xl leading-none font-bold tracking-tighter tabular text-gradient">
          404
        </p>
        <h1 className="mt-4 text-2xl font-semibold text-fg md:text-3xl">Page not found</h1>
        <p className="mt-2 max-w-md text-pretty text-fg-3">
          The link might be broken, or the page moved. Your habits and streaks are fine.
        </p>
        <code className="mt-5 max-w-full truncate rounded-lg border border-line bg-surface px-2.5 py-1 text-xs text-fg-3">
          {pathname}
        </code>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button variant="primary" size="lg" icon={<House aria-hidden="true" />} onClick={() => navigate('/')}>
            Back to Today
          </Button>
          <Button
            variant="secondary"
            size="lg"
            icon={<Search aria-hidden="true" />}
            onClick={() => setCommandPalette(true)}
          >
            Search
          </Button>
        </div>
      </div>
    </Page>
  );
}
