/**
 * Dedicated entry for Tauri window label `pet-overlay`.
 * Transparent, frameless surface — Pixi pet only.
 */
import * as React from 'react';
import { PetOverlay } from './PetOverlay';
import { openOrFocusPetPanel } from './petTauriBridge';

export function PetOverlayWindow() {
  React.useEffect(() => {
    // Ensure document background is transparent for the frameless window.
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
        tauriWindowMode
        onOpenPanel={() => {
          void openOrFocusPetPanel();
        }}
      />
    </div>
  );
}
