import { describe, expect, it, vi } from 'vitest';

import type { McpRoutedTool } from './toolRouting';
import { buildRoutedMcpTaskContext } from './taskContext';

const EMPTY_SCHEMA = Object.freeze({
  type: 'object',
  properties: Object.freeze({}),
  additionalProperties: false,
});

function routed(
  serverId: string,
  name: string,
  overrides: Partial<McpRoutedTool> = {},
): Readonly<McpRoutedTool> {
  return Object.freeze({
    serverId,
    serverKind: 'external_mcp',
    name,
    description: `Use ${name}`,
    inputSchema: EMPTY_SCHEMA,
    metadataTrust: 'external_untrusted',
    relevanceScore: 10,
    ...overrides,
  });
}

describe('buildRoutedMcpTaskContext', () => {
  it('requests only the bounded external subset and does no discovery or invocation', () => {
    const routeTools = vi.fn(() => [] as readonly Readonly<McpRoutedTool>[]);

    expect(buildRoutedMcpTaskContext('read the repository', { routeTools })).toBeUndefined();
    expect(routeTools).toHaveBeenCalledWith('read the repository', {
      includeLocal: false,
      limit: 8,
    });
    expect(Object.keys({ routeTools })).toEqual(['routeTools']);
  });

  it('renders only relevant external schemas as immutable untrusted capability context', () => {
    const routeTools = vi.fn(() => [
      routed('github', 'repo.read', {
        title: 'Read repository',
        description: 'Read repository metadata',
        inputSchema: Object.freeze({
          type: 'object',
          properties: Object.freeze({
            owner: Object.freeze({ type: 'string' }),
          }),
          required: Object.freeze(['owner']),
          additionalProperties: false,
        }),
        relevanceScore: 42,
      }),
      routed('vibespace-local', 'fs.read', {
        serverKind: 'local_mcp_lite',
        metadataTrust: 'app_trusted',
      }),
    ]);

    const block = buildRoutedMcpTaskContext('read the GitHub repository', { routeTools });
    expect(block?.key).toBe('mcp_tool_schemas');
    const payload = JSON.parse(block?.text ?? '{}') as {
      schemaVersion: number;
      tools: Array<Record<string, unknown>>;
    };
    expect(payload.schemaVersion).toBe(1);
    expect(payload.tools).toEqual([
      {
        serverId: 'github',
        toolName: 'repo.read',
        title: 'Read repository',
        description: 'Read repository metadata',
        inputSchema: {
          type: 'object',
          properties: { owner: { type: 'string' } },
          required: ['owner'],
          additionalProperties: false,
        },
        metadataTrust: 'external_untrusted',
      },
    ]);
    expect(block?.text).not.toMatch(/relevanceScore|domains|fs\.read/);
    expect(Object.isFrozen(block)).toBe(true);
  });

  it('omits credential-shaped schemas and preserves only complete JSON under the hard budget', () => {
    const oversizedSchema = Object.freeze({
      type: 'object',
      properties: Object.freeze({
        body: Object.freeze({
          type: 'string',
          enum: Object.freeze(['x'.repeat(12_000)]),
        }),
      }),
      additionalProperties: false,
    });
    const routeTools = vi.fn(() => [
      routed('unsafe', 'credential.read', {
        inputSchema: Object.freeze({
          type: 'object',
          properties: Object.freeze({
            apiKey: Object.freeze({ type: 'string' }),
          }),
          additionalProperties: false,
        }),
      }),
      routed('oversized', 'blob.read', { inputSchema: oversizedSchema }),
      ...Array.from({ length: 10 }, (_, index) => routed('github', `repo.read_${index}`)),
    ]);

    const block = buildRoutedMcpTaskContext('read repositories', { routeTools });
    expect(block).toBeDefined();
    expect((block?.text.length ?? Infinity) <= 12_000).toBe(true);
    const payload = JSON.parse(block?.text ?? '{}') as {
      tools: Array<{ serverId: string; toolName: string; inputSchema: unknown }>;
    };
    expect(payload.tools.length).toBeGreaterThan(0);
    expect(payload.tools.length).toBeLessThanOrEqual(8);
    expect(payload.tools.every((tool) => tool.inputSchema !== undefined)).toBe(true);
    expect(payload.tools.map(({ serverId }) => serverId)).not.toContain('unsafe');
    expect(payload.tools.map(({ serverId }) => serverId)).not.toContain('oversized');
  });

  it('returns no block when every routed schema is unsafe or over budget', () => {
    const routeTools = vi.fn(() => [
      routed('unsafe', 'credential.read', {
        inputSchema: Object.freeze({
          type: 'object',
          properties: Object.freeze({
            password: Object.freeze({ type: 'string' }),
          }),
          additionalProperties: false,
        }),
      }),
      routed('oversized', 'blob.read', {
        inputSchema: Object.freeze({
          type: 'object',
          properties: Object.freeze({
            body: Object.freeze({
              type: 'string',
              enum: Object.freeze(['x'.repeat(12_000)]),
            }),
          }),
          additionalProperties: false,
        }),
      }),
    ]);

    expect(buildRoutedMcpTaskContext('read data', { routeTools })).toBeUndefined();
  });
});
