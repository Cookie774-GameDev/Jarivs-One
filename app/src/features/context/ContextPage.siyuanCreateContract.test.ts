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
    expect(source).toContain('productionSiyuanContextMaps.sync(projectId, persistedMap)');
    expect(source).toContain('productionSiyuanContextMaps.sync(projectId, generatedMap)');
  });

  it('preserves fresh local ingestion eligibility through RLM and SiYuan creation', () => {
    expect(source).toContain('const generatedMap = { ...persistedMap, tree: generated }');
    expect(source).toContain('persisted.accountId,\n          generatedMap,');
  });

  it('labels a bounded source preview honestly instead of claiming every source file was mapped', () => {
    expect(source).toContain(
      'const treeCoverageBounded = tree ? isContextTreeCoverageBounded(tree) : false',
    );
    expect(source).toContain('treeCoverageBounded');
    expect(source).toContain('Bounded preview');
  });

  it('opens an exact map as a dedicated official SiYuan page inside the Context route', () => {
    expect(source).toContain("import { SiyuanVaultSurface } from './siyuan/SiyuanVaultSurface'");
    expect(source).toContain('data-context-siyuan-map-page');
    expect(source).toContain('<SiyuanVaultSurface projectId={projectId}');
    expect(source).toContain('Back to Context Maps');
    expect(source).toContain('Official SiYuan map · source files stay read-only');
    expect(source).toContain('onExitFocus={closeFocusedMap}');
    expect(source).not.toContain('Open vault');
  });
});
