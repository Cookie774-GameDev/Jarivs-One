import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Composer plugin account scope', () => {
  it('derives the canonical account and selects only that account plugin map', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/features/chat/Composer.tsx'), 'utf8');

    expect(source).toContain('resolveAccountIdentity');
    expect(source).toContain('selectPluginConnectionsForAccount');
    expect(source).toMatch(/selectPluginConnectionsForAccount\(s,\s*pluginAccountId\)/);
    expect(source).not.toMatch(/pluginPickerActive\s*\?\s*s\.connections\b/);
  });
});
