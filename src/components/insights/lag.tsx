import type { ReactNode } from 'react';
import { CalendarDays, Sunrise } from 'lucide-react';
import type { Lag } from './insightsData';

export const LAG_OPTIONS: Array<{ value: Lag; label: string; icon: ReactNode; title: string }> = [
  { value: 0, label: 'Same day', icon: <CalendarDays />, title: 'Compare both habits on the same day' },
  { value: 1, label: 'Next day', icon: <Sunrise />, title: 'Compare one habit today with the other tomorrow' },
];

export function lagHint(lag: Lag): string {
  return lag === 1
    ? 'Each habit is compared with the next day, like “sleep tonight, focus tomorrow”. Direction matters here, so the grid isn’t symmetric.'
    : 'Both habits are compared on the same day, so the grid is symmetric.';
}
