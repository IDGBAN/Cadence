import { useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ClipboardPaste } from 'lucide-react';
import { EMOJI_GROUPS } from '@/lib/defaults';
import { cn } from '../cn';
import { EMOJI_FONT } from '../hooks';
import { Input } from '../inputs/Input';
import { Segmented } from '../inputs/Segmented';
import { useReducedMotionPref } from '../motion';

export interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
  className?: string;
}

// Intl.Segmenter keeps ZWJ sequences, flags and skin tones together
function firstGrapheme(input: string): string {
  const s = input.trim();
  if (!s) return '';
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    for (const { segment } of segmenter.segment(s)) return segment;
  }
  return Array.from(s)[0] ?? '';
}

function emojiShortcutHint(): string {
  if (typeof navigator === 'undefined') return '';
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return 'Use the emoji key on your keyboard.';
  if (/Mac/i.test(ua)) return 'Press ⌃ ⌘ Space for the emoji keyboard.';
  if (/Win/i.test(ua)) return 'Press Win + . for the emoji keyboard.';
  return '';
}

export function EmojiPicker({ value, onChange, className }: EmojiPickerProps) {
  const reduced = useReducedMotionPref();
  const [group, setGroup] = useState(EMOJI_GROUPS[0]?.label ?? '');
  const [custom, setCustom] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const spyLockedUntil = useRef(0);
  const hint = useMemo(emojiShortcutHint, []);

  const all = useMemo(() => EMOJI_GROUPS.flatMap((g) => g.emojis), []);
  const valueIndex = all.indexOf(value);
  const [focusIndex, setFocusIndex] = useState(valueIndex >= 0 ? valueIndex : 0);

  const jumpTo = (label: string) => {
    setGroup(label);
    const container = scrollRef.current;
    const section = sectionRefs.current[label];
    if (!container || !section) return;
    spyLockedUntil.current = performance.now() + 600;
    container.scrollTo({ top: section.offsetTop - 4, behavior: reduced ? 'auto' : 'smooth' });
  };

  const onScroll = () => {
    const container = scrollRef.current;
    if (!container || performance.now() < spyLockedUntil.current) return;
    let current = EMOJI_GROUPS[0]?.label ?? '';
    for (const g of EMOJI_GROUPS) {
      const section = sectionRefs.current[g.label];
      if (section && section.offsetTop - container.scrollTop <= 24) current = g.label;
    }
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 2) {
      current = EMOJI_GROUPS[EMOJI_GROUPS.length - 1]?.label ?? current;
    }
    if (current !== group) setGroup(current);
  };

  const onGridKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = e.target;
    if (!(target instanceof HTMLElement) || target.dataset.emojiIndex === undefined) return;
    const index = Number(target.dataset.emojiIndex);
    const grid = target.parentElement;
    const cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 8 : 8;
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols };
    let next: number | null = null;
    if (e.key in moves) next = index + moves[e.key];
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = all.length - 1;
    if (next === null) return;
    e.preventDefault();
    const clamped = Math.max(0, Math.min(all.length - 1, next));
    setFocusIndex(clamped);
    scrollRef.current?.querySelector<HTMLButtonElement>(`[data-emoji-index="${clamped}"]`)?.focus();
  };

  let offset = 0;

  return (
    <div className={cn('flex min-w-0 flex-col gap-3', className)}>
      <div className="flex items-center gap-3">
        <div
          aria-hidden
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface-2 text-[28px] leading-none',
            'shadow-[inset_0_1px_0_color-mix(in_oklab,var(--fg)_7%,transparent)] light:bg-surface-3/60',
          )}
          style={{ fontFamily: EMOJI_FONT }}
        >
          {value || '✨'}
        </div>
        <Input
          aria-label="Paste or type any emoji"
          placeholder="Paste any emoji"
          value={custom}
          leading={<ClipboardPaste />}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setCustom(e.target.value);
            const emoji = firstGrapheme(e.target.value);
            if (emoji) onChange(emoji);
          }}
          className="min-w-0 flex-1"
        />
      </div>

      {EMOJI_GROUPS.length > 1 && (
        <Segmented
          size="sm"
          fullWidth
          aria-label="Emoji groups"
          value={group}
          onChange={jumpTo}
          options={EMOJI_GROUPS.map((g) => ({ value: g.label, label: g.label }))}
        />
      )}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        onKeyDown={onGridKeyDown}
        className="relative -mx-1 max-h-60 overflow-y-auto overscroll-contain px-1"
      >
        {EMOJI_GROUPS.map((g) => {
          const start = offset;
          offset += g.emojis.length;
          return (
            <section
              key={g.label}
              ref={(node) => {
                sectionRefs.current[g.label] = node;
              }}
              aria-label={g.label}
              className="pb-2"
            >
              <div className="eyebrow px-1 pb-1.5 pt-1">{g.label}</div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1">
                {g.emojis.map((emoji, i) => {
                  const index = start + i;
                  const selected = emoji === value;
                  return (
                    <button
                      key={`${emoji}-${index}`}
                      type="button"
                      data-emoji-index={index}
                      tabIndex={index === focusIndex ? 0 : -1}
                      aria-label={emoji}
                      aria-pressed={selected}
                      onClick={() => {
                        setFocusIndex(index);
                        setCustom('');
                        onChange(emoji);
                      }}
                      className={cn(
                        'flex aspect-square min-h-10 items-center justify-center rounded-xl text-[22px] leading-none',
                        'transition-[background-color,transform,box-shadow] duration-150 ease-out hover:scale-110 hover:bg-surface-3 active:scale-95',
                        'light:hover:bg-surface-2 focus-visible:outline-offset-0',
                        selected &&
                          'bg-accent/16 shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--accent)_70%,transparent)] hover:bg-accent/22',
                      )}
                      style={{ fontFamily: EMOJI_FONT }}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {hint && <p className="-mt-1 text-xs text-fg-4">{hint}</p>}
    </div>
  );
}
