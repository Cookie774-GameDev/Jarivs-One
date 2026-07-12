/**
 * Main-window pet coordinator.
 *
 * Single visible pet path:
 * - Tauri: prefer dedicated pet-overlay window; inline only as fallback.
 * - Browser: inline PetOverlay only.
 * Never mount both at once (caused double welcome spam + disappear races).
 */
import * as React from 'react';
import { PetOverlay } from './PetOverlay';
import { PetMiniPanel } from './PetMiniPanel';
import {
  claimPetHostInstance,
  hidePetOverlay,
  isPetOverlayVisible,
  isTauriRuntime,
  openPetPanelSafely,
  releasePetHostInstance,
  showPetOverlay,
} from './petTauriBridge';
import { installPetPresentationStorageSync } from './petPresentationStore';
import { installPetSettingsStorageSync, usePetSettingsStore } from './petSettingsStore';

export interface PetHostProps {
  enabled?: boolean;
  reducedMotion?: boolean;
}

export function PetHost({ enabled: enabledProp, reducedMotion: reducedMotionProp }: PetHostProps) {
  const settingsEnabled = usePetSettingsStore((s) => s.enabled);
  const settingsReduced = usePetSettingsStore((s) => s.reducedMotion);
  const overlayVisible = usePetSettingsStore((s) => s.overlayVisible);
  const sleepTimeoutMs = usePetSettingsStore((s) => s.sleepTimeoutMs);
  const idleFunIntervalMs = usePetSettingsStore((s) => s.idleFunIntervalMs);
  const setOverlayVisible = usePetSettingsStore((s) => s.setOverlayVisible);

  const enabled = enabledProp ?? settingsEnabled;
  const reducedMotion = reducedMotionProp ?? settingsReduced;

  const [panelOpen, setPanelOpen] = React.useState(false);
  const [animLabel, setAnimLabel] = React.useState<string>('welcome');
  const [claimed, setClaimed] = React.useState(false);
  const [tauri, setTauri] = React.useState(false);
  /** Hide sprite only after mini panel is confirmed open. */
  const [hideSpriteForPanel, setHideSpriteForPanel] = React.useState(false);
  /**
   * Tauri: use inline sprite only when pet-overlay window failed to show.
   * When false and tauri, pet lives solely in the transparent overlay WebView.
   */
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

  // Drive Tauri pet-overlay visibility (single instance).
  React.useEffect(() => {
    if (!claimed || !tauri) return;
    let cancelled = false;

    const sync = async () => {
      const wantVisible = enabled && overlayVisible && !hideSpriteForPanel;
      if (!wantVisible) {
        await hidePetOverlay().catch(() => undefined);
        if (!cancelled && (!enabled || !overlayVisible)) {
          setUseInlineFallback(false);
        }
        return;
      }
      await showPetOverlay().catch((err) => console.warn('[pets] show overlay', err));
      await new Promise((r) => setTimeout(r, 280));
      if (cancelled) return;
      const visible = await isPetOverlayVisible();
      // Only one path: overlay XOR inline fallback — never both.
      setUseInlineFallback(!visible);
      if (!visible) {
        console.warn('[pets] pet-overlay not visible — using in-app fallback sprite only');
      }
    };

    void sync();
    return () => {
      cancelled = true;
    };
  }, [claimed, tauri, enabled, overlayVisible, hideSpriteForPanel]);

  React.useEffect(() => {
    if (enabled && !overlayVisible) {
      setOverlayVisible(true);
    }
  }, [enabled, overlayVisible, setOverlayVisible]);

  const closePanel = React.useCallback(() => {
    setPanelOpen(false);
    setHideSpriteForPanel(false);
    void showPetOverlay().catch(() => undefined);
  }, []);

  const hidePet = React.useCallback(() => {
    setOverlayVisible(false);
    setPanelOpen(false);
    setHideSpriteForPanel(false);
  }, [setOverlayVisible]);

  const openPanel = React.useCallback(async () => {
    setPanelOpen(true);
    if (tauri) {
      const { panelVisible } = await openPetPanelSafely().catch((err) => {
        console.warn('[pets] open panel', err);
        return { panelVisible: false };
      });
      // Hide floating sprite only when panel is actually up.
      setHideSpriteForPanel(panelVisible);
    } else {
      setHideSpriteForPanel(true);
    }
  }, [tauri]);

  React.useEffect(() => {
    const onOpen = () => {
      if (!usePetSettingsStore.getState().enabled) {
        usePetSettingsStore.getState().setEnabled(true);
      }
      usePetSettingsStore.getState().setOverlayVisible(true);
      void openPanel();
    };
    const onShow = () => {
      if (!usePetSettingsStore.getState().enabled) {
        usePetSettingsStore.getState().setEnabled(true);
      }
      usePetSettingsStore.getState().setOverlayVisible(true);
      setPanelOpen(false);
      setHideSpriteForPanel(false);
      void showPetOverlay().catch(() => undefined);
    };
    const onClosePanel = () => closePanel();
    window.addEventListener('jarvis:pet:open-panel', onOpen);
    window.addEventListener('jarvis:pet:show', onShow);
    window.addEventListener('jarvis:pet:close-panel', onClosePanel);
    return () => {
      window.removeEventListener('jarvis:pet:open-panel', onOpen);
      window.removeEventListener('jarvis:pet:show', onShow);
      window.removeEventListener('jarvis:pet:close-panel', onClosePanel);
    };
  }, [closePanel, openPanel]);

  if (!claimed || !enabled || !overlayVisible) return null;

  // Browser: always inline. Tauri: inline only as fallback (not alongside overlay).
  const showInlineSprite =
    !hideSpriteForPanel && (!tauri || useInlineFallback);

  return (
    <>
      <div
        data-pet-host={tauri ? 'tauri' : 'browser'}
        data-pet-instance="1"
        data-pet-panel-open={panelOpen ? 'true' : 'false'}
        data-pet-inline-fallback={useInlineFallback ? 'true' : 'false'}
        data-pet-hide-for-panel={hideSpriteForPanel ? 'true' : 'false'}
        data-pet-renderer-bg-alpha="0"
        hidden
        aria-hidden
      />
      {showInlineSprite && (
        <PetOverlay
          enabled
          reducedMotion={reducedMotion}
          panelOpen={panelOpen}
          onOpenPanel={() => {
            void openPanel();
          }}
          onPanelClose={closePanel}
          onAnimChange={setAnimLabel}
          onRequestClose={hidePet}
          tauriWindowMode={false}
          sleepTimeoutMs={sleepTimeoutMs}
          idleFunIntervalMs={idleFunIntervalMs}
        />
      )}
      {(!tauri || (panelOpen && !hideSpriteForPanel)) && (
        <PetMiniPanel
          open={panelOpen}
          onClose={closePanel}
          onMinimize={closePanel}
          animLabel={animLabel}
          resizable
        />
      )}
    </>
  );
}
