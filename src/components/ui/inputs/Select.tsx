import { useId, useRef, useState, type ReactNode } from 'react';
import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  offset,
  shift,
  size as sizeMiddleware,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
  useTypeahead,
} from '@floating-ui/react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../cn';
import { floatingPanelClass, originFor, Z } from '../floating';
import { useLayer } from '../layers';
import { useReducedMotionPref } from '../motion';
import { controlBase, FieldLabel, hasContent } from './Field';

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  icon?: ReactNode;
  description?: string;
}

export interface SelectProps<T extends string | number> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  label?: ReactNode;
  className?: string;
  size?: 'sm' | 'md';
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
}

export function Select<T extends string | number>({
  value,
  onChange,
  options,
  label,
  className,
  size = 'md',
  placeholder = 'Select…',
  disabled = false,
  id,
  'aria-label': ariaLabel,
}: SelectProps<T>) {
  const autoId = useId();
  const triggerId = id ?? autoId;
  const labelId = `${triggerId}-label`;
  const reduced = useReducedMotionPref();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const layer = useLayer(open, () => setOpen(false));
  const listRef = useRef<Array<HTMLElement | null>>([]);
  const labelsRef = useRef<Array<string | null>>([]);
  const typingRef = useRef(false);

  const { refs, floatingStyles, context, placement } = useFloating({
    open,
    onOpenChange: (next) => {
      if (!disabled || !next) setOpen(next);
    },
    placement: 'bottom-start',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(6),
      flip({ padding: 12 }),
      sizeMiddleware({
        padding: 12,
        apply({ rects, availableHeight, elements }) {
          elements.floating.style.minWidth = `${rects.reference.width}px`;
          elements.floating.style.maxHeight = `${Math.max(140, Math.min(availableHeight, 340))}px`;
        },
      }),
      shift({ padding: 12 }),
    ],
  });

  const click = useClick(context, { enabled: !disabled });
  const dismiss = useDismiss(context, { escapeKey: false, outsidePress: () => layer.isTop() });
  const role = useRole(context, { role: 'listbox' });
  const listNav = useListNavigation(context, {
    listRef,
    activeIndex,
    selectedIndex: selectedIndex >= 0 ? selectedIndex : null,
    onNavigate: setActiveIndex,
    loop: true,
    enabled: !disabled,
  });
  const typeahead = useTypeahead(context, {
    listRef: labelsRef,
    activeIndex,
    selectedIndex: selectedIndex >= 0 ? selectedIndex : null,
    onMatch: (index) => (open ? setActiveIndex(index) : onChange(options[index].value)),
    onTypingChange: (typing) => {
      typingRef.current = typing;
    },
    enabled: !disabled,
  });
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([click, dismiss, role, listNav, typeahead]);

  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
  };

  return (
    <div className={cn('w-full', className)}>
      {hasContent(label) && (
        <FieldLabel id={labelId} htmlFor={triggerId}>
          {label}
        </FieldLabel>
      )}
      <button
        ref={refs.setReference}
        id={triggerId}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-labelledby={hasContent(label) && !ariaLabel ? `${labelId} ${triggerId}` : undefined}
        {...getReferenceProps()}
        className={cn(
          controlBase,
          'cursor-pointer justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50',
          size === 'sm' ? 'h-8 rounded-[10px] pl-2.5 pr-2 text-[13px]' : 'h-10 rounded-xl pl-3 pr-2.5 text-sm',
          open && 'border-[color-mix(in_oklab,var(--accent)_65%,var(--line-strong))] ring-4 ring-accent/15',
          'focus-visible:border-[color-mix(in_oklab,var(--accent)_65%,var(--line-strong))] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/20',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.icon !== undefined && (
            <span className="flex shrink-0 items-center text-base leading-none text-fg-2 [&_svg]:size-4">{selected.icon}</span>
          )}
          <span className={cn('truncate font-medium', selected ? 'text-fg' : 'text-fg-4')}>
            {selected ? selected.label : placeholder}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={cn('size-4 shrink-0 text-fg-3 transition-transform duration-200', open && 'rotate-180 text-fg-2')}
        />
      </button>

      <AnimatePresence>
        {open && (
          <FloatingPortal>
            <FloatingFocusManager context={context} modal={false}>
              <div
                ref={refs.setFloating}
                style={floatingStyles}
                className={cn('flex flex-col outline-none', Z.popover)}
                {...getFloatingProps()}
              >
                <motion.div
                  initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: placement.startsWith('top') ? 4 : -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: reduced ? 1 : 0.98, transition: { duration: 0.1 } }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  style={{ transformOrigin: originFor(placement) }}
                  className={cn(floatingPanelClass, 'min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5')}
                >
                  {options.map((option, index) => {
                    const isSelected = index === selectedIndex;
                    const isActive = index === activeIndex;
                    return (
                      <div
                        key={String(option.value)}
                        ref={(node) => {
                          listRef.current[index] = node;
                          labelsRef.current[index] = option.label;
                        }}
                        role="option"
                        aria-selected={isSelected}
                        tabIndex={isActive ? 0 : -1}
                        data-active={isActive || undefined}
                        {...getItemProps({
                          onClick: () => choose(index),
                          onKeyDown: (e) => {
                            if (e.key === 'Enter' || (e.key === ' ' && !typingRef.current)) {
                              e.preventDefault();
                              choose(index);
                            }
                          },
                        })}
                        className={cn(
                          'flex cursor-pointer select-none items-center gap-2.5 rounded-[10px] px-2.5 outline-none transition-colors duration-100',
                          option.description ? 'py-2' : size === 'sm' ? 'h-9 pointer-fine:h-8' : 'h-10 pointer-fine:h-9',
                          isActive ? 'bg-surface-3 text-fg light:bg-surface-2' : 'text-fg-2',
                        )}
                      >
                        {option.icon !== undefined && (
                          <span className="flex w-5 shrink-0 items-center justify-center text-base leading-none [&_svg]:size-4">
                            {option.icon}
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className={cn('block truncate text-sm', isSelected ? 'font-semibold text-fg' : 'font-medium')}>
                            {option.label}
                          </span>
                          {option.description && (
                            <span className="mt-0.5 block text-xs leading-snug text-fg-3">{option.description}</span>
                          )}
                        </span>
                        <Check
                          aria-hidden
                          strokeWidth={2.5}
                          className={cn('size-4 shrink-0 text-accent transition-opacity', isSelected ? 'opacity-100' : 'opacity-0')}
                        />
                      </div>
                    );
                  })}
                </motion.div>
              </div>
            </FloatingFocusManager>
          </FloatingPortal>
        )}
      </AnimatePresence>
    </div>
  );
}
