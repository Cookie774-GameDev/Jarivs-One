import type { Agent, Message } from '@/types';
import type { ChatId } from '@/types/common';

import { localConversationReply } from './responsePolicy';
import { isProtectedJarvisAgent } from './identity';

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
  resolveAgent?: (detail: LocalSendDetail) => Agent | null | Promise<Agent | null>;
  onError?: (error: unknown) => void;
}

function hasContext(detail: LocalSendDetail): boolean {
  return Boolean(
    detail.agentId ||
    detail.structuredContext ||
    detail.speakReply ||
    detail.interactionMode === 'agent' ||
    detail.filePaths?.length ||
    detail.imageAttachments?.length ||
    detail.terminalSessionIds?.length ||
    detail.terminalRefs?.length ||
    detail.contextNodes?.length ||
    detail.mentionedAgentIds?.length ||
    detail.pluginIds?.length ||
    detail.skillIds?.length,
  );
}

function isAgentPromise(
  value: Agent | null | Promise<Agent | null>,
): value is Promise<Agent | null> {
  return Boolean(value) && typeof (value as Promise<Agent | null>).then === 'function';
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
  const passthroughEvents = new WeakSet<Event>();
  let stopped = false;
  const passThrough = (detail: LocalSendDetail) => {
    const passthrough = new CustomEvent<LocalSendDetail>(eventName, { detail });
    passthroughEvents.add(passthrough);
    window.dispatchEvent(passthrough);
  };
  const onSend = (event: Event) => {
    if (passthroughEvents.has(event)) return;
    const detail = (event as CustomEvent<LocalSendDetail>).detail;
    if (!detail?.chatId || typeof detail.text !== 'string' || hasContext(detail)) return;
    const reply = localConversationReply(detail.text, {
      emojisEnabled: bindings.emojisEnabled?.() ?? true,
    });
    if (!reply) return;

    let resolved: Agent | null | Promise<Agent | null>;
    try {
      if (!bindings.resolveAgent) return;
      resolved = bindings.resolveAgent(detail);
    } catch {
      return;
    }

    if (!isAgentPromise(resolved)) {
      if (!resolved || !isProtectedJarvisAgent(resolved)) return;
      event.stopImmediatePropagation();
      void Promise.resolve(
        bindings.appendMessage({
          chat_id: detail.chatId as ChatId,
          role: 'assistant',
          parts: [{ kind: 'text', text: reply }],
        }),
      ).catch((error) => {
        if (bindings.onError) bindings.onError(error);
        else console.error('[jarvis] local response failed', error);
      });
      return;
    }

    event.stopImmediatePropagation();
    void resolved
      .then((agent) => {
        if (stopped) return;
        if (!agent || !isProtectedJarvisAgent(agent)) {
          passThrough(detail);
          return;
        }
        return bindings.appendMessage({
          chat_id: detail.chatId as ChatId,
          role: 'assistant',
          parts: [{ kind: 'text', text: reply }],
        });
      })
      .catch(() => passThrough(detail));
  };

  window.addEventListener(eventName, onSend);
  return () => {
    stopped = true;
    window.removeEventListener(eventName, onSend);
  };
}
