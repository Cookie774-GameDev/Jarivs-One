import { describe, expect, it } from 'vitest';
import { createPermanentDeleteAuthority } from './permanentDeleteAuthority';

const scope = {
  accountId: 'account-a',
  workspaceId: 'workspace-a',
  projectId: 'project-a',
  sessionId: 'session-a',
} as const;

describe('createPermanentDeleteAuthority', () => {
  it('consumes one exact scope/operation/resource receipt exactly once', () => {
    const authority = createPermanentDeleteAuthority({ scope, now: () => 100, ttlMs: 1_000 });
    const request = { operation: 'delete-chat' as const, resourceIds: ['chat-a'] };
    const receipt = authority.issue(request);

    expect(authority.consume(receipt, scope, request)).toEqual(request);
    expect(authority.consume(receipt, scope, request)).toBeNull();
  });

  it('rejects scope, operation, resource, expiry, and revoked-session drift', () => {
    let now = 100;
    const authority = createPermanentDeleteAuthority({ scope, now: () => now, ttlMs: 10 });
    const request = { operation: 'delete-chat' as const, resourceIds: ['chat-a'] };

    expect(
      authority.consume(authority.issue(request), { ...scope, sessionId: 'session-b' }, request),
    ).toBeNull();
    expect(
      authority.consume(authority.issue(request), scope, {
        operation: 'delete-chat-batch',
        resourceIds: ['chat-a'],
      }),
    ).toBeNull();
    expect(
      authority.consume(authority.issue(request), scope, {
        operation: 'delete-chat',
        resourceIds: ['chat-b'],
      }),
    ).toBeNull();

    const expired = authority.issue(request);
    now = 111;
    expect(authority.consume(expired, scope, request)).toBeNull();

    now = 100;
    const revoked = authority.issue(request);
    authority.revoke();
    expect(authority.consume(revoked, scope, request)).toBeNull();
  });

  it('rejects empty, duplicate, or oversized destructive targets before issuing authority', () => {
    const authority = createPermanentDeleteAuthority({ scope });
    expect(() => authority.issue({ operation: 'delete-chat', resourceIds: [] })).toThrow();
    expect(() =>
      authority.issue({ operation: 'delete-chat-batch', resourceIds: ['chat-a', 'chat-a'] }),
    ).toThrow();
    expect(() =>
      authority.issue({ operation: 'delete-chat-batch', resourceIds: Array(201).fill('chat') }),
    ).toThrow();
  });
});
