import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { JarvisLiveEvidencePrimaryHostAccountSession } from '@/lib/jarvis/contracts';
import type { JarvisPersistenceReadyReceipt } from '@/lib/jarvis/persistenceCoordinator';

import { startJarvisVoiceRecoveryAccountSession } from './App';

const READY: JarvisPersistenceReadyReceipt = Object.freeze({
  accountId: 'account-alpha',
  generation: 7,
  state: 'ready',
});

function accountSession(order: string[]): JarvisLiveEvidencePrimaryHostAccountSession {
  let current = true;
  return Object.freeze({
    accountId: 'account-alpha',
    read: Object.freeze({
      accountId: 'account-alpha',
      snapshot: vi.fn(async () => undefined),
      subscribe: vi.fn(() => () => undefined),
    }),
    assertCurrent: vi.fn(() => {
      order.push('assert-current');
      if (!current) throw new Error('kernel_host_session_stale');
    }),
    dispose: vi.fn(() => {
      order.push('dispose-session');
      current = false;
    }),
  });
}

function services(order: string[]) {
  const session = accountSession(order);
  return {
    session,
    openLiveEvidenceAccount: vi.fn(async () => {
      order.push('open-account');
      return session;
    }),
    recoverVoiceResponses: vi.fn(async () => {
      order.push('recover-voice');
      return Object.freeze({
        accountId: 'account-alpha',
        ignored: 0,
        revoked: 0,
        committed: 1,
        conflicts: 0,
      });
    }),
  };
}

describe('App voice response recovery account session', () => {
  it('opens the account before recovery and retains the exact current session', async () => {
    const order: string[] = [];
    const recoveryServices = services(order);

    const started = await startJarvisVoiceRecoveryAccountSession({
      accountId: 'account-alpha',
      readyReceipt: READY,
      isCurrent: () => true,
      services: recoveryServices,
    });

    expect(started?.session).toBe(recoveryServices.session);
    expect(order).toEqual(['open-account', 'assert-current']);

    await started?.recover();

    expect(order).toEqual([
      'open-account',
      'assert-current',
      'assert-current',
      'recover-voice',
      'assert-current',
    ]);
    expect(recoveryServices.openLiveEvidenceAccount).toHaveBeenCalledWith('account-alpha');
    expect(recoveryServices.recoverVoiceResponses).toHaveBeenCalledWith({
      accountId: 'account-alpha',
    });
  });

  it('disposes a session that becomes stale while open and never recovers it', async () => {
    const order: string[] = [];
    const recoveryServices = services(order);
    let current = true;
    recoveryServices.openLiveEvidenceAccount.mockImplementationOnce(async () => {
      order.push('open-account');
      current = false;
      return recoveryServices.session;
    });

    await expect(
      startJarvisVoiceRecoveryAccountSession({
        accountId: 'account-alpha',
        readyReceipt: READY,
        isCurrent: () => current,
        services: recoveryServices,
      }),
    ).resolves.toBeUndefined();

    expect(order).toEqual(['open-account', 'dispose-session']);
    expect(recoveryServices.recoverVoiceResponses).not.toHaveBeenCalled();
  });

  it('disposes the retained session when bounded recovery fails', async () => {
    const order: string[] = [];
    const recoveryServices = services(order);
    recoveryServices.recoverVoiceResponses.mockRejectedValueOnce(new Error('recovery failed'));
    const started = await startJarvisVoiceRecoveryAccountSession({
      accountId: 'account-alpha',
      readyReceipt: READY,
      isCurrent: () => true,
      services: recoveryServices,
    });

    await expect(started?.recover()).rejects.toThrow('recovery failed');
    expect(recoveryServices.session.dispose).toHaveBeenCalledOnce();
  });

  it('owns and tears down the live-evidence session in the primary App account scope', () => {
    const source = readFileSync(join(__dirname, 'App.tsx'), 'utf8');
    const teardownStart = source.indexOf('async function stopAccountScopedListeners');
    const teardownEnd = source.indexOf('async function transitionAccountScopedListeners');
    const teardown = source.slice(teardownStart, teardownEnd);

    expect(source).toContain('startJarvisVoiceRecoveryAccountSession');
    expect(source).toContain('liveEvidenceAccountSession = voiceRecovery.session');
    const detachConsumers = teardown.indexOf('stops.map((stop)');
    const disposeSession = teardown.indexOf('oldLiveEvidenceSession?.dispose()');
    const invalidateAccount = teardown.indexOf('invalidateActiveKernelAccount');

    expect(detachConsumers).toBeGreaterThan(-1);
    expect(invalidateAccount).toBeGreaterThan(-1);
    expect(invalidateAccount).toBeLessThan(detachConsumers);
    expect(disposeSession).toBeGreaterThan(detachConsumers);
    expect(source).not.toContain('ownerMaintenance');
    expect(source).not.toContain('reconstructAccount');
  });
});
