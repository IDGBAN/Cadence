import { Suspense, useEffect, useLayoutEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { MobileTopBar } from './MobileTopBar';
import { PageSkeleton } from './PageSkeleton';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { Sidebar } from './Sidebar';
import { navKeyForPath } from './nav';
import { APP_NAME, useRouteMeta } from './routeMeta';

function RouteEffects() {
  const { pathname } = useLocation();
  const { title } = useRouteMeta();
  const previousPath = useRef(pathname);

  useLayoutEffect(() => {
    const previous = previousPath.current;
    previousPath.current = pathname;
    if (previous === pathname) return;
    // stepping between days on Today shouldn't jump to the top
    if (navKeyForPath(previous) === 'today' && navKeyForPath(pathname) === 'today') return;
    window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`;
  }, [title]);

  return null;
}

function SkipLink() {
  return (
    <button
      type="button"
      onClick={() => document.getElementById('main')?.focus()}
      className="fixed top-3 left-3 z-[110] -translate-y-24 rounded-xl border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium text-fg shadow-pop transition-transform focus:translate-y-[env(safe-area-inset-top)]"
    >
      Skip to content
    </button>
  );
}

export function AppLayout() {
  const { pathname } = useLocation();

  return (
    <div className="relative min-h-dvh">
      <SkipLink />
      <div aria-hidden="true" className="grain fixed inset-0 z-0" />
      <Sidebar />
      <MobileTopBar />
      <main id="main" tabIndex={-1} className="relative min-h-dvh focus:outline-none md:pl-[76px] lg:pl-[248px]">
        <RouteErrorBoundary resetKey={pathname}>
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </RouteErrorBoundary>
      </main>
      <BottomNav />
      <RouteEffects />
    </div>
  );
}
