/**
 * Main-app Pet host — always mounts the pet overlay inside the main window
 * so `npm run tauri:dev` shows the pet on every route without a special URL.
 *
 * Layout: floating pet sprite + floating resizable mini-panel (same app).
 * Optional Tauri pet-overlay show is attempted for always-on-top, but the
 * in-app overlay is the source of truth so the pet is never "invisible".
 */
import * as React from 'react';
import { PetOverlay } from './PetOverlay';
import { PetMiniPanel } from './PetMiniPanel';
import {
  claimPetHostInstance,
  hidePetOverlay,
  isTauriRuntime,
  releasePetHostInstance,
} from './petTauriBridge';
import { installPetPresentationStorageSync } from './petPresentationStore';
import { usePetSettingsStore } from './petSettingsStore';

export interface PetHostProps {
  enabled?: boolean;
  reducedMotion?: boolean;
}

export function PetHost({ enabled: enabledProp, reducedMotion: reducedProp }: PetHostProps) {
  const settingsEnabled = usePetSettingsStore((s) => s.enabled);
  const settingsReduced = usePetSettingsStore((s) => s.reducedMotion);
  const overlayVisible = usePetSettingsStore((s) => s.overlayVisible);
  const sleepTimeoutMs = usePetSettingsStore((s) => s.sleepTimeoutMs);
  const idleFunIntervalMs = usePetSettingsStore((s) => s.idleFunIntervalMs);
  const setOverlayVisible = usePetSettingsStore((s) => s.setOverlayVisible);

  const enabled = enabledProp ?? settingsEnabled;
  const reducedMotion = reducedProp ?? settingsReduced;

  const [panelOpen, setPanelOpen] = React.useState(false);
  const [animLabel, setAnimLabel] = React.useState<string>('welcome');
  const [claimed, setClaimed] = React.useState(false);

  React.useEffect(() => installPetPresentationStorageSync(), []);

  React.useEffect(() => {
    if (!claimPetHostInstance()) {
      console.warn('[pets] duplicate PetHost prevented');
      return;
    }
    setClaimed(true);
    return () => releasePetHostInstance();
  }, []);

  // Prefer in-app pet. Hide separate Tauri overlay to avoid a second ghost pet.
  React.useEffect(() => {
    if (!claimed) return;
    if (isTauriRuntime()) {
      // Keep secondary window hidden — main shell hosts the visible pet.
      void hidePetOverlay().catch(() => undefined);
    }
  }, [claimed, enabled, overlayVisible]);

  // If settings somehow left pet "enabled" but not visible, default show.
  React.useEffect(() => {
    if (enabled && !overlayVisible) {
      setOverlayVisible(true);
    }
  }, [enabled, overlayVisible, setOverlayVisible]);

  const openPanel = React.useCallback(() => setPanelOpen(true), []);
  const closePanel = React.useCallback(() => setPanelOpen(false), []);
  const hidePet = React.useCallback(() => {
    setOverlayVisible(false);
    setPanelOpen(false);
  }, [setOverlayVisible]);

  React.useEffect(() => {
    const onOpen = () => {
      if (!usePetSettingsStore.getState().enabled) {
        usePetSettingsStore.getState().setEnabled(true);
      }
      usePetSettingsStore.getState().setOverlayVisible(true);
      setPanelOpen(true);
    };
    window.addEventListener('jarvis:pet:open-panel', onOpen);
    return () => window.removeEventListener('jarvis:pet:open-panel', onOpen);
  }, []);

  if (!claimed || !enabled || !overlayVisible) return null;

  // When the mini panel is open, hide the floating sprite; show it again on close/minimize.
  const showSprite = !panelOpen;

  return (
    <>
      {showSprite && (
        <PetOverlay
          enabled
          reducedMotion={reducedMotion}
          panelOpen={panelOpen}
          onOpenPanel={openPanel}
          onPanelClose={closePanel}
          onAnimChange={setAnimLabel}
          onRequestClose={hidePet}
          tauriWindowMode={false}
          sleepTimeoutMs={sleepTimeoutMs}
          idleFunIntervalMs={idleFunIntervalMs}
        />
      )}
      <PetMiniPanel
        open={panelOpen}
        onClose={closePanel}
        onMinimize={() => setPanelOpen(false)}
        animLabel={animLabel}
        resizable
      />
    </>
  );
}
