/**
 * Browser-safe bridge to Tauri pet window commands.
 * No-ops gracefully when not running inside Tauri.
 */

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauriRuntime()) return null;
  try {
    const { invoke: inv } = await import('@tauri-apps/api/core');
    return (await inv<T>(cmd, args)) as T;
  } catch (err) {
    console.warn('[pets] invoke failed', cmd, err);
    return null;
  }
}

export async function showPetOverlay(): Promise<void> {
  await invoke('pet_show_overlay');
}

export async function hidePetOverlay(): Promise<void> {
  await invoke('pet_hide_overlay');
}

export async function isPetOverlayVisible(): Promise<boolean> {
  const v = await invoke<boolean>('pet_is_overlay_visible');
  return v === true;
}

export async function setPetOverlayPosition(x: number, y: number): Promise<void> {
  await invoke('pet_set_overlay_position', { x, y });
}

export async function openOrFocusPetPanel(nearX?: number, nearY?: number): Promise<void> {
  await invoke('pet_open_or_focus_panel', { nearX: nearX ?? null, nearY: nearY ?? null });
}

/**
 * Open mini panel, then hide the pet overlay only if the panel is actually
 * visible. Used by both PetHost (main) and PetOverlayWindow (desktop path).
 * Prevents "sprite gone + no panel" when panel open fails.
 */
export async function openPetPanelSafely(
  nearX?: number,
  nearY?: number,
): Promise<{ panelVisible: boolean }> {
  if (!isTauriRuntime()) {
    return { panelVisible: false };
  }
  await openOrFocusPetPanel(nearX, nearY);
  // Brief settle for WebView show
  await new Promise((r) => setTimeout(r, 180));
  const panelVisible = await isPetPanelVisible();
  if (panelVisible) {
    await hidePetOverlay().catch(() => undefined);
  } else {
    // Panel did not open — keep/restore the floating pet.
    await showPetOverlay().catch(() => undefined);
  }
  return { panelVisible };
}

export async function minimizePetPanel(): Promise<void> {
  await invoke('pet_minimize_panel');
}

export async function hidePetPanel(): Promise<void> {
  await invoke('pet_hide_panel');
}

export async function isPetPanelVisible(): Promise<boolean> {
  const v = await invoke<boolean>('pet_is_panel_visible');
  return v === true;
}

export async function savePetPanelGeometry(
  x: number,
  y: number,
  w: number,
  h: number,
): Promise<void> {
  await invoke('pet_save_panel_geometry', { x, y, w, h });
}

/** Single-instance guard for React: only one host should drive pet overlay. */
let petHostInstanceCount = 0;

export function claimPetHostInstance(): boolean {
  if (petHostInstanceCount > 0) return false;
  petHostInstanceCount = 1;
  return true;
}

export function releasePetHostInstance(): void {
  petHostInstanceCount = Math.max(0, petHostInstanceCount - 1);
}

export function getPetHostInstanceCount(): number {
  return petHostInstanceCount;
}
