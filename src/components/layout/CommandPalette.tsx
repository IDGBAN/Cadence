import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight, CornerDownLeft, Download, Keyboard, Moon, Plus, Redo2, Search, SearchX, Sun, Undo2, X } from 'lucide-react';
import type { Habit } from '@/types';
import { Button, HabitIcon, Kbd } from '@/components/ui';
import { useStore } from '@/store/store';
import { useUI } from '@/store/ui';
import { useActiveHabits, useCategories, useDayOverview, useToday } from '@/store/hooks';
import { formatGoal } from '@/lib/format';
import { NAV_ITEMS } from './nav';
import { fuzzyMatch } from './fuzzy';
import { isUpNextToday } from './upNext';
import { isLightTheme, toggleLightDark } from './appearance';
import { exportBackupWithToast } from '@/lib/dataActions';
import { redoWithToast, undoWithToast } from './commands';
import { MOD_KEY, SHIFT_KEY } from './platform';
import { openShortcuts } from './shellStore';

type ItemVisual = { kind: 'habit'; habit: Habit } | { kind: 'icon'; icon: LucideIcon };

interface PaletteItem {
  id: string;
  label: string;
  description?: string;
  keywords: string[];
  visual: ItemVisual;
  shortcut?: string[];
  hint?: string;
  run: () => void;
  secondary?: { label: string; run: () => void };
  // undo/redo only make sense in the moment, so don't keep them in Recent
  transient?: boolean;
}

interface ResultRow {
  item: PaletteItem;
  indices: number[];
}

interface ResultGroup {
  id: string;
  label: string;
  rows: ResultRow[];
}

const LISTBOX_ID = 'command-palette-listbox';
const optionId = (index: number) => `command-palette-option-${index}`;

const RECENT_KEY = 'habit-palette-recent';
const RECENT_MAX = 5;

