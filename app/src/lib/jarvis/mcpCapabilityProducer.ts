import type { JarvisCapabilityRef } from '@/lib/jarvis/contracts';
import type { McpServerState, McpServerStatus } from '@/lib/mcp/serverManager';
import { deepFreezeJarvisCopy } from '@/lib/jarvis/requestEnvelope';
import {
  createJarvisIntegrationCapability,
  type JarvisIntegrationCapability,
} from './integrationCapability';

const SAFE_SERVER_ID = /^[^\s\u0000-\u001f\u007f]{1,160}$/u;
const DEFAULT_LOCAL_SERVER_IDS = Object.freeze(['vibespace-local']);

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
  localServerIds?: readonly string[];
}

export interface JarvisMcpCapabilityProjection {
  readonly integrations: readonly Readonly<JarvisIntegrationCapability>[];
  readonly refs: readonly Readonly<JarvisCapabilityRef>[];
}

function canonicalExternalStatuses(
  statuses: readonly McpServerStatus[],
  localServerIds: ReadonlySet<string>,
): McpServerStatus[] {
  const canonical = [...statuses]
    .filter(
      (status) =>
        SAFE_SERVER_ID.test(status.id) &&
        !localServerIds.has(status.id) &&
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

export function createJarvisMcpCapabilityProjection(
  input: JarvisMcpCapabilityProducerInput,
): Readonly<JarvisMcpCapabilityProjection> {
  const integrations: JarvisIntegrationCapability[] = [];
  const refs: JarvisCapabilityRef[] = [];
  const localServerIds = new Set(input.localServerIds ?? DEFAULT_LOCAL_SERVER_IDS);
  const statuses = canonicalExternalStatuses(input.statuses, localServerIds);

  for (const status of statuses) {
    const connected = status.state === 'running' && status.healthy === true;
    const degraded =
      status.state === 'failed' ||
      status.state === 'unhealthy' ||
      (status.state === 'running' && !status.healthy);
    const evidenceRef = statusEvidenceRef(input.accountId, status, input.capturedAt);

    integrations.push(
      createJarvisIntegrationCapability({
        id: status.id,
        displayName: status.id,
        accountId: input.accountId,
        kind: 'external_mcp_server',
        state: connected ? 'Connected' : 'Configuration available',
        operations: [],
        evidence: connected
          ? {
              kind: 'connection_observation',
              ref: evidenceRef,
              observedAt: input.capturedAt,
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
      operations: [],
      ...(connected || degraded
        ? {
            evidenceRef,
            lastVerifiedAt: input.capturedAt,
          }
        : {}),
    });
  }

  return deepFreezeJarvisCopy({ integrations, refs });
}
