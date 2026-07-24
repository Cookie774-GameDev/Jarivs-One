import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acknowledgeJarvisApprovalNavigation,
  isCurrentJarvisApprovalNavigationTarget,
  readPendingJarvisApprovalNavigation,
  requestJarvisApprovalNavigation,
  resetJarvisApprovalNavigationForTests,
  subscribeJarvisApprovalNavigation,
} from './approvalNavigation';
import type { JarvisCommandCenterDataPort, JarvisRun } from './types';

const intent = {
  accountId: 'account-1',
  chatId: 'chat-1',
  runId: 'run-1',
  approvalId: 'approval-1',
};

describe('approval navigation intent', () => {
  beforeEach(resetJarvisApprovalNavigationForTests);

  it('persists one immutable exact target until that target acknowledges it', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeJarvisApprovalNavigation(listener);

    expect(requestJarvisApprovalNavigation(intent)).toBe(true);
    const pending = readPendingJarvisApprovalNavigation();
    expect(pending).toEqual(intent);
    expect(Object.isFrozen(pending)).toBe(true);
    expect(listener).toHaveBeenCalledOnce();

    expect(
      acknowledgeJarvisApprovalNavigation({
        ...intent,
        approvalId: 'approval-other',
      }),
    ).toBe(false);
    expect(readPendingJarvisApprovalNavigation()).toEqual(intent);
    expect(acknowledgeJarvisApprovalNavigation(intent)).toBe(true);
    expect(readPendingJarvisApprovalNavigation()).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    requestJarvisApprovalNavigation({ ...intent, runId: 'run-2' });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('rejects empty or non-string scope without replacing the current target', () => {
    expect(requestJarvisApprovalNavigation(intent)).toBe(true);
    for (const malformed of [
      { ...intent, accountId: '   ' },
      { ...intent, accountId: ` ${intent.accountId}` },
      { ...intent, chatId: `${intent.chatId} ` },
      { ...intent, runId: ` ${intent.runId} ` },
      { ...intent, approvalId: `${intent.approvalId} ` },
      { ...intent, approvalId: 'a'.repeat(257) },
    ]) {
      expect(requestJarvisApprovalNavigation(malformed)).toBe(false);
    }
    expect(
      requestJarvisApprovalNavigation({
        ...intent,
        approvalId: 42 as unknown as string,
      }),
    ).toBe(false);
    expect(readPendingJarvisApprovalNavigation()).toEqual(intent);
  });

  it('does not replace an unacknowledged target with a different valid target', () => {
    const listener = vi.fn();
    subscribeJarvisApprovalNavigation(listener);

    expect(requestJarvisApprovalNavigation(intent)).toBe(true);
    expect(
      requestJarvisApprovalNavigation({
        ...intent,
        runId: 'run-2',
        approvalId: 'approval-2',
      }),
    ).toBe(false);
    expect(readPendingJarvisApprovalNavigation()).toEqual(intent);
    expect(requestJarvisApprovalNavigation({ ...intent })).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('delivers the requested target to every subscriber before an acknowledgement clears it', () => {
    const delivered = vi.fn();
    subscribeJarvisApprovalNavigation((requested?) => {
      if (requested) acknowledgeJarvisApprovalNavigation(requested);
    });
    subscribeJarvisApprovalNavigation((requested?) => {
      if (requested) delivered(requested);
    });

    expect(requestJarvisApprovalNavigation(intent)).toBe(true);
    expect(delivered).toHaveBeenCalledWith(intent);
    expect(readPendingJarvisApprovalNavigation()).toBeUndefined();
  });

  it('rejects an approval when a newer run becomes current during event validation', async () => {
    const run = (id: string): JarvisRun =>
      ({
        id,
        accountId: intent.accountId,
        chatId: intent.chatId,
        source: 'typed_chat',
        status: 'awaiting_approval',
        agentId: 'jarvis',
        identityVersion: 1,
        profileRevisionId: 'profile-1',
        model: {
          providerId: 'ollama',
          modelId: 'local-model',
          connectionMode: 'native-api',
          capabilities: {},
          capturedAt: 1,
        },
        createdAt: 1,
        updatedAt: id === intent.runId ? 2 : 3,
      }) as JarvisRun;
    const dataPort = {
      getRunsForChat: vi
        .fn()
        .mockResolvedValueOnce([run(intent.runId)])
        .mockResolvedValueOnce([run('run-newer')]),
      getEventsForRun: vi.fn().mockResolvedValue([
        {
          runId: intent.runId,
          seq: 1,
          idempotencyKey: intent.approvalId,
          type: 'approval',
          status: 'pending',
          title: 'Approval pending',
          sourceRefs: [],
          artifactIds: [],
          createdAt: 2,
        },
      ]),
    } as unknown as JarvisCommandCenterDataPort;

    await expect(isCurrentJarvisApprovalNavigationTarget(dataPort, intent)).resolves.toBe(false);
    expect(dataPort.getRunsForChat).toHaveBeenCalledTimes(2);
  });
});
