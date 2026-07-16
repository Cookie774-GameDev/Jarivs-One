/**
 * Pure terminal Tabs/Grid layout helpers for the Pet mini-panel.
 * No PTY cloning — only presentation geometry + view-mode persistence.
 */

export type PetTerminalViewMode = 'tabs' | 'grid';

export const PET_TERMINAL_VIEW_MODE_KEY = 'vibespace-pet-terminal-view-mode';

/** Tailwind grid classes for 1–4 simultaneous live terminals. */
export function gridClassForCount(count: number): string {
  if (count <= 1) return 'grid-cols-1 grid-rows-1';
  if (count === 2) return 'grid-cols-2 grid-rows-1';
  // 3 and 4: 2×2 (one empty cell when count === 3)
  return 'grid-cols-2 grid-rows-2';
}

export function loadPetTerminalViewMode(
  storage: Pick<Storage, 'getItem'> | null | undefined = typeof localStorage !== 'undefined'
    ? localStorage
    : null,
): PetTerminalViewMode {
  try {
    const v = storage?.getItem(PET_TERMINAL_VIEW_MODE_KEY);
    return v === 'grid' ? 'grid' : 'tabs';
  } catch {
    return 'tabs';
  }
}

export function savePetTerminalViewMode(
  mode: PetTerminalViewMode,
  storage: Pick<Storage, 'setItem'> | null | undefined = typeof localStorage !== 'undefined'
    ? localStorage
    : null,
): void {
  try {
    storage?.setItem(PET_TERMINAL_VIEW_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/**
 * Whether a terminal tile should accept keyboard input.
 * Only the focused terminal receives input; others stay live for output.
 */
export function terminalTileReceivesInput(terminalId: string, focusedTerminalId: string | null): boolean {
  return focusedTerminalId != null && terminalId === focusedTerminalId;
}
