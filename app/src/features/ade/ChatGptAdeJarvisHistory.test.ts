import { describe, expect, it, vi } from 'vitest';
import type { JarvisRun } from '@/lib/jarvis/contracts/execution';
import {
  ChatGptAdeHistoryError,
  ChatGptAdeJarvisHistory,
  type ChatGptAdeHistoryRunRepository,
} from './ChatGptAdeJarvisHistory';
import type { ChatGptAdeLifecycleEvent } from './adeContracts';

const seed: Readonly<JarvisRun> = Object.freeze({
  id: 'ade-run-a',
  accountId: 'account-a',
  workspaceId: 'workspace-a',
  projectId: 'project-a',
  source: 'chatgpt_ade',
  status: 'queued',
  agentId: 'chatgpt-ade',
  identityVersion: 1,
  profileRevisionId: 'profile-revision-a',
  model: Object.freeze({
    connectionId: 'connection-a',
    providerId: 'openai',
    modelId: 'gpt-5.6-luna',
    connectionMode: 'external-cli',
    capabilities: Object.freeze({ tools: true }),
    capturedAt: 1_725_000_000_000,
  }),
  createdAt: 1_725_000_000_000,
  updatedAt: 1_725_000_000_000,
});

function lifecycle(
  type: ChatGptAdeLifecycleEvent['type'],
  overrides: Partial<ChatGptAdeLifecycleEvent> = {},
): ChatGptAdeLifecycleEvent {
  return {
    runId: seed.id,
    requestId: 'ade-request-a',
    type,
    at: '2024-08-30T06:40:00.000Z',
    receiptId: type === 'preparing-context' ? null : 'receipt-a',
    terminalSessionId: null,
    safeFailure: null,
    ...overrides,
  };
}

function repository(): ChatGptAdeHistoryRunRepository & {
  createIdempotent: ReturnType<typeof vi.fn>;
  compareAndAppendTransitionEvent: ReturnType<typeof vi.fn>;
} {
  let current = seed;
  return {
    createIdempotent: vi.fn(async () => current),
    compareAndAppendTransitionEvent: vi.fn(async (input) => {
      current = Object.freeze({
        ...current,
        status: input.nextStatus,
        updatedAt: input.updatedAt,
        ...(input.completedAt === undefined ? {} : { completedAt: input.completedAt }),
      });
      return {
        applied: true as const,
        run: current,
        event: {
          ...input.event,
          runId: seed.id,
          seq: 1,
          type: 'run_state' as const,
          status: input.nextStatus,
        },
      };
    }),
  };
}

describe('ChatGptAdeJarvisHistory', () => {
  it('persists the ADE lifecycle through existing Jarvis run transitions', async () => {
    const repo = repository();
    const history = new ChatGptAdeJarvisHistory(repo, seed);

    history.recordEvent(lifecycle('preparing-context'));
    history.recordEvent(lifecycle('dispatching'));
    history.recordEvent(lifecycle('completed'));
    await history.flush();

    expect(repo.createIdempotent).toHaveBeenCalledWith(seed);
    expect(
      repo.compareAndAppendTransitionEvent.mock.calls.map(([input]) => input.nextStatus),
    ).toEqual(['compiling', 'running', 'completed']);
    expect(repo.compareAndAppendTransitionEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        accountId: 'account-a',
        runId: 'ade-run-a',
        expectedStatus: 'running',
        nextStatus: 'completed',
        completedAt: 1_725_000_000_000,
      }),
    );
    const transitions = repo.compareAndAppendTransitionEvent.mock.calls.map(([input]) => input);
    expect(transitions[0]?.event.sourceRefs).toEqual([]);
    expect(transitions[1]?.event.sourceRefs).toEqual([
      {
        id: 'receipt-a',
        kind: 'context_node',
        label: 'VibeSpace Context receipt',
        accountId: 'account-a',
        projectId: 'project-a',
        trust: 'app_verified',
        origin: 'app_observed',
        sensitivity: 'private',
        observedAt: 1_725_000_000_000,
      },
    ]);
    expect(JSON.stringify(transitions)).not.toContain('terminal-session-secret');
  });

  it('rejects cross-run events before they enter the durable queue', () => {
    const history = new ChatGptAdeJarvisHistory(repository(), seed);
    expect(() => history.recordEvent(lifecycle('dispatching', { runId: 'ade-run-other' }))).toThrow(
      ChatGptAdeHistoryError,
    );
  });

  it('persists an initial validation or terminal-authorization block from queued', async () => {
    const repo = repository();
    const history = new ChatGptAdeJarvisHistory(repo, seed);
    history.recordEvent(
      lifecycle('blocked', {
        receiptId: null,
        safeFailure: 'terminal-link-unauthorized',
      }),
    );

    await history.flush();

    expect(repo.compareAndAppendTransitionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedStatus: 'queued',
        nextStatus: 'failed',
        completedAt: 1_725_000_000_000,
      }),
    );
  });

  it('detaches queued history from caller mutation and rejects unsafe receipt IDs', async () => {
    const repo = repository();
    const history = new ChatGptAdeJarvisHistory(repo, seed);
    history.recordEvent(lifecycle('preparing-context'));
    const event = lifecycle('dispatching');
    history.recordEvent(event);
    event.receiptId = 'changed-after-queue';
    await history.flush();

    expect(repo.compareAndAppendTransitionEvent.mock.calls[1]?.[0].event.sourceRefs[0]?.id).toBe(
      'receipt-a',
    );

    const unsafe = new ChatGptAdeJarvisHistory(repository(), seed);
    unsafe.recordEvent(lifecycle('preparing-context'));
    unsafe.recordEvent(lifecycle('dispatching', { receiptId: 'unsafe receipt' }));
    await expect(unsafe.flush()).rejects.toMatchObject({ code: 'event-scope-mismatch' });
  });

  it('surfaces a durable transition conflict without dispatching later history', async () => {
    const repo = repository();
    repo.compareAndAppendTransitionEvent.mockResolvedValueOnce({
      applied: false,
      current: { ...seed, status: 'running' },
    });
    const history = new ChatGptAdeJarvisHistory(repo, seed);
    history.recordEvent(lifecycle('preparing-context'));
    history.recordEvent(lifecycle('dispatching'));

    await expect(history.flush()).rejects.toMatchObject({ code: 'transition-conflict' });
    expect(repo.compareAndAppendTransitionEvent).toHaveBeenCalledTimes(1);
  });
});
