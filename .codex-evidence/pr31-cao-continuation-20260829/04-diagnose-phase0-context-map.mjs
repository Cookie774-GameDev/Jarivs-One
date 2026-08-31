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
const jarvisPid = Number(process.env.VS_NATIVE_JARVIS_PID);
const attachment = await attachOfficialNative({ chromium, cdpPort: 9223, jarvisPid });
const page = attachment.page;
page.setDefaultTimeout(20_000);

const report = {
  status: 'failed',
  identity: attachment.identity,
  expectedRoot,
  beforeSafety: assertZeroOllama(
    captureSafetySnapshot(await readWindowsNativeState(), 'direct-retry:before'),
  ),
  result: null,
  afterSafety: null,
  failure: null,
};

try {
  report.result = await page.evaluate(async ({ root }) => {
    const { useAuthStore } = await import('/src/stores/auth.ts');
    const { resolveAccountIdentity } = await import('/src/lib/accountIdentity.ts');
    const { ensureContextPersistence } = await import(
      '/src/features/context/contextPersistence.ts'
    );
    const { productionSiyuanContextMaps } = await import(
      '/src/features/context/siyuanContextMapIntegration.ts'
    );
    const {
      readSiyuanIndexJob,
      updateSiyuanIndexJobStatus,
    } = await import('/src/features/context/siyuan/siyuanIndexJobStore.ts');
    const { createDurableSiyuanIndexJobControl } = await import(
      '/src/features/context/siyuan/siyuanSafeIndex.ts'
    );
    const auth = useAuthStore.getState();
    const projectId = auth.projectId;
    if (!projectId) throw new Error('active_project_missing');
    const accountId = resolveAccountIdentity(auth)?.accountId ?? null;
    const persistence = await ensureContextPersistence(projectId);
    const normalizedRoot = root.replaceAll('\\', '/').toLowerCase();
    const map = [...persistence.maps]
      .reverse()
      .find(
        (candidate) =>
          candidate.status === 'active' &&
          candidate.rootDir.replaceAll('\\', '/').toLowerCase() === normalizedRoot,
      );
    if (!map) throw new Error('phase0_map_missing');
    const started = await updateSiyuanIndexJobStatus(projectId, map.id, 'running');
    if (!started) throw new Error('phase0_job_missing');
    try {
      const snapshot = await productionSiyuanContextMaps.sync(projectId, map, {
        accountId,
        workspaceId: auth.workspaceId,
        control: createDurableSiyuanIndexJobControl(projectId, map.id),
      });
      return {
        outcome: 'resolved',
        mapId: map.id,
        manifest: snapshot.manifest,
        job: await readSiyuanIndexJob(projectId, map.id),
      };
    } catch (reason) {
      const objectReason = reason !== null && typeof reason === 'object';
      return {
        outcome: 'rejected',
        mapId: map.id,
        reasonType: reason === null ? 'null' : typeof reason,
        reasonTag: objectReason ? Object.prototype.toString.call(reason) : null,
        reasonConstructor: objectReason ? reason.constructor?.name ?? null : null,
        reasonKeys: objectReason ? Object.getOwnPropertyNames(reason) : [],
        reasonMessage:
          objectReason && 'message' in reason ? String(reason.message) : String(reason),
        reasonName: objectReason && 'name' in reason ? String(reason.name) : null,
        reasonCode: objectReason && 'code' in reason ? String(reason.code) : null,
        reasonStack: objectReason && 'stack' in reason ? String(reason.stack).slice(0, 4_000) : null,
        job: await readSiyuanIndexJob(projectId, map.id),
      };
    }
  }, { root: expectedRoot });
  if (report.result?.outcome !== 'rejected') report.status = 'passed';
} catch (error) {
  report.failure = error instanceof Error ? `${error.name}:${error.message}` : String(error);
  process.exitCode = 1;
} finally {
  report.afterSafety = assertZeroOllama(
    captureSafetySnapshot(await readWindowsNativeState(), 'direct-retry:after'),
  );
  await writeFile(
    path.join(evidenceDirectory, '04-phase0-context-map-diagnostic.json'),
    `${JSON.stringify(sanitizeEvidence(report), null, 2)}\n`,
    'utf8',
  );
  process.stdout.write(`${JSON.stringify(report.result ?? { failure: report.failure })}\n`);
  if (report.result?.outcome === 'rejected') process.exitCode = 1;
  setTimeout(() => process.exit(process.exitCode ?? 0), 50);
}
