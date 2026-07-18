import {
  assertCliPrompt,
  boundedProviderIdentifier,
  boundedProviderText,
  createCliProviderAdapter,
  normalizeProviderJsonl,
  requireModelId,
  responseUsageSnapshot,
  type CliInvocation,
  type CliInvocationRequest,
  type CliProviderDefinition,
  type JsonlParserLimits,
  type ProviderRecordContext,
  type ProviderRecordNormalization,
} from './cliBridge';
import type { ProviderEvent } from './types';

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

const CLAUDE_TEXT_MODE = 'claudeTextMode';

function contentEvents(value: unknown, includeText: boolean): ProviderEvent[] {
  if (!Array.isArray(value)) return [];
  const events: ProviderEvent[] = [];
  for (const entry of value) {
    const block = recordOf(entry);
    if (!block) continue;
    if (block.type === 'tool_use' || block.type === 'tool_result') {
      const name =
        boundedProviderIdentifier(block.name) ??
        (block.type === 'tool_result' ? 'tool' : undefined);
      if (name) {
        const callId = boundedProviderIdentifier(block.id ?? block.tool_use_id);
        events.push({
          type: 'tool',
          name,
          status: block.type === 'tool_result' ? 'completed' : 'started',
          ...(callId ? { callId } : {}),
        });
      }
      continue;
    }
    const delta = boundedProviderText(block.text ?? block.thinking, 32_768);
    if (!delta) continue;
    if (block.type === 'thinking') {
      events.push({ type: 'reasoning', delta });
    } else if (includeText) {
      events.push({ type: 'text', delta });
    }
  }
  return events;
}

export function buildClaudeInvocation(request: CliInvocationRequest): CliInvocation {
  assertCliPrompt(request.prompt);
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
  if (request.modelId) args.push('--model', requireModelId(request.modelId, 'Claude'));
  return {
    args,
    stdin: request.prompt,
    ...(request.workingDirectory ? { cwd: request.workingDirectory } : {}),
  };
}

export function normalizeClaudeRecord(
  record: Readonly<Record<string, unknown>>,
  context?: ProviderRecordContext,
): ProviderRecordNormalization {
  if (record.type === 'system' && record.subtype === 'init') {
    const events: ProviderEvent[] = [];
    const sessionId = boundedProviderIdentifier(record.session_id);
    const modelId = boundedProviderIdentifier(record.model);
    if (sessionId) events.push({ type: 'session', sessionId });
    if (modelId) events.push({ type: 'model', modelId });
    return { recognized: true, events };
  }
  if (record.type === 'assistant') {
    const message = recordOf(record.message);
    const textMode = context?.state.get(CLAUDE_TEXT_MODE);
    const events = contentEvents(message?.content, textMode === undefined);
    if (events.some((event) => event.type === 'text')) {
      context?.state.set(CLAUDE_TEXT_MODE, 'complete');
    }
    const usage = recordOf(message?.usage);
    if (usage) {
      events.push({
        type: 'usage',
        usage: responseUsageSnapshot({
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
        }),
      });
    }
    return { recognized: true, events };
  }
  if (record.type === 'stream_event') {
    const event = recordOf(record.event);
    const delta = recordOf(event?.delta);
    if (event?.type !== 'content_block_delta' || !delta) {
      return { recognized: true, events: [] };
    }
    const text = boundedProviderText(delta.text ?? delta.thinking, 32_768);
    if (!text) return { recognized: true, events: [] };
    if (delta.type !== 'thinking_delta') {
      if (context?.state.get(CLAUDE_TEXT_MODE) === 'complete') {
        return { recognized: true, events: [] };
      }
      context?.state.set(CLAUDE_TEXT_MODE, 'partial');
    }
    return {
      recognized: true,
      events: [
        delta.type === 'thinking_delta'
          ? { type: 'reasoning', delta: text }
          : { type: 'text', delta: text },
      ],
    };
  }
  if (record.type === 'result') {
    if (typeof record.subtype !== 'string') {
      throw new Error('Malformed Claude terminal event');
    }
    const events: ProviderEvent[] = [];
    const sessionId = boundedProviderIdentifier(record.session_id);
    const modelId = boundedProviderIdentifier(record.model);
    if (sessionId) events.push({ type: 'session', sessionId });
    if (modelId) events.push({ type: 'model', modelId });
    if (record.subtype === 'success') {
      const text = boundedProviderText(record.result, 32_768);
      if (text && context?.state.get(CLAUDE_TEXT_MODE) === undefined) {
        events.push({ type: 'text', delta: text });
        context?.state.set(CLAUDE_TEXT_MODE, 'complete');
      }
      const usage = recordOf(record.usage);
      if (usage || typeof record.total_cost_usd === 'number') {
        events.push({
          type: 'usage',
          usage: responseUsageSnapshot({
            inputTokens: usage?.input_tokens,
            outputTokens: usage?.output_tokens,
            costUsd: record.total_cost_usd,
          }),
        });
      }
      events.push({ type: 'done', finishReason: 'success' });
      return { recognized: true, events };
    }
    const nested = recordOf(record.error);
    const message = boundedProviderText(
      typeof record.error === 'string' ? record.error : (nested?.message ?? record.result),
      2_048,
    );
    events.push({ type: 'error', message: message || 'Claude CLI reported an error.' });
    return { recognized: true, events };
  }
  return { recognized: false, events: [] };
}

export function normalizeClaudeJsonl(input: string, limits?: JsonlParserLimits): ProviderEvent[] {
  return normalizeProviderJsonl(input, normalizeClaudeRecord, limits);
}

export const CLAUDE_CLI_DEFINITION: CliProviderDefinition = Object.freeze({
  adapterId: 'claude-code-cli',
  connectionId: 'anthropic-claude-code',
  promptTransport: 'prefixed-preamble',
  executableName: 'claude',
  versionArgs: Object.freeze(['--version']),
  authProbeArgs: Object.freeze(['auth', 'status']),
  buildInvocation: buildClaudeInvocation,
  normalizeRecord: normalizeClaudeRecord,
});

export const claudeCliAdapter = createCliProviderAdapter(CLAUDE_CLI_DEFINITION);
