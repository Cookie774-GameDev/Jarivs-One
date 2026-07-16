import { describe, expect, it, beforeEach } from 'vitest';
import {
  cancelFileExplorer,
  getActiveFileExplorer,
  openFileExplorer,
  resolveFileExplorer,
  subscribeFileExplorer,
} from './fileExplorerStore';

describe('fileExplorerStore', () => {
  beforeEach(() => {
    cancelFileExplorer();
  });

  it('opens a session and resolves a folder path', async () => {
    const pending = openFileExplorer({ mode: 'folder', title: 'Pick root' });
    expect(getActiveFileExplorer()?.mode).toBe('folder');
    expect(getActiveFileExplorer()?.title).toBe('Pick root');

    resolveFileExplorer({ ok: true, paths: ['C:\\Users\\viper\\VibeSpace'] });
    await expect(pending).resolves.toEqual({
      ok: true,
      paths: ['C:\\Users\\viper\\VibeSpace'],
    });
    expect(getActiveFileExplorer()).toBeNull();
  });

  it('cancels an open session', async () => {
    const pending = openFileExplorer({ mode: 'file' });
    cancelFileExplorer();
    await expect(pending).resolves.toEqual({ ok: false, cancelled: true });
  });

  it('notifies subscribers when a session opens and closes', () => {
    let ticks = 0;
    const unsub = subscribeFileExplorer(() => {
      ticks += 1;
    });
    void openFileExplorer({ mode: 'files' });
    expect(ticks).toBeGreaterThanOrEqual(1);
    cancelFileExplorer();
    expect(ticks).toBeGreaterThanOrEqual(2);
    unsub();
  });
});
