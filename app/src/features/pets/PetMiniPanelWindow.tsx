/**
 * Dedicated entry for Tauri window label `pet-mini-panel`.
 * Functional panel: chats / terminals / activity with close confirmation.
 */
import * as React from 'react';
import { PetMiniPanel } from './PetMiniPanel';
import { applyThemeToDocument, useUIStore } from '@/stores/ui';

export function PetMiniPanelWindow() {
  const [open, setOpen] = React.useState(true);
  const theme = useUIStore((s) => s.theme);

  React.useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  return (
    <div data-pet-window="pet-mini-panel" className="h-screen w-screen overflow-hidden bg-background">
      <PetMiniPanel
        open={open}
        windowMode
        onClose={() => setOpen(false)}
        animLabel="idlePrimary"
      />
    </div>
  );
}
