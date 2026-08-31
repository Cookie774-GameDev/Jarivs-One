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
  sha256,
  waitForSemantic,
  writeEvidencePacket,
} from '../../../../scripts/pr31-native-acceptance-harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const NORMAL_VIEWPORT = Object.freeze({ width: 1280, height: 900 });
const NARROW_VIEWPORT = Object.freeze({ width: 760, height: 900 });

const git = (...args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim();

function must(packet, name, passed, details) {
  recordAssertion(packet, name, passed, details);
  if (!passed) throw new Error(`Assertion failed: ${name}`);
}

async function safety(label) {
  return assertZeroOllama(captureSafetySnapshot(await readWindowsNativeState(), label), label);
}

async function capture(packet, page, name, semanticState) {
  const windowState = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    outerWidth: window.outerWidth,
    outerHeight: window.outerHeight,
    devicePixelRatio: window.devicePixelRatio,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  }));
  const artifact = await captureScreenshot({
    page,
    evidenceDirectory: HERE,
    name,
    imageMetadata: async (buffer) => sharp(buffer).metadata(),
  });
  packet.artifacts.push({
    ...artifact,
    viewport: page.viewportSize(),
    window: windowState,
    semanticState,
  });
}

async function readContextDomState(page) {
  return page.evaluate(async () => {
    const progress = document.querySelector(
      '[role="progressbar"][aria-label="SiYuan map creation progress"]',
    );
    const card = document.querySelector('section[aria-label="SiYuan map progress"]');
    const working = document.querySelector('[data-testid="siyuan-working-animation"]');
    const animatedNodes = working
      ? [working, ...working.querySelectorAll('*')].map((node) => ({
          target: node.className?.baseVal ?? node.className ?? node.tagName,
          animationName: getComputedStyle(node).animationName,
        }))
      : [];
    const { useAuthStore } = await import('/src/stores/auth.ts');
    const { listSiyuanIndexJobs } =
      await import('/src/features/context/siyuan/siyuanIndexJobStore.ts');
    let job = null;
    let manifest = null;
    const projectId = useAuthStore.getState().projectId;
    const fixtureJobs = projectId
      ? (await listSiyuanIndexJobs(projectId)).filter((candidate) =>
          candidate.canonicalRoot
            .replaceAll('\\', '/')
            .endsWith('/vibespace-pr31-context-fixture-20260827'),
        )
      : [];
    const mapId = fixtureJobs.length === 1 ? fixtureJobs[0].mapId : null;
    if (mapId && projectId) {
      const { readSiyuanMapManifest } =
        await import('/src/features/context/siyuan/siyuanMapManifest.ts');
      job = fixtureJobs[0];
      manifest = readSiyuanMapManifest(projectId, mapId);
    }
    return {
      mapId,
      projectId,
      fixtureMatchCount: fixtureJobs.length,
      cardText: card?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      progress: progress
        ? {
            valueNow: progress.getAttribute('aria-valuenow'),
            valueText: progress.getAttribute('aria-valuetext'),
            paused: progress.getAttribute('data-paused'),
            motion: progress.getAttribute('data-motion'),
            estimated: progress.getAttribute('data-estimated'),
            canvasAriaHidden: progress.querySelector('canvas')?.getAttribute('aria-hidden') ?? null,
          }
        : null,
      workingVisible: Boolean(working),
      animatedNodes,
      pauseVisible: [...document.querySelectorAll('button')].some(
        (button) => button.textContent?.trim() === 'Pause',
      ),
      resumeVisible: [...document.querySelectorAll('button')].some(
        (button) => button.textContent?.trim() === 'Resume',
      ),
      job,
      manifest,
    };
  });
}

