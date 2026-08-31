import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import {
  attachOfficialNative,
  sanitizeEvidence,
} from '../../scripts/pr31-native-acceptance-harness.mjs';

const evidenceDir = path.resolve(
  '.codex-evidence/pr31-siyuan-rlm-native-acceptance-20260828/batch-f72efb24',
);
const attachment = await attachOfficialNative({
  chromium,
  jarvisPid: Number(process.env.JARVIS_PID ?? '9084'),
  cdpPort: 9223,
});

try {
  const page = attachment.page;
  await page.getByRole('button', { name: 'Pause', exact: true }).click();

  const state = await page.waitForFunction(async () => {
    const { useAuthStore } = await import('/src/stores/auth.ts');
    const { listSiyuanIndexJobs } = await import(
      '/src/features/context/siyuan/siyuanIndexJobStore.ts'
    );
    const projectId = useAuthStore.getState().projectId;
    const jobs = projectId ? await listSiyuanIndexJobs(projectId) : [];
    const active = jobs.find((job) => job.status === 'paused');
    if (!active) return null;
    return {
      projectId,
      mapId: active.mapId,
      status: active.status,
      phase: active.phase,
      indexed: active.indexed,
      createdNodes: active.createdNodes,
      cursor: active.cursor,
      frontierLength: active.frontier?.length ?? null,
      pendingNativeNodeIds: active.pendingNativeNodeIds ?? [],
      pauseRequested: active.pauseRequested ?? null,
    };
  });

  const snapshot = await state.jsonValue();
  const screenshotPath = path.join(evidenceDir, '02-siyuan-stalled-job-paused.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const report = sanitizeEvidence({
    capturedAt: new Date().toISOString(),
    commit: 'f72efb24244f91588b9f8ff4ab969496abe56a29',
    scenario: 'Pause stalled SiYuan retry through official native UI',
    state: snapshot,
    screenshotPath,
  });
  await fs.writeFile(
    path.join(evidenceDir, '02-siyuan-stalled-job-paused.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await attachment.browser.close();
}
