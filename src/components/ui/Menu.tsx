import { cloneElement, Fragment, isValidElement, useRef, useState, type ReactElement, type ReactNode } from 'react';
import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useMergeRefs,
  useRole,
  useTypeahead,
} from '@floating-ui/react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from './cn';
import { enterOffsetFor, floatingPanelClass, originFor, triggerPropsOf, Z, type Placement } from './floating';
import { Kbd } from './Chip';
import { useLayer } from './layers';
import { useReducedMotionPref } from './motion';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Divider above this item. */
  separator?: boolean;
  shortcut?: string;
}

export interface MenuProps {
  trigger: ReactElement;
  items: MenuItem[];
  placement?: Placement;
  'aria-label'?: string;
}

export function Menu({ trigger, items, placement = 'bottom-end', 'aria-label': ariaLabel }: MenuProps) {
  const reduced = useReducedMotionPref();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const layer = useLayer(open, () => setOpen(false));
  const listRef = useRef<Array<HTMLElement | null>>([]);
  const labelsRef = useRef<Array<string | null>>([]);

  const { refs, floatingStyles, context, placement: finalPlacement } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip({ padding: 12 }), shift({ padding: 12 })],
  });

  const click = useClick(context);
  const dismiss = useDismiss(context, { escapeKey: false, outsidePress: () => layer.isTop() });
  const role = useRole(context, { role: 'menu' });
  const listNav = useListNavigation(context, {
    listRef,
    activeIndex,
    onNavigate: setActiveIndex,
    loop: true,
    disabledIndices: items.flatMap((item, i) => (item.disabled ? [i] : [])),
  });
  const typeahead = useTypeahead(context, {
    listRef: labelsRef,
    activeIndex,
    onMatch: open ? setActiveIndex : undefined,
  });
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([click, dismiss, role, listNav, typeahead]);

  const childProps = isValidElement(trigger) ? triggerPropsOf(trigger) : {};
  const triggerRef = useMergeRefs([refs.setReference, childProps.ref]);
  const from = enterOffsetFor(finalPlacement, 6);

  const select = (item: MenuItem) => {
    if (item.disabled) return;
    // focus the trigger first so a dialog opened from onSelect returns focus to it
    const reference = refs.domReference.current;
    if (reference instanceof HTMLElement) reference.focus({ preventScroll: true });
    setOpen(false);
    item.onSelect?.();
  };

  return (
    <>
      {isValidElement(trigger) && cloneElement(trigger, getReferenceProps({ ...childProps, ref: triggerRef }))}
      <AnimatePresence>
        {open && (
          <FloatingPortal>
            <FloatingFocusManager context={context} modal={false} initialFocus={-1}>
              <div
                ref={refs.setFloating}
                style={floatingStyles}
                aria-label={ariaLabel}
                className={cn('outline-none', Z.popover)}
                {...getFloatingProps()}
              >
                <motion.div
                  initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, ...from }}
                  animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                  exit={{ opacity: 0, scale: reduced ? 1 : 0.97, transition: { duration: 0.1 } }}
                  transition={reduced ? { duration: 0.1 } : { type: 'spring', stiffness: 560, damping: 34, mass: 0.6 }}
                  style={{ transformOrigin: originFor(finalPlacement) }}
                  className={cn(floatingPanelClass, 'min-w-[13rem] max-w-[calc(100vw-24px)] p-1.5')}
                >
                  {items.map((item, index) => {
                    const active = index === activeIndex;
                    return (
                      <Fragment key={`${item.label}-${index}`}>
                        {item.separator && index > 0 && <div role="separator" className="-mx-1.5 my-1.5 h-px bg-line" />}
                        <button
                          ref={(node) => {
                            listRef.current[index] = node;
                            labelsRef.current[index] = item.label;
                          }}
                          type="button"
                          role="menuitem"
                          tabIndex={active ? 0 : -1}
                          disabled={item.disabled}
                          aria-disabled={item.disabled || undefined}
                          data-active={active || undefined}
                          {...getItemProps({ onClick: () => select(item) })}
                          className={cn(
                            'group flex h-10 w-full select-none items-center gap-2.5 rounded-[10px] px-2.5 text-left text-sm font-medium outline-none pointer-fine:h-9',
                            'transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-40',
                            item.danger
                              ? 'text-danger data-[active]:bg-danger/12'
                              : 'text-fg-2 data-[active]:bg-surface-3 data-[active]:text-fg light:data-[active]:bg-surface-2',
                          )}
                        >
                          {item.icon !== undefined && item.icon !== null && (
                            <span
                              aria-hidden
                              className={cn(
                                'flex w-4 shrink-0 items-center justify-center leading-none [&_svg]:size-4',
                                item.danger ? 'text-danger' : 'text-fg-3 group-data-[active]:text-fg',
                              )}
                            >
                              {item.icon}
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {item.shortcut && <Kbd className="ml-3">{item.shortcut}</Kbd>}
                        </button>
                      </Fragment>
                    );
                  })}
                </motion.div>
              </div>
            </FloatingFocusManager>
          </FloatingPortal>
        )}
      </AnimatePresence>
    </>
  );
}
