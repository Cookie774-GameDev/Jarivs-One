// index.test.ts – focused dependency-injected tests for message-complete.
// Run: node --test supabase/functions/message-complete/index.test.ts
// No Deno, no env, no network, no live Supabase/DeepSeek.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleMessageComplete } from './index.ts';
import type { HandlerDeps, AppAccessResponse, ProviderResult, ReservationResult } from './index.ts';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAccess(overrides: Partial<AppAccessResponse> = {}): AppAccessResponse {
  return {
    status: 'active',
    enabled: true,
    serverTime: new Date().toISOString(),
    canUseApp: true,
    canEdit: true,
    canExport: true,
    requiresCheckout: false,
    checkoutReason: null,
    ...overrides,
  };
}

interface CallLog {
  order: string[];
}

function makeDeps(overrides: Partial<HandlerDeps> = {}, log?: CallLog): HandlerDeps {
  const track = (name: string) => () => {
    log?.order.push(name);
  };
  return {
    getUser: async (_jwt: string) => {
      track('getUser')();
      return 'user-1';
    },
    getAppAccess: async (_jwt: string, _v?: string) => {
      track('getAppAccess')();
      return makeAccess();
    },
    isProviderConfigured: () => {
      track('isProviderConfigured')();
      return true;
    },
    isAppAdmin: async (_uid: string) => {
      track('isAppAdmin')();
      return false;
    },
    rateLimitHit: async () => {
      track('rateLimitHit')();
      return { limited: false };
    },
    reserveBudget: async () => {
      track('reserveBudget')();
      return { ok: true } as ReservationResult;
    },
    settleBudget: async () => {
      track('settleBudget')();
    },
    recordEvent: async () => {
      track('recordEvent')();
    },
    callProvider: async () => {
      track('callProvider')();
      return {
        ok: true,
        status: 200,
        body: {
          choices: [{ message: { role: 'assistant', content: 'hi' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        },
      } as ProviderResult;
    },
    estimateCost: (p: number, c: number) => p * 0.00000014 + c * 0.00000028,
    actualCost: (u: Record<string, number | undefined>) =>
      (u.prompt_tokens ?? 0) * 0.00000014 + (u.completion_tokens ?? 0) * 0.00000028,
    maxPromptChars: 100_000,
    providerTimeoutMs: 60_000,
    rateWindowMs: 60_000,
    rateMax: 60,
    estCompletionTokens: 800,
    ...overrides,
  };
}

function postReq(
  body: unknown,
  opts: { jwt?: string; method?: string; origin?: string } = {},
): Request {
  const { jwt = 'valid-jwt', method = 'POST', origin = 'tauri://localhost' } = opts;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (jwt) headers['authorization'] = `Bearer ${jwt}`;
  if (origin) headers['origin'] = origin;
  return new Request('http://localhost/message-complete', {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return JSON.parse(await res.text());
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('message-complete handler', () => {
  let log: CallLog;
  beforeEach(() => {
    log = { order: [] };
  });

  // ── Method / Auth / Input / Model ───────────────────────────────────────

  describe('method and auth', () => {
    it('rejects non-POST methods with 405', async () => {
      const res = await handleMessageComplete(makeDeps({}, log), postReq({}, { method: 'GET' }));
      assert.equal(res.status, 405);
      const b = await json(res);
      assert.equal(b.error, 'method_not_allowed');
    });

    it('handles OPTIONS preflight', async () => {
      const req = new Request('http://localhost/message-complete', {
        method: 'OPTIONS',
        headers: { origin: 'tauri://localhost' },
      });
      const res = await handleMessageComplete(makeDeps({}, log), req);
      assert.equal(res.status, 200);
      assert.ok(res.headers.get('access-control-allow-origin'));
      assert.equal(res.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
    });

    it('rejects missing JWT with 401', async () => {
      const res = await handleMessageComplete(
        makeDeps({}, log),
        postReq({ messages: [{}] }, { jwt: '' }),
      );
      assert.equal(res.status, 401);
      const b = await json(res);
      assert.equal(b.error, 'unauthorized');
    });

    it('rejects invalid JWT with 401', async () => {
      const deps = makeDeps({ getUser: async () => null }, log);
      const res = await handleMessageComplete(deps, postReq({ messages: [{}] }));
      assert.equal(res.status, 401);
    });
  });

  describe('input validation', () => {
    it('rejects malformed JSON body with 400', async () => {
      const req = new Request('http://localhost/message-complete', {
        method: 'POST',
        headers: {
          authorization: 'Bearer x',
          'content-type': 'application/json',
          origin: 'tauri://localhost',
        },
        body: 'not-json{{{',
      });
      const res = await handleMessageComplete(makeDeps({}, log), req);
      assert.equal(res.status, 400);
      const b = await json(res);
      assert.equal(b.error, 'bad_request');
    });

    it('rejects empty messages with 400', async () => {
      const res = await handleMessageComplete(makeDeps({}, log), postReq({ messages: [] }));
      assert.equal(res.status, 400);
      const b = await json(res);
      assert.equal(b.error, 'empty_messages');
    });

    it('rejects missing messages with 400', async () => {
      const res = await handleMessageComplete(makeDeps({}, log), postReq({}));
      assert.equal(res.status, 400);
    });

    it('rejects prompt exceeding max chars with 413', async () => {
      const deps = makeDeps({ maxPromptChars: 10 }, log);
      const res = await handleMessageComplete(
        deps,
        postReq({ messages: [{ content: 'a'.repeat(100) }] }),
      );
      assert.equal(res.status, 413);
      const b = await json(res);
      assert.equal(b.error, 'prompt_too_long');
    });

    it('falls back to default model for disallowed model', async () => {
      let usedModel = '';
      const deps = makeDeps(
        {
          callProvider: async (m: string) => {
            usedModel = m;
            return { ok: true, status: 200, body: { choices: [{ message: {} }], usage: {} } };
          },
        },
        log,
      );
      await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }], model: 'gpt-4' }));
      assert.equal(usedModel, 'deepseek-chat');
    });

    it('accepts allowed model', async () => {
      let usedModel = '';
      const deps = makeDeps(
        {
          callProvider: async (m: string) => {
            usedModel = m;
            return { ok: true, status: 200, body: { choices: [{ message: {} }], usage: {} } };
          },
        },
        log,
      );
      await handleMessageComplete(
        deps,
        postReq({ messages: [{ content: 'hi' }], model: 'deepseek-chat' }),
      );
      assert.equal(usedModel, 'deepseek-chat');
    });
  });

  // ── Access enforcement ──────────────────────────────────────────────────

  describe('app-access enforcement', () => {
    it('allows active canUseApp=true through to provider', async () => {
      const res = await handleMessageComplete(
        makeDeps({}, log),
        postReq({ messages: [{ content: 'hi' }] }),
      );
      assert.equal(res.status, 200);
    });

    it('allows authoritative prelaunch canUseApp=true through to provider', async () => {
      const deps = makeDeps(
        {
          getAppAccess: async () =>
            makeAccess({ status: 'prelaunch', enabled: false, canUseApp: true }),
        },
        log,
      );
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 200);
      assert.ok(log.order.includes('callProvider'));
    });

    it('rejects locked status with 403 access_locked', async () => {
      const deps = makeDeps(
        {
          getAppAccess: async () =>
            makeAccess({
              status: 'locked',
              canUseApp: false,
              requiresCheckout: true,
              checkoutReason: 'access_locked',
            }),
        },
        log,
      );
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 403);
      const b = await json(res);
      assert.equal(b.error, 'access_locked');
      assert.equal(b.access_status, 'locked');
      assert.equal(b.fallback, 'byok_or_local');
    });

    it('rejects prelaunch status with 403 access_prelaunch', async () => {
      const deps = makeDeps(
        {
          getAppAccess: async () =>
            makeAccess({ status: 'prelaunch', canUseApp: false, enabled: false }),
        },
        log,
      );
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 403);
      const b = await json(res);
      assert.equal(b.error, 'access_prelaunch');
    });

    it('rejects unknown status with 403 access_denied', async () => {
      const deps = makeDeps(
        {
          getAppAccess: async () => makeAccess({ status: 'unknown', canUseApp: false }),
        },
        log,
      );
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 403);
      const b = await json(res);
      assert.equal(b.error, 'access_denied');
      assert.equal(b.access_status, 'unknown');
    });

    it('treats unknown canUseApp=true as an invalid authoritative decision', async () => {
      const deps = makeDeps(
        {
          getAppAccess: async () => makeAccess({ status: 'unknown', canUseApp: true }),
        },
        log,
      );
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 403);
      const b = await json(res);
      assert.equal(b.error, 'access_denied');
      assert.ok(!log.order.includes('callProvider'));
    });

    it('fails closed on an unrecognized status even when canUseApp is true', async () => {
      const deps = makeDeps(
        {
          getAppAccess: async () => makeAccess({ status: 'forged', canUseApp: true }),
        },
        log,
      );
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 503);
      const b = await json(res);
      assert.equal(b.error, 'access_unavailable');
      assert.ok(!log.order.includes('callProvider'));
    });

    it('treats a disabled production grant as an invalid authoritative decision', async () => {
      const deps = makeDeps(
        {
          getAppAccess: async () =>
            makeAccess({ status: 'active', canUseApp: true, enabled: false }),
        },
        log,
      );
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 403);
      const b = await json(res);
      assert.equal(b.error, 'access_denied');
      assert.ok(!log.order.includes('isProviderConfigured'));
    });

    it('fails closed on RPC error (null response)', async () => {
      const deps = makeDeps({ getAppAccess: async () => null }, log);
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 503);
      const b = await json(res);
      assert.equal(b.error, 'access_unavailable');
      assert.equal(b.fallback, 'byok_or_local');
    });

    it('fails closed on RPC throw', async () => {
      const deps = makeDeps(
        {
          getAppAccess: async () => {
            throw new Error('rpc fail');
          },
        },
        log,
      );
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 503);
      const b = await json(res);
      assert.equal(b.error, 'access_unavailable');
    });

    it('fails closed on malformed response (missing canUseApp)', async () => {
      const deps = makeDeps(
        {
          getAppAccess: async () => ({ status: 'active' }) as unknown as AppAccessResponse,
        },
        log,
      );
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 503);
      const b = await json(res);
      assert.equal(b.error, 'access_unavailable');
    });

    it('fails closed on malformed response (missing status)', async () => {
      const deps = makeDeps(
        {
          getAppAccess: async () => ({ canUseApp: true }) as unknown as AppAccessResponse,
        },
        log,
      );
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 503);
    });

    it('access check produces zero billable effects when denied', async () => {
      const deps = makeDeps(
        {
          getAppAccess: async () => makeAccess({ status: 'locked', canUseApp: false }),
        },
        log,
      );
      await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.ok(!log.order.includes('rateLimitHit'), 'no rate limit call');
      assert.ok(!log.order.includes('reserveBudget'), 'no budget reservation');
      assert.ok(!log.order.includes('callProvider'), 'no provider call');
      assert.ok(!log.order.includes('settleBudget'), 'no settlement');
      assert.ok(!log.order.includes('recordEvent'), 'no usage event');
    });
  });

  // ── Effect ordering ─────────────────────────────────────────────────────

  describe('effect ordering', () => {
    it('access check runs before provider config, rate, budget, provider', async () => {
      await handleMessageComplete(makeDeps({}, log), postReq({ messages: [{ content: 'hi' }] }));
      const accessIdx = log.order.indexOf('getAppAccess');
      const providerCfgIdx = log.order.indexOf('isProviderConfigured');
      const rateIdx = log.order.indexOf('rateLimitHit');
      const budgetIdx = log.order.indexOf('reserveBudget');
      const callIdx = log.order.indexOf('callProvider');
      assert.ok(accessIdx >= 0, 'access was called');
      assert.ok(accessIdx < providerCfgIdx, 'access before provider config');
      assert.ok(accessIdx < rateIdx, 'access before rate limit');
      assert.ok(accessIdx < budgetIdx, 'access before budget');
      assert.ok(accessIdx < callIdx, 'access before provider call');
    });

    it('admin check runs after access authorization', async () => {
      await handleMessageComplete(makeDeps({}, log), postReq({ messages: [{ content: 'hi' }] }));
      const accessIdx = log.order.indexOf('getAppAccess');
      const adminIdx = log.order.indexOf('isAppAdmin');
      assert.ok(accessIdx < adminIdx, 'access before admin check');
    });
  });

  // ── Rate / Budget / Admin ───────────────────────────────────────────────

  describe('rate limit and budget', () => {
    it('returns 503 on rate-limit RPC error (fail closed)', async () => {
      const deps = makeDeps({ rateLimitHit: async () => null }, log);
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 503);
      const b = await json(res);
      assert.equal(b.error, 'usage_unavailable');
    });

    it('returns 429 when rate limited', async () => {
      const deps = makeDeps({ rateLimitHit: async () => ({ limited: true }) }, log);
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 429);
      const b = await json(res);
      assert.equal(b.error, 'rate_limited');
    });

    it('returns 500 on budget reservation RPC error', async () => {
      const deps = makeDeps({ reserveBudget: async () => null }, log);
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 500);
    });

    it('returns 402 on budget exceeded', async () => {
      const deps = makeDeps(
        {
          reserveBudget: async () =>
            ({ ok: false, reason: 'monthly_exceeded' }) as ReservationResult,
        },
        log,
      );
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 402);
      const b = await json(res);
      assert.equal(b.error, 'budget_exceeded');
      assert.equal(b.fallback, 'byok_or_local');
    });

    it('returns 429 on window exceeded', async () => {
      const deps = makeDeps(
        {
          reserveBudget: async () =>
            ({
              ok: false,
              reason: 'window_5h_exceeded',
              retry_after: '2026-01-01T00:00:00Z',
            }) as ReservationResult,
        },
        log,
      );
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 429);
      const b = await json(res);
      assert.equal(b.error, 'rate_window_exceeded');
      assert.equal(b.retry_after, '2026-01-01T00:00:00Z');
    });

    it('admin bypasses budget reservation but not access', async () => {
      const deps = makeDeps({ isAppAdmin: async () => true }, log);
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 200);
      assert.ok(!log.order.includes('reserveBudget'), 'admin skips reservation');
      assert.ok(!log.order.includes('settleBudget'), 'admin skips settlement');
      assert.ok(log.order.includes('getAppAccess'), 'admin still passes access gate');
    });

    it('admin denied if access check fails', async () => {
      const deps = makeDeps(
        {
          isAppAdmin: async () => true,
          getAppAccess: async () => makeAccess({ status: 'locked', canUseApp: false }),
        },
        log,
      );
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 403);
      assert.ok(!log.order.includes('isAppAdmin'), 'admin check never reached');
    });
  });

  // ── Provider ────────────────────────────────────────────────────────────

  describe('provider behavior', () => {
    it('returns 503 when provider not configured', async () => {
      const deps = makeDeps({ isProviderConfigured: () => false }, log);
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 503);
      const b = await json(res);
      assert.equal(b.error, 'provider_not_configured');
      assert.equal(b.fallback, 'byok_or_local');
    });

    it('returns 502 and settles on provider timeout/network error', async () => {
      const deps = makeDeps(
        {
          callProvider: async () => {
            throw new Error('timeout');
          },
        },
        log,
      );
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 502);
      const b = await json(res);
      assert.equal(b.error, 'provider_unavailable');
      assert.ok(log.order.includes('settleBudget'), 'settled on timeout');
    });

    it('returns 502 and settles on non-ok provider status', async () => {
      const deps = makeDeps(
        {
          callProvider: async () => ({ ok: false, status: 500, body: null }) as ProviderResult,
        },
        log,
      );
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 502);
      const b = await json(res);
      assert.equal(b.error, 'provider_error');
      assert.ok(log.order.includes('settleBudget'), 'settled on error status');
      assert.ok(log.order.includes('recordEvent'), 'audit on error');
    });

    it('returns 502 and settles on malformed provider body', async () => {
      const deps = makeDeps(
        {
          callProvider: async () => ({ ok: true, status: 200, body: null }) as ProviderResult,
        },
        log,
      );
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 502);
      assert.ok(log.order.includes('settleBudget'), 'settled on malformed body');
    });

    it('returns 200 with message and usage on success', async () => {
      const res = await handleMessageComplete(
        makeDeps({}, log),
        postReq({ messages: [{ content: 'hi' }] }),
      );
      assert.equal(res.status, 200);
      const b = await json(res);
      assert.deepEqual(b.message, { role: 'assistant', content: 'hi' });
      assert.ok(b.usage);
    });
  });

  // ── Dependency failures ────────────────────────────────────────────────

  describe('dependency failure bounds', () => {
    it('returns a bounded error when the provider configuration check throws', async () => {
      const deps = makeDeps(
        {
          isProviderConfigured: () => {
            throw new Error('config failure');
          },
        },
        log,
      );
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 503);
      const b = await json(res);
      assert.equal(b.error, 'usage_unavailable');
      assert.ok(!log.order.includes('rateLimitHit'));
    });

    it('returns a bounded error when the admin check throws', async () => {
      const deps = makeDeps(
        {
          isAppAdmin: async () => {
            throw new Error('admin failure');
          },
        },
        log,
      );
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 503);
      const b = await json(res);
      assert.equal(b.error, 'usage_unavailable');
      assert.ok(!log.order.includes('rateLimitHit'));
    });

    it('returns a bounded error when the rate-limit check throws', async () => {
      const deps = makeDeps(
        {
          rateLimitHit: async () => {
            throw new Error('rate failure');
          },
        },
        log,
      );
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 503);
      const b = await json(res);
      assert.equal(b.error, 'usage_unavailable');
      assert.ok(!log.order.includes('reserveBudget'));
    });

    it('returns a bounded error when budget reservation throws', async () => {
      const deps = makeDeps(
        {
          reserveBudget: async () => {
            throw new Error('reserve failure');
          },
        },
        log,
      );
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 503);
      const b = await json(res);
      assert.equal(b.error, 'usage_unavailable');
      assert.ok(!log.order.includes('callProvider'));
    });

    it('returns a bounded error when settlement throws after provider failure', async () => {
      const deps = makeDeps(
        {
          callProvider: async () => {
            throw new Error('provider failure');
          },
          settleBudget: async () => {
            throw new Error('settle failure');
          },
        },
        log,
      );
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 503);
      const b = await json(res);
      assert.equal(b.error, 'usage_unavailable');
      assert.equal(b.fallback, 'byok_or_local');
    });

    it('returns a bounded error when settlement throws after provider success', async () => {
      const deps = makeDeps(
        {
          settleBudget: async () => {
            throw new Error('settle failure');
          },
        },
        log,
      );
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 503);
      const b = await json(res);
      assert.equal(b.error, 'usage_unavailable');
      assert.ok(!log.order.includes('recordEvent'));
    });

    it('keeps a budget denial bounded when its audit event throws', async () => {
      const deps = makeDeps(
        {
          reserveBudget: async () => ({ ok: false, reason: 'monthly_exceeded' }),
          recordEvent: async () => {
            throw new Error('audit failure');
          },
        },
        log,
      );
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 402);
      const b = await json(res);
      assert.equal(b.error, 'budget_exceeded');
      assert.ok(!log.order.includes('callProvider'));
    });

    it('does not discard a settled provider success when audit throws', async () => {
      const deps = makeDeps(
        {
          recordEvent: async () => {
            throw new Error('audit failure');
          },
        },
        log,
      );
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.equal(res.status, 200);
      const b = await json(res);
      assert.deepEqual(b.message, { role: 'assistant', content: 'hi' });
    });
  });

  // ── Settlement / Audit ──────────────────────────────────────────────────

  describe('settlement and audit', () => {
    it('settles on every reserved failure path', async () => {
      // Provider throws after reservation.
      const deps = makeDeps(
        {
          callProvider: async () => {
            throw new Error('net');
          },
        },
        log,
      );
      await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.ok(log.order.includes('reserveBudget'));
      assert.ok(log.order.includes('settleBudget'));
    });

    it('records audit event on success', async () => {
      await handleMessageComplete(makeDeps({}, log), postReq({ messages: [{ content: 'hi' }] }));
      assert.ok(log.order.includes('recordEvent'));
    });

    it('records audit event on budget blocked', async () => {
      const deps = makeDeps(
        {
          reserveBudget: async () =>
            ({ ok: false, reason: 'monthly_exceeded' }) as ReservationResult,
        },
        log,
      );
      await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      assert.ok(log.order.includes('recordEvent'));
    });
  });

  // ── Fallback / Secret non-disclosure ────────────────────────────────────

  describe('fallback and security', () => {
    it('all error responses include fallback code for client', async () => {
      const cases: Array<[string, Partial<HandlerDeps>]> = [
        ['access_unavailable', { getAppAccess: async () => null }],
        [
          'access_locked',
          { getAppAccess: async () => makeAccess({ status: 'locked', canUseApp: false }) },
        ],
        ['provider_not_configured', { isProviderConfigured: () => false }],
        [
          'provider_unavailable',
          {
            callProvider: async () => {
              throw new Error('x');
            },
          },
        ],
        [
          'provider_error',
          { callProvider: async () => ({ ok: false, status: 500, body: null }) as ProviderResult },
        ],
      ];
      for (const [expected, ov] of cases) {
        const res = await handleMessageComplete(
          makeDeps(ov),
          postReq({ messages: [{ content: 'hi' }] }),
        );
        const b = await json(res);
        assert.equal(b.error, expected, `case: ${expected}`);
        assert.equal(b.fallback, 'byok_or_local', `fallback for ${expected}`);
      }
    });

    it('never exposes provider API key or service role key in responses', async () => {
      const res = await handleMessageComplete(
        makeDeps({}, log),
        postReq({ messages: [{ content: 'hi' }] }),
      );
      const text = await res.text();
      assert.ok(!text.includes('DEEPSEEK_API_KEY'));
      assert.ok(!text.includes('SERVICE_ROLE'));
      assert.ok(!text.includes('sk-'));
    });

    it('never exposes raw provider error body', async () => {
      const deps = makeDeps(
        {
          callProvider: async () =>
            ({
              ok: false,
              status: 500,
              body: { error: { message: 'internal secret: sk-abc123' } },
            }) as ProviderResult,
        },
        log,
      );
      const res = await handleMessageComplete(deps, postReq({ messages: [{ content: 'hi' }] }));
      const text = await res.text();
      assert.ok(!text.includes('sk-abc123'), 'no secret leak');
      assert.ok(!text.includes('internal secret'), 'no raw error');
    });

    it('does not trust client-provided access/tier/status', async () => {
      // Client sends fake access fields in body; handler ignores them.
      const deps = makeDeps(
        {
          getAppAccess: async () => makeAccess({ status: 'locked', canUseApp: false }),
        },
        log,
      );
      const res = await handleMessageComplete(
        deps,
        postReq({
          messages: [{ content: 'hi' }],
          canUseApp: true,
          status: 'active',
          tier: 'ultra',
        }),
      );
      assert.equal(res.status, 403, 'client fields ignored; server access denies');
    });

    it('does not pass a client-provided app version to the access dependency', async () => {
      let receivedVersion: string | undefined;
      const deps = makeDeps(
        {
          getAppAccess: async (_jwt: string, appVersion?: string) => {
            receivedVersion = appVersion;
            return makeAccess();
          },
        },
        log,
      );
      const res = await handleMessageComplete(
        deps,
        postReq({ messages: [{ content: 'hi' }], app_version: '999.999.999' }),
      );
      assert.equal(res.status, 200);
      assert.equal(receivedVersion, undefined);
    });
  });
});
