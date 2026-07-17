import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LOCAL_UNBOUND_SYNC_SCOPE_NAME,
  activateSyncQueueCloudAuthority,
  releaseSyncQueueCloudAuthority,
  type SyncQueueCloudAuthorityLease,
} from '@/lib/cloudSyncQueueOwner';

const syncMock = vi.hoisted(() => ({
  enqueueMutation: vi.fn(async () => 'syq_test'),
}));

vi.mock('@/lib/sync', () => syncMock);

import { applyCloudCustomToolForAccount, useToolStore, type CustomTool } from './toolStore';

const leases: SyncQueueCloudAuthorityLease[] = [];

function activate(userId: string): SyncQueueCloudAuthorityLease {
  const lease = activateSyncQueueCloudAuthority(userId);
  leases.push(lease);
  return lease;
}

function cloudTool(slug: string, name = slug): CustomTool {
  return {
    slug,
    name,
    description: `${name} description`,
    baseAction: 'clock.timer',
    params: { durationMinutes: 1 },
    createdAt: 1,
    updatedAt: 1,
    published: null,
  };
}

describe('custom tool cloud sync queue', () => {
  beforeEach(() => {
    localStorage.clear();
    syncMock.enqueueMutation.mockClear();
    useToolStore.setState({
      tools: [],
      toolBuckets: {},
      activeScopeName: LOCAL_UNBOUND_SYNC_SCOPE_NAME,
    });
  });

  afterEach(() => {
    for (const lease of leases.splice(0).reverse()) {
      releaseSyncQueueCloudAuthority(lease);
    }
  });

  it('queues create, update, and delete mutations', async () => {
    activate('user-a');
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
        expect.objectContaining({ state: 'cloud', userId: 'user-a' }),
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
        expect.objectContaining({ state: 'cloud', userId: 'user-a' }),
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
        expect.objectContaining({ state: 'cloud', userId: 'user-a' }),
      );
    });
  });

  it('queues publish as a private account sync update', async () => {
    activate('user-a');
    const tool = useToolStore.getState().create({
      name: 'Tea timer',
      description: 'Make tea',
      baseAction: 'clock.timer',
      params: { durationMinutes: 3, label: 'Tea' },
    });
    await vi.waitFor(() => expect(syncMock.enqueueMutation).toHaveBeenCalled());
    syncMock.enqueueMutation.mockClear();

    const result = await useToolStore.getState().publish(tool.slug);

    expect(result).toMatchObject({
      ok: true,
      summary: 'Queued for VibeSpace Cloud account sync.',
    });
    await vi.waitFor(() => {
      expect(syncMock.enqueueMutation).toHaveBeenCalledWith(
        'update',
        'custom_tools',
        tool.slug,
        expect.objectContaining({ slug: tool.slug }),
        expect.objectContaining({ state: 'cloud', userId: 'user-a' }),
      );
    });
  });

  it('reports a local-only publish truthfully while queue authority is unbound', async () => {
    const tool = useToolStore.getState().create({
      name: 'Local tea timer',
      description: 'Make tea offline',
      baseAction: 'clock.timer',
      params: { durationMinutes: 3, label: 'Tea' },
    });
    await vi.waitFor(() => expect(syncMock.enqueueMutation).toHaveBeenCalled());
    syncMock.enqueueMutation.mockClear();

    const result = await useToolStore.getState().publish(tool.slug);

    expect(result).toMatchObject({
      ok: true,
      summary: 'Saved locally; VibeSpace Cloud account sync requires a verified sign-in.',
    });
    await vi.waitFor(() => {
      expect(syncMock.enqueueMutation).toHaveBeenCalledWith(
        'update',
        'custom_tools',
        tool.slug,
        expect.objectContaining({ slug: tool.slug }),
        expect.objectContaining({ state: 'unbound' }),
      );
    });
  });

  it('captures user A before the deferred sync module can observe user B', async () => {
    activate('user-a');
    const tool = useToolStore.getState().create({
      name: 'Account-bound tool',
      description: 'Preserve enqueue authority',
      baseAction: 'clock.timer',
      params: { durationMinutes: 1 },
    });

    activate('user-b');

    await vi.waitFor(() => {
      expect(syncMock.enqueueMutation).toHaveBeenCalledWith(
        'insert',
        'custom_tools',
        tool.slug,
        expect.objectContaining({ slug: tool.slug }),
        {
          state: 'cloud',
          userId: 'user-a',
          capturedAt: expect.any(Number),
        },
      );
    });
  });

  it('keeps completed A records and B edits in separate account buckets', async () => {
    const leaseA = activate('user-a');
    applyCloudCustomToolForAccount('user-a', 'a-first', cloudTool('a-first'));
    expect(useToolStore.getState().tools.map((tool) => tool.slug)).toEqual(['a-first']);

    activate('user-b');
    releaseSyncQueueCloudAuthority(leaseA);
    expect(useToolStore.getState().tools).toEqual([]);

    applyCloudCustomToolForAccount('user-a', 'a-delayed', cloudTool('a-delayed'));
    expect(useToolStore.getState().tools).toEqual([]);

    const toolB = useToolStore.getState().create({
      name: 'B only',
      description: 'Owned by B',
      baseAction: 'clock.timer',
      params: { durationMinutes: 2 },
    });
    await vi.waitFor(() => {
      expect(syncMock.enqueueMutation).toHaveBeenCalledWith(
        'insert',
        'custom_tools',
        toolB.slug,
        expect.objectContaining({ slug: toolB.slug }),
        expect.objectContaining({ state: 'cloud', userId: 'user-b' }),
      );
    });

    activate('user-a');
    expect(useToolStore.getState().tools.map((tool) => tool.slug)).toEqual([
      'a-delayed',
      'a-first',
    ]);
  });

  it('migrates legacy unscoped tools losslessly into local/unbound storage only', async () => {
    const legacyTool = cloudTool('legacy-local', 'Legacy local');
    localStorage.setItem(
      'jarvis-tools',
      JSON.stringify({ state: { tools: [legacyTool] }, version: 1 }),
    );

    await useToolStore.persist.rehydrate();
    expect(useToolStore.getState().tools).toEqual([legacyTool]);

    const cloudLease = activate('user-a');
    expect(useToolStore.getState().tools).toEqual([]);
    releaseSyncQueueCloudAuthority(cloudLease);
    expect(useToolStore.getState().tools).toEqual([legacyTool]);

    const persisted = JSON.parse(localStorage.getItem('jarvis-tools') ?? '{}') as {
      state?: Record<string, unknown>;
      version?: number;
    };
    expect(persisted).toEqual({
      state: {
        toolBuckets: {
          [LOCAL_UNBOUND_SYNC_SCOPE_NAME]: [legacyTool],
        },
      },
      version: 2,
    });
  });

  it('applies cloud deletes only to the named account bucket', () => {
    activate('user-a');
    applyCloudCustomToolForAccount('user-a', 'a-keep', cloudTool('a-keep'));
    applyCloudCustomToolForAccount('user-a', 'a-delete', cloudTool('a-delete'));

    activate('user-b');
    applyCloudCustomToolForAccount('user-a', 'a-delete', null);
    expect(useToolStore.getState().tools).toEqual([]);

    activate('user-a');
    expect(useToolStore.getState().tools.map((tool) => tool.slug)).toEqual(['a-keep']);
  });
});
