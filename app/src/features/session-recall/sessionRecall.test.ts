import { describe, expect, it } from 'vitest';
import { createSessionRecallService, type SessionIndexInput, type SessionRecord } from './index';

const DAY = 86_400_000;
const NOW = 40 * DAY;

const scope = {
  ownerId: 'owner-1',
  profileId: 'profile-1',
  projectId: 'project-1',
};

function session(id: string, overrides: Partial<SessionRecord> = {}): SessionIndexInput {
  return {
    session: {
      id,
      ownerId: scope.ownerId,
      profileId: scope.profileId,
      projectId: scope.projectId,
      surface: 'native_chat',
      title: 'Twilio calling decision',
      participantRefs: ['user:owner-1', 'agent:jarvis'],
      startedAt: 20 * DAY,
      updatedAt: 21 * DAY,
      retentionPolicyId: 'indefinite-local',
      contentRevision: 1,
      ...overrides,
    },
    source: { kind: 'vibespace_owned' },
    tags: ['calling', 'decision'],
    status: 'active',
    turns: [
      {
        id: `${id}:1`,
        sessionId: id,
        sequence: 1,
        occurredAt: 20 * DAY,
        participantRef: 'user:owner-1',
        role: 'user',
        text: 'We need a reliable calling provider for the desktop app.',
      },
      {
        id: `${id}:2`,
        sessionId: id,
        sequence: 2,
        occurredAt: 20 * DAY + 1,
        participantRef: 'agent:jarvis',
        role: 'assistant',
        text: 'We decided to use Twilio calling with a signed webhook.',
        command: 'npm run test:calling',
        filePaths: ['phone-jarvis/cloud/calling.py'],
        agentRef: 'agent:jarvis',
        model: 'gpt-5',
        resultType: 'decision',
      },
      {
        id: `${id}:3`,
        sessionId: id,
        sequence: 3,
        occurredAt: 20 * DAY + 2,
        participantRef: 'user:owner-1',
        role: 'user',
        text: 'Document that choice and keep the fallback disabled.',
      },
    ],
  };
}

function service() {
  const recall = createSessionRecallService({ now: () => NOW });
  recall.defineRetentionPolicy({
    id: 'indefinite-local',
    indexing: 'enabled',
    retention: 'indefinite',
    storage: 'local',
    deleteOnConversationDeletion: true,
  });
  recall.defineRetentionPolicy({
    id: 'seven-days',
    indexing: 'enabled',
    retention: '7d',
    storage: 'local',
    deleteOnConversationDeletion: true,
  });
  recall.defineRetentionPolicy({
    id: 'do-not-index',
    indexing: 'disabled',
    retention: 'indefinite',
    storage: 'local',
    deleteOnConversationDeletion: true,
  });
  return recall;
}

