import { useEffect, useState } from 'react';
import type { Category } from '@/types';
import { pluralize } from '@/lib/format';
import { actions } from '@/store/store';
import { toast } from '@/store/ui';
import { undoAction } from '@/lib/logActions';
import { Button, EmojiPicker, Input, Modal, Popover, Select } from '@/components/ui';

interface CategoryFormModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  initialName: string;
  initialIcon: string;
  onSubmit: (value: { name: string; icon: string }) => void;
  onClose: () => void;
}

function CategoryFormModal({
  open,
  title,
  description,
  confirmLabel,
  initialName,
  initialIcon,
  onSubmit,
  onClose,
}: CategoryFormModalProps) {
  const [name, setName] = useState(initialName);
  const [icon, setIcon] = useState(initialIcon);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setIcon(initialIcon);
  }, [open, initialName, initialIcon]);

  const trimmed = name.trim();
  const valid = trimmed !== '';

  const submit = () => {
    if (!valid) return;
    onSubmit({ name: trimmed, icon });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      description={description}
      icon={icon}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="flex items-end gap-2">
        <Popover
          placement="bottom-start"
          aria-label="Choose a category icon"
          className="w-[min(23rem,calc(100vw-2.5rem))]"
          trigger={
            <button
              type="button"
              aria-label={`Category icon: ${icon}. Choose another`}
              className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-xl leading-none transition-colors hover:border-line-strong hover:bg-surface-3"
            >
              <span aria-hidden>{icon}</span>
            </button>
          }
        >
          {(close) => (
            <EmojiPicker
              value={icon}
              onChange={(next) => {
                setIcon(next);
                close();
              }}
            />
          )}
        </Popover>

        <Input
          label="Name"
          data-autofocus
          className="min-w-0 flex-1"
          value={name}
          maxLength={40}
          autoComplete="off"
          placeholder="Mornings"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            submit();
          }}
        />
      </div>
    </Modal>
  );
}

export interface CategoryCreateModalProps {
  open: boolean;
  onClose: () => void;
}

export function CategoryCreateModal({ open, onClose }: CategoryCreateModalProps) {
  return (
    <CategoryFormModal
      open={open}
      title="New category"
      description="Categories group your habits on Today and on the Habits page."
      confirmLabel="Create"
      initialName=""
      initialIcon="📁"
      onClose={onClose}
      onSubmit={({ name, icon }) => {
        const created = actions().addCategory({ name, icon });
        toast({ title: `${created.name} added`, description: 'Move habits into it any time.', icon: created.icon, tone: 'success' });
        onClose();
      }}
    />
  );
}

export interface CategoryEditModalProps {
  category: Category | null;
  onClose: () => void;
}

export function CategoryEditModal({ category, onClose }: CategoryEditModalProps) {
  return (
    <CategoryFormModal
      open={category !== null}
      title="Edit category"
      description="Rename it or give it a different emoji."
      confirmLabel="Save"
      initialName={category?.name ?? ''}
      initialIcon={category?.icon ?? '📁'}
      onClose={onClose}
      onSubmit={({ name, icon }) => {
        if (!category) return;
        actions().updateCategory(category.id, { name, icon });
        toast({ title: `${name} updated`, icon, tone: 'success' });
        onClose();
      }}
    />
  );
}

export interface CategoryDeleteModalProps {
  category: Category | null;
  categories: Category[];
  // active and archived
  habitCount: number;
  onClose: () => void;
}

export function CategoryDeleteModal({ category, categories, habitCount, onClose }: CategoryDeleteModalProps) {
  const others = categories.filter((c) => c.id !== category?.id);
  const [moveTo, setMoveTo] = useState('');

  useEffect(() => {
    if (!category) return;
    setMoveTo(categories.find((c) => c.id !== category.id)?.id ?? '');
  }, [category, categories]);

  const destination = others.find((c) => c.id === moveTo);
  const canDelete = others.length > 0 && (habitCount === 0 || destination !== undefined);

  const remove = () => {
    if (!category || !canDelete) return;
    const name = category.name;
    actions().deleteCategory(category.id, destination?.id);
    toast({
      title: `${name} deleted`,
      description:
        habitCount > 0 && destination
          ? `${pluralize(habitCount, 'habit')} moved to ${destination.name}.`
          : 'The category was empty.',
      tone: 'danger',
      icon: '🗑️',
      action: undoAction(),
    });
    onClose();
  };

  return (
    <Modal
      open={category !== null}
      onClose={onClose}
      size="sm"
      title={`Delete ${category?.name ?? 'category'}?`}
      description="Deleting a category doesn’t delete its habits. They move to another one."
      icon={category?.icon ?? '🗑️'}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={remove} disabled={!canDelete}>
            Delete category
          </Button>
        </div>
      }
    >
      {others.length === 0 ? (
        <p className="text-sm leading-relaxed text-fg-3">
          This is your only category, so it can’t be deleted. Create another one first so your habits have
          somewhere to go.
        </p>
      ) : habitCount === 0 ? (
        <p className="text-sm leading-relaxed text-fg-3">This category is empty, so nothing else changes.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-fg-3">
            {pluralize(habitCount, 'habit')} {habitCount === 1 ? 'lives' : 'live'} here. Pick where{' '}
            {habitCount === 1 ? 'it' : 'they'} should go.
          </p>
          <Select
            label="Move habits to"
            value={moveTo}
            onChange={setMoveTo}
            options={others.map((c) => ({ value: c.id, label: c.name, icon: <span aria-hidden>{c.icon}</span> }))}
          />
        </div>
      )}
    </Modal>
  );
}
