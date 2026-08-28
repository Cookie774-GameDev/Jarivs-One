import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { bindExactSingleChildRunCancellationResume } from './registryJarvisCore';

const cleanup: Array<() => void> = [];

afterEach(() => {
  cleanup.splice(0).forEach((release) => release());
});

function observe(eventName: 'jarvis:cancel' | 'jarvis:resume') {
  const details: Array<{ chatId?: string; cancellationKey?: string }> = [];
  const listener = (event: Event) => {
    details.push(
      (event as CustomEvent<{ chatId?: string; cancellationKey?: string }>).detail ?? {},
    );
  };
  window.addEventListener(eventName, listener);
  cleanup.push(() => window.removeEventListener(eventName, listener));
  return details;
}

describe('agent.run parent cancellation and resume binding', () => {
  it('cancels the exact launched child once and resumes that same persistent child session', () => {
    const cancels = observe('jarvis:cancel');
    const resumes = observe('jarvis:resume');
    const parent = new AbortController();

    bindExactSingleChildRunCancellationResume(
      'parent-single-a',
      { agentId: 'agent-single-a', childChatId: 'child-single-a' },
      parent.signal,
    );

    parent.abort();
    parent.abort();
    expect(cancels).toEqual([{ chatId: 'child-single-a' }]);

    window.dispatchEvent(
      new CustomEvent('jarvis:resume', {
        detail: { chatId: 'parent-single-a', cancellationKey: 'parent-resume-key' },
      }),
    );

    const childResume = resumes.find((detail) => detail.chatId === 'child-single-a');
    expect(childResume?.cancellationKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(childResume?.cancellationKey).not.toBe('parent-resume-key');
  });

  it('fails closed immediately when the owning parent was already cancelled', () => {
    const cancels = observe('jarvis:cancel');
    const parent = new AbortController();
    parent.abort();

    bindExactSingleChildRunCancellationResume(
      'parent-single-aborted',
      { agentId: 'agent-single-aborted', childChatId: 'child-single-aborted' },
      parent.signal,
    );

    expect(cancels).toContainEqual({ chatId: 'child-single-aborted' });
  });

  it('binds the canonical agent.run launch to its exact action signal', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/lib/actions/registryJarvisCore.ts'),
      'utf8',
    );
    const agentRun = source.slice(
      source.indexOf("id: 'agent.run'"),
      source.indexOf("id: 'agent.run_many'"),
    );

    expect(agentRun).toContain('bindExactSingleChildRunCancellationResume(');
    expect(agentRun).toContain('ctx.signal');
    expect(agentRun).not.toContain("new CustomEvent('jarvis:send'");
  });
});
