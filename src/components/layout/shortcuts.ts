// keep in sync with GlobalShortcuts, CommandPalette and the Today page's arrow keys
import { IS_MAC, MOD_KEY, SHIFT_KEY } from './platform';
import { NAV_ITEMS } from './nav';

// keys pressed together, e.g. ['⌘', 'K']
export type KeyStroke = string[];
// strokes pressed one after another, e.g. [['G'], ['T']]
export type KeySequence = KeyStroke[];

export interface ShortcutItem {
  label: string;
  combos: KeySequence[];
}

export interface ShortcutGroup {
  title: string;
  items: ShortcutItem[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'General',
    items: [
      { label: 'Command palette', combos: [[[MOD_KEY, 'K']], [['/']]] },
      { label: 'New habit', combos: [[['N']]] },
      { label: 'Undo', combos: [[[MOD_KEY, 'Z']]] },
      {
        label: 'Redo',
        combos: IS_MAC ? [[[MOD_KEY, SHIFT_KEY, 'Z']]] : [[[MOD_KEY, SHIFT_KEY, 'Z']], [[MOD_KEY, 'Y']]],
      },
      { label: 'Keyboard shortcuts', combos: [[['?']]] },
      { label: 'Close dialog', combos: [[['Esc']]] },
    ],
  },
  {
    title: 'Go to',
    items: NAV_ITEMS.map((item) => ({ label: item.label, combos: [[['G'], [item.goKey.toUpperCase()]]] })),
  },
  {
    title: 'Today page',
    items: [
      { label: 'Previous day', combos: [[['←']]] },
      { label: 'Next day', combos: [[['→']]] },
    ],
  },
  {
    title: 'Command palette',
    items: [
      { label: 'Move selection', combos: [[['↑']], [['↓']]] },
      { label: 'Run, or log a habit for today', combos: [[['↵']]] },
      { label: 'Open habit details', combos: [[[SHIFT_KEY, '↵']]] },
    ],
  },
];
