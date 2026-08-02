import type { JarvisCapabilityRef } from '@/lib/jarvis/contracts';
import type { McpServerState, McpServerStatus } from '@/lib/mcp/serverManager';
import { deepFreezeJarvisCopy } from '@/lib/jarvis/requestEnvelope';
import {
  createJarvisIntegrationCapability,
  type JarvisIntegrationCapability,
} from './integrationCapability';

const SAFE_SERVER_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u;
const SAFE_TOOL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const MAX_EXPOSED_TOOLS = 64;
const MAX_TOOL_DISCOVERY_AGE_MS = 5 * 60_000;

const STATE_PRECEDENCE: Readonly<Record<McpServerState, number>> = Object.freeze({
  failed: 0,
  unhealthy: 1,
  running: 2,
  starting: 3,
  stopped: 4,
});

export interface JarvisMcpCapabilityProducerInput {
  accountId: string;
  capturedAt: number;
  statuses: readonly McpServerStatus[];
}

export interface JarvisMcpCapabilityProjection {
  readonly integrations: readonly Readonly<JarvisIntegrationCapability>[];
  readonly refs: readonly Readonly<JarvisCapabilityRef>[];
}

function canonicalExternalStatuses(statuses: readonly McpServerStatus[]): McpServerStatus[] {
  const canonical = [...statuses]
    .filter(
      (status) =>
        SAFE_SERVER_ID.test(status.id) &&
        status.kind === 'external_mcp' &&
        Object.hasOwn(STATE_PRECEDENCE, status.state),
    )
    .sort((left, right) => {
      if (left.id !== right.id) return left.id < right.id ? -1 : 1;
      return STATE_PRECEDENCE[left.state] - STATE_PRECEDENCE[right.state];
    });
  const seen = new Set<string>();
  return canonical.filter((status) => {
    if (seen.has(status.id)) return false;
    seen.add(status.id);
    return true;
  });
}

function statusEvidenceRef(accountId: string, status: McpServerStatus, capturedAt: number): string {
  return `mcp-manager-status:${accountId}:${status.id}:${status.state}:${capturedAt}`;
}

function discoveredOperations(status: McpServerStatus, capturedAt: number): string[] {
  if (
    status.state !== 'running' ||
    status.healthy !== true ||
    !Number.isFinite(status.toolsDiscoveredAt) ||
    (status.toolsDiscoveredAt as number) < 0 ||
    (status.toolsDiscoveredAt as number) > capturedAt ||
    capturedAt - (status.toolsDiscoveredAt as number) > MAX_TOOL_DISCOVERY_AGE_MS ||
    !Array.isArray(status.exposedTools) ||
    status.exposedTools.length > MAX_EXPOSED_TOOLS
  ) {
    return [];
  }
  if (
    status.exposedTools.some(
      (operation) => typeof operation !== 'string' || !SAFE_TOOL_ID.test(operation),
    )
  ) {
    return [];
  }
  return [...new Set(status.exposedTools)].sort((left, right) =>
    left.localeCompare(right, 'en', { numeric: true, sensitivity: 'variant' }),
  );
}

function discoveryEvidenceRef(accountId: string, status: McpServerStatus): string {
  return `mcp-manager-discovery:${accountId}:${status.id}:${status.toolsDiscoveredAt}`;
}

export function createJarvisMcpCapabilityProjection(
  input: JarvisMcpCapabilityProducerInput,
): Readonly<JarvisMcpCapabilityProjection> {
  if (!Number.isSafeInteger(input.capturedAt) || input.capturedAt < 0) {
    return deepFreezeJarvisCopy({ integrations: [], refs: [] });
  }
  const integrations: JarvisIntegrationCapability[] = [];
  const refs: JarvisCapabilityRef[] = [];
  const statuses = canonicalExternalStatuses(input.statuses);

  for (const status of statuses) {
    const connected = status.state === 'running' && status.healthy === true;
    const degraded =
      status.state === 'failed' ||
      status.state === 'unhealthy' ||
      (status.state === 'running' && !status.healthy);
    const operations = discoveredOperations(status, input.capturedAt);
    const hasDiscoveryEvidence = operations.length > 0;
    const evidenceRef = hasDiscoveryEvidence
      ? discoveryEvidenceRef(input.accountId, status)
      : statusEvidenceRef(input.accountId, status, input.capturedAt);
    const observedAt = hasDiscoveryEvidence
      ? (status.toolsDiscoveredAt as number)
      : input.capturedAt;

    integrations.push(
      createJarvisIntegrationCapability({
        id: status.id,
        displayName: status.id,
        accountId: input.accountId,
        kind: 'external_mcp_server',
        state: connected ? 'Connected' : 'Configuration available',
        operations,
        evidence: connected
          ? {
              kind: 'connection_observation',
              ref: evidenceRef,
              observedAt,
            }
          : {
              kind: 'configuration_metadata',
              ref: `mcp-configuration:${input.accountId}:${status.id}`,
              observedAt: input.capturedAt,
            },
      }),
    );

    refs.push({
      id: status.id,
      state: connected ? 'connected' : degraded ? 'degraded' : 'available',
      operations,
      ...(connected || degraded
        ? {
            evidenceRef,
            lastVerifiedAt: observedAt,
          }
        : {}),
    });
  }

  return deepFreezeJarvisCopy({ integrations, refs });
}
