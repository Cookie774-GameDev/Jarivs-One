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
const injectedMissingId = '20260830003159-stale01';
const jarvisPid = Number(process.env.VS_NATIVE_JARVIS_PID);
const attachment = await attachOfficialNative({ chromium, cdpPort: 9223, jarvisPid });
const page = attachment.page;
page.setDefaultTimeout(30_000);

const report = {
  status: 'failed',
  identity: attachment.identity,
  expectedRoot,
  expectedNodeId,
  injectedMissingId,
  safety: [],
  recovery: null,
  failure: null,
};

try {
  report.safety.push(
    assertZeroOllama(captureSafetySnapshot(await readWindowsNativeState(), 'recovery:before')),
  );
  const recoveryPromise = page.evaluate(
    async ({ root, nodeId, missingId }) => {
      const { useAuthStore } = await import('/src/stores/auth.ts');
      const { resolveAccountIdentity } = await import('/src/lib/accountIdentity.ts');
      const { ensureContextPersistence } = await import(
        '/src/features/context/contextPersistence.ts'
      );
      const { productionSiyuanContextMaps } = await import(
        '/src/features/context/siyuanContextMapIntegration.ts'
      );
      const {
        readSiyuanNodeBindings,
        writeSiyuanNodeBindings,
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
      const { createProductionSiyuanRlmPort } = await import(
        '/src/features/context/siyuanRlmProduction.ts'
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
      const manifest = readSiyuanMapManifest(projectId, map.id);
      if (!manifest?.rootDocumentId) throw new Error('phase0_manifest_root_missing');
      const beforeBindings = await readSiyuanNodeBindings(projectId, map.id);
      const originalBindingId = beforeBindings[nodeId];
      if (!originalBindingId || Object.keys(beforeBindings).length !== 1) {
        throw new Error('phase0_fixture_binding_authority_mismatch');
      }

      // Inject one exact missing-ID condition into the task-created fixture.
      // Product sync must classify, detach, and recover it; this harness never
      // deletes the binding or calls a lower-level repair path.
      await writeSiyuanNodeBindings(projectId, map.id, { [nodeId]: missingId });
      const injectedBindings = await readSiyuanNodeBindings(projectId, map.id);
      if (injectedBindings[nodeId] !== missingId) {
        throw new Error('phase0_missing_binding_injection_failed');
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
      const replacementBindingId = afterBindings[nodeId] ?? null;
      if (
        !replacementBindingId ||
        replacementBindingId === missingId ||
        Object.keys(afterBindings).length !== 1
      ) {
        throw new Error('phase0_product_recovery_binding_failed');
      }
      const replacement = await createProductionSiyuanRlmPort().getBlock(
        projectId,
        replacementBindingId,
      );
      const rootDocument = await createProductionSiyuanRlmPort().getBlock(
        projectId,
        manifest.rootDocumentId,
      );
      if (
        replacement.id !== replacementBindingId ||
        replacement.path === rootDocument.path ||
        replacement.notebookId !== rootDocument.notebookId ||
        !replacement.markdown.includes(
          'vibespace-context-node:v1 map=' + map.id + ' node=' + encodeURIComponent(nodeId),
        )
      ) {
        throw new Error('phase0_product_recovery_authority_failed');
      }
      return {
        projectId,
        mapId: map.id,
        rootDocumentId: manifest.rootDocumentId,
        originalBindingId,
        injectedMissingId: missingId,
        replacementBindingId,
        replacementPath: replacement.path,
        rootPath: rootDocument.path,
        outcome,
        reason,
        job: job
          ? {
              status: job.status,
              phase: job.phase,
              pauseReason: job.pauseReason,
              indexed: job.indexed,
              createdNodes: job.createdNodes,
              failed: job.failed,
            }
          : null,
      };
    },
    { root: expectedRoot, nodeId: expectedNodeId, missingId: injectedMissingId },
  );
  await new Promise((resolve) => setTimeout(resolve, 250));
  report.safety.push(
    assertZeroOllama(captureSafetySnapshot(await readWindowsNativeState(), 'recovery:during')),
  );
  report.recovery = await recoveryPromise;
  report.safety.push(
    assertZeroOllama(captureSafetySnapshot(await readWindowsNativeState(), 'recovery:after')),
  );
  report.status = 'passed';
} catch (error) {
  report.failure = error instanceof Error ? `${error.name}:${error.message}` : String(error);
  process.exitCode = 1;
} finally {
  await writeFile(
    path.join(evidenceDirectory, '08-product-stale-binding-recovery.json'),
    `${JSON.stringify(sanitizeEvidence(report), null, 2)}\n`,
    'utf8',
  );
  process.stdout.write(`${JSON.stringify(report.recovery ?? { failure: report.failure })}\n`);
  setTimeout(() => process.exit(process.exitCode ?? 0), 50);
}
