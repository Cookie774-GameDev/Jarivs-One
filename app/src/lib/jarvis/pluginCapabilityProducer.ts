import type { PluginConnection, PluginManifest } from '@/features/plugins/types';
import type { JarvisCapabilityRef } from '@/lib/jarvis/contracts';
import { deepFreezeJarvisCopy } from '@/lib/jarvis/requestEnvelope';
import {
  createJarvisIntegrationCapability,
  type JarvisConnectorState,
  type JarvisIntegrationCapability,
  type JarvisIntegrationEvidenceKind,
  type JarvisIntegrationKind,
} from './integrationCapability';

const MAX_OPERATIONS = 64;
const STABLE_TOOL_ID = /^[^\s\u0000-\u001f\u007f]{1,160}$/u;

export interface JarvisPluginCapabilityProducerInput {
  accountId: string;
  capturedAt: number;
  manifests: readonly PluginManifest[];
  connections: Readonly<Record<string, PluginConnection>>;
}

export interface JarvisPluginCapabilityProjection {
  readonly integrations: readonly Readonly<JarvisIntegrationCapability>[];
  readonly refs: readonly Readonly<JarvisCapabilityRef>[];
}

function integrationKind(manifest: PluginManifest): JarvisIntegrationKind {
  if (manifest.authType === 'oauth') return 'oauth_plugin';
  if (
    manifest.authType === 'api_key' ||
    manifest.authType === 'token' ||
    manifest.authType === 'service_account'
  ) {
    return 'api_key_plugin';
  }
  return manifest.status === 'implemented' && manifest.tools.length > 0
    ? 'mcp_lite_tool'
    : 'connector_metadata';
}

function canonicalOperations(manifest: PluginManifest): string[] {
  return [
    ...new Set(
      manifest.tools.map((tool) => tool.name.trim()).filter((name) => STABLE_TOOL_ID.test(name)),
    ),
  ]
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .slice(0, MAX_OPERATIONS);
}

function hasEveryRequiredField(
  manifest: PluginManifest,
  connection: PluginConnection | undefined,
): boolean {
  const configured = new Set(connection?.configuredFields ?? []);
  return manifest.fields
    .filter((field) => field.required)
    .every((field) => configured.has(field.id));
}

function passiveState(
  manifest: PluginManifest,
  connection: PluginConnection | undefined,
): Readonly<{
  state: JarvisConnectorState;
  evidenceKind: JarvisIntegrationEvidenceKind;
}> {
  if (manifest.status === 'planned' || manifest.status === 'blocked') {
    return { state: 'Catalog only', evidenceKind: 'catalog_metadata' };
  }
  if (manifest.authType === 'oauth') {
    return {
      state: 'Manual authorization required',
      evidenceKind: 'authorization_status',
    };
  }
  if (manifest.authType === 'none' || manifest.fields.length === 0) {
    return {
      state: 'Configuration available',
      evidenceKind: 'configuration_metadata',
    };
  }
  return hasEveryRequiredField(manifest, connection)
    ? { state: 'Credentials saved', evidenceKind: 'credential_status' }
    : { state: 'Credentials missing', evidenceKind: 'credential_status' };
}

function safeConnection(
  accountId: string,
  manifest: PluginManifest,
  candidate: PluginConnection | undefined,
): PluginConnection | undefined {
  return candidate?.accountId === accountId && candidate.pluginId === manifest.id
    ? candidate
    : undefined;
}

function verifiedAt(connection: PluginConnection | undefined): number | undefined {
  return connection?.state === 'connected' &&
    typeof connection.lastTestedAt === 'number' &&
    Number.isFinite(connection.lastTestedAt) &&
    connection.lastTestedAt >= 0
    ? connection.lastTestedAt
    : undefined;
}

function passiveEvidenceRef(
  accountId: string,
  manifest: PluginManifest,
  connection: PluginConnection | undefined,
  state: JarvisConnectorState,
): string {
  if (state === 'Catalog only') return `plugin-catalog:${manifest.id}`;
  const observedAt =
    typeof connection?.updatedAt === 'number' && Number.isFinite(connection.updatedAt)
      ? connection.updatedAt
      : 0;
  return `plugin-state:${accountId}:${manifest.id}:${observedAt}`;
}

