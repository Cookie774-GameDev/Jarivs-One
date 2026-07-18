import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Agent } from '@/types';

import { startJarvisResponsePolicyListener } from './responseListener';

describe('Jarvis response policy listener', () => {
  let stop: (() => void) | undefined;

  afterEach(() => stop?.());

  const protectedJarvis = {
    id: 'agent-jarvis',
    slug: 'jarvis',
    builtin: true,
  } as Agent;

  it('answers casual turns locally and prevents a slower provider duplicate', async () => {
    const appendMessage = vi.fn().mockResolvedValue(undefined);
    const providerListener = vi.fn();
    stop = startJarvisResponsePolicyListener({
      appendMessage,
      emojisEnabled: () => false,
      resolveAgent: () => protectedJarvis,
    });
    window.addEventListener('jarvis:send', providerListener);

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId: 'chat-1', text: 'Hi' },
      }),
    );
    await vi.waitFor(() => expect(appendMessage).toHaveBeenCalledTimes(1));

    expect(appendMessage.mock.calls[0]?.[0]).toMatchObject({
      chat_id: 'chat-1',
      role: 'assistant',
      parts: [{ kind: 'text', text: 'Hey! What are we building today?' }],
    });
    expect(providerListener).not.toHaveBeenCalled();
    window.removeEventListener('jarvis:send', providerListener);
  });

  it('leaves action, attachment, and agent-directed turns for the full runtime', () => {
    const appendMessage = vi.fn();
    stop = startJarvisResponsePolicyListener({
      appendMessage,
      resolveAgent: () => protectedJarvis,
    });

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId: 'chat-1', text: 'Open a terminal' },
      }),
    );
    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId: 'chat-1', text: 'Hi', filePaths: ['notes.txt'] },
      }),
    );
    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId: 'chat-1', text: 'Hi', mentionedAgentIds: ['agent-1'] },
      }),
    );

    expect(appendMessage).not.toHaveBeenCalled();
  });

  it.each([
    ['unresolved', null],
    ['user collision', { ...protectedJarvis, id: 'user-collision', builtin: false }],
    ['non-JARVIS', { ...protectedJarvis, id: 'other', slug: 'builder', builtin: true }],
  ] as const)('does not intercept a greeting for %s agent resolution', async (_label, resolved) => {
    const appendMessage = vi.fn();
    const providerListener = vi.fn();
    stop = startJarvisResponsePolicyListener({
      appendMessage,
      resolveAgent: async () => resolved as Agent | null,
    });
    window.addEventListener('jarvis:send', providerListener);

    window.dispatchEvent(
      new CustomEvent('jarvis:send', { detail: { chatId: 'chat-1', text: 'Hi' } }),
    );
    await vi.waitFor(() => expect(providerListener).toHaveBeenCalledOnce());
    expect(appendMessage).not.toHaveBeenCalled();
    window.removeEventListener('jarvis:send', providerListener);
  });
});
