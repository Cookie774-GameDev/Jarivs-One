// Run: node --test supabase/functions/_shared/remoteJarvisMessaging.test.ts
// Pure dependency-injected tests: no Deno, network, credentials, or live Supabase.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  handleRemoteJarvisMessage,
  type RemoteJarvisDeps,
  type RemoteJarvisInbound,
} from './remoteJarvisMessaging.ts';

const inbound: RemoteJarvisInbound = Object.freeze({
  platform: 'telegram',
  providerEventId: 'update-101',
  workspaceId: 'bot-main',
  platformUserId: 'telegram-user-7',
  replyAddress: 'chat-44',
  text: '  What is on my schedule?  ',
});

function makeDeps(overrides: Partial<RemoteJarvisDeps> = {}) {
  const calls = {
    complete: [] as unknown[][],
    deliver: [] as string[],
    saved: [] as Array<{ role: string; text: string }>,
    marks: [] as string[],
  };
  const deps: RemoteJarvisDeps = {
    claimInbound: async () => ({
      kind: 'claimed',
      eventId: 'event-1',
      identity: {
        id: 'identity-1',
        userId: 'user-1',
        platform: 'telegram',
        workspaceId: 'bot-main',
        platformUserId: 'telegram-user-7',
        scopes: ['chat'],
      },
    }),
    loadRecentTurns: async () => [
      { role: 'user', text: 'Hello' },
      { role: 'assistant', text: 'Hello. How can I help?' },
    ],
    complete: async (request) => {
      calls.complete.push(request.messages);
      return { text: 'Your next event is at 3 PM.' };
    },
    saveTurn: async (_identityId, role, text) => {
      calls.saved.push({ role, text });
    },
    deliver: async (_message, text) => {
      calls.deliver.push(text);
    },
    markEvent: async (_eventId, status) => {
      calls.marks.push(status);
    },
    ...overrides,
  };
  return { deps, calls };
}

describe('remote Jarvis messaging coordinator', () => {
  it('authorizes the exact linked identity and produces exactly one chat-only reply', async () => {
    const { deps, calls } = makeDeps();

    const result = await handleRemoteJarvisMessage(deps, inbound);

    assert.deepEqual(result, { kind: 'replied', eventId: 'event-1' });
    assert.equal(calls.complete.length, 1);
    assert.equal(calls.deliver.length, 1);
    assert.deepEqual(calls.saved, [
      { role: 'user', text: 'What is on my schedule?' },
      { role: 'assistant', text: 'Your next event is at 3 PM.' },
    ]);
    const messages = calls.complete[0] as Array<{ role: string; content: string }>;
    assert.equal(messages.at(-1)?.content, 'What is on my schedule?');
    assert.match(messages[0]?.content ?? '', /conversation only/i);
    assert.match(messages[0]?.content ?? '', /no tools/i);
    assert.deepEqual(calls.marks, ['completed']);
  });

  it('does nothing for an unknown or revoked external identity', async () => {
    const { deps, calls } = makeDeps({
      claimInbound: async () => ({ kind: 'unauthorized' }),
    });

    assert.deepEqual(await handleRemoteJarvisMessage(deps, inbound), { kind: 'unauthorized' });
    assert.equal(calls.complete.length, 0);
    assert.equal(calls.deliver.length, 0);
  });

  it('deduplicates provider retries before inference or delivery', async () => {
    const { deps, calls } = makeDeps({
      claimInbound: async () => ({ kind: 'duplicate', eventId: 'event-existing' }),
    });

    assert.deepEqual(await handleRemoteJarvisMessage(deps, inbound), {
      kind: 'duplicate',
      eventId: 'event-existing',
    });
    assert.equal(calls.complete.length, 0);
    assert.equal(calls.deliver.length, 0);
  });

  it('requests only bounded recent history and rejects non-chat scopes', async () => {
    let requestedLimit = 0;
    const { deps, calls } = makeDeps({
      loadRecentTurns: async (_identityId, limit) => {
        requestedLimit = limit;
        return [];
      },
      claimInbound: async () => ({
        kind: 'claimed',
        eventId: 'event-2',
        identity: {
          id: 'identity-2',
          userId: 'user-1',
          platform: 'telegram',
          workspaceId: 'bot-main',
          platformUserId: 'telegram-user-7',
          scopes: ['notifications'],
        },
      }),
    });

    assert.deepEqual(await handleRemoteJarvisMessage(deps, inbound), {
      kind: 'forbidden',
      eventId: 'event-2',
    });
    assert.equal(requestedLimit, 0);
    assert.equal(calls.complete.length, 0);
    assert.deepEqual(calls.marks, ['forbidden']);
  });

  it('returns a safe retry message and never exposes provider failures', async () => {
    const { deps, calls } = makeDeps({
      complete: async () => {
        throw new Error('secret-provider-key raw upstream dump');
      },
    });

    assert.deepEqual(await handleRemoteJarvisMessage(deps, inbound), {
      kind: 'failed',
      eventId: 'event-1',
    });
    assert.deepEqual(calls.deliver, ['Jarvis is temporarily unavailable. Please try again.']);
    assert.equal(calls.deliver.join(' ').includes('secret-provider-key'), false);
    assert.deepEqual(calls.marks, ['failed']);
  });
});
