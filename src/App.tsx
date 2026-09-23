import { lazy, useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { ConfirmHost, Toaster } from '@/components/ui';
import { AppLayout } from '@/components/layout/AppLayout';
import { CommandPalette } from '@/components/layout/CommandPalette';
import { GlobalShortcuts } from '@/components/layout/GlobalShortcuts';
import { HydrationGate } from '@/components/layout/HydrationGate';
import { ShortcutsModal } from '@/components/layout/ShortcutsModal';
import { MotionRoot, ThemeSync } from '@/components/layout/ThemeSync';
import { LogEditorHost } from '@/components/log/LogEditorHost';
import { HabitEditorHost } from '@/components/habit-editor/HabitEditorHost';
import { CelebrationHost } from '@/components/rewards/CelebrationHost';
import { OnboardingHost } from '@/components/onboarding/OnboardingHost';
import TodayPage from '@/pages/TodayPage';
import HabitsPage from '@/pages/HabitsPage';
import NotFoundPage from '@/pages/NotFoundPage';

// secondary pages are lazy loaded, then preloaded once the browser is idle
const loadHabitDetailPage = () => import('@/pages/HabitDetailPage');
const loadHistoryPage = () => import('@/pages/HistoryPage');
const loadInsightsPage = () => import('@/pages/InsightsPage');
const loadRewardsPage = () => import('@/pages/RewardsPage');
const loadSettingsPage = () => import('@/pages/SettingsPage');

const HabitDetailPage = lazy(loadHabitDetailPage);
const HistoryPage = lazy(loadHistoryPage);
const InsightsPage = lazy(loadInsightsPage);
const RewardsPage = lazy(loadRewardsPage);
const SettingsPage = lazy(loadSettingsPage);

const PRELOADERS = [loadHistoryPage, loadInsightsPage, loadHabitDetailPage, loadRewardsPage, loadSettingsPage];

function usePreloadPages() {
  useEffect(() => {
    const preload = () => {
      for (const load of PRELOADERS) load().catch(() => undefined);
    };
    // Safari has no requestIdleCallback
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(preload, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(preload, 2000);
    return () => clearTimeout(id);
  }, []);
}

function AppRoutes() {
  usePreloadPages();
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<TodayPage />} />
        <Route path="day/:day" element={<TodayPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="habits" element={<HabitsPage />} />
        <Route path="habits/:id" element={<HabitDetailPage />} />
        <Route path="insights" element={<InsightsPage />} />
        <Route path="rewards" element={<RewardsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

function GlobalHosts() {
  return (
    <>
      <Toaster />
      <ConfirmHost />
      <LogEditorHost />
      <HabitEditorHost />
      <CelebrationHost />
      <OnboardingHost />
      <CommandPalette />
      <ShortcutsModal />
      <GlobalShortcuts />
    </>
  );
}

export default function App() {
  return (
    <HashRouter>
      <ThemeSync />
      <MotionRoot>
        <HydrationGate>
          <AppRoutes />
          <GlobalHosts />
        </HydrationGate>
      </MotionRoot>
    </HashRouter>
  );
}
