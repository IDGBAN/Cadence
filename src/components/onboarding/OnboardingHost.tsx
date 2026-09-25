import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, FlaskConical, Lock, Rocket, Sparkles, TrendingUp, Zap } from 'lucide-react';
import type { Habit, ThemeName } from '@/types';
import { DEMO_DAYS, loadDemoData } from '@/lib/dataActions';
import { confettiCelebration, playSound } from '@/lib/feedback';
import { actions, getData, useStore } from '@/store/store';
import { useActiveHabits, useReducedMotion, useSettings } from '@/store/hooks';
import { toast } from '@/store/ui';
import { Button, Input, Modal, cn, confirmDialog } from '@/components/ui';
import { BrandMark } from '@/components/layout/BrandMark';
import { SettingNote } from '@/components/settings/SettingsSection';
import { AccentPicker, ThemePicker } from '@/components/settings/ThemePicker';
import { HabitChecklist } from './HabitChecklist';
import { LoggingTour } from './LoggingTour';

const NAME_MAX_LENGTH = 24;

const STEPS = [
  { id: 'welcome', title: 'Welcome' },
  { id: 'personalize', title: 'Make it yours' },
  { id: 'habits', title: 'Your habits' },
  { id: 'logging', title: 'How logging works' },
  { id: 'start', title: 'Start' },
] as const;

const PROMISES = [
  { icon: Zap, title: 'One tap to log', detail: 'Check, count, time or rate, on Today or any past day.' },
  { icon: Sparkles, title: 'Streaks and rewards', detail: 'Levels, achievements and confetti for perfect days.' },
  { icon: TrendingUp, title: 'Spot patterns', detail: 'Insights shows which habits tend to boost the others.' },
];

function StepHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className="mb-5">
      <p className="eyebrow mb-1.5">{eyebrow}</p>
      <h2 className="font-display text-xl font-semibold tracking-tight text-fg sm:text-2xl">{title}</h2>
      <p className="mt-1.5 max-w-prose text-[13.5px] leading-relaxed text-fg-3">{subtitle}</p>
    </div>
  );
}

