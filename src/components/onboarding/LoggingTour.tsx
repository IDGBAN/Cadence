import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Check, Minus, Pause, Play, Plus, RotateCcw } from 'lucide-react';
import type { HabitColor } from '@/types';
import { habitStyle } from '@/lib/colors';
import { formatMinutes, formatStopwatch } from '@/lib/format';
import { haptic, playSound } from '@/lib/feedback';
import { useReducedMotion } from '@/store/hooks';
import { Button, IconButton, ProgressBar, RatingPicker, cn } from '@/components/ui';

// demo state only, nothing here touches the store

interface TourCardProps {
  icon: string;
  color: HabitColor;
  title: string;
  hint: string;
  children: ReactNode;
}

function TourCard({ icon, color, title, hint, children }: TourCardProps) {
  return (
    <li
      style={habitStyle(color)}
      className="rounded-2xl border border-line bg-surface-2 p-3.5 transition-colors duration-200 hover:border-line-strong"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl habit-tint text-lg leading-none">
          <span aria-hidden="true">{icon}</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">{title}</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-fg-3">{hint}</p>
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </li>
  );
}

function CheckDemo() {
  const [done, setDone] = useState(false);
  const reduced = useReducedMotion();

  return (
    <button
      type="button"
      aria-pressed={done}
      onClick={() => {
        setDone((v) => !v);
        haptic(8);
        playSound(done ? 'undo' : 'complete');
      }}
      className={cn(
        'flex h-11 w-full items-center gap-3 rounded-xl border px-3 text-left transition-colors duration-200',
        done ? 'habit-border habit-tint' : 'border-line bg-surface hover:border-line-strong',
      )}
    >
      <span
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200',
          done ? 'habit-fill habit-on-fill border-transparent' : 'border-line-strong text-transparent',
        )}
      >
        <motion.span
          initial={false}
          animate={done ? { scale: 1 } : { scale: 0 }}
          transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 22 }}
          className="flex"
        >
          <Check className="size-3.5" strokeWidth={3.5} aria-hidden="true" />
        </motion.span>
      </span>
      <span className={cn('text-sm font-medium', done ? 'habit-text' : 'text-fg-2')}>
        {done ? 'Vitamin D: done today' : 'Tap to check off Vitamin D'}
      </span>
    </button>
  );
}

function QuantityDemo() {
  const [glasses, setGlasses] = useState(5);
  const target = 8;

  const bump = (delta: number) => {
    setGlasses((v) => {
      const next = Math.max(0, Math.min(12, v + delta));
      if (next !== v) {
        haptic(6);
        playSound(next >= target && v < target ? 'complete' : delta > 0 ? 'tick' : 'undo');
      }
      return next;
    });
  };

  return (
    <div className="flex items-center gap-3">
      <IconButton label="One glass less" variant="secondary" size="sm" onClick={() => bump(-1)}>
        <Minus />
      </IconButton>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-1.5">
          <span className="font-display text-lg leading-none font-semibold tabular habit-text">{glasses}</span>
          <span className="text-[12.5px] text-fg-3">of {target} glasses</span>
        </p>
        <ProgressBar value={glasses / target} height={6} className="mt-2" aria-label="Water progress" />
      </div>
      <IconButton label="One glass more" variant="secondary" size="sm" onClick={() => bump(1)}>
        <Plus />
      </IconButton>
    </div>
  );
}

function DurationDemo() {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const baseline = useRef(0);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setElapsed(baseline.current + (Date.now() - startedAt.current)), 200);
    return () => window.clearInterval(id);
  }, [running]);

  const toggle = () => {
    if (running) {
      baseline.current += Date.now() - startedAt.current;
      setElapsed(baseline.current);
      setRunning(false);
      playSound('timerStop');
    } else {
      startedAt.current = Date.now();
      setRunning(true);
      playSound('timerStart');
    }
    haptic(8);
  };

  const reset = () => {
    baseline.current = 0;
    startedAt.current = Date.now();
    setElapsed(0);
  };

  return (
    <div className="flex items-center gap-3">
      <Button
        variant={running ? 'secondary' : 'primary'}
        size="sm"
        icon={running ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        onClick={toggle}
      >
        {running ? 'Pause' : 'Start'}
      </Button>
      <p className="min-w-0 flex-1">
        <span className="font-display text-lg leading-none font-semibold tabular text-fg">
          {formatStopwatch(elapsed)}
        </span>
        <span className="ml-2 text-[12.5px] text-fg-3">of {formatMinutes(120)} today</span>
      </p>
      <IconButton label="Reset the timer" variant="ghost" size="sm" onClick={reset} disabled={elapsed === 0}>
        <RotateCcw />
      </IconButton>
    </div>
  );
}

function RatingDemo() {
  const [value, setValue] = useState<number | undefined>(7);

  return (
    <div>
      <RatingPicker
        value={value}
        size="sm"
        target={7}
        aria-label="Sleep quality"
        onChange={(next) => {
          setValue(next);
          if (next !== undefined) playSound(next >= 7 ? 'complete' : 'tick');
        }}
      />
      <p className="mt-2 text-[12.5px] text-fg-3">
        {value === undefined
          ? 'Nothing logged yet. Tap a number.'
          : value >= 7
            ? `${value}/10 counts as good sleep.`
            : `${value}/10 is below your 7/10 goal.`}
      </p>
    </div>
  );
}

const QUIT_DAYS = 12;

function QuitDemo() {
  const [days, setDays] = useState(QUIT_DAYS);
  const reduced = useReducedMotion();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <motion.p
        key={days}
        initial={reduced ? false : { scale: 0.86, opacity: 0.4 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 20 }}
        className="flex items-baseline gap-1.5"
      >
        <span className="font-display text-2xl leading-none font-bold tabular habit-text">{days}</span>
        <span className="text-[12.5px] text-fg-3">{days === 1 ? 'day clean' : 'days clean'}</span>
      </motion.p>
      <div className="ml-auto flex items-center gap-2">
        {days === 0 ? (
          <Button variant="ghost" size="sm" icon={<RotateCcw aria-hidden="true" />} onClick={() => setDays(QUIT_DAYS)}>
            Undo relapse
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setDays(0);
              haptic(14);
              playSound('relapse');
            }}
          >
            Log a slip
          </Button>
        )}
      </div>
      {days === 0 && (
        <p className="w-full text-[12.5px] text-fg-3">
          The counter goes back to zero, but your best run (12 days) is kept.
        </p>
      )}
    </div>
  );
}

export function LoggingTour() {
  return (
    <ul className="space-y-2.5">
      <TourCard icon="☀️" color="emerald" title="Yes or no" hint="Supplements, Duolingo, brushing. One tap and it's done.">
        <CheckDemo />
      </TourCard>
      <TourCard icon="💧" color="sky" title="Count things" hint="Glasses of water, meals, pages. Minus and plus, or type the number.">
        <QuantityDemo />
      </TourCard>
      <TourCard icon="📖" color="blue" title="Track time" hint="Studying, reading, workouts. Run the stopwatch or enter hours and minutes.">
        <DurationDemo />
      </TourCard>
      <TourCard icon="😴" color="indigo" title="Rate out of 10" hint="Sleep quality, mood, how clean you ate. Your goal is a threshold.">
        <RatingDemo />
      </TourCard>
      <TourCard icon="📵" color="pink" title="Quit something" hint="Counts up every clean day and resets when you log a slip.">
        <QuitDemo />
      </TourCard>
    </ul>
  );
}
