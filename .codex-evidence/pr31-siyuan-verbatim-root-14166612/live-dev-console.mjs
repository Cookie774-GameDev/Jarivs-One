import { chromium } from 'file:///C:/Users/viper/ChatGPT-Browser-Connections/chatgpt-setup-automation/node_modules/playwright/index.mjs';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = browser
  .contexts()
  .flatMap((context) => context.pages())
  .find((candidate) => candidate.url().includes('localhost:5173'));
if (!page) throw new Error('vibespace_page_missing');

const evidence = await page.evaluate(async () => {
  const [{ useDevConsoleStore }, { useAuthStore }, jobStore, persistence] = await Promise.all([
    import('/src/features/dev-console/store.ts'),
    import('/src/stores/auth.ts'),
    import('/src/features/context/siyuan/siyuanIndexJobStore.ts'),
    import('/src/features/context/contextPersistence.ts'),
  ]);
  const state = useDevConsoleStore.getState();
  const auth = useAuthStore.getState();
  const projectId = auth?.projectId ?? null;
  const persisted = projectId ? await persistence.ensureContextPersistence(projectId) : null;
  const maps = persisted?.maps ?? [];
  const jobs = projectId ? await jobStore.listSiyuanIndexJobs(projectId) : [];
  return {
    projectId,
    entries: state.entries
      .filter((entry) =>
        /siyuan|summary|opencode|context map|provider|request scope|failed|error/iu.test(
          `${entry.message} ${JSON.stringify(entry.detail ?? {})}`,
        ),
      )
      .slice(-200),
    maps: maps.map((map) => ({
      id: map.id,
      name: map.name,
      status: map.status,
      rootDir: map.rootDir,
      fileCount: map.tree?.fileCount,
      entityCount: map.entityCount,
    })),
    jobs,
  };
});

process.stdout.write(JSON.stringify(evidence, null, 2));
process.exit(0);
