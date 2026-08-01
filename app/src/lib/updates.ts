import { isTauri } from '@/lib/utils';
import { flushWorkspacePersistence } from '@/lib/persistence/workspaceFlush';
import { resolveRuntimePlan } from '@/lib/runtimeProfile';

export const AUTO_UPDATE_KEY = 'jarvis-auto-update';

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'installed'
  | 'none'
  | 'error';

export interface UpdateProgress {
  phase: UpdatePhase;
  downloadedBytes?: number;
  totalBytes?: number;
}

export interface UpdateResult {
  available: boolean;
  installed: boolean;
  version?: string;
  notes?: string;
}

/** A pending update returned by the updater check seam. `handle` is opaque. */
interface PendingUpdate {
  readonly version: string;
  readonly notes?: string;
  readonly handle: unknown;
}

/** The updater download/install progress event shape used by the install seam. */
interface UpdateDownloadEvent {
  event: 'Started' | 'Progress' | 'Finished' | (string & {});
  data: { contentLength?: number | null; chunkLength: number };
}

/** Private adapters for the five frozen `updates.ts` side-effect rows. */
interface UpdateEffectSeams {
  /** Row 1: query the updater for an available update (network/update effect). */
  checkUpdate(): Promise<PendingUpdate | undefined>;
  /** Rows 2 & 4: flush workspace persistence before install/relaunch (persistence). */
  flushPersistence(reason: 'pre-update-install' | 'pre-update-relaunch'): Promise<unknown>;
  /** Row 3: download and install the pending update (network/update effect). */
  installUpdate(
    update: PendingUpdate,
    onEvent: (event: UpdateDownloadEvent) => void,
  ): Promise<void>;
  /** Row 5: relaunch the application (process effect). */
  relaunch(): Promise<void>;
}

const updateEffectAdapters: UpdateEffectSeams = {
  async checkUpdate() {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update) return undefined;
    return { version: update.version, notes: update.body, handle: update };
  },
  async flushPersistence(reason) {
    return flushWorkspacePersistence(reason);
  },
  async installUpdate(update, onEvent) {
    const handle = update.handle as {
      downloadAndInstall(cb: (event: UpdateDownloadEvent) => void): Promise<void>;
    };
    await handle.downloadAndInstall(onEvent);
  },
  async relaunch() {
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  },
};

/**
 * Fail-closed guard for the frozen update side-effect rows. In the visual-test
 * runtime profile every persistence/process/network/update effect is denied
 * before its adapter runs; ordinary mode passes through unchanged.
 */
function assertUpdateEffectsAllowed(effect: string): void {
  const plan = resolveRuntimePlan();
  if (!plan.updateEffectsEnabled) {
    throw new Error(
      `Update effect "${effect}" denied by the visual-test runtime profile (updates disabled).`,
    );
  }
}

export function getAutoUpdateEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(AUTO_UPDATE_KEY) !== '0';
}

export function setAutoUpdateEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(AUTO_UPDATE_KEY, enabled ? '1' : '0');
}

export async function checkForAppUpdate(
  options: {
    install?: boolean;
    onProgress?: (progress: UpdateProgress) => void;
  } = {},
): Promise<UpdateResult> {
  if (!isTauri) {
    throw new Error('Updates are only available in the installed desktop app.');
  }

  // Row 1: updater check (network/update effect).
  assertUpdateEffectsAllowed('updater-check');
  const update = await updateEffectAdapters.checkUpdate();

  if (!update) {
    options.onProgress?.({ phase: 'none' });
    return { available: false, installed: false };
  }

  const version = update.version;
  const notes = update.notes;

  if (!options.install) {
    options.onProgress?.({ phase: 'available' });
    return { available: true, installed: false, version, notes };
  }

  // Row 2: persistence flush before install.
  assertUpdateEffectsAllowed('persistence-flush-install');
  await updateEffectAdapters.flushPersistence('pre-update-install');

  let downloadedBytes = 0;
  let totalBytes: number | undefined;
  options.onProgress?.({ phase: 'downloading', downloadedBytes, totalBytes });

  // Row 3: download and install (network/update effect).
  assertUpdateEffectsAllowed('download-and-install');
  await updateEffectAdapters.installUpdate(update, (event) => {
    if (event.event === 'Started') {
      downloadedBytes = 0;
      totalBytes = event.data.contentLength ?? undefined;
      options.onProgress?.({ phase: 'downloading', downloadedBytes, totalBytes });
      return;
    }
    if (event.event === 'Progress') {
      downloadedBytes += event.data.chunkLength;
      options.onProgress?.({ phase: 'downloading', downloadedBytes, totalBytes });
      return;
    }
    if (event.event === 'Finished') {
      options.onProgress?.({ phase: 'installing', downloadedBytes, totalBytes });
    }
  });

  options.onProgress?.({ phase: 'installed', downloadedBytes, totalBytes });

  // Row 4: persistence flush before relaunch.
  assertUpdateEffectsAllowed('persistence-flush-relaunch');
  await updateEffectAdapters.flushPersistence('pre-update-relaunch');

  // Row 5: relaunch (process effect).
  assertUpdateEffectsAllowed('relaunch');
  try {
    await updateEffectAdapters.relaunch();
  } catch (err) {
    console.warn('[updates] relaunch failed after install', err);
  }

  return { available: true, installed: true, version, notes };
}
