/**
 * Dedicated entry for Tauri window label `pet-overlay`.
 * Transparent, frameless surface — Pixi pet only.
 *
 * Click opens the real mini panel via openOrFocusPetMiniPanel (shared with Axo).
 * Does not alter Glitch animation/drag — only panel open wiring.
 */
import * as React from 'react';
import { PetOverlay } from './PetOverlay';
import {
  openOrFocusPetMiniPanel,
  reassertPetOverlayTopmost,
  setPetPanelOpenFlag,
  showPetOverlay,
} from './petTauriBridge';
import { installPetPresentationStorageSync } from './petPresentationStore';
import { installPetSettingsStorageSync, usePetSettingsStore } from './petSettingsStore';

export function PetOverlayWindow() {
  const reducedMotion = usePetSettingsStore((s) => s.reducedMotion);
  const sleepTimeoutMs = usePetSettingsStore((s) => s.sleepTimeoutMs);
  const idleFunIntervalMs = usePetSettingsStore((s) => s.idleFunIntervalMs);
  const panelMode = usePetSettingsStore((s) => s.panelMode) ?? 'normal';

  React.useEffect(() => {
    document.documentElement.dataset.vibespaceView = 'pet-overlay';
    document.body.dataset.vibespaceView = 'pet-overlay';
    document.documentElement.style.background = 'transparent';
    document.documentElement.style.backgroundColor = 'transparent';
    document.documentElement.style.backgroundImage = 'none';
    document.body.style.background = 'transparent';
    document.body.style.backgroundColor = 'transparent';
    document.body.style.backgroundImage = 'none';
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    const root = document.getElementById('root');
    if (root) {
      root.style.background = 'transparent';
      root.style.backgroundColor = 'transparent';
      root.style.backgroundImage = 'none';
      root.style.width = '144px';
      root.style.height = '144px';
      root.style.margin = '0';
      root.style.padding = '0';
      root.style.overflow = 'hidden';
    }
    const uninstallPresentationSync = installPetPresentationStorageSync();
    const uninstallSettingsSync = installPetSettingsStorageSync();
    return () => {
      uninstallPresentationSync();
      uninstallSettingsSync();
      if (document.documentElement.dataset.vibespaceView === 'pet-overlay') {
        delete document.documentElement.dataset.vibespaceView;
      }
      if (document.body.dataset.vibespaceView === 'pet-overlay') {
        delete document.body.dataset.vibespaceView;
      }
    };
  }, []);

  React.useEffect(() => {
    const recoverTopmost = () => {
      if (document.visibilityState === 'hidden') return;
      void reassertPetOverlayTopmost().catch(() => undefined);
    };
    recoverTopmost();
    const interval = window.setInterval(recoverTopmost, 45_000);
    window.addEventListener('focus', recoverTopmost);
    window.addEventListener('pageshow', recoverTopmost);
    document.addEventListener('visibilitychange', recoverTopmost);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', recoverTopmost);
      window.removeEventListener('pageshow', recoverTopmost);
      document.removeEventListener('visibilitychange', recoverTopmost);
    };
  }, []);

  return (
    <div
      data-pet-window="pet-overlay"
      data-testid="pet-overlay-root"
      data-monochrome-surface="pet-overlay-window"
      className="pet-overlay-root"
      style={{
        width: 144,
        height: 144,
        background: 'transparent',
        backgroundColor: 'transparent',
        backgroundImage: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <PetOverlay
        enabled
        reducedMotion={reducedMotion}
        tauriWindowMode
        sleepTimeoutMs={sleepTimeoutMs}
        idleFunIntervalMs={idleFunIntervalMs}
        onOpenPanel={() => {
          // Shared Axo+Glitch path: single-flight open, confirm-then-hide overlay.
          // Does NOT hide overlay optimistically before confirm (avoids both-hidden).
          void openOrFocusPetMiniPanel(undefined, undefined, panelMode)
            .then(({ panelVisible }) => {
              if (!panelVisible) {
                // Bridge already restored overlay + cleared flag; keep fail-open.
                setPetPanelOpenFlag(false);
                void showPetOverlay().catch(() => undefined);
              }
            })
            .catch(() => {
              setPetPanelOpenFlag(false);
              void showPetOverlay().catch(() => undefined);
            });
        }}
      />
    </div>
  );
}
