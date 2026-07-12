/**
 * Main-window pet coordinator.
 *
 * In Tauri: shows the dedicated transparent `pet-overlay` window (no main-shell
 * embed — that path painted an opaque rectangle from body CSS / WebView).
 * Browser fallback: embeds PetOverlay in the main document.
 *
 * Mini-panel opens from the main shell (or pet-mini-panel window).
 */
import * as React from 'react';
import { PetOverlay } from './PetOverlay';
import { PetMiniPanel } from './PetMiniPanel';
import {
  claimPetHostInstance,
  hidePetOverlay,
  isTauriRuntime,
  releasePetHostInstance,
  showPetOverlay,
} from './petTauriBridge';
import { installPetPresentationStorageSync } from './petPresentationStore';
import { installPetSettingsStorageSync, usePetSettingsStore } from './petSettingsStore';

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
  const [tauri, setTauri] = React.useState(false);

  React.useEffect(() => {
    const a = installPetPresentationStorageSync();
    const b = installPetSettingsStorageSync();
    return () => {
      a();
      b();
    };
  }, []);

  React.useEffect(() => {
    if (!claimPetHostInstance()) {
      console.warn('[pets] duplicate PetHost prevented');
      return;
    }
    setClaimed(true);
    setTauri(isTauriRuntime());
    return () => releasePetHostInstance();
  }, []);

  // Show/hide the transparent pet-overlay WebView (never embed under opaque main CSS).
  React.useEffect(() => {
    if (!claimed || !tauri) return;
    const wantVisible = enabled && overlayVisible && !panelOpen;
    if (wantVisible) {
      void showPetOverlay().catch((err) => console.warn('[pets] show overlay', err));
    } else {
      void hidePetOverlay().catch(() => undefined);
    }
  }, [claimed, tauri, enabled, overlayVisible, panelOpen]);

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

  // Tauri: pet lives only in transparent pet-overlay WebView.
  // Mini panel is the separate pet-mini-panel window (opened via openOrFocusPetPanel).
  // Do NOT mount an in-app mini panel here — that would reintroduce an opaque shell.
  if (tauri) {
    return (
      <div
        data-pet-host="tauri"
        data-pet-instance="1"
        data-pet-panel-open={panelOpen ? 'true' : 'false'}
        data-pet-renderer-bg-alpha="0"
        hidden
        aria-hidden
      />
    );
  }

  // Browser / non-Tauri fallback: in-document floating sprite.
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
