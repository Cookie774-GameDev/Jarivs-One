import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Context Map focused user-testing repairs', () => {
  it('owns a keyboard-accessible scroll surface for the complete left panel', () => {
    const source = readFileSync(resolve('src/features/context/ContextPage.tsx'), 'utf8');

    expect(source).toContain('data-context-sidebar-scroll');
    expect(source).toContain('aria-label="Context Map navigation and sources"');
    expect(source).toContain('min-h-0 overflow-y-auto overscroll-y-contain');
  });

  it('opens a focused graph with top instructions and a compact inspector', () => {
    const source = readFileSync(resolve('src/features/context/ContextPage.tsx'), 'utf8');

    expect(source).toContain('data-context-focused-map');
    expect(source).toContain('Select a node to inspect details, links, and backlinks');
    expect(source).toContain('Esc closes focused view');
    expect(source).toContain('compact');
    expect(source).toContain('await selectMap(mapId)');
    expect(source).toContain(
      'canOpenPartialSiyuanSurface(record, manifest, durableJob, accountId)',
    );
    expect(source.indexOf('canOpenPartialSiyuanSurface(')).toBeLessThan(
      source.indexOf('productionSiyuanContextMaps.sync(', source.indexOf('openFocusedMap')),
    );
  });

  it('keeps every source picker in Context and places nightly maintenance after creation', () => {
    const source = readFileSync(resolve('src/features/context/ContextPage.tsx'), 'utf8');

    expect(source).toContain('chooseProjectFiles(false');
    expect(source).toContain("setWorkspaceSection('sources')");
    expect(source).not.toContain('<ContextRecoveryNotice');
    expect(source.indexOf('<ContextSourceCards')).toBeLessThan(
      source.indexOf('<NightlySecondBrainPanel'),
    );
    expect(source).toContain('Create map');
  });

  it('keeps an arbitrary Context source independent from the Files project root', () => {
    const source = readFileSync(resolve('src/features/context/ContextPage.tsx'), 'utf8');

    expect(source).toContain('getStoredContextSourceRoot(accountId, projectId)');
    expect(source).toContain('setStoredContextSourceRoot(accountId, projectId, rootDir)');
    expect(source).toContain('Context source folder');
    expect(source).not.toContain('getStoredProjectRoot');
    expect(source).not.toContain('setStoredProjectRoot');
  });

  it('populates the physical search index before presenting a new local map as ready', () => {
    const source = readFileSync(resolve('src/features/context/ContextPage.tsx'), 'utf8');
    const saveIndex = source.indexOf('const persisted = await savePersistedContextTree(generated)');
    const populateIndex = source.indexOf(
      'await contextSearchIndexPopulation.populateCreatedMap(',
      saveIndex,
    );
    const applyIndex = source.indexOf(
      'if (!applyPersistenceState(completedPersistence)) return',
      saveIndex,
    );
    const readyIndex = source.indexOf("toast.success('Context map ready'", saveIndex);

    expect(source).toContain(
      "import { createContextSearchIndexPopulationPort } from './contextSearchIndexing';",
    );
    expect(saveIndex).toBeGreaterThan(-1);
    expect(populateIndex).toBeGreaterThan(saveIndex);
    expect(applyIndex).toBeGreaterThan(populateIndex);
    expect(readyIndex).toBeGreaterThan(applyIndex);
    expect(source).toContain(
      'await deletePersistedContextMap(projectId, persistedMap.id).catch(() => undefined)',
    );
  });

  it('shows a warm three-step first-project tutorial without replacing Context systems', () => {
    const source = readFileSync(resolve('src/features/context/ContextPage.tsx'), 'utf8');

    expect(source).toContain('aria-label="Create your first Context project"');
    expect(source).toContain('Create or choose a project');
    expect(source).toContain('Choose what Jarvis should learn');
    expect(source).toContain('Create the map');
    expect(source).toContain('The real Context Map, RLM, and SiYuan systems stay connected.');
    expect(source).toContain('Existing files are not changed.');
  });

  it('keeps durable indexing progress visible on each active Context Map row', () => {
    const source = readFileSync(resolve('src/features/context/ContextPage.tsx'), 'utf8');

    expect(source).toContain('aria-label={`Index progress for ${map.name}`}');
    expect(source).toContain('visibleFileCount.toLocaleString()');
    expect(source).toContain(
      '`≈ ${compactRounded}% · ${compactEta} · ${job.createdNodes.toLocaleString()} nodes`',
    );
    expect(source).toContain('siyuanOverallProgressPercent(job)');
    expect(source).toContain('formatSiyuanJobEta(job)');
    expect(source).toContain('role="progressbar"');
    expect(source).toContain('data-siyuan-focused-progress');
    expect(source).toContain(
      '`Summarizing ${indexJobSnapshot.summarized.toLocaleString()} / ${indexJobSnapshot.summaryEligible.toLocaleString()}`',
    );
    expect(source).toContain("? 'Discovering allowed files and folders'");
    expect(source).toContain("? 'Reconciling and finalizing'");
    expect(source).toContain('{focusedProgressLabel}');
  });

  it('keeps a durable SiYuan job running when the user leaves Context', () => {
    const source = readFileSync(resolve('src/features/context/ContextPage.tsx'), 'utf8');

    expect(source).not.toContain("abort('context_unmounted')");
    expect(source).not.toContain("abort('context_map_unmounted')");
    expect(source).toContain('The durable job intentionally outlives this page');
    const selectedMapEffect = source.indexOf(
      "setStatus('Reading this Context Map from SiYuan...')",
    );
    const terminalStatusGuard = source.indexOf(
      "['paused', 'cancelled', 'failed']",
      selectedMapEffect,
    );
    const authorityCheck = source.indexOf('hasSiyuanMapJobAuthority(', selectedMapEffect);
    const sync = source.indexOf('productionSiyuanContextMaps.sync(', selectedMapEffect);
    expect(authorityCheck).toBeGreaterThan(selectedMapEffect);
    expect(terminalStatusGuard).toBeLessThan(authorityCheck);
    expect(authorityCheck).toBeLessThan(sync);
    expect(source).toContain("durableJob.status === 'running'");
  });

  it('requires explicit exact-route cloud approval with recomputed scope disclosure', () => {
    const source = readFileSync(resolve('src/features/context/ContextPage.tsx'), 'utf8');

    expect(source).toContain('Approve cloud summaries');
    expect(source).toContain('Privacy warning: approved file samples leave this device');
    expect(source).toContain('No provider or model substitution is allowed.');
    expect(source).toContain('computeSiyuanCloudSummaryScope(');
    expect(source).toContain('summaryPolicyFingerprint: job.policyFingerprint');
    expect(source).toContain('archiveAndRestartSiyuanSummaryJobForCloud(');
    expect(source).toContain('cloudApprovalPendingRef.current');
    expect(source).toContain('disabled={cloudApprovalPending}');
    expect(source).toContain('Cloud approval was saved safely, but resume needs review.');
  });
});
