import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';
import sharp from 'sharp';

import {
  NativeAcceptanceHarnessError,
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
const RECEIPT_ATTRIBUTE = 'data-vibespace-opencode-catalog-evidence';
const REFRESH_INTERVAL_MS = 300_000;

const git = (...args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim();

function receiptIsAuthenticated(receipt) {
  return (
    receipt?.schemaVersion === 1 &&
    receipt?.connectionId === 'opencode-cli' &&
    receipt?.authority === 'current-session-authenticated' &&
    receipt?.sessionChecked === true &&
    receipt?.available === true &&
    receipt?.auth === 'authenticated' &&
    Number.isSafeInteger(receipt?.catalogGeneration) &&
    Number.isSafeInteger(receipt?.accountGeneration) &&
    Number.isSafeInteger(receipt?.lastVerifiedAt) &&
    Number.isSafeInteger(receipt?.routeCount) &&
    receipt.routeCount > 0 &&
    /^[0-9a-f]{64}$/u.test(receipt?.catalogSha256 ?? '')
  );
}

async function readReceipt(page) {
  return page.evaluate((attribute) => {
    const serialized = document.documentElement.getAttribute(attribute);
    if (!serialized) return null;
    try {
      return JSON.parse(serialized);
    } catch {
      return null;
    }
  }, RECEIPT_ATTRIBUTE);
}

async function wakeIfNeeded(page) {
  const ambient = page.getByRole('dialog', { name: /Ambient mode/u });
  if (await ambient.isVisible().catch(() => false)) {
    await page.keyboard.press('Shift');
    await ambient.waitFor({ state: 'hidden', timeout: 10_000 });
  }
}

async function readRenderedRoutes(page, screenshotName) {
  const receipt = await readReceipt(page);
  if (!receiptIsAuthenticated(receipt)) {
    throw new Error('OpenCode current-session authority was not authenticated before route access');
  }
  await wakeIfNeeded(page);
  const trigger = page.getByRole('button', { name: 'Choose model' });
  await trigger.waitFor({ state: 'visible', timeout: 15_000 });
  await trigger.click();
  const picker = page.getByRole('dialog', { name: 'Choose AI model' });
  try {
    await picker.waitFor({ state: 'visible', timeout: 10_000 });
    const search = picker.getByRole('searchbox', { name: 'Search providers and models' });
    await search.fill('opencode');
    const rows = picker.locator('[role="option"][data-value^="opencode-cli:"]');
    await rows.first().waitFor({ state: 'visible', timeout: 20_000 });
    const rendered = await rows.evaluateAll((options) =>
      options.map((option) => ({
        qualifiedId: option.getAttribute('data-value') ?? '',
        disabled: option.getAttribute('aria-disabled') === 'true',
        selected: option.getAttribute('aria-selected') === 'true',
        accessibleText: option.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      })),
    );
    const artifact = await captureScreenshot({
      page,
      evidenceDirectory: HERE,
      name: screenshotName,
      imageMetadata: async (buffer) => sharp(buffer).metadata(),
    });
    return {
      receipt,
      count: rendered.length,
      orderedQualifiedIds: rendered.map((row) => row.qualifiedId),
      orderSha256: sha256(rendered.map((row) => row.qualifiedId).join('\n')),
      allEnabled: rendered.every((row) => !row.disabled),
      selectedQualifiedIds: rendered.filter((row) => row.selected).map((row) => row.qualifiedId),
      artifact,
    };
  } finally {
    await page.keyboard.press('Escape').catch(() => undefined);
    await picker.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
  }
}

async function safety(label) {
  return assertZeroOllama(captureSafetySnapshot(await readWindowsNativeState(), label), label);
}

let attachment;
let recorder;
let packet;
let baseline;
let finalSnapshot;
let checkpointIndex = 0;

try {
  const captureHead = git('rev-parse', 'HEAD');
  attachment = await attachOfficialNative({ chromium });
  recorder = createPageEventRecorder(attachment.page, { limit: 200 });
  packet = createEvidencePacket({
    taskId: 'PR31-OPENCODE-REFRESH-RECONNECT-NATIVE-CB75639D',
    captureHead,
    identity: attachment.identity,
    safety: attachment.safety,
    metadata: {
      contractCommit: 'f03dd4bd079c7fb42241f4e16982decb2b744123',
      receiptCommit: 'cb75639d5f50231124c3090d6ba8672098f0f8d4',
      receiptAttribute: RECEIPT_ATTRIBUTE,
      officialSameAppSession: true,
      manualRefreshUsed: false,
      appRestartUsed: false,
      modelDispatched: false,
      credentialsMutated: false,
      productionMutated: false,
    },
  });

  const baselineReceiptWait = await waitForSemantic({
    description: 'authenticated OpenCode DOM receipt before rendered route access',
    timeoutMs: 30_000,
    intervalMs: 250,
    observe: () => readReceipt(attachment.page),
    accept: receiptIsAuthenticated,
  });
  baseline = await readRenderedRoutes(
    attachment.page,
    '00-opencode-refresh-baseline-attempt-02.png',
  );
  recordAssertion(
    packet,
    'baseline receipt is current-session authenticated',
    true,
    baseline.receipt,
  );
  const baselineArtifact = baseline.artifact;
  packet.artifacts.push(baselineArtifact);
  await writeEvidencePacket({
    evidenceDirectory: HERE,
    name: 'opencode-refresh-baseline-attempt-02.json',
    packet: {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      sourceHead: captureHead,
      identity: attachment.identity,
      safety: attachment.safety,
      baselineReceiptWait: {
        attempts: baselineReceiptWait.attempts,
        elapsedMs: baselineReceiptWait.elapsedMs,
      },
      receipt: baseline.receipt,
      renderedRoutes: baseline,
      artifact: baselineArtifact,
      prohibitions: packet.metadata,
    },
  });
  process.stdout.write(
    `${JSON.stringify({ phase: 'baseline', receipt: baseline.receipt, routeCount: baseline.count, routeHash: baseline.orderSha256 })}\n`,
  );

  const observerStartedAt = Date.now();
  while (!finalSnapshot && Date.now() - observerStartedAt < REFRESH_INTERVAL_MS + 120_000) {
    try {
      const result = await waitForSemantic({
        description: 'next naturally scheduled authenticated OpenCode receipt',
        timeoutMs: 30_000,
        intervalMs: 1_000,
        observe: () => readReceipt(attachment.page),
        accept: (receipt) =>
          receiptIsAuthenticated(receipt) &&
          receipt.refreshReason === 'scheduled' &&
          receipt.lastVerifiedAt > baseline.receipt.lastVerifiedAt &&
          receipt.previousVerifiedAt === baseline.receipt.lastVerifiedAt &&
          receipt.elapsedSincePreviousVerifiedMs >= REFRESH_INTERVAL_MS,
      });
      finalSnapshot = result.value;
    } catch (error) {
      if (
        !(error instanceof NativeAcceptanceHarnessError) ||
        error.code !== 'semantic_wait_timeout'
      ) {
        throw error;
      }
      checkpointIndex += 1;
      const checkpointSafety = await safety(`scheduled-observer:checkpoint-${checkpointIndex}`);
      const receipt = await readReceipt(attachment.page);
      const checkpoint = {
        schemaVersion: 1,
        capturedAt: new Date().toISOString(),
        checkpointIndex,
        observerElapsedMs: Date.now() - observerStartedAt,
        baselineLastVerifiedAt: baseline.receipt.lastVerifiedAt,
        currentReceipt: receipt,
        receiptAdvanced: (receipt?.lastVerifiedAt ?? 0) > baseline.receipt.lastVerifiedAt,
        safety: checkpointSafety,
      };
      await writeEvidencePacket({
        evidenceDirectory: HERE,
        name: `checkpoint-attempt-02-${String(checkpointIndex).padStart(2, '0')}.json`,
        packet: checkpoint,
      });
      process.stdout.write(`${JSON.stringify({ phase: 'checkpoint', ...checkpoint })}\n`);
    }
  }
  if (!finalSnapshot) throw new Error('A qualifying scheduled OpenCode receipt was not observed');

  const finalRoutes = await readRenderedRoutes(
    attachment.page,
    '02-opencode-refresh-scheduled-attempt-02.png',
  );
  const finalArtifact = finalRoutes.artifact;
  packet.artifacts.push(finalArtifact);
  recordAssertion(
    packet,
    'scheduled receipt elapsed at least 300000ms',
    finalSnapshot.elapsedSincePreviousVerifiedMs >= REFRESH_INTERVAL_MS,
    finalSnapshot,
  );
  recordAssertion(
    packet,
    'scheduled receipt catalog identity stayed exact',
    finalSnapshot.routeCount === baseline.receipt.routeCount &&
      finalSnapshot.catalogSha256 === baseline.receipt.catalogSha256,
    {
      beforeCount: baseline.receipt.routeCount,
      afterCount: finalSnapshot.routeCount,
      beforeCatalogSha256: baseline.receipt.catalogSha256,
      afterCatalogSha256: finalSnapshot.catalogSha256,
    },
  );
  recordAssertion(
    packet,
    'rendered ordered qualified routes stayed exact',
    finalRoutes.orderSha256 === baseline.orderSha256 &&
      finalRoutes.count === baseline.count &&
      finalRoutes.orderedQualifiedIds.every(
        (route, index) => route === baseline.orderedQualifiedIds[index],
      ),
    {
      beforeCount: baseline.count,
      afterCount: finalRoutes.count,
      beforeOrderSha256: baseline.orderSha256,
      afterOrderSha256: finalRoutes.orderSha256,
    },
  );
  recordAssertion(
    packet,
    'no rendered OpenCode route became disabled',
    baseline.allEnabled && finalRoutes.allEnabled,
  );
  packet.metadata.baseline = baseline;
  packet.metadata.scheduled = { receipt: finalSnapshot, renderedRoutes: finalRoutes };
  packet.metadata.managedReconnect = {
    attempted: false,
    status: 'pending-safe-control',
    blocker:
      'No documented public same-session managed-runtime disconnect control was exercised by this evidence-only observer. A process kill, credential toggle, developer-state injection, manual refresh, or whole-app restart is outside the authorized acceptance boundary.',
  };
} catch (error) {
  if (!packet) {
    packet = createEvidencePacket({
      taskId: 'PR31-OPENCODE-REFRESH-RECONNECT-NATIVE-CB75639D',
      captureHead: git('rev-parse', 'HEAD'),
    });
  }
  recordFirstFailure(packet, error, 'opencode_refresh_observer');
} finally {
  recorder?.dispose();
  await attachment?.browser.close().catch(() => undefined);
  try {
    packet.safety.push(await safety('scheduled-observer:after'));
  } catch (error) {
    recordFirstFailure(packet, error, 'scheduled_observer_after');
  }
}

const events = recorder?.snapshot() ?? [];
recordAssertion(
  packet,
  'no console, page, or network failures were recorded',
  events.length === 0,
  {
    eventCount: events.length,
  },
);
const completed = finalizeEvidencePacket(packet, { events });
const output = await writeEvidencePacket({
  evidenceDirectory: HERE,
  name:
    completed.status === 'passed'
      ? 'opencode-refresh-scheduled-final-attempt-02.json'
      : 'opencode-refresh-scheduled-failure-attempt-02.json',
  packet: completed,
});
process.stdout.write(
  `${JSON.stringify({ phase: 'complete', status: completed.status, output })}\n`,
);
process.exitCode = completed.status === 'passed' ? 0 : 1;
