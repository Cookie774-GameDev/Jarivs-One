/**
 * Main-window pet host.
 * In Tauri: shows the separate pet-overlay window (no embedded duplicate pet).
 * Browser fallback: embeds PetOverlay + PetMiniPanel in the main shell.
 * Enforces single PetHost instance.
 */
import * as React from 'react';
import { PetOverlay } from './PetOverlay';
import { PetMiniPanel } from './PetMiniPanel';
import {
  claimPetHostInstance,
  isTauriRuntime,
  releasePetHostInstance,
  showPetOverlay,
} from './petTauriBridge';

export interface PetHostProps {
  enabled?: boolean;
  reducedMotion?: boolean;
}

export function PetHost({ enabled = true, reducedMotion = false }: PetHostProps) {
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [animLabel, setAnimLabel] = React.useState<string>('welcome');
  const [claimed, setClaimed] = React.useState(false);
  const [tauri, setTauri] = React.useState(false);

  React.useEffect(() => {
    if (!enabled) return;
    if (!claimPetHostInstance()) {
      console.warn('[pets] duplicate PetHost prevented');
      return;
    }
    setClaimed(true);
    const inTauri = isTauriRuntime();
    setTauri(inTauri);
    if (inTauri) {
      void showPetOverlay();
    }
    return () => {
      releasePetHostInstance();
    };
  }, [enabled]);

  const openPanel = React.useCallback(() => {
    setPanelOpen(true);
  }, []);

  const closePanel = React.useCallback(() => {
    setPanelOpen(false);
  }, []);

  if (!enabled || !claimed) return null;

  // Tauri: pet lives in pet-overlay window; main only coordinates panel state.
  if (tauri) {
    return (
      <div data-pet-host="tauri" data-pet-instance="1" hidden aria-hidden>
        {/* Mini-panel is its own Tauri window; keep a headless lifecycle mirror if needed later. */}
      </div>
    );
  }

  // Browser / test fallback: embedded overlay + panel.
  return (
    <>
      <PetOverlay
        enabled={enabled}
        reducedMotion={reducedMotion}
        panelOpen={panelOpen}
        onOpenPanel={openPanel}
        onPanelClose={closePanel}
        onAnimChange={setAnimLabel}
        tauriWindowMode={false}
      />
      <PetMiniPanel open={panelOpen} onClose={closePanel} animLabel={animLabel} />
    </>
  );
}