describe('Session Recall central service', () => {
  it('isolates discovery by owner, profile, and requested project while ranking metadata first', () => {
    const recall = service();
    recall.indexSession(session('wanted'));
    recall.indexSession(
      session('other-owner', {
        ownerId: 'owner-2',
        title: 'Twilio calling decision from another account',
      }),
    );
    recall.indexSession(
      session('other-profile', {
        profileId: 'profile-2',
        title: 'Twilio calling decision from another profile',
      }),
    );
    recall.indexSession(
      session('other-project', {
        projectId: 'project-2',
        title: 'Twilio calling decision from another project',
      }),
    );

    const results = recall.discover(scope, { exactPhrase: 'Twilio calling' });

    expect(results.map((result) => result.session.id)).toEqual(['wanted']);
    expect(results[0]).toMatchObject({
      matchedBy: ['title', 'content'],
      citation: {
        title: 'Twilio calling decision',
        date: 20 * DAY,
        platform: 'native_chat',
        messageRange: { start: 2, end: 2 },
        projectId: 'project-1',
        openAction: {
          kind: 'open_session',
          sessionId: 'wanted',
          turnId: 'wanted:2',
        },
      },
    });
    expect(results[0]?.excerpt.length).toBeLessThanOrEqual(240);
  });

  it('supports full-text, Boolean, date, participant, file, command, agent, model, and result filters', () => {
    const recall = service();
    recall.indexSession(session('match'));
    recall.indexSession(
      session('excluded', {
        title: 'Twilio legacy attempt',
        updatedAt: 22 * DAY,
      }),
    );

    const results = recall.discover(scope, {
      keywords: ['signed', 'webhook'],
      boolean: {
        all: ['Twilio'],
        any: ['calling', 'voice'],
        not: ['legacy'],
      },
      date: { since: 19 * DAY, until: 21 * DAY },
      projectId: 'project-1',
      profileId: 'profile-1',
      platform: 'native_chat',
      participant: 'agent:jarvis',
      filePath: 'phone-jarvis/cloud/calling.py',
      command: 'npm run test:calling',
      agent: 'agent:jarvis',
      model: 'gpt-5',
      resultType: 'decision',
    });

    expect(results.map((result) => result.session.id)).toEqual(['match']);
  });

  it('ranks title matches before content-only matches and breaks equal scores deterministically', () => {
    const recall = service();
    recall.indexSession(
      session('z-content-only', {
        title: 'Provider notes',
      }),
    );
    recall.indexSession(session('title-match'));
    recall.indexSession(
      session('a-content-only', {
        title: 'Calling architecture',
      }),
    );

    expect(
      recall.discover(scope, { exactPhrase: 'Twilio calling' }).map((result) => result.session.id),
    ).toEqual(['title-match', 'a-content-only', 'z-content-only']);
  });

  it('browses deterministically by every supported metadata filter', () => {
    const recall = service();
    recall.indexSession(session('active'));
    recall.indexSession({
      ...session('archived', {
        title: 'Kokoro voice selection',
        surface: 'voice',
        archivedAt: 25 * DAY,
        updatedAt: 25 * DAY,
      }),
      status: 'archived',
    });

    const results = recall.browse(
      { ownerId: scope.ownerId, profileId: scope.profileId },
      {
        date: { since: 24 * DAY, until: 26 * DAY },
        projectId: 'project-1',
        profileId: 'profile-1',
        platform: 'voice',
        agent: 'agent:jarvis',
        title: 'Kokoro',
        tag: 'calling',
        status: 'archived',
      },
    );

    expect(results.map((result) => result.id)).toEqual(['archived']);
  });

  it('returns a bounded surrounding-turn window around an authorized match', () => {
    const recall = service();
    recall.indexSession(session('scroll'));

    expect(
      recall.scroll(scope, {
        sessionId: 'scroll',
        anchorTurnId: 'scroll:2',
        before: 1,
        after: 1,
      }),
    ).toMatchObject({
      anchorIndex: 1,
      turns: [{ sequence: 1 }, { sequence: 2 }, { sequence: 3 }],
    });
    expect(
      recall.scroll(
        { ...scope, ownerId: 'owner-2' },
        { sessionId: 'scroll', anchorTurnId: 'scroll:2' },
      ),
    ).toBeNull();
  });

  it('enforces do-not-index, expiry, and delete-on-conversation-deletion against indexed turns', () => {
    const recall = service();
    recall.setSurfaceRetentionPolicy(scope, 'voice', 'do-not-index');
    recall.indexSession(
      session('disabled', {
        surface: 'voice',
      }),
    );
    recall.indexSession(
      session('expired', {
        retentionPolicyId: 'seven-days',
        updatedAt: 30 * DAY,
      }),
    );
    recall.indexSession(session('deleted'));

    expect(
      recall.discover(scope, { keywords: ['Twilio'] }).map((entry) => entry.session.id),
    ).toEqual(['deleted']);
    expect(recall.deleteConversation(scope, 'deleted')).toBe(true);
    expect(recall.verifyIndex(scope)).toEqual({ sessions: 0, turns: 0, errors: [] });
  });

  it('permanently deletes an authorized session even when its conversation policy retains it', () => {
    const recall = service();
    recall.defineRetentionPolicy({
      id: 'retain-after-conversation-delete',
      indexing: 'enabled',
      retention: '30d',
      storage: 'encrypted_sync',
      deleteOnConversationDeletion: false,
    });
    recall.indexSession(
      session('retained', {
        updatedAt: 35 * DAY,
        retentionPolicyId: 'retain-after-conversation-delete',
      }),
    );

    expect(recall.deleteConversation(scope, 'retained')).toBe(false);
    expect(recall.deletePermanently(scope, 'retained')).toBe(true);
    expect(recall.verifyIndex(scope)).toEqual({ sessions: 0, turns: 0, errors: [] });
  });

  it('fails closed on unknown surfaces and never accepts embedded consumer-AI content', () => {
    const recall = service();
    const invalidSurface = session('bad-surface');
    (invalidSurface.session as unknown as { surface: string }).surface = 'chatgpt';

    expect(() => recall.indexSession(invalidSurface)).toThrow(/surface/i);
    expect(() =>
      recall.indexSession({
        ...session('embedded'),
        source: { kind: 'embedded_consumer_ai', provider: 'chatgpt' },
      } as unknown as SessionIndexInput),
    ).toThrow(/source/i);
    expect(() =>
      recall.indexSession({
        ...session('empty-owned-content'),
        turns: [],
      }),
    ).toThrow(/turn/i);
    expect(() =>
      recall.indexSession({
        ...session('bad-role'),
        turns: [
          {
            ...session('bad-role').turns[0]!,
            role: 'provider' as never,
          },
        ],
      }),
    ).toThrow(/role/i);
    expect(() =>
      recall.indexSession({
        ...session('bad-status'),
        status: 'deleted' as never,
      }),
    ).toThrow(/status/i);
  });

  it('rejects a stale content revision instead of replacing newer indexed turns', () => {
    const recall = service();
    recall.indexSession(session('revisioned', { contentRevision: 2 }));

    expect(() => recall.indexSession(session('revisioned', { contentRevision: 1 }))).toThrow(
      /revision/i,
    );
    expect(recall.discover(scope, { keywords: ['Twilio'] })[0]?.session.contentRevision).toBe(2);
  });

  it('indexes Browser Chat shortcuts as metadata only and rejects provider conversation turns', () => {
    const recall = service();
    const metadata: SessionIndexInput = {
      ...session('shortcut', {
        title: 'ChatGPT shortcut for release notes',
      }),
      source: {
        kind: 'browser_chat_metadata',
        provider: 'chatgpt',
        url: 'https://chatgpt.com/c/example',
      },
      turns: [],
    };

    expect(recall.indexSession(metadata)).toBe(true);
    expect(recall.discover(scope, { keywords: ['release'] })[0]).toMatchObject({
      session: { id: 'shortcut' },
      excerpt: '',
      citation: {
        messageRange: null,
        openAction: {
          kind: 'open_url',
          url: 'https://chatgpt.com/c/example',
        },
      },
    });
    expect(() =>
      recall.indexSession({
        ...metadata,
        session: { ...metadata.session, id: 'provider-content' },
        turns: [
          {
            id: 'provider-content:1',
            sessionId: 'provider-content',
            sequence: 1,
            occurredAt: NOW,
            participantRef: 'provider',
            role: 'assistant',
            text: 'Provider conversation content must not be indexed.',
          },
        ],
      }),
    ).toThrow(/metadata-only/i);
    expect(() =>
      recall.indexSession({
        ...metadata,
        session: { ...metadata.session, id: 'wrong-provider-host' },
        source: {
          kind: 'browser_chat_metadata',
          provider: 'chatgpt',
          url: 'https://example.test/not-chatgpt',
        },
      }),
    ).toThrow(/provider URL/i);
  });

  it('routes /recall and /history through the same scoped service', () => {
    const recall = service();
    recall.indexSession(
      session('recent', {
        title: 'Kokoro voice selection',
        updatedAt: 35 * DAY,
      }),
    );

    const recalled = recall.executeCommand(
      scope,
      '/recall --project project-1 --since 30d Kokoro voice',
    );
    const history = recall.executeCommand(scope, '/history');

    expect(recalled).toMatchObject({
      kind: 'recall',
      query: {
        keywords: ['Kokoro', 'voice'],
        projectId: 'project-1',
        date: { since: 10 * DAY },
      },
      results: [{ session: { id: 'recent' } }],
    });
    expect(history).toMatchObject({
      kind: 'history',
      sessions: [{ id: 'recent' }],
    });
    expect(() => recall.executeCommand(scope, '/recall')).toThrow(/query/i);
  });
});
