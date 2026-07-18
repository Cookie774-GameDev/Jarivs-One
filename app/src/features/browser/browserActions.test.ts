import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';
import { isProtectedJarvisAgent } from '@/lib/jarvis/identity';
import {
  BROWSER_ACTION_VERSION,
  BROWSER_REVIEW_TTL_MS,
  canonicalizeBrowserJson,
  classifyRisk,
  consumeBrowserReviewedAction,
  executeBrowserTool,
  requestBrowserTool,
  validateBrowserReviewedAction,
  validateBrowserTool,
  type BrowserReviewContext,
  type BrowserToolRequest,
} from './browserActions';
import { useBrowserStore } from './browserStore';
import type {
  BrowserActionRequester,
  BrowserJsonObject,
  BrowserReviewedAction,
} from './browserTypes';

const requester: BrowserActionRequester = {
  kind: 'agent',
  agent: { id: 'agent-1' as never, slug: 'jarvis', builtin: true },
  runId: 'run-1',
};

function setBrowser(
  controlMode:
    | 'user_only'
    | 'ask_every_action'
    | 'allow_safe_session'
    | 'agent_controlled' = 'ask_every_action',
) {
  useBrowserStore.setState((state) => ({
    ...state,
    tabs: [
      {
        id: 'tab-1',
        url: 'https://example.test/start',
        title: 'Start',
        loading: false,
        pinned: false,
        muted: false,
        controlMode,
      },
    ],
    activeTabId: 'tab-1',
    draftUrl: 'https://example.test/start',
    agentActions: [],
    agentArmed: false,
    consoleEntries: [],
    closedStack: [],
    runtime: null,
    frameDataUrl: null,
  }));
}

function contextFor(
  action: BrowserReviewedAction,
  patch: Partial<BrowserReviewContext> = {},
): BrowserReviewContext {
  return {
    accountId: action.accountId,
    origin: action.origin,
    tabId: action.tabId,
    frameId: action.frameId,
    target: action.target,
    now: action.requestedAt + 1,
    ...patch,
  };
}

function requestFor(action: BrowserReviewedAction): BrowserToolRequest {
  return {
    tool: action.kind,
    params: action.parameters,
    requester: action.requester,
  };
}

async function queuedAction(
  request: BrowserToolRequest = {
    tool: 'browser.click',
    params: { selector: '#continue', x: 10, y: 20, frameId: 'frame-1' },
    requester,
  },
): Promise<BrowserReviewedAction> {
  await requestBrowserTool(request, null);
  const action = useBrowserStore.getState().agentActions[0];
  expect(action).toBeDefined();
  return action!;
}

