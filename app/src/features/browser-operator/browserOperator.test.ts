import { describe, expect, it } from 'vitest';
import {
  BrowserOperatorSession,
  createBrowserSession,
  decideBrowserAction,
  decideNavigation,
  exposeImplementedTools,
  planObservation,
  type BrowserPolicy,
} from './index';

const localPolicy: BrowserPolicy = {
  mode: 'local',
  allowedDomains: ['example.com', 'blocked.example'],
  blockedDomains: ['blocked.example'],
  uploads: 'deny',
  downloads: 'sandbox',
  screenshotRetention: 'none',
};

describe('Browser Operator policy core', () => {
  it('exposes only tools implemented by the active adapter', () => {
    expect(
      exposeImplementedTools(
        ['snapshot', 'navigate'],
        ['snapshot', 'navigate', 'form_draft', 'external_send'],
      ),
    ).toEqual(['snapshot', 'navigate']);
    expect(() => exposeImplementedTools(['invented' as 'snapshot'])).toThrow(
      'Unknown browser tool',
    );
  });

  it('uses snapshot first and adds visual capture only for visual evidence', () => {
    expect(planObservation('semantic')).toEqual(['snapshot']);
    expect(planObservation('layout')).toEqual(['snapshot', 'screenshot']);
    expect(planObservation('image')).toEqual(['snapshot', 'screenshot']);
    expect(planObservation('canvas')).toEqual(['snapshot', 'screenshot']);
  });

  it('canonicalizes exact domains, makes block win, and rejects credential-bearing URLs', () => {
    expect(decideNavigation(localPolicy, 'https://EXAMPLE.com./docs')).toMatchObject({
      outcome: 'allow',
      domain: 'example.com',
    });
    expect(decideNavigation(localPolicy, 'https://blocked.example')).toMatchObject({
      outcome: 'deny',
      reason: 'domain_blocked',
    });
    expect(decideNavigation(localPolicy, 'https://sub.example.com')).toMatchObject({
      outcome: 'deny',
      reason: 'domain_not_approved',
    });
    expect(decideNavigation(localPolicy, 'https://alice:secret@example.com')).toMatchObject({
      outcome: 'deny',
      reason: 'credential_bearing_url',
    });
    expect(
      decideNavigation(localPolicy, 'https://example.com/callback?access_token=secret'),
    ).toMatchObject({
      outcome: 'deny',
      reason: 'credential_bearing_url',
    });
    expect(decideNavigation(localPolicy, 'https://example.com/#password=secret')).toMatchObject({
      outcome: 'deny',
      reason: 'credential_bearing_url',
    });
  });

  it.each([
    'https://chatgpt.com/',
    'https://claude.ai/',
    'https://gemini.google.com/',
    'https://chat.openai.com/',
    'https://bard.google.com/',
    'https://accounts.chatgpt.com/',
  ])('always denies consumer AI automation at %s', (url) => {
    const permissive: BrowserPolicy = {
      ...localPolicy,
      allowedDomains: [new URL(url).hostname],
      blockedDomains: [],
    };
    expect(decideNavigation(permissive, url)).toMatchObject({
      outcome: 'deny',
      reason: 'consumer_ai_denied',
    });
  });

  it('creates an isolated local profile and download sandbox with no ordinary cookies', () => {
    const session = createBrowserSession(localPolicy, {
      sessionId: 'session-a',
      profileId: 'profile-a',
      accountScopeId: 'account-a',
    });

    expect(session).toMatchObject({
      ok: true,
      session: {
        mode: 'local',
        sessionId: 'session-a',
        profileId: 'profile-a',
        cookieAccess: 'isolated_ephemeral',
        downloadSandboxId: 'download:session-a',
        cloud: null,
      },
    });
    expect(JSON.stringify(session)).not.toMatch(/password|cookieValue|twoFactor|mfaCode/i);
    const otherAccount = createBrowserSession(localPolicy, {
      sessionId: 'session-a',
      profileId: 'profile-a',
      accountScopeId: 'account-b',
    });
    expect(otherAccount).toMatchObject({ ok: true });
    if (session.ok && otherAccount.ok) {
      expect(otherAccount.session.isolationKey).not.toBe(session.session.isolationKey);
    }
  });

  it('requires explicit metered opt-in and a region label for cloud sessions', () => {
    const cloudPolicy: BrowserPolicy = {
      ...localPolicy,
      mode: 'cloud',
      cloud: { enabled: true, metered: true, regionLabel: 'US Central' },
    };

    expect(
      createBrowserSession(cloudPolicy, {
        sessionId: 'cloud-a',
        profileId: 'profile-a',
        accountScopeId: 'account-a',
      }),
    ).toMatchObject({ ok: false, reason: 'cloud_consent_required' });
    expect(
      createBrowserSession(cloudPolicy, {
        sessionId: 'cloud-a',
        profileId: 'profile-a',
        accountScopeId: 'account-a',
        cloudConsent: { meteredAccepted: true, regionLabel: 'US Central' },
      }),
    ).toMatchObject({
      ok: true,
      session: {
        mode: 'cloud',
        cloud: { metered: true, regionLabel: 'US Central' },
      },
    });
  });

  it('allows drafts but gates sends, financial/destructive work, and credential takeover', () => {
    expect(decideBrowserAction({ risk: 'form_draft' })).toEqual({ outcome: 'allow' });
    expect(decideBrowserAction({ risk: 'external_send' })).toMatchObject({
      outcome: 'approval_required',
    });
    expect(decideBrowserAction({ risk: 'destructive' })).toMatchObject({
      outcome: 'approval_required',
    });
    expect(decideBrowserAction({ risk: 'financial' })).toMatchObject({
      outcome: 'takeover_required',
      reason: 'payment',
    });
    expect(decideBrowserAction({ risk: 'credential' })).toMatchObject({
      outcome: 'takeover_required',
      reason: 'credential',
    });
    expect(
      decideBrowserAction({ risk: 'form_draft', phase: 'submit', sensitive: true }),
    ).toMatchObject({
      outcome: 'takeover_required',
      reason: 'credential',
    });
  });

  it.each([
    'login',
    'password',
    'passkey',
    'captcha',
    'mfa',
    'payment',
    'legal_publish',
    'high_risk_publish',
  ] as const)('pauses for %s takeover until explicit user confirmation', (reason) => {
    const operator = new BrowserOperatorSession('session-a');
    const challenge = operator.pauseForTakeover(reason);

    expect(operator.getModelVisibleState()).toEqual({
      sessionId: 'session-a',
      status: 'takeover_paused',
      takeover: { id: challenge.id, reason },
    });
    expect(operator.resumeAfterTakeover(challenge.id, false)).toBe(false);
    expect(operator.status).toBe('takeover_paused');
    expect(operator.resumeAfterTakeover(challenge.id, true)).toBe(true);
    expect(operator.status).toBe('ready');
  });
});
