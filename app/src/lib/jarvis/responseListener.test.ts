import { afterEach, describe, expect, it, vi } from 'vitest';

import { startJarvisResponsePolicyListener } from './responseListener';

describe('retired Jarvis response policy listener', () => {
  let stop: (() => void) | undefined;

  afterEach(() => stop?.());

  it('leaves protected greetings for the canonical runtime without a direct-write binding', () => {
    const runtimeListener = vi.fn();
    stop = startJarvisResponsePolicyListener();
    window.addEventListener('jarvis:send', runtimeListener);

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId: 'chat-1', text: 'Hi', agentId: 'agent-jarvis' },
      }),
    );

    expect(runtimeListener).toHaveBeenCalledOnce();
    expect(startJarvisResponsePolicyListener.length).toBe(0);
    window.removeEventListener('jarvis:send', runtimeListener);
  });

  it('does not intercept action, attachment, or agent-directed turns', () => {
    const runtimeListener = vi.fn();
    stop = startJarvisResponsePolicyListener();
    window.addEventListener('jarvis:send', runtimeListener);

    for (const detail of [
      { chatId: 'chat-1', text: 'Open a terminal' },
      { chatId: 'chat-1', text: 'Hi', filePaths: ['notes.txt'] },
      { chatId: 'chat-1', text: 'Hi', mentionedAgentIds: ['agent-1'] },
    ]) {
      window.dispatchEvent(new CustomEvent('jarvis:send', { detail }));
    }

    expect(runtimeListener).toHaveBeenCalledTimes(3);
    window.removeEventListener('jarvis:send', runtimeListener);
  });
});
