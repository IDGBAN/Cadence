import { Fragment } from 'react';
import { Kbd, Modal } from '@/components/ui';
import { useShell } from './shellStore';
import { SHORTCUT_GROUPS, type KeySequence, type ShortcutGroup } from './shortcuts';

function Combo({ sequence }: { sequence: KeySequence }) {
  return (
    <span className="flex items-center gap-1.5">
      {sequence.map((stroke, si) => (
        <Fragment key={si}>
          {si > 0 && <span className="text-[11px] text-fg-4">then</span>}
          <span className="flex items-center gap-1">
            {stroke.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </span>
        </Fragment>
      ))}
    </span>
  );
}

function GroupSection({ group }: { group: ShortcutGroup }) {
  const headingId = `shortcuts-${group.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="eyebrow mb-1.5">
        {group.title}
      </h3>
      <ul className="divide-y divide-line">
        {group.items.map((item) => (
          <li key={item.label} className="flex min-h-11 items-center justify-between gap-4 py-2">
            <span className="text-sm text-fg-2">{item.label}</span>
            <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
              {item.combos.map((sequence, ci) => (
                <Fragment key={ci}>
                  {ci > 0 && <span className="text-[11px] text-fg-4">or</span>}
                  <Combo sequence={sequence} />
                </Fragment>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ShortcutsModal() {
  const open = useShell((s) => s.shortcutsOpen);
  const setOpen = useShell((s) => s.setShortcutsOpen);

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Keyboard shortcuts"
      description="Get around without the mouse."
      icon="⌨️"
      size="lg"
    >
      <div className="grid gap-x-10 gap-y-7 md:grid-cols-2">
        {SHORTCUT_GROUPS.map((group) => (
          <GroupSection key={group.title} group={group} />
        ))}
      </div>
    </Modal>
  );
}
