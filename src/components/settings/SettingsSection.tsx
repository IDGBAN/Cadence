import type { ReactNode } from 'react';
import { Card, SectionHeader, cn } from '@/components/ui';

export interface SettingsSectionProps {
  // must match an id in SETTINGS_SECTIONS, the nav and scroll spy use it
  id: string;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SettingsSection({ id, title, subtitle, icon, action, children, className }: SettingsSectionProps) {
  const headingId = `${id}-heading`;
  return (
    <section
      id={id}
      tabIndex={-1}
      aria-labelledby={headingId}
      className={cn(
        'scroll-mt-[calc(env(safe-area-inset-top)+5.5rem)] focus:outline-none md:scroll-mt-8',
        className,
      )}
    >
      <Card padding="lg">
        <SectionHeader
          as="h2"
          icon={icon}
          action={action}
          subtitle={subtitle}
          title={<span id={headingId}>{title}</span>}
        />
        <div className="mt-6 space-y-6">{children}</div>
      </Card>
    </section>
  );
}

export interface SettingRowProps {
  label: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function SettingRow({ label, description, control, children, className }: SettingRowProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <div className="min-w-0">
          <div className="text-sm font-medium leading-snug text-fg">{label}</div>
          {description !== undefined && description !== null && (
            <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-fg-3">{description}</p>
          )}
        </div>
        {control !== undefined && control !== null && (
          <div className="flex shrink-0 items-center justify-start gap-2 sm:justify-end">{control}</div>
        )}
      </div>
      {children !== undefined && children !== null && <div className="mt-4">{children}</div>}
    </div>
  );
}

export function SettingDivider({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('h-px bg-line', className)} />;
}

export interface SettingNoteProps {
  icon?: ReactNode;
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'warning';
  className?: string;
}

const noteTones = {
  neutral: 'border-line bg-surface-2 text-fg-3',
  accent: 'border-accent/25 bg-accent/10 text-fg-2',
  warning: 'border-warning/30 bg-warning/10 text-fg-2',
} as const;

export function SettingNote({ icon, children, tone = 'neutral', className }: SettingNoteProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] leading-relaxed',
        noteTones[tone],
        className,
      )}
    >
      {icon !== undefined && icon !== null && (
        <span className="mt-px flex shrink-0 items-center [&_svg]:size-4" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
