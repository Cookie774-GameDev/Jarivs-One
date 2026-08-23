import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'ContextPage.tsx'), 'utf8');

describe('ContextPage SiYuan creation contract', () => {
  it('creates normal maps locally without a provider credential gate', () => {
    expect(source).toContain("provider: 'local'");
    expect(source).not.toContain('Provider key missing');
    expect(source).not.toContain('Map model provider');
  });

  it('prewarms SiYuan and projects every created local or GitHub map', () => {
    expect(source).toContain('productionSiyuanContextMaps.prewarm(projectId)');
    expect(
      source.match(/\.sync\(\s*projectId,\s*persistedMap\s*\)/g),
    ).toHaveLength(2);
  });

  it('opens a selected map through the official SiYuan vault surface', () => {
    expect(source).toMatch(/openFocusedMap[\s\S]*setVaultOpen\(true\)/);
    expect(source).toContain('<SiyuanVaultSurface projectId={projectId}');
  });
});
