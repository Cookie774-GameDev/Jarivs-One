import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const expectedRoot = 'C:\\Users\\viper\\projects';
let projectId = null;
const cdpEndpoint = 'http://127.0.0.1:9224';
const reportPath = fileURLToPath(new URL('./native-projects-map-report.json', import.meta.url));
const screenshotPath = fileURLToPath(
  new URL('./native-projects-map-passed.png', import.meta.url),
);

let browser = null;
const browserDeadline = Date.now() + 45_000;
while (!browser && Date.now() < browserDeadline) {
  try {
    browser = await chromium.connectOverCDP(cdpEndpoint, { timeout: 5_000 });
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
if (!browser) throw new Error('detached_native_cdp_missing');
let page = null;
const pageDeadline = Date.now() + 20_000;
while (!page && Date.now() < pageDeadline) {
  page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((candidate) => candidate.url().startsWith('http://127.0.0.1:5175/'));
  page ??= browser.contexts().flatMap((context) => context.pages())[0] ?? null;
  if (!page) await new Promise((resolve) => setTimeout(resolve, 100));
}
if (!page) throw new Error('detached_native_page_missing');
await page.goto('http://127.0.0.1:5175/?route=context', {
  waitUntil: 'domcontentloaded',
  timeout: 60_000,
});
await page.waitForTimeout(2_000);
await page.waitForLoadState('domcontentloaded');
const runtimeErrors = [];
page.on('pageerror', (error) => runtimeErrors.push(`page:${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') runtimeErrors.push(`console:${message.text()}`);
});

async function evaluateStable(pageFunction, arg) {
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await page.evaluate(pageFunction, arg);
    } catch (error) {
      lastError = error;
      if (!String(error).includes('Execution context was destroyed')) throw error;
      await page.waitForTimeout(750);
      await page.waitForLoadState('domcontentloaded');
    }
  }
  throw lastError;
}

async function readState() {
  return evaluateStable(
    async ({ expectedRoot: root, projectId: expectedProjectId }) => {
      const { ensureContextPersistence } = await import(
        '/src/features/context/contextPersistence.ts'
      );
      const { listSiyuanIndexJobs, readSiyuanIndexEntries } = await import(
        '/src/features/context/siyuan/siyuanIndexJobStore.ts'
      );
      const { readSiyuanMapManifest } = await import(
        '/src/features/context/siyuan/siyuanMapManifest.ts'
      );
      const normalizedRoot = root.replaceAll('\\', '/').toLowerCase();
      const persistence = await ensureContextPersistence(expectedProjectId);
      const matchingMaps = persistence.maps.filter(
        (candidate) =>
          candidate.rootDir.replaceAll('\\', '/').toLowerCase() === normalizedRoot,
      );
      const activeMap = [...matchingMaps]
        .reverse()
        .find((candidate) => candidate.status === 'active');
      const deletedMaps = matchingMaps.filter((candidate) => candidate.status === 'deleted');
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
        selectedMapId: persistence.selectedMapId,
        matchingMapCount: matchingMaps.length,
        deletedMapCount: deletedMaps.length,
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
              mapId: job.mapId,
              status: job.status,
              phase: job.phase,
              indexed: job.indexed,
              createdNodes: job.createdNodes,
              summarized: job.summarized,
              summaryEligible: job.summaryEligible,
              summaryProviderId: job.summaryProviderId,
              summaryModelId: job.summaryModelId,
              pauseReason: job.pauseReason,
              failed: job.failed,
            }
          : null,
        exactFiles: entries.filter((entry) => entry.kind === 'file').length,
        indexedItems: entries.length,
        completedSummaries: entries.filter(
          (entry) => entry.summaryState === 'completed' && Boolean(entry.summary?.trim()),
        ).length,
        manifest: manifest
          ? {
              notebookId: manifest.notebookId,
              rootDocumentId: manifest.rootDocumentId,
              summaryModel: manifest.summaryModel,
            }
          : null,
      };
    },
    { expectedRoot, projectId },
  );
}

const report = {
  status: 'failed',
  expectedRoot,
  projectId,
  identity: null,
  controls: null,
  state: null,
  graph: null,
  runtimeErrors,
  failure: null,
};

try {
  report.identity = await evaluateStable(() => ({
    title: document.title,
    readyState: document.readyState,
    hasTauri: Boolean(window.__TAURI_INTERNALS__),
    href: location.href,
  }));
  if (
    report.identity.title !== 'VibeSpace' ||
    report.identity.readyState !== 'complete' ||
    !report.identity.hasTauri
  ) {
    throw new Error(`official_native_identity_invalid:${JSON.stringify(report.identity)}`);
  }

  const seeded = await evaluateStable(
    async ({ root }) => {
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
    },
    { root: expectedRoot },
  );
  projectId = seeded.projectId;
  report.projectId = projectId;

  await page.locator('[data-monochrome-route="context"]').waitFor({
    state: 'attached',
    timeout: 60_000,
  });
  const sourceInput = page.locator('#context-project-folder');
  await sourceInput.fill(expectedRoot);
  await page.getByRole('button', { name: 'Save Source', exact: true }).click();
  report.controls = {
    addFiles: await page.getByRole('button', { name: 'Add files', exact: true }).isVisible(),
    addPastedPath: await page
      .getByRole('button', { name: 'Add pasted path', exact: true })
      .isVisible(),
    selectedSummaryMode: await page
      .getByRole('radio', { name: /Selected folders \/ file types/u })
      .isChecked(),
  };
  if (!Object.values(report.controls).every(Boolean)) {
    throw new Error(`summary_controls_invalid:${JSON.stringify(report.controls)}`);
  }

  let state = await readState();
  report.state = state;
  if (state.activeMap && state.job?.status === 'failed') {
    const retryButton = page.getByRole('button', { name: 'Retry', exact: true });
    await retryButton.waitFor({ state: 'visible', timeout: 30_000 });
    await retryButton.click();
  } else if (state.job?.status !== 'completed') {
    const createButton = page.getByRole('button', { name: 'Create Map', exact: true });
    await createButton.waitFor({ state: 'visible', timeout: 30_000 });
    if (await createButton.isDisabled()) throw new Error('create_map_disabled');
    await createButton.click();
  }

  const deadline = Date.now() + 300_000;
  state = await readState();
  while (Date.now() < deadline && state.job?.status !== 'completed') {
    report.state = state;
    if (state.deletedMapCount > 0) {
      throw new Error(`new_map_recycled:${JSON.stringify(state)}`);
    }
    if (state.job?.status === 'failed') {
      throw new Error(`create_map_failed:${JSON.stringify(state.job)}`);
    }
    if (state.job?.status === 'paused') {
      throw new Error(`create_map_paused:${JSON.stringify(state.job)}`);
    }
    await page.waitForTimeout(750);
    state = await readState();
  }
  report.state = state;
  if (state.job?.status !== 'completed') throw new Error('create_map_timeout');
  if (!state.activeMap || state.activeMap.status !== 'active') {
    throw new Error('active_map_missing');
  }
  if (state.deletedMapCount !== 0) throw new Error('created_map_in_recycling_bin');
  if (!state.manifest?.rootDocumentId || !state.manifest?.notebookId) {
    throw new Error('siyuan_manifest_missing');
  }
  if (state.exactFiles < 1 || state.activeMap.fileCount !== state.exactFiles) {
    throw new Error(
      `exact_file_count_mismatch:${state.activeMap.fileCount}:${state.exactFiles}`,
    );
  }
  if (state.indexedItems < state.exactFiles || state.job.indexed < state.exactFiles) {
    throw new Error('indexed_count_invalid');
  }
  if (
    state.job.summaryEligible > 0 &&
    (state.job.summarized !== state.job.summaryEligible ||
      state.completedSummaries < state.job.summarized)
  ) {
    throw new Error(`summary_count_invalid:${JSON.stringify(state.job)}`);
  }

  const mapButton = page.getByRole('button', {
    name: new RegExp(`${state.activeMap.name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}.*Active`, 'iu'),
  });
  await mapButton.click();
  const focusedPage = page.locator('[data-context-siyuan-map-page]');
  await focusedPage.waitFor({ state: 'visible', timeout: 30_000 });
  const surface = page.locator('[data-testid="siyuan-vault-surface"]');
  await surface.waitFor({ state: 'visible', timeout: 30_000 });
  await page
    .locator('[data-siyuan-surface-state="ready"]')
    .waitFor({ state: 'attached', timeout: 45_000 });
  report.graph = await evaluateStable(async () => {
    const { productionSiyuanSurfaceBridge } = await import(
      '/src/features/context/siyuan/siyuanSurface.ts'
    );
    return productionSiyuanSurfaceBridge.status();
  });
  if (
    !report.graph?.visible ||
    report.graph?.graphState !== 'ready' ||
    report.graph?.mapId !== state.activeMap.id
  ) {
    throw new Error(`siyuan_graph_invalid:${JSON.stringify(report.graph)}`);
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });
  report.status = 'passed';
} catch (error) {
  report.failure = error instanceof Error ? `${error.name}:${error.message}` : String(error);
  process.exitCode = 1;
} finally {
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  browser._connection?.close?.();
}
