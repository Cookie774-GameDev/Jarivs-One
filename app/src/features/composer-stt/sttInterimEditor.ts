export type SttFieldSnapshot = {
  before: string;
  after: string;
  caretStart: number;
};

export function separatorForBefore(before: string): string {
  return before.length > 0 && !/\s$/.test(before) ? ' ' : '';
}

export function captureSttFieldSnapshot(
  el: HTMLInputElement | HTMLTextAreaElement,
): SttFieldSnapshot {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  return {
    before: el.value.slice(0, start),
    after: el.value.slice(end),
    caretStart: start,
  };
}

export function captureSttTextSnapshot(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): SttFieldSnapshot {
  return {
    before: value.slice(0, selectionStart),
    after: value.slice(selectionEnd),
    caretStart: selectionStart,
  };
}

export function buildSttPreviewValue(snapshot: SttFieldSnapshot, partial: string): string {
  const preview = partial.trim();
  if (!preview) return snapshot.before + snapshot.after;
  const sep = separatorForBefore(snapshot.before);
  return snapshot.before + sep + preview + snapshot.after;
}

export function buildSttCommittedValue(snapshot: SttFieldSnapshot, finalText: string): string | null {
  const trimmed = finalText.trim();
  if (!trimmed) return null;
  const sep = separatorForBefore(snapshot.before);
  return snapshot.before + sep + trimmed + snapshot.after;
}

export function previewSttInField(
  el: HTMLInputElement | HTMLTextAreaElement,
  snapshot: SttFieldSnapshot,
  partial: string,
): void {
  el.value = buildSttPreviewValue(snapshot, partial);
  const caret = buildSttPreviewValue(snapshot, partial).length - snapshot.after.length;
  el.setSelectionRange(caret, caret);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export function commitSttInField(
  el: HTMLInputElement | HTMLTextAreaElement,
  snapshot: SttFieldSnapshot,
  finalText: string,
): boolean {
  const next = buildSttCommittedValue(snapshot, finalText);
  if (!next) {
    revertSttPreview(el, snapshot);
    return false;
  }
  el.value = next;
  const caret = next.length - snapshot.after.length;
  el.setSelectionRange(caret, caret);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

export function revertSttPreview(
  el: HTMLInputElement | HTMLTextAreaElement,
  snapshot: SttFieldSnapshot,
): void {
  el.value = snapshot.before + snapshot.after;
  el.setSelectionRange(snapshot.caretStart, snapshot.caretStart);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
