import { describe, expect, it } from 'vitest';

import {
  ChatBackendAffinityCorruptError,
  ChatBackendLockedError,
  lockChatBackendOnFirstMessage,
  resolveChatBackendAffinity,
  selectChatBackend,
} from './chatBackend';

describe('chat backend affinity', () => {
  it('migrates a new legacy chat to unlocked OpenCode using its stable creation time', () => {
    expect(
      resolveChatBackendAffinity(undefined, {
        hasCommittedUserMessage: false,
        chatCreatedAt: 100,
      }),
    ).toEqual({ version: 1, backend: 'opencode', locked: false, selectedAt: 100 });
  });

  it('migrates an existing legacy chat to locked OpenCode deterministically', () => {
    expect(
      resolveChatBackendAffinity(undefined, {
        hasCommittedUserMessage: true,
        chatCreatedAt: 100,
      }),
    ).toEqual({
      version: 1,
      backend: 'opencode',
      locked: true,
      selectedAt: 100,
      lockedAt: 100,
    });
  });

  it('preserves authoritative Codex metadata', () => {
    expect(
      resolveChatBackendAffinity(
        { version: 1, backend: 'codex', locked: true, selectedAt: 110, lockedAt: 120 },
        { hasCommittedUserMessage: true, chatCreatedAt: 100 },
      ),
    ).toEqual({ version: 1, backend: 'codex', locked: true, selectedAt: 110, lockedAt: 120 });
  });

  it('quarantines malformed or unsupported persisted metadata instead of changing backend', () => {
    expect(() =>
      resolveChatBackendAffinity(
        { version: 2, backend: 'codex', locked: false, selectedAt: 999 },
        { hasCommittedUserMessage: true, chatCreatedAt: 100 },
      ),
    ).toThrowError(ChatBackendAffinityCorruptError);
  });

  it('allows either backend before the first committed message', () => {
    const initial = resolveChatBackendAffinity(undefined, {
      hasCommittedUserMessage: false,
      chatCreatedAt: 100,
    });

    expect(selectChatBackend(initial, 'codex', 150)).toEqual({
      version: 1,
      backend: 'codex',
      locked: false,
      selectedAt: 150,
    });
  });

  it('locks the selected backend exactly once when the first message commits', () => {
    const selected = {
      version: 1 as const,
      backend: 'codex' as const,
      locked: false,
      selectedAt: 150,
    };
    const locked = lockChatBackendOnFirstMessage(selected, 200);

    expect(locked).toEqual({ ...selected, locked: true, lockedAt: 200 });
    expect(lockChatBackendOnFirstMessage(locked, 300)).toBe(locked);
  });

  it('keeps the lock timestamp monotonic when the commit clock is earlier than selection', () => {
    const selected = {
      version: 1 as const,
      backend: 'codex' as const,
      locked: false,
      selectedAt: 150,
    };

    const locked = lockChatBackendOnFirstMessage(selected, 125);

    expect(locked).toEqual({ ...selected, locked: true, lockedAt: 150 });
    expect(
      resolveChatBackendAffinity(locked, {
        hasCommittedUserMessage: true,
        chatCreatedAt: 100,
      }),
    ).toEqual(locked);
  });

  it('makes selecting the same locked backend idempotent', () => {
    const locked = {
      version: 1 as const,
      backend: 'codex' as const,
      locked: true,
      selectedAt: 150,
      lockedAt: 200,
    };

    expect(selectChatBackend(locked, 'codex', 300)).toBe(locked);
  });

  it('rejects any attempt to switch a locked backend', () => {
    const locked = {
      version: 1 as const,
      backend: 'codex' as const,
      locked: true,
      selectedAt: 150,
      lockedAt: 200,
    };

    expect(() => selectChatBackend(locked, 'opencode', 300)).toThrowError(
      new ChatBackendLockedError('codex', 'opencode'),
    );
  });
});
