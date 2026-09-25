import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CircleCheck, Lock, Sparkles, Trophy } from 'lucide-react';
import { Badge, Modal, ProgressBar, SectionHeader, Segmented, cn } from '@/components/ui';
import { useReducedMotion, useSettings } from '@/store/hooks';
import { isLightTheme } from '@/components/layout/appearance';
import { useAchievements } from '@/store/rewardHooks';
import { TIER_COLORS, type AchievementGroup, type AchievementStatus } from '@/lib/rewards';
import { formatNumber } from '@/lib/format';
import { formatDayLong, logicalDayOf } from '@/lib/dates';

type Filter = 'all' | 'unlocked' | 'locked';

// unlocked within this window gets the sparkle
const FRESH_MS = 24 * 60 * 60 * 1000;

const GROUP_ORDER: AchievementGroup[] = ['journey', 'streaks', 'consistency', 'volume', 'quit', 'secret'];

const GROUP_META: Record<AchievementGroup, { label: string; blurb: string }> = {
  journey: { label: 'Milestones', blurb: 'Firsts and big moments since you started.' },
  streaks: { label: 'Streaks', blurb: 'For keeping the chain going.' },
  consistency: { label: 'Consistency', blurb: 'For showing up week after week.' },
  volume: { label: 'Volume', blurb: 'Totals that add up over time.' },
  quit: { label: 'Quitting', blurb: 'For staying clean.' },
  secret: { label: 'Secret', blurb: 'Hidden until something unusual happens.' },
};

function ringStyle(tier: AchievementStatus['def']['tier'], dim: boolean): CSSProperties {
  const { from, to } = TIER_COLORS[tier];
  return {
    background: `linear-gradient(140deg, ${from}, ${to})`,
    opacity: dim ? 0.3 : 1,
  };
}

// tier colors are tuned for dark themes. on white cards gold and diamond drop under 2:1,
// so darken them for small text and thin bars (the ring keeps the raw colors)
function tierInk(to: string, light: boolean): string {
  return light ? `color-mix(in oklab, ${to} 68%, black)` : to;
}

function unlockedLabel(at: string | undefined, dayStartHour: number): string | null {
  if (!at) return null;
  const day = logicalDayOf(at, dayStartHour);
  return `Unlocked ${formatDayLong(day)}`;
}

function isFresh(at: string | undefined): boolean {
  if (!at) return false;
  const time = Date.parse(at);
  return Number.isFinite(time) && Date.now() - time < FRESH_MS;
}

function displayName(status: AchievementStatus): string {
  return status.def.secret && !status.unlocked ? '???' : status.def.name;
}

// "???" reads as three question marks to a screen reader
function accessibleName(status: AchievementStatus): string {
  return status.def.secret && !status.unlocked ? 'Secret badge, locked' : status.def.name;
}

function displayDescription(status: AchievementStatus): string {
  return status.def.secret && !status.unlocked
    ? 'A secret badge. Keep using the app and you might find it.'
    : status.def.description;
}

