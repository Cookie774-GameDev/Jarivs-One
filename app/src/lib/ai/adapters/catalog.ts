import { CLAUDE_CLI_DEFINITION } from './claude';
import { CODEX_CLI_DEFINITION } from './codex';
import { COPILOT_CLI_DEFINITION } from './copilot';
import { GEMINI_CLI_DEFINITION } from './gemini';
import {
  ANTHROPIC_API_CONNECTION,
  DEEPSEEK_API_CONNECTION,
  GEMINI_API_CONNECTION,
  OLLAMA_LOCAL_CONNECTION,
  OPENAI_API_CONNECTION,
  QWEN_API_CONNECTION,
  VERTEX_API_CONNECTION,
  XAI_API_CONNECTION,
  ZAI_API_CONNECTION,
} from './nativeCatalog';
import { OPENCODE_CLI_DEFINITION } from './opencode';
import { QWEN_CLI_DEFINITION } from './qwen';
import type { CliProviderDefinition } from './cliBridge';
import type { ProviderCapabilities, ProviderConnection } from './types';

export type ProviderFamilyId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'github'
  | 'xai'
  | 'deepseek'
  | 'zai'
  | 'qwen'
  | 'ollama'
  | 'opencode';

export interface ProviderFamilyDescriptor {
  id: ProviderFamilyId;
  displayName: string;
  connections: readonly Readonly<ProviderConnection>[];
  externalCli?: ExternalCliCatalogDescriptor;
}

export interface ExternalCliCatalogDescriptor {
  adapterId: string;
  connectionId: string;
  executableName: string;
  versionArgs: readonly string[];
  authProbeArgs?: readonly string[];
  modelListArgs?: readonly string[];
}

function externalCapabilities(
  overrides: Partial<ProviderCapabilities> = {},
): Readonly<ProviderCapabilities> {
  return Object.freeze({
    text: true,
    images: false,
    files: false,
    tools: false,
    modelSelection: true,
    structuredOutput: true,
    streaming: true,
    cancellation: true,
    resumeSession: false,
    systemPrompt: false,
    workingDirectory: true,
    usage: true,
    subscriptionQuota: false,
    localOnly: false,
    ...overrides,
  });
}

function externalConnection(input: {
  id: string;
  adapterId: string;
  providerId: string;
  displayName: string;
  authSource: string;
  capabilities?: Partial<ProviderCapabilities>;
}): Readonly<ProviderConnection> {
  return Object.freeze({
    id: input.id,
    adapterId: input.adapterId,
    providerId: input.providerId,
    displayName: input.displayName,
    mode: 'external-cli' as const,
    authSource: input.authSource,
    capabilities: externalCapabilities(input.capabilities),
    enabled: true,
  });
}

export const CODEX_CLI_CONNECTION = externalConnection({
  id: 'openai-codex',
  adapterId: CODEX_CLI_DEFINITION.adapterId,
  providerId: 'openai',
  displayName: 'Codex CLI',
  authSource: 'codex-cli-session',
});

export const CLAUDE_CLI_CONNECTION = externalConnection({
  id: 'anthropic-claude-code',
  adapterId: CLAUDE_CLI_DEFINITION.adapterId,
  providerId: 'anthropic',
  displayName: 'Claude Code CLI',
  authSource: 'claude-code-session',
});

export const GEMINI_CLI_CONNECTION = externalConnection({
  id: 'google-gemini-cli',
  adapterId: GEMINI_CLI_DEFINITION.adapterId,
  providerId: 'google',
  displayName: 'Gemini CLI',
  authSource: 'gemini-cli-session',
  capabilities: { modelSelection: false },
});

export const COPILOT_CLI_CONNECTION = externalConnection({
  id: 'github-copilot-cli',
  adapterId: COPILOT_CLI_DEFINITION.adapterId,
  providerId: 'github',
  displayName: 'GitHub Copilot CLI',
  authSource: 'github-copilot-session',
  capabilities: { streaming: false, usage: false },
});

export const QWEN_CLI_CONNECTION = externalConnection({
  id: 'qwen-code',
  adapterId: QWEN_CLI_DEFINITION.adapterId,
  providerId: 'qwen',
  displayName: 'Qwen Code CLI',
  authSource: 'qwen-code-session',
});

export const OPENCODE_CLI_CONNECTION = externalConnection({
  id: 'opencode-cli',
  adapterId: OPENCODE_CLI_DEFINITION.adapterId,
  providerId: 'opencode',
  displayName: 'OpenCode Bridge',
  authSource: 'opencode-provider-session',
});