async function installRunningFixture(page) {
  return page.evaluate(async () => {
    const { useAuthStore } = await import('/src/stores/auth.ts');
    const { checkpointSiyuanIndexJob, listSiyuanIndexJobs, readSiyuanIndexJob } =
      await import('/src/features/context/siyuan/siyuanIndexJobStore.ts');
    const { readSiyuanMapManifest, updateSiyuanMapManifest, writeSiyuanMapManifest } =
      await import('/src/features/context/siyuan/siyuanMapManifest.ts');
    const projectId = useAuthStore.getState().projectId;
    if (!projectId) throw new Error('No active Context project');
    const fixtureJobs = (await listSiyuanIndexJobs(projectId)).filter((candidate) =>
      candidate.canonicalRoot
        .replaceAll('\\', '/')
        .endsWith('/vibespace-pr31-context-fixture-20260827'),
    );
    if (fixtureJobs.length !== 1) {
      throw new Error(`Expected one deterministic Context fixture, found ${fixtureJobs.length}`);
    }
    const mapId = fixtureJobs[0].mapId;
    const originalJob = await readSiyuanIndexJob(projectId, mapId);
    const originalManifest = readSiyuanMapManifest(projectId, mapId);
    if (!originalJob || !originalManifest)
      throw new Error('Deterministic Context fixture is incomplete');
    const now = Date.now();
    const runningJob = {
      ...originalJob,
      phase: 'discovering',
      status: 'running',
      pauseReason: null,
      cursor: 68,
      frontierLength: 100,
      indexed: Math.max(68, originalJob.indexed),
      createdNodes: originalJob.createdNodes,
      phaseStartedAt: now - 90_000,
      discoverySamples: [
        { at: now - 30_000, processed: 20, frontierRemaining: 80, discovered: 100 },
        { at: now - 15_000, processed: 44, frontierRemaining: 56, discovered: 100 },
        { at: now, processed: 68, frontierRemaining: 32, discovered: 100 },
      ],
      estimatedPercent: 68,
      estimatedEtaSeconds: 180,
      reconciledAt: null,
      startupDisposition: null,
      startupDispositionAt: null,
      startedAt: now - 120_000,
      updatedAt: now,
      completedAt: null,
    };
    await checkpointSiyuanIndexJob({ job: runningJob }, { forceStatus: true });
    writeSiyuanMapManifest(updateSiyuanMapManifest(originalManifest, { status: 'indexing' }, now));
    return { projectId, mapId, originalJob, originalManifest, runningJob };
  });
}

async function restoreFixture(page, snapshot) {
  return page.evaluate(async (snapshot) => {
    const { checkpointSiyuanIndexJob, readSiyuanIndexJob } =
      await import('/src/features/context/siyuan/siyuanIndexJobStore.ts');
    const { readSiyuanMapManifest, writeSiyuanMapManifest } =
      await import('/src/features/context/siyuan/siyuanMapManifest.ts');
    await checkpointSiyuanIndexJob({ job: snapshot.originalJob }, { forceStatus: true });
    writeSiyuanMapManifest(snapshot.originalManifest);
    const restoredJob = await readSiyuanIndexJob(snapshot.projectId, snapshot.mapId);
    const restoredManifest = readSiyuanMapManifest(snapshot.projectId, snapshot.mapId);
    return { restoredJob, restoredManifest };
  }, snapshot);
}

let attachment;
let recorder;
let packet;
let originalViewport = null;
let originalReducedMotion = false;
let fixtureSnapshot = null;
let fixtureRestored = false;

