import { useEffect, useSyncExternalStore } from 'react';
import { useUIStore } from '@/stores/ui';
import { getEmpireFreezerConfig, subscribeEmpireFreezer } from './empireFreezer';

const BUSY_RETRY_MS = 30_000;

export function EmpireFreezerHost() {
  const config = useSyncExternalStore(
    subscribeEmpireFreezer,
    getEmpireFreezerConfig,
    getEmpireFreezerConfig,
  );
  const wellnessActive = useUIStore((state) => state.wellnessActive);

  useEffect(() => {
    if (!config.enabled || wellnessActive) return;
    let timer: number | undefined;

    const schedule = (delayMs: number) => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(runWhenSafe, delayMs);
    };

    const runWhenSafe = () => {
      const ui = useUIStore.getState();
      const busy =
        document.visibilityState !== 'visible' ||
        ui.wellnessActive ||
        ui.ambientActive ||
        ui.voiceModalOpen ||
        ui.voiceListening ||
        ui.paletteOpen ||
        ui.settingsOpen ||
        ui.actionsPaletteOpen;
      if (busy) {
        schedule(BUSY_RETRY_MS);
        return;
      }
      ui.startWellness('eye-break-20-20-20', config.durationMs);
    };

    schedule(config.intervalMs);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [config, wellnessActive]);

  return null;
}
