/**
 * Main-window pet host.
 * Reads Settings → Pets enable flag. In Tauri: shows pet-overlay window only
 * (no embedded duplicate). Browser: embeds overlay + mini-panel for local test.
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
import { usePetSettingsStore } from './petSettingsStore';

export interface PetHostProps {
  /** Override; defaults to settings store. */
  enabled?: boolean;
  reducedMotion?: boolean;
}

export function PetHost({ enabled: enabledProp, reducedMotion: reducedProp }: PetHostProps) {
  const settingsEnabled = usePetSettingsStore((s) => s.enabled);
  const settingsReduced = usePetSettingsStore((s) => s.reducedMotion);
  const overlayVisible = usePetSettingsStore((s) => s.overlayVisible);
  const sleepTimeoutMs = usePetSettingsStore((s) => s.sleepTimeoutMs);
  const idleFunIntervalMs = usePetSettingsStore((s) => s.idleFunIntervalMs);

  const enabled = enabledProp ?? settingsEnabled;
  const reducedMotion = reducedProp ?? settingsReduced;

  const [panelOpen, setPanelOpen] = React.useState(false);
  const [animLabel, setAnimLabel] = React.useState<string>('welcome');
  const [claimed, setClaimed] = React.useState(false);
  const [tauri, setTauri] = React.useState(false);

  React.useEffect(() => {
    return installPetPresentationStorageSync();
  }, []);

  React.useEffect(() => {
    if (!claimPetHostInstance()) {
      console.warn('[pets] duplicate PetHost prevented');
      return;
    }
    setClaimed(true);
    const inTauri = isTauriRuntime();
    setTauri(inTauri);
    return () => {
      releasePetHostInstance();
    };
  }, []);

  // Show / hide overlay from settings without recreating the webview.
  React.useEffect(() => {
    if (!claimed || !tauri) return;
    if (enabled && overlayVisible) {
      void showPetOverlay();
    } else {
      void hidePetOverlay();
    }
  }, [claimed, tauri, enabled, overlayVisible]);

  const openPanel = React.useCallback(() => setPanelOpen(true), []);
  const closePanel = React.useCallback(() => setPanelOpen(false), []);

  if (!claimed) return null;

  if (tauri) {
    // Pet UI lives in separate windows; host only coordinates visibility.
    return (
      <div
        data-pet-host="tauri"
        data-pet-instance="1"
        data-pet-enabled={enabled ? 'true' : 'false'}
        hidden
        aria-hidden
      />
    );
  }

  if (!enabled || !overlayVisible) return null;

  return (
    <>
      <PetOverlay
        enabled
        reducedMotion={reducedMotion}
        panelOpen={panelOpen}
        onOpenPanel={openPanel}
        onPanelClose={closePanel}
        onAnimChange={setAnimLabel}
        tauriWindowMode={false}
        sleepTimeoutMs={sleepTimeoutMs}
        idleFunIntervalMs={idleFunIntervalMs}
      />
      <PetMiniPanel open={panelOpen} onClose={closePanel} animLabel={animLabel} />
    </>
  );
}
