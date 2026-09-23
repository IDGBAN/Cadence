import type { ReactNode } from 'react';
import { LayoutGrid } from 'lucide-react';
import type { Settings } from '@/types';
import { IconButton, Segmented, Switch, cn } from '@/components/ui';

export type TodayFilter = 'all' | 'todo' | 'done';

export interface TodayFiltersProps {
  filter: TodayFilter;
  onFilterChange: (filter: TodayFilter) => void;
  counts: Record<TodayFilter, number>;
  groupBy: Settings['todayGroupBy'];
  onGroupByChange: (groupBy: Settings['todayGroupBy']) => void;
  hideCompleted: boolean;
  onHideCompletedChange: (hide: boolean) => void;
  className?: string;
}

function labelWithCount(label: string, count: number): ReactNode {
  return (
    <span className="flex items-center gap-1.5">
      {label}
      <span className="tabular text-[11px] font-semibold opacity-60">{count}</span>
    </span>
  );
}

export function TodayFilters({
  filter,
  onFilterChange,
  counts,
  groupBy,
  onGroupByChange,
  hideCompleted,
  onHideCompletedChange,
  className,
}: TodayFiltersProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-3', className)}>
      <Segmented<TodayFilter>
        value={filter}
        onChange={onFilterChange}
        size="sm"
        aria-label="Filter habits"
        layoutId="today-filter"
        options={[
          { value: 'all', label: labelWithCount('All', counts.all) },
          { value: 'todo', label: labelWithCount('To do', counts.todo) },
          { value: 'done', label: labelWithCount('Done', counts.done) },
        ]}
      />

      <div className="flex items-center gap-3">
        <IconButton
          label={groupBy === 'category' ? 'Stop grouping by category' : 'Group by category'}
          size="sm"
          variant="secondary"
          active={groupBy === 'category'}
          onClick={() => onGroupByChange(groupBy === 'category' ? 'none' : 'category')}
        >
          <LayoutGrid />
        </IconButton>
        <Switch checked={hideCompleted} onChange={onHideCompletedChange} size="sm" label="Hide done" />
      </div>
    </div>
  );
}
