import { describe, expect, it } from 'vitest';
import type { McpServerStatus } from '@/lib/mcp/serverManager';
import { createJarvisCapabilitySnapshot } from './capabilitySnapshot';
import { createJarvisMcpCapabilityProjection } from './mcpCapabilityProducer';

function status(
  id: string,
  state: McpServerStatus['state'],
  overrides: Partial<McpServerStatus> = {},
): McpServerStatus {
  return {
    id,
    state,
    healthy: state === 'running',
    ...overrides,
  };
}

describe('createJarvisMcpCapabilityProjection', () => {
  it('keeps external server lifecycle truth separate from the local MCP-lite bridge', () => {
    const projection = createJarvisMcpCapabilityProjection({
      accountId: 'account-1',
      capturedAt: 100,
      statuses: [
        status('vibespace-local', 'running'),
        status('stopped-server', 'stopped'),
        status('starting-server', 'starting'),
        status('running-server', 'running', { lastUsedAt: 90 }),
        status('unhealthy-server', 'unhealthy', {
          error: 'secret transport detail',
        }),
        status('failed-server', 'failed', {
          error: 'credential=must-not-escape',
        }),
      ],
    });

    expect(
      projection.integrations.map(({ id, kind, state, operations }) => ({
        id,
        kind,
        state,
        operations,
      })),
    ).toEqual([
      {
        id: 'failed-server',
        kind: 'external_mcp_server',
        state: 'Configuration available',
        operations: [],
      },
      {
        id: 'running-server',
        kind: 'external_mcp_server',
        state: 'Connected',
        operations: [],
      },
      {
        id: 'starting-server',
        kind: 'external_mcp_server',
        state: 'Configuration available',
        operations: [],
      },
      {
        id: 'stopped-server',
        kind: 'external_mcp_server',
        state: 'Configuration available',
        operations: [],
      },
      {
        id: 'unhealthy-server',
        kind: 'external_mcp_server',
        state: 'Configuration available',
        operations: [],
      },
    ]);
    expect(projection.refs).toEqual([
      {
        id: 'failed-server',
        state: 'degraded',
        operations: [],
        evidenceRef: 'mcp-manager-status:account-1:failed-server:failed:100',
        lastVerifiedAt: 100,
      },
      {
        id: 'running-server',
        state: 'connected',
        operations: [],
        evidenceRef: 'mcp-manager-status:account-1:running-server:running:100',
        lastVerifiedAt: 100,
      },
      {
        id: 'starting-server',
        state: 'available',
        operations: [],
      },
      {
        id: 'stopped-server',
        state: 'available',
        operations: [],
      },
      {
        id: 'unhealthy-server',
        state: 'degraded',
        operations: [],
        evidenceRef: 'mcp-manager-status:account-1:unhealthy-server:unhealthy:100',
        lastVerifiedAt: 100,
      },
    ]);
    expect(JSON.stringify(projection)).not.toContain('secret transport detail');
    expect(JSON.stringify(projection)).not.toContain('credential=must-not-escape');
    expect(JSON.stringify(projection)).not.toContain('vibespace-local');
  });

  it('does not invent discovered tools or verification from manager lifecycle state', () => {
    const projection = createJarvisMcpCapabilityProjection({
      accountId: 'account-1',
      capturedAt: 100,
      statuses: [status('external', 'running', { healthy: true, lastUsedAt: 90 })],
    });

    expect(projection.integrations).toEqual([
      expect.objectContaining({
        id: 'external',
        state: 'Connected',
        operations: [],
        evidence: {
          kind: 'connection_observation',
          ref: 'mcp-manager-status:account-1:external:running:100',
          observedAt: 100,
        },
      }),
    ]);
    expect(projection.integrations).not.toEqual([
      expect.objectContaining({ state: 'Connection verified' }),
    ]);
    expect(projection.integrations).not.toEqual([
      expect.objectContaining({ state: 'Tool available' }),
    ]);
  });

  it('returns canonical detached immutable output and ignores duplicate or unsafe status ids', () => {
    const source = [
      status('zeta', 'stopped'),
      status('alpha', 'running'),
      status('alpha', 'failed'),
      status('unsafe id', 'running'),
      status('control\u0000id', 'failed'),
    ];

    const projection = createJarvisMcpCapabilityProjection({
      accountId: 'account-1',
      capturedAt: 100,
      statuses: source,
    });

    source[0].id = 'mutated';
    expect(projection.refs.map((ref) => ref.id)).toEqual(['alpha', 'zeta']);
    expect(projection.refs[0]).toMatchObject({ state: 'degraded' });
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.refs)).toBe(true);
    expect(Object.isFrozen(projection.refs[0])).toBe(true);
    expect(() => {
      (projection.refs[0].operations as string[]).push('fabricated');
    }).toThrow();
  });

  it('produces refs accepted by the immutable capability snapshot contract', () => {
    const projection = createJarvisMcpCapabilityProjection({
      accountId: 'account-1',
      capturedAt: 100,
      statuses: [
        status('running', 'running'),
        status('failed', 'failed', { error: 'private failure detail' }),
      ],
    });

    const snapshot = createJarvisCapabilitySnapshot({
      capturedAt: 100,
      tools: [],
      plugins: [],
      mcps: projection.refs,
      terminals: [],
      agents: [],
      entitlements: {
        source: 'local_development',
        capabilities: ['jarvis.kernel.access'],
        verifiedAt: 90,
        expiresAt: 200,
      },
    });

    expect(snapshot.mcps).toEqual(projection.refs);
    expect(Object.isFrozen(snapshot.mcps)).toBe(true);
  });
});
