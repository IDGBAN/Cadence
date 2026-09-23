import { useState } from 'react';
import { create } from 'zustand';
import { TriangleAlert } from 'lucide-react';
import { Button } from './Button';
import { Kbd } from './Chip';
import { Input } from './inputs/Input';
import { Modal } from './Modal';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  icon?: string;
  /** The user has to type this before confirming. */
  requireText?: string;
}

interface ConfirmRequest {
  id: number;
  options: ConfirmOptions;
  resolve: (confirmed: boolean) => void;
}

// queued so two confirms never stack
const useConfirmQueue = create<{ queue: ConfirmRequest[] }>()(() => ({ queue: [] }));
let nextId = 1;

function settle(id: number, confirmed: boolean) {
  const request = useConfirmQueue.getState().queue.find((r) => r.id === id);
  if (!request) return;
  useConfirmQueue.setState((s) => ({ queue: s.queue.filter((r) => r.id !== id) }));
  request.resolve(confirmed);
}

/** Resolves true on confirm. Needs <ConfirmHost/> mounted. */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const request: ConfirmRequest = { id: nextId++, options: opts, resolve };
    useConfirmQueue.setState((s) => ({ queue: [...s.queue, request] }));
  });
}

export function ConfirmHost() {
  const head = useConfirmQueue((s) => s.queue[0]);
  // keep the last request so its content stays visible while the modal animates out
  const [shown, setShown] = useState<ConfirmRequest | undefined>(head);
  const [typed, setTyped] = useState('');
  if (head && head !== shown) {
    setShown(head);
    setTyped('');
  }

  const request = head ?? shown;
  if (!request) return null;

  const { title, description, confirmLabel, cancelLabel, tone = 'default', icon, requireText } = request.options;
  const danger = tone === 'danger';
  const matches = !requireText || typed.trim() === requireText;
  const active = Boolean(head);

  const cancel = () => {
    if (head) settle(head.id, false);
  };
  const confirm = () => {
    if (head && matches) settle(head.id, true);
  };

  return (
    <Modal
      open={active}
      onClose={cancel}
      size="sm"
      title={title}
      description={description}
      icon={icon ?? (danger ? <TriangleAlert className="text-danger" /> : undefined)}
      hideClose
      footer={
        <>
          <Button variant="secondary" onClick={cancel} data-autofocus={danger && !requireText ? true : undefined}>
            {cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={confirm}
            disabled={!matches}
            data-autofocus={!danger && !requireText ? true : undefined}
          >
            {confirmLabel ?? 'Confirm'}
          </Button>
        </>
      }
    >
      {requireText ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            confirm();
          }}
        >
          <Input
            label={
              <span className="inline-flex flex-wrap items-center gap-1.5">
                Type <Kbd className="h-6 px-2 text-xs text-fg">{requireText}</Kbd> to confirm
              </span>
            }
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            data-autofocus
            aria-invalid={typed.length > 0 && !matches ? true : undefined}
          />
        </form>
      ) : undefined}
    </Modal>
  );
}
