/**
 * Synchronous workspace persistence flush before tray-hide, updater
 * relaunch, or page unload. Debounced writers (transcripts, pane trees,
 * zustand persist) can lose the last few hundred ms without this.
 */
import { flushTranscriptStorage } from '@/features/terminals/transcriptStore';
import { forEachLiveTree } from '@/features/terminals/terminalLiveCache';
import { saveTerminalTree } from '@/features/terminals/terminalProjectMove';
import { flushRegisteredTerminalSnapshots } from '@/features/terminals/terminalSnapshotRegistry';

export interface WorkspaceFlushResult {
  completed: number;
  failed: number;
  timedOut: boolean;
}

const PERSIST_KEY_PREFIXES = [
  'jarvis-ui',
  'jarvis-auth',
  'jarvis-terminal-transcripts',
  'jarvis-terminal-transcripts-backup',
  'jarvis-terminal-scheduler-v1',
  'jarvis-tools',
] as const;

function flushDebouncedLocalStorageKeys(): void {
  if (typeof window === 'undefined') return;
  for (const key of PERSIST_KEY_PREFIXES) {
    try {
      const value = window.localStorage.getItem(key);
      if (value !== null) {
        window.localStorage.setItem(key, value);
      }
    } catch {
      /* quota or private mode */
    }
  }

  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith('jarvis-terminal-pane-tree')) continue;
      const value = window.localStorage.getItem(key);
      if (value !== null) window.localStorage.setItem(key, value);
    }
  } catch {
    /* ignore */
  }
}

/** Flush terminal transcripts, pane trees, and persisted UI state to disk. */
export async function flushWorkspacePersistence(
  reason?: string,
): Promise<WorkspaceFlushResult> {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('jarvis:terminal:persist-now', {
          detail: { reason: reason ?? 'manual' },
        }),
      );
    }
    forEachLiveTree((projectId, tree) => {
      saveTerminalTree(projectId, tree);
    });
    flushTranscriptStorage();
    flushDebouncedLocalStorageKeys();
  } catch (err) {
    console.warn('[workspace] persistence flush failed:', err);
  }
  const result = await flushRegisteredTerminalSnapshots();
  if (reason && import.meta.env.DEV) {
    console.info(
      `[workspace] flushed persistence (${reason}; completed=${result.completed}, failed=${result.failed}, timedOut=${result.timedOut})`,
    );
  }
  return result;
}

export async function flushWorkspacePersistenceAndAcknowledge(
  reason: string,
  acknowledge: () => Promise<unknown>,
): Promise<WorkspaceFlushResult> {
  try {
    return await flushWorkspacePersistence(reason);
  } finally {
    await acknowledge();
  }
}
