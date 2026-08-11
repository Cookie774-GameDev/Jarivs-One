import type { HarnessRuntimeState } from './types';

const RUNTIME_STATE_EVENT = 'vibespace://opencode-runtime-state';
const MAX_COPY_LENGTH = 512;

export interface NativeRuntimeDetection {
  status: 'systemCompatible' | 'managedCompatible' | 'incompatible' | 'missing';
  source?: 'system' | 'managed';
  version?: string;
  reason?: string;
  executableId?: string;
  executablePath?: string;
  fingerprintSha256?: string;
}

export type NativeRuntimeEvent =
  | { kind: 'downloading'; progress: number }
  | { kind: 'verifying' }
  | { kind: 'installing' }
  | { kind: 'ready'; source: 'system' | 'managed'; version: string }
  | { kind: 'failed'; recoverable: boolean; message: string };

export interface HarnessRuntimeNativeAdapter {
  available(): boolean;
  detect(): Promise<NativeRuntimeDetection>;
  install(): Promise<NativeRuntimeDetection>;
  cancel(): Promise<boolean>;
  listen(listener: (event: NativeRuntimeEvent) => void): Promise<() => void>;
}

export interface HarnessRuntimeManager {
  subscribe(listener: () => void): () => void;
  getSnapshot(): HarnessRuntimeState;
  refresh(): Promise<void>;
  download(): Promise<void>;
  cancel(): Promise<void>;
}

function boundedCopy(value: unknown, fallback: string): string {
  const text =
    typeof value === 'string' ? value : value instanceof Error ? value.message : fallback;
  const normalized = text.replace(/\s+/g, ' ').trim() || fallback;
  return normalized.length <= MAX_COPY_LENGTH
    ? normalized
    : `${normalized.slice(0, MAX_COPY_LENGTH - 1)}…`;
}

function mapDetection(detection: NativeRuntimeDetection): HarnessRuntimeState {
  if (detection.status === 'systemCompatible' || detection.status === 'managedCompatible') {
    return {
      kind: 'ready',
      source:
        detection.status === 'managedCompatible' || detection.source === 'managed'
          ? 'managed'
          : 'system',
      version: boundedCopy(detection.version, 'unknown'),
    };
  }
  if (detection.status === 'missing') {
    return { kind: 'download_required' };
  }
  return {
    kind: 'incompatible',
    reason: boundedCopy(detection.reason, 'OpenCode runtime is incompatible.'),
  };
}

function mapEvent(event: NativeRuntimeEvent): HarnessRuntimeState {
  switch (event.kind) {
    case 'downloading':
      return {
        kind: 'downloading',
        progress: Number.isFinite(event.progress) ? Math.min(1, Math.max(0, event.progress)) : 0,
      };
    case 'verifying':
      return { kind: 'verifying' };
    case 'installing':
      return { kind: 'installing' };
    case 'ready':
      return {
        kind: 'ready',
        source: event.source,
        version: boundedCopy(event.version, 'unknown'),
      };
    case 'failed':
      return {
        kind: 'failed',
        recoverable: event.recoverable,
        message: boundedCopy(event.message, 'Harness installation failed.'),
      };
  }
}

const nativeAdapter: HarnessRuntimeNativeAdapter = {
  available: () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window,
  async detect() {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<NativeRuntimeDetection>('opencode_runtime_detect');
  },
  async install() {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<NativeRuntimeDetection>('opencode_runtime_install');
  },
  async cancel() {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<boolean>('opencode_runtime_install_cancel');
  },
  async listen(listener) {
    const { listen } = await import('@tauri-apps/api/event');
    return listen<NativeRuntimeEvent>(RUNTIME_STATE_EVENT, ({ payload }) => {
      listener(payload);
    });
  },
};

export function createHarnessRuntimeManager(
  native: HarnessRuntimeNativeAdapter = nativeAdapter,
): HarnessRuntimeManager {
  let snapshot: HarnessRuntimeState = { kind: 'checking' };
  const subscribers = new Set<() => void>();
  let unlisten: (() => void) | undefined;
  let activation = 0;

  const publish = (next: HarnessRuntimeState) => {
    snapshot = next;
    subscribers.forEach((subscriber) => subscriber());
  };

  const refresh = async () => {
    if (!native.available()) {
      publish({ kind: 'ready', source: 'system', version: 'web-preview' });
      return;
    }
    publish({ kind: 'checking' });
    try {
      publish(mapDetection(await native.detect()));
    } catch (error) {
      publish({
        kind: 'failed',
        recoverable: true,
        message: boundedCopy(error, 'Harness detection failed.'),
      });
    }
  };

  const activate = async (generation: number) => {
    if (!native.available()) {
      await refresh();
      return;
    }
    try {
      const stop = await native.listen((event) => publish(mapEvent(event)));
      if (generation !== activation || subscribers.size === 0) {
        stop();
        return;
      }
      unlisten = stop;
      await refresh();
    } catch (error) {
      if (generation === activation) {
        publish({
          kind: 'failed',
          recoverable: true,
          message: boundedCopy(error, 'Harness runtime events are unavailable.'),
        });
      }
    }
  };

  return {
    subscribe(listener) {
      subscribers.add(listener);
      if (subscribers.size === 1) {
        activation += 1;
        void activate(activation);
      }
      return () => {
        subscribers.delete(listener);
        if (subscribers.size === 0) {
          activation += 1;
          unlisten?.();
          unlisten = undefined;
        }
      };
    },
    getSnapshot: () => snapshot,
    refresh,
    async download() {
      if (!native.available()) {
        await refresh();
        return;
      }
      publish({ kind: 'downloading', progress: 0 });
      try {
        publish(mapDetection(await native.install()));
      } catch (error) {
        publish({
          kind: 'failed',
          recoverable: true,
          message: boundedCopy(error, 'Harness installation failed.'),
        });
      }
    },
    async cancel() {
      if (native.available()) {
        try {
          await native.cancel();
        } catch (error) {
          publish({
            kind: 'failed',
            recoverable: true,
            message: boundedCopy(error, 'Harness cancellation failed.'),
          });
        }
      }
    },
  };
}

export const harnessRuntimeManager = createHarnessRuntimeManager();
