import {
  createTaskApprovalCallId,
  presentJarvisApproval,
} from '@/features/jarvis-runs/approvalBridge';
import type { Message } from '@/types';
import type { ChatId } from '@/types/common';
import type {
  CreateJarvisApprovalInput,
  JarvisKernelActionPort,
} from '@/lib/jarvis/approvalEngine';
import { interpretJarvisRequest } from './intentInterpreter';

interface OperatorSendDetail {
  chatId?: string;
  text?: string;
  filePaths?: unknown[];
  imageAttachments?: unknown[];
  terminalRefs?: unknown[];
  contextNodes?: unknown[];
  mentionedAgentIds?: unknown[];
  agentId?: unknown;
  structuredContext?: unknown;
  interactionMode?: string;
  speakReply?: boolean;
}

interface OperatorListenerBindings {
  appendMessage: (
    message: Omit<Message, 'id' | 'created_at' | 'updated_at'>,
  ) => Promise<unknown> | unknown;
  onError?: (error: unknown) => void;
}

/** @internal Pure canonical proposal adapter; Task 16B owns listener wiring. */
export function createCanonicalOperatorApprovalAdapter(
  actions: Pick<JarvisKernelActionPort, 'create'>,
) {
  return Object.freeze({
    async propose(request: Readonly<CreateJarvisApprovalInput>) {
      const created = await actions.create(request);
      if (created.kind !== 'committed') return created;
      if (created.value.status !== 'pending') {
        return { kind: 'approval_state_mismatch' as const };
      }
      return Object.freeze({
        kind: 'committed' as const,
        value: Object.freeze({
          approvalId: created.value.id,
          status: created.value.status,
          callId: createTaskApprovalCallId(created.value.id),
          presentation: presentJarvisApproval(created.value),
        }),
      });
    },
  });
}

function contextual(detail: OperatorSendDetail): boolean {
  return Boolean(
    detail.agentId ||
    detail.structuredContext ||
    detail.speakReply ||
    detail.interactionMode === 'agent' ||
    detail.filePaths?.length ||
    detail.imageAttachments?.length ||
    detail.terminalRefs?.length ||
    detail.contextNodes?.length ||
    detail.mentionedAgentIds?.length,
  );
}

function report(bindings: OperatorListenerBindings, error: unknown): void {
  if (bindings.onError) bindings.onError(error);
  else console.error('[jarvis-operator] request failed', error);
}

function safeOperatorReply(intent: ReturnType<typeof interpretJarvisRequest>): string | undefined {
  if (intent.intent === 'memory-update') return undefined;
  if (intent.intent === 'plugin-use') {
    return 'Which connected plugin and declared tool should I run?';
  }
  if (intent.intent === 'mcp-use') {
    return 'Which registered MCP server and declared tool should I use?';
  }
  if (intent.steps.length > 0) {
    return 'This action requires the canonical approval service. No action was started; retry after the approval controls are connected.';
  }
  return intent.response;
}

/**
 * Fail-closed signature-compatible listener. It may answer deterministic
 * no-action intents but cannot call a handler or fabricate an approval.
 */
export function startJarvisOperatorListener(
  bindings: OperatorListenerBindings,
  eventName = 'jarvis:send',
): () => void {
  const onSend = (event: Event) => {
    const detail = (event as CustomEvent<OperatorSendDetail>).detail;
    if (!detail?.chatId || typeof detail.text !== 'string' || contextual(detail)) return;
    const interpreted = interpretJarvisRequest(detail.text);
    const handledWithoutExecution = new Set([
      'ambiguous',
      'destructive-action',
      'memory-update',
      'plugin-use',
      'mcp-use',
    ]).has(interpreted.intent);
    if (interpreted.steps.length === 0 && !handledWithoutExecution) return;

    event.stopImmediatePropagation();
    const text = safeOperatorReply(interpreted);
    if (!text) return;
    void Promise.resolve(
      bindings.appendMessage({
        chat_id: detail.chatId as ChatId,
        role: 'assistant',
        parts: [{ kind: 'text', text }],
      }),
    ).catch((error) => report(bindings, error));
  };

  window.addEventListener(eventName, onSend);
  return () => window.removeEventListener(eventName, onSend);
}
