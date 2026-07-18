import type { CompiledJarvisPrompt } from '@/lib/jarvis/contracts';
import { validateCompiledJarvisPrompt } from '@/lib/jarvis/contracts';
import type { ProviderConnection } from '@/lib/ai/adapters/types';
import type { LLMMessage } from '@/lib/ai/types';
import { deepFreezeJarvisCopy } from '@/lib/jarvis/requestEnvelope';

export type ProviderPromptTransport =
  | {
      strategy: 'native-system';
      systemPrompt: string;
      messages: readonly LLMMessage[];
      compiledHash: string;
    }
  | {
      strategy: 'prefixed-preamble';
      prompt: string;
      compiledHash: string;
    };

export class UnsupportedPromptTransportError extends Error {
  readonly code = 'unsupported_prompt_transport' as const;
  readonly connectionId: string;

  constructor(connectionId: string) {
    super('The selected connection cannot preserve the protected prompt contract.');
    this.name = 'UnsupportedPromptTransportError';
    this.connectionId = connectionId;
  }
}

function assertConnectionStrategy(connection: Readonly<ProviderConnection>): void {
  if (
    connection.promptTransport === 'native-system' &&
    (connection.mode === 'external-cli' || !connection.capabilities.systemPrompt)
  ) {
    throw new Error('Native prompt transport contradicts the connection declaration.');
  }
  if (
    connection.promptTransport === 'prefixed-preamble' &&
    (connection.mode !== 'external-cli' || connection.capabilities.systemPrompt)
  ) {
    throw new Error('Preamble prompt transport contradicts the connection declaration.');
  }
}

function assertCompiledPrompt(compiled: Readonly<CompiledJarvisPrompt>): void {
  const validation = validateCompiledJarvisPrompt(compiled);
  if (!validation.ok || !/^[0-9a-f]{64}$/.test(compiled.promptHash)) {
    throw new Error('The compiled protected prompt is invalid.');
  }
}

export function buildProviderPromptTransport(input: {
  compiled: Readonly<CompiledJarvisPrompt>;
  connection: Readonly<ProviderConnection>;
  messages: readonly LLMMessage[];
}): Readonly<ProviderPromptTransport> {
  if (input.connection.promptTransport === 'unsupported') {
    throw new UnsupportedPromptTransportError(input.connection.id);
  }
  assertConnectionStrategy(input.connection);
  assertCompiledPrompt(input.compiled);

  if (input.connection.promptTransport === 'native-system') {
    return deepFreezeJarvisCopy({
      strategy: 'native-system' as const,
      systemPrompt: input.compiled.systemText,
      messages: input.messages,
      compiledHash: input.compiled.promptHash,
    });
  }

  let serializedMessages: string;
  try {
    serializedMessages = JSON.stringify(input.messages);
  } catch {
    throw new Error('Provider messages are not deterministically serializable.');
  }
  const prompt = [
    `<VIBESPACE_SYSTEM_CONTRACT schema="1" sha256="${input.compiled.promptHash}">`,
    input.compiled.systemText,
    '</VIBESPACE_SYSTEM_CONTRACT>',
    '<VIBESPACE_MESSAGES>',
    serializedMessages,
    '</VIBESPACE_MESSAGES>',
  ].join('\n');
  return deepFreezeJarvisCopy({
    strategy: 'prefixed-preamble' as const,
    prompt,
    compiledHash: input.compiled.promptHash,
  });
}
