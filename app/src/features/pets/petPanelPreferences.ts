export type PetPanelDensity = 'comfortable' | 'compact' | 'minimum';

export const PET_PANEL_HEADER_COLLAPSED_KEY = 'vibespace-pet-panel-header-collapsed';

export function loadPetPanelHeaderCollapsed(
  storage: Pick<Storage, 'getItem'> | null | undefined = typeof localStorage !== 'undefined'
    ? localStorage
    : null,
): boolean {
  try {
    return storage?.getItem(PET_PANEL_HEADER_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function savePetPanelHeaderCollapsed(
  collapsed: boolean,
  storage: Pick<Storage, 'setItem'> | null | undefined = typeof localStorage !== 'undefined'
    ? localStorage
    : null,
): void {
  try {
    storage?.setItem(PET_PANEL_HEADER_COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    // The panel remains usable when storage is unavailable.
  }
}

export function petPanelDensityForSize(width: number, height: number): PetPanelDensity {
  if (width < 390 || height < 430) return 'minimum';
  if (width < 500 || height < 560) return 'compact';
  return 'comfortable';
}
