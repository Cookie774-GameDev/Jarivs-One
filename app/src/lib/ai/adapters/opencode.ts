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
  type ProviderRecordNormalization,
} from './cliBridge';
import type { ProviderEvent } from './types';

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function buildOpenCodeInvocation(request: CliInvocationRequest): CliInvocation {
  assertCliPrompt(request.prompt);
  const modelId = requireModelId(request.modelId, 'OpenCode');
  return {
    args: ['run', '--format', 'json', '--model', modelId],
    stdin: request.prompt,
    ...(request.workingDirectory ? { cwd: request.workingDirectory } : {}),
  };
}

export function normalizeOpenCodeRecord(
  record: Readonly<Record<string, unknown>>,
): ProviderRecordNormalization {
  const part = recordOf(record.part);
  if (record.type === 'step_start') {
    const events: ProviderEvent[] = [];
    const sessionId = boundedProviderIdentifier(
      part?.sessionID ?? part?.session_id ?? record.sessionID ?? record.session_id,
    );
    const modelId = boundedProviderIdentifier(
      part?.modelID ?? part?.model_id ?? record.modelID ?? record.model_id,
    );
    if (sessionId) events.push({ type: 'session', sessionId });
    if (modelId) events.push({ type: 'model', modelId });
    return { recognized: true, events };
  }
  if (record.type === 'text') {
    const delta = boundedProviderText(part?.text, 32_768);
    return { recognized: true, events: delta ? [{ type: 'text', delta }] : [] };
  }
  if (record.type === 'reasoning') {
    const delta = boundedProviderText(part?.text, 32_768);
    return { recognized: true, events: delta ? [{ type: 'reasoning', delta }] : [] };
  }
  if (record.type === 'tool_use') {
    const state = recordOf(part?.state);
    const name = boundedProviderIdentifier(part?.tool);
    const rawStatus = state?.status;
    const status =
      rawStatus === 'completed' ? 'completed' : rawStatus === 'error' ? 'failed' : 'started';
    const callId = boundedProviderIdentifier(part?.callID ?? part?.call_id);
    return {
      recognized: true,
      events: name
        ? [
            {
              type: 'tool',
              name,
              status,
              ...(callId ? { callId } : {}),
            },
          ]
        : [],
    };
  }
  if (record.type === 'step_finish') {
    if (!part || part.type !== 'step-finish' || typeof part.reason !== 'string') {
      throw new Error('Malformed OpenCode terminal event');
    }
    const tokens = recordOf(part.tokens);
    const events: ProviderEvent[] = [];
    if (tokens || typeof part.cost === 'number') {
      events.push({
        type: 'usage',
        usage: responseUsageSnapshot({
          inputTokens: tokens?.input,
          outputTokens: tokens?.output,
          totalTokens: tokens?.total,
          costUsd: part.cost,
        }),
      });
    }
    events.push({
      type: 'done',
      ...(boundedProviderIdentifier(part.reason)
        ? { finishReason: boundedProviderIdentifier(part.reason) }
        : {}),
    });
    return { recognized: true, events };
  }
  if (record.type === 'error') {
    const message = boundedProviderText(record.message ?? record.error, 2_048);
    return {
      recognized: true,
      events: [{ type: 'error', message: message || 'OpenCode CLI reported an error.' }],
    };
  }
  return { recognized: false, events: [] };
}

export function normalizeOpenCodeJsonl(input: string, limits?: JsonlParserLimits): ProviderEvent[] {
  return normalizeProviderJsonl(input, normalizeOpenCodeRecord, limits);
}

export const OPENCODE_CLI_DEFINITION: CliProviderDefinition = Object.freeze({
  adapterId: 'opencode-cli',
  connectionId: 'opencode-cli',
  executableName: 'opencode',
  versionArgs: Object.freeze(['--version']),
  authProbeArgs: Object.freeze(['auth', 'list']),
  modelListArgs: Object.freeze(['models']),
  buildInvocation: buildOpenCodeInvocation,
  normalizeRecord: normalizeOpenCodeRecord,
});

export const openCodeCliAdapter = createCliProviderAdapter(OPENCODE_CLI_DEFINITION);
