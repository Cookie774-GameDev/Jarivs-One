import type { ProviderEvent, UsageSnapshot, UsageValue } from './types';

export type CodexApprovalKind = 'command' | 'file_change' | 'permissions';

export interface CodexApprovalControlRequest {
  type: 'approval';
  kind: CodexApprovalKind;
  requestId: string;
  threadId: string;
  turnId: string;
  itemId: string;
}

export type CodexControlRequest = CodexApprovalControlRequest;

export interface CodexAppServerProjection {
  recognized: boolean;
  events: ProviderEvent[];
  controls: CodexControlRequest[];
}

export interface CodexAppServerProjectionOptions {
  capturedAt?: number;
}

const MAX_PUBLIC_TEXT = 32_768;
const MAX_RESULT_TEXT = 8_192;
const MAX_IDENTIFIER = 256;
const ANSI_ESCAPE = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))/gu;
const UNSAFE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001a\u001c-\u001f\u007f]/u;
const UNSAFE_CONTROL_GLOBAL = /[\u0000-\u0008\u000b\u000c\u000e-\u001a\u001c-\u001f\u007f]/gu;

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function safeIdentifier(value: unknown): string | undefined {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '';
  if (!text || text.length > MAX_IDENTIFIER || UNSAFE_CONTROL.test(text)) return undefined;
  return text;
}

function safePublicText(value: unknown, maximum = MAX_PUBLIC_TEXT): string | undefined {
  if (typeof value !== 'string') return undefined;
  const sanitized = value
    .replace(ANSI_ESCAPE, '')
    .replace(UNSAFE_CONTROL_GLOBAL, '')
    .slice(0, maximum);
  return sanitized || undefined;
}

function leafFileLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const label = value.replaceAll('\\', '/').split('/').filter(Boolean).at(-1);
  if (
    !label ||
    label === '.' ||
    label === '..' ||
    label.length > 255 ||
    UNSAFE_CONTROL.test(label)
  ) {
    return undefined;
  }
  return label;
}

function projection(
  events: ProviderEvent[] = [],
  controls: CodexControlRequest[] = [],
  recognized = true,
): CodexAppServerProjection {
  return { recognized, events, controls };
}

function toolStatus(value: unknown): Extract<ProviderEvent, { type: 'tool' }>['status'] {
  if (value === 'completed' || value === 'success') return 'completed';
  if (value === 'failed' || value === 'declined' || value === 'error') return 'failed';
  return 'started';
}

function commandToolName(actions: unknown): 'read' | 'search' | 'command' | 'verify' {
  if (!Array.isArray(actions)) return 'command';
  for (const action of actions) {
    const type = recordOf(action)?.type;
    if (type === 'read') return 'read';
    if (type === 'search') return 'search';
    if (type === 'verify') return 'verify';
  }
  return 'command';
}

