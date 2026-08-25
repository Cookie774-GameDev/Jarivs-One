import * as React from 'react';
import { playComposerKeySound, playUiSound } from './playUiSound';

const CLICKABLE_SELECTOR = [
  'button',
  '[role="button"]',
  'a[href]',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
  'summary',
].join(',');

const TEXT_ENTRY_SELECTOR = [
  'input',
  'textarea',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
].join(',');

const TEXT_INPUT_TYPES = new Set(['email', 'number', 'password', 'search', 'tel', 'text', 'url']);

export function resolveGlobalSoundTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const control = target.closest<HTMLElement>(CLICKABLE_SELECTOR);
  if (!control) return null;
  if (control.closest('[data-ui-sound="none"]')) return null;
  if (control.matches('[role="switch"], [aria-disabled="true"], :disabled')) return null;
  return control;
}

export function resolveGlobalTextEntryTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const field = target.closest<HTMLElement>(TEXT_ENTRY_SELECTOR);
  if (!field || field.closest('[data-ui-sound="none"]')) return null;
  if (field.matches('[aria-disabled="true"], [aria-readonly="true"], :disabled')) return null;
  if (field instanceof HTMLInputElement) {
    if (field.readOnly || !TEXT_INPUT_TYPES.has(field.type.toLowerCase())) return null;
  }
  if (field instanceof HTMLTextAreaElement && field.readOnly) return null;
  return field;
}

export function GlobalUiSoundHost(): null {
  React.useEffect(() => {
    const handlePointerUp = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (!resolveGlobalSoundTarget(event.target)) return;
      playUiSound('ui_select');
    };
    const handleTextEntryKeyDown = (event: KeyboardEvent) => {
      if (!resolveGlobalTextEntryTarget(event.target)) return;
      playComposerKeySound(event);
    };
    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('keydown', handleTextEntryKeyDown, true);
    return () => {
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('keydown', handleTextEntryKeyDown, true);
    };
  }, []);

  return null;
}
