import { chromium } from 'playwright-core';
import { attachOfficialNative } from '../../scripts/pr31-native-acceptance-harness.mjs';

const attachment = await attachOfficialNative({ chromium, jarvisPid: Number(process.env.JARVIS_PID), cdpPort: 9223 });
try {
  const page = attachment.page;
  const read = () => page.evaluate(async () => {
    const { useAuthStore } = await import('/src/stores/auth.ts');
    const { listSiyuanIndexJobs } = await import('/src/features/context/siyuan/siyuanIndexJobStore.ts');
    const { ensureContextPersistence } = await import('/src/features/context/contextPersistence.ts');
    const projectId = useAuthStore.getState().projectId;
    const jobs = projectId ? await listSiyuanIndexJobs(projectId) : [];
    const maps = projectId ? (await ensureContextPersistence(projectId)).maps : [];
    const active = new Set(maps.filter((map) => map.status === 'active').map((map) => map.id));
    return jobs.find((job) => active.has(job.mapId) && job.canonicalRoot.replaceAll('\\', '/').includes('vibespace-pr31-context-fixture')) ?? null;
  });
  const before = await read();
  if (process.env.READ_ONLY === '1') {
    process.stdout.write(`${JSON.stringify({ before }, null, 2)}\n`);
    process.exit(0);
  }
  if (before?.status !== 'running') throw new Error(`expected_running:${before?.status}`);
  if (new URL(page.url()).searchParams.get('route') !== 'context') {
    await page.getByRole('button', { name: 'Context', exact: true }).first().click();
    await page.waitForURL((url) => url.searchParams.get('route') === 'context');
  }
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.waitForFunction(async () => {
    const { useAuthStore } = await import('/src/stores/auth.ts');
    const { listSiyuanIndexJobs } = await import('/src/features/context/siyuan/siyuanIndexJobStore.ts');
    const { ensureContextPersistence } = await import('/src/features/context/contextPersistence.ts');
    const projectId = useAuthStore.getState().projectId;
    const jobs = projectId ? await listSiyuanIndexJobs(projectId) : [];
    const maps = projectId ? (await ensureContextPersistence(projectId)).maps : [];
    const active = new Set(maps.filter((map) => map.status === 'active').map((map) => map.id));
    return jobs.some((job) => active.has(job.mapId) && job.canonicalRoot.replaceAll('\\', '/').includes('vibespace-pr31-context-fixture') && job.status === 'paused');
  }, undefined, { timeout: 30_000 });
  const after = await read();
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get('route') === 'chat');
  await page.getByRole('button', { name: 'Context', exact: true }).first().click();
  await page.waitForURL((url) => url.searchParams.get('route') === 'context');
  const observations = [];
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const observed = await read();
    observations.push({ at: Date.now(), status: observed?.status, pauseReason: observed?.pauseReason, updatedAt: observed?.updatedAt });
    if (observed?.status !== 'paused') throw new Error(`pause_resurrected:${observed?.status}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  await page.screenshot({ path: process.env.SCREENSHOT_PATH, animations: 'disabled' });
  process.stdout.write(`${JSON.stringify({ before, after, final: await read(), pauseClicks: 1, observations }, null, 2)}\n`);
} finally {
  await attachment.browser.close();
}
