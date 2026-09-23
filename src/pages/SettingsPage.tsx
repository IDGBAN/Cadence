import { CalendarDays, Clock, ListChecks, Palette, PartyPopper, User, Volume2 } from 'lucide-react';
import type { ThemeName } from '@/types';
import {
  formatDayLong,
  formatTime,
  greeting,
  logicalToday,
  orderedWeekdays,
  relativeDayLabel,
  toDayKey,
} from '@/lib/dates';
import { confettiCelebration, playSound } from '@/lib/feedback';
import { useNow, useSettings } from '@/store/hooks';
import { useStore } from '@/store/store';
import { Button, Input, Segmented, Select, Switch, cn } from '@/components/ui';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { AboutSection } from '@/components/settings/AboutSection';
import { DataSection } from '@/components/settings/DataSection';
import { SettingsNav, SettingsQuickNav } from '@/components/settings/SettingsNav';
import { SettingDivider, SettingNote, SettingRow, SettingsSection } from '@/components/settings/SettingsSection';
import { AccentPicker, ThemePicker } from '@/components/settings/ThemePicker';

const NAME_MAX_LENGTH = 24;

const DAY_START_OPTIONS = [0, 1, 2, 3, 4, 5, 6].map((hour) => ({
  value: hour,
  label: hour === 0 ? 'Midnight' : `${hour}:00 AM`,
  description:
    hour === 0
      ? 'Follow the calendar exactly'
      : hour === 4
        ? 'Recommended for night owls'
        : `Logs before ${hour}:00 AM count for the day before`,
}));

