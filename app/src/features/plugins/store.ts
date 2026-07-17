import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeLocalStorage } from '@/lib/persistence/safeLocalStorage';
import {
  LOCAL_UNBOUND_SYNC_SCOPE_NAME,
  captureSyncQueueOwner,
  cloudSyncQueueAuthorityScopeName,
  getCurrentSyncQueueAuthorityScope,
  subscribeSyncQueueAuthorityScope,
  type SyncQueueAuthorityScopeName,
  type SyncQueueOwnerSnapshot,
} from '@/lib/cloudSyncQueueOwner';
import type { PluginConnection } from './types';

export const PLUGIN_CONNECTIONS_SYNC_TABLE = 'plugin_connections';

type PluginConnections = Record<string, PluginConnection>;
type PluginConnectionBuckets = Partial<Record<SyncQueueAuthorityScopeName, PluginConnections>>;

type PluginStore = {
  connections: Record<string, PluginConnection>;
  connectionBuckets: PluginConnectionBuckets;
  activeScopeName: SyncQueueAuthorityScopeName;
  upsertConnection: (connection: PluginConnection) => void;
  removeConnection: (pluginId: string) => void;
  setEnabled: (pluginId: string, enabled: boolean) => void;
};

function ownerScopeName(owner: SyncQueueOwnerSnapshot): SyncQueueAuthorityScopeName {
  return owner.state === 'cloud'
    ? cloudSyncQueueAuthorityScopeName(owner.userId)
    : LOCAL_UNBOUND_SYNC_SCOPE_NAME;
}

function connectionsForScope(
  state: Pick<PluginStore, 'activeScopeName' | 'connectionBuckets' | 'connections'>,
  scopeName: SyncQueueAuthorityScopeName,
): PluginConnections {
  return state.activeScopeName === scopeName
    ? state.connections
    : (state.connectionBuckets[scopeName] ?? {});
}

