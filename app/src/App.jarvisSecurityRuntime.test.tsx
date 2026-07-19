import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/App.tsx', 'utf8');

describe('App trusted JARVIS security runtime boundary', () => {
  it('constructs security authority only inside a Tauri-attested host runtime callback', () => {
    expect(source).not.toMatch(/^import .*jarvisSecurityRuntime/m);
    expect(source).toMatch(/createRuntime:\s*async\s*\(\)\s*=>/);
    const callback = source.slice(
      source.indexOf('createRuntime: async () =>'),
      source.indexOf("if (session.role === 'host')", source.indexOf('createRuntime: async () =>')),
    );
    expect(callback).toContain("'__TAURI_INTERNALS__' in window");
    expect(callback).toMatch(/import\(['"]@\/lib\/jarvis\/jarvisSecurityRuntime['"]\)/);
    expect(callback).toContain('createJarvisSecurityRuntime');
    expect(callback).toMatch(
      /createStrictPluginCredentialGrantStorage\(\s*window\.localStorage\s*\)/,
    );
    expect(callback).toContain('createPluginCredentialAccountGrantRepository');
    expect(callback).toContain('createJarvisExistingCredentialAuthorization');
    expect(callback.indexOf("'__TAURI_INTERNALS__' in window")).toBeLessThan(
      callback.indexOf('createJarvisSecurityRuntime'),
    );
  });

  it('provides only plugin management to React and revokes process authority on every teardown', () => {
    expect(source).toContain('<PluginManagementCapabilityProvider value={pluginManagement}>');
    expect(source).not.toMatch(/useState<\s*JarvisSecurityRuntime/);
    expect(source).toMatch(/securityRuntime\?\.invalidateAll\(\)/);
    expect(source).toMatch(/addEventListener\(['"]pagehide['"],\s*invalidateSecurityRuntime/);
    expect(source).toMatch(/removeEventListener\(['"]pagehide['"],\s*invalidateSecurityRuntime/);
    expect(source).toMatch(/invalidateActiveKernelAccount\(oldAccountId\)/);
  });

  it('keeps dictation and pet windows ahead of the kernel bootstrap boundary', () => {
    const dictation = source.indexOf("if (view === 'dictation')");
    const petOverlay = source.indexOf("if (view === 'pet-overlay')");
    const petPanel = source.indexOf("if (view === 'pet-mini-panel')");
    const bridgeMount = source.lastIndexOf('<KernelBridgeBootstrap />');
    expect(dictation).toBeGreaterThan(-1);
    expect(petOverlay).toBeGreaterThan(dictation);
    expect(petPanel).toBeGreaterThan(petOverlay);
    expect(bridgeMount).toBeGreaterThan(petPanel);
  });
});
