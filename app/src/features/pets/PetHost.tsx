/**
 * Main-window pet coordinator.
 *
 * Strategy for non-disappearing pet:
 * - Always keep an in-app transparent sprite when enabled (reliable).
 * - Also drive Tauri pet-overlay when available (desktop always-on-top).
 * - Opening mini panel: try Tauri panel first; only hide overlay after panel
 *   is confirmed visible. If panel fails, keep sprite and open in-app panel.
 */
import * as React from 'react';
import { PetOverlay } from './PetOverlay';
import { PetMiniPanel } from './PetMiniPanel';
import {
  claimPetHostInstance,
  hidePetOverlay,
  isPetPanelVisible,
  isTauriRuntime,
  openOrFocusPetPanel,
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
  /** When true, hide in-app sprite (panel open and confirmed). */
  const [hideSpriteForPanel, setHideSpriteForPanel] = React.useState(false);

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

  // Keep Tauri overlay shown whenever pet should be visible (not while panel open).
  React.useEffect(() => {
    if (!claimed || !tauri) return;
    const wantVisible = enabled && overlayVisible && !hideSpriteForPanel;
    if (wantVisible) {
      void showPetOverlay().catch((err) => console.warn('[pets] show overlay', err));
    } else if (hideSpriteForPanel) {
      void hidePetOverlay().catch(() => undefined);
    } else if (!enabled || !overlayVisible) {
      void hidePetOverlay().catch(() => undefined);
    }
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
      await openOrFocusPetPanel().catch((err) => console.warn('[pets] open panel', err));
      // Only hide sprite if panel actually opened; otherwise keep pet visible.
      await new Promise((r) => setTimeout(r, 200));
      const panelOk = await isPetPanelVisible();
      if (panelOk) {
        setHideSpriteForPanel(true);
        void hidePetOverlay().catch(() => undefined);
      } else {
        // Panel failed — keep sprite, still mark panelOpen for in-app mini panel.
        setHideSpriteForPanel(false);
        void showPetOverlay().catch(() => undefined);
      }
    } else {
      // Browser: hide floating sprite while in-app panel is open.
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

  // Always mount in-app sprite when not hidden for a confirmed panel — prevents random disappear.
  const showInlineSprite = !hideSpriteForPanel;

  return (
    <>
      <div
        data-pet-host={tauri ? 'tauri' : 'browser'}
        data-pet-instance="1"
        data-pet-panel-open={panelOpen ? 'true' : 'false'}
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
      {/* In-app mini panel when not in Tauri, or as fallback when Tauri panel fails */}
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