function replaceConnectionsForScope(
  state: Pick<PluginStore, 'activeScopeName' | 'connectionBuckets'>,
  scopeName: SyncQueueAuthorityScopeName,
  connections: PluginConnections,
): Pick<PluginStore, 'connectionBuckets'> & Partial<Pick<PluginStore, 'connections'>> {
  const connectionBuckets = { ...state.connectionBuckets, [scopeName]: connections };
  return state.activeScopeName === scopeName
    ? { connectionBuckets, connections }
    : { connectionBuckets };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

type PersistedPluginStore = Pick<PluginStore, 'connectionBuckets'>;

function persistedConnectionBuckets(value: unknown): PluginConnectionBuckets {
  if (!isRecord(value) || !isRecord(value.connectionBuckets)) return {};
  const buckets: PluginConnectionBuckets = {};
  for (const [scopeName, connections] of Object.entries(value.connectionBuckets)) {
    if (!isRecord(connections)) continue;
    if (scopeName === LOCAL_UNBOUND_SYNC_SCOPE_NAME) {
      buckets[LOCAL_UNBOUND_SYNC_SCOPE_NAME] = connections as PluginConnections;
      continue;
    }
    if (!scopeName.startsWith('cloud:')) continue;
    const userId = scopeName.slice('cloud:'.length);
    if (!userId || userId.trim() !== userId) continue;
    const exactScopeName = cloudSyncQueueAuthorityScopeName(userId);
    if (exactScopeName === scopeName) {
      buckets[exactScopeName] = connections as PluginConnections;
    }
  }
  return buckets;
}

function migratePluginStore(persistedState: unknown, version: number): PersistedPluginStore {
  if (version < 1) {
    const legacyConnections =
      isRecord(persistedState) && isRecord(persistedState.connections)
        ? (persistedState.connections as PluginConnections)
        : {};
    return {
      connectionBuckets: {
        [LOCAL_UNBOUND_SYNC_SCOPE_NAME]: legacyConnections,
      },
    };
  }
  return { connectionBuckets: persistedConnectionBuckets(persistedState) };
}

function queueConnection(
  connection: PluginConnection,
  op: 'insert' | 'update' | 'delete',
  owner: SyncQueueOwnerSnapshot,
): void {
  void import('@/lib/sync')
    .then(({ enqueueMutation }) =>
      enqueueMutation(
        op,
        PLUGIN_CONNECTIONS_SYNC_TABLE,
        connection.pluginId,
        op === 'delete' ? null : connection,
        owner,
      ),
    )
    .catch((error) => {
      console.warn('[plugins] failed to queue connection metadata sync', {
        pluginId: connection.pluginId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
}

export const usePluginStore = create<PluginStore>()(
  persist(
    (set, get) => ({
      connections: {},
      connectionBuckets: {},
      activeScopeName: getCurrentSyncQueueAuthorityScope().name,
      upsertConnection: (connection) => {
        const owner = captureSyncQueueOwner();
        const scopeName = ownerScopeName(owner);
        const exists = Boolean(connectionsForScope(get(), scopeName)[connection.pluginId]);
        set((state) => ({
          ...replaceConnectionsForScope(state, scopeName, {
            ...connectionsForScope(state, scopeName),
            [connection.pluginId]: connection,
          }),
        }));
        queueConnection(connection, exists ? 'update' : 'insert', owner);
      },
      removeConnection: (pluginId) => {
        const owner = captureSyncQueueOwner();
        const scopeName = ownerScopeName(owner);
        const existing = connectionsForScope(get(), scopeName)[pluginId];
        if (!existing) return;
        set((state) => {
          const next = { ...connectionsForScope(state, scopeName) };
          delete next[pluginId];
          return replaceConnectionsForScope(state, scopeName, next);
        });
        queueConnection(existing, 'delete', owner);
      },
      setEnabled: (pluginId, enabled) => {
        const owner = captureSyncQueueOwner();
        const scopeName = ownerScopeName(owner);
        const existing = connectionsForScope(get(), scopeName)[pluginId];
        if (!existing) return;
        const updated = { ...existing, enabled, updatedAt: Date.now() };
        set((state) => ({
          ...replaceConnectionsForScope(state, scopeName, {
            ...connectionsForScope(state, scopeName),
            [pluginId]: updated,
          }),
        }));
        queueConnection(updated, 'update', owner);
      },
    }),
    {
      name: 'jarvis-plugin-connections',
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => ({ connectionBuckets: state.connectionBuckets }),
      version: 1,
      migrate: migratePluginStore,
      merge: (persistedState, currentState) => {
        const connectionBuckets = persistedConnectionBuckets(persistedState);
        const activeScopeName = getCurrentSyncQueueAuthorityScope().name;
        return {
          ...currentState,
          connectionBuckets,
          activeScopeName,
          connections: connectionBuckets[activeScopeName] ?? {},
        };
      },
    },
  ),
);

export function applyCloudPluginConnectionForAccount(
  exactUserId: string,
  pluginId: string,
  connection: PluginConnection | null,
): void {
  const scopeName = cloudSyncQueueAuthorityScopeName(exactUserId);
  if (!pluginId || pluginId.trim() !== pluginId) {
    throw new Error('Cloud plugin connection application requires an exact plugin ID.');
  }
  if (connection && connection.pluginId !== pluginId) {
    throw new Error('Cloud plugin row ID must match the validated connection plugin ID.');
  }
  usePluginStore.setState((state) => {
    const connections = { ...connectionsForScope(state, scopeName) };
    if (connection) connections[pluginId] = connection;
    else delete connections[pluginId];
    return replaceConnectionsForScope(state, scopeName, connections);
  });
}

subscribeSyncQueueAuthorityScope((scope) => {
  usePluginStore.setState((state) => ({
    activeScopeName: scope.name,
    connections: state.connectionBuckets[scope.name] ?? {},
  }));
});
