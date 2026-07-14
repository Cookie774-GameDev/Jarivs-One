import { readSupabaseEnv } from '@/lib/supabase/env';

import type { McpServerAdapter, McpServerClient, McpToolDescriptor } from './serverManager';

interface SupabaseEnvironment {
  url?: string;
  key?: string;
}

export interface SupabaseMcpAdapterDependencies {
  readEnv?: () => SupabaseEnvironment;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const LIST_TABLES_TOOL: McpToolDescriptor = {
  name: 'list_tables',
  description: 'List tables visible to the configured Supabase publishable/anon role. Read-only.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
};

function discoveryUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('The configured Supabase URL is invalid.');
  }
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error('The configured Supabase URL must use HTTP or HTTPS.');
  }
  return `${parsed.toString().replace(/\/+$/, '')}/rest/v1/`;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function visibleTableNames(spec: unknown): string[] {
  const root = record(spec);
  if (!root) throw new Error('Supabase returned an invalid schema document.');
  const components = record(root.components);
  const schemas = record(components?.schemas);
  const definitions = record(root.definitions);
  const names = Object.keys(schemas ?? definitions ?? {})
    .map((name) => name.trim())
    .filter(Boolean);
  return [...new Set(names)].sort((left, right) => left.localeCompare(right));
}

function cancelledError(): DOMException {
  return new DOMException('Supabase schema discovery was cancelled.', 'AbortError');
}

export function createSupabaseMcpAdapter(
  dependencies: SupabaseMcpAdapterDependencies = {},
): McpServerAdapter {
  const getEnvironment = dependencies.readEnv ?? readSupabaseEnv;
  const fetchImpl = dependencies.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = dependencies.timeoutMs ?? 10_000;

  return {
    id: 'supabase',
    start: async (): Promise<McpServerClient> => {
      const environment = getEnvironment();
      const url = environment.url?.trim();
      const key = environment.key?.trim();
      if (!url || !key) {
        throw new Error('Supabase is not configured for this build.');
      }
      const endpoint = discoveryUrl(url);
      let cachedTables: string[] | undefined;
      let stopped = false;

      const loadTables = async (signal?: AbortSignal): Promise<string[]> => {
        if (cachedTables) return [...cachedTables];
        if (stopped) throw new Error('The Supabase MCP adapter is stopped.');
        if (signal?.aborted) throw cancelledError();
        const controller = new AbortController();
        const onAbort = () => controller.abort(signal?.reason);
        signal?.addEventListener('abort', onAbort, { once: true });
        const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
        try {
          let response: Response;
          try {
            response = await fetchImpl(endpoint, {
              method: 'GET',
              headers: {
                Accept: 'application/openapi+json, application/json',
                apikey: key,
                Authorization: `Bearer ${key}`,
              },
              signal: controller.signal,
            });
          } catch {
            if (signal?.aborted) throw cancelledError();
            if (controller.signal.aborted) {
              throw new Error(`Supabase schema discovery timed out after ${timeoutMs}ms.`);
            }
            throw new Error('Supabase schema discovery request failed.');
          }
          if (!response.ok) {
            throw new Error(`Supabase schema discovery failed (HTTP ${response.status}).`);
          }
          cachedTables = visibleTableNames(await response.json());
          return [...cachedTables];
        } finally {
          clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
        }
      };

      return {
        listTools: async () => [LIST_TABLES_TOOL],
        invoke: async (toolName, _input, signal) => {
          if (toolName !== LIST_TABLES_TOOL.name) {
            throw new Error(`Unknown Supabase MCP tool '${toolName}'.`);
          }
          const tables = await loadTables(signal);
          return {
            tables,
            count: tables.length,
            readOnly: true,
            source: 'supabase-rest-openapi',
          };
        },
        health: async () => {
          if (stopped) return false;
          await loadTables();
          return true;
        },
        stop: async () => {
          stopped = true;
          cachedTables = undefined;
        },
      };
    },
  };
}

export const supabaseMcpAdapter = createSupabaseMcpAdapter();