export function createJarvisPluginCapabilityProjection(
  input: JarvisPluginCapabilityProducerInput,
): Readonly<JarvisPluginCapabilityProjection> {
  const integrations: Readonly<JarvisIntegrationCapability>[] = [];
  const refs: JarvisCapabilityRef[] = [];
  const manifests = [...input.manifests].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );

  for (const manifest of manifests) {
    const connection = safeConnection(input.accountId, manifest, input.connections[manifest.id]);
    const operations = canonicalOperations(manifest);
    const connectionVerifiedAt = verifiedAt(connection);
    const kind = integrationKind(manifest);

    if (connectionVerifiedAt !== undefined) {
      const evidenceRef = `plugin-verification:${input.accountId}:${manifest.id}:${connectionVerifiedAt}`;
      if (kind === 'mcp_lite_tool') {
        for (const operation of operations) {
          integrations.push(
            createJarvisIntegrationCapability({
              id: `${manifest.id}:${operation}`,
              displayName: `${manifest.name} ${operation}`,
              accountId: input.accountId,
              kind,
              state: 'Tool available',
              operations: [operation],
              toolId: `${manifest.id}.${operation}`,
              evidence: {
                kind: 'tool_discovery',
                ref: `${evidenceRef}:tool:${operation}`,
                observedAt: connectionVerifiedAt,
              },
            }),
          );
        }
        refs.push({
          id: manifest.id,
          state: 'available',
          operations: connection?.enabled ? operations : [],
          evidenceRef,
          lastVerifiedAt: connectionVerifiedAt,
        });
        if (connection?.enabled) {
          for (const operation of operations) {
            refs.push({
              id: `plugin.${manifest.id}.${operation}`,
              state: 'available',
              operations: ['execute'],
              evidenceRef: `${evidenceRef}:tool:${operation}`,
              lastVerifiedAt: connectionVerifiedAt,
            });
          }
        }
        continue;
      }
      integrations.push(
        createJarvisIntegrationCapability({
          id: manifest.id,
          displayName: manifest.name,
          accountId: input.accountId,
          kind,
          state: 'Connection verified',
          operations,
          evidence: {
            kind: 'connection_verification',
            ref: evidenceRef,
            observedAt: connectionVerifiedAt,
          },
        }),
      );
      if (connection?.enabled) {
        for (const operation of operations) {
          integrations.push(
            createJarvisIntegrationCapability({
              id: `${manifest.id}:${operation}`,
              displayName: `${manifest.name} ${operation}`,
              accountId: input.accountId,
              kind,
              state: 'Tool available',
              operations: [operation],
              toolId: `${manifest.id}.${operation}`,
              evidence: {
                kind: 'tool_discovery',
                ref: `${evidenceRef}:tool:${operation}`,
                observedAt: connectionVerifiedAt,
              },
            }),
          );
        }
      }
      refs.push({
        id: manifest.id,
        state: manifest.authType === 'none' ? 'connected' : 'authenticated',
        operations: connection?.enabled ? operations : [],
        evidenceRef,
        lastVerifiedAt: connectionVerifiedAt,
      });
      if (connection?.enabled) {
        for (const operation of operations) {
          refs.push({
            id: `plugin.${manifest.id}.${operation}`,
            state: manifest.authType === 'none' ? 'available' : 'authenticated',
            operations: ['execute'],
            evidenceRef: `${evidenceRef}:tool:${operation}`,
            lastVerifiedAt: connectionVerifiedAt,
          });
        }
      }
      continue;
    }

    const passive = passiveState(manifest, connection);
    integrations.push(
      createJarvisIntegrationCapability({
        id: manifest.id,
        displayName: manifest.name,
        accountId: input.accountId,
        kind,
        state: passive.state,
        operations,
        evidence: {
          kind: passive.evidenceKind,
          ref: passiveEvidenceRef(input.accountId, manifest, connection, passive.state),
          observedAt: input.capturedAt,
        },
      }),
    );

    if (connection?.state === 'error') {
      const failedAt =
        typeof connection.lastTestedAt === 'number' &&
        Number.isFinite(connection.lastTestedAt) &&
        connection.lastTestedAt >= 0
          ? connection.lastTestedAt
          : input.capturedAt;
      refs.push({
        id: manifest.id,
        state: 'degraded',
        operations: [],
        evidenceRef: `plugin-test-failed:${input.accountId}:${manifest.id}:${failedAt}`,
        lastVerifiedAt: failedAt,
      });
      continue;
    }

    refs.push({
      id: manifest.id,
      state: passive.state === 'Catalog only' ? 'planned' : 'available',
      operations: [],
    });
  }

  return deepFreezeJarvisCopy({ integrations, refs });
}
