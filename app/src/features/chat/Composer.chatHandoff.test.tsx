import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Chat, Message } from '@/types/chat';
import {
  buildComposerChatHandoffPayload,
  buildQueuedComposerChatHandoff,
  deliverComposerChatHandoff,
  dispatchComposerSendWithAcceptance,
  resolveComposerChatHandoffDraft,
  resolveComposerPersistedText,
} from './Composer';
import type { ChatHandoffProjectionV1 } from './chatHandoffProjection';

const sourceChat: Chat = {
  id: 'chat-source' as Chat['id'],
  workspace_id: 'workspace-1' as Chat['workspace_id'],
  project_id: 'project-1' as NonNullable<Chat['project_id']>,
  title: 'Canonical source title',
  mode: 'chat',
  active_agent_ids: [],
  created_at: 1,
  updated_at: 2,
};
const targetChat: Chat = {
  ...sourceChat,
  id: 'chat-target' as Chat['id'],
  title: 'Target',
};
const message = (text: string, updatedAt = 99): Message => ({
  id: `message-${updatedAt}` as Message['id'],
  chat_id: sourceChat.id,
  role: 'assistant',
  parts: [{ kind: 'text', text }],
  created_at: updatedAt,
  updated_at: updatedAt,
});
const projection: ChatHandoffProjectionV1 = {
  version: 1,
  policyVersion: 1,
  source: {
    chatId: 'chat-source',
    title: 'Source chat',
    workspaceId: 'workspace-1',
    projectId: 'project-1',
  },
  snapshotAt: 100,
  boundaryAt: 10,
  boundaryMessageId: 'message-1',
  goal: 'Finish Task 2',
  status: 'Last visible assistant activity',
  lastMeaningfulActivity: 'Projection is green.',
  recentSections: [
    {
      messageId: 'message-1',
      role: 'assistant',
      createdAt: 99,
      visibleText: 'Projection is green.',
      chunks: ['Projection is green.'],
    },
  ],
  olderDigest: 'No older visible history.',
  summaries: { files: [], tools: [], actions: [], decisions: [], blockers: [], results: [] },
};

afterEach(() => vi.useRealTimers());