describe('browser operator approval integrity', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAuthStore.setState({ localUserId: 'account-a', cloudSession: null });
    setBrowser();
    vi.restoreAllMocks();
  });

  it('uses only canonical risk labels and ignores caller-authored summaries', () => {
    expect(classifyRisk('browser.readPage')).toBe('safe');
    expect(classifyRisk('browser.click')).toBe('confirm');
    expect(classifyRisk('browser.click', { intent: 'checkout' })).toBe('dangerous');
    expect(classifyRisk('browser.readPage', { subject: 'delete account' })).toBe('dangerous');
    expect(classifyRisk('browser.navigate', { url: 'https://example.test' })).toBe('confirm');

    const values = [
      classifyRisk('browser.readPage'),
      classifyRisk('browser.click'),
      classifyRisk('browser.click', { intent: 'purchase' }),
    ];
    expect(new Set(values)).toEqual(new Set(['safe', 'confirm', 'dangerous']));
  });

  it('rejects arbitrary javascript tools and allows registered tools', () => {
    expect(validateBrowserTool({ tool: 'browser.runJs' })?.ok).toBe(false);
    expect(validateBrowserTool({ tool: 'browser.evaluate' })?.ok).toBe(false);
    expect(validateBrowserTool({ tool: 'browser.navigate' })).toBeNull();
    expect(validateBrowserTool({ tool: 'browser.readPage' })).toBeNull();
  });

  it('canonicalizes JSON deterministically and rejects unsafe JSON shapes', () => {
    expect(canonicalizeBrowserJson({ z: 1, a: { y: [2, 1], x: true } })).toBe(
      '{"a":{"x":true,"y":[2,1]},"z":1}',
    );
    expect(canonicalizeBrowserJson({ a: 1, z: 2 })).toBe(canonicalizeBrowserJson({ z: 2, a: 1 }));
    expect(() => canonicalizeBrowserJson({ bad: Number.POSITIVE_INFINITY })).toThrow();
    expect(() => canonicalizeBrowserJson({ bad: undefined } as never)).toThrow();
    expect(() => canonicalizeBrowserJson(new Date() as never)).toThrow();
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => canonicalizeBrowserJson(cycle as never)).toThrow();
  });

  it('rejects sparse arrays and arrays with hidden non-index data', () => {
    const sparse: unknown[] = [];
    sparse.length = 2;
    sparse[1] = 'present';
    expect(() => canonicalizeBrowserJson(sparse as never)).toThrow(/array/i);

    const augmented = ['present'] as unknown[] & { authorization?: string };
    augmented.authorization = '[redacted]';
    expect(() => canonicalizeBrowserJson(augmented as never)).toThrow(/array/i);
  });

  it('rejects user-only requests, including safe reads, without storing a record', async () => {
    setBrowser('user_only');
    const result = await requestBrowserTool(
      { tool: 'browser.readPage', params: {}, requester, summary: 'benign' },
      { evaluate: vi.fn() } as never,
    );

    expect(result).toMatchObject({ ok: false, tool: 'browser.readPage' });
    expect(result.message).toContain('user-only');
    expect(useBrowserStore.getState().agentActions).toEqual([]);
  });

  it.each([
    ['ask_every_action', 'browser.readPage', {}, 'safe'],
    ['allow_safe_session', 'browser.click', { x: 1, y: 2 }, 'confirm'],
    ['agent_controlled', 'browser.click', { intent: 'purchase', x: 1, y: 2 }, 'dangerous'],
  ] as const)(
    'defers %s %s requests and never reaches the legacy executor',
    async (mode, tool, params, risk) => {
      setBrowser(mode);
      const cdp = {
        evaluate: vi.fn(),
        inputClick: vi.fn(),
        navigate: vi.fn(),
      };
      const result = await requestBrowserTool(
        { tool, params, requester, summary: 'This is harmless.' },
        cdp as never,
      );

      expect(result).toMatchObject({
        ok: false,
        tool,
        data: { status: 'unavailable', risk },
      });
      expect(result.message).toBe(
        'Browser Operator execution is unavailable until canonical approval is active.',
      );
      expect(cdp.evaluate).not.toHaveBeenCalled();
      expect(cdp.inputClick).not.toHaveBeenCalled();
      expect(cdp.navigate).not.toHaveBeenCalled();
      expect(useBrowserStore.getState().agentActions[0]?.status).toBe('pending');
    },
  );

  it('stores a complete account-bound, target-bound, expiring reviewed record', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000);
    const action = await queuedAction({
      tool: 'browser.navigate',
      params: { url: 'https://example.test/next', frameId: 'frame-1' },
      requester,
      summary: 'caller text is not trusted',
    });

    expect(action).toMatchObject({
      accountId: 'account-a',
      requester,
      kind: 'browser.navigate',
      actionVersion: BROWSER_ACTION_VERSION,
      origin: 'https://example.test',
      tabId: 'tab-1',
      frameId: 'frame-1',
      target: {
        currentUrl: 'https://example.test/start',
        requestedUrl: 'https://example.test/next',
      },
      parameters: { url: 'https://example.test/next', frameId: 'frame-1' },
      risk: 'confirm',
      status: 'pending',
      requestedAt: 10_000,
      expiresAt: 10_000 + BROWSER_REVIEW_TTL_MS,
    });
    expect(action.parametersHash).toMatch(/^[a-f0-9]{64}$/);
    expect(action.reviewedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(action.safeSummary).not.toContain('caller text');
  });

  it('produces identical hashes for reordered parameter keys', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(25_000);
    const first = await queuedAction({
      tool: 'browser.click',
      params: { x: 10, y: 20, selector: '#continue' },
      requester,
    });
    setBrowser();
    const second = await queuedAction({
      tool: 'browser.click',
      params: { selector: '#continue', y: 20, x: 10 },
      requester,
    });

    expect(second.parametersHash).toBe(first.parametersHash);
    expect(second.reviewedHash).toBe(first.reviewedHash);
  });

  it('validates an unchanged action and rejects status, account, expiry, and current context drift', async () => {
    const action = await queuedAction();
    const request = requestFor(action);
    expect(await validateBrowserReviewedAction(action, request, contextFor(action))).toEqual({
      ok: true,
      action,
    });

    expect(
      await validateBrowserReviewedAction(
        { ...action, status: 'unavailable' },
        request,
        contextFor(action),
      ),
    ).toMatchObject({ ok: false, reason: 'not_pending' });

    useAuthStore.setState({ localUserId: 'account-b' });
    expect(await validateBrowserReviewedAction(action, request, contextFor(action))).toMatchObject({
      ok: false,
      reason: 'account_mismatch',
    });
    useAuthStore.setState({ localUserId: 'account-a' });

    expect(
      await validateBrowserReviewedAction(
        action,
        request,
        contextFor(action, { now: action.expiresAt }),
      ),
    ).toMatchObject({ ok: false, reason: 'expired' });
    expect(
      await validateBrowserReviewedAction(
        action,
        request,
        contextFor(action, { origin: 'https://changed.test' }),
      ),
    ).toMatchObject({ ok: false, reason: 'origin_changed' });
    expect(
      await validateBrowserReviewedAction(action, request, contextFor(action, { tabId: 'tab-2' })),
    ).toMatchObject({ ok: false, reason: 'tab_changed' });
    expect(
      await validateBrowserReviewedAction(
        action,
        request,
        contextFor(action, { frameId: 'frame-2' }),
      ),
    ).toMatchObject({ ok: false, reason: 'frame_changed' });
    expect(
      await validateBrowserReviewedAction(
        action,
        request,
        contextFor(action, {
          target: { ...action.target, currentUrl: 'https://example.test/changed' },
        }),
      ),
    ).toMatchObject({ ok: false, reason: 'target_changed' });
  });

  it('rejects action, risk, hash, parameter, and expiry tampering', async () => {
    const action = await queuedAction();
    const request = requestFor(action);

    expect(
      await validateBrowserReviewedAction(
        action,
        { ...request, tool: 'browser.press' },
        contextFor(action),
      ),
    ).toMatchObject({ ok: false, reason: 'action_changed' });
    expect(
      await validateBrowserReviewedAction(
        { ...action, risk: 'dangerous' },
        request,
        contextFor(action),
      ),
    ).toMatchObject({ ok: false, reason: 'risk_changed' });
    expect(
      await validateBrowserReviewedAction(
        { ...action, parametersHash: '0'.repeat(64) },
        request,
        contextFor(action),
      ),
    ).toMatchObject({ ok: false, reason: 'hash_mismatch' });
    expect(
      await validateBrowserReviewedAction(
        action,
        { ...request, params: { ...action.parameters, x: 11 } },
        contextFor(action),
      ),
    ).toMatchObject({ ok: false, reason: 'hash_mismatch' });
    expect(
      await validateBrowserReviewedAction(
        { ...action, expiresAt: action.expiresAt + 1 },
        request,
        contextFor(action),
      ),
    ).toMatchObject({ ok: false, reason: 'hash_mismatch' });
  });

  it.each([
    [
      'account',
      (action: BrowserReviewedAction) => ({ ...action, accountId: 'account-b' }),
      'account_mismatch',
    ],
    [
      'requester',
      (action: BrowserReviewedAction) => ({
        ...action,
        requester: {
          ...action.requester,
          agent: { ...action.requester.agent, builtin: false },
        },
      }),
      'action_changed',
    ],
    [
      'version',
      (action: BrowserReviewedAction) => ({ ...action, actionVersion: 2 as never }),
      'action_changed',
    ],
    [
      'origin',
      (action: BrowserReviewedAction) => ({ ...action, origin: 'https://changed.test' }),
      'origin_changed',
    ],
    ['tab', (action: BrowserReviewedAction) => ({ ...action, tabId: 'tab-2' }), 'tab_changed'],
    [
      'frame',
      (action: BrowserReviewedAction) => ({ ...action, frameId: 'frame-2' }),
      'frame_changed',
    ],
    [
      'target',
      (action: BrowserReviewedAction) => ({
        ...action,
        target: { ...action.target, selector: '#changed' },
      }),
      'target_changed',
    ],
    [
      'expected effect',
      (action: BrowserReviewedAction) => ({ ...action, expectedEffect: 'Changed effect.' }),
      'action_changed',
    ],
    [
      'safe summary',
      (action: BrowserReviewedAction) => ({ ...action, safeSummary: 'Changed summary.' }),
      'action_changed',
    ],
    [
      'reviewed hash',
      (action: BrowserReviewedAction) => ({ ...action, reviewedHash: '0'.repeat(64) }),
      'hash_mismatch',
    ],
  ] as const)('rejects direct %s binding tampering', async (_field, mutate, reason) => {
    const action = await queuedAction();
    expect(
      await validateBrowserReviewedAction(
        mutate(action) as BrowserReviewedAction,
        requestFor(action),
        contextFor(action),
      ),
    ).toMatchObject({ ok: false, reason });
  });

  it.each([
    { password: '[credential-redacted]' },
    { cookie: '[credential-redacted]' },
    { authorization: '[credential-redacted]' },
    { apiKey: '[credential-redacted]' },
    { token: '[credential-redacted]' },
    { clientSecret: '[credential-redacted]' },
    { privateKey: '[credential-redacted]' },
    { recoveryCode: '[credential-redacted]' },
    { credentialHandleId: '[credential-redacted]' },
    { nested: { secret: true } },
  ] as BrowserJsonObject[])(
    'rejects credential-shaped parameters before insertion: %j',
    async (params) => {
      const result = await requestBrowserTool({ tool: 'browser.type', params, requester }, {
        inputType: vi.fn(),
      } as never);

      expect(result).toMatchObject({ ok: false, data: { status: 'unavailable' } });
      expect(result.message).toBe('Browser Operator request contains protected parameters.');
      expect(useBrowserStore.getState().agentActions).toEqual([]);
      expect(JSON.stringify(result)).not.toContain('[credential-redacted]');
    },
  );

  it.each([
    'Cookie: [redacted]',
    'Authorization: [redacted]',
    'password=[redacted]',
    'recovery code: [redacted]',
    '-----BEGIN ENCRYPTED PRIVATE KEY-----\n[redacted]',
  ])('rejects protected value shapes under otherwise benign keys', async (text) => {
    const result = await requestBrowserTool(
      { tool: 'browser.type', params: { text }, requester },
      null,
    );

    expect(result.message).toBe('Browser Operator request contains protected parameters.');
    expect(useBrowserStore.getState().agentActions).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('[redacted]');
  });

  it.each([
    { passwordValue: '[credential-redacted]' },
    { accessTokenValue: '[credential-redacted]' },
    { sessionCookie: '[credential-redacted]' },
    { clientSecretValue: '[credential-redacted]' },
  ] as BrowserJsonObject[])(
    'rejects credential-stem keys with descriptive suffixes: %j',
    async (params) => {
      const result = await requestBrowserTool({ tool: 'browser.type', params, requester }, null);

      expect(result.message).toBe('Browser Operator request contains protected parameters.');
      expect(useBrowserStore.getState().agentActions).toEqual([]);
      expect(JSON.stringify(result)).not.toContain('[credential-redacted]');
    },
  );

  it.each([
    ['browser.navigate', { url: 'https://example.test/changed' }],
    ['browser.click', { x: 20, y: 30 }],
    ['browser.type', { text: 'ordinary text' }],
    ['browser.readPage', {}],
  ] as const)('quarantines direct %s executor calls without effects', async (tool, params) => {
    const cdp = {
      navigate: vi.fn(),
      inputClick: vi.fn(),
      inputType: vi.fn(),
      evaluate: vi.fn(),
    };
    const before = useBrowserStore.getState();

    const result = await executeBrowserTool({ tool, params }, cdp as never);

    expect(result).toEqual({
      ok: false,
      tool,
      message: 'Browser Operator execution is unavailable until canonical approval is active.',
      data: { status: 'unavailable' },
    });
    expect(cdp.navigate).not.toHaveBeenCalled();
    expect(cdp.inputClick).not.toHaveBeenCalled();
    expect(cdp.inputType).not.toHaveBeenCalled();
    expect(cdp.evaluate).not.toHaveBeenCalled();
    expect(useBrowserStore.getState().tabs).toEqual(before.tabs);
    expect(useBrowserStore.getState().draftUrl).toBe(before.draftUrl);
    expect(useBrowserStore.getState().agentActions).toEqual(before.agentActions);
  });

  it('does not use a stored frame or target as live evidence during consumption', async () => {
    const framed = await queuedAction();
    const framedResult = await consumeBrowserReviewedAction(framed.id, null);
    expect(framedResult).toMatchObject({
      ok: false,
      data: { status: 'unavailable', actionId: framed.id, reason: 'frame_changed' },
    });
    expect(useBrowserStore.getState().agentActions[0]).toMatchObject({
      id: framed.id,
      status: 'unavailable',
    });

    setBrowser();
    const targeted = await queuedAction({
      tool: 'browser.click',
      params: { selector: '#continue' },
      requester,
    });
    const targetedResult = await consumeBrowserReviewedAction(targeted.id, null);
    expect(targetedResult).toMatchObject({
      ok: false,
      data: { status: 'unavailable', actionId: targeted.id, reason: 'target_changed' },
    });
    expect(useBrowserStore.getState().agentActions[0]).toMatchObject({
      id: targeted.id,
      status: 'unavailable',
    });
  });

  it.each([
    ['browser.readPage', {}, 'safe'],
    ['browser.press', { key: 'Enter' }, 'confirm'],
    ['browser.submit', {}, 'dangerous'],
  ] as const)(
    'consumes a locally reviewed %s action exactly once as unavailable',
    async (tool, params, risk) => {
      const action = await queuedAction({ tool, params, requester });
      const cdp = { evaluate: vi.fn(), inputClick: vi.fn() };

      const first = await consumeBrowserReviewedAction(action.id, cdp as never);
      expect(first).toEqual({
        ok: false,
        tool,
        message: 'Browser Operator execution is unavailable until canonical approval is active.',
        data: { status: 'unavailable', actionId: action.id },
      });
      expect(useBrowserStore.getState().agentActions[0]).toMatchObject({
        id: action.id,
        risk,
        status: 'unavailable',
      });
      expect(cdp.evaluate).not.toHaveBeenCalled();
      expect(cdp.inputClick).not.toHaveBeenCalled();

      const replay = await consumeBrowserReviewedAction(action.id, cdp as never);
      expect(replay).toMatchObject({
        ok: false,
        data: { status: 'unavailable', actionId: action.id, reason: 'not_pending' },
      });
      expect(cdp.evaluate).not.toHaveBeenCalled();
      expect(cdp.inputClick).not.toHaveBeenCalled();
    },
  );

  it('expires rather than consuming a stale reviewed action', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(100);
    const action = await queuedAction();
    vi.spyOn(Date, 'now').mockReturnValue(action.expiresAt);

    const result = await consumeBrowserReviewedAction(action.id, null);
    expect(result).toMatchObject({
      ok: false,
      data: { status: 'unavailable', actionId: action.id, reason: 'expired' },
    });
    expect(useBrowserStore.getState().agentActions[0]?.status).toBe('expired');
  });

  it('distinguishes protected built-in JARVIS from a slug collision', () => {
    expect(isProtectedJarvisAgent({ slug: 'jarvis', builtin: true })).toBe(true);
    expect(isProtectedJarvisAgent({ slug: 'jarvis', builtin: false })).toBe(false);
  });
});
