import { cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from 'react';
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useMergeRefs,
  useRole,
} from '@floating-ui/react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from './cn';
import { enterOffsetFor, originFor, triggerPropsOf, Z } from './floating';
import { useReducedMotionPref } from './motion';

export interface TooltipProps {
  content: ReactNode;
  children: ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  disabled?: boolean;
  className?: string;
}

/** Shows on mouse hover or keyboard focus. The child has to accept a ref and DOM event props. */
export function Tooltip({ content, children, side = 'top', delay = 450, disabled, className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotionPref();
  const enabled = !disabled && content !== null && content !== undefined && content !== false && content !== '';
  const isOpen = enabled && open;

  const { refs, floatingStyles, context, placement } = useFloating({
    open: isOpen,
    onOpenChange: setOpen,
    placement: side,
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
  });

  const hover = useHover(context, { enabled, mouseOnly: true, move: false, delay: { open: delay, close: 40 } });
  const focus = useFocus(context, { enabled });
  const dismiss = useDismiss(context, { enabled, referencePress: true });
  const role = useRole(context, { role: 'tooltip', enabled });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);

  const childProps = isValidElement(children) ? triggerPropsOf(children) : {};
  const ref = useMergeRefs([refs.setReference, childProps.ref]);

  if (!isValidElement(children)) return children;
  const trigger = cloneElement(children, getReferenceProps({ ...childProps, ref }));
  const from = enterOffsetFor(placement, 3);

  return (
    <>
      {trigger}
      <AnimatePresence>
        {isOpen && (
          <FloatingPortal>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              className={cn('pointer-events-none', Z.tooltip)}
              {...getFloatingProps()}
            >
              <motion.div
                initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.94, ...from }}
                animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                exit={{ opacity: 0, scale: reduced ? 1 : 0.96, transition: { duration: 0.08 } }}
                transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                style={{ transformOrigin: originFor(placement) }}
                className={cn(
                  'max-w-[16rem] rounded-lg border border-line-strong bg-surface-3 px-2.5 py-1.5 text-xs font-semibold leading-snug text-fg shadow-pop',
                  'light:border-line light:bg-surface',
                  className,
                )}
              >
                {content}
              </motion.div>
            </div>
          </FloatingPortal>
        )}
      </AnimatePresence>
    </>
  );
}
