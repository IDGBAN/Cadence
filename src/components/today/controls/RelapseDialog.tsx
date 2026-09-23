// past days default to noon on that day, so backfilling doesn't reset the live counter
import { useEffect, useState } from 'react';
import { HeartCrack } from 'lucide-react';
import type { DayKey, Habit } from '@/types';
import { Button, Input, Modal, Textarea } from '@/components/ui';
import { formatDayShort, fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/dates';
import { formatElapsed } from '@/lib/format';
import { relapseWithFeedback } from '@/lib/logActions';
import { defaultRelapseAt } from '@/components/log/quitDay';
import { useSettings } from '@/store/hooks';

export interface RelapseDialogProps {
  habit: Habit;
  open: boolean;
  onClose: () => void;
  day: DayKey;
  today: DayKey;
  currentMs: number;
}

export function RelapseDialog({ habit, open, onClose, day, today, currentMs }: RelapseDialogProps) {
  const { dayStartHour } = useSettings();
  const [note, setNote] = useState('');
  const [when, setWhen] = useState('');
  const isToday = day === today;

  useEffect(() => {
    if (!open) return;
    setNote('');
    setWhen(toDateTimeLocalValue(defaultRelapseAt(day, dayStartHour)));
  }, [open, day, dayStartHour]);

  const submit = () => {
    const now = new Date();
    const parsed = when ? new Date(when) : now;
    const at = Number.isFinite(parsed.getTime()) && parsed.getTime() <= now.getTime() ? parsed : now;
    relapseWithFeedback(habit.id, fromDateTimeLocalValue(toDateTimeLocalValue(at.toISOString())), note.trim() || undefined);
    onClose();
  };

  const description = !isToday
    ? `This goes on ${formatDayShort(day)}, and your clean count is worked out again from there.`
    : currentMs > 0
      ? `Your ${formatElapsed(currentMs, 'compact')} run is saved as an attempt and a new one starts now.`
      : 'A new run starts now. Owning up to it is the hard part.';

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      icon={<HeartCrack aria-hidden className="text-accent" />}
      title="Log a slip"
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Never mind
          </Button>
          <Button variant="primary" onClick={submit} data-autofocus>
            Log it and restart
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          type="datetime-local"
          label="When did it happen?"
          value={when}
          max={toDateTimeLocalValue(new Date().toISOString())}
          onChange={(e) => setWhen(e.target.value)}
          hint={
            isToday
              ? 'Set to now. You can pick an earlier time and the counter will start from there.'
              : `Set to midday on ${formatDayShort(day)}. Change it if you remember the time.`
          }
        />
        <Textarea
          label="Note (optional)"
          placeholder="What led to it, how you felt, what might help next time…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          autoGrow
          maxRows={6}
        />
      </div>
    </Modal>
  );
}
