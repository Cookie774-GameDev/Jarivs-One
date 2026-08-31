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
const events = [];
let stage = 'attach';
let projectId = '';

const attachment = await attachOfficialNative({ chromium, cdpPort: 9223, jarvisPid });
const page = attachment.page;
page.setDefaultTimeout(20_000);
page.on('pageerror', (error) =>
  events.push({ type: 'pageerror', stage, message: String(error).slice(0, 500) }),
);
page.on('console', (message) => {
  if (message.type() === 'error') {
    events.push({ type: 'console.error', stage, message: message.text().slice(0, 500) });
  }
});

async function readState() {
  return page.evaluate(
    async ({ root, expectedProjectId }) => {
      const { ensureContextPersistence } = await import(
        '/src/features/context/contextPersistence.ts'
      );
      const { listSiyuanIndexJobs, readSiyuanIndexEntries } = await import(
        '/src/features/context/siyuan/siyuanIndexJobStore.ts'
      );
      const { readSiyuanMapManifest } = await import(
        '/src/features/context/siyuan/siyuanMapManifest.ts'
      );
      const { useDevConsoleStore } = await import('/src/features/dev-console/store.ts');
      const normalizedRoot = root.replaceAll('\\', '/').toLowerCase();
      const persistence = await ensureContextPersistence(expectedProjectId);
      const matchingMaps = persistence.maps.filter(
        (candidate) => candidate.rootDir.replaceAll('\\', '/').toLowerCase() === normalizedRoot,
      );
      const activeMap = [...matchingMaps]
        .reverse()
        .find((candidate) => candidate.status === 'active');
      const jobs = await listSiyuanIndexJobs(expectedProjectId);
      const job = activeMap ? jobs.find((candidate) => candidate.mapId === activeMap.id) : null;
      const entries = activeMap
        ? await readSiyuanIndexEntries(expectedProjectId, activeMap.id)
        : [];
      const manifest = activeMap
        ? readSiyuanMapManifest(expectedProjectId, activeMap.id)
        : null;
      return {
        accountId: persistence.accountId,
        projectId: expectedProjectId,
        selectedMapId: persistence.selectedMapId,
        matchingMapCount: matchingMaps.length,
        activeMap: activeMap
          ? {
              id: activeMap.id,
              name: activeMap.name,
              status: activeMap.status,
              rootDir: activeMap.rootDir,
              fileCount: activeMap.tree.fileCount,
              nodeCount: activeMap.tree.nodes.length,
            }
          : null,
        job: job
          ? {
              status: job.status,
              phase: job.phase,
              indexed: job.indexed,
              createdNodes: job.createdNodes,
              summarized: job.summarized,
              summaryEligible: job.summaryEligible,
              summaryProviderId: job.summaryProviderId,
              summaryModelId: job.summaryModelId,
              summaryEffort: job.summaryEffort,
              pauseReason: job.pauseReason,
              failed: job.failed,
            }
          : null,
        entries: entries.map((entry) => ({
          id: entry.id,
          kind: entry.kind,
          relativePath: entry.relativePath,
          summaryState: entry.summaryState,
          hasSummary: Boolean(entry.summary?.trim()),
        })),
        manifest: manifest
          ? {
              notebookId: manifest.notebookId,
              rootDocumentId: manifest.rootDocumentId,
              summaryModel: manifest.summaryModel,
            }
          : null,
        recentContextErrors: useDevConsoleStore
          .getState()
          .entries.filter(
            (entry) =>
              entry.level === 'error' &&
              /siyuan|context map|context vault/iu.test(`${entry.message} ${JSON.stringify(entry.detail ?? {})}`),
          )
          .slice(-8)
          .map((entry) => ({
            at: entry.ts,
            channel: entry.channel,
            message: entry.message,
            detail: entry.detail,
          })),
      };
    },
    { root: expectedRoot, expectedProjectId: projectId },
  );
}

const report = {
  status: 'failed',
  stage,
  expectedRoot,
  identity: attachment.identity,
  projectId: null,
  state: null,
  safety: [],
  events,
  notices: [],
  visibleText: null,
  failure: null,
};

