import { useId, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, Info } from 'lucide-react';
import { cn } from '@/components/ui';
import { useReducedMotion } from '@/store/hooks';
import {
  PERFECT_DAY_MIN_HABITS,
  QUIT_MILESTONE_XP,
  TIER_XP,
  XP_RULES,
  xpForLevel,
  type AchievementTier,
} from '@/lib/rewards';
import { formatNumber, pluralize } from '@/lib/format';

interface Rule {
  label: string;
  detail: string;
  amount: string;
}

interface Group {
  heading: string;
  rules: Rule[];
}

const xp = (n: number): string => `+${formatNumber(n, 0)} XP`;

const TIER_ORDER: AchievementTier[] = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];

export function XpExplainer() {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const panelId = useId();

  // numbers come straight from lib/rewards so this can't drift from the real scoring
  const groups = useMemo<Group[]>(
    () => [
      {
        heading: 'Every day',
        rules: [
          {
            label: 'Completing a daily habit',
            detail: 'Hit the goal for the day.',
            amount: xp(XP_RULES.dailyDone),
          },
          {
            label: 'Streak bonus',
            detail: `${xp(XP_RULES.streakBonusPerWeek)} for every full week of the running streak, capped at ${xp(XP_RULES.streakBonusMax)}.`,
            amount: `up to ${xp(XP_RULES.streakBonusMax)}`,
          },
          {
            label: 'Partial credit',
            detail: 'Logged something but fell short. Scaled by how far you got.',
            amount: `up to ${xp(XP_RULES.partialMax)}`,
          },
          {
            label: 'Bonus day',
            detail: 'Doing a habit on a day it wasn’t scheduled.',
            amount: xp(XP_RULES.bonusDay),
          },
          {
            label: 'Logging a metric',
            detail: 'Track-only habits earn XP too.',
            amount: xp(XP_RULES.metricDay),
          },
          {
            label: 'Writing a day note',
            detail: 'Once per day.',
            amount: xp(XP_RULES.dayNote),
          },
        ],
      },
      {
        heading: 'Weeks, months and perfect days',
        rules: [
          {
            label: 'A day that feeds a weekly or monthly goal',
            detail: 'Every day that counts toward the goal.',
            amount: xp(XP_RULES.periodDay),
          },
          {
            label: 'Finishing a weekly goal',
            detail: 'Hit the weekly target, like gym 3 times.',
            amount: xp(XP_RULES.weekSuccess),
          },
          {
            label: 'Finishing a monthly goal',
            detail: 'Hit the monthly target.',
            amount: xp(XP_RULES.monthSuccess),
          },
          {
            label: 'Perfect day',
            detail: `Everything due is done, with at least ${pluralize(PERFECT_DAY_MIN_HABITS, 'habit')} due that day.`,
            amount: xp(XP_RULES.perfectDay),
          },
        ],
      },
      {
        heading: 'Quitting something',
        rules: [
          {
            label: 'Each clean day',
            detail: 'Counted from your last reset.',
            amount: xp(XP_RULES.quitCleanDay),
          },
          ...QUIT_MILESTONE_XP.map(([days, amount]) => ({
            label: `${formatNumber(days, 0)} clean days`,
            detail: 'One-time bonus each time a run hits this mark.',
            amount: xp(amount),
          })),
        ],
      },
      {
        heading: 'Achievements',
        rules: TIER_ORDER.map((tier) => ({
          label: `${tier.charAt(0).toUpperCase()}${tier.slice(1)} badge`,
          detail: 'Paid once, when you first earn the badge.',
          amount: xp(TIER_XP[tier]),
        })),
      },
    ],
    [],
  );

  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          'flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-surface-2/50 sm:p-5',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
        )}
      >
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-fg-2 [&_svg]:size-[18px]"
        >
          <Info />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg font-semibold tracking-tight text-fg sm:text-xl">
            How XP works
          </span>
          <span className="mt-0.5 block text-sm text-fg-3">
            Every rule the app uses to score your days.
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={cn('size-5 shrink-0 text-fg-3 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            key="panel"
            initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduced ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={reduced ? { duration: 0.15 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-line px-4 pb-5 pt-4 sm:px-5">
              <div className="grid gap-6 sm:grid-cols-2">
                {groups.map((group) => (
                  <div key={group.heading}>
                    <h3 className="eyebrow mb-2.5">{group.heading}</h3>
                    <dl className="flex flex-col gap-2.5">
                      {group.rules.map((rule) => (
                        <div key={rule.label} className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <dt className="text-[13px] font-semibold text-fg-2">{rule.label}</dt>
                            <dd className="mt-0.5 text-[11px] leading-relaxed text-fg-3">{rule.detail}</dd>
                          </div>
                          <span className="shrink-0 whitespace-nowrap text-[12px] font-bold tabular text-xp light:text-[color-mix(in_oklab,var(--xp)_82%,black)]">
                            {rule.amount}
                          </span>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>

              <p className="mt-6 border-t border-line pt-4 text-[12px] leading-relaxed text-fg-3">
                <span className="font-semibold text-fg-2">Levels.</span> Each one costs more than the last: level 5
                needs {formatNumber(xpForLevel(5), 0)} XP in total, level 10 needs {formatNumber(xpForLevel(10), 0)},
                and level 20 needs {formatNumber(xpForLevel(20), 0)}. XP is recalculated from your whole history, so
                fixing an old log updates it too. Nothing gets lost or counted twice.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
