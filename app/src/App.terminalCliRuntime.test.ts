import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/App.tsx', 'utf8');

describe('App terminal CLI runtime composition', () => {
  it('mounts the headless responder only in the main application root', () => {
    expect(source).toMatch(
      /import\s+\{\s*TerminalCliRuntimeHost\s*\}\s+from\s+['"]@\/features\/terminals['"]/u,
    );
    const petPanel = source.indexOf("if (view === 'pet-mini-panel')");
    const runtimeMount = source.lastIndexOf('<TerminalCliRuntimeHost />');
    const kernelMount = source.lastIndexOf('<KernelBridgeBootstrap />');

    expect(runtimeMount).toBeGreaterThan(petPanel);
    expect(runtimeMount).toBeGreaterThan(kernelMount);
    expect(source.match(/<TerminalCliRuntimeHost\s*\/>/gu)).toHaveLength(1);
  });
});
