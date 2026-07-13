import { beforeEach, describe, expect, it, vi } from 'vitest';

const syncMock = vi.hoisted(() => ({
  enqueueMutation: vi.fn(async () => 'syq_test'),
}));

vi.mock('@/lib/sync', () => syncMock);

import { useToolStore } from './toolStore';
import { getBuiltinAction } from '@/lib/actions/registry';

describe('custom tool cloud sync queue', () => {
  beforeEach(() => {
    syncMock.enqueueMutation.mockClear();
    useToolStore.setState({ tools: [] });
  });

  it('keeps Terminal Fleet code-owned instead of persisting or syncing a built-in copy', async () => {
    expect(getBuiltinAction('terminal.fleet')).toMatchObject({
      id: 'terminal.fleet',
      destructive: true,
    });
    expect(useToolStore.getState().tools).toEqual([]);
    await Promise.resolve();
    expect(syncMock.enqueueMutation).not.toHaveBeenCalled();
  });

  it('keeps user-saved Fleet presets editable, importable, and sync compatible', async () => {
    const saved = useToolStore.getState().create({
      name: 'My local Aider fleet',
      description: 'Reach six terminals with my reviewed Aider command.',
      baseAction: 'terminal.fleet',
      params: {
        targetTotal: 6,
        preset: 'custom',
        command: 'aider --model sonnet',
        batchSize: 2,
        staggerDelayMs: 200,
      },
    });
    await vi.waitFor(() => expect(syncMock.enqueueMutation).toHaveBeenCalled());
    expect(saved.baseAction).toBe('terminal.fleet');

    useToolStore.getState().update(saved.slug, { name: 'Aider review fleet' });
    expect(useToolStore.getState().bySlug(saved.slug)?.name).toBe('Aider review fleet');

    const exported = JSON.parse(JSON.stringify(useToolStore.getState().tools));
    useToolStore.setState({ tools: [] });
    expect(useToolStore.getState().importMany(exported)).toBe(1);
    expect(useToolStore.getState().tools[0]).toMatchObject({
      baseAction: 'terminal.fleet',
      params: expect.objectContaining({
        preset: 'custom',
        command: 'aider --model sonnet',
      }),
    });

    const importedId = `custom.${useToolStore.getState().tools[0]!.slug}`;
    expect(importedId).not.toBe('terminal.fleet');
    expect(getBuiltinAction('terminal.fleet')?.category).toBe('terminal');
  });

  it('queues create, update, and delete mutations', async () => {
    const tool = useToolStore.getState().create({
      name: 'Dev server',
      description: 'Start dev',
      baseAction: 'terminal.run',
      params: { command: 'npm run dev' },
    });

    await vi.waitFor(() => {
      expect(syncMock.enqueueMutation).toHaveBeenCalledWith(
        'insert',
        'custom_tools',
        tool.slug,
        expect.objectContaining({ slug: tool.slug }),
      );
    });

    syncMock.enqueueMutation.mockClear();
    useToolStore.getState().update(tool.slug, { description: 'Start the app' });

    await vi.waitFor(() => {
      expect(syncMock.enqueueMutation).toHaveBeenCalledWith(
        'update',
        'custom_tools',
        tool.slug,
        expect.objectContaining({ description: 'Start the app' }),
      );
    });

    syncMock.enqueueMutation.mockClear();
    useToolStore.getState().remove(tool.slug);

    await vi.waitFor(() => {
      expect(syncMock.enqueueMutation).toHaveBeenCalledWith(
        'delete',
        'custom_tools',
        tool.slug,
        null,
      );
    });
  });

  it('queues publish as a private account sync update', async () => {
    const tool = useToolStore.getState().create({
      name: 'Tea timer',
      description: 'Make tea',
      baseAction: 'clock.timer',
      params: { durationMinutes: 3, label: 'Tea' },
    });
    await vi.waitFor(() => expect(syncMock.enqueueMutation).toHaveBeenCalled());
    syncMock.enqueueMutation.mockClear();

    const result = await useToolStore.getState().publish(tool.slug);

    expect(result.ok).toBe(true);
    await vi.waitFor(() => {
      expect(syncMock.enqueueMutation).toHaveBeenCalledWith(
        'update',
        'custom_tools',
        tool.slug,
        expect.objectContaining({ slug: tool.slug }),
      );
    });
  });
});
