/** True when the focused element is a chat composer textarea (not agent prompts, etc.). */
export function isComposerSttTextarea(el: Element | null): boolean {
  return el instanceof HTMLTextAreaElement && el.getAttribute('aria-label') === 'Message';
}

/** True when focus is inside an xterm.js surface (handled by TerminalView). */
export function isTerminalSttSurface(el: Element | null): boolean {
  return Boolean(el?.closest('.xterm'));
}

export function isGlobalSttEditable(
  el: Element | null,
): el is HTMLInputElement | HTMLTextAreaElement | HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (isTerminalSttSurface(el) || isComposerSttTextarea(el)) return false;
  if (el.tagName === 'TEXTAREA') return true;
    if (el instanceof HTMLInputElement) {
    const type = (el.type || 'text').toLowerCase();
    return (
      type === 'text' ||
      type === 'search' ||
      type === 'email' ||
      type === 'url' ||
      type === 'tel' ||
      type === ''
    );
  }
  return el.isContentEditable;
}

/** Insert transcribed speech at the caret in the currently focused editable. */
export function insertTextIntoFocusedEditable(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const el = document.activeElement;
  if (!isGlobalSttEditable(el)) return false;

  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const before = el.value.slice(0, start);
    const sep = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
    const next = before + sep + trimmed + el.value.slice(end);
    el.value = next;
    const cursor = (before + sep + trimmed).length;
    el.setSelectionRange(cursor, cursor);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  if (el.isContentEditable) {
    document.execCommand('insertText', false, trimmed);
    return true;
  }

  return false;
}
