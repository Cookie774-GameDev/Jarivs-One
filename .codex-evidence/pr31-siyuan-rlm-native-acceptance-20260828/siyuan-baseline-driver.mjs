import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
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
  readWindowsNativeState,
  recordAssertion,
  recordFirstFailure,
  waitForSemantic,
  writeEvidencePacket,
} from '../../scripts/pr31-native-acceptance-harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const RUN_DIR = resolve(HERE, process.env.RUN_LABEL ?? 'latest');
const EXPECTED_HEAD = process.env.EXPECTED_HEAD ?? '';
const JARVIS_PID = Number(process.env.JARVIS_PID ?? '');
const git = (...args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim();

function must(packet, name, passed, details) {
  recordAssertion(packet, name, passed, details);
  if (!passed) throw new Error(`Assertion failed: ${name}`);
}

async function snapshot(page) {
  return page.evaluate(async () => {
    const { useAuthStore } = await import('/src/stores/auth.ts');
    const { ensureContextPersistence } = await import(
      '/src/features/context/contextPersistence.ts'
    );
    const { listSiyuanIndexJobs } = await import(
      '/src/features/context/siyuan/siyuanIndexJobStore.ts'
    );
    const { readSiyuanMapManifest } = await import(
      '/src/features/context/siyuan/siyuanMapManifest.ts'
    );
    const projectId = useAuthStore.getState().projectId;
    if (!projectId) throw new Error('active_project_missing');
    const maps = (await ensureContextPersistence(projectId)).maps;
    const jobs = await listSiyuanIndexJobs(projectId);
    const activeMapIds = new Set(
      maps.filter((candidate) => candidate.status === 'active').map((candidate) => candidate.id),
    );
    const fixtures = jobs.filter(
      (job) =>
        activeMapIds.has(job.mapId) &&
        job.canonicalRoot.replaceAll('\\', '/').includes('vibespace-pr31-context-fixture'),
    );
    const fixture = fixtures.length === 1 ? fixtures[0] : null;
    const map = fixture ? maps.find((candidate) => candidate.id === fixture.mapId) ?? null : null;
    const manifest = fixture ? readSiyuanMapManifest(projectId, fixture.mapId) : null;
    const route = new URL(location.href).searchParams.get('route');
    const body = document.body.innerText.replace(/\s+/gu, ' ').trim();
    const mapRows = [...document.querySelectorAll('section button')]
      .map((button) => button.textContent?.replace(/\s+/gu, ' ').trim() ?? '')
      .filter((text) => text.includes('indexed item') || text.includes('files'));
    const vault = document.querySelector('[aria-label="SiYuan Context Vault"]');
    return {
      projectId,
      route,
      fixtureCount: fixtures.length,
      fixture,
      map: map
        ? {
            id: map.id,
            name: map.name,
            rootDir: map.rootDir,
            status: map.status,
            sourceType: map.sourceType,
            treeFileCount: map.tree?.fileCount ?? null,
            treeNodeCount: Array.isArray(map.tree?.nodes) ? map.tree.nodes.length : null,
          }
        : null,
      manifest,
      mapRows,
      bodyHasIndexedItems: /\bindexed items?\b/iu.test(body),
      bodyHasMisleadingFilesCount: /\b\d[\d,]* files\b/iu.test(body),
      vaultVisible: Boolean(vault),
      vaultText: vault?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
    };
  });
}

async function capture(packet, page, name, state) {
  const artifact = await captureScreenshot({
    page,
    evidenceDirectory: RUN_DIR,
    name,
    imageMetadata: async (buffer) => sharp(buffer).metadata(),
  });
  packet.artifacts.push({ ...artifact, semanticState: state });
}

let attachment;
let recorder;
let packet;
try {
  const head = git('rev-parse', 'HEAD');
  if (!EXPECTED_HEAD || head !== EXPECTED_HEAD) {
    throw new Error(`immutable_head_mismatch:${EXPECTED_HEAD || 'missing'}:${head}`);
  }
  if (!Number.isInteger(JARVIS_PID) || JARVIS_PID < 1) throw new Error('jarvis_pid_required');
  attachment = await attachOfficialNative({ chromium, jarvisPid: JARVIS_PID, cdpPort: 9223 });
  recorder = createPageEventRecorder(attachment.page, { limit: 240 });
  packet = createEvidencePacket({
    taskId: 'PR31-SIYUAN-NATIVE-BASELINE',
    captureHead: head,
    identity: attachment.identity,
    safety: attachment.safety,
    metadata: {
      expectedHead: EXPECTED_HEAD,
      fixtureMutation: false,
      modelDispatched: false,
      credentialsMutated: false,
      productionMutated: false,
    },
  });
  const page = attachment.page;
  const projectFixture = await page.evaluate(async () => {
    const { useAuthStore } = await import('/src/stores/auth.ts');
    const auth = useAuthStore.getState();
    if (auth.projectId) return { created: false, projectId: auth.projectId };
    if (!auth.workspaceId) throw new Error('active_workspace_missing');
    const { projectRepo } = await import('/src/lib/db/index.ts');
    const project = await projectRepo.create({
      workspace_id: auth.workspaceId,
      name: 'PR31 Native SiYuan RLM Fixture',
      color_hue: 47,
    });
    useAuthStore.getState().setProjectId(project.id);
    const { setStoredContextSourceRoot } = await import(
      '/src/features/context/contextSourceRoot.ts'
    );
    setStoredContextSourceRoot(
      project.id,
      'C:\\Users\\viper\\AppData\\Local\\Temp\\vibespace-pr31-context-fixture-20260827',
    );
    return { created: true, projectId: project.id };
  });
  packet.metadata.projectFixture = projectFixture;
  await page.getByText('Context', { exact: true }).first().click();
  let initial = await snapshot(page);
  if (initial.fixtureCount > 1) {
    const recycle = page.getByRole('button', {
      name: /Move vibespace-pr31-context-fixture-20260827 Context Map to Recycling Bin/i,
    });
    await recycle.last().click();
    initial = (
      await waitForSemantic({
        description: 'one active deterministic fixture after Recycling Bin consolidation',
        timeoutMs: 30_000,
        intervalMs: 200,
        observe: () => snapshot(page),
        accept: (value) => value.fixtureCount === 1,
      })
    ).value;
  }
  if (initial.fixtureCount === 0) {
    const create = page.getByRole('button', { name: 'Create Context Map', exact: true });
    await create.waitFor({ state: 'visible', timeout: 30_000 });
    await create.click();
  }
  if (initial.fixtureCount === 1 && initial.fixture.status === 'failed') {
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    initial = (
      await waitForSemantic({
        description: 'failed SiYuan checkpoint enters bounded recovery',
        timeoutMs: 30_000,
        intervalMs: 200,
        observe: () => snapshot(page),
        accept: (value) => value.fixtureCount === 1 && value.fixture.status !== 'failed',
      })
    ).value;
  }
  const before = (
    await waitForSemantic({
      description: 'deterministic SiYuan fixture and indexed-item UI',
      timeoutMs: 120_000,
      intervalMs: 500,
      observe: () => snapshot(page),
      accept: (value) => value.fixtureCount === 1 && Boolean(value.map && value.manifest),
    })
  ).value;
  must(packet, 'exactly one deterministic project-scoped SiYuan fixture exists', before.fixtureCount === 1, before);
  must(
    packet,
    'Context map row reports indexed-item semantics instead of a misleading files count',
    before.bodyHasIndexedItems && !before.bodyHasMisleadingFilesCount,
    { mapRows: before.mapRows },
  );
  must(
    packet,
    'fixture remains bound to one project and one managed SiYuan root',
    before.fixture.projectId === before.projectId &&
      before.fixture.mapId === before.map.id &&
      before.manifest.mapId === before.map.id &&
      typeof before.manifest.rootDocumentId === 'string' &&
      before.manifest.rootDocumentId.length > 0,
    { projectId: before.projectId, fixture: before.fixture, map: before.map, manifest: before.manifest },
  );
  await capture(packet, page, '01-context-indexed-item-semantics.png', before);

  const mapButton = page.getByRole('button', { name: new RegExp(before.map.name, 'i') }).first();
  await mapButton.click();
  const vaultBeforeReload = (
    await waitForSemantic({
      description: 'official embedded SiYuan Context Vault',
      timeoutMs: 30_000,
      intervalMs: 250,
      observe: () => snapshot(page),
      accept: (value) => value.vaultVisible && value.vaultText.includes('Official SiYuan'),
    })
  ).value;
  must(
    packet,
    'official embedded SiYuan graph is visible and source files are declared read-only',
    vaultBeforeReload.vaultVisible &&
      vaultBeforeReload.vaultText.includes('project-scoped'),
    { vaultText: vaultBeforeReload.vaultText },
  );
  await capture(packet, page, '02-siyuan-vault-hierarchy.png', vaultBeforeReload);

  await page.reload({ waitUntil: 'domcontentloaded' });
  const afterReload = (
    await waitForSemantic({
      description: 'SiYuan vault survives official WebView reload',
      timeoutMs: 45_000,
      intervalMs: 250,
      observe: () => snapshot(page),
      accept: (value) => value.vaultVisible && value.map?.id === before.map.id,
    })
  ).value;
  must(
    packet,
    'reload preserves exact map, project, job checkpoint, and managed document binding',
    afterReload.projectId === before.projectId &&
      afterReload.fixture.mapId === before.fixture.mapId &&
      afterReload.fixture.cursor === before.fixture.cursor &&
      afterReload.fixture.indexed === before.fixture.indexed &&
      afterReload.manifest.rootDocumentId === before.manifest.rootDocumentId,
    { before, afterReload },
  );
  await capture(packet, page, '03-siyuan-vault-after-reload.png', afterReload);
  packet.metadata.states = { before, vaultBeforeReload, afterReload };
} catch (error) {
  if (!packet) packet = createEvidencePacket({ taskId: 'PR31-SIYUAN-NATIVE-BASELINE', captureHead: git('rev-parse', 'HEAD') });
  recordFirstFailure(packet, error, 'siyuan_native_baseline');
  if (attachment?.page) {
    await capture(packet, attachment.page, 'FAIL-siyuan-native-baseline.png', {
      firstFailure: packet.firstFailure,
    }).catch(() => undefined);
  }
} finally {
  if (attachment?.page) {
    await attachment.page.getByText('Chat', { exact: true }).first().click().catch(() => undefined);
  }
  recorder?.dispose();
  await attachment?.browser.close().catch(() => undefined);
  const afterSafety = captureSafetySnapshot(await readWindowsNativeState(), 'siyuan-baseline:after');
  try {
    assertZeroOllama(afterSafety);
  } catch (error) {
    recordFirstFailure(packet, error, 'siyuan_baseline_after');
  }
  packet.safety.push(afterSafety);
}

const events = recorder?.snapshot() ?? [];
recordAssertion(packet, 'no page or console errors occurred', events.filter((event) => event.source === 'page' || event.type === 'error').length === 0, {
  failureEventCount: events.filter((event) => event.source === 'page' || event.type === 'error').length,
});
const completed = finalizeEvidencePacket(packet, { events });
const output = await writeEvidencePacket({
    evidenceDirectory: RUN_DIR,
  name: completed.status === 'passed' ? 'siyuan-native-baseline.json' : 'siyuan-native-baseline-failure.json',
  packet: completed,
  overwrite: true,
});
process.stdout.write(`${JSON.stringify({ status: completed.status, output })}\n`);
process.exitCode = completed.status === 'passed' ? 0 : 1;
