import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { completeRemoteJarvis, type RemoteCompletionDeps } from './remoteJarvisRuntime.ts';

function allowedAccess() {
  return {
    status: 'active',
    enabled: true,
    serverTime: new Date().toISOString(),
    canUseApp: true,
    canEdit: true,
    canExport: true,
    requiresCheckout: false,
  };
}

function makeDeps(overrides: Partial<RemoteCompletionDeps> = {}) {
  const calls: string[] = [];
  const deps: RemoteCompletionDeps = {
    getAppAccess: async () => {
      calls.push('access');
      return allowedAccess();
    },
    isProviderConfigured: () => true,
    isAppAdmin: async () => false,
    rateLimitHit: async () => ({ limited: false }),
    reserveBudget: async () => ({ ok: true }),
    settleBudget: async (_userId, _reserved, actual) => {
      calls.push(`settle:${actual}`);
    },
    recordEvent: async (_userId, payload) => {
      calls.push(`record:${String(payload.status)}`);
    },
    callProvider: async () => ({
      ok: true,
      status: 200,
      body: {
        choices: [{ message: { role: 'assistant', content: 'Remote answer' } }],
        usage: { prompt_tokens: 20, completion_tokens: 5 },
      },
    }),
    now: () => new Date('2026-08-22T20:00:00Z'),
    ...overrides,
  };
  return { deps, calls };
}

const request = {
  userId: 'user-1',
  eventId: 'event-1',
  messages: [{ role: 'user' as const, content: 'Hello' }],
};

describe('remote Jarvis metered completion', () => {
  it('passes authoritative access, rate, budget, provider, settlement, and audit', async () => {
    const { deps, calls } = makeDeps();
    assert.deepEqual(await completeRemoteJarvis(deps, request), { text: 'Remote answer' });
    assert.equal(
      calls.some((call) => call.startsWith('settle:')),
      true,
    );
    assert.equal(calls.includes('record:ok'), true);
  });

  it('fails closed on access denial before billable effects', async () => {
    let providerCalls = 0;
    const { deps } = makeDeps({
      getAppAccess: async () => ({ ...allowedAccess(), status: 'locked', canUseApp: false }),
      callProvider: async () => {
        providerCalls += 1;
        throw new Error('must_not_run');
      },
    });
    await assert.rejects(() => completeRemoteJarvis(deps, request), /remote_access_denied/);
    assert.equal(providerCalls, 0);
  });

  it('fails closed when budget reservation is denied', async () => {
    let providerCalls = 0;
    const { deps } = makeDeps({
      reserveBudget: async () => ({ ok: false, reason: 'monthly_budget_exceeded' }),
      callProvider: async () => {
        providerCalls += 1;
        throw new Error('must_not_run');
      },
    });
    await assert.rejects(() => completeRemoteJarvis(deps, request), /remote_budget_denied/);
    assert.equal(providerCalls, 0);
  });

  it('settles a failed provider reservation to zero without exposing its body', async () => {
    const { deps, calls } = makeDeps({
      callProvider: async () => ({
        ok: false,
        status: 401,
        body: { error: 'secret provider response' },
      }),
    });
    await assert.rejects(
      () => completeRemoteJarvis(deps, request),
      /^Error: remote_provider_error$/,
    );
    assert.equal(calls.includes('settle:0'), true);
    assert.equal(calls.join(' ').includes('secret provider response'), false);
  });
});