function AchievementTile({
  status,
  light,
  onOpen,
}: {
  status: AchievementStatus;
  light: boolean;
  onOpen: () => void;
}) {
  const { def, unlocked, current, target, progress, unlockedAt } = status;
  const tier = TIER_COLORS[def.tier];
  const ink = tierInk(tier.to, light);
  const fresh = unlocked && isFresh(unlockedAt);
  const hidden = def.secret && !unlocked;

  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      onClick={onOpen}
      aria-label={
        hidden
          ? accessibleName(status)
          : `${displayName(status)}, ${unlocked ? 'unlocked' : `${formatNumber(current, 1)} of ${formatNumber(target, 1)}`}`
      }
      className={cn(
        // no transform on hover, motion owns transform here for the layout animation
        'card relative flex min-h-[172px] flex-col items-center gap-2 overflow-hidden p-3.5 text-center',
        'transition-[border-color,background-color,box-shadow] duration-200',
        'hover:border-line-strong hover:bg-surface-2/70 hover:shadow-[0_14px_34px_-18px_rgb(0_0_0/0.75)]',
        'active:bg-surface-3',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        !unlocked && 'bg-surface/60',
        fresh && 'sheen',
      )}
    >
      {fresh && (
        <span className="absolute right-2 top-2 text-xp light:text-[color-mix(in_oklab,var(--xp)_82%,black)]" aria-hidden>
          <Sparkles className="size-3.5 animate-flicker" />
        </span>
      )}

      <span
        aria-hidden
        className="relative flex size-[54px] shrink-0 items-center justify-center rounded-full p-[2px]"
        style={ringStyle(def.tier, !unlocked)}
      >
        <span
          className={cn(
            'flex size-full items-center justify-center rounded-full bg-surface-2 text-[24px] leading-none',
            !unlocked && 'text-fg-4 grayscale',
          )}
        >
          {hidden ? <Lock className="size-5 text-fg-4" /> : def.icon}
        </span>
      </span>

      <span
        className={cn(
          'mt-0.5 line-clamp-2 font-display text-[13px] font-semibold leading-tight tracking-tight',
          unlocked ? 'text-fg' : 'text-fg-2',
        )}
      >
        {displayName(status)}
      </span>

      <span className="line-clamp-2 text-[11px] leading-snug text-fg-3">
        {hidden ? 'Secret badge' : def.description}
      </span>

      <span className="mt-auto w-full pt-1.5">
        {unlocked ? (
          <span className="flex items-center justify-center gap-1 text-[11px] font-semibold" style={{ color: ink }}>
            <CircleCheck className="size-3" aria-hidden />
            {tier.label} · +{formatNumber(def.xp, 0)} XP
          </span>
        ) : hidden ? null : (
          <>
            <ProgressBar
              value={progress}
              color={ink}
              height={4}
              aria-label={`${Math.round(progress * 100)}% complete`}
            />
            <span className="mt-1.5 block text-[11px] tabular text-fg-3">
              {formatNumber(current, 1)} / {formatNumber(target, 1)}
            </span>
          </>
        )}
      </span>
    </motion.button>
  );
}

