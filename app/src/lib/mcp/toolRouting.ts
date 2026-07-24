import type { CanonicalMcpToolDescriptor, McpServerKind } from './serverManager';

const MAX_ROUTED_TOOLS = 8;
const MAX_QUERY_CHARS = 2_000;
const TOKEN_PATTERN = /[\p{L}\p{N}]+/gu;
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'for',
  'from',
  'in',
  'of',
  'on',
  'the',
  'to',
  'with',
]);

export interface McpToolRouteCandidate {
  serverId: string;
  serverKind: McpServerKind;
  domains: readonly string[];
  tool: CanonicalMcpToolDescriptor;
}

export interface McpRoutedTool {
  readonly serverId: string;
  readonly serverKind: McpServerKind;
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly metadataTrust: 'app_trusted' | 'external_untrusted';
  readonly relevanceScore: number;
}

function normalizedToken(value: string): string {
  const normalized = value.toLocaleLowerCase('en-US');
  return normalized.length > 3 && normalized.endsWith('s') ? normalized.slice(0, -1) : normalized;
}

function tokens(value: string): Set<string> {
  const output = new Set<string>();
  for (const match of value.slice(0, MAX_QUERY_CHARS).matchAll(TOKEN_PATTERN)) {
    const token = normalizedToken(match[0]);
    if (token.length >= 2 && !STOP_WORDS.has(token)) output.add(token);
  }
  return output;
}

function overlap(query: ReadonlySet<string>, value: string): number {
  let matches = 0;
  for (const token of tokens(value)) {
    if (query.has(token)) matches += 1;
  }
  return matches;
}

function relevance(query: ReadonlySet<string>, candidate: McpToolRouteCandidate): number {
  if (query.size === 0) return 0;
  return (
    overlap(query, candidate.domains.join(' ')) * 10 +
    overlap(query, candidate.serverId) * 8 +
    overlap(query, candidate.tool.name.replace(/[_.:-]+/gu, ' ')) * 6 +
    overlap(query, candidate.tool.title ?? '') * 4 +
    overlap(query, candidate.tool.description) * 2
  );
}

function compareRouted(left: McpRoutedTool, right: McpRoutedTool): number {
  if (left.relevanceScore !== right.relevanceScore) {
    return right.relevanceScore - left.relevanceScore;
  }
  const serverOrder = left.serverId.localeCompare(right.serverId, 'en', {
    numeric: true,
    sensitivity: 'variant',
  });
  if (serverOrder !== 0) return serverOrder;
  return left.name.localeCompare(right.name, 'en', {
    numeric: true,
    sensitivity: 'variant',
  });
}

/**
 * Selects only schemas that have a positive lexical/domain relationship to
 * the current task. Provider-authored metadata remains explicitly untrusted.
 */
export function routeMcpToolsForTask(
  query: string,
  candidates: readonly McpToolRouteCandidate[],
  requestedLimit = MAX_ROUTED_TOOLS,
): readonly Readonly<McpRoutedTool>[] {
  const queryTokens = tokens(typeof query === 'string' ? query : '');
  const limit = Math.max(0, Math.min(MAX_ROUTED_TOOLS, Math.floor(requestedLimit)));
  if (limit === 0 || queryTokens.size === 0) return Object.freeze([]);

  const routed = candidates
    .map((candidate): McpRoutedTool | null => {
      const relevanceScore = relevance(queryTokens, candidate);
      if (relevanceScore <= 0) return null;
      return Object.freeze({
        serverId: candidate.serverId,
        serverKind: candidate.serverKind,
        name: candidate.tool.name,
        ...(candidate.tool.title === undefined ? {} : { title: candidate.tool.title }),
        description: candidate.tool.description,
        inputSchema: candidate.tool.inputSchema,
        metadataTrust:
          candidate.serverKind === 'local_mcp_lite'
            ? ('app_trusted' as const)
            : ('external_untrusted' as const),
        relevanceScore,
      });
    })
    .filter((tool): tool is McpRoutedTool => tool !== null)
    .sort(compareRouted)
    .slice(0, limit);

  return Object.freeze(routed);
}
