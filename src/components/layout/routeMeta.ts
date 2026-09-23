import { matchPath, useLocation } from 'react-router-dom';
import { useHabit, useToday } from '@/store/hooks';
import { relativeDayLabel } from '@/lib/dates';
import { NAV_BY_KEY, navKeyForPath, type NavKey } from './nav';

export interface RouteMeta {
  nav: NavKey | null;
  title: string;
}

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const APP_NAME = 'Cadence';

export function useRouteMeta(): RouteMeta {
  const { pathname } = useLocation();
  const today = useToday();
  const habitId = matchPath({ path: '/habits/:id', end: true }, pathname)?.params.id;
  const habit = useHabit(habitId);
  const day = matchPath({ path: '/day/:day', end: true }, pathname)?.params.day;
  const nav = navKeyForPath(pathname);

  let title: string;
  if (habitId) title = habit ? habit.name : 'Habit not found';
  else if (day) title = DAY_KEY_RE.test(day) ? relativeDayLabel(day, today) : NAV_BY_KEY.today.label;
  else if (nav) title = NAV_BY_KEY[nav].label;
  else title = 'Not found';

  return { nav, title };
}
