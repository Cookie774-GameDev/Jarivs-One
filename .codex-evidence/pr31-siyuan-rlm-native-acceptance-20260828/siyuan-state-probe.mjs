import { chromium } from 'playwright-core';
import { attachOfficialNative, sanitizeEvidence } from '../../scripts/pr31-native-acceptance-harness.mjs';

const attachment = await attachOfficialNative({ chromium, jarvisPid: Number(process.env.JARVIS_PID), cdpPort: 9223 });
try {
  const state = await attachment.page.evaluate(async () => {
    const { useAuthStore } = await import('/src/stores/auth.ts');
    const { ensureContextPersistence } = await import('/src/features/context/contextPersistence.ts');
    const { listSiyuanIndexJobs } = await import(
      '/src/features/context/siyuan/siyuanIndexJobStore.ts'
    );
    const auth = useAuthStore.getState();
    const { useDevConsoleStore } = await import('/src/features/dev-console/store.ts');
    const projectId = auth.projectId;
    const persistence = await ensureContextPersistence(projectId);
    const jobs = projectId ? await listSiyuanIndexJobs(projectId) : [];
    return {
      accountId: auth.localUserId,
      workspaceId: auth.workspaceId,
      projectId,
      maps: persistence.maps.map((map) => ({
        id: map.id,
        name: map.name,
        rootDir: map.rootDir,
        status: map.status,
        sourceType: map.sourceType,
      })),
      selectedMapId: persistence.selectedMapId,
      jobs: jobs.map((job) => ({
        projectId: job.projectId,
        mapId: job.mapId,
        canonicalRoot: job.canonicalRoot,
        status: job.status,
        phase: job.phase,
        indexed: job.indexed,
        createdNodes: job.createdNodes,
      })),
      recentDevConsole: useDevConsoleStore
        .getState()
        .entries.filter((entry) => /SiYuan|Context Map resume|fetch-3953|fetch-3973|fetch-3981|fetch-3987/iu.test(`${entry.message} ${JSON.stringify(entry.detail ?? {})}`))
        .slice(-80)
        .map((entry) => ({
          timestamp: entry.timestamp,
          channel: entry.channel,
          level: entry.level,
          message: entry.message,
          detail: entry.detail,
        })),
    };
  });
  process.stdout.write(`${JSON.stringify(sanitizeEvidence(state), null, 2)}\n`);
} finally {
  await attachment.browser.close();
}
