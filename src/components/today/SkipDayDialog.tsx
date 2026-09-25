import { useEffect, useState } from 'react';
import type { DayKey } from '@/types';
import { Button, Chip, Modal } from '@/components/ui';
import { formatDayShort } from '@/lib/dates';
import { pluralize } from '@/lib/format';

const REASONS = ['Sick', 'Rest day', 'Travel', 'Busy'] as const;

export interface SkipDayDialogProps {
  open: boolean;
  day: DayKey;
  isToday: boolean;
  count: number;
  onCancel: () => void;
  onConfirm: (reason: string | undefined) => void;
}

export function SkipDayDialog({ open, day, isToday, count, onCancel, onConfirm }: SkipDayDialogProps) {
  const [reason, setReason] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (open) setReason(undefined);
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="sm"
      icon="🛌"
      title={isToday ? 'Take the rest of today off?' : `Take ${formatDayShort(day)} off?`}
      description={
        `Skips the ${pluralize(count, 'habit')} still open on ${formatDayShort(day)} so a sick day or rest ` +
        "day won't break your streaks. Anything you already logged stays, and Undo brings everything back."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Keep them
          </Button>
          <Button data-autofocus onClick={() => onConfirm(reason)}>
            Skip {pluralize(count, 'habit')}
          </Button>
        </>
      }
    >
      <fieldset>
        <legend className="eyebrow mb-2.5">Why? (optional)</legend>
        <div className="flex flex-wrap gap-2">
          {REASONS.map((r) => (
            <Chip key={r} selected={reason === r} aria-pressed={reason === r} onClick={() => setReason(reason === r ? undefined : r)}>
              {r}
            </Chip>
          ))}
        </div>
        <p className="mt-2.5 text-xs leading-relaxed text-fg-3">
          Saved as a note on each skipped habit so you remember why later.
        </p>
      </fieldset>
    </Modal>
  );
}
