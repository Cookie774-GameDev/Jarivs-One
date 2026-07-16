import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveInitialRoute } from '@/stores/ui';
import { getAllActions, performAction } from '@/features/command-palette/actions';
import { useWorkbenchStore } from './store';
import './registerCommandActions';

describe('Workbench integration seams', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useWorkbenchStore.getState().resetWorkbench();
  });

  it('uses the detached-window query only for an explicit Workbench launch', () => {
    expect(resolveInitialRoute('?workbench=1')).toBe('workbench');
    expect(resolveInitialRoute('?workbench=0')).toBe('chat');
    expect(resolveInitialRoute('')).toBe('chat');
  });

  it('registers open and spawn actions that open Workbench without requiring setRoute', () => {
    const ids = getAllActions().map((action) => action.id);
    expect(ids).toContain('open-workbench');
    expect(ids).toContain('spawn-workbench');

    const closePalette = vi.fn();
    performAction('spawn-workbench', { closePalette });
    expect(closePalette).toHaveBeenCalled();
    // Web-dev layout applied for spawn action
    expect(
      useWorkbenchStore.getState().panels.filter((p) => p.kind === 'terminal').length,
    ).toBeGreaterThanOrEqual(4);
  });

  it('stores terminal resource ids for reconnect without transcripts', () => {
    const id = useWorkbenchStore.getState().addPanel('terminal');
    expect(id).toBeTruthy();
    useWorkbenchStore.getState().updatePanel(id!, {
      settings: { resourceId: 'pty-live-1' },
      status: 'ready',
    });
    const panel = useWorkbenchStore.getState().panels.find((p) => p.id === id);
    expect(panel?.settings.resourceId).toBe('pty-live-1');
    const saved = useWorkbenchStore.getState().flushPersistence();
    expect(saved.ok).toBe(true);
    const raw = window.localStorage.getItem('vibespace-workbench:v1') ?? '';
    expect(raw).toContain('pty-live-1');
    expect(raw).not.toContain('transcript');
  });

  it('opens files into an editor panel via the store', () => {
    const editorId = useWorkbenchStore.getState().openFileInEditor('C:\\proj\\readme.md');
    expect(editorId).toBeTruthy();
    const editor = useWorkbenchStore.getState().panels.find((p) => p.id === editorId);
    expect(editor?.kind).toBe('editor');
    expect(editor?.settings.filePath).toContain('readme.md');
  });
});
