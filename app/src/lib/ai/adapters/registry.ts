import type { ProviderAdapter, ProviderConnection } from './types';

const adapters = new Map<string, ProviderAdapter>();
const connections = new Map<string, ProviderConnection>();

export function registerProviderAdapter(adapter: ProviderAdapter): void {
  if (adapters.has(adapter.id)) {
    throw new Error(`Provider adapter already registered: ${adapter.id}`);
  }
  adapters.set(adapter.id, adapter);
}

export function getProviderAdapter(adapterId: string): ProviderAdapter | undefined {
  return adapters.get(adapterId);
}

export function registerProviderConnection(connection: ProviderConnection): void {
  if (connections.has(connection.id)) {
    throw new Error(`Provider connection already registered: ${connection.id}`);
  }
  connections.set(connection.id, connection);
}

export function resolveProviderConnection(connectionId: string): ProviderConnection {
  const connection = connections.get(connectionId);
  if (!connection) {
    throw new Error(`Unknown provider connection: ${connectionId}`);
  }
  if (!connection.enabled) {
    throw new Error(`Provider connection is disabled: ${connectionId}`);
  }
  return connection;
}

export function listProviderConnections(): ProviderConnection[] {
  return [...connections.values()];
}

export function resetProviderAdapterRegistryForTests(): void {
  adapters.clear();
  connections.clear();
}
