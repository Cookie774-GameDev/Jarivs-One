import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/App.tsx', 'utf8');

describe('App VibeSpace Access composition', () => {
  it('wraps only the authenticated main workspace in the installed access host', () => {
    const bootstrap = source.indexOf('function KernelBridgeBootstrap');
    const authGate = source.indexOf('<AuthGate>', bootstrap);
    const accessHost = source.indexOf('<InstalledAccessAppHost>');
    const workspace = source.indexOf('<WorkspaceRoot />', accessHost);
    const authClose = source.indexOf('</AuthGate>', workspace);

    expect(bootstrap).toBeGreaterThan(-1);
    expect(authGate).toBeGreaterThan(-1);
    expect(accessHost).toBeGreaterThan(authGate);
    expect(workspace).toBeGreaterThan(accessHost);
    expect(authClose).toBeGreaterThan(workspace);
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
