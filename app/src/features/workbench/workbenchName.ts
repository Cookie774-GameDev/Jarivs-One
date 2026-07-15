export const DEFAULT_WORKBENCH_NAME = 'My Workbench';
export const MAX_WORKBENCH_NAME_LENGTH = 80;

/** Trim, collapse whitespace, strip control chars, enforce length. Empty → null. */
export function sanitizeWorkbenchName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_WORKBENCH_NAME_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
}

export function resolveWorkbenchName(input: unknown): string {
  return sanitizeWorkbenchName(input) ?? DEFAULT_WORKBENCH_NAME;
}

export function workbenchWindowTitle(name: string): string {
  const safe = resolveWorkbenchName(name);
  return `VibeSpace Workbench — ${safe}`;
}