export default function SettingsPage() {
  const settings = useSettings();
  const updateSettings = useStore((s) => s.updateSettings);
  const now = useNow(30_000);

  const logicalDay = logicalToday(settings.dayStartHour, now);
  const calendarDay = toDayKey(now);
  const weekdays = orderedWeekdays(settings.weekStartsOn);
  const displayName = settings.userName.trim();

  return (
    <Page width="default">
      <PageHeader
        eyebrow="Preferences"
        title="Settings"
        subtitle="How Cadence looks, when your day starts and what happens to your data."
      />

      <SettingsQuickNav className="mb-5 lg:hidden" />

      <div className="lg:grid lg:grid-cols-[180px_minmax(0,1fr)] lg:items-start lg:gap-10">
        <div className="hidden lg:block">
          <div className="sticky top-8">
            <SettingsNav />
          </div>
        </div>

        <div className="space-y-5 md:space-y-6">
          <SettingsSection
            id="profile"
            title="Profile"
            subtitle="Just a name for the greeting. It stays on this device."
            icon={<User aria-hidden="true" />}
          >
            <SettingRow
              label={<label htmlFor="settings-name">Your name</label>}
              description="Optional. Leave it empty for a plain greeting."
              control={
                <Input
                  id="settings-name"
                  value={settings.userName}
                  onChange={(e) => updateSettings({ userName: e.target.value.slice(0, NAME_MAX_LENGTH) })}
                  maxLength={NAME_MAX_LENGTH}
                  placeholder="What should we call you?"
                  autoComplete="given-name"
                  spellCheck={false}
                  className="sm:w-64"
                />
              }
            >
              <SettingNote icon={<span aria-hidden="true">👋</span>}>
                On Today you’ll see:{' '}
                <span className="font-medium text-fg">
                  {greeting(now)}
                  {displayName === '' ? '' : `, ${displayName}`}.
                </span>
              </SettingNote>
            </SettingRow>
          </SettingsSection>

          <SettingsSection
            id="appearance"
            title="Appearance"
            subtitle="Four themes and six accents. Changes apply instantly."
            icon={<Palette aria-hidden="true" />}
          >
            <SettingRow label="Theme" description="Previews use each theme’s real colors.">
              <ThemePicker
                value={settings.theme}
                accent={settings.accent}
                onChange={(theme: ThemeName) => updateSettings({ theme })}
              />
            </SettingRow>

            <SettingDivider />

            <SettingRow label="Accent" description="Used for buttons, progress, focus rings and celebrations.">
              <AccentPicker
                value={settings.accent}
                theme={settings.theme}
                onChange={(accent) => updateSettings({ accent })}
              />
            </SettingRow>

            <SettingDivider />

            <SettingRow
              label="Reduce motion"
              description="Turns off springy animations, drifting glows and confetti. Your system’s reduced motion setting also applies."
              control={
                <Switch
                  checked={settings.reduceMotion}
                  onChange={(reduceMotion) => updateSettings({ reduceMotion })}
                  aria-label="Reduce motion"
                />
              }
            />
          </SettingsSection>

          <SettingsSection
            id="days"
            title="Days & weeks"
            subtitle="Where weeks begin and when a new day starts for logging."
            icon={<CalendarDays aria-hidden="true" />}
          >
            <SettingRow
              label="Week starts on"
              description="Affects weekly goals, the week strip and every calendar in the app."
              control={
                <Segmented
                  value={settings.weekStartsOn}
                  onChange={(weekStartsOn) => updateSettings({ weekStartsOn })}
                  options={[
                    { value: 0 as const, label: 'Sunday' },
                    { value: 1 as const, label: 'Monday' },
                  ]}
                  aria-label="Week starts on"
                />
              }
            >
              <div className="flex gap-1.5" aria-hidden="true">
                {weekdays.map(([index, label], position) => (
                  <span
                    key={index}
                    className={cn(
                      'flex h-9 flex-1 items-center justify-center rounded-lg border text-[11px] font-semibold uppercase tracking-wide',
                      position === 0
                        ? 'border-accent/40 bg-accent/12 text-accent'
                        : 'border-line bg-surface-2 text-fg-3',
                    )}
                  >
                    {label.slice(0, 2)}
                  </span>
                ))}
              </div>
            </SettingRow>

            <SettingDivider />

            <SettingRow
              label="A new day starts at"
              description="Log at 1am and it still counts for yesterday. Pick the hour your day actually ends."
              control={
                <Select
                  value={settings.dayStartHour}
                  onChange={(dayStartHour) => updateSettings({ dayStartHour })}
                  options={DAY_START_OPTIONS}
                  aria-label="A new day starts at"
                  className="sm:w-56"
                />
              }
            >
              <SettingNote icon={<Clock aria-hidden="true" />}>
                It’s {formatTime(now)} right now, so anything you log counts for{' '}
                <span className="font-medium text-fg">
                  {relativeDayLabel(logicalDay, calendarDay).toLowerCase()}, {formatDayLong(logicalDay)}
                </span>
                .
              </SettingNote>
            </SettingRow>
          </SettingsSection>

          <SettingsSection
            id="feedback"
            title="Feedback"
            subtitle="Sounds and confetti when you check things off."
            icon={<Volume2 aria-hidden="true" />}
          >
            <SettingRow
              label="Sounds"
              description="Soft chimes when you complete a habit, level up or earn an achievement."
              control={
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!settings.soundEnabled}
                    onClick={() => playSound('complete')}
                  >
                    Test sound
                  </Button>
                  <Switch
                    checked={settings.soundEnabled}
                    onChange={(soundEnabled) => updateSettings({ soundEnabled })}
                    aria-label="Sounds"
                  />
                </div>
              }
            />

            <SettingDivider />

            <SettingRow
              label="Confetti"
              description="Bursts for perfect days, level-ups and big milestones. Skipped when motion is reduced."
              control={
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<PartyPopper aria-hidden="true" />}
                    disabled={!settings.confettiEnabled}
                    onClick={() => confettiCelebration('perfect')}
                  >
                    Test
                  </Button>
                  <Switch
                    checked={settings.confettiEnabled}
                    onChange={(confettiEnabled) => updateSettings({ confettiEnabled })}
                    aria-label="Confetti"
                  />
                </div>
              }
            />
          </SettingsSection>

          <SettingsSection
            id="today"
            title="Today view"
            subtitle="How your daily list is arranged."
            icon={<ListChecks aria-hidden="true" />}
          >
            <SettingRow
              label="Group by category"
              description="Sleep, Nutrition, Fitness… Turn it off for one flat list in your own order."
              control={
                <Switch
                  checked={settings.todayGroupBy === 'category'}
                  onChange={(grouped) => updateSettings({ todayGroupBy: grouped ? 'category' : 'none' })}
                  aria-label="Group by category"
                />
              }
            />

            <SettingDivider />

            <SettingRow
              label="Hide completed habits"
              description="Only show what’s left to do on Today."
              control={
                <Switch
                  checked={settings.hideCompleted}
                  onChange={(hideCompleted) => updateSettings({ hideCompleted })}
                  aria-label="Hide completed habits"
                />
              }
            />
          </SettingsSection>

          <DataSection />

          <AboutSection />
        </div>
      </div>
    </Page>
  );
}
