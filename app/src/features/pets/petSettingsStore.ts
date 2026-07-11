/**
 * User-facing Pet settings — persisted in the normal app (localStorage).
 * Shared across main / pet-overlay / pet-mini-panel via the same origin storage.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeLocalStorage } from '@/lib/persistence/safeLocalStorage';

export interface PetSettingsState {
  /** Master enable — when false, overlay is hidden and not shown. */
  enabled: boolean;
  reducedMotion: boolean;
  /** Idle → sleep transition timeout (ms). */
  sleepTimeoutMs: number;
  idleFunIntervalMs: number;
  /** Show developer diagnostics in Settings (gated). */
  showDiagnostics: boolean;
  /** Last known pet overlay visible. */
  overlayVisible: boolean;

  setEnabled: (v: boolean) => void;
  setReducedMotion: (v: boolean) => void;
  setSleepTimeoutMs: (ms: number) => void;
  setIdleFunIntervalMs: (ms: number) => void;
  setShowDiagnostics: (v: boolean) => void;
  setOverlayVisible: (v: boolean) => void;
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

      setEnabled: (v) => set({ enabled: v, overlayVisible: v ? true : false }),
      setReducedMotion: (v) => set({ reducedMotion: v }),
      setSleepTimeoutMs: (ms) =>
        set({ sleepTimeoutMs: Math.max(30_000, Math.min(ms, 60 * 60 * 1000)) }),
      setIdleFunIntervalMs: (ms) =>
        set({ idleFunIntervalMs: Math.max(10_000, Math.min(ms, 30 * 60 * 1000)) }),
      setShowDiagnostics: (v) => set({ showDiagnostics: v }),
      setOverlayVisible: (v) => set({ overlayVisible: v }),
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
      }),
    },
  ),
);

/** Force-play diagnostic animation (listened by PetOverlay). */
export const PET_FORCE_ANIM_EVENT = 'jarvis:pet:force-anim';
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
