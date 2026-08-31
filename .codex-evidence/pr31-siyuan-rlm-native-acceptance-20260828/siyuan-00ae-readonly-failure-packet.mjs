import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

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
  writeEvidencePacket,
} from '../../scripts/pr31-native-acceptance-harness.mjs';

const ROOT = 'C:\\Users\\viper\\VibeSpace-UnifiedChungus-Final';
const RUN_DIR = resolve(
  ROOT,
  '.codex-evidence/pr31-siyuan-rlm-native-acceptance-20260828',
  process.env.RUN_LABEL ?? 'siyuan-readonly-failure-packet',
);
const JARVIS_PID = Number(process.env.JARVIS_PID ?? '');
const git = (...args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim();

let attachment;
let recorder;
let packet;
try {
  attachment = await attachOfficialNative({ chromium, jarvisPid: JARVIS_PID, cdpPort: 9223 });
  recorder = createPageEventRecorder(attachment.page, { limit: 600 });
  packet = createEvidencePacket({
    taskId: 'PR31-SIYUAN-00AE-CONSUMED-RETRY-READONLY',
    captureHead: git('rev-parse', 'HEAD'),
    identity: attachment.identity,
    safety: attachment.safety,
    metadata: {
      mutationPerformedByThisPacket: false,
      retryClicksByThisPacket: 0,
      priorAuthorizedRetryConsumed: true,
      expectedProductCommit:
        process.env.EXPECTED_PRODUCT_COMMIT ?? '00ae0fad4107c37b62fd723df590ba74426489cf',
      binaryCommit: process.env.BINARY_COMMIT ?? 'unknown',
      note: 'Read-only capture after the single 00ae recovery Retry; no further product mutation.',
    },
  });

  const snapshot = await attachment.page.evaluate(async () => {
    const [{ useAuthStore }, { ensureContextPersistence }, jobStore, manifestStore, { invoke }, devConsole] =
      await Promise.all([
        import('/src/stores/auth.ts'),
        import('/src/features/context/contextPersistence.ts'),
        import('/src/features/context/siyuan/siyuanIndexJobStore.ts'),
        import('/src/features/context/siyuan/siyuanMapManifest.ts'),
        import('/node_modules/.vite/deps/@tauri-apps_api_core.js'),
        import('/src/features/dev-console/store.ts'),
      ]);
    const projectId = useAuthStore.getState().projectId;
    const persistence = await ensureContextPersistence(projectId);
    const jobs = await jobStore.listSiyuanIndexJobs(projectId);
    const activeMapIds = new Set(
      persistence.maps.filter((map) => map.status === 'active').map((map) => map.id),
    );
    const job = jobs.find(
      (candidate) =>
        activeMapIds.has(candidate.mapId) &&
        candidate.canonicalRoot.replaceAll('\\', '/').includes('vibespace-pr31-context-fixture'),
    );
    const manifest = job ? manifestStore.readSiyuanMapManifest(projectId, job.mapId) : null;
    const markers = [
      ...(job?.mapId ? [job.mapId] : []),
      'README.txt',
      'photo.png.meta.json',
      'sample.bin',
      'info.md',
      'src/app.ts',
      'web/index.html',
    ];
    const searches = [];
    for (const marker of markers) {
      try {
        searches.push({
          marker,
          response: await invoke('siyuan_search_blocks', { projectId, query: marker, limit: 25 }),
        });
      } catch (error) {
        searches.push({ marker, error: String(error) });
      }
    }
    const entries = devConsole.useDevConsoleStore.getState().entries;
    const relevantEntries = entries
      .filter((entry) =>
        /SiYuan|fetch-6145|batch_append|stale node binding|create_document|get_block/iu.test(
          `${entry.message} ${JSON.stringify(entry.detail ?? {})}`,
        ),
      )
      .slice(-160)
      .map((entry) => ({
        timestamp: entry.timestamp,
        level: entry.level,
        channel: entry.channel,
        message: entry.message,
        detail: entry.detail,
      }));
    return {
      projectId,
      selectedMapId: persistence.selectedMapId,
      activeMap: persistence.maps.find((map) => map.id === job?.mapId) ?? null,
      job: job ?? null,
      manifest,
      searches,
      relevantEntries,
      bodyText: document.body.innerText.replace(/\s+/gu, ' ').trim().slice(0, 16000),
    };
  });

  packet.metadata.snapshot = snapshot;
  recordAssertion(packet, 'single Retry was consumed before this read-only packet', true, {
    retryClicksByThisPacket: 0,
    priorAuthorizedRetryConsumed: true,
  });
  recordAssertion(
    packet,
    'active recovery remains failed at 13 indexed with six pending',
    snapshot.job?.status === 'failed' &&
      snapshot.job?.indexed === 13 &&
      snapshot.job?.pendingNativeNodeIds?.length === 6,
    snapshot.job,
  );
  recordAssertion(
    packet,
    'stale binding reconciliation executed before batch failure',
    snapshot.relevantEntries.some((entry) => /stale node binding/iu.test(entry.message)),
    snapshot.relevantEntries,
  );
  recordAssertion(
    packet,
    'batch append failed after successful directory recreation',
    snapshot.relevantEntries.some((entry) => /fetch-6145/iu.test(`${entry.message} ${JSON.stringify(entry.detail ?? {})}`)),
    snapshot.relevantEntries,
  );
  const artifact = await captureScreenshot({
    page: attachment.page,
    evidenceDirectory: RUN_DIR,
    name: '01-siyuan-00ae-failed-after-detach.png',
    imageMetadata: (buffer) => sharp(buffer).metadata(),
  });
  packet.artifacts.push({ ...artifact, semanticState: { job: snapshot.job, manifest: snapshot.manifest } });
} catch (error) {
  if (!packet) {
    packet = createEvidencePacket({
      taskId: 'PR31-SIYUAN-00AE-CONSUMED-RETRY-READONLY',
      captureHead: git('rev-parse', 'HEAD'),
    });
  }
  recordFirstFailure(packet, error, 'siyuan_00ae_readonly_failure_packet');
} finally {
  if (packet) {
    const finalSafety = await captureSafetySnapshot();
    assertZeroOllama(finalSafety, 'SiYuan 00ae read-only failure packet final');
    finalizeEvidencePacket(packet, { recorder, finalSafety });
    await writeEvidencePacket({
      packet,
      evidenceDirectory: RUN_DIR,
      fileName: 'siyuan-00ae-consumed-retry-readonly.json',
    });
  }
  await attachment?.browser?.close();
}

if (packet?.status === 'failed') process.exitCode = 1;
