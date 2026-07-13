/**
 * User-facing Pet settings — persisted in the normal app (localStorage).
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeLocalStorage } from '@/lib/persistence/safeLocalStorage';
import {
  NORMAL_AXO_RUNTIME_ID,
  resolvePetCharacterId,
  type PetCharacterId,
  type PetCharacterInput,
} from './petCharacters';

export interface PetSettingsState {
  enabled: boolean;
  reducedMotion: boolean;
  sleepTimeoutMs: number;
  idleFunIntervalMs: number;
  showDiagnostics: boolean;
  overlayVisible: boolean;
  /** Selected sprite skin */
  characterId: PetCharacterId;

  setEnabled: (v: boolean) => void;
  setReducedMotion: (v: boolean) => void;
  setSleepTimeoutMs: (ms: number) => void;
  setIdleFunIntervalMs: (ms: number) => void;
  setShowDiagnostics: (v: boolean) => void;
  setOverlayVisible: (v: boolean) => void;
  setCharacterId: (id: PetCharacterInput) => void;
}

export const usePetSettingsStore = create<PetSettingsState>()(
  persist(
    (set) => ({
      enabled: true,
      reducedMotion: false,
      sleepTimeoutMs: 5 * 60 * 1000,
      idleFunIntervalMs: 60_000,
      showDiagnostics: false,
      overlayVisible: true,
      characterId: NORMAL_AXO_RUNTIME_ID,

      setEnabled: (v) => set({ enabled: v, overlayVisible: v ? true : false }),
      setReducedMotion: (v) => set({ reducedMotion: v }),
      setSleepTimeoutMs: (ms) =>
        set({ sleepTimeoutMs: Math.max(30_000, Math.min(ms, 60 * 60 * 1000)) }),
      setIdleFunIntervalMs: (ms) =>
        set({ idleFunIntervalMs: Math.max(10_000, Math.min(ms, 30 * 60 * 1000)) }),
      setShowDiagnostics: (v) => set({ showDiagnostics: v }),
      setOverlayVisible: (v) => set({ overlayVisible: v }),
      setCharacterId: (id) => set({ characterId: resolvePetCharacterId(id) }),
    }),
    {
      name: 'vibespace-pet-settings',
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (s) => ({
        enabled: s.enabled,
        reducedMotion: s.reducedMotion,
        sleepTimeoutMs: s.sleepTimeoutMs,
        idleFunIntervalMs: s.idleFunIntervalMs,
        showDiagnostics: s.showDiagnostics,
        overlayVisible: s.overlayVisible,
        characterId: s.characterId,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PetSettingsState>;
        return {
          ...current,
          ...p,
          characterId: resolvePetCharacterId(p.characterId),
        };
      },
    },
  ),
);

export const PET_FORCE_ANIM_EVENT = 'jarvis:pet:force-anim';
export const PET_CHARACTER_CHANGED_EVENT = 'jarvis:pet:character-changed';

export type PetForceAnimDetail = {
  anim:
    | 'welcome'
    | 'idlePrimary'
    | 'idleFun'
    | 'walkLeft'
    | 'walkRight'
    | 'sleepTransition'
    | 'sleepingLoop'
    | 'wakeFromSleep';
};

export function forcePetAnim(anim: PetForceAnimDetail['anim']): void {
  window.dispatchEvent(new CustomEvent(PET_FORCE_ANIM_EVENT, { detail: { anim } }));
}

export function notifyPetCharacterChanged(id: PetCharacterId): void {
  window.dispatchEvent(
    new CustomEvent(PET_CHARACTER_CHANGED_EVENT, { detail: { characterId: id } }),
  );
}

/**
 * Cross-window sync for pet settings (main ↔ pet-overlay WebViews share origin).
 * Rehydrates the store when another window writes `vibespace-pet-settings`.
 */
export function installPetSettingsStorageSync(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onStorage = (e: StorageEvent) => {
    if (e.key !== 'vibespace-pet-settings' || e.newValue == null) return;
    try {
      const parsed = JSON.parse(e.newValue) as { state?: Partial<PetSettingsState> };
      const s = parsed.state ?? (parsed as Partial<PetSettingsState>);
      usePetSettingsStore.setState({
        enabled: s.enabled ?? usePetSettingsStore.getState().enabled,
        reducedMotion: s.reducedMotion ?? usePetSettingsStore.getState().reducedMotion,
        sleepTimeoutMs: s.sleepTimeoutMs ?? usePetSettingsStore.getState().sleepTimeoutMs,
        idleFunIntervalMs: s.idleFunIntervalMs ?? usePetSettingsStore.getState().idleFunIntervalMs,
        showDiagnostics: s.showDiagnostics ?? usePetSettingsStore.getState().showDiagnostics,
        overlayVisible: s.overlayVisible ?? usePetSettingsStore.getState().overlayVisible,
        characterId: resolvePetCharacterId(s.characterId),
      });
    } catch {
      /* ignore corrupt storage */
    }
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}
