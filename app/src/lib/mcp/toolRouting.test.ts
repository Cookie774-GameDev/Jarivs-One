import { describe, expect, it } from 'vitest';

import type { CanonicalMcpToolDescriptor } from './serverManager';
import { routeMcpToolsForTask, type McpToolRouteCandidate } from './toolRouting';

const schema = Object.freeze({
  type: 'object',
  properties: Object.freeze({}),
  additionalProperties: false,
});

function candidate(
  serverId: string,
  name: string,
  description: string,
  domains: readonly string[],
  serverKind: McpToolRouteCandidate['serverKind'] = 'external_mcp',
): McpToolRouteCandidate {
  const tool: CanonicalMcpToolDescriptor = Object.freeze({
    name,
    description,
    inputSchema: schema,
  });
  return { serverId, serverKind, domains, tool };
}

describe('routeMcpToolsForTask', () => {
  it('selects only a small deterministic relevant subset', () => {
    const candidates = [
      candidate('github', 'repo.read', 'Read repository metadata', ['github', 'repository']),
      candidate('github', 'issue.search', 'Search issues', ['github', 'issues']),
      candidate('gmail', 'message.search', 'Search email messages', ['gmail', 'email']),
      ...Array.from({ length: 12 }, (_, index) =>
        candidate(`calendar-${index}`, `event.list_${index}`, `List calendar events ${index}`, [
          'calendar',
        ]),
      ),
    ];

    const first = routeMcpToolsForTask('Find the GitHub repository issues', candidates, 20);
    const second = routeMcpToolsForTask('Find the GitHub repository issues', [...candidates], 20);

    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
    expect(first.map(({ serverId, name }) => `${serverId}.${name}`)).toEqual([
      'github.issue.search',
      'github.repo.read',
    ]);
    expect(first.every((tool) => tool.metadataTrust === 'external_untrusted')).toBe(true);
    expect(first.every((tool) => Object.isFrozen(tool))).toBe(true);
  });

  it('returns no arbitrary fallback tools when intent has no relevant match', () => {
    expect(
      routeMcpToolsForTask('Explain a haiku', [
        candidate('github', 'repo.read', 'Read repository metadata', ['github']),
        candidate('gmail', 'message.search', 'Search email messages', ['gmail']),
      ]),
    ).toEqual([]);
  });

  it('hard-caps routed schemas at eight even when a caller asks for more', () => {
    const routed = routeMcpToolsForTask(
      'search email messages',
      Array.from({ length: 30 }, (_, index) =>
        candidate('gmail', `message.search_${index}`, `Search email messages variant ${index}`, [
          'gmail',
          'email',
        ]),
      ),
      100,
    );

    expect(routed).toHaveLength(8);
    expect(routed.map(({ name }) => name)).toEqual(
      Array.from({ length: 8 }, (_, index) => `message.search_${index}`),
    );
  });

  it('keeps app-trusted local metadata distinguishable when explicitly included', () => {
    expect(
      routeMcpToolsForTask('read local file', [
        candidate(
          'vibespace-local',
          'fs.read',
          'Read an approved local file',
          ['files'],
          'local_mcp_lite',
        ),
      ]),
    ).toEqual([
      expect.objectContaining({
        metadataTrust: 'app_trusted',
        serverKind: 'local_mcp_lite',
      }),
    ]);
  });
});
