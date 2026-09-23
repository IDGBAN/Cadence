type NavigatorWithUAData = Navigator & { userAgentData?: { platform?: string } };

function detectMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as NavigatorWithUAData;
  const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent;
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export const IS_MAC = detectMac();

export const MOD_KEY = IS_MAC ? '⌘' : 'Ctrl';
export const SHIFT_KEY = '⇧';

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color', 'file', 'image'].includes(type);
  }
  return target.getAttribute('role') === 'textbox';
}

export function isModalOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null;
}
