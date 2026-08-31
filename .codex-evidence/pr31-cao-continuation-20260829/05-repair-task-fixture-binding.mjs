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
const expectedRoot = path.join(evidenceDirectory, 'phase0-context-fixture');
const expectedNodeId = 'path:official-native-acceptance.md';
const jarvisPid = Number(process.env.VS_NATIVE_JARVIS_PID);
const attachment = await attachOfficialNative({ chromium, cdpPort: 9223, jarvisPid });
const page = attachment.page;
page.setDefaultTimeout(20_000);

const report = {
  status: 'failed',
  identity: attachment.identity,
  expectedRoot,
  expectedNodeId,
  beforeSafety: assertZeroOllama(
    captureSafetySnapshot(await readWindowsNativeState(), 'binding-repair:before'),
  ),
  repair: null,
  afterSafety: null,
  failure: null,
};

try {
  report.repair = await page.evaluate(
    async ({ root, nodeId }) => {
      const { useAuthStore } = await import('/src/stores/auth.ts');
      const { resolveAccountIdentity } = await import('/src/lib/accountIdentity.ts');
      const { ensureContextPersistence } = await import(
        '/src/features/context/contextPersistence.ts'
      );
      const { productionSiyuanContextMaps } = await import(
        '/src/features/context/siyuanContextMapIntegration.ts'
      );
      const {
        deleteSiyuanNodeBindings,
        readSiyuanNodeBindings,
      } = await import('/src/features/context/siyuan/siyuanBindingStore.ts');
      const {
        readSiyuanIndexEntries,
        readSiyuanIndexJob,
        updateSiyuanIndexJobStatus,
      } = await import('/src/features/context/siyuan/siyuanIndexJobStore.ts');
      const { createDurableSiyuanIndexJobControl } = await import(
        '/src/features/context/siyuan/siyuanSafeIndex.ts'
      );
      const { readSiyuanMapManifest } = await import(
        '/src/features/context/siyuan/siyuanMapManifest.ts'
      );
      const auth = useAuthStore.getState();
      const projectId = auth.projectId;
      if (!projectId) throw new Error('active_project_missing');
      const accountId = resolveAccountIdentity(auth)?.accountId ?? null;
      const normalizedRoot = root.replaceAll('\\', '/').toLowerCase();
      const persistence = await ensureContextPersistence(projectId);
      const map = [...persistence.maps]
        .reverse()
        .find(
          (candidate) =>
            candidate.status === 'active' &&
            candidate.rootDir.replaceAll('\\', '/').toLowerCase() === normalizedRoot,
        );
      if (!map) throw new Error('phase0_map_missing');
      const entries = await readSiyuanIndexEntries(projectId, map.id);
      if (entries.length !== 1 || entries[0]?.nodeId !== nodeId || entries[0]?.parentNodeId !== null) {
        throw new Error('phase0_fixture_entry_authority_mismatch');
      }
      const beforeBindings = await readSiyuanNodeBindings(projectId, map.id);
      const bindingKeys = Object.keys(beforeBindings);
      if (bindingKeys.length !== 1 || bindingKeys[0] !== nodeId || !beforeBindings[nodeId]) {
        throw new Error('phase0_fixture_binding_authority_mismatch');
      }
      const staleBindingId = beforeBindings[nodeId];
      await deleteSiyuanNodeBindings(projectId, map.id, [nodeId]);
      const clearedBindings = await readSiyuanNodeBindings(projectId, map.id);
      if (Object.keys(clearedBindings).length !== 0) {
        throw new Error('phase0_fixture_binding_clear_failed');
      }
      const running = await updateSiyuanIndexJobStatus(projectId, map.id, 'running');
      if (!running) throw new Error('phase0_fixture_job_missing');
      let outcome = 'resolved';
      let reason = null;
      try {
        await productionSiyuanContextMaps.sync(projectId, map, {
          accountId,
          workspaceId: auth.workspaceId,
          approvalPreflight: true,
          control: createDurableSiyuanIndexJobControl(projectId, map.id),
        });
      } catch (error) {
        outcome = 'rejected';
        reason = error instanceof Error ? error.message : String(error);
        if (reason !== 'siyuan_cloud_summary_scope_ready') throw error;
      }
      const [job, afterBindings] = await Promise.all([
        readSiyuanIndexJob(projectId, map.id),
        readSiyuanNodeBindings(projectId, map.id),
      ]);
      const manifest = readSiyuanMapManifest(projectId, map.id);
      const replacementBindingId = afterBindings[nodeId] ?? null;
      if (
        outcome !== 'rejected' ||
        reason !== 'siyuan_cloud_summary_scope_ready' ||
        job?.status !== 'paused' ||
        job.phase !== 'summarizing' ||
        job.pauseReason !== 'cloud_approval_required' ||
        !replacementBindingId ||
        replacementBindingId === staleBindingId ||
        !manifest?.rootDocumentId
      ) {
        throw new Error('phase0_fixture_repair_contract_failed');
      }
      return {
        projectId,
        mapId: map.id,
        staleBindingId,
        replacementBindingId,
        rootDocumentId: manifest.rootDocumentId,
        outcome,
        reason,
        job: {
          status: job.status,
          phase: job.phase,
          pauseReason: job.pauseReason,
          indexed: job.indexed,
          createdNodes: job.createdNodes,
          summaryEligible: job.summaryEligible,
        },
      };
    },
    { root: expectedRoot, nodeId: expectedNodeId },
  );
  report.status = 'passed';
} catch (error) {
  report.failure = error instanceof Error ? `${error.name}:${error.message}` : String(error);
  process.exitCode = 1;
} finally {
  report.afterSafety = assertZeroOllama(
    captureSafetySnapshot(await readWindowsNativeState(), 'binding-repair:after'),
  );
  await writeFile(
    path.join(evidenceDirectory, '05-phase0-binding-repair.json'),
    `${JSON.stringify(sanitizeEvidence(report), null, 2)}\n`,
    'utf8',
  );
  process.stdout.write(`${JSON.stringify(report.repair ?? { failure: report.failure })}\n`);
  setTimeout(() => process.exit(process.exitCode ?? 0), 50);
}
