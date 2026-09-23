import { matchPath } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { CalendarDays, ChartLine, House, ListChecks, Settings, Trophy } from 'lucide-react';

export type NavKey = 'today' | 'history' | 'habits' | 'insights' | 'rewards' | 'settings';

export interface NavItem {
  key: NavKey;
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  goKey: string;
  inTabBar: boolean;
  keywords: string[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    key: 'today',
    to: '/',
    label: 'Today',
    description: "Check off today's habits",
    icon: House,
    goKey: 't',
    inTabBar: true,
    keywords: ['home', 'log', 'check in', 'dashboard'],
  },
  {
    key: 'history',
    to: '/history',
    label: 'History',
    description: 'Past days and older logs',
    icon: CalendarDays,
    goKey: 'h',
    inTabBar: true,
    keywords: ['calendar', 'past', 'edit logs', 'grid', 'journal'],
  },
  {
    key: 'habits',
    to: '/habits',
    label: 'Habits',
    description: 'Edit, reorder and archive habits',
    icon: ListChecks,
    goKey: 'b',
    inTabBar: true,
    keywords: ['manage', 'edit', 'archive', 'reorder', 'categories', 'list'],
  },
  {
    key: 'insights',
    to: '/insights',
    label: 'Insights',
    description: 'Stats, trends and correlations',
    icon: ChartLine,
    goKey: 'i',
    inTabBar: true,
    keywords: ['stats', 'statistics', 'charts', 'correlations', 'trends', 'analytics'],
  },
  {
    key: 'rewards',
    to: '/rewards',
    label: 'Rewards',
    description: 'Level, XP and achievements',
    icon: Trophy,
    goKey: 'r',
    inTabBar: true,
    keywords: ['xp', 'level', 'achievements', 'badges', 'trophies'],
  },
  {
    key: 'settings',
    to: '/settings',
    label: 'Settings',
    description: 'Theme, preferences and backups',
    icon: Settings,
    goKey: 's',
    inTabBar: false,
    keywords: ['preferences', 'theme', 'appearance', 'backup', 'export', 'import', 'data'],
  },
];

export const NAV_BY_KEY = Object.fromEntries(NAV_ITEMS.map((item) => [item.key, item])) as Record<NavKey, NavItem>;

const NAV_PATTERNS: ReadonlyArray<readonly [string, NavKey]> = [
  ['/', 'today'],
  ['/day/:day', 'today'],
  ['/history', 'history'],
  ['/habits', 'habits'],
  ['/habits/:id', 'habits'],
  ['/insights', 'insights'],
  ['/rewards', 'rewards'],
  ['/settings', 'settings'],
];

export function navKeyForPath(pathname: string): NavKey | null {
  for (const [pattern, key] of NAV_PATTERNS) {
    if (matchPath({ path: pattern, end: true }, pathname)) return key;
  }
  return null;
}
