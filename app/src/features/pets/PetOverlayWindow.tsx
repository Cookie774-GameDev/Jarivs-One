/**
 * Dedicated entry for Tauri window label `pet-overlay`.
 * Transparent, frameless surface — Pixi pet only.
 */
import * as React from 'react';
import { PetOverlay } from './PetOverlay';
import { openOrFocusPetPanel } from './petTauriBridge';
import { installPetPresentationStorageSync } from './petPresentationStore';
import { usePetSettingsStore } from './petSettingsStore';

export function PetOverlayWindow() {
  const reducedMotion = usePetSettingsStore((s) => s.reducedMotion);
  const sleepTimeoutMs = usePetSettingsStore((s) => s.sleepTimeoutMs);
  const idleFunIntervalMs = usePetSettingsStore((s) => s.idleFunIntervalMs);

  React.useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    document.body.style.margin = '0';
    document.body.style.overflow = 'hidden';
    const root = document.getElementById('root');
    if (root) {
      root.style.background = 'transparent';
      root.style.width = '144px';
      root.style.height = '144px';
    }
    return installPetPresentationStorageSync();
  }, []);

  return (
    <div
      data-pet-window="pet-overlay"
      style={{
        width: 144,
        height: 144,
        background: 'transparent',
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
          void openOrFocusPetPanel();
        }}
      />
    </div>
  );
}
