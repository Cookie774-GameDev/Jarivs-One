/**
 * Dedicated entry for Tauri window label `pet-mini-panel`.
 * Boots local auth/DB (AuthGate) then mounts the real mini-panel surfaces.
 */
import * as React from 'react';
import { AuthGate } from '@/features/auth/AuthGate';
import { PetMiniPanel } from './PetMiniPanel';
import { applyThemeToDocument, useUIStore } from '@/stores/ui';
import { installPetPresentationStorageSync } from './petPresentationStore';

export function PetMiniPanelWindow() {
  const [open, setOpen] = React.useState(true);
  const theme = useUIStore((s) => s.theme);

  React.useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  React.useEffect(() => installPetPresentationStorageSync(), []);

  return (
    <div data-pet-window="pet-mini-panel" className="h-screen w-screen overflow-hidden bg-background">
      <AuthGate>
        <PetMiniPanel
          open={open}
          windowMode
          onClose={() => setOpen(false)}
          animLabel="idlePrimary"
        />
      </AuthGate>
    </div>
  );
}
