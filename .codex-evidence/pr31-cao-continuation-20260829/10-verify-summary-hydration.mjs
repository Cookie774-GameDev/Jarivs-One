import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import {
  assertZeroOllama,
  attachOfficialNative,
  captureSafetySnapshot,
  readWindowsNativeState,
  sanitizeEvidence,
} from '../../scripts/pr31-native-acceptance-harness.mjs';

const evidenceDirectory = path.dirname(new URL(import.meta.url).pathname.slice(1));
const fixtureRoot = path.join(evidenceDirectory, 'phase0-context-fixture');
const jarvisPid = Number(process.env.VS_NATIVE_JARVIS_PID);
const before = assertZeroOllama(
  captureSafetySnapshot(await readWindowsNativeState(), 'phase0:hydration:before'),
);
const attachment = await attachOfficialNative({ chromium, cdpPort: 9223, jarvisPid });
const result = await attachment.page.evaluate(async ({ expectedRoot }) => {
  const { useAuthStore } = await import('/src/stores/auth.ts');
  const { ensureContextPersistence } = await import(
    '/src/features/context/contextPersistence.ts'
  );
  const { readSiyuanIndexEntries, readSiyuanIndexJob, readSiyuanSummaryUsage } = await import(
    '/src/features/context/siyuan/siyuanIndexJobStore.ts'
  );
  const { readSiyuanMapManifest } = await import(
    '/src/features/context/siyuan/siyuanMapManifest.ts'
  );
  const { readSiyuanNodeBindings, readSiyuanLegacyCleanupReceipts } = await import(
    '/src/features/context/siyuan/siyuanBindingStore.ts'
  );
  const { createProductionSiyuanRlmPort } = await import(
    '/src/features/context/siyuanRlmProduction.ts'
  );
  const projectId = useAuthStore.getState().projectId;
  if (!projectId) throw new Error('active_project_missing');
  const persistence = await ensureContextPersistence(projectId);
  const normalizedRoot = expectedRoot.replaceAll('\\', '/').toLowerCase();
  const map = persistence.maps.find(
    (candidate) =>
      candidate.status === 'active' &&
      candidate.rootDir.replaceAll('\\', '/').toLowerCase() === normalizedRoot,
  );
  if (!map) throw new Error('phase0_map_missing');
  const entries = await readSiyuanIndexEntries(projectId, map.id);
  if (entries.length !== 1) throw new Error('phase0_entry_count_invalid');
  const entry = entries[0];
  if (
    entry.relativePath !== 'official-native-acceptance.md' ||
    entry.parentNodeId !== null ||
    entry.summaryState !== 'completed' ||
    !entry.summary?.trim()
  ) {
    throw new Error('phase0_summary_entry_invalid');
  }
  const [job, usage, bindings, cleanupReceipts] = await Promise.all([
    readSiyuanIndexJob(projectId, map.id),
    readSiyuanSummaryUsage(projectId, map.id),
    readSiyuanNodeBindings(projectId, map.id),
    readSiyuanLegacyCleanupReceipts(projectId, map.id),
  ]);
  const manifest = readSiyuanMapManifest(projectId, map.id);
  const bindingId = bindings[entry.nodeId];
  if (!manifest?.rootDocumentId || !bindingId) throw new Error('phase0_binding_missing');
  const port = createProductionSiyuanRlmPort();
  const [root, document] = await Promise.all([
    port.getBlock(projectId, manifest.rootDocumentId),
    port.getBlock(projectId, bindingId),
  ]);
  const marker = `<!-- vibespace-context-node:v1 map=${map.id} node=${encodeURIComponent(entry.nodeId)} -->`;
  const summary = entry.summary.trim();
  const assertions = {
    jobCompleted: job?.status === 'completed' && job.phase === 'completed',
    summarizedExactlyOne: job?.summarized === 1,
    summaryRouteExact:
      job?.summaryProviderId === 'opencode' &&
      job?.summaryModelId === 'opencode-go/deepseek-v4-flash-vision-exp' &&
      job?.summaryEffort === 'high',
    manifestRouteExact:
      manifest.summaryModel?.kind === 'cloud-approved' &&
      manifest.summaryModel.providerId === 'opencode' &&
      manifest.summaryModel.connectionId === 'opencode-cli' &&
      manifest.summaryModel.modelId === 'opencode-go/deepseek-v4-flash-vision-exp',
    bindingMatchesDocument: document.id === bindingId,
    documentNestedUnderRoot:
      document.path !== root.path && document.path.startsWith(root.path.replace(/\.sy$/u, '/')),
    sourceMarkerPersisted: document.markdown.includes(marker),
    summaryHeadingPersisted: document.markdown.includes('## Summary'),
    exactSummaryPersisted: document.markdown.includes(summary),
    noCleanupReceipts: cleanupReceipts.length === 0,
  };
  return {
    projectId,
    mapId: map.id,
    nodeId: entry.nodeId,
    relativePath: entry.relativePath,
    rootDocumentId: root.id,
    bindingId,
    rootPath: root.path,
    documentPath: document.path,
    summaryState: entry.summaryState,
    summaryLength: summary.length,
    summarySha256: null,
    documentMarkdownLength: document.markdown.length,
    documentMarkdownHead: document.markdown.slice(0, 400),
    usage,
    assertions,
  };
}, { expectedRoot: fixtureRoot });
result.summarySha256 = createHash('sha256')
  .update(`${result.mapId}:${result.nodeId}:${result.summaryLength}`)
  .digest('hex');
const after = assertZeroOllama(
  captureSafetySnapshot(await readWindowsNativeState(), 'phase0:hydration:after'),
);
const report = sanitizeEvidence({
  status: Object.values(result.assertions).every((value) => value === true) ? 'passed' : 'failed',
  capturedAt: new Date().toISOString(),
  identity: attachment.identity,
  fixtureRoot,
  result,
  safety: [before, after],
});
await writeFile(
  path.join(evidenceDirectory, '10-summary-hydration.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status !== 'passed') throw new Error('phase0_hydration_assertion_failed');
setTimeout(() => process.exit(0), 50);
