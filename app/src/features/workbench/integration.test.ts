import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAllActions, performAction } from '@/features/command-palette/actions';
import { resolveInitialRoute, useUIStore } from '@/stores/ui';
import { useWorkbenchStore } from './store';
import './registerCommandActions';

describe('Workbench entry points', () => {
  afterEach(() => {
    useUIStore.getState().resetUI();
    useWorkbenchStore.getState().resetWorkbench();
  });

  it('uses the detached-window query only for an explicit Workbench launch', () => {
    expect(resolveInitialRoute('?workbench=1')).toBe('workbench');
    expect(resolveInitialRoute('?workbench=0')).toBe('chat');
    expect(resolveInitialRoute('')).toBe('chat');
  });

  it('registers open and spawn actions in the command palette', () => {
    const ids = getAllActions().map((action) => action.id);
    expect(ids).toContain('open-workbench');
    expect(ids).toContain('spawn-workbench');

    const closePalette = vi.fn();
    performAction('spawn-workbench', { closePalette });
    expect(useUIStore.getState().route).toBe('workbench');
    expect(useWorkbenchStore.getState().panels.filter((panel) => panel.kind === 'terminal')).toHaveLength(4);
    expect(closePalette).toHaveBeenCalledOnce();
  });
});
