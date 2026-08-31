import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';
import sharp from 'sharp';

import {
  assertZeroOllama,
  attachOfficialNative,
  captureSafetySnapshot,
  captureScreenshot,
  createEvidencePacket,
  createPageEventRecorder,
  finalizeEvidencePacket,
  recordAssertion,
  recordFirstFailure,
  waitForSemantic,
  writeEvidencePacket,
} from '../../scripts/pr31-native-acceptance-harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const RUN_DIR = resolve(HERE, process.env.RUN_LABEL ?? 'recovery-latest');
const EXPECTED_HEAD = process.env.EXPECTED_HEAD ?? '';
const JARVIS_PID = Number(process.env.JARVIS_PID ?? '');
const SOURCE = 'C:\\Users\\viper\\AppData\\Local\\Temp\\vibespace-pr31-context-fixture-20260827';
const git = (...args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim();

function must(packet, name, passed, details) {
  recordAssertion(packet, name, passed, details);
  if (!passed) throw new Error(`Assertion failed: ${name}`);
}

async function sourceDigest() {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  await walk(SOURCE);
  files.sort();
  const digest = createHash('sha256');
  const inventory = [];
  for (const path of files) {
    const bytes = await readFile(path);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    inventory.push({ path: relative(SOURCE, path).replaceAll('\\', '/'), bytes: bytes.length, sha256 });
    digest.update(inventory.at(-1).path).update('\0').update(bytes).update('\0');
  }
  return { root: SOURCE, fileCount: files.length, sha256: digest.digest('hex'), files: inventory };
}

async function state(page) {
  return page.evaluate(async () => {
    const { useAuthStore } = await import('/src/stores/auth.ts');
    const { ensureContextPersistence } = await import('/src/features/context/contextPersistence.ts');
    const { listSiyuanIndexJobs } = await import('/src/features/context/siyuan/siyuanIndexJobStore.ts');
    const { readSiyuanMapManifest } = await import('/src/features/context/siyuan/siyuanMapManifest.ts');
    const projectId = useAuthStore.getState().projectId;
    const maps = projectId ? (await ensureContextPersistence(projectId)).maps : [];
    const jobs = projectId ? await listSiyuanIndexJobs(projectId) : [];
    const activeIds = new Set(maps.filter((map) => map.status === 'active').map((map) => map.id));
    const fixtures = jobs.filter(
      (job) => activeIds.has(job.mapId) && job.canonicalRoot.replaceAll('\\', '/').includes('vibespace-pr31-context-fixture'),
    );
    const job = fixtures.length === 1 ? fixtures[0] : null;
    const map = job ? maps.find((candidate) => candidate.id === job.mapId) ?? null : null;
    const manifest = job && projectId ? readSiyuanMapManifest(projectId, job.mapId) : null;
    return {
      projectId,
      fixtureCount: fixtures.length,
      job,
      map: map ? { id: map.id, name: map.name, status: map.status, sourceType: map.sourceType } : null,
      manifest,
      body: document.body.innerText.replace(/\s+/gu, ' ').trim().slice(0, 12000),
    };
  });
}

let attachment;
let recorder;
let packet;
try {
  const head = git('rev-parse', 'HEAD');
  if (!EXPECTED_HEAD || head !== EXPECTED_HEAD) throw new Error(`immutable_head_mismatch:${EXPECTED_HEAD || 'missing'}:${head}`);
  if (!Number.isInteger(JARVIS_PID) || JARVIS_PID < 1) throw new Error('jarvis_pid_required');
  attachment = await attachOfficialNative({ chromium, jarvisPid: JARVIS_PID, cdpPort: 9223 });
  recorder = createPageEventRecorder(attachment.page, { limit: 400 });
  packet = createEvidencePacket({
    taskId: 'PR31-SIYUAN-PRESERVED-RECOVERY',
    captureHead: head,
    identity: attachment.identity,
    safety: attachment.safety,
    metadata: {
      expectedHead: EXPECTED_HEAD,
      binaryCommit: process.env.BINARY_COMMIT ?? 'unknown',
      excludedDirtyScope: 'all shared-checkout dirty files; scenario executes immutable native binary and reads frozen renderer state only',
      retryClicks: 0,
      modelDispatched: false,
      recycledMapMutated: false,
      productionMutated: false,
    },
  });
  const page = attachment.page;
  const sourceBefore = await sourceDigest();
  if (new URL(page.url()).searchParams.get('route') === 'workbench') {
    const hold = page.getByRole('button', { name: 'Hold to arm Workbench exit', exact: true });
    const box = await hold.boundingBox();
    if (!box) throw new Error('workbench_exit_control_unavailable');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.getByRole('button', { name: 'Confirm exit', exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Confirm exit', exact: true }).click();
    await page.waitForURL((url) => url.searchParams.get('route') !== 'workbench');
  }
  await page.getByText('Context', { exact: true }).first().click();
  const before = await state(page);
  must(packet, 'exactly one active deterministic fixture is preserved', before.fixtureCount === 1, before);
  must(packet, 'preserved checkpoint is the known failed 7 of 13 state', before.job?.status === 'failed' && before.job?.indexed === 13 && before.job?.createdNodes === 7, before.job);
  must(packet, 'exactly six definitely-uncommitted nodes remain pending', Array.isArray(before.job?.pendingNativeNodeIds) && before.job.pendingNativeNodeIds.length === 6, before.job?.pendingNativeNodeIds);

  const preservedMap = page.getByRole('button').filter({ hasText: before.map.name }).filter({ hasText: 'Active' }).first();
  await preservedMap.scrollIntoViewIfNeeded();
  await preservedMap.click();
  const retry = page.getByRole('button', { name: 'Retry', exact: true });
  await retry.waitFor({ state: 'visible', timeout: 30000 });
  await retry.click();
  packet.metadata.retryClicks = 1;

  const terminal = (
    await waitForSemantic({
      description: 'single preserved SiYuan recovery reaches terminal state',
      timeoutMs: 180000,
      intervalMs: 500,
      observe: () => state(page),
      accept: (value) =>
        (value.job?.status === 'ready' || value.job?.status === 'failed') &&
        value.job?.updatedAt !== before.job?.updatedAt,
    })
  ).value;
  const sourceAfter = await sourceDigest();
  must(packet, 'single lifecycle-repaired retry completes the preserved job', terminal.job?.status === 'ready', terminal.job);
  must(packet, 'recovery reaches 13 of 13 with no pending nodes', terminal.job?.indexed === 13 && terminal.job?.createdNodes === 13 && (terminal.job?.pendingNativeNodeIds?.length ?? 0) === 0, terminal.job);
  must(packet, 'manifest is ready and bound to the recovered map', terminal.manifest?.status === 'ready' && terminal.manifest?.mapId === terminal.map?.id, terminal.manifest);
  must(packet, 'source fixture is byte-identical after recovery', sourceAfter.sha256 === sourceBefore.sha256, { sourceBefore, sourceAfter });

  const mapButton = page.getByRole('button', { name: new RegExp(terminal.map.name, 'i') }).first();
  await mapButton.click();
  await page.getByRole('region', { name: 'SiYuan Context Vault' }).waitFor({ state: 'visible', timeout: 30000 });
  const artifact = await captureScreenshot({ page, evidenceDirectory: RUN_DIR, name: '01-siyuan-recovery-ready.png', imageMetadata: (buffer) => sharp(buffer).metadata() });
  packet.artifacts.push({ ...artifact, semanticState: terminal });
  packet.metadata.states = { before, terminal, sourceBefore, sourceAfter };
} catch (error) {
  if (!packet) packet = createEvidencePacket({ taskId: 'PR31-SIYUAN-PRESERVED-RECOVERY', captureHead: git('rev-parse', 'HEAD') });
  recordFirstFailure(packet, error, 'siyuan_preserved_recovery');
  if (attachment?.page) {
    try {
      const artifact = await captureScreenshot({ page: attachment.page, evidenceDirectory: RUN_DIR, name: 'FAIL-siyuan-preserved-recovery.png', imageMetadata: (buffer) => sharp(buffer).metadata() });
      packet.artifacts.push(artifact);
    } catch {}
  }
} finally {
  if (packet) {
    const finalSafety = await captureSafetySnapshot();
    assertZeroOllama(finalSafety, 'siyuan preserved recovery final');
    finalizeEvidencePacket(packet, { recorder, finalSafety });
    await writeEvidencePacket({ packet, evidenceDirectory: RUN_DIR, fileName: 'siyuan-preserved-recovery.json' });
  }
  if (attachment?.browser) await attachment.browser.close();
}

if (packet?.status !== 'passed') process.exitCode = 1;
