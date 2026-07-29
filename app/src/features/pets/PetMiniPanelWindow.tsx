/**
 * Dedicated entry for Tauri window label `pet-mini-panel`.
 * Boots local auth/DB (AuthGate) then mounts the real mini-panel surfaces.
 */
import * as React from 'react';
import { AuthGate } from '@/features/auth/AuthGate';
import { PetMiniPanel } from './PetMiniPanel';
import { applyThemeToDocument, useUIStore } from '@/stores/ui';
import { installPetPresentationStorageSync } from './petPresentationStore';
import { installPetSettingsStorageSync } from './petSettingsStore';

export function PetMiniPanelWindow() {
  const [open, setOpen] = React.useState(true);
  const theme = useUIStore((s) => s.theme);

  React.useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  React.useEffect(() => {
    const uninstallPresentation = installPetPresentationStorageSync();
    const uninstallSettings = installPetSettingsStorageSync();
    return () => {
      uninstallPresentation();
      uninstallSettings();
    };
  }, []);

  return (
    <div
      data-pet-window="pet-mini-panel"
      data-monochrome-surface="pet-mini-panel-window"
      className="h-screen w-screen overflow-hidden bg-background [html[data-theme=monochrome]_&]:font-sans [html[data-theme=monochrome]_&_*]:shadow-none"
    >
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
