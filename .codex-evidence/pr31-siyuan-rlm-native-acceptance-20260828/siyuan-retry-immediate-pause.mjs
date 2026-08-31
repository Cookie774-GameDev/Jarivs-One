import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { attachOfficialNative } from '../../scripts/pr31-native-acceptance-harness.mjs';

const root = 'C:\\Users\\viper\\VibeSpace-UnifiedChungus-Final';
const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (head !== process.env.EXPECTED_HEAD) throw new Error(`immutable_head_mismatch:${process.env.EXPECTED_HEAD}:${head}`);
const out = resolve(root, '.codex-evidence/pr31-siyuan-rlm-native-acceptance-20260828', process.env.RUN_LABEL);
await mkdir(out, { recursive: true });
const report = { status: 'running', head, retryClicks: 0, pauseClicks: 0, observations: [], startedAt: new Date().toISOString() };
const attachment = await attachOfficialNative({ chromium, jarvisPid: Number(process.env.JARVIS_PID), cdpPort: 9223 });
try {
  const page = attachment.page;
  const read = () => page.evaluate(async () => {
    const [{ useAuthStore }, { listSiyuanIndexJobs }, { ensureContextPersistence }, { readSiyuanMapManifest }] = await Promise.all([
      import('/src/stores/auth.ts'), import('/src/features/context/siyuan/siyuanIndexJobStore.ts'), import('/src/features/context/contextPersistence.ts'), import('/src/features/context/siyuan/siyuanMapManifest.ts'),
    ]);
    const projectId = useAuthStore.getState().projectId;
    const jobs = projectId ? await listSiyuanIndexJobs(projectId) : [];
    const maps = projectId ? (await ensureContextPersistence(projectId)).maps : [];
    const active = new Set(maps.filter((map) => map.status === 'active').map((map) => map.id));
    const job = jobs.find((candidate) => active.has(candidate.mapId) && candidate.canonicalRoot.replaceAll('\\', '/').includes('vibespace-pr31-context-fixture')) ?? null;
    const other = jobs.filter((candidate) => !active.has(candidate.mapId) && candidate.canonicalRoot.replaceAll('\\', '/').includes('vibespace-pr31-context-fixture')).map((candidate) => ({ mapId: candidate.mapId, status: candidate.status, pauseReason: candidate.pauseReason, updatedAt: candidate.updatedAt, pending: candidate.pendingNativeNodeIds }));
    return job ? { ...job, _manifest: readSiyuanMapManifest(projectId, job.mapId), _other: other } : null;
  });
  if (new URL(page.url()).searchParams.get('route') !== 'context') {
    await page.getByRole('button', { name: 'Context', exact: true }).first().click();
    await page.waitForURL((url) => url.searchParams.get('route') === 'context');
  }
  report.before = await read();
  if (report.before?.status !== 'failed') throw new Error(`expected_active_failed:${report.before?.status}`);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  report.retryClicks = 1;
  await page.waitForFunction(async (mapId) => {
    const { useAuthStore } = await import('/src/stores/auth.ts');
    const { listSiyuanIndexJobs } = await import('/src/features/context/siyuan/siyuanIndexJobStore.ts');
    const projectId = useAuthStore.getState().projectId;
    return projectId ? (await listSiyuanIndexJobs(projectId)).some((job) => job.mapId === mapId && job.status === 'running') : false;
  }, report.before.mapId, { timeout: 30_000 });
  report.running = await read();
  if (report.running.startupDisposition !== null) throw new Error(`startup_disposition_not_cleared:${report.running.startupDisposition}`);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  report.pauseClicks = 1;
  await page.waitForFunction(async (mapId) => {
    const { useAuthStore } = await import('/src/stores/auth.ts');
    const { listSiyuanIndexJobs } = await import('/src/features/context/siyuan/siyuanIndexJobStore.ts');
    const projectId = useAuthStore.getState().projectId;
    return projectId ? (await listSiyuanIndexJobs(projectId)).some((job) => job.mapId === mapId && job.status === 'paused' && job.pauseReason === 'user') : false;
  }, report.before.mapId, { timeout: 30_000 });
  report.paused = await read();
  if (report.paused._manifest?.status !== 'paused') throw new Error(`manifest_not_paused:${report.paused._manifest?.status}`);
  if ((report.paused.pendingNativeNodeIds?.length ?? 0) !== 6) throw new Error(`pending_changed_on_pause:${report.paused.pendingNativeNodeIds?.length}`);
  if (JSON.stringify(report.paused._other) !== JSON.stringify(report.before._other)) throw new Error('recycled_duplicate_mutated');
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get('route') === 'chat');
  await page.getByRole('button', { name: 'Context', exact: true }).first().click();
  await page.waitForURL((url) => url.searchParams.get('route') === 'context');
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const current = await read();
    report.observations.push({ at: Date.now(), status: current?.status, pauseReason: current?.pauseReason, updatedAt: current?.updatedAt, pending: current?.pendingNativeNodeIds?.length });
    if (current?.status !== 'paused' || current?.pauseReason !== 'user') throw new Error(`pause_resurrected:${current?.status}:${current?.pauseReason}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  report.final = await read();
  if (report.final._manifest?.status !== 'paused') throw new Error(`manifest_not_stably_paused:${report.final._manifest?.status}`);
  if ((report.final.pendingNativeNodeIds?.length ?? 0) !== 6) throw new Error(`pending_changed_after_remount:${report.final.pendingNativeNodeIds?.length}`);
  if (JSON.stringify(report.final._other) !== JSON.stringify(report.before._other)) throw new Error('recycled_duplicate_mutated_after_remount');
  await page.screenshot({ path: resolve(out, '01-siyuan-durable-pause.png'), animations: 'disabled' });
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = String(error?.stack ?? error);
} finally {
  report.completedAt = new Date().toISOString();
  await writeFile(resolve(out, 'siyuan-retry-immediate-pause.json'), `${JSON.stringify(report, null, 2)}\n`);
  await attachment.browser.close();
}
if (report.status !== 'passed') process.exitCode = 1;