try {
  report.safety.push(
    assertZeroOllama(captureSafetySnapshot(await readWindowsNativeState(), 'map:before')),
  );
  stage = 'open-context';
  const seeded = await page.evaluate(async ({ root }) => {
    const { useAuthStore } = await import('/src/stores/auth.ts');
    const { useUIStore } = await import('/src/stores/ui.ts');
    const { resolveAccountIdentity } = await import('/src/lib/accountIdentity.ts');
    const { setStoredContextSourceRoot } = await import(
      '/src/features/context/contextSourceRoot.ts'
    );
    const auth = useAuthStore.getState();
    if (!auth.projectId) throw new Error('active_project_missing');
    const accountId = resolveAccountIdentity(auth)?.accountId ?? null;
    setStoredContextSourceRoot(accountId, auth.projectId, root);
    useUIStore.getState().setRoute('context');
    return { projectId: auth.projectId };
  }, { root: expectedRoot });
  projectId = seeded.projectId;
  report.projectId = projectId;
  await page.locator('[data-monochrome-route="context"]').waitFor({ state: 'attached' });
  const ambient = page.locator('[data-monochrome-surface="ambient-home"]');
  if (await ambient.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await ambient.waitFor({ state: 'hidden', timeout: 10_000 });
  }
  const back = page.getByRole('button', { name: /Back to Context Maps/iu });
  if (await back.isVisible().catch(() => false)) await back.click();

  stage = 'configure-source';
  const sourceInput = page.locator('#context-project-folder');
  await sourceInput.waitFor({ state: 'visible' });
  await sourceInput.fill(expectedRoot);
  await page.getByRole('button', { name: 'Save Source', exact: true }).click();

  let state = await readState();
  if (!state.activeMap) {
    stage = 'configure-summary-route';
    const pickerHost = page.locator('[data-siyuan-create-summary-model-picker]');
    const modelButton = pickerHost.getByRole('button', { name: 'Choose summary model' });
    await modelButton.waitFor({ state: 'visible' });
    if (!/opencode-go\/deepseek-v4-flash-vision-exp/iu.test(await modelButton.innerText())) {
      await modelButton.click();
      const search = page.getByRole('searchbox', { name: 'Search providers and models' });
      await search.fill('opencode-go/deepseek-v4-flash-vision-exp');
      const exact = page.locator(
        '[role="option"][data-value="opencode-cli:opencode-go/deepseek-v4-flash-vision-exp"]:visible',
      );
      await exact.waitFor({ state: 'visible' });
      await exact.click();
      const high = page.locator('[data-effort-level="high"]:visible');
      await high.waitFor({ state: 'visible' });
      await high.click();
    }

    stage = 'configure-summary-scope';
    const selectedSummaryCount = page.getByText(/selected summary path/iu);
    const selectedText = (await selectedSummaryCount.first().textContent().catch(() => '')) ?? '';
    if (!/^1 selected summary path/iu.test(selectedText.trim())) {
      const summaryPath = page.getByPlaceholder('Paste one or more file paths (one per line)');
      await summaryPath.fill(expectedRoot);
      await page.getByRole('button', { name: 'Add pasted path', exact: true }).click();
      await page.getByText('1 selected summary path', { exact: false }).waitFor();
    }
  }
  await page.screenshot({
    path: path.join(evidenceDirectory, '06-phase0-map-before-create.png'),
    fullPage: false,
  });

  stage = 'create-map';
  state = await readState();
  if (!state.activeMap) {
    const create = page.getByRole('button', { name: 'Create Map', exact: true });
    await create.waitFor({ state: 'visible' });
    if (await create.isDisabled()) throw new Error('create_map_disabled');
    await create.click();
  }

  const deadline = Date.now() + 300_000;
  let approvalClicks = 0;
  let retriedFailedJob = false;
  while (Date.now() < deadline) {
    state = await readState();
    report.state = state;
    if (state.job?.status === 'completed') break;
    if (state.job?.status === 'failed') {
      const retry = page.getByRole('button', { name: 'Retry', exact: true });
      if (!retriedFailedJob && (await retry.isVisible().catch(() => false))) {
        stage = 'retry-failed-map';
        await retry.click();
        retriedFailedJob = true;
        await page.waitForTimeout(500);
        continue;
      }
      await page.waitForTimeout(500);
      report.notices = await page
        .locator('[data-sonner-toast], [role="alert"], [aria-live="assertive"]')
        .allInnerTexts()
        .catch(() => []);
      throw new Error(`create_map_failed:${state.job.failed}`);
    }
    if (state.job?.status === 'paused') {
      const approve = page.getByRole('button', {
        name: /(?:Approve exact route and resume|Resume approved exact route)/iu,
      });
      if (approvalClicks < 3 && (await approve.isVisible().catch(() => false))) {
        stage = 'approve-exact-summary-route';
        await page.screenshot({
          path: path.join(
            evidenceDirectory,
            `07-phase0-map-cloud-preflight-${approvalClicks + 1}.png`,
          ),
          fullPage: false,
        });
        await approve.click();
        approvalClicks += 1;
        await page.waitForTimeout(750);
      } else {
        throw new Error(`create_map_paused:${state.job.pauseReason}`);
      }
    }
    await page.waitForTimeout(750);
  }
  report.state = await readState();
  if (report.state.job?.status !== 'completed') throw new Error('create_map_timeout');
  if (!report.state.activeMap || report.state.activeMap.status !== 'active') {
    throw new Error('active_map_missing');
  }
  if (!report.state.manifest?.rootDocumentId || !report.state.manifest?.notebookId) {
    throw new Error('siyuan_manifest_missing');
  }
  if (report.state.activeMap.fileCount !== 1 || report.state.job.indexed < 1) {
    throw new Error('phase0_fixture_index_count_invalid');
  }
  if (report.state.job.createdNodes < 1) throw new Error('phase0_siyuan_node_missing');

  stage = 'capture-complete';
  await page.screenshot({
    path: path.join(evidenceDirectory, '08-phase0-map-complete.png'),
    fullPage: false,
  });
  report.safety.push(
    assertZeroOllama(captureSafetySnapshot(await readWindowsNativeState(), 'map:after')),
  );
  report.status = 'passed';
  report.stage = stage;
} catch (error) {
  report.stage = stage;
  report.failure = error instanceof Error ? `${error.name}:${error.message}` : String(error);
  report.visibleText = (await page.locator('body').innerText().catch(() => '')).slice(0, 12_000);
  await page
    .screenshot({ path: path.join(evidenceDirectory, '09-phase0-map-failure.png'), fullPage: false })
    .catch(() => undefined);
  report.safety.push(captureSafetySnapshot(await readWindowsNativeState(), 'map:failure'));
  process.exitCode = 1;
} finally {
  await writeFile(
    path.join(evidenceDirectory, '03-phase0-context-map.json'),
    `${JSON.stringify(sanitizeEvidence(report), null, 2)}\n`,
    'utf8',
  );
  process.stdout.write(
    `${JSON.stringify({ status: report.status, stage: report.stage, failure: report.failure, state: report.state })}\n`,
  );
  setTimeout(() => process.exit(process.exitCode ?? 0), 50);
}
