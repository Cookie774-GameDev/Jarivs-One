/**
 * Dedicated entry for Tauri window label `pet-overlay`.
 * Transparent, frameless surface — Pixi pet only.
 */
import * as React from 'react';
import { PetOverlay } from './PetOverlay';
import { openPetPanelSafely } from './petTauriBridge';
import { installPetPresentationStorageSync } from './petPresentationStore';
import { installPetSettingsStorageSync, usePetSettingsStore } from './petSettingsStore';

export function PetOverlayWindow() {
  const reducedMotion = usePetSettingsStore((s) => s.reducedMotion);
  const sleepTimeoutMs = usePetSettingsStore((s) => s.sleepTimeoutMs);
  const idleFunIntervalMs = usePetSettingsStore((s) => s.idleFunIntervalMs);

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

  return (
    <div
      data-pet-window="pet-overlay"
      data-testid="pet-overlay-root"
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
          // Same confirm-then-hide path as PetHost — never hide overlay unless panel is visible.
          void openPetPanelSafely();
        }}
      />
    </div>
  );
}
