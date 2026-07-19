import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { JarvisPersistenceReadyReceipt } from '@/lib/jarvis/persistenceCoordinator';

import { startJarvisLegacyLifecycleAccountSession } from './App';

const READY: JarvisPersistenceReadyReceipt = Object.freeze({
  accountId: 'account-alpha',
  generation: 7,
  state: 'ready',
});

function services(order: string[]) {
  return {
    deriveAccountScope: vi.fn(async () => {
      order.push('derive-scope');
      return 'scope-alpha';
    }),
    readLegacyRuns: vi.fn(async () => {
      order.push('read-legacy');
      return [];
    }),
    setAccountScope: vi.fn((scope: string) => order.push(scope ? 'set-scope' : 'clear-scope')),
    replaceLegacyRuns: vi.fn(() => order.push('replace-legacy')),
    startNotifications: vi.fn(() => {
      order.push('start-notifications');
      return () => order.push('stop-notifications');
    }),
    startCanonicalProjection: vi.fn(() => {
      order.push('start-canonical');
      return () => order.push('stop-canonical');
    }),
    resumeRecovery: vi.fn(async () => {
      order.push('resume-recovery');
      return 0;
    }),
  };
}

describe('App canonical lifecycle compatibility session', () => {
  it('clears synchronously, reads legacy once, starts canonical observers, then recovers after ready', async () => {
    const order: string[] = [];
    const lifecycleServices = services(order);

    const started = startJarvisLegacyLifecycleAccountSession({
      accountId: 'account-alpha',
      readyReceipt: READY,
      isCurrent: () => true,
      services: lifecycleServices,
    });

    expect(order).toEqual(['clear-scope', 'derive-scope']);
    const stop = await started;
    expect(order).toEqual([
      'clear-scope',
      'derive-scope',
      'set-scope',
      'read-legacy',
      'replace-legacy',
      'start-notifications',
      'start-canonical',
      'resume-recovery',
    ]);
    expect(lifecycleServices.resumeRecovery).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'account-alpha',
        readyReceipt: READY,
      }),
    );

    stop();
    expect(order.slice(-3)).toEqual(['stop-canonical', 'stop-notifications', 'clear-scope']);
  });

  it('does not hydrate, subscribe, or recover a stale account session', async () => {
    const order: string[] = [];
    const lifecycleServices = services(order);
    let current = true;
    lifecycleServices.deriveAccountScope.mockImplementation(async () => {
      order.push('derive-scope');
      current = false;
      return 'scope-alpha';
    });

    const stop = await startJarvisLegacyLifecycleAccountSession({
      accountId: 'account-alpha',
      readyReceipt: READY,
      isCurrent: () => current,
      services: lifecycleServices,
    });

    expect(order).toEqual(['clear-scope', 'derive-scope']);
    expect(lifecycleServices.readLegacyRuns).not.toHaveBeenCalled();
    expect(lifecycleServices.startNotifications).not.toHaveBeenCalled();
    expect(lifecycleServices.startCanonicalProjection).not.toHaveBeenCalled();
    expect(lifecycleServices.resumeRecovery).not.toHaveBeenCalled();
    stop();
  });

  it('contains no legacy persistence startup or hydration-driven recovery path', () => {
    const source = readFileSync(join(__dirname, 'App.tsx'), 'utf8');

    expect(source).not.toContain('startJarvisTaskRunPersistence');
    expect(source).not.toContain('onHydrated');
    expect(source).toContain('startJarvisLegacyLifecycleAccountSession');
    expect(source).toContain('readyReceipt');
  });
});
