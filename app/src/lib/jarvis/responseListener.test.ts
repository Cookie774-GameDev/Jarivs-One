import { afterEach, describe, expect, it, vi } from 'vitest';

import { startJarvisResponsePolicyListener } from './responseListener';

describe('Jarvis response policy listener', () => {
  let stop: (() => void) | undefined;

  afterEach(() => stop?.());

  it('answers casual turns locally and prevents a slower provider duplicate', async () => {
    const appendMessage = vi.fn().mockResolvedValue(undefined);
    const providerListener = vi.fn();
    stop = startJarvisResponsePolicyListener({ appendMessage, emojisEnabled: () => false });
    window.addEventListener('jarvis:send', providerListener);

    window.dispatchEvent(new CustomEvent('jarvis:send', {
      detail: { chatId: 'chat-1', text: 'Hi' },
    }));
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
    stop = startJarvisResponsePolicyListener({ appendMessage });

    window.dispatchEvent(new CustomEvent('jarvis:send', {
      detail: { chatId: 'chat-1', text: 'Open a terminal' },
    }));
    window.dispatchEvent(new CustomEvent('jarvis:send', {
      detail: { chatId: 'chat-1', text: 'Hi', filePaths: ['notes.txt'] },
    }));
    window.dispatchEvent(new CustomEvent('jarvis:send', {
      detail: { chatId: 'chat-1', text: 'Hi', mentionedAgentIds: ['agent-1'] },
    }));

    expect(appendMessage).not.toHaveBeenCalled();
  });
});
