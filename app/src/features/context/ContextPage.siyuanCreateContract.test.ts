import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'ContextPage.tsx'), 'utf8');

describe('ContextPage SiYuan creation contract', () => {
  it('creates native maps without a provider credential gate or legacy source writer', () => {
    expect(source).toContain('createSiyuanMetadataSeed(projectId, rootDir)');
    expect(source).not.toContain('generateProjectContextTree({');
    expect(source).not.toContain('Provider key missing');
    expect(source).not.toContain('Map model provider');
  });

  it('prewarms SiYuan and projects every created local or GitHub map', () => {
    expect(source).toContain('productionSiyuanContextMaps.prewarm(projectId)');
    expect(source).toContain('productionSiyuanContextMaps.sync(projectId, persistedMap, {');
    expect(source).toContain('productionSiyuanContextMaps.sync(projectId, generatedMap, {');
    expect(source).toContain("useState<SiyuanSummaryMode>('selected')");
    expect(source).toMatch(/cloud use always asks before sending\s+anything/u);
    expect(source).not.toContain('complete allowed folder structure is indexed');
    expect(source).toContain('onPause={() =>');
    expect(source).toContain('onResume={() =>');
    expect(source).toContain('updateSiyuanIndexJobStatus(');
    expect(source).toContain("abort('user_cancelled')");
    expect(source).toContain('Review privacy and exclusions');
    expect(source).toContain('Additional excluded paths');
    expect(source).toContain('expectedUpdatedAt: persistedMap.updatedAt');
    expect(source).toContain('items indexed with SiYuan');
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
    expect(source).toContain('<SiyuanVaultSurface');
    expect(source).toContain('mapId={selectedMap.id}');
    expect(source).toContain('Back to Context Maps');
    expect(source).toContain('Official SiYuan map · source files stay read-only');
    expect(source).toContain('onExitFocus={closeFocusedMap}');
    expect(source).not.toContain('Open vault');
  });

  it('shows an accessible reduced-motion-safe animation while a Context Map is working', () => {
    expect(source).toContain('data-testid="siyuan-working-animation"');
    expect(source).toContain('aria-label="SiYuan map creation progress"');
    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain('motion-reduce:animate-none');
    expect(source).toContain('aria-valuenow={exactPercent === null ? undefined');
    expect(source).toContain("? 'Estimating time…'");
    expect(source).toContain("'Approximately '");
  });

  it('offers an explicit safe restart only for terminal failed or cancelled jobs', () => {
    expect(source).toContain("job.status === 'failed' || job.status === 'cancelled'");
    expect(source).toContain('Restart safely');
    expect(source).toContain('createSiyuanIndexJob({');
    expect(source).toContain('await archiveAndReplaceSiyuanIndexJob(restarted');
    expect(source).toContain('existing managed SiYuan nodes will be reused');
  });
});
