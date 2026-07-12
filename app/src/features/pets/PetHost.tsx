/**
 * Main-window pet coordinator.
 *
 * Tauri: drives the transparent `pet-overlay` window, with an in-app
 * transparent sprite fallback if the overlay fails to show (so selecting a
 * pet never results in "nothing"). Browser: embeds PetOverlay only.
 */
import * as React from 'react';
import { PetOverlay } from './PetOverlay';
import { PetMiniPanel } from './PetMiniPanel';
import {
  claimPetHostInstance,
  hidePetOverlay,
  isPetOverlayVisible,
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
  /** When true, also mount an in-app transparent sprite (overlay missing/failed). */
  const [useInlineFallback, setUseInlineFallback] = React.useState(false);

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

  // Show/hide the transparent pet-overlay WebView.
  React.useEffect(() => {
    if (!claimed || !tauri) return;
    const wantVisible = enabled && overlayVisible && !panelOpen;
    let cancelled = false;

    const sync = async () => {
      if (wantVisible) {
        await showPetOverlay();
        // Confirm visibility; if the separate WebView failed, fall back inline.
        await new Promise((r) => setTimeout(r, 250));
        if (cancelled) return;
        const visible = await isPetOverlayVisible();
        if (!cancelled) {
          setUseInlineFallback(!visible);
          if (!visible) {
            console.warn('[pets] pet-overlay not visible — using in-app fallback sprite');
          }
        }
      } else {
        await hidePetOverlay().catch(() => undefined);
        if (!cancelled) setUseInlineFallback(false);
      }
    };

    void sync().catch((err) => {
      console.warn('[pets] show overlay', err);
      if (!cancelled && wantVisible) setUseInlineFallback(true);
    });

    return () => {
      cancelled = true;
    };
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
    const onShow = () => {
      if (!usePetSettingsStore.getState().enabled) {
        usePetSettingsStore.getState().setEnabled(true);
      }
      usePetSettingsStore.getState().setOverlayVisible(true);
      // Selecting / "Show Pet" must surface the sprite, not leave panel latched closed.
      setPanelOpen(false);
      void showPetOverlay().catch(() => setUseInlineFallback(true));
    };
    const onClosePanel = () => setPanelOpen(false);
    window.addEventListener('jarvis:pet:open-panel', onOpen);
    window.addEventListener('jarvis:pet:show', onShow);
    window.addEventListener('jarvis:pet:close-panel', onClosePanel);
    return () => {
      window.removeEventListener('jarvis:pet:open-panel', onOpen);
      window.removeEventListener('jarvis:pet:show', onShow);
      window.removeEventListener('jarvis:pet:close-panel', onClosePanel);
    };
  }, []);

  if (!claimed || !enabled || !overlayVisible) return null;

  const showInlineSprite = !panelOpen && (!tauri || useInlineFallback);

  return (
    <>
      {tauri && (
        <div
          data-pet-host="tauri"
          data-pet-instance="1"
          data-pet-panel-open={panelOpen ? 'true' : 'false'}
          data-pet-inline-fallback={useInlineFallback ? 'true' : 'false'}
          data-pet-renderer-bg-alpha="0"
          hidden
          aria-hidden
        />
      )}
      {showInlineSprite && (
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
      {!tauri && (
        <PetMiniPanel
          open={panelOpen}
          onClose={closePanel}
          onMinimize={() => setPanelOpen(false)}
          animLabel={animLabel}
          resizable
        />
      )}
    </>
  );
}
