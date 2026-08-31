import { chromium } from 'file:///C:/Users/viper/ChatGPT-Browser-Connections/chatgpt-setup-automation/node_modules/playwright/index.mjs';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = browser
  .contexts()
  .flatMap((context) => context.pages())
  .find((candidate) => candidate.url().includes('localhost:5173'));
if (!page) throw new Error('vibespace_page_missing');
const result = await page.evaluate(async () => {
  const [
    { useAuthStore },
    identity,
    persistence,
    jobs,
    manifests,
    routes,
    database,
    repositoryModule,
    searchPipeline,
  ] =
    await Promise.all([
    import('/src/stores/auth.ts'),
    import('/src/lib/accountIdentity.ts'),
    import('/src/features/context/contextPersistence.ts'),
    import('/src/features/context/siyuan/siyuanIndexJobStore.ts'),
    import('/src/features/context/siyuan/siyuanMapManifest.ts'),
    import('/src/features/context/siyuan/siyuanSummaryRoutePreference.ts'),
    import('/src/lib/db/index.ts'),
    import('/src/features/context/repository.ts'),
    import('/src/features/context/contextSearchPipeline.ts'),
  ]);
  const auth = useAuthStore.getState();
  const account = identity.resolveAccountIdentity(auth);
  await database.openDb();
  const rawMaps = (await database.db.context_maps.toArray()).map((map) => ({
    id: map.id,
    accountId: map.accountId,
    projectId: map.projectId,
    name: map.name,
    status: map.status,
    updatedAt: map.updatedAt,
  }));
  const maps = await persistence.loadPersistedContextMaps(auth.projectId ?? null);
  const repository = repositoryModule.createContextGraphRepository(database.db);
  const searchIndex = searchPipeline.createTauriContextSearchIndexPort();
  const detail = [];
  for (const rawMap of rawMaps.filter((map) => map.projectId === (auth.projectId ?? null))) {
    const map = maps.find((candidate) => candidate.id === rawMap.id) ?? null;
    const job = auth.projectId ? await jobs.readSiyuanIndexJob(auth.projectId, rawMap.id) : null;
    const entries = auth.projectId
      ? await jobs.readSiyuanIndexEntries(auth.projectId, rawMap.id)
      : [];
    const manifest = auth.projectId
      ? manifests.readSiyuanMapManifest(auth.projectId, rawMap.id)
      : null;
    const snapshot = await repository.getSnapshot(rawMap.accountId, rawMap.id);
    const indexStatus = await searchIndex.status(rawMap.accountId, rawMap.id);
    const route =
      auth.projectId && account?.accountId
        ? routes.readSiyuanSummaryRoutePreference(
            window.localStorage,
            account.accountId,
            auth.projectId,
            rawMap.id,
          )
        : null;
    const originalRoute = auth.projectId
      ? routes.readSiyuanSummaryRoutePreference(
          window.localStorage,
          rawMap.accountId,
          auth.projectId,
          rawMap.id,
        )
      : null;
    detail.push({
      map: {
        id: rawMap.id,
        name: map?.name ?? rawMap.name,
        status: map?.status ?? rawMap.status,
        rootDir:
          map?.rootDir ?? snapshot?.sources[0]?.localRoot ?? snapshot?.sources[0]?.localFile ?? null,
        fileCount:
          map?.tree.fileCount ??
          snapshot?.entities.filter((entity) => entity.kind === 'file').length ??
          null,
        entityCount: snapshot?.entities.length ?? null,
        updatedAt: rawMap.updatedAt,
      },
      entryCount: entries.length,
      fileEntries: entries.filter((entry) => entry.kind === 'file').length,
      summarizedEntries: entries.filter((entry) => entry.summaryState === 'summarized').length,
      job,
      manifestCounts: manifest?.counts ?? null,
      route,
      originalRoute,
      indexStatus,
    });
  }
  return {
    auth: {
      projectId: auth.projectId ?? null,
      workspaceId: auth.workspaceId ?? null,
      accountId: account?.accountId ?? null,
    },
    rawMaps,
    detail,
  };
});
process.stdout.write(JSON.stringify(result, null, 2));
process.exit(0);
