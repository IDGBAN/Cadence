import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { Check, Flame, Info, TriangleAlert, Trophy, X } from 'lucide-react';
import { useUI, type Toast, type ToastTone } from '@/store/ui';
import { cn } from './cn';
import { Button, IconButton } from './Button';
import { Z } from './floating';
import { EMOJI_FONT } from './hooks';
import { springSoft, useReducedMotionPref } from './motion';

const EMPTY: Toast[] = [];
const DEFAULT_DURATION = 3500;

const toneColor: Record<ToastTone, string> = {
  default: 'var(--accent)',
  success: 'var(--success)',
  danger: 'var(--danger)',
  xp: 'var(--xp)',
  streak: 'var(--flame)',
  achievement: 'var(--xp)',
};

/** Hovering or focusing a toast pauses it. Swipe sideways to dismiss. */
export function Toaster() {
  const toasts = useUI((s) => s.toasts) ?? EMPTY;
  const dismissToast = useUI((s) => s.dismissToast);
  const reduced = useReducedMotionPref();

  return (
    <section
      aria-label="Notifications"
      aria-live="polite"
      className={cn(
        'pointer-events-none fixed inset-x-0 flex flex-col items-center gap-2 px-4',
        'bottom-[calc(88px+env(safe-area-inset-bottom))]',
        'md:inset-x-auto md:bottom-6 md:right-6 md:items-end md:px-0',
        Z.toast,
      )}
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} reduced={reduced} onDismiss={() => dismissToast?.(t.id)} />
        ))}
      </AnimatePresence>
    </section>
  );
}

function ToastIcon({ tone, icon }: { tone: ToastTone; icon?: string }) {
  const emoji = icon ? (
    <span className="text-lg leading-none" style={{ fontFamily: EMOJI_FONT }}>
      {icon}
    </span>
  ) : null;

  const bubble = 'relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl [&_svg]:size-[18px]';
  let content: ReactNode;
  let className: string;

  switch (tone) {
    case 'success':
      className = 'bg-success/16 text-success';
      content = emoji ?? <Check strokeWidth={3} />;
      break;
    case 'danger':
      className = 'bg-danger/16 text-danger';
      content = emoji ?? <TriangleAlert strokeWidth={2.25} />;
      break;
    case 'xp':
      className =
        'xp-gradient text-[#422006] shadow-[inset_0_1px_0_rgb(255_255_255/0.45),0_4px_14px_-4px_color-mix(in_oklab,var(--xp)_80%,transparent)]';
      content = emoji ?? <span className="font-display text-[11px] font-extrabold tracking-tight">+XP</span>;
      break;
    case 'streak':
      className =
        'flame-gradient text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_4px_14px_-4px_color-mix(in_oklab,var(--flame)_80%,transparent)]';
      content = <span className="origin-bottom animate-flicker">{emoji ?? <Flame fill="currentColor" strokeWidth={1.75} />}</span>;
      break;
    case 'achievement':
      className =
        'xp-gradient text-[#422006] shadow-[inset_0_1px_0_rgb(255_255_255/0.45),0_4px_14px_-4px_color-mix(in_oklab,var(--xp)_80%,transparent)]';
      content = emoji ?? <Trophy strokeWidth={2.25} />;
      break;
    default:
      className = 'bg-surface-3 text-fg-2 light:bg-surface-2';
      content = emoji ?? <Info strokeWidth={2.25} />;
  }

  return (
    <span aria-hidden className={cn(bubble, className)}>
      {content}
    </span>
  );
}

