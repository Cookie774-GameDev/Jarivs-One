import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const RESPONSE_PATH_MODULES = [
  './runtime.ts',
  './router.ts',
  './adapters/registry.ts',
  './adapters/opencode.ts',
  './adapters/codex.ts',
] as const;

describe('model catalog response-path isolation', () => {
  it.each(RESPONSE_PATH_MODULES)('%s neither imports nor invokes catalog refresh', (modulePath) => {
    const source = readFileSync(new URL(modulePath, import.meta.url), 'utf8');
    expect(source).not.toMatch(/refreshConnectedProviderModels/);
    expect(source).not.toMatch(/from\s+['"][^'"]*providerModelCatalog['"]/);
  });
});
