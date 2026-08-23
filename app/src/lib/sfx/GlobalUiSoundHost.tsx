import * as React from 'react';
import { playUiSound } from './playUiSound';

const CLICKABLE_SELECTOR = [
  'button',
  '[role="button"]',
  'a[href]',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
  'summary',
].join(',');

export function resolveGlobalSoundTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const control = target.closest<HTMLElement>(CLICKABLE_SELECTOR);
  if (!control) return null;
  if (control.closest('[data-ui-sound="none"]')) return null;
  if (control.matches('[role="switch"], [aria-disabled="true"], :disabled')) return null;
  return control;
}

export function GlobalUiSoundHost(): null {
  React.useEffect(() => {
    const handlePointerUp = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (!resolveGlobalSoundTarget(event.target)) return;
      playUiSound('ui_select');
    };
    window.addEventListener('pointerup', handlePointerUp, true);
    return () => window.removeEventListener('pointerup', handlePointerUp, true);
  }, []);

  return null;
}
