import { cloneElement, isValidElement, useCallback, useRef, useState, type ReactElement, type ReactNode } from 'react';
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
  useMergeRefs,
  useRole,
} from '@floating-ui/react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from './cn';
import { enterOffsetFor, floatingPanelClass, originFor, triggerPropsOf, Z, type Placement } from './floating';
import { useLayer } from './layers';
import { useReducedMotionPref } from './motion';

export interface PopoverProps {
  /** Must accept ref and onClick. */
  trigger: ReactElement;
  children: ReactNode | ((close: () => void) => ReactNode);
  placement?: Placement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  padding?: 'none' | 'sm' | 'md';
  'aria-label'?: string;
}

const paddings = { none: '', sm: 'p-2', md: 'p-3' } as const;

export function Popover({
  trigger,
  children,
  placement = 'bottom-start',
  open: openProp,
  onOpenChange,
  className,
  padding = 'md',
  'aria-label': ariaLabel,
}: PopoverProps) {
  const reduced = useReducedMotionPref();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : uncontrolledOpen;
  const panelRef = useRef<HTMLDivElement>(null);

  const setOpen = useCallback(
    (next: boolean) => {
      if (!controlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );
  const close = useCallback(() => setOpen(false), [setOpen]);
  const layer = useLayer(open, close);

  const { refs, floatingStyles, context, placement: finalPlacement } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({ padding: 12, fallbackAxisSideDirection: 'end' }),
      shift({ padding: 12 }),
      sizeMiddleware({
        padding: 12,
        apply({ availableHeight, availableWidth, elements }) {
          elements.floating.style.setProperty('--popover-max-h', `${Math.max(160, availableHeight)}px`);
          elements.floating.style.setProperty('--popover-max-w', `${Math.max(200, availableWidth)}px`);
        },
      }),
    ],
  });

  const click = useClick(context);
  const dismiss = useDismiss(context, { escapeKey: false, outsidePress: () => layer.isTop() });
  const role = useRole(context, { role: 'dialog' });
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role]);

  const childProps = isValidElement(trigger) ? triggerPropsOf(trigger) : {};
  const triggerRef = useMergeRefs([refs.setReference, childProps.ref]);
  const from = enterOffsetFor(finalPlacement, 6);

  return (
    <>
      {isValidElement(trigger) && cloneElement(trigger, getReferenceProps({ ...childProps, ref: triggerRef }))}
      <AnimatePresence>
        {open && (
          <FloatingPortal>
            <FloatingFocusManager context={context} modal={false} initialFocus={panelRef}>
              <div
                ref={refs.setFloating}
                style={floatingStyles}
                className={cn('outline-none', Z.popover)}
                aria-label={ariaLabel}
                {...getFloatingProps()}
              >
                <motion.div
                  ref={panelRef}
                  tabIndex={-1}
                  initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, ...from }}
                  animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                  exit={{ opacity: 0, scale: reduced ? 1 : 0.97, transition: { duration: 0.12 } }}
                  transition={reduced ? { duration: 0.12 } : { type: 'spring', stiffness: 520, damping: 34, mass: 0.7 }}
                  style={{ transformOrigin: originFor(finalPlacement) }}
                  className={cn(
                    floatingPanelClass,
                    'max-h-[var(--popover-max-h)] max-w-[min(var(--popover-max-w),calc(100vw-24px))] overflow-y-auto overscroll-contain focus-visible:outline-none',
                    paddings[padding],
                    className,
                  )}
                >
                  {typeof children === 'function' ? children(close) : children}
                </motion.div>
              </div>
            </FloatingFocusManager>
          </FloatingPortal>
        )}
      </AnimatePresence>
    </>
  );
}
