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
    expect(source).toContain('.pause(projectId, indexJobSnapshot.mapId)');
    expect(source).toContain("generationAbortRef.current?.abort('siyuan_index_paused')");
    expect(source).toContain("setStatus('Pausing the SiYuan index safely…')");
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
    expect(source).toContain('label="SiYuan map creation progress"');
    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain('motion-reduce:animate-none');
    expect(source).toContain('progress={exactPercent}');
    expect(source).toContain("paused={job.status !== 'running'}");
    expect(source).toContain("estimated={job.phase !== 'completed'}");
    expect(source).toContain('data-testid="siyuan-paused-timing"');
    expect(source).toContain('ETA ${eta} · elapsed ${elapsed}');
    expect(source).toContain("? 'Estimating time…'");
    expect(source).toContain("`${job.phase === 'completed' ? '' : '≈ '}");
  });

  it('offers an explicit safe restart only for terminal failed or cancelled jobs', () => {
    expect(source).toContain("job.status === 'failed' || job.status === 'cancelled'");
    expect(source).toContain('Restart safely');
    expect(source).toContain('createSiyuanIndexJob({');
    expect(source).toContain('await archiveAndReplaceSiyuanIndexJob(restarted');
    expect(source).toContain('existing managed SiYuan nodes will be reused');
  });

  it('resumes an approved identical cloud route without clearing completed summary work', () => {
    const sameRouteResume = source.indexOf(
      'const resumed = await resumeSiyuanSummaryJobWithSameCloudRoute(',
    );
    const destructiveArchive = source.indexOf(
      'const archive = await archiveSiyuanSummaryJobForCloudRestart(',
      sameRouteResume,
    );

    expect(source).toContain('const samePinnedRoute =');
    expect(source).toContain('Approved the same exact route. Resuming pending summaries');
    expect(sameRouteResume).toBeGreaterThan(-1);
    expect(destructiveArchive).toBeGreaterThan(sameRouteResume);
  });

  it('resumes persisted exact-route consent with a fresh clock and without rewriting approval', () => {
    const recoveryStart = source.indexOf(
      'const resumeApprovedCloudSummaries = React.useCallback(async () => {',
    );
    const recoveryEnd = source.indexOf(
      'const reconcileCloudSummaryScopeBeforeApproval = React.useCallback(',
      recoveryStart,
    );
    const recovery = source.slice(recoveryStart, recoveryEnd);

    expect(recoveryStart).toBeGreaterThan(-1);
    expect(recoveryEnd).toBeGreaterThan(recoveryStart);
    expect(source).toContain('Resume approved exact route');
    expect(source).toContain('Approve exact route and resume');
    expect(recovery).toContain('approvedCloudSiyuanSummaryIdentity({');
    expect(recovery).toContain('hasSiyuanMapJobAuthority(selectedMap, manifest, job, accountId)');
    expect(recovery).toContain('const resumedAt = Date.now();');
    expect(recovery).toContain('resumeSiyuanSummaryJobWithSameCloudRoute(');
    expect(recovery).toContain('exactApprovedIdentity,\n      resumedAt,');
    expect(recovery).not.toContain('updateSiyuanMapManifest(');
    expect(recovery).not.toContain('writeSiyuanMapManifest(');
    expect(recovery).not.toContain('cloudSummaryApproval:');
    expect(recovery).not.toContain('approvedAt');
    expect(recovery).not.toContain('archiveSiyuanSummaryJobForCloudRestart');
    expect(recovery).not.toContain('archiveAndRestartSiyuanSummaryJobForCloud');
    expect(recovery).not.toContain('resetSiyuanSummaryEntry');
    expect(recovery).not.toContain('updateSiyuanIndexJobStatus(');

    const approvalStart = source.indexOf(
      'const approveCloudSummaries = React.useCallback(async () => {',
    );
    const approvedAt = source.indexOf('const approvedAt = Date.now();', approvalStart);
    const approvalBeforeWrite = source.slice(approvalStart, approvedAt);
    const validator = approvalBeforeWrite.indexOf('approvedCloudSiyuanSummaryIdentity({');
    const resume = approvalBeforeWrite.indexOf('await resumeApprovedCloudSummaries();');
    expect(approvedAt).toBeGreaterThan(approvalStart);
    expect(validator).toBeGreaterThan(-1);
    expect(resume).toBeGreaterThan(validator);
    expect(approvalBeforeWrite).toContain('const persistedApprovalMatchesSelectedRoute =');
    expect(approvalBeforeWrite).toContain('approvedCloudSiyuanSummaryIdentity({');
    expect(approvalBeforeWrite).toContain('await resumeApprovedCloudSummaries();');
    expect(approvalBeforeWrite).toContain(
      "error.message !== 'siyuan_cloud_summary_approval_scope_drift'",
    );
  });

  it('discloses and approves only remaining persisted summary work', () => {
    expect(source).not.toMatch(
      /computeSiyuanCloudSummaryScope\(\s*entries\.map\(resetSiyuanSummaryEntry\)/gu,
    );
    expect(source.match(/computeSiyuanCloudSummaryScope\(\s*entries,/gu)).toHaveLength(3);
  });

  it('reconciles durable entries before persisting a fresh cloud approval', () => {
    const approvalStart = source.indexOf(
      'const approveCloudSummaries = React.useCallback(async () => {',
    );
    const approvalEnd = source.indexOf(
      'const refreshCloudSummaryScope = React.useCallback(async () => {',
      approvalStart,
    );
    const approval = source.slice(approvalStart, approvalEnd);
    const preflight = approval.indexOf('await reconcileCloudSummaryScopeBeforeApproval(');
    const approvalWrite = approval.indexOf('const approvedAt = Date.now();');

    expect(preflight).toBeGreaterThan(-1);
    expect(approvalWrite).toBeGreaterThan(preflight);
    expect(approval).toContain('if (!reconciledApprovalScope) return;');
    expect(approval).toContain('const { job, entries, manifest } = reconciledApprovalScope;');
    expect(source).toContain('assertSiyuanCloudApprovalPreflightReady(job, controller.signal);');
  });

  it('refreshes changed file membership without approving or dispatching summaries', () => {
    const refreshStart = source.indexOf(
      'const refreshCloudSummaryScope = React.useCallback(async () => {',
    );
    const effectStart = source.indexOf('React.useEffect(() => {', refreshStart);
    const refresh = source.slice(refreshStart, effectStart);
    expect(source).toContain('Refresh file scope');
    expect(source).toContain("job.phase === 'creating_nodes'");
    expect(source).toContain("!['creating_nodes', 'summarizing'].includes(job.phase)");
    expect(refreshStart).toBeGreaterThan(-1);
    expect(refresh).toContain('hasSiyuanMapJobAuthority(selectedMap, manifest, job, accountId)');
    expect(refresh).toContain("!['creating_nodes', 'summarizing'].includes(job.phase)");
    expect(refresh).toContain('forceScopeReconcileRef.current = {');
    expect(refresh).toContain('mapId: selectedMap.id,');
    expect(refresh).toContain('requestId: crypto.randomUUID(),');
    expect(refresh).toContain('forceScopeReconcileRef.current) return;');
    expect(refresh).not.toContain('updateSiyuanMapManifest(');
    expect(refresh).not.toContain('writeSiyuanMapManifest(');
    expect(refresh).not.toContain('resumeSiyuanSummaryJobWithSameCloudRoute(');
    expect(source).toContain('refreshIntent.projectId === projectId');
    expect(source).toContain('refreshIntent.mapId === selectedMap.id');
    expect(source).toContain("updateSiyuanIndexJobStatus(projectId, selectedMap.id, 'running')");
    expect(source).toContain("durableJob?.status === 'running'");
    expect(source).toContain("updateSiyuanIndexJobStatus(projectId, selectedMap.id, 'paused')");
    expect(source).toContain('const existing = forceReconcile');
    expect(source).toContain("throw new Error('siyuan_cloud_summary_scope_refresh_detached')");
    expect(source).toContain("throw new Error('siyuan_cloud_summary_scope_refresh_terminal')");
    expect(source).toContain("durableJob.status !== 'running'");
    expect(source).toContain('if (!forceReconcile || refreshIntentCleared)');
    expect(source).toContain('forceReconcile,');
  });
});