export function OnboardingHost() {
  const hydrated = useStore((s) => s.hydrated);
  const onboarded = useStore((s) => s.data.meta.onboarded);
  const settings = useSettings();
  const habits = useActiveHabits();
  const updateSettings = useStore((s) => s.updateSettings);
  const reduced = useReducedMotion();

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [removed, setRemoved] = useState<Habit[]>([]);
  const [busy, setBusy] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const finishRef = useRef<HTMLButtonElement>(null);
  const navigated = useRef(false);

  const open = hydrated && !onboarded;
  const isLast = step === STEPS.length - 1;
  const displayName = settings.userName.trim();

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setDirection(1);
    setRemoved([]);
    navigated.current = false;
  }, [open]);

  // reset the modal body's scroll on each step
  useEffect(() => {
    let node: HTMLElement | null = contentRef.current?.parentElement ?? null;
    while (node) {
      if (node.scrollHeight > node.clientHeight && /(auto|scroll)/.test(getComputedStyle(node).overflowY)) {
        node.scrollTop = 0;
        return;
      }
      node = node.parentElement;
    }
  }, [step]);

  // the footer changes on the last step, keep focus on the primary button
  useEffect(() => {
    if (!navigated.current) return;
    (isLast ? finishRef : nextRef).current?.focus({ preventScroll: true });
  }, [isLast]);

  const goTo = (next: number) => {
    const target = Math.max(0, Math.min(STEPS.length - 1, next));
    navigated.current = true;
    setDirection(target >= step ? 1 : -1);
    setStep(target);
  };

  const toggleHabit = async (habit: Habit, keep: boolean) => {
    if (keep) {
      actions().addHabit(habit);
      setRemoved((list) => list.filter((h) => h.id !== habit.id));
      return;
    }
    // when the tour is replayed, don't silently delete a habit that has history
    const logged = Object.keys(getData().logs[habit.id] ?? {}).length;
    if (logged > 0) {
      const ok = await confirmDialog({
        title: `Remove ${habit.name}?`,
        description: `It has ${logged} logged ${logged === 1 ? 'day' : 'days'}. Removing the habit deletes that history too.`,
        confirmLabel: 'Remove habit',
        cancelLabel: 'Keep it',
        tone: 'danger',
        icon: habit.icon,
      });
      if (!ok) return;
    }
    setRemoved((list) => (list.some((h) => h.id === habit.id) ? list : [...list, habit]));
    actions().deleteHabit(habit.id);
  };

  const finish = () => {
    actions().setOnboarded();
  };

  const startFresh = () => {
    finish();
    playSound('levelUp');
    confettiCelebration('perfect');
  };

  const startWithDemo = async () => {
    setBusy(true);
    // let the spinner paint before the generator blocks the main thread
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      if (!loadDemoData()) return;
      finish();
      toast({
        title: 'Demo data loaded',
        description: `${DEMO_DAYS} days of sample history. Clear it any time in Settings › Data.`,
        tone: 'success',
        icon: '🧪',
        duration: 7000,
      });
      confettiCelebration('perfect');
    } finally {
      setBusy(false);
    }
  };

  const slide = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, x: direction * 28 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: direction * -28 },
      };

  return (
    <Modal
      open={open}
      onClose={finish}
      dismissible={false}
      hideClose
      size="lg"
      aria-label="Welcome to Cadence"
      footer={
        isLast ? (
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              variant="ghost"
              icon={<ArrowLeft aria-hidden="true" />}
              onClick={() => goTo(step - 1)}
              className="max-sm:order-last sm:mr-auto"
            >
              Back
            </Button>
            <Button
              variant="secondary"
              icon={<FlaskConical aria-hidden="true" />}
              loading={busy}
              onClick={() => void startWithDemo()}
            >
              Explore with demo data
            </Button>
            <Button
              ref={finishRef}
              data-autofocus
              icon={<Rocket aria-hidden="true" />}
              disabled={busy}
              onClick={startFresh}
            >
              Start fresh
            </Button>
          </div>
        ) : (
          <div className="flex w-full items-center gap-2">
            <Button variant="ghost" size="sm" onClick={finish}>
              Skip
            </Button>
            <div className="ml-auto flex items-center gap-2">
              {step > 0 && (
                <Button variant="secondary" icon={<ArrowLeft aria-hidden="true" />} onClick={() => goTo(step - 1)}>
                  Back
                </Button>
              )}
              <Button
                ref={nextRef}
                data-autofocus
                iconRight={<ArrowRight aria-hidden="true" />}
                onClick={() => goTo(step + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )
      }
    >
      <div ref={contentRef}>
        <div className="mb-5 flex items-center gap-3">
          <ol className="flex items-center gap-1">
            {STEPS.map((s, index) => (
              <li key={s.id} className="flex">
                <button
                  type="button"
                  aria-label={`Step ${index + 1}: ${s.title}`}
                  aria-current={index === step ? 'step' : undefined}
                  onClick={() => goTo(index)}
                  className="flex h-9 items-center px-0.5"
                >
                  <span
                    className={cn(
                      'block h-1.5 rounded-full transition-all duration-300 ease-out',
                      index === step
                        ? 'w-7 accent-gradient'
                        : index < step
                          ? 'w-4 bg-accent/45'
                          : 'w-4 bg-line-strong',
                    )}
                  />
                </button>
              </li>
            ))}
          </ol>
          <span className="eyebrow ml-auto">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>

        <p className="sr-only" aria-live="polite">
          Step {step + 1} of {STEPS.length}: {STEPS[step].title}
        </p>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={STEPS[step].id}
            initial={slide.initial}
            animate={slide.animate}
            exit={slide.exit}
            transition={{ duration: reduced ? 0.12 : 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {step === 0 && (
              <div>
                <div className="text-center">
                  <BrandMark size={72} animated glow className="mx-auto" />
                  <h2 className="mt-5 font-display text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
                    Welcome to Cadence
                  </h2>
                  <p className="mt-2 text-[15px] text-fg-2">Track your habits and keep your streaks going.</p>
                </div>

                <ul className="mt-6 grid gap-2.5 sm:grid-cols-3">
                  {PROMISES.map(({ icon: Icon, title, detail }) => (
                    <li key={title} className="rounded-2xl border border-line bg-surface-2 p-3.5">
                      <span className="flex size-8 items-center justify-center rounded-xl bg-accent/12 text-accent">
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <p className="mt-2.5 text-sm font-semibold text-fg">{title}</p>
                      <p className="mt-1 text-[12.5px] leading-snug text-fg-3">{detail}</p>
                    </li>
                  ))}
                </ul>

                <SettingNote className="mt-4" tone="accent" icon={<Lock aria-hidden="true" />}>
                  Everything stays in this browser. There’s no account, cloud sync or tracking, and backups are files
                  you keep.
                </SettingNote>
              </div>
            )}

            {step === 1 && (
              <div>
                <StepHeading
                  eyebrow="Make it yours"
                  title="Pick a look"
                  subtitle="Four themes and six accents. Changes show up right away, and you can adjust them later in Settings."
                />
                <div className="space-y-5">
                  <Input
                    label="Your name (optional)"
                    value={settings.userName}
                    onChange={(e) => updateSettings({ userName: e.target.value.slice(0, NAME_MAX_LENGTH) })}
                    maxLength={NAME_MAX_LENGTH}
                    placeholder="What should we call you?"
                    autoComplete="given-name"
                    spellCheck={false}
                    hint="Used for the greeting on Today."
                    className="sm:max-w-xs"
                  />
                  <div>
                    <p className="mb-2 text-sm font-medium text-fg">Theme</p>
                    <ThemePicker
                      value={settings.theme}
                      accent={settings.accent}
                      onChange={(theme: ThemeName) => updateSettings({ theme })}
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium text-fg">Accent</p>
                    <AccentPicker
                      value={settings.accent}
                      theme={settings.theme}
                      onChange={(accent) => updateSettings({ accent })}
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <StepHeading
                  eyebrow="Your habits"
                  title="A few habits to start with"
                  subtitle="Untick anything you don’t need. You can add, edit or archive habits later on the Habits page."
                />
                <HabitChecklist removed={removed} onToggle={(habit, keep) => void toggleHabit(habit, keep)} />
              </div>
            )}

            {step === 3 && (
              <div>
                <StepHeading
                  eyebrow="How logging works"
                  title="Five ways to log"
                  subtitle="Try them out. Nothing here is saved."
                />
                <LoggingTour />
                <SettingNote className="mt-4" icon={<ArrowLeft aria-hidden="true" />}>
                  Missed a day? Edit any past day from the week strip on Today, from History, or from a habit’s own
                  calendar.
                </SettingNote>
              </div>
            )}

            {step === 4 && (
              <div>
                <div className="text-center">
                  <span
                    aria-hidden="true"
                    className="mx-auto flex size-16 items-center justify-center rounded-[22px] border border-line bg-surface-2 text-3xl shadow-card"
                  >
                    🚀
                  </span>
                  <h2 className="mt-4 font-display text-2xl font-semibold tracking-tight text-fg">
                    You’re all set{displayName === '' ? '' : `, ${displayName}`}
                  </h2>
                  <p className="mt-2 text-[14px] text-fg-2">
                    {habits.length} {habits.length === 1 ? 'habit is' : 'habits are'} ready. Log one today to start a
                    streak.
                  </p>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-accent/30 bg-[linear-gradient(160deg,color-mix(in_oklab,var(--accent)_12%,transparent),transparent_65%)] p-4">
                    <span className="flex size-8 items-center justify-center rounded-xl bg-accent/15 text-accent">
                      <Rocket className="size-4" aria-hidden="true" />
                    </span>
                    <p className="mt-2.5 text-sm font-semibold text-fg">Start fresh</p>
                    <p className="mt-1 text-[12.5px] leading-snug text-fg-3">
                      Keep these habits and start with a clean history.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-line bg-surface-2 p-4">
                    <span className="flex size-8 items-center justify-center rounded-xl bg-surface-3 text-fg-2">
                      <FlaskConical className="size-4" aria-hidden="true" />
                    </span>
                    <p className="mt-2.5 text-sm font-semibold text-fg">Explore with demo data</p>
                    <p className="mt-1 text-[12.5px] leading-snug text-fg-3">
                      {DEMO_DAYS} days of sample history, so stats and correlations have data right away. It replaces
                      these habits. You can clear it later in Settings › Data.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </Modal>
  );
}
