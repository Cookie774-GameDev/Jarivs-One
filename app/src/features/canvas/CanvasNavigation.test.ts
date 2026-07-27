import { afterEach, describe, expect, it, vi } from 'vitest';
import { findSlashCommandDef } from '@/features/chat/SlashCommandTypeahead';
import { getAllActions, performAction } from '@/features/command-palette/actions';
import { getBuiltinAction } from '@/lib/actions/registry';
import { useUIStore } from '@/stores/ui';

describe('Canvas navigation discovery', () => {
  afterEach(() => {
    useUIStore.getState().resetUI();
  });

  it('opens Canvas from the global command palette', () => {
    const closePalette = vi.fn();
    const action = getAllActions().find((candidate) => candidate.id === 'open-canvas');

    expect(action).toMatchObject({
      label: 'Open Infinite Canvas',
      page: 'root',
    });

    performAction('open-canvas', { closePalette });

    expect(useUIStore.getState().route).toBe('canvas');
    expect(closePalette).toHaveBeenCalledOnce();
  });

  it('exposes Canvas to the governed JARVIS navigation registry', async () => {
    const action = getBuiltinAction('nav.canvas');

    expect(action).toMatchObject({
      category: 'navigation',
      label: 'Open Canvas',
    });
    await expect(action?.run({}, { source: 'user' })).resolves.toMatchObject({
      ok: true,
    });
    expect(useUIStore.getState().route).toBe('canvas');
  });

  it('exposes a navigation slash reference without colliding with chat attachments', () => {
    expect(findSlashCommandDef('canvas')).toMatchObject({
      cmd: 'canvas',
      category: 'navigation',
      description: 'Reference Canvas',
    });
  });
});
