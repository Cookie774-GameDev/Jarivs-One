import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LOCAL_UNBOUND_SYNC_SCOPE_NAME,
  activateSyncQueueCloudAuthority,
  releaseSyncQueueCloudAuthority,
  type SyncQueueCloudAuthorityLease,
} from '@/lib/cloudSyncQueueOwner';
import type { PluginConnection } from './types';

const syncMock = vi.hoisted(() => ({
  enqueueMutation: vi.fn(async () => 'syq_plugin_test'),
}));

vi.mock('@/lib/sync', () => syncMock);

import { applyCloudPluginConnectionForAccount, usePluginStore } from './store';

const leases: SyncQueueCloudAuthorityLease[] = [];

function activate(userId: string): SyncQueueCloudAuthorityLease {
  const lease = activateSyncQueueCloudAuthority(userId);
  leases.push(lease);
  return lease;
}

function connection(pluginId: string, enabled = true): PluginConnection {
  return {
    pluginId,
    state: 'connected',
    enabled,
    enabledProjectIds: ['*'],
    configuredFields: [],
    updatedAt: 1,
  };
}

describe('plugin connection account scopes', () => {
  beforeEach(() => {
    localStorage.clear();
    syncMock.enqueueMutation.mockClear();
    usePluginStore.setState({
      connections: {},
      connectionBuckets: {},
      activeScopeName: LOCAL_UNBOUND_SYNC_SCOPE_NAME,
    });
  });

  afterEach(() => {
    for (const lease of leases.splice(0).reverse()) {
      releaseSyncQueueCloudAuthority(lease);
    }
  });

  it('keeps completed A records and B edits in separate account buckets', async () => {
    const leaseA = activate('user-a');
    applyCloudPluginConnectionForAccount('user-a', 'github', connection('github'));
    expect(Object.keys(usePluginStore.getState().connections)).toEqual(['github']);

    activate('user-b');
    releaseSyncQueueCloudAuthority(leaseA);
    expect(usePluginStore.getState().connections).toEqual({});

    applyCloudPluginConnectionForAccount('user-a', 'slack', connection('slack'));
    expect(usePluginStore.getState().connections).toEqual({});

    usePluginStore.getState().upsertConnection(connection('linear'));
    await vi.waitFor(() => {
      expect(syncMock.enqueueMutation).toHaveBeenCalledWith(
        'insert',
        'plugin_connections',
        'linear',
        expect.objectContaining({ pluginId: 'linear' }),
        expect.objectContaining({ state: 'cloud', userId: 'user-b' }),
      );
    });

    activate('user-a');
    expect(Object.keys(usePluginStore.getState().connections).sort()).toEqual(['github', 'slack']);
  });

  it('migrates legacy unscoped connections losslessly into local/unbound storage only', async () => {
    const legacyConnection = connection('legacy-local');
    localStorage.setItem(
      'jarvis-plugin-connections',
      JSON.stringify({
        state: { connections: { [legacyConnection.pluginId]: legacyConnection } },
        version: 0,
      }),
    );

    await usePluginStore.persist.rehydrate();
    expect(usePluginStore.getState().connections).toEqual({
      [legacyConnection.pluginId]: legacyConnection,
    });

    const cloudLease = activate('user-a');
    expect(usePluginStore.getState().connections).toEqual({});
    releaseSyncQueueCloudAuthority(cloudLease);
    expect(usePluginStore.getState().connections).toEqual({
      [legacyConnection.pluginId]: legacyConnection,
    });

    const persisted = JSON.parse(localStorage.getItem('jarvis-plugin-connections') ?? '{}') as {
      state?: Record<string, unknown>;
      version?: number;
    };
    expect(persisted).toEqual({
      state: {
        connectionBuckets: {
          [LOCAL_UNBOUND_SYNC_SCOPE_NAME]: {
            [legacyConnection.pluginId]: legacyConnection,
          },
        },
      },
      version: 1,
    });
  });

  it('keeps B enable and remove mutations in B and queues them with B ownership', async () => {
    activate('user-a');
    applyCloudPluginConnectionForAccount('user-a', 'github', connection('github'));

    activate('user-b');
    usePluginStore.getState().upsertConnection(connection('linear'));
    await vi.waitFor(() =>
      expect(syncMock.enqueueMutation).toHaveBeenCalledWith(
        'insert',
        'plugin_connections',
        'linear',
        expect.any(Object),
        expect.objectContaining({ state: 'cloud', userId: 'user-b' }),
      ),
    );
    usePluginStore.getState().upsertConnection(connection('slack'));
    await vi.waitFor(() =>
      expect(syncMock.enqueueMutation).toHaveBeenCalledWith(
        'insert',
        'plugin_connections',
        'slack',
        expect.any(Object),
        expect.objectContaining({ state: 'cloud', userId: 'user-b' }),
      ),
    );
    syncMock.enqueueMutation.mockClear();

    usePluginStore.getState().setEnabled('linear', false);
    await vi.waitFor(() => {
      expect(syncMock.enqueueMutation).toHaveBeenCalledWith(
        'update',
        'plugin_connections',
        'linear',
        expect.objectContaining({ enabled: false }),
        expect.objectContaining({ state: 'cloud', userId: 'user-b' }),
      );
    });
    usePluginStore.getState().removeConnection('slack');
    await vi.waitFor(() => {
      expect(syncMock.enqueueMutation).toHaveBeenCalledWith(
        'delete',
        'plugin_connections',
        'slack',
        null,
        expect.objectContaining({ state: 'cloud', userId: 'user-b' }),
      );
    });

    activate('user-a');
    expect(Object.keys(usePluginStore.getState().connections)).toEqual(['github']);
    activate('user-b');
    expect(usePluginStore.getState().connections.linear?.enabled).toBe(false);
    expect(usePluginStore.getState().connections.slack).toBeUndefined();
  });

  it('applies cloud deletes only to the named account bucket', () => {
    activate('user-a');
    applyCloudPluginConnectionForAccount('user-a', 'github', connection('github'));
    applyCloudPluginConnectionForAccount('user-a', 'slack', connection('slack'));

    activate('user-b');
    applyCloudPluginConnectionForAccount('user-a', 'slack', null);
    expect(usePluginStore.getState().connections).toEqual({});

    activate('user-a');
    expect(Object.keys(usePluginStore.getState().connections)).toEqual(['github']);
  });
});
