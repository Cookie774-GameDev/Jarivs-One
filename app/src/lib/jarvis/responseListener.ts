import type { Message } from '@/types';
import type { ChatId } from '@/types/common';

import { localConversationReply } from './responsePolicy';

interface LocalSendDetail {
  chatId?: string;
  text?: string;
  filePaths?: string[];
  imageAttachments?: unknown[];
  terminalSessionIds?: string[];
  terminalRefs?: unknown[];
  contextNodes?: unknown[];
  mentionedAgentIds?: unknown[];
  agentId?: unknown;
  pluginIds?: string[];
  skillIds?: string[];
  structuredContext?: unknown;
  interactionMode?: string;
  speakReply?: boolean;
}

interface ResponsePolicyListenerBindings {
  appendMessage: (
    message: Omit<Message, 'id' | 'created_at' | 'updated_at'>,
  ) => Promise<unknown> | unknown;
  emojisEnabled?: () => boolean;
  onError?: (error: unknown) => void;
}

function hasContext(detail: LocalSendDetail): boolean {
  return Boolean(
    detail.agentId
    || detail.structuredContext
    || detail.speakReply
    || detail.interactionMode === 'agent'
    || detail.filePaths?.length
    || detail.imageAttachments?.length
    || detail.terminalSessionIds?.length
    || detail.terminalRefs?.length
    || detail.contextNodes?.length
    || detail.mentionedAgentIds?.length
    || detail.pluginIds?.length
    || detail.skillIds?.length,
  );
}

/**
 * Handles a deliberately tiny set of context-free conversation turns without
 * paying provider latency or allowing a demo provider to replace a greeting
 * with setup instructions. All substantive turns continue to the full runtime.
 */
export function startJarvisResponsePolicyListener(
  bindings: ResponsePolicyListenerBindings,
  eventName = 'jarvis:send',
): () => void {
  const onSend = (event: Event) => {
    const detail = (event as CustomEvent<LocalSendDetail>).detail;
    if (!detail?.chatId || typeof detail.text !== 'string' || hasContext(detail)) return;
    const reply = localConversationReply(detail.text, {
      emojisEnabled: bindings.emojisEnabled?.() ?? true,
    });
    if (!reply) return;

    // This listener is registered before the provider runtime at boot. Stop
    // propagation synchronously so the same user turn cannot produce two replies.
    event.stopImmediatePropagation();
    void Promise.resolve(bindings.appendMessage({
      chat_id: detail.chatId as ChatId,
      role: 'assistant',
      parts: [{ kind: 'text', text: reply }],
    })).catch((error) => {
      if (bindings.onError) bindings.onError(error);
      else console.error('[jarvis] local response failed', error);
    });
  };

  window.addEventListener(eventName, onSend);
  return () => window.removeEventListener(eventName, onSend);
}