function readRecent(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function pushRecent(id: string): void {
  try {
    const next = [id, ...readRecent().filter((v) => v !== id)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // storage can be blocked, recents are optional
  }
}

const KEYWORD_WEIGHT = 0.6;

function scoreItem(query: string, item: PaletteItem): (ResultRow & { score: number }) | null {
  const label = fuzzyMatch(query, item.label);
  let score = label ? label.score : -Infinity;
  for (const keyword of item.keywords) {
    const hit = fuzzyMatch(query, keyword, { contiguous: true });
    if (hit) score = Math.max(score, hit.score * KEYWORD_WEIGHT);
  }
  if (score === -Infinity) return null;
  return { item, indices: label?.indices ?? [], score };
}

function rankGroup(query: string, id: string, label: string, items: PaletteItem[]) {
  const rows = items
    .map((item) => scoreItem(query, item))
    .filter((row): row is ResultRow & { score: number } => row !== null)
    .sort((a, b) => b.score - a.score);
  return { id, label, rows, best: rows[0]?.score ?? -Infinity };
}

function Highlighted({ text, indices }: { text: string; indices: number[] }) {
  if (indices.length === 0) return <>{text}</>;
  const matched = new Set(indices);
  const parts: ReactNode[] = [];
  let run = '';
  let runMatched = matched.has(0);
  const flush = (key: number) => {
    if (!run) return;
    parts.push(
      runMatched ? (
        <mark key={key} className="rounded-[3px] bg-transparent font-semibold text-accent">
          {run}
        </mark>
      ) : (
        <Fragment key={key}>{run}</Fragment>
      ),
    );
    run = '';
  };
  for (let i = 0; i < text.length; i++) {
    const isMatch = matched.has(i);
    if (isMatch !== runMatched) {
      flush(i);
      runMatched = isMatch;
    }
    run += text[i];
  }
  flush(text.length);
  return <>{parts}</>;
}

function RowVisual({ visual, active }: { visual: ItemVisual; active: boolean }) {
  if (visual.kind === 'habit') return <HabitIcon habit={visual.habit} size="sm" />;
  const Icon = visual.icon;
  return (
    <span
      className={clsx(
        'flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors duration-100',
        active ? 'border-accent/30 bg-accent/15 text-accent' : 'border-line bg-surface-2 text-fg-3',
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
    </span>
  );
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const habits = useActiveHabits();
  const categories = useCategories();
  const today = useToday();
  const overview = useDayOverview(today);
  const canUndo = useStore((s) => s.canUndo);
  const canRedo = useStore((s) => s.canRedo);
  const light = useStore((s) => isLightTheme(s.data.settings.theme));
  const openLogEditor = useUI((s) => s.openLogEditor);
  const openHabitEditor = useUI((s) => s.openHabitEditor);
  // false during the exit animation, ignore input then
  const isPresent = useIsPresent();

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recent] = useState(readRecent);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const habitItems = useMemo<PaletteItem[]>(() => {
    const categoryById = new Map(categories.map((c) => [c.id, c]));
    return habits.map((habit) => {
      const category = categoryById.get(habit.categoryId);
      return {
        id: `habit:${habit.id}`,
        label: habit.name,
        description: [category ? `${category.icon} ${category.name}` : null, formatGoal(habit)].filter(Boolean).join(' · '),
        keywords: [category?.name ?? '', habit.description, habit.unit].filter(Boolean),
        visual: { kind: 'habit', habit },
        hint: habit.type === 'quit' ? 'Open log' : 'Log today',
        run: () => openLogEditor(habit.id, today),
        secondary: { label: `Open ${habit.name} details`, run: () => navigate(`/habits/${habit.id}`) },
      };
    });
  }, [habits, categories, today, openLogEditor, navigate]);

  const pageItems = useMemo<PaletteItem[]>(
    () =>
      NAV_ITEMS.map((nav) => ({
        id: `page:${nav.key}`,
        label: nav.label,
        description: nav.description,
        keywords: nav.keywords,
        visual: { kind: 'icon', icon: nav.icon },
        shortcut: ['G', nav.goKey.toUpperCase()],
        hint: 'Go',
        run: () => navigate(nav.to),
      })),
    [navigate],
  );

  const actionItems = useMemo<PaletteItem[]>(() => {
    // keep "New habit" first, it's also the no-results fallback
    const items: PaletteItem[] = [
      {
        id: 'action:new-habit',
        label: 'New habit',
        description: 'Start from scratch or a template',
        keywords: ['add', 'create', 'template'],
        visual: { kind: 'icon', icon: Plus },
        shortcut: ['N'],
        run: () => openHabitEditor(null),
      },
    ];
    if (canUndo) {
      items.push({
        id: 'action:undo',
        label: 'Undo',
        description: 'Undo the last change',
        keywords: ['revert', 'back'],
        visual: { kind: 'icon', icon: Undo2 },
        shortcut: [MOD_KEY, 'Z'],
        run: undoWithToast,
        transient: true,
      });
    }
    if (canRedo) {
      items.push({
        id: 'action:redo',
        label: 'Redo',
        description: 'Bring back what you undid',
        keywords: ['again', 'forward'],
        visual: { kind: 'icon', icon: Redo2 },
        shortcut: [MOD_KEY, SHIFT_KEY, 'Z'],
        run: redoWithToast,
        transient: true,
      });
    }
    items.push(
      {
        id: 'action:toggle-theme',
        label: light ? 'Switch to dark theme' : 'Switch to light theme',
        description: light ? 'Easier on the eyes at night' : 'Better in bright light',
        keywords: ['theme', 'appearance', 'mode', 'dark', 'light', 'daylight', 'night'],
        visual: { kind: 'icon', icon: light ? Moon : Sun },
        run: toggleLightDark,
      },
      {
        id: 'action:export-backup',
        label: 'Export backup',
        description: 'Save all your data as a JSON file',
        keywords: ['download', 'save', 'json', 'data', 'backup'],
        visual: { kind: 'icon', icon: Download },
        run: exportBackupWithToast,
      },
      {
        id: 'action:shortcuts',
        label: 'Keyboard shortcuts',
        description: 'Show all shortcuts',
        keywords: ['keys', 'hotkeys', 'help'],
        visual: { kind: 'icon', icon: Keyboard },
        shortcut: ['?'],
        run: openShortcuts,
      },
    );
    return items;
  }, [canUndo, canRedo, light, openHabitEditor]);

  const newHabitItem = actionItems[0];

  const groups = useMemo<ResultGroup[]>(() => {
    const q = query.trim();
    const toRows = (items: PaletteItem[]): ResultRow[] => items.map((item) => ({ item, indices: [] }));

    if (!q) {
      const all = [...habitItems, ...pageItems, ...actionItems];
      const byId = new Map(all.map((item) => [item.id, item]));
      const used = new Set<string>();
      const take = (items: PaletteItem[]) => {
        const fresh = items.filter((item) => !used.has(item.id));
        fresh.forEach((item) => used.add(item.id));
        return fresh;
      };

      const recentItems = take(recent.map((id) => byId.get(id)).filter((item): item is PaletteItem => !!item).slice(0, 4));
      const upNextIds = new Set(
        overview.items.filter(isUpNextToday).map((entry) => `habit:${entry.habit.id}`),
      );
      const upNext = take(habitItems.filter((item) => upNextIds.has(item.id)).slice(0, 5));

      const out: ResultGroup[] = [
        { id: 'recent', label: 'Recent', rows: toRows(recentItems) },
        { id: 'up-next', label: 'Up next today', rows: toRows(upNext) },
        { id: 'pages', label: 'Pages', rows: toRows(take(pageItems)) },
        { id: 'actions', label: 'Actions', rows: toRows(take(actionItems)) },
        { id: 'habits', label: upNext.length || recentItems.length ? 'More habits' : 'Habits', rows: toRows(take(habitItems)) },
      ];
      return out.filter((group) => group.rows.length > 0);
    }

    return [
      rankGroup(q, 'habits', 'Habits', habitItems),
      rankGroup(q, 'pages', 'Pages', pageItems),
      rankGroup(q, 'actions', 'Actions', actionItems),
    ]
      .filter((group) => group.rows.length > 0)
      .sort((a, b) => b.best - a.best)
      .map(({ id, label, rows }) => ({ id, label, rows }));
  }, [query, habitItems, pageItems, actionItems, recent, overview]);

  const flat = useMemo(() => groups.flatMap((group) => group.rows), [groups]);
  const activeIndex = flat.length === 0 ? -1 : Math.min(active, flat.length - 1);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || activeIndex < 0) return;
    if (activeIndex === 0) {
      list.scrollTop = 0;
      return;
    }
    list.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const execute = (item: PaletteItem, secondary = false) => {
    if (!isPresent) return;
    if (!item.transient) pushRecent(item.id);
    onClose();
    if (secondary && item.secondary) item.secondary.run();
    else item.run();
  };

  const move = (delta: number, wrap: boolean) => {
    if (flat.length === 0) return;
    const from = activeIndex < 0 ? 0 : activeIndex;
    let next = from + delta;
    if (wrap) next = (next + flat.length) % flat.length;
    else next = Math.max(0, Math.min(flat.length - 1, next));
    setActive(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!isPresent || e.nativeEvent.isComposing) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(1, true);
        return;
      case 'ArrowUp':
        e.preventDefault();
        move(-1, true);
        return;
      case 'PageDown':
        e.preventDefault();
        move(5, false);
        return;
      case 'PageUp':
        e.preventDefault();
        move(-5, false);
        return;
      case 'Enter': {
        e.preventDefault();
        const row = flat[activeIndex];
        if (row) execute(row.item, e.shiftKey);
        else if (query.trim()) execute(newHabitItem);
        return;
      }
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      case 'Tab':
        e.preventDefault();
        inputRef.current?.focus();
        return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'k' || e.code === 'KeyK')) {
      e.preventDefault();
      onClose();
    }
  };

  let rowIndex = -1;

  return (
    <div className={clsx('fixed inset-0 z-[75]', !isPresent && 'pointer-events-none')} onKeyDown={onKeyDown}>
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 bg-bg/60 backdrop-blur-[3px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={() => {
          if (isPresent) onClose();
        }}
      />
      <div className="pointer-events-none relative flex justify-center px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:px-6 sm:pt-[12vh]">
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          initial={{ opacity: 0, y: -12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 560, damping: 38, mass: 0.8 }}
          className="pointer-events-auto flex max-h-[calc(100dvh-env(safe-area-inset-top)-1.5rem)] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-pop sm:max-h-[min(76vh,640px)]"
        >
          <div className="flex items-center gap-3 border-b border-line pr-2 pl-4 sm:pr-4">
            <Search aria-hidden="true" className="size-5 shrink-0 text-fg-3" />
            <input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              role="combobox"
              aria-expanded="true"
              aria-controls={LISTBOX_ID}
              aria-autocomplete="list"
              aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
              aria-label="Search habits, pages and actions"
              placeholder="Search habits, pages, actions…"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="go"
              className="h-14 min-w-0 flex-1 bg-transparent text-base text-fg placeholder:text-fg-4 focus-visible:outline-none sm:h-16 sm:text-lg"
            />
            <span className="hidden sm:flex">
              <Kbd>Esc</Kbd>
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close command palette"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl text-fg-3 transition-colors hover:bg-surface-2 hover:text-fg sm:hidden"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>

          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            <div id={LISTBOX_ID} role="listbox" aria-label="Results">
              {groups.map((group) => (
                <div key={group.id} role="group" aria-labelledby={`command-palette-group-${group.id}`} className="pb-1">
                  <div
                    id={`command-palette-group-${group.id}`}
                    role="presentation"
                    className="eyebrow px-2.5 pt-2.5 pb-1.5"
                  >
                    {group.label}
                  </div>
                  {group.rows.map(({ item, indices }) => {
                    rowIndex += 1;
                    const index = rowIndex;
                    const isActive = index === activeIndex;
                    return (
                      <div
                        key={item.id}
                        id={optionId(index)}
                        role="option"
                        aria-selected={isActive}
                        data-index={index}
                        onMouseMove={() => {
                          if (!isActive) setActive(index);
                        }}
                        onClick={() => execute(item)}
                        className={clsx(
                          'relative flex min-h-12 cursor-pointer items-center gap-3 rounded-xl py-2 pr-1.5 pl-2.5 transition-colors duration-75 select-none',
                          isActive ? 'bg-surface-2 text-fg' : 'text-fg-2',
                        )}
                      >
                        {isActive && (
                          <span aria-hidden="true" className="accent-gradient absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-r-full" />
                        )}
                        <RowVisual visual={item.visual} active={isActive} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[15px] leading-snug font-medium">
                            <Highlighted text={item.label} indices={indices} />
                          </div>
                          {item.description && <div className="truncate text-xs leading-snug text-fg-3">{item.description}</div>}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {isActive && item.hint && (
                            <span className="hidden items-center gap-1 pr-1 text-xs text-fg-3 sm:flex">
                              {item.hint}
                              <CornerDownLeft aria-hidden="true" className="size-3.5" />
                            </span>
                          )}
                          {item.shortcut && !isActive && (
                            <span aria-hidden="true" className="hidden items-center gap-1 pr-1.5 sm:flex">
                              {item.shortcut.map((key) => (
                                <Kbd key={key}>{key}</Kbd>
                              ))}
                            </span>
                          )}
                          {item.secondary && (
                            <button
                              type="button"
                              tabIndex={-1}
                              aria-label={item.secondary.label}
                              title={`${item.secondary.label} (${SHIFT_KEY}↵)`}
                              onClick={(e) => {
                                e.stopPropagation();
                                execute(item, true);
                              }}
                              className={clsx(
                                'flex size-9 items-center justify-center rounded-lg transition-colors hover:bg-surface-3 hover:text-fg',
                                isActive ? 'text-fg-2' : 'text-fg-4',
                              )}
                            >
                              <ArrowUpRight aria-hidden="true" className="size-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {flat.length === 0 && (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <span className="mb-3 flex size-12 items-center justify-center rounded-2xl border border-line bg-surface-2">
                  <SearchX aria-hidden="true" className="size-5 text-fg-3" />
                </span>
                <p className="font-medium text-fg">
                  No results for “<span className="break-all">{query.trim()}</span>”
                </p>
                <p className="mt-1 text-sm text-fg-3">Try a different word, or create a new habit.</p>
                <Button
                  variant="soft"
                  size="sm"
                  className="mt-4"
                  icon={<Plus aria-hidden="true" />}
                  onClick={() => execute(newHabitItem)}
                >
                  New habit
                </Button>
              </div>
            )}
          </div>

          <div aria-live="polite" className="sr-only">
            {query.trim() ? `${flat.length} result${flat.length === 1 ? '' : 's'}` : ''}
          </div>

          <div className="hidden items-center justify-between gap-4 border-t border-line bg-bg-soft/60 px-4 py-2.5 text-xs text-fg-3 sm:flex">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
                Navigate
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd>↵</Kbd>
                Select
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd>{SHIFT_KEY}</Kbd>
                <Kbd>↵</Kbd>
                Details
              </span>
            </div>
            <span className="flex items-center gap-1.5">
              <Kbd>{MOD_KEY}</Kbd>
              <Kbd>K</Kbd>
              Toggle
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export function CommandPalette() {
  const open = useUI((s) => s.commandPalette);
  const setCommandPalette = useUI((s) => s.setCommandPalette);
  const returnFocus = useRef<HTMLElement | null>(null);

  // grab focus before autoFocus moves it, and restore it synchronously on close so a
  // dialog opened from the palette records the right return target
  useEffect(
    () =>
      useUI.subscribe((state, prev) => {
        if (state.commandPalette === prev.commandPalette) return;
        if (state.commandPalette) {
          returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          return;
        }
        const target = returnFocus.current;
        returnFocus.current = null;
        if (target && target.isConnected && target !== document.body) target.focus({ preventScroll: true });
        else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      }),
    [],
  );

  // tied to `open` rather than the exit animation
  useLayoutEffect(() => {
    if (!open) return;
    const { body, documentElement } = document;
    const scrollbar = window.innerWidth - documentElement.clientWidth;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    body.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>{open && <PaletteDialog key="command-palette" onClose={() => setCommandPalette(false)} />}</AnimatePresence>,
    document.body,
  );
}
