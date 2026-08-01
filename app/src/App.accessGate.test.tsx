import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/App.tsx', 'utf8');

describe('App VibeSpace Access composition', () => {
  it('wraps only the authenticated main workspace in the installed access host', () => {
    const bootstrap = source.indexOf('function KernelBridgeBootstrap');
    const authBoundary = source.indexOf('export function RuntimeProfileAuthBoundary', bootstrap);
    const desktopLifecycle = source.indexOf('function useDesktopReopenLifecycle', authBoundary);
    const bootstrapSource = source.slice(bootstrap, authBoundary);
    const authBoundarySource = source.slice(authBoundary, desktopLifecycle);
    const accessHost = bootstrapSource.indexOf('<InstalledAccessAppHost>');
    const workspace = bootstrapSource.indexOf('<WorkspaceRoot />', accessHost);
    const accessClose = bootstrapSource.indexOf('</InstalledAccessAppHost>', workspace);

    expect(bootstrap).toBeGreaterThan(-1);
    expect(authBoundary).toBeGreaterThan(bootstrap);
    expect(desktopLifecycle).toBeGreaterThan(authBoundary);
    expect(bootstrapSource).toContain('<RuntimeProfileAuthBoundary plan={plan}>');
    expect(authBoundarySource).toContain('<AuthGate>{children}</AuthGate>');
    expect(accessHost).toBeGreaterThan(-1);
    expect(workspace).toBeGreaterThan(accessHost);
    expect(accessClose).toBeGreaterThan(workspace);
  });

  it('keeps dictation and pet windows ahead of the main access-gated bootstrap', () => {
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
