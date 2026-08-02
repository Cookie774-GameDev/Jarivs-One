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
    kind: id === 'vibespace-local' ? 'local_mcp_lite' : 'external_mcp',
    state,
    healthy: state === 'running',
    exposedTools: [],
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

  it('projects only explicitly exposed tools backed by fresh discovery evidence', () => {
    const projection = createJarvisMcpCapabilityProjection({
      accountId: 'account-1',
      capturedAt: 100,
      statuses: [
        status('github', 'running', {
          toolsDiscoveredAt: 90,
          exposedTools: ['repo.read', 'issue.search'],
        }),
        status('forged-without-discovery', 'running', {
          exposedTools: ['secret.dump'],
        }),
        status('unhealthy-with-tools', 'unhealthy', {
          toolsDiscoveredAt: 90,
          exposedTools: ['repo.read'],
        }),
        status('future-discovery', 'running', {
          toolsDiscoveredAt: 101,
          exposedTools: ['repo.read'],
        }),
      ],
    });

    expect(projection.refs).toEqual([
      {
        id: 'forged-without-discovery',
        state: 'connected',
        operations: [],
        evidenceRef: 'mcp-manager-status:account-1:forged-without-discovery:running:100',
        lastVerifiedAt: 100,
      },
      {
        id: 'future-discovery',
        state: 'connected',
        operations: [],
        evidenceRef: 'mcp-manager-status:account-1:future-discovery:running:100',
        lastVerifiedAt: 100,
      },
      {
        id: 'github',
        state: 'connected',
        operations: ['issue.search', 'repo.read'],
        evidenceRef: 'mcp-manager-discovery:account-1:github:90',
        lastVerifiedAt: 90,
      },
      {
        id: 'unhealthy-with-tools',
        state: 'degraded',
        operations: [],
        evidenceRef: 'mcp-manager-status:account-1:unhealthy-with-tools:unhealthy:100',
        lastVerifiedAt: 100,
      },
    ]);
    expect(projection.integrations).toEqual([
      expect.objectContaining({
        id: 'forged-without-discovery',
        state: 'Connected',
        operations: [],
      }),
      expect.objectContaining({
        id: 'future-discovery',
        state: 'Connected',
        operations: [],
      }),
      expect.objectContaining({
        id: 'github',
        state: 'Connected',
        operations: ['issue.search', 'repo.read'],
      }),
      expect.objectContaining({
        id: 'unhealthy-with-tools',
        state: 'Configuration available',
        operations: [],
      }),
    ]);
  });

  it('does not project operations from stale discovery evidence', () => {
    const projection = createJarvisMcpCapabilityProjection({
      accountId: 'account-1',
      capturedAt: 1_000_001,
      statuses: [
        status('stale-discovery', 'running', {
          toolsDiscoveredAt: 1,
          exposedTools: ['repo.read'],
        }),
      ],
    });

    expect(projection.refs).toEqual([
      {
        id: 'stale-discovery',
        state: 'connected',
        operations: [],
        evidenceRef: 'mcp-manager-status:account-1:stale-discovery:running:1000001',
        lastVerifiedAt: 1_000_001,
      },
    ]);
  });

  it('fails closed for an invalid capture timestamp', () => {
    const projection = createJarvisMcpCapabilityProjection({
      accountId: 'account-1',
      capturedAt: Number.NaN,
      statuses: [
        status('github', 'running', {
          toolsDiscoveredAt: 90,
          exposedTools: ['repo.read'],
        }),
      ],
    });

    expect(projection).toEqual({ integrations: [], refs: [] });
    expect(Object.isFrozen(projection)).toBe(true);
  });

  it('excludes local MCP-lite servers by classification even under a non-default id', () => {
    const projection = createJarvisMcpCapabilityProjection({
      accountId: 'account-1',
      capturedAt: 100,
      statuses: [
        status('renamed-local-bridge', 'running', {
          kind: 'local_mcp_lite',
          toolsDiscoveredAt: 90,
          exposedTools: ['fs.read'],
        }),
        status('vibespace-local', 'running', {
          kind: 'external_mcp',
          toolsDiscoveredAt: 90,
          exposedTools: ['remote.read'],
        }),
      ],
    });

    expect(projection.refs.map(({ id }) => id)).toEqual(['vibespace-local']);
    expect(projection.refs[0].operations).toEqual(['remote.read']);
  });

  it('returns canonical detached immutable output and ignores duplicate or unsafe status ids', () => {
    const source = [
      status('zeta', 'stopped'),
      status('alpha', 'running'),
      status('alpha', 'failed'),
      status('unsafe id', 'running'),
      status('control\u0000id', 'failed'),
      status('bidi\u202Eid', 'running'),
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
