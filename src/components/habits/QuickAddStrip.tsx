import { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { LayoutGrid, Plus, Sparkles } from 'lucide-react';
import { ALL_TEMPLATES, type HabitTemplate } from '@/lib/defaults';
import { habitStyle } from '@/lib/colors';
import { typeLabel } from '@/lib/format';
import { useReducedMotion } from '@/store/hooks';
import { useUI } from '@/store/ui';
import { Button, cn, HabitIcon } from '@/components/ui';
import { createFromTemplate } from './habitActions';

const SUGGESTION_COUNT = 8;

export interface QuickAddStripProps {
  existingNames: Set<string>;
}

export function QuickAddStrip({ existingNames }: QuickAddStripProps) {
  const reduced = useReducedMotion();
  const openHabitEditor = useUI((s) => s.openHabitEditor);

  const suggestions = useMemo(
    () => ALL_TEMPLATES.filter((t) => !existingNames.has(t.name.trim().toLowerCase())).slice(0, SUGGESTION_COUNT),
    [existingNames],
  );

  const add = (template: HabitTemplate, event: { currentTarget: Element }) => {
    createFromTemplate(template, event.currentTarget);
  };

  return (
    <section className="rounded-3xl border border-line bg-surface-2/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow mb-1.5 flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-accent" aria-hidden />
            Add more habits
          </div>
          <p className="text-sm text-fg-3">
            {suggestions.length > 0
              ? 'Tap one to add it to Today. You can tweak it later.'
              : "You've added all the suggestions. Try making your own."}
          </p>
        </div>
        <Button variant="secondary" size="sm" icon={<LayoutGrid />} onClick={() => openHabitEditor(null)}>
          Browse all templates
        </Button>
      </div>

      {suggestions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <AnimatePresence initial={false} mode="popLayout">
            {suggestions.map((template) => (
              <motion.button
                key={template.templateId}
                type="button"
                layout={reduced ? false : 'position'}
                initial={reduced ? false : { opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{ type: 'spring', stiffness: 460, damping: 34, mass: 0.6 }}
                whileTap={reduced ? undefined : { scale: 0.96 }}
                onClick={(event) => add(template, event)}
                title={`${template.blurb} · ${typeLabel(template.type)}`}
                style={habitStyle(template.color)}
                className={cn(
                  'flex h-10 items-center gap-2 rounded-full border border-line bg-surface pl-1.5 pr-3 text-left',
                  'transition-[border-color,background-color,box-shadow] duration-150',
                  'hover:border-[color-mix(in_oklab,var(--habit)_50%,transparent)] hover:bg-surface-3 hover:shadow-pop',
                  'focus-visible:outline-offset-2',
                )}
              >
                <HabitIcon habit={template} size="sm" />
                <span className="truncate text-[13px] font-semibold text-fg">{template.name}</span>
                <Plus className="size-3.5 shrink-0 text-fg-4" aria-hidden />
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}
