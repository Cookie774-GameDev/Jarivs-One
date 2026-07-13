import { afterEach, describe, expect, it } from 'vitest';
import { useUIStore } from '@/stores/ui';
import { useWorkbenchStore } from '@/features/workbench/store';
import { parseAssistantInput } from './parse';
import { executeIntent } from './execute';

describe('Jarvis Workbench commands', () => {
  afterEach(() => {
    useUIStore.getState().resetUI();
    useWorkbenchStore.getState().resetWorkbench();
  });

  it('parses Workbench launch and orchestration phrases locally', () => {
    expect(parseAssistantInput('spawn a web development workbench')).toEqual({
      kind: 'workbench',
      action: 'spawn',
      templateId: 'web-development',
    });
    expect(parseAssistantInput('add four terminals to the workbench')).toEqual({
      kind: 'workbench',
      action: 'add-panel',
      panelKind: 'terminal',
      count: 4,
    });
    expect(parseAssistantInput('change the wallpaper to interactive space clouds')).toEqual({
      kind: 'workbench',
      action: 'set-wallpaper',
      wallpaperId: 'space-clouds',
    });
    expect(parseAssistantInput('pause wallpaper animation')).toEqual({
      kind: 'workbench',
      action: 'pause-wallpaper',
    });
  });

  it('executes Workbench commands against the live stores', async () => {
    const spawned = await executeIntent(parseAssistantInput('spawn research workbench'));
    expect(spawned.ok).toBe(true);
    expect(useUIStore.getState().route).toBe('workbench');
    expect(useWorkbenchStore.getState().panels.filter((panel) => panel.kind === 'browser')).toHaveLength(2);

    const wallpaper = await executeIntent(parseAssistantInput('set wallpaper to aurora'));
    expect(wallpaper.ok).toBe(true);
    expect(useWorkbenchStore.getState().wallpaper.id).toBe('aurora');
  });
});