try {
  const captureHead = git('rev-parse', 'HEAD');
  attachment = await attachOfficialNative({ chromium });
  recorder = createPageEventRecorder(attachment.page, { limit: 200 });
  packet = createEvidencePacket({
    taskId: 'PR31-CONTEXT-PROGRESS-PAUSE-RESUME-NATIVE',
    captureHead,
    identity: attachment.identity,
    safety: attachment.safety,
    metadata: {
      fixtureAuthority:
        'existing local vibespace-pr31-context-fixture-20260827 with exact job/manifest snapshot-and-restore',
      modelDispatched: false,
      modelIdentity: null,
      appRestarted: false,
      credentialsMutated: false,
      productionMutated: false,
      normalViewport: NORMAL_VIEWPORT,
      narrowViewport: NARROW_VIEWPORT,
    },
  });
  const page = attachment.page;
  originalViewport = page.viewportSize();
  originalReducedMotion = await page.evaluate(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByText('Context', { exact: true }).first().click();
  await waitForSemantic({
    description: 'selected official Context map',
    timeoutMs: 30_000,
    intervalMs: 200,
    observe: () => readContextDomState(page),
    accept: (state) =>
      Boolean(state.fixtureMatchCount === 1 && state.mapId && state.job && state.manifest),
  });
  fixtureSnapshot = await installRunningFixture(page);
  packet.metadata.fixture = {
    projectId: fixtureSnapshot.projectId,
    mapId: fixtureSnapshot.mapId,
    originalJobSha256: sha256(JSON.stringify(fixtureSnapshot.originalJob)),
    originalManifestSha256: sha256(JSON.stringify(fixtureSnapshot.originalManifest)),
    originalStatus: fixtureSnapshot.originalJob.status,
    originalPhase: fixtureSnapshot.originalJob.phase,
  };

  await page.setViewportSize(NORMAL_VIEWPORT);
  const running = (
    await waitForSemantic({
      description: 'Context running progress with working animation',
      timeoutMs: 10_000,
      intervalMs: 100,
      observe: () => readContextDomState(page),
      accept: (state) =>
        state.job?.status === 'running' &&
        state.progress?.paused === 'false' &&
        state.workingVisible &&
        state.pauseVisible,
    })
  ).value;
  must(
    packet,
    'running Context progress exposes truthful progressbar and active working state',
    running.progress?.valueText?.includes('Approximately 68%') &&
      running.progress?.canvasAriaHidden === 'true' &&
      running.progress?.motion === 'full' &&
      running.animatedNodes.some((node) => node.animationName !== 'none'),
    running,
  );
  await capture(packet, page, '06-context-running-normal-attempt-03.png', {
    jobStatus: 'running',
    progress: running.progress,
    providerActivity: false,
  });

  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = (
    await waitForSemantic({
      description: 'durably paused Context progress',
      timeoutMs: 20_000,
      intervalMs: 100,
      observe: () => readContextDomState(page),
      accept: (state) =>
        state.job?.status === 'paused' &&
        state.progress?.paused === 'true' &&
        !state.workingVisible &&
        state.resumeVisible,
    })
  ).value;
  const pauseStability = await page.evaluate(async ({ projectId, mapId }) => {
    const { readSiyuanIndexJob } =
      await import('/src/features/context/siyuan/siyuanIndexJobStore.ts');
    const before = await readSiyuanIndexJob(projectId, mapId);
    await new Promise((resolvePromise) => {
      let frames = 0;
      const observe = () => {
        frames += 1;
        if (frames >= 8) resolvePromise(undefined);
        else requestAnimationFrame(observe);
      };
      requestAnimationFrame(observe);
    });
    const after = await readSiyuanIndexJob(projectId, mapId);
    return {
      before: before
        ? {
            status: before.status,
            updatedAt: before.updatedAt,
            cursor: before.cursor,
            indexed: before.indexed,
            createdNodes: before.createdNodes,
          }
        : null,
      after: after
        ? {
            status: after.status,
            updatedAt: after.updatedAt,
            cursor: after.cursor,
            indexed: after.indexed,
            createdNodes: after.createdNodes,
          }
        : null,
    };
  }, fixtureSnapshot);
  must(
    packet,
    'paused Context checkpoint remains stable with no new local work',
    JSON.stringify(pauseStability.before) === JSON.stringify(pauseStability.after),
    pauseStability,
  );
  must(
    packet,
    'paused Context progress announces paused state and preserves ETA/progress',
    paused.progress?.valueText?.includes('paused') &&
      paused.cardText.includes('Paused safely') &&
      paused.cardText.includes('ETA'),
    paused,
  );
  await page.setViewportSize(NARROW_VIEWPORT);
  await capture(packet, page, '07-context-paused-narrow-attempt-03.png', {
    jobStatus: 'paused',
    progress: paused.progress,
    checkpointStable: true,
    providerActivity: false,
  });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  const resumed = (
    await waitForSemantic({
      description: 'resumed Context progress under reduced motion',
      timeoutMs: 10_000,
      intervalMs: 50,
      observe: () => readContextDomState(page),
      accept: (state) =>
        state.job?.status === 'running' &&
        state.progress?.paused === 'false' &&
        state.progress?.motion === 'reduced' &&
        state.workingVisible,
    })
  ).value;
  must(
    packet,
    'resume restores running state while reduced motion keeps working icon static',
    resumed.animatedNodes.every((node) => node.animationName === 'none') &&
      resumed.progress?.canvasAriaHidden === 'true' &&
      resumed.progress?.motion === 'reduced',
    resumed,
  );
  await capture(packet, page, '08-context-resumed-narrow-reduced-motion-attempt-03.png', {
    jobStatus: 'running',
    progress: resumed.progress,
    reducedMotion: true,
    providerActivity: false,
  });
  packet.metadata.states = { running, paused, pauseStability, resumed };
} catch (error) {
  if (!packet) {
    packet = createEvidencePacket({
      taskId: 'PR31-CONTEXT-PROGRESS-PAUSE-RESUME-NATIVE',
      captureHead: git('rev-parse', 'HEAD'),
    });
  }
  recordFirstFailure(packet, error, 'context_progress_pause_resume');
  if (attachment?.page) {
    await capture(packet, attachment.page, 'FAIL-context-progress-pause-resume-attempt-03.png', {
      firstFailure: packet.firstFailure,
    }).catch(() => undefined);
  }
} finally {
  if (attachment?.page) {
    try {
      const page = attachment.page;
      await page
        .getByText('Chat', { exact: true })
        .first()
        .click()
        .catch(() => undefined);
      await page
        .getByRole('textbox', { name: 'Message' })
        .waitFor({ state: 'visible', timeout: 15_000 })
        .catch(() => undefined);
      if (fixtureSnapshot) {
        const restored = await restoreFixture(page, fixtureSnapshot);
        fixtureRestored =
          JSON.stringify(restored.restoredJob) === JSON.stringify(fixtureSnapshot.originalJob) &&
          JSON.stringify(restored.restoredManifest) ===
            JSON.stringify(fixtureSnapshot.originalManifest);
        must(
          packet,
          'original Context job and manifest were restored byte-for-byte',
          fixtureRestored,
          {
            restoredJobSha256: sha256(JSON.stringify(restored.restoredJob)),
            restoredManifestSha256: sha256(JSON.stringify(restored.restoredManifest)),
            expectedJobSha256: sha256(JSON.stringify(fixtureSnapshot.originalJob)),
            expectedManifestSha256: sha256(JSON.stringify(fixtureSnapshot.originalManifest)),
          },
        );
      }
      await page.emulateMedia({
        reducedMotion: originalReducedMotion ? 'reduce' : 'no-preference',
      });
      if (originalViewport) await page.setViewportSize(originalViewport);
    } catch (error) {
      recordFirstFailure(packet, error, 'context_fixture_restore');
    }
  }
  recorder?.dispose();
  await attachment?.browser.close().catch(() => undefined);
  try {
    packet.safety.push(await safety('context-progress:after'));
  } catch (error) {
    recordFirstFailure(packet, error, 'context_progress_after');
  }
}

const events = recorder?.snapshot() ?? [];
const failureEvents = events.filter(
  (event) => event.source !== 'console' || event.type === 'error',
);
recordAssertion(
  packet,
  'no console errors, page errors, or network failures were recorded',
  failureEvents.length === 0,
  {
    failureEventCount: failureEvents.length,
  },
);
recordAssertion(packet, 'console warnings are retained as bounded hashed evidence', true, {
  warningCount: events.filter((event) => event.source === 'console' && event.type === 'warning')
    .length,
});
const completed = finalizeEvidencePacket(packet, { events });
const output = await writeEvidencePacket({
  evidenceDirectory: HERE,
  name:
    completed.status === 'passed'
      ? 'context-progress-report-attempt-03.json'
      : 'context-progress-failure-attempt-03.json',
  packet: completed,
});
process.stdout.write(`${JSON.stringify({ status: completed.status, fixtureRestored, output })}\n`);
process.exitCode = completed.status === 'passed' ? 0 : 1;
