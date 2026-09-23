import { Shapes } from 'lucide-react';
import { Card, ProgressBar, SectionHeader } from '@/components/ui';
import { formatNumber, formatPercent, pluralize } from '@/lib/format';
import type { CategoryRow } from './useInsightsData';

function barColor(index: number, total: number): string {
  if (total <= 1) return 'var(--accent)';
  const t = index / (total - 1);
  return `color-mix(in oklab, var(--accent-2) ${Math.round(t * 100)}%, var(--accent))`;
}

export interface CategoryBreakdownProps {
  categories: CategoryRow[];
}

export function CategoryBreakdown({ categories }: CategoryBreakdownProps) {
  if (categories.length === 0) return null;
  const scorable = categories.filter((category) => category.rate !== null);

  return (
    <section aria-labelledby="insights-categories" className="flex flex-col gap-4">
      <SectionHeader
        as="h2"
        icon={<Shapes />}
        eyebrow="Categories"
        title={<span id="insights-categories">Completion by category</span>}
        subtitle={
          scorable.length > 0
            ? `${formatNumber(scorable.length, 0)} of ${formatNumber(categories.length, 0)} ${categories.length === 1 ? 'category' : 'categories'} have goals`
            : 'Put habits in categories to compare them'
        }
      />

      <Card padding="md">
        <ul className="flex flex-col gap-4">
          {categories.map((category, index) => (
            <li key={category.id} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className="text-base leading-none">
                    {category.icon}
                  </span>
                  <span className="truncate text-sm font-medium text-fg">{category.name}</span>
                  <span className="shrink-0 text-[11px] text-fg-4">
                    {pluralize(category.habits.length, 'habit')}
                    {category.metricCount > 0 && ` · ${formatNumber(category.metricCount, 0)} metric`}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular text-fg-2">
                  {category.rate === null ? <span className="text-fg-4">—</span> : formatPercent(category.rate)}
                </span>
              </div>
              {category.rate === null ? (
                <p className="text-[11px] text-fg-4">
                  {category.metricCount === category.habits.length
                    ? 'Only metrics, nothing to complete.'
                    : 'Nothing was due in this range.'}
                </p>
              ) : (
                <>
                  <ProgressBar
                    value={category.rate}
                    color={barColor(index, categories.length)}
                    height={9}
                    aria-label={`${category.name} completion`}
                  />
                  <p className="text-[11px] tabular text-fg-4">
                    {formatNumber(category.successes, 0)} of {formatNumber(category.opportunities, 0)} done
                  </p>
                </>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
