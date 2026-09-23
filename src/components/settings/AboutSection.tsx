import { Info, Keyboard, Lock, Sparkles } from 'lucide-react';
import { Badge, Button, Kbd } from '@/components/ui';
import { BrandMark } from '@/components/layout/BrandMark';
import { openShortcuts } from '@/components/layout/shellStore';
import { APP_NAME } from '@/components/layout/routeMeta';
import { actions } from '@/store/store';
import { toast } from '@/store/ui';
import { SettingDivider, SettingNote, SettingRow, SettingsSection } from './SettingsSection';

export const APP_VERSION = '1.0.0';

const CREDITS = [
  { label: 'React 19 + TypeScript', detail: 'app' },
  { label: 'Tailwind CSS v4', detail: 'styling' },
  { label: 'Motion', detail: 'animation' },
  { label: 'Recharts', detail: 'charts' },
  { label: 'Lucide', detail: 'icons' },
  { label: 'Bricolage Grotesque + Plus Jakarta Sans', detail: 'type' },
];

export function AboutSection() {
  const replayWelcome = () => {
    actions().setOnboarded(false);
    toast({ title: 'Welcome tour restarted', description: 'Your habits and logs are untouched.', icon: '👋' });
  };

  return (
    <SettingsSection
      id="about"
      title="About"
      subtitle="A free habit tracker that works offline."
      icon={<Info aria-hidden="true" />}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex size-16 shrink-0 items-center justify-center rounded-[20px] border border-line bg-surface-2 shadow-card">
          <BrandMark size={38} glow />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl font-semibold tracking-tight text-fg">{APP_NAME}</h3>
            <Badge tone="accent">v{APP_VERSION}</Badge>
          </div>
          <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-fg-3">
            Log your habits in a tap and watch streaks and correlations build up over months.
          </p>
        </div>
      </div>

      <SettingNote tone="accent" icon={<Lock aria-hidden="true" />}>
        <strong className="font-semibold text-fg">Your data stays on this device.</strong> There is no account, server
        or analytics. Everything is stored in this browser, and backups are plain files you keep.
      </SettingNote>

      <SettingDivider />

      <SettingRow
        label="Keyboard shortcuts"
        description={
          <>
            Log, navigate and search without the mouse. Press <Kbd>?</Kbd> anywhere to open this list.
          </>
        }
        control={
          <Button variant="secondary" icon={<Keyboard aria-hidden="true" />} onClick={openShortcuts}>
            View shortcuts
          </Button>
        }
      />

      <SettingDivider />

      <SettingRow
        label="Replay the welcome tour"
        description="Go through the intro again: picking habits, themes and how each habit type is logged."
        control={
          <Button variant="secondary" icon={<Sparkles aria-hidden="true" />} onClick={replayWelcome}>
            Show welcome
          </Button>
        }
      />

      <SettingDivider />

      <SettingRow label="Built with" description="The open-source libraries behind the app.">
        <ul className="flex flex-wrap gap-2">
          {CREDITS.map((credit) => (
            <li
              key={credit.label}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-[12px] text-fg-2"
            >
              <span>{credit.label}</span>
              <span className="text-fg-4">{credit.detail}</span>
            </li>
          ))}
        </ul>
      </SettingRow>
    </SettingsSection>
  );
}
