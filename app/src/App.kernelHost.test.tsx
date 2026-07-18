import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/App.tsx', 'utf8');

describe('App trusted kernel host composition', () => {
  it('loads host/client boundaries dynamically and never imports runtime authority for pet views', () => {
    expect(source).not.toMatch(/^import .*kernel(?:Host|Client)/m);
    expect(source).toMatch(/import\(['"]@\/lib\/jarvis\/kernelHost['"]\)/);
    expect(source).toMatch(/import\(['"]@\/lib\/jarvis\/kernelClient['"]\)/);
    expect(source).toMatch(/<KernelBridgeBootstrap\s*\/>/);

    const petOverlay = source.indexOf("if (view === 'pet-overlay')");
    const petPanel = source.indexOf("if (view === 'pet-mini-panel')");
    const bridgeMount = source.lastIndexOf('<KernelBridgeBootstrap />');
    expect(petOverlay).toBeGreaterThan(-1);
    expect(petPanel).toBeGreaterThan(petOverlay);
    expect(bridgeMount).toBeGreaterThan(petPanel);
  });

  it('falls back to a typed client only after native/browser host attestation is unavailable', () => {
    expect(source).toMatch(/startJarvisKernelHost/);
    expect(source).toMatch(/session\.role\s*===\s*['"]host['"]/);
    expect(source).toMatch(/createJarvisKernelClient/);
    expect(source).not.toMatch(/kernelRole\s*=|[?&]kernel-host=|isHost\s*:/);
  });

  it('invalidates the old account synchronously before account listener teardown', () => {
    const teardownStart = source.indexOf('async function stopAccountScopedListeners');
    const teardownEnd = source.indexOf('async function transitionAccountScopedListeners');
    const teardown = source.slice(teardownStart, teardownEnd);
    const capture = teardown.indexOf('activeAccountIdentity?.accountId');
    const invalidate = teardown.indexOf('invalidateActiveKernelAccount');
    const clear = teardown.indexOf('activeAccountIdentity = null');
    const invokeStops = teardown.indexOf('stops.map');
    expect(capture).toBeGreaterThan(-1);
    expect(invalidate).toBeGreaterThan(capture);
    expect(clear).toBeGreaterThan(invalidate);
    expect(invokeStops).toBeGreaterThan(clear);
  });
});
