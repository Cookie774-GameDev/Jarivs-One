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
  | { kind: 'starting' }
  | {
      kind: 'ready';
      source: 'system' | 'managed';
      version: string;
      generation?: string;
    }
  | { kind: 'failed'; recoverable: boolean; message: string };

export interface OpenCodeServerConnection {
  baseUrl: string;
  username: string;
  password: string;
  version: string;
  source: 'system' | 'managed';
  generation: string;
}

export interface HarnessRuntimeNativeAdapter {
  available(): boolean;
  detect(): Promise<NativeRuntimeDetection>;
  install(): Promise<NativeRuntimeDetection>;
  cancel(): Promise<boolean>;
  ensureServer(executableId: string): Promise<OpenCodeServerConnection>;
  serverStatus(): Promise<OpenCodeServerConnection | null>;
  listen(listener: (event: NativeRuntimeEvent) => void): Promise<() => void>;
}

export interface HarnessRuntimeManager {
  subscribe(listener: () => void): () => void;
  getSnapshot(): HarnessRuntimeState;
  getConnection(): OpenCodeServerConnection | undefined;
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

function mapUnavailableDetection(detection: NativeRuntimeDetection): HarnessRuntimeState {
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
    case 'starting':
      return { kind: 'starting' };
    case 'ready':
      return { kind: 'starting' };
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
  async ensureServer(executableId) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<OpenCodeServerConnection>('opencode_server_ensure', { executableId });
  },
  async serverStatus() {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<OpenCodeServerConnection | null>('opencode_server_status');
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
  let connection: OpenCodeServerConnection | undefined;

  const publish = (next: HarnessRuntimeState) => {
    snapshot = next;
    subscribers.forEach((subscriber) => subscriber());
  };

  const clearConnection = () => {
    connection = undefined;
  };

  const validatedConnection = (candidate: OpenCodeServerConnection): OpenCodeServerConnection => {
    const url = new URL(candidate.baseUrl);
    const port = Number(url.port);
    if (
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      url.username !== '' ||
      url.password !== '' ||
      url.pathname !== '/' ||
      url.search !== '' ||
      url.hash !== '' ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65_535 ||
      candidate.username !== 'vibespace' ||
      candidate.password.length !== 64 ||
      !/^[A-Za-z0-9_-]+$/.test(candidate.password) ||
      !/^opencode-server-[A-Za-z0-9_-]+$/.test(candidate.generation)
    ) {
      throw new Error('OpenCode server returned an invalid private connection.');
    }
    return candidate;
  };

  const applyDetection = async (detection: NativeRuntimeDetection) => {
    if (detection.status !== 'systemCompatible' && detection.status !== 'managedCompatible') {
      clearConnection();
      publish(mapUnavailableDetection(detection));
      return;
    }
    if (!/^opencode-runtime-[a-f0-9]{24}$/.test(detection.executableId ?? '')) {
      throw new Error('Compatible OpenCode runtime has no trusted executable ID.');
    }
    clearConnection();
    publish({ kind: 'starting' });
    const ready = validatedConnection(await native.ensureServer(detection.executableId as string));
    connection = ready;
    publish({
      kind: 'ready',
      source: ready.source,
      version: boundedCopy(ready.version, 'unknown'),
    });
  };

  const handleEvent = (event: NativeRuntimeEvent) => {
    if (event.kind === 'ready') {
      if (!event.generation) return;
      void native
        .serverStatus()
        .then((status) => {
          if (!status || status.generation !== event.generation) return;
          const ready = validatedConnection(status);
          connection = ready;
          publish({
            kind: 'ready',
            source: ready.source,
            version: boundedCopy(ready.version, 'unknown'),
          });
        })
        .catch((error) => {
          clearConnection();
          publish({
            kind: 'failed',
            recoverable: true,
            message: boundedCopy(error, 'OpenCode server status failed.'),
          });
        });
      return;
    }
    if (
      event.kind === 'starting' ||
      event.kind === 'failed' ||
      event.kind === 'downloading' ||
      event.kind === 'verifying' ||
      event.kind === 'installing'
    ) {
      clearConnection();
    }
    publish(mapEvent(event));
  };

  const refresh = async () => {
    if (!native.available()) {
      clearConnection();
      publish({ kind: 'ready', source: 'system', version: 'web-preview' });
      return;
    }
    publish({ kind: 'checking' });
    try {
      await applyDetection(await native.detect());
    } catch (error) {
      clearConnection();
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
      const stop = await native.listen(handleEvent);
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
    getConnection: () => connection,
    refresh,
    async download() {
      if (!native.available()) {
        await refresh();
        return;
      }
      publish({ kind: 'downloading', progress: 0 });
      try {
        await applyDetection(await native.install());
      } catch (error) {
        clearConnection();
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