function firstActionFileLabel(actions: unknown): string | undefined {
  if (!Array.isArray(actions)) return undefined;
  for (const action of actions) {
    const record = recordOf(action);
    const label = leafFileLabel(record?.path ?? record?.file ?? record?.name);
    if (label) return label;
  }
  return undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function providerReported(value: unknown): UsageValue<number> | undefined {
  const number = finiteNumber(value);
  return number === undefined ? undefined : { value: number, provenance: 'provider-reported' };
}

function normalizeItem(item: Record<string, unknown>, method: string): ProviderEvent[] {
  const type = item.type;
  const callId = safeIdentifier(item.id);

  if (type === 'commandExecution') {
    const result: Record<string, unknown> = {};
    const output = safePublicText(item.aggregatedOutput, MAX_RESULT_TEXT);
    const exitCode = finiteNumber(item.exitCode);
    const durationMs = finiteNumber(item.durationMs);
    if (output) result.output = output;
    if (exitCode !== undefined) result.exitCode = exitCode;
    if (durationMs !== undefined) result.durationMs = durationMs;
    const hasResult = Object.keys(result).length > 0;
    return [
      {
        type: 'tool',
        name: commandToolName(item.commandActions),
        status: toolStatus(item.status ?? (method === 'item/completed' ? 'completed' : 'started')),
        ...(callId ? { callId } : {}),
        ...(firstActionFileLabel(item.commandActions)
          ? { fileLabel: firstActionFileLabel(item.commandActions) }
          : {}),
        ...(hasResult ? { result } : {}),
      },
    ];
  }

  if (type === 'fileChange') {
    const changes = Array.isArray(item.changes) ? item.changes : [];
    const firstChange = recordOf(changes[0]);
    return [
      {
        type: 'tool',
        name: 'edit',
        status: toolStatus(item.status ?? (method === 'item/completed' ? 'completed' : 'started')),
        ...(callId ? { callId } : {}),
        ...(leafFileLabel(firstChange?.path)
          ? { fileLabel: leafFileLabel(firstChange?.path) }
          : {}),
        result: {
          changeCount: changes.length,
          diffAvailable: changes.some((change) => Boolean(recordOf(change)?.diff)),
        },
      },
    ];
  }

  if (type === 'mcpToolCall' || type === 'dynamicToolCall') {
    const server = safeIdentifier(item.server ?? item.namespace);
    const tool = safeIdentifier(item.tool);
    if (!tool) return [];
    const name = server ? `${server}.${tool}`.slice(0, MAX_IDENTIFIER) : tool;
    return [
      {
        type: 'tool',
        name,
        status: toolStatus(item.status ?? (method === 'item/completed' ? 'completed' : 'started')),
        ...(callId ? { callId } : {}),
      },
    ];
  }

  return [];
}

function normalizeQuestion(message: Record<string, unknown>, params: Record<string, unknown>) {
  const requestId = safeIdentifier(message.id);
  const sessionId = safeIdentifier(params.threadId);
  const turnId = safeIdentifier(params.turnId);
  const itemId = safeIdentifier(params.itemId);
  const rawQuestions = Array.isArray(params.questions) ? params.questions : [];
  if (!requestId || !sessionId || !turnId || !itemId || rawQuestions.length === 0) {
    return projection([{ type: 'error', message: 'Codex returned a malformed question request.' }]);
  }
  if (rawQuestions.some((question) => recordOf(question)?.isSecret === true)) {
    return projection([
      {
        type: 'warning',
        message: 'Codex requested secret input. Use the secure credential setup action.',
      },
    ]);
  }

  const questions = rawQuestions.slice(0, 3).flatMap((question) => {
    const record = recordOf(question);
    const header = safePublicText(record?.header, 120);
    const prompt = safePublicText(record?.question, 1_024);
    if (!header || !prompt) return [];
    const options = Array.isArray(record?.options)
      ? record.options.slice(0, 20).flatMap((option) => {
          const optionRecord = recordOf(option);
          const label = safePublicText(optionRecord?.label, 120);
          const description = safePublicText(optionRecord?.description, 512);
          return label && description ? [{ label, description }] : [];
        })
      : [];
    return [
      {
        header,
        prompt,
        options,
        multiple: false,
        allowCustomAnswer: record?.isOther === true,
      },
    ];
  });
  if (questions.length === 0) {
    return projection([{ type: 'error', message: 'Codex returned a malformed question request.' }]);
  }

  return projection([
    {
      type: 'question',
      request: {
        id: requestId,
        sessionId,
        questions,
        tool: { messageId: turnId, callId: itemId },
      },
    },
  ]);
}

function approvalKind(method: string): CodexApprovalKind | undefined {
  if (method === 'item/commandExecution/requestApproval' || method === 'execCommandApproval') {
    return 'command';
  }
  if (method === 'item/fileChange/requestApproval' || method === 'applyPatchApproval') {
    return 'file_change';
  }
  if (method === 'item/permissions/requestApproval') return 'permissions';
  return undefined;
}

function normalizeApproval(
  message: Record<string, unknown>,
  params: Record<string, unknown>,
  kind: CodexApprovalKind,
) {
  const requestId = safeIdentifier(message.id);
  const threadId = safeIdentifier(params.threadId ?? params.conversationId);
  const turnId = safeIdentifier(params.turnId);
  const itemId = safeIdentifier(params.itemId ?? params.callId ?? params.approvalId);
  if (!requestId || !threadId || !turnId || !itemId) {
    return projection([{ type: 'error', message: 'Codex returned a malformed approval request.' }]);
  }
  return projection([], [{ type: 'approval', kind, requestId, threadId, turnId, itemId }]);
}

export function normalizeCodexAppServerMessage(
  value: unknown,
  options: CodexAppServerProjectionOptions = {},
): CodexAppServerProjection {
  const message = recordOf(value);
  const method = safeIdentifier(message?.method);
  const params = recordOf(message?.params) ?? {};
  if (!message || !method) return projection([], [], false);

  if (method === 'thread/started') {
    const sessionId = safeIdentifier(recordOf(params.thread)?.id);
    return projection(sessionId ? [{ type: 'session', sessionId }] : []);
  }
  if (method === 'item/agentMessage/delta') {
    const delta = safePublicText(params.delta);
    const streamPartId = safeIdentifier(params.itemId);
    return projection(
      delta ? [{ type: 'text', delta, ...(streamPartId ? { streamPartId } : {}) }] : [],
    );
  }
  if (method === 'item/reasoning/summaryTextDelta') {
    const delta = safePublicText(params.delta);
    return projection(delta ? [{ type: 'reasoning', delta }] : []);
  }
  if (method === 'item/reasoning/textDelta') return projection();
  if (method === 'item/started' || method === 'item/completed') {
    const item = recordOf(params.item);
    return projection(item ? normalizeItem(item, method) : []);
  }
  if (method === 'item/tool/requestUserInput') return normalizeQuestion(message, params);

  const kind = approvalKind(method);
  if (kind) return normalizeApproval(message, params, kind);

  if (method === 'thread/tokenUsage/updated') {
    const last = recordOf(recordOf(params.tokenUsage)?.last);
    if (!last) return projection();
    const usage: UsageSnapshot = {
      capturedAt: finiteNumber(options.capturedAt) ?? Date.now(),
      ...(providerReported(last.inputTokens)
        ? { inputTokens: providerReported(last.inputTokens) }
        : {}),
      ...(providerReported(last.cachedInputTokens)
        ? { cacheReadTokens: providerReported(last.cachedInputTokens) }
        : {}),
      ...(providerReported(last.cacheWriteInputTokens)
        ? { cacheWriteTokens: providerReported(last.cacheWriteInputTokens) }
        : {}),
      ...(providerReported(last.outputTokens)
        ? { outputTokens: providerReported(last.outputTokens) }
        : {}),
      ...(providerReported(last.reasoningOutputTokens)
        ? { reasoningTokens: providerReported(last.reasoningOutputTokens) }
        : {}),
      ...(providerReported(last.totalTokens)
        ? { totalTokens: providerReported(last.totalTokens) }
        : {}),
    };
    return projection([{ type: 'usage', usage }]);
  }

  if (method === 'turn/completed') {
    const turn = recordOf(params.turn);
    const status = turn?.status;
    if (status === 'completed') return projection([{ type: 'done', finishReason: 'completed' }]);
    if (status === 'interrupted')
      return projection([{ type: 'done', finishReason: 'interrupted' }]);
    if (status === 'failed') {
      const message = safePublicText(recordOf(turn?.error)?.message, 2_048);
      return projection([{ type: 'error', message: message ?? 'Codex turn failed.' }]);
    }
    return projection([{ type: 'error', message: 'Codex returned an invalid terminal state.' }]);
  }

  if (method === 'error') {
    const message = safePublicText(params.message, 2_048);
    return projection([
      { type: 'error', message: message ?? 'Codex app-server reported an error.' },
    ]);
  }

  return projection([], [], false);
}
