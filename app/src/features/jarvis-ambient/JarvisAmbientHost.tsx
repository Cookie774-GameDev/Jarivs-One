import * as React from 'react';

import { useJarvisTaskRunStore } from '@/features/jarvis-runs/taskRunStore';
import {
  getJarvisPlaybackEnergy,
  subscribeJarvisPlaybackEnergy,
} from '@/features/voice/jarvisPlaybackEnergy';
import { useVoiceStore } from '@/features/voice/store';
import { JarvisEdgeAura, normalizeAmbientSnapshot } from './JarvisEdgeAura';
import { projectJarvisAmbientSnapshot } from './projection';
import { getJarvisInputEnergy, subscribeJarvisInputEnergy } from './voiceEnergy';
import type { JarvisAmbientSnapshot } from './types';

const AMBIENT_EVENT = 'jarvis://ambient-snapshot';
const ENERGY_FRAME_MS = 34;

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function nextRevision(previous: number): number {
  return Math.max(previous + 1, Math.trunc(Date.now() * 1_000));
}

function currentEnergy(): number {
  const state = useVoiceStore.getState().state;
  if (state === 'listening') return getJarvisInputEnergy();
  if (state === 'speaking') return getJarvisPlaybackEnergy();
  return 0;
}

export function JarvisAmbientHost() {
  React.useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    let timer: number | null = null;
    let expiryTimer: number | null = null;
    let revision = 0;
    let lastSignature = '';
    let sendChain: Promise<unknown> = Promise.resolve();

    const flush = () => {
      timer = null;
      if (disposed) return;
      revision = nextRevision(revision);
      const snapshot = projectJarvisAmbientSnapshot({
        revision,
        observedAt: Date.now(),
        voiceState: useVoiceStore.getState().state,
        runs: Object.values(useJarvisTaskRunStore.getState().runs),
        energy: currentEnergy(),
      });
      const signature = `${snapshot.state}:${snapshot.source}:${snapshot.energy}:${snapshot.transientUntil ?? 0}`;
      if (expiryTimer !== null) {
        window.clearTimeout(expiryTimer);
        expiryTimer = null;
      }
      if (snapshot.transientUntil !== undefined) {
        expiryTimer = window.setTimeout(
          flush,
          Math.max(1, snapshot.transientUntil - Date.now() + 1),
        );
      }
      if (signature === lastSignature) return;
      lastSignature = signature;
      sendChain = sendChain
        .then(async () => {
          const { invoke } = await import('@tauri-apps/api/core');
          return invoke('set_jarvis_ambient_snapshot', { snapshot });
        })
        .catch(() => undefined);
    };

    const schedule = () => {
      if (disposed || timer !== null) return;
      timer = window.setTimeout(flush, ENERGY_FRAME_MS);
    };

    const unsubscribers = [
      useVoiceStore.subscribe(schedule),
      useJarvisTaskRunStore.subscribe(schedule),
      subscribeJarvisInputEnergy(schedule),
      subscribeJarvisPlaybackEnergy(schedule),
    ];
    flush();
    return () => {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
      if (expiryTimer !== null) window.clearTimeout(expiryTimer);
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, []);
  return null;
}

export function JarvisAmbientOverlayView() {
  const [snapshot, setSnapshot] = React.useState<JarvisAmbientSnapshot>(() =>
    normalizeAmbientSnapshot(null),
  );

  React.useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void Promise.all([import('@tauri-apps/api/event'), import('@tauri-apps/api/core')])
      .then(async ([{ listen }, { invoke }]) => {
        unlisten = await listen<unknown>(AMBIENT_EVENT, (event) => {
          if (!disposed) setSnapshot(normalizeAmbientSnapshot(event.payload));
        });
        const initial = await invoke<unknown>('jarvis_ambient_renderer_ready');
        if (!disposed) setSnapshot(normalizeAmbientSnapshot(initial));
      })
      .catch(() => {
        if (!disposed) setSnapshot(normalizeAmbientSnapshot(null));
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return <JarvisEdgeAura snapshot={snapshot} />;
}
