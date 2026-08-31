import { chromium } from 'playwright-core';

const fixtureRoot =
  'C:\\Users\\viper\\AppData\\Local\\Temp\\vibespace-pr31-context-fixture-20260827';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = browser.contexts().flatMap((context) => context.pages())[0];
const errors = [];
page.on('pageerror', (error) => errors.push(`page:${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console:${message.text()}`);
});

async function snapshot() {
  return page.evaluate(async (expectedRoot) => {
    const { useAuthStore } = await import('/src/stores/auth.ts');
    const { ensureContextPersistence } = await import(
      '/src/features/context/contextPersistence.ts'
    );
    const { listSiyuanIndexJobs, readSiyuanIndexEntries } = await import(
      '/src/features/context/siyuan/siyuanIndexJobStore.ts'
    );
    const { readSiyuanMapManifest } = await import(
      '/src/features/context/siyuan/siyuanMapManifest.ts'
    );
    const projectId = useAuthStore.getState().projectId;
    const maps = projectId ? (await ensureContextPersistence(projectId)).maps : [];
    const jobs = projectId ? await listSiyuanIndexJobs(projectId) : [];
    const normalizedRoot = expectedRoot.replaceAll('\\', '/').toLowerCase();
    const activeMapIds = new Set(
      maps.filter((candidate) => candidate.status === 'active').map((candidate) => candidate.id),
    );
    const job = jobs.find(
      (candidate) =>
        activeMapIds.has(candidate.mapId) &&
        candidate.canonicalRoot.replaceAll('\\', '/').toLowerCase() === normalizedRoot &&
        candidate.status !== 'deleted',
    );
    const map = job
      ? maps.find((candidate) => candidate.id === job.mapId && candidate.status === 'active')
      : null;
    const entries = map ? await readSiyuanIndexEntries(projectId, map.id) : [];
    const manifest = map ? readSiyuanMapManifest(projectId, map.id) : null;
    const body = document.body.innerText.replace(/\s+/gu, ' ').trim();
    return {
      projectId,
      job: job
        ? {
            mapId: job.mapId,
            status: job.status,
            indexed: job.indexed,
            error: job.error ?? null,
          }
        : null,
      map: map
        ? {
            id: map.id,
            name: map.name,
            fileCount: map.tree?.fileCount ?? null,
            nodeCount: map.tree?.nodes?.length ?? null,
          }
        : null,
      exactFiles: entries.filter((entry) => entry.kind === 'file').length,
      indexedItems: entries.length,
      manifestRootDocumentId: manifest?.rootDocumentId ?? null,
      controls: {
        addFiles: body.includes('Add files'),
        addPastedPath: body.includes('Add pasted path'),
        selectedSummaryPaths: body.includes('selected summary paths'),
      },
      text: body.slice(0, 1600),
    };
  }, fixtureRoot);
}

try {
  await page.evaluate(async (root) => {
    const { useAuthStore } = await import('/src/stores/auth.ts');
    const { resolveAccountIdentity } = await import('/src/lib/accountIdentity.ts');
    const { setStoredContextSourceRoot } = await import(
      '/src/features/context/contextSourceRoot.ts'
    );
    const auth = useAuthStore.getState();
    const accountId = resolveAccountIdentity(auth)?.accountId ?? null;
    if (!auth.projectId) throw new Error('active_project_missing');
    setStoredContextSourceRoot(accountId, auth.projectId, root);
  }, fixtureRoot);
  if (new URL(page.url()).searchParams.get('route') !== 'context') {
    await page.evaluate(() => {
      const url = new URL(location.href);
      url.searchParams.set('route', 'context');
      location.href = url.href;
    });
  }
  await page.locator('[data-monochrome-route="context"]').waitFor({
    state: 'attached',
    timeout: 45_000,
  });
  const create = page.getByRole('button', { name: 'Create Map', exact: true });
  await create.waitFor({ state: 'visible', timeout: 30_000 });
  if (await create.isDisabled()) throw new Error('create_map_disabled');
  await create.click();

  const deadline = Date.now() + 120_000;
  let state = await snapshot();
  while (Date.now() < deadline && state.job?.status !== 'completed') {
    if (state.job?.status === 'failed') {
      throw new Error(`create_map_failed:${state.job.error ?? 'unknown'}`);
    }
    await page.waitForTimeout(500);
    state = await snapshot();
  }
  if (state.job?.status !== 'completed') throw new Error('create_map_timeout');
  if (!state.map) throw new Error('active_map_missing');
  if (!state.manifestRootDocumentId) throw new Error('siyuan_manifest_missing');
  if (state.exactFiles < 1 || state.map.fileCount !== state.exactFiles) {
    throw new Error(`exact_file_count_mismatch:${state.map.fileCount}:${state.exactFiles}`);
  }
  if (!Object.values(state.controls).every(Boolean)) {
    throw new Error(`summary_controls_missing:${JSON.stringify(state.controls)}`);
  }
  await page.screenshot({
    path: new URL('./native-create-map-passed.png', import.meta.url).pathname.slice(1),
    fullPage: true,
  });
  console.log(JSON.stringify({ status: 'passed', state, errors }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', error: String(error), errors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
