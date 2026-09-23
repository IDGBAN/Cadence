import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls, useIsPresent, type PanInfo } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from './cn';
import { IconButton } from './Button';
import { Z } from './floating';
import { useMediaQueryMatch, EMOJI_FONT } from './hooks';
import { getTabbables, lockScroll, useLayer } from './layers';
import { springSoft, useReducedMotionPref } from './motion';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children?: ReactNode;
  /** Buttons row: right-aligned on desktop, full width on phones. */
  footer?: ReactNode;
  hideClose?: boolean;
  /** false turns off backdrop click, Esc and swipe-to-close. */
  dismissible?: boolean;
  className?: string;
  bodyClassName?: string;
  'aria-label'?: string;
}

const sizes = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
} as const;

/** Centered dialog on desktop, bottom sheet on phones. Put `data-autofocus` on whatever should get focus first. */
export function Modal(props: ModalProps) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>{props.open && <ModalPanel key="modal" {...props} />}</AnimatePresence>,
    document.body,
  );
}

const INTERACTIVE = 'button, a, input, textarea, select, label, [role="button"], [contenteditable="true"]';

function ModalPanel({
  onClose,
  title,
  description,
  icon,
  size = 'md',
  children,
  footer,
  hideClose = false,
  dismissible = true,
  className,
  bodyClassName,
  'aria-label': ariaLabel,
}: ModalProps) {
  const isPresent = useIsPresent();
  const reduced = useReducedMotionPref();
  const isDesktop = useMediaQueryMatch('(min-width: 640px)', true);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const dragControls = useDragControls();
  const backdropArmed = useRef(false);

  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });
  const requestClose = useCallback(() => onCloseRef.current(), []);
  const layer = useLayer(isPresent, dismissible ? requestClose : undefined);

  // grab it during the first render, before autoFocus children move focus
  const [restoreTarget] = useState<HTMLElement | null>(() =>
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );

  // held through the exit animation too, otherwise the scrollbar flashes
  useEffect(() => lockScroll(), []);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || panel.contains(document.activeElement)) return;
    const preferred = panel.querySelector<HTMLElement>('[data-autofocus]');
    (preferred ?? panel).focus({ preventScroll: true });
  }, []);

  // return focus when the exit starts, not when it ends
  useEffect(() => {
    if (isPresent) return;
    const panel = panelRef.current;
    const active = document.activeElement;
    const focusIsOurs = !active || active === document.body || (panel?.contains(active) ?? false);
    if (focusIsOurs && restoreTarget?.isConnected) restoreTarget.focus({ preventScroll: true });
  }, [isPresent, restoreTarget]);

  // trap focus while this is the top layer
  useEffect(() => {
    if (!isPresent) return;
    const onFocusIn = (e: FocusEvent) => {
      const panel = panelRef.current;
      if (!panel || !layer.isTop()) return;
      const target = e.target;
      if (target instanceof Node && !panel.contains(target)) {
        const first = getTabbables(panel)[0];
        (first ?? panel).focus({ preventScroll: true });
      }
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, [isPresent, layer]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel || !panel.contains(document.activeElement)) return;
    const items = getTabbables(panel);
    if (items.length === 0) {
      e.preventDefault();
      panel.focus({ preventScroll: true });
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const canDrag = !isDesktop && dismissible;
  const startDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (!canDrag) return;
    if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return;
    dragControls.start(e);
  };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 110 || info.velocity.y > 650) requestClose();
  };

  const panelMotion = reduced
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: { duration: 0.15 } },
        exit: { opacity: 0, transition: { duration: 0.12 } },
      }
    : isDesktop
      ? {
          initial: { opacity: 0, scale: 0.96, y: 14 },
          animate: { opacity: 1, scale: 1, y: 0, transition: springSoft },
          exit: { opacity: 0, scale: 0.97, y: 8, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] as const } },
        }
      : {
          initial: { y: '100%' },
          animate: { y: 0, transition: { type: 'spring' as const, stiffness: 400, damping: 40, mass: 0.9 } },
          exit: { y: '100%', transition: { duration: 0.22, ease: [0.4, 0, 1, 1] as const } },
        };

  const hasHeader = Boolean(title || description || icon);
  const hasBody = children !== undefined && children !== null && children !== false;
  const closeButton = !hideClose && (
    <IconButton label="Close" size="sm" tooltip={false} onClick={requestClose} className="-mr-1.5 text-fg-3">
      <X />
    </IconButton>
  );

  return (
    <div
      className={cn(
        'fixed inset-0 flex items-end justify-center sm:items-center sm:p-6',
        Z.modal,
        !isPresent && 'pointer-events-none',
      )}
    >
      <motion.div
        aria-hidden
        className={cn(
          'absolute inset-0 backdrop-blur-[6px]',
          'bg-[color-mix(in_oklab,var(--bg)_50%,rgb(0_0_0/0.45))] light:bg-[color-mix(in_oklab,var(--bg)_40%,rgb(17_20_39/0.35))]',
        )}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduced ? 0.12 : 0.22 }}
        onPointerDown={(e) => {
          backdropArmed.current = e.target === e.currentTarget && layer.wasTopAtPointerDown();
        }}
        onClick={(e) => {
          const armed = backdropArmed.current;
          backdropArmed.current = false;
          if (dismissible && armed && e.target === e.currentTarget) requestClose();
        }}
      />

      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : ariaLabel}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        {...panelMotion}
        drag={canDrag ? 'y' : false}
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.03, bottom: 0.9 }}
        onDragEnd={onDragEnd}
        className={cn(
          'relative flex w-full flex-col overflow-hidden border-line bg-surface shadow-pop outline-none focus-visible:outline-none',
          'max-h-[92dvh] rounded-t-[28px] border-x border-t',
          'sm:max-h-[min(88dvh,56rem)] sm:rounded-3xl sm:border',
          'before:pointer-events-none before:absolute before:inset-x-8 before:top-0 before:z-10 before:h-px',
          'before:bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--fg)_16%,transparent),transparent)]',
          sizes[size],
          className,
        )}
      >
        {/* drag handle */}
        <div
          onPointerDown={startDrag}
          className={cn('flex shrink-0 touch-none justify-center pb-1 pt-2.5 sm:hidden', canDrag && 'cursor-grab active:cursor-grabbing')}
          aria-hidden
        >
          <div className="h-1.5 w-10 rounded-full bg-line-strong" />
        </div>

        {hasHeader ? (
          <div
            onPointerDown={startDrag}
            className={cn(
              'flex shrink-0 gap-3.5 px-5 pt-2 max-sm:touch-none sm:px-6 sm:pt-5',
              hasBody ? 'pb-3' : 'pb-5',
              description ? 'items-start' : 'items-center',
            )}
          >
            {icon !== undefined && icon !== null && icon !== false && (
              <div
                aria-hidden
                className={cn(
                  'flex size-11 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface-2 text-2xl leading-none',
                  'shadow-[inset_0_1px_0_color-mix(in_oklab,var(--fg)_7%,transparent)] [&_svg]:size-5',
                )}
                style={typeof icon === 'string' ? { fontFamily: EMOJI_FONT } : undefined}
              >
                {icon}
              </div>
            )}
            <div className="min-w-0 flex-1">
              {title && (
                <h2 id={titleId} className="font-display text-lg font-semibold leading-tight tracking-tight text-fg sm:text-xl">
                  {title}
                </h2>
              )}
              {description && (
                <div id={descId} className="mt-1 text-sm leading-relaxed text-fg-3">
                  {description}
                </div>
              )}
            </div>
            {closeButton}
          </div>
        ) : (
          closeButton && <div className="absolute right-4 top-3 z-20 sm:top-4">{closeButton}</div>
        )}

        {hasBody && (
          <div
            className={cn(
              'min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6 sm:pb-6',
              hasHeader ? 'pt-2' : 'pt-3 sm:pt-6',
              !footer && 'max-sm:pb-[max(1.25rem,env(safe-area-inset-bottom))]',
              bodyClassName,
            )}
          >
            {children}
          </div>
        )}

        {footer && (
          <div
            className={cn(
              'flex shrink-0 items-center gap-2 border-t border-line bg-surface px-5 py-3 sm:justify-end sm:px-6 sm:py-4',
              'max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-sm:[&>*]:flex-1 sm:[&>div:only-child]:flex-1',
            )}
          >
            {footer}
          </div>
        )}
      </motion.div>
    </div>
  );
}
