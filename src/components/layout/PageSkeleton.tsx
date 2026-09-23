import { motion } from 'motion/react';
import { Skeleton } from '@/components/ui';
import { Page } from './PageHeader';

export function PageSkeleton() {
  return (
    <Page>
      <motion.div
        aria-busy="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        // delayed so fast chunk loads don't flash a skeleton
        transition={{ delay: 0.18, duration: 0.3 }}
      >
        <span role="status" className="sr-only">
          Loading…
        </span>
        <div className="mb-8">
          <Skeleton className="h-3 w-24 rounded-full" />
          <Skeleton className="mt-3 h-9 w-56 max-w-full rounded-xl" />
          <Skeleton className="mt-3 h-4 w-80 max-w-full rounded-lg" />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="mt-4 h-64 rounded-2xl md:mt-5" />
        <div className="mt-4 grid gap-3 md:mt-5 md:grid-cols-2 md:gap-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </motion.div>
    </Page>
  );
}