function family(
  id: ProviderFamilyId,
  displayName: string,
  connections: readonly Readonly<ProviderConnection>[],
  externalCli?: ExternalCliCatalogDescriptor,
): Readonly<ProviderFamilyDescriptor> {
  return Object.freeze({
    id,
    displayName,
    connections: Object.freeze([...connections]),
    ...(externalCli ? { externalCli } : {}),
  });
}

function externalCliDescriptor(
  definition: CliProviderDefinition,
): Readonly<ExternalCliCatalogDescriptor> {
  return Object.freeze({
    adapterId: definition.adapterId,
    connectionId: definition.connectionId,
    executableName: definition.executableName,
    versionArgs: definition.versionArgs,
    ...(definition.authProbeArgs ? { authProbeArgs: definition.authProbeArgs } : {}),
    ...(definition.modelListArgs ? { modelListArgs: definition.modelListArgs } : {}),
  });
}

const CODEX_CLI_SURFACE = externalCliDescriptor(CODEX_CLI_DEFINITION);
const CLAUDE_CLI_SURFACE = externalCliDescriptor(CLAUDE_CLI_DEFINITION);
const GEMINI_CLI_SURFACE = externalCliDescriptor(GEMINI_CLI_DEFINITION);
const COPILOT_CLI_SURFACE = externalCliDescriptor(COPILOT_CLI_DEFINITION);
const QWEN_CLI_SURFACE = externalCliDescriptor(QWEN_CLI_DEFINITION);
const OPENCODE_CLI_SURFACE = externalCliDescriptor(OPENCODE_CLI_DEFINITION);

export const PROVIDER_CATALOG: Readonly<
  Record<ProviderFamilyId, Readonly<ProviderFamilyDescriptor>>
> = Object.freeze({
  openai: family(
    'openai',
    'OpenAI',
    [CODEX_CLI_CONNECTION, OPENAI_API_CONNECTION],
    CODEX_CLI_SURFACE,
  ),
  anthropic: family(
    'anthropic',
    'Anthropic',
    [CLAUDE_CLI_CONNECTION, ANTHROPIC_API_CONNECTION],
    CLAUDE_CLI_SURFACE,
  ),
  google: family(
    'google',
    'Google',
    [GEMINI_CLI_CONNECTION, GEMINI_API_CONNECTION, VERTEX_API_CONNECTION],
    GEMINI_CLI_SURFACE,
  ),
  github: family('github', 'GitHub', [COPILOT_CLI_CONNECTION], COPILOT_CLI_SURFACE),
  xai: family('xai', 'xAI', [XAI_API_CONNECTION]),
  deepseek: family('deepseek', 'DeepSeek', [DEEPSEEK_API_CONNECTION]),
  zai: family('zai', 'Z.AI / GLM', [ZAI_API_CONNECTION]),
  qwen: family('qwen', 'Qwen', [QWEN_CLI_CONNECTION, QWEN_API_CONNECTION], QWEN_CLI_SURFACE),
  ollama: family('ollama', 'Ollama', [OLLAMA_LOCAL_CONNECTION]),
  opencode: family('opencode', 'OpenCode', [OPENCODE_CLI_CONNECTION], OPENCODE_CLI_SURFACE),
});

export const PROVIDER_CONNECTIONS: readonly Readonly<ProviderConnection>[] = Object.freeze([
  CODEX_CLI_CONNECTION,
  OPENAI_API_CONNECTION,
  CLAUDE_CLI_CONNECTION,
  ANTHROPIC_API_CONNECTION,
  GEMINI_CLI_CONNECTION,
  GEMINI_API_CONNECTION,
  VERTEX_API_CONNECTION,
  COPILOT_CLI_CONNECTION,
  XAI_API_CONNECTION,
  DEEPSEEK_API_CONNECTION,
  ZAI_API_CONNECTION,
  QWEN_CLI_CONNECTION,
  QWEN_API_CONNECTION,
  OLLAMA_LOCAL_CONNECTION,
  OPENCODE_CLI_CONNECTION,
]);

const CONNECTIONS_BY_ID = new Map(
  PROVIDER_CONNECTIONS.map((connection) => [connection.id, connection]),
);

export function getProviderConnectionDescriptor(
  connectionId: string,
): Readonly<ProviderConnection> {
  const connection = CONNECTIONS_BY_ID.get(connectionId);
  if (!connection) throw new Error(`Unknown provider connection: ${connectionId}`);
  return connection;
}

export const providerCatalog = PROVIDER_CATALOG;
