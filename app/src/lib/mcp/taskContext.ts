import type { JarvisRuntimeContextBlock } from '@/lib/jarvis/runtimeContextCandidates';
import { isJarvisModelVisibleSchemaSafe } from '@/lib/jarvis/sourcePolicy';
import { jarvisMcpServerManager, type McpRouteOptions } from './serverManager';
import type { McpRoutedTool } from './toolRouting';

const MAX_ROUTED_TOOLS = 8;
const MAX_CONTEXT_CHARS = 12_000;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u;
const SAFE_TOOL_NAME = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const UNSAFE_TEXT = /[\p{C}\p{Zl}\p{Zp}]/u;

export interface McpTaskToolRouter {
  routeTools(query: string, options: McpRouteOptions): readonly Readonly<McpRoutedTool>[];
}

interface PromptToolSchema {
  readonly serverId: string;
  readonly toolName: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly metadataTrust: 'external_untrusted';
}

function validText(value: unknown, maxChars: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxChars &&
    !UNSAFE_TEXT.test(value)
  );
}

function promptTool(tool: Readonly<McpRoutedTool>): PromptToolSchema | undefined {
  if (
    !isJarvisModelVisibleSchemaSafe(tool) ||
    tool.serverKind !== 'external_mcp' ||
    tool.metadataTrust !== 'external_untrusted' ||
    !SAFE_ID.test(tool.serverId) ||
    !SAFE_TOOL_NAME.test(tool.name) ||
    !validText(tool.description, 1_000) ||
    (tool.title !== undefined && !validText(tool.title, 160)) ||
    !tool.inputSchema ||
    typeof tool.inputSchema !== 'object' ||
    Array.isArray(tool.inputSchema) ||
    !isJarvisModelVisibleSchemaSafe(tool.inputSchema)
  ) {
    return undefined;
  }
  return {
    serverId: tool.serverId,
    toolName: tool.name,
    ...(tool.title === undefined ? {} : { title: tool.title }),
    description: tool.description,
    inputSchema: tool.inputSchema,
    metadataTrust: 'external_untrusted',
  };
}

function serialize(tools: readonly PromptToolSchema[]): string | undefined {
  try {
    return JSON.stringify({ schemaVersion: 1, tools });
  } catch {
    return undefined;
  }
}

/**
 * Projects only already-discovered, explicitly exposed tools that relate to
 * this request. It never starts a server, discovers tools, or invokes one.
 */
export function buildRoutedMcpTaskContext(
  userText: string,
  router: McpTaskToolRouter = jarvisMcpServerManager,
): Readonly<JarvisRuntimeContextBlock> | undefined {
  const routed = router.routeTools(userText, {
    includeLocal: false,
    limit: MAX_ROUTED_TOOLS,
  });
  const selected: PromptToolSchema[] = [];
  for (const candidate of routed) {
    if (selected.length >= MAX_ROUTED_TOOLS) break;
    const tool = promptTool(candidate);
    if (!tool) continue;
    const next = [...selected, tool];
    const serialized = serialize(next);
    if (!serialized || serialized.length > MAX_CONTEXT_CHARS) continue;
    selected.push(tool);
  }
  const text = selected.length === 0 ? undefined : serialize(selected);
  if (!text || text.length > MAX_CONTEXT_CHARS) return undefined;
  return Object.freeze({
    key: 'mcp_tool_schemas',
    text,
  });
}