function AchievementDetail({
  status,
  light,
  open,
  onClose,
}: {
  status: AchievementStatus;
  light: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const { def, unlocked, current, target, progress, unlockedAt } = status;
  const tier = TIER_COLORS[def.tier];
  const { dayStartHour } = useSettings();
  const remaining = Math.max(0, target - current);
  const when = unlockedLabel(unlockedAt, dayStartHour);
  const hidden = def.secret && !unlocked;

  return (
    <Modal open={open} onClose={onClose} size="sm" aria-label={accessibleName(status)}>
      <div className="flex flex-col items-center px-1 text-center">
        <span
          aria-hidden
          className="flex size-[84px] shrink-0 items-center justify-center rounded-full p-[3px]"
          style={ringStyle(def.tier, !unlocked)}
        >
          <span
            className={cn(
              'flex size-full items-center justify-center rounded-full bg-surface-2 text-[38px] leading-none',
              !unlocked && 'grayscale',
            )}
          >
            {hidden ? <Lock className="size-7 text-fg-4" /> : def.icon}
          </span>
        </span>

        <h2 className="mt-4 font-display text-xl font-bold tracking-tight text-fg">{displayName(status)}</h2>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
          <span
            className="inline-flex h-[26px] shrink-0 items-center rounded-full px-2.5 text-xs font-bold leading-none text-[#1a1205]"
            style={{ background: `linear-gradient(120deg, ${tier.from}, ${tier.to})` }}
          >
            {tier.label}
          </span>
          <Badge size="md" tone="xp">
            +{formatNumber(def.xp, 0)} XP
          </Badge>
          <Badge size="md" tone={unlocked ? 'success' : 'neutral'} icon={unlocked ? <CircleCheck /> : <Lock />}>
            {unlocked ? 'Unlocked' : 'Locked'}
          </Badge>
        </div>

        <p className="mt-4 text-pretty text-sm leading-relaxed text-fg-2">{displayDescription(status)}</p>

        {unlocked ? (
          <p className="mt-4 text-[13px] text-fg-3">{when ?? 'Earned before unlock dates were tracked.'}</p>
        ) : hidden ? (
          <p className="mt-4 text-[13px] leading-relaxed text-fg-3">No hints for this one. It unlocks on its own.</p>
        ) : (
          <div className="mt-5 w-full rounded-xl border border-line bg-surface-2/60 p-4 text-left">
            <div className="flex items-baseline justify-between gap-3">
              <span className="eyebrow">Progress</span>
              <span className="text-[13px] font-semibold tabular text-fg">
                {formatNumber(current, 1)} / {formatNumber(target, 1)}
              </span>
            </div>
            <ProgressBar
              value={progress}
              color={tierInk(tier.to, light)}
              height={8}
              className="mt-2.5"
              aria-label={`${Math.round(progress * 100)}% complete`}
            />
            <p className="mt-3 text-[13px] leading-relaxed text-fg-3">
              {formatNumber(remaining, 1)} to go. {def.description}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function AchievementCase() {
  const achievements = useAchievements();
  const reduced = useReducedMotion();
  const light = isLightTheme(useSettings().theme);
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const unlockedCount = useMemo(() => achievements.filter((a) => a.unlocked).length, [achievements]);
  const earnedXp = useMemo(
    () => achievements.reduce((sum, a) => (a.unlocked ? sum + a.def.xp : sum), 0),
    [achievements],
  );

  const visible = useMemo(() => {
    if (filter === 'unlocked') return achievements.filter((a) => a.unlocked);
    if (filter === 'locked') return achievements.filter((a) => !a.unlocked);
    return achievements;
  }, [achievements, filter]);

  const groups = useMemo(() => {
    const byGroup = new Map<AchievementGroup, AchievementStatus[]>();
    for (const status of visible) {
      const list = byGroup.get(status.def.group);
      if (list) list.push(status);
      else byGroup.set(status.def.group, [status]);
    }
    return GROUP_ORDER.filter((group) => (byGroup.get(group)?.length ?? 0) > 0).map((group) => ({
      group,
      items: byGroup.get(group) ?? [],
    }));
  }, [visible]);

  // hold on to the last badge so the modal can animate out
  const openStatus = openId === null ? undefined : achievements.find((a) => a.def.id === openId);
  const lastOpened = useRef<AchievementStatus | null>(null);
  if (openStatus) lastOpened.current = openStatus;
  const detail = openStatus ?? lastOpened.current;
  const lockedCount = achievements.length - unlockedCount;

  return (
    <section>
      <SectionHeader
        title="Achievements"
        eyebrow="Badge case"
        icon={<Trophy aria-hidden />}
        subtitle={
          <>
            <span className="font-semibold text-fg-2">
              {unlockedCount} of {achievements.length}
            </span>{' '}
            unlocked · {formatNumber(earnedXp, 0)} XP earned from badges
          </>
        }
      />

      <div className="mt-4 flex flex-col gap-3 sm:flex-row-reverse sm:items-center sm:gap-5">
        <div className="w-full sm:w-[290px] sm:shrink-0">
          <Segmented
            size="sm"
            fullWidth
            value={filter}
            onChange={setFilter}
            aria-label="Filter achievements"
            options={[
              { value: 'all', label: `All ${achievements.length}` },
              { value: 'unlocked', label: `Unlocked ${unlockedCount}` },
              { value: 'locked', label: `Locked ${lockedCount}` },
            ]}
          />
        </div>
        <div className="min-w-0 flex-1">
          <ProgressBar
            value={achievements.length > 0 ? unlockedCount / achievements.length : 0}
            color="var(--xp)"
            height={6}
            glow={unlockedCount === achievements.length && achievements.length > 0}
            aria-label={`${unlockedCount} of ${achievements.length} achievements unlocked`}
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
          <p className="text-sm text-fg-3">
            {filter === 'unlocked'
              ? 'No badges yet. Complete a habit today and your first one is close.'
              : filter === 'locked'
                ? "You've unlocked every badge."
                : 'No achievements are defined.'}
          </p>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-7">
          {groups.map(({ group, items }) => (
            <div key={group}>
              <div className="mb-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <h3 className="font-display text-[15px] font-semibold tracking-tight text-fg">
                  {GROUP_META[group].label}
                </h3>
                <span className="text-xs text-fg-3">{GROUP_META[group].blurb}</span>
              </div>
              <motion.div
                layout={!reduced}
                className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  {items.map((status) => (
                    <AchievementTile
                      key={status.def.id}
                      status={status}
                      light={light}
                      onOpen={() => setOpenId(status.def.id)}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            </div>
          ))}
        </div>
      )}

      {detail && (
        <AchievementDetail status={detail} light={light} open={openId !== null} onClose={() => setOpenId(null)} />
      )}
    </section>
  );
}