function ToastCard({ toast, reduced, onDismiss }: { toast: Toast; reduced: boolean; onDismiss: () => void }) {
  const tone: ToastTone = toast.tone ?? 'default';
  const duration = toast.duration ?? DEFAULT_DURATION;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [exitX, setExitX] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<Animation | null>(null);
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  // the countdown bar doubles as the timer (Web Animations API), so pausing it pauses both
  useEffect(() => {
    if (duration <= 0) return;
    const el = barRef.current;
    if (el && typeof el.animate === 'function') {
      const animation = el.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], {
        duration,
        easing: 'linear',
        fill: 'forwards',
      });
      animation.onfinish = () => onDismissRef.current();
      timerRef.current = animation;
      return () => {
        animation.onfinish = null;
        animation.cancel();
        timerRef.current = null;
      };
    }
    const timeout = setTimeout(() => onDismissRef.current(), duration);
    return () => clearTimeout(timeout);
  }, [duration]);

  const paused = hovered || focused;
  useEffect(() => {
    const animation = timerRef.current;
    if (!animation) return;
    if (paused && animation.playState === 'running') animation.pause();
    else if (!paused && animation.playState === 'paused') animation.play();
  }, [paused]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 90 || Math.abs(info.velocity.x) > 600) {
      setExitX(Math.sign(info.offset.x || info.velocity.x) * 420);
      onDismiss();
    }
  };

  const color = toneColor[tone];

  return (
    <motion.div
      layout={!reduced}
      role={tone === 'danger' ? 'alert' : 'status'}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={
        reduced
          ? { opacity: 0, transition: { duration: 0.12 } }
          : exitX !== 0
            ? { opacity: 0, x: exitX, transition: { duration: 0.2, ease: 'easeOut' } }
            : { opacity: 0, scale: 0.94, y: 8, transition: { duration: 0.18, ease: 'easeIn' } }
      }
      transition={springSoft}
      drag={reduced ? false : 'x'}
      dragSnapToOrigin
      dragElastic={0.55}
      onDragEnd={onDragEnd}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      style={{ '--toast': color } as CSSProperties}
      className={cn(
        'pointer-events-auto relative w-full max-w-[420px] cursor-grab touch-pan-y select-none overflow-hidden rounded-2xl border active:cursor-grabbing md:w-[380px]',
        'bg-[color-mix(in_oklab,var(--surface-2)_94%,transparent)] backdrop-blur-xl light:bg-[color-mix(in_oklab,var(--surface)_96%,transparent)]',
        'shadow-pop',
        tone === 'default'
          ? 'border-line-strong light:border-line'
          : 'border-[color-mix(in_oklab,var(--toast)_32%,var(--line-strong))]',
      )}
    >
      {tone !== 'default' && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_140%_at_0%_50%,color-mix(in_oklab,var(--toast)_16%,transparent),transparent_55%)]"
        />
      )}
      {tone === 'achievement' && <div aria-hidden className="sheen pointer-events-none absolute inset-0" />}

      <div className="relative flex items-center gap-3 py-2.5 pl-2.5 pr-2">
        <ToastIcon tone={tone} icon={toast.icon} />
        <div className="min-w-0 flex-1 py-0.5">
          <p
            className={cn(
              'text-sm font-semibold leading-snug text-fg',
              (tone === 'xp' || tone === 'achievement') && 'font-display tracking-tight',
            )}
          >
            {toast.title}
          </p>
          {toast.description && <p className="mt-0.5 text-[13px] leading-snug text-fg-3">{toast.description}</p>}
        </div>
        {toast.action && (
          <Button
            size="sm"
            variant="soft"
            className="shrink-0"
            onClick={() => {
              toast.action?.onClick();
              onDismiss();
            }}
          >
            {toast.action.label}
          </Button>
        )}
        <IconButton label="Dismiss notification" size="xs" tooltip={false} onClick={onDismiss} className="shrink-0 text-fg-4">
          <X />
        </IconButton>
      </div>

      {duration > 0 && (
        <div
          ref={barRef}
          aria-hidden
          className={cn(
            'absolute inset-x-0 bottom-0 h-[2px] origin-left bg-[color-mix(in_oklab,var(--toast)_55%,transparent)]',
            reduced && 'opacity-0',
          )}
        />
      )}
    </motion.div>
  );
}