describe('Composer chat handoff integration', () => {
  it('re-resolves canonical source/messages, rejects self/stale drops, replaces without sending', async () => {
    const dispatch = vi.fn();
    const listMessages = vi
      .fn()
      .mockResolvedValueOnce([message('First canonical snapshot')])
      .mockResolvedValueOnce([message('Replacement canonical snapshot', 100)]);
    const getChat = vi.fn(async (id: string) =>
      id === 'chat-source' ? sourceChat : id === 'chat-target' ? targetChat : undefined,
    );
    const deps = { getChat, listMessages, canAccess: () => true };
    const payload = {
      version: 1 as const,
      chatId: 'chat-source',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      title: 'Stale display title',
    };

    const first = await resolveComposerChatHandoffDraft(
      { payload, targetChatId: 'chat-target', now: 101 },
      deps,
    );
    const replacement = await resolveComposerChatHandoffDraft(
      { payload, targetChatId: 'chat-target', now: 102 },
      deps,
    );
    const self = await resolveComposerChatHandoffDraft(
      { payload, targetChatId: 'chat-source', now: 103 },
      deps,
    );
    const stale = await resolveComposerChatHandoffDraft(
      { payload: { ...payload, workspaceId: 'stale-workspace' }, targetChatId: 'chat-target' },
      deps,
    );

    expect(first).toMatchObject({ ok: true, projection: { source: { title: sourceChat.title } } });
    expect(replacement).toMatchObject({
      ok: true,
      projection: { lastMeaningfulActivity: 'Replacement canonical snapshot' },
    });
    expect(self).toEqual({ ok: false, reason: 'same_chat' });
    expect(stale).toEqual({ ok: false, reason: 'chat_unavailable' });
    expect(dispatch).not.toHaveBeenCalled();
    expect(listMessages).toHaveBeenCalledTimes(2);
  });

  it('captures an immutable queued handoff snapshot before later draft replacement', () => {
    const queued = buildQueuedComposerChatHandoff({
      projection,
      instruction: 'Use the accepted snapshot.',
      draftText: 'Continue A.',
    });
    const later = buildComposerChatHandoffPayload({
      projection: { ...projection, source: { ...projection.source, title: 'Replacement' } },
      instruction: 'Use replacement.',
      draftText: 'Continue B.',
    });

    expect(queued.text).toContain('Continue A.');
    expect(queued.text).not.toContain('Continue B.');
    expect(queued.payload.part.handoff.sourceTitle).toBe('Source chat');
    expect(later.part.handoff.sourceTitle).toBe('Replacement');
  });

  it('redacts credentials typed into the editable instruction before persistence', () => {
    const stripeFixture = ['sk', 'live', '1234567890abcdefghijklmnop'].join('_');
    const githubFixture = `ghp_${'1234567890abcdefghijklmnopqrstuv'}`;
    const payload = buildComposerChatHandoffPayload({
      projection,
      instruction: `Use ${stripeFixture}.`,
      draftText: `Then inspect ${githubFixture}.`,
    });

    expect(JSON.stringify(payload)).not.toMatch(/sk_live_|ghp_123/);
    expect(payload.part.handoff.instruction).toContain('[REDACTED]');
  });

  it('persists once, preserves a dispatch receipt on failure, and clears only after retry acceptance', async () => {
    const failedPersistDispatch = vi.fn<() => Promise<void>>();
    const failedPersist = await deliverComposerChatHandoff({
      key: 'handoff-persist-failure',
      persist: vi.fn(async () => {
        throw new Error('database unavailable');
      }),
      dispatch: failedPersistDispatch,
    });
    const persist = vi.fn(async () => ({ id: 'message-1' }));
    const dispatch = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('runtime unavailable'))
      .mockResolvedValueOnce(undefined);
    const first = await deliverComposerChatHandoff({ key: 'handoff-1', persist, dispatch });
    const retry = await deliverComposerChatHandoff({
      key: 'handoff-1',
      previousReceipt: first.receipt,
      persist,
      dispatch,
    });

    expect(failedPersist).toMatchObject({ ok: false, receipt: null });
    expect(failedPersistDispatch).not.toHaveBeenCalled();
    expect(first.ok).toBe(false);
    expect(first.receipt?.value).toEqual({ id: 'message-1' });
    expect(retry.ok).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('preserves canonical handoff prompt text instead of temporary oversized summaries', () => {
    const canonical = `handoff ${'x'.repeat(30_000)}`;
    expect(
      resolveComposerPersistedText({
        sendText: canonical,
        handoff: true,
        oversizedSummary: 'Temporary attachment summary',
      }),
    ).toBe(canonical);
  });

  it('acknowledges success, rejects early runtime errors, and times out a missing listener', async () => {
    vi.useFakeTimers();
    const accepted = dispatchComposerSendWithAcceptance(
      { chatId: 'chat-target', cancellationKey: 'message-1', text: 'safe' },
      { timeoutMs: 100 },
    );
    window.dispatchEvent(
      new CustomEvent('jarvis:run-state', {
        detail: { chatId: 'chat-target', status: 'running' },
      }),
    );
    await expect(accepted).resolves.toBeUndefined();

    const rejected = dispatchComposerSendWithAcceptance(
      { chatId: 'chat-target', cancellationKey: 'message-2', text: 'safe' },
      { timeoutMs: 100 },
    );
    window.dispatchEvent(
      new CustomEvent('jarvis:run-state', {
        detail: { chatId: 'chat-target', status: 'error' },
      }),
    );
    await expect(rejected).rejects.toThrow('rejected before acceptance');

    const missing = dispatchComposerSendWithAcceptance(
      { chatId: 'chat-target', cancellationKey: 'message-3', text: 'safe' },
      { timeoutMs: 100 },
    );
    const missingExpectation = expect(missing).rejects.toThrow('did not acknowledge');
    await vi.advanceTimersByTimeAsync(100);
    await missingExpectation;
  });
});
