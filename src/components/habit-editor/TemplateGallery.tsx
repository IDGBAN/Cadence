import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, PenLine, Search, Sparkles } from 'lucide-react';
import type { Category } from '@/types';
import { ALL_TEMPLATES, DEFAULT_CATEGORIES, type HabitTemplate } from '@/lib/defaults';
import { habitStyle } from '@/lib/colors';
import { typeLabel } from '@/lib/format';
import { useCategories, useReducedMotion } from '@/store/hooks';
import { Badge, Chip, cn, EmptyState, HabitIcon, Input } from '@/components/ui';

const ALL = '__all__';

function categoryName(categories: Category[], id: string): string {
  return (
    categories.find((c) => c.id === id)?.name ??
    DEFAULT_CATEGORIES.find((c) => c.id === id)?.name ??
    'Other'
  );
}

function categoryIcon(categories: Category[], id: string): string {
  return (
    categories.find((c) => c.id === id)?.icon ??
    DEFAULT_CATEGORIES.find((c) => c.id === id)?.icon ??
    '📁'
  );
}

function matches(t: HabitTemplate, query: string, categoryLabel: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return [t.name, t.blurb, t.description, categoryLabel, typeLabel(t.type)]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function TemplateCard({
  template,
  added,
  compact = false,
  onPick,
}: {
  template: HabitTemplate;
  added: boolean;
  compact?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      style={habitStyle(template.color)}
      className={cn(
        'group relative flex items-start gap-3 rounded-2xl border border-line bg-surface-2 p-3 text-left',
        'transition-[border-color,background-color,transform,box-shadow] duration-200',
        'hover:-translate-y-0.5 hover:border-[color-mix(in_oklab,var(--habit)_45%,transparent)] hover:bg-surface-3 hover:shadow-pop',
        'focus-visible:outline-offset-2 active:translate-y-0',
        compact ? 'w-[15rem] shrink-0' : 'w-full',
      )}
    >
      <HabitIcon habit={template} size="md" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-fg">{template.name}</span>
          {added && (
            <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-success/14 px-1.5 py-[3px] text-[10px] font-semibold leading-none text-success">
              <Check className="size-2.5" strokeWidth={3} />
              Added
            </span>
          )}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-fg-3">{template.blurb}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1">
          <Badge tone="habit" size="xs">
            {typeLabel(template.type)}
          </Badge>
          {template.kind === 'metric' && (
            <Badge tone="neutral" size="xs">
              Track only
            </Badge>
          )}
          {template.period !== 'day' && (
            <Badge tone="neutral" size="xs">
              {template.period === 'week' ? 'Weekly' : 'Monthly'}
            </Badge>
          )}
        </span>
      </span>
    </button>
  );
}

export interface TemplateGalleryProps {
  // lowercased, includes archived habits
  existingNames: Set<string>;
  onPick: (template: HabitTemplate) => void;
  onScratch: () => void;
}

export function TemplateGallery({ existingNames, onPick, onScratch }: TemplateGalleryProps) {
  const categories = useCategories();
  const reduced = useReducedMotion();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string>(ALL);

  const isAdded = useCallback((t: HabitTemplate) => existingNames.has(t.name.trim().toLowerCase()), [existingNames]);

  const categoryChips = useMemo(() => {
    const ids: string[] = [];
    for (const t of ALL_TEMPLATES) if (!ids.includes(t.categoryId)) ids.push(t.categoryId);
    return ids.map((id) => ({ id, name: categoryName(categories, id), icon: categoryIcon(categories, id) }));
  }, [categories]);

  const visible = useMemo(
    () =>
      ALL_TEMPLATES.filter(
        (t) => (filter === ALL || t.categoryId === filter) && matches(t, query, categoryName(categories, t.categoryId)),
      ),
    [categories, filter, query],
  );

  const suggestions = useMemo(() => ALL_TEMPLATES.filter((t) => !isAdded(t)).slice(0, 8), [isAdded]);

  const searching = query.trim() !== '';
  const showSuggestions = !searching && filter === ALL && suggestions.length > 0;

  const grouped = useMemo(() => {
    const groups = new Map<string, HabitTemplate[]>();
    for (const t of visible) {
      const list = groups.get(t.categoryId);
      if (list) list.push(t);
      else groups.set(t.categoryId, [t]);
    }
    return [...groups.entries()];
  }, [visible]);

  return (
    <div className="flex flex-col gap-4">
      <Input
        data-autofocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search: water, gym, study…"
        leading={<Search />}
        aria-label="Search habit templates"
        autoComplete="off"
        spellCheck={false}
      />

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scroll-fade-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Chip size="sm" selected={filter === ALL} onClick={() => setFilter(ALL)}>
          All
        </Chip>
        {categoryChips.map((c) => (
          <Chip key={c.id} size="sm" selected={filter === c.id} icon={<span aria-hidden>{c.icon}</span>} onClick={() => setFilter(c.id)}>
            {c.name}
          </Chip>
        ))}
      </div>

      <button
        type="button"
        onClick={onScratch}
        className={cn(
          'flex w-full items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface-2/50 p-3 text-left',
          'transition-colors duration-200 hover:border-accent/60 hover:bg-accent/8 focus-visible:outline-offset-2',
        )}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-3 text-accent">
          <PenLine className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-fg">Start from scratch</span>
          <span className="block text-xs text-fg-3">Any type, any schedule.</span>
        </span>
      </button>

      {showSuggestions && (
        <section>
          <div className="eyebrow mb-2 flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-accent" aria-hidden />
            Suggested for you
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 scroll-fade-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {suggestions.map((t) => (
              <TemplateCard key={t.templateId} template={t} added={false} compact onPick={() => onPick(t)} />
            ))}
          </div>
        </section>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="No templates match"
          description={`Nothing for "${query.trim()}". Try starting from scratch.`}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <AnimatePresence initial={false} mode="popLayout">
            {grouped.map(([categoryId, templates]) => (
              <motion.section
                key={categoryId}
                layout={reduced ? false : 'position'}
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="eyebrow mb-2 flex items-center gap-1.5">
                  <span aria-hidden>{categoryIcon(categories, categoryId)}</span>
                  {categoryName(categories, categoryId)}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {templates.map((t) => (
                    <TemplateCard key={t.templateId} template={t} added={isAdded(t)} onPick={() => onPick(t)} />
                  ))}
                </div>
              </motion.section>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
