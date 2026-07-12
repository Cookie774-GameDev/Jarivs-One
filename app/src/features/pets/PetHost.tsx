/**
 * Main-window pet coordinator.
 *
 * Single visible pet path:
 * - Tauri: prefer dedicated pet-overlay; inline only as fallback.
 * - Never show standalone pet while mini panel is visible.
 * - Poll isPetPanelVisible so overlay-window opens still hide the pet.
 */
import * as React from 'react';
import { PetOverlay } from './PetOverlay';
import { PetMiniPanel } from './PetMiniPanel';
import {
  claimPetHostInstance,
  hidePetOverlay,
  isPetOverlayVisible,
  isPetPanelVisible,
  isTauriRuntime,
  openPetPanelSafely,
  PET_PANEL_OPEN_FLAG_KEY,
  readPetPanelOpenFlag,
  releasePetHostInstance,
  setPetPanelOpenFlag,
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
  /** Hide sprite when mini panel is open (local UI or Tauri panel). */
  const [hideSpriteForPanel, setHideSpriteForPanel] = React.useState(false);
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

  // Cross-window panel flag (pet-overlay → main) + Tauri poll.
  React.useEffect(() => {
    if (!claimed) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== PET_PANEL_OPEN_FLAG_KEY) return;
      const open = e.newValue === '1';
      setHideSpriteForPanel(open);
      setPanelOpen(open);
    };
    window.addEventListener('storage', onStorage);
    // Seed from flag
    if (readPetPanelOpenFlag()) {
      setHideSpriteForPanel(true);
      setPanelOpen(true);
    }
    return () => window.removeEventListener('storage', onStorage);
  }, [claimed]);

  // Poll Tauri panel visibility so we never leave pet+panel both open.
  React.useEffect(() => {
    if (!claimed || !tauri) return;
    let cancelled = false;
    const tick = async () => {
      const panelVis = await isPetPanelVisible();
      if (cancelled) return;
      if (panelVis) {
        setHideSpriteForPanel(true);
        setPanelOpen(true);
        setPetPanelOpenFlag(true);
        await hidePetOverlay().catch(() => undefined);
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 400);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [claimed, tauri]);

  // Drive Tauri pet-overlay visibility.
  React.useEffect(() => {
    if (!claimed || !tauri) return;
    let cancelled = false;

    const sync = async () => {
      const panelVis = await isPetPanelVisible().catch(() => false);
      const flagOpen = readPetPanelOpenFlag();
      const panelIsOpen = panelVis || flagOpen || hideSpriteForPanel;
      const wantVisible = enabled && overlayVisible && !panelIsOpen;
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
      setUseInlineFallback(!visible);
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
    setPetPanelOpenFlag(false);
    void showPetOverlay().catch(() => undefined);
  }, []);

  const hidePet = React.useCallback(() => {
    setOverlayVisible(false);
    setPanelOpen(false);
    setHideSpriteForPanel(false);
    setPetPanelOpenFlag(false);
  }, [setOverlayVisible]);

  const openPanel = React.useCallback(async () => {
    setPanelOpen(true);
    setHideSpriteForPanel(true);
    setPetPanelOpenFlag(true);
    if (tauri) {
      const { panelVisible } = await openPetPanelSafely().catch((err) => {
        console.warn('[pets] open panel', err);
        return { panelVisible: false };
      });
      if (!panelVisible) {
        // Panel failed — keep in-app mini panel, still hide floating pet while open=true
        // User asked pet to hide when panel open; in-app panel counts.
        setHideSpriteForPanel(true);
      }
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
      setPetPanelOpenFlag(false);
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

  const showInlineSprite = !hideSpriteForPanel && (!tauri || useInlineFallback);

  return (
    <>
      <div
        data-pet-host={tauri ? 'tauri' : 'browser'}
        data-pet-instance="1"
        data-pet-panel-open={panelOpen || hideSpriteForPanel ? 'true' : 'false'}
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
      {/* Browser / inline fallback: in-app mini panel. Tauri primary path uses pet-mini-panel window. */}
      {(!tauri || useInlineFallback) && (
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
