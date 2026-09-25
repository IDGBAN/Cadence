import { useMemo } from 'react';
import { Trophy } from 'lucide-react';
import { Badge } from '@/components/ui';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { useAchievements, useLevel, useXp } from '@/store/rewardHooks';
import { formatNumber } from '@/lib/format';
import { AchievementCase } from '@/components/rewards/AchievementCase';
import { LevelRoadmap } from '@/components/rewards/LevelRoadmap';
import { QuitLadders } from '@/components/rewards/QuitLadders';
import { RewardsHero } from '@/components/rewards/RewardsHero';
import { StreakWall } from '@/components/rewards/StreakWall';
import { XpChart } from '@/components/rewards/XpChart';
import { XpExplainer } from '@/components/rewards/XpExplainer';

export default function RewardsPage() {
  const xp = useXp();
  const level = useLevel();
  const achievements = useAchievements();

  const unlocked = useMemo(() => achievements.filter((a) => a.unlocked).length, [achievements]);

  return (
    <Page width="wide">
      <PageHeader
        eyebrow={
          <>
            <Trophy className="size-3.5" aria-hidden />
            Progress &amp; rewards
          </>
        }
        title="Rewards"
        subtitle="The XP, levels and badges you've earned by logging your habits, and what comes next."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="xp" size="md">
              {formatNumber(xp.total, 0)} XP
            </Badge>
            <Badge tone="accent" size="md">
              Level {level.level}
            </Badge>
            <Badge tone="neutral" size="md">
              {unlocked} / {achievements.length} badges
            </Badge>
          </div>
        }
      />

      <div className="flex flex-col gap-6 md:gap-8">
        <RewardsHero />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-6">
          <XpChart />
          <LevelRoadmap />
        </div>

        <AchievementCase />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
          <StreakWall />
          <QuitLadders />
        </div>

        <XpExplainer />
      </div>
    </Page>
  );
}
