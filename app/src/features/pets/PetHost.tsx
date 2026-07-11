/**
 * Owns PetOverlay + PetMiniPanel. Wires click/sleep-wake to a real panel.
 */
import * as React from 'react';
import { PetOverlay } from './PetOverlay';
import { PetMiniPanel } from './PetMiniPanel';

export interface PetHostProps {
  enabled?: boolean;
  reducedMotion?: boolean;
}

export function PetHost({ enabled = true, reducedMotion = false }: PetHostProps) {
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [animLabel, setAnimLabel] = React.useState<string>('welcome');

  const openPanel = React.useCallback(() => {
    setPanelOpen(true);
  }, []);

  const closePanel = React.useCallback(() => {
    setPanelOpen(false);
  }, []);

  if (!enabled) return null;

  return (
    <>
      <PetOverlay
        enabled={enabled}
        reducedMotion={reducedMotion}
        panelOpen={panelOpen}
        onOpenPanel={openPanel}
        onPanelClose={closePanel}
        onAnimChange={setAnimLabel}
      />
      <PetMiniPanel open={panelOpen} onClose={closePanel} animLabel={animLabel} />
    </>
  );
}
