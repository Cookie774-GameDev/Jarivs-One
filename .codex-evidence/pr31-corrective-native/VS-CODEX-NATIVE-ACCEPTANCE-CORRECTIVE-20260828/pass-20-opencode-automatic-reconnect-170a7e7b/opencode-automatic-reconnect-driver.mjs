import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
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

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const HERE = resolve(SCRIPT_DIR, process.env.NATIVE_PASS || '.');
const ROOT = resolve(SCRIPT_DIR, '../../../..');
const RECEIPT_ATTRIBUTE = 'data-vibespace-opencode-catalog-evidence';
const REQUIRED_ROUTE = 'opencode-cli:opencode-go/deepseek-v4-flash-vision-exp';
const EXPECTED_HEAD =
  process.env.NATIVE_EXPECTED_HEAD || '170a7e7be4cf4757b9752ca3a10875acce37bb65';
const RUNTIME_EVENT = 'vibespace://opencode-runtime-state';
const runFile = promisify(execFile);

const git = (...args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim();

function rawField(value, ...names) {
  for (const name of names) {
    if (value?.[name] !== undefined) return value[name];
  }
  return undefined;
}

function normalizedProcess(value) {
  return {
    name: String(rawField(value, 'Name', 'name') ?? ''),
    pid: Number(rawField(value, 'ProcessId', 'pid')),
    parentPid: Number(rawField(value, 'ParentProcessId', 'parentPid')),
    executablePath: String(rawField(value, 'ExecutablePath', 'executablePath') ?? ''),
    commandLine: String(rawField(value, 'CommandLine', 'commandLine') ?? ''),
  };
}

function normalizedListener(value) {
  return {
    localAddress: String(rawField(value, 'LocalAddress', 'localAddress') ?? ''),
    localPort: Number(rawField(value, 'LocalPort', 'localPort')),
    owningProcess: Number(rawField(value, 'OwningProcess', 'owningProcess')),
  };
}

function resolveOwnedOpenCode(state, jarvisPid) {
  const children = state.processes
    .map(normalizedProcess)
    .filter(
      (process) => process.name.toLowerCase() === 'opencode.exe' && process.parentPid === jarvisPid,
    );
  if (children.length !== 1) {
    throw new Error(`Expected exactly one jarvis-owned OpenCode child; found ${children.length}`);
  }
  const child = children[0];
  const command = child.commandLine;
  const hostname = command.match(/--hostname\s+([^\s"]+)/u)?.[1] ?? '';
  const port = Number(command.match(/--port\s+(\d+)/u)?.[1]);
  const executableIsOpenCode = /[\\/]opencode-ai[\\/]bin[\\/]opencode\.exe$/iu.test(
    child.executablePath,
  );
  if (!/\bserve\b/u.test(command) || hostname !== '127.0.0.1' || !Number.isInteger(port)) {
    throw new Error('Owned OpenCode child command line is not the exact loopback serve shape');
  }
  if (!executableIsOpenCode) {
    throw new Error('Owned OpenCode child executable path is outside the installed OpenCode CLI');
  }
  const listeners = state.listeners
    .map(normalizedListener)
    .filter((listener) => listener.owningProcess === child.pid && listener.localPort === port);
  if (listeners.length !== 1 || !['127.0.0.1', '::1'].includes(listeners[0].localAddress)) {
    throw new Error('Owned OpenCode child does not own exactly one expected loopback listener');
  }
  return Object.freeze({
    pid: child.pid,
    parentPid: child.parentPid,
    executablePath: child.executablePath,
    commandShape: 'opencode.exe serve --hostname 127.0.0.1 --port <ephemeral>',
    hostname,
    port,
    listenerAddress: listeners[0].localAddress,
  });
}

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

async function readServerStatus(page) {
  return page.evaluate(async () => {
    const internals = window.__TAURI_INTERNALS__;
    if (!internals || typeof internals.invoke !== 'function') return null;
    const value = await internals.invoke('opencode_server_status');
    if (!value || typeof value !== 'object') return null;
    return {
      version: typeof value.version === 'string' ? value.version : '',
      source: typeof value.source === 'string' ? value.source : '',
      generation: typeof value.generation === 'string' ? value.generation : '',
    };
  });
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
    const orderedQualifiedIds = await rows.evaluateAll((options) =>
      options.map((option) => option.getAttribute('data-value') ?? ''),
    );
    const artifact = await captureScreenshot({
      page,
      evidenceDirectory: HERE,
      name: screenshotName,
      imageMetadata: async (buffer) => sharp(buffer).metadata(),
    });
    return {
      count: orderedQualifiedIds.length,
      orderSha256: sha256(orderedQualifiedIds.join('\n')),
      orderedQualifiedIds,
      artifact,
    };
  } finally {
    await page.keyboard.press('Escape').catch(() => undefined);
    await picker.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
  }
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  await new Promise((resolvePromise, rejectPromise) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('end', resolvePromise);
    stream.once('error', rejectPromise);
  });
  return hash.digest('hex');
}

async function stopExactOwnedChild(pid) {
  if (!Number.isInteger(pid) || pid < 1) throw new Error('Refusing to stop an invalid PID');
  const command = [
    `$target=Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'`,
    "if (-not $target -or $target.Name -ne 'opencode.exe') { throw 'Exact OpenCode PID is no longer owned' }",
    `Stop-Process -Id ${pid} -Force -ErrorAction Stop`,
    `Wait-Process -Id ${pid} -Timeout 10 -ErrorAction SilentlyContinue`,
  ].join(';');
  await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15_000,
  });
}

async function armRuntimeObserver(page) {
  return page.evaluate(
    async ({ eventName, timeoutMs }) => {
      const resources = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((name) => name.includes('@tauri-apps_api_event'));
      const candidates = [...resources, '/node_modules/.vite/deps/@tauri-apps_api_event.js'].filter(
        (value, index, values) => values.indexOf(value) === index,
      );
      let eventModule = null;
      let selectedModule = '';
      for (const candidate of candidates) {
        try {
          const loaded = await import(candidate);
          if (typeof loaded.listen === 'function') {
            eventModule = loaded;
            selectedModule = candidate;
            break;
          }
        } catch {
          // Try the next renderer-loaded local module URL.
        }
      }
      if (!eventModule) {
        return {
          armed: false,
          reason: 'tauri_event_module_unavailable',
          moduleCandidates: candidates,
        };
      }
      const events = [];
      let unlisten = null;
      const result = await new Promise(async (resolvePromise) => {
        const finish = (value) => {
          try {
            unlisten?.();
          } catch {
            // Evidence cleanup is best-effort after the bounded observation resolves.
          }
          resolvePromise(value);
        };
        const timer = window.setTimeout(
          () => finish({ armed: true, timedOut: true, selectedModule, events }),
          timeoutMs,
        );
        unlisten = await eventModule.listen(eventName, ({ payload }) => {
          const kind = typeof payload?.kind === 'string' ? payload.kind : 'unknown';
          const safe = { kind, observedAt: Date.now() };
          if (kind === 'failed') {
            safe.recoverable = payload?.recoverable === true;
            safe.expectedCrashMessage = payload?.message === 'OpenCode server exited unexpectedly.';
            safe.messageLength = typeof payload?.message === 'string' ? payload.message.length : 0;
          }
          if (kind === 'ready') {
            safe.source = typeof payload?.source === 'string' ? payload.source : '';
            safe.version = typeof payload?.version === 'string' ? payload.version : '';
            safe.generation = typeof payload?.generation === 'string' ? payload.generation : '';
          }
          events.push(safe);
          const kinds = events.map((event) => event.kind);
          const failed = kinds.indexOf('failed');
          const starting = kinds.indexOf('starting', failed + 1);
          const ready = kinds.indexOf('ready', starting + 1);
          if (failed >= 0 && starting > failed && ready > starting) {
            window.clearTimeout(timer);
            finish({ armed: true, timedOut: false, selectedModule, events });
          }
        });
        console.debug(`PR31_OPENCODE_OBSERVER_ARMED:${selectedModule}`);
      });
      return result;
    },
    { eventName: RUNTIME_EVENT, timeoutMs: 90_000 },
  );
}

async function safety(label) {
  return assertZeroOllama(captureSafetySnapshot(await readWindowsNativeState(), label), label);
}

let attachment;
let recorder;
let packet;
let baseline;
let beforeChild;
let observerResult;
let processActionTaken = false;

try {
  const captureHead = git('rev-parse', 'HEAD');
  if (captureHead !== EXPECTED_HEAD) {
    throw new Error(`Stable capture HEAD changed: expected ${EXPECTED_HEAD}, got ${captureHead}`);
  }
  attachment = await attachOfficialNative({ chromium });
  recorder = createPageEventRecorder(attachment.page, { limit: 200 });
  const executableSha256 = await sha256File(attachment.identity.executablePath);
  packet = createEvidencePacket({
    taskId: 'PR31-OPENCODE-AUTOMATIC-RECONNECT-170A7E7B',
    captureHead,
    identity: { ...attachment.identity, executableSha256 },
    safety: attachment.safety,
    metadata: {
      contractCommit: 'f03dd4bd079c7fb42241f4e16982decb2b744123',
      receiptCommit: 'cb75639d5f50231124c3090d6ba8672098f0f8d4',
      stableRendererCommit: EXPECTED_HEAD,
      officialSameAppSession: true,
      appRestartUsed: false,
      manualRefreshUsed: false,
      genericStopHelperUsed: false,
      modelDispatched: false,
      credentialsMutated: false,
      productionMutated: false,
      authorizedProcessAction: 'terminate exact jarvis-owned opencode.exe child PID only',
    },
  });

  const baselineSafety = await safety('automatic-reconnect:baseline');
  const baselineState = await readWindowsNativeState();
  beforeChild = resolveOwnedOpenCode(baselineState, attachment.identity.jarvisPid);
  const receiptWait = await waitForSemantic({
    description: 'authenticated current-session OpenCode receipt before crash action',
    timeoutMs: 30_000,
    intervalMs: 250,
    observe: () => readReceipt(attachment.page),
    accept: receiptIsAuthenticated,
  });
  const receipt = receiptWait.value;
  const serverStatus = await readServerStatus(attachment.page);
  if (!serverStatus?.generation) throw new Error('Native OpenCode server status is unavailable');
  const rendered = await readRenderedRoutes(
    attachment.page,
    '00-opencode-automatic-reconnect-before.png',
  );
  packet.artifacts.push(rendered.artifact);
  baseline = { safety: baselineSafety, child: beforeChild, receipt, serverStatus, rendered };
  recordAssertion(packet, 'baseline receipt is current-session authenticated', true, receipt);
  recordAssertion(
    packet,
    'baseline OpenCode child is exact jarvis-owned loopback server',
    beforeChild.parentPid === attachment.identity.jarvisPid,
    beforeChild,
  );

  let armedResolve;
  const armed = new Promise((resolvePromise) => {
    armedResolve = resolvePromise;
  });
  const onArmConsole = (message) => {
    const text = message.text();
    if (!text.startsWith('PR31_OPENCODE_OBSERVER_ARMED:')) return;
    attachment.page.off('console', onArmConsole);
    armedResolve({ selectedModule: text.slice('PR31_OPENCODE_OBSERVER_ARMED:'.length) });
  };
  attachment.page.on('console', onArmConsole);
  const observerPromise = armRuntimeObserver(attachment.page);
  const armReceipt = await Promise.race([
    armed,
    new Promise((_, rejectPromise) =>
      setTimeout(
        () => rejectPromise(new Error('Runtime observer did not arm before timeout')),
        15_000,
      ),
    ),
  ]);
  recordAssertion(packet, 'runtime event observer armed before process action', true, armReceipt);

  const actionSafety = await safety('automatic-reconnect:before-exact-child-stop');
  const actionState = await readWindowsNativeState();
  const actionChild = resolveOwnedOpenCode(actionState, attachment.identity.jarvisPid);
  if (
    actionChild.pid !== beforeChild.pid ||
    actionChild.executablePath !== beforeChild.executablePath ||
    actionChild.port !== beforeChild.port
  ) {
    throw new Error('Owned OpenCode child identity changed between baseline and process action');
  }
  await stopExactOwnedChild(actionChild.pid);
  processActionTaken = true;
  packet.safety.push(actionSafety);
  observerResult = await observerPromise;
  recordAssertion(
    packet,
    'automatic runtime lifecycle emitted failed then starting then ready',
    observerResult.armed === true && observerResult.timedOut === false,
    observerResult,
  );

  const readyEvent = observerResult.events.findLast((event) => event.kind === 'ready');
  const finalStatusWait = await waitForSemantic({
    description: 'replacement OpenCode server status with a new generation',
    timeoutMs: 45_000,
    intervalMs: 250,
    observe: () => readServerStatus(attachment.page),
    accept: (status) =>
      Boolean(
        status?.generation &&
        status.generation !== baseline.serverStatus.generation &&
        status.generation === readyEvent?.generation,
      ),
  });
  const finalStatus = finalStatusWait.value;
  const finalChildWait = await waitForSemantic({
    description: 'replacement jarvis-owned OpenCode child and loopback listener',
    timeoutMs: 30_000,
    intervalMs: 250,
    observe: async () => {
      try {
        return resolveOwnedOpenCode(await readWindowsNativeState(), attachment.identity.jarvisPid);
      } catch {
        return null;
      }
    },
    accept: (child) => Boolean(child && child.pid !== beforeChild.pid),
  });
  const finalChild = finalChildWait.value;
  const finalReceiptWait = await waitForSemantic({
    description: 'automatic current-session authenticated receipt after runtime reconnect',
    timeoutMs: 60_000,
    intervalMs: 500,
    observe: () => readReceipt(attachment.page),
    accept: (next) =>
      receiptIsAuthenticated(next) &&
      next.lastVerifiedAt > baseline.receipt.lastVerifiedAt &&
      next.catalogGeneration > baseline.receipt.catalogGeneration &&
      next.accountGeneration > baseline.receipt.accountGeneration &&
      next.refreshReason === 'authority-changed',
  });
  const finalReceipt = finalReceiptWait.value;
  const finalRendered = await readRenderedRoutes(
    attachment.page,
    '02-opencode-automatic-reconnect-ready.png',
  );
  packet.artifacts.push(finalRendered.artifact);
  const finalSafety = await safety('automatic-reconnect:final');
  const finalState = await readWindowsNativeState();
  const jarvisStillPresent = finalState.processes
    .map(normalizedProcess)
    .some(
      (process) => process.pid === attachment.identity.jarvisPid && process.name === 'jarvis.exe',
    );

  recordAssertion(packet, 'official jarvis session stayed exact', jarvisStillPresent, {
    jarvisPid: attachment.identity.jarvisPid,
  });
  recordAssertion(
    packet,
    'replacement child has new PID and same executable',
    finalChild.pid !== beforeChild.pid &&
      finalChild.parentPid === beforeChild.parentPid &&
      finalChild.executablePath === beforeChild.executablePath,
    { before: beforeChild, after: finalChild },
  );
  recordAssertion(
    packet,
    'runtime generation advanced exactly through ready event',
    finalStatus.generation !== baseline.serverStatus.generation &&
      finalStatus.generation === readyEvent?.generation,
    { before: baseline.serverStatus, readyEvent, after: finalStatus },
  );
  recordAssertion(
    packet,
    'catalog receipt revalidated under the replacement runtime authority',
    finalReceipt.lastVerifiedAt > baseline.receipt.lastVerifiedAt &&
      finalReceipt.catalogGeneration > baseline.receipt.catalogGeneration &&
      finalReceipt.accountGeneration > baseline.receipt.accountGeneration &&
      finalReceipt.refreshReason === 'authority-changed',
    { before: baseline.receipt, after: finalReceipt },
  );
  recordAssertion(
    packet,
    'exact selected DeepSeek route stayed available after automatic reconnect',
    baseline.rendered.orderedQualifiedIds.includes(REQUIRED_ROUTE) &&
      finalRendered.orderedQualifiedIds.includes(REQUIRED_ROUTE),
    {
      requiredRoute: REQUIRED_ROUTE,
      beforeCount: baseline.rendered.count,
      afterCount: finalRendered.count,
      beforeSha256: baseline.rendered.orderSha256,
      afterSha256: finalRendered.orderSha256,
      providerCatalogChanged:
        finalRendered.count !== baseline.rendered.count ||
        finalRendered.orderSha256 !== baseline.rendered.orderSha256,
    },
  );
  packet.safety.push(finalSafety);
  packet.reconnect = {
    baseline: {
      child: beforeChild,
      receipt: baseline.receipt,
      serverStatus: baseline.serverStatus,
      renderedRoutes: baseline.rendered,
    },
    processAction: {
      exactPid: beforeChild.pid,
      action: 'Stop-Process -Id <exact-owned-opencode-pid> -Force',
      observerArmedFirst: true,
    },
    lifecycle: observerResult,
    final: {
      child: finalChild,
      receipt: finalReceipt,
      serverStatus: finalStatus,
      renderedRoutes: finalRendered,
    },
  };
  packet.events = recorder.snapshot();
  const finalized = finalizeEvidencePacket(packet, {
    events: recorder.snapshot(),
    safety: packet.safety,
  });
  await writeEvidencePacket({
    evidenceDirectory: HERE,
    name: 'opencode-automatic-reconnect-report.json',
    packet: finalized,
  });
  process.stdout.write(
    `${JSON.stringify({ status: finalized.status, beforePid: beforeChild.pid, afterPid: finalChild.pid, beforeGeneration: baseline.serverStatus.generation, afterGeneration: finalStatus.generation, routeCount: finalRendered.count, routeSha256: finalRendered.orderSha256, events: observerResult.events.map((event) => event.kind), safety: finalSafety })}\n`,
  );
} catch (error) {
  if (!packet) {
    packet = createEvidencePacket({
      taskId: 'PR31-OPENCODE-AUTOMATIC-RECONNECT-170A7E7B',
      captureHead: git('rev-parse', 'HEAD'),
      metadata: { processActionTaken },
    });
  }
  recordFirstFailure(packet, error, 'automatic_reconnect');
  const failureSafety = await safety('automatic-reconnect:failure').catch((safetyError) => ({
    safetyProbeFailed: true,
    errorName: safetyError?.name ?? 'Error',
  }));
  packet.safety.push(failureSafety);
  packet.reconnect = {
    processActionTaken,
    beforeChild,
    baseline,
    observerResult,
  };
  if (attachment?.page && !attachment.page.isClosed()) {
    const artifact = await captureScreenshot({
      page: attachment.page,
      evidenceDirectory: HERE,
      name: 'FAIL-opencode-automatic-reconnect.png',
      imageMetadata: async (buffer) => sharp(buffer).metadata(),
    }).catch(() => null);
    if (artifact) packet.artifacts.push(artifact);
  }
  const finalized = finalizeEvidencePacket(packet, {
    events: recorder?.snapshot() ?? [],
    safety: packet.safety,
  });
  await writeEvidencePacket({
    evidenceDirectory: HERE,
    name: 'opencode-automatic-reconnect-failure.json',
    packet: finalized,
  });
  process.stderr.write(
    `${JSON.stringify({ status: 'failed', processActionTaken, failure: finalized.firstFailure, safety: failureSafety })}\n`,
  );
  process.exitCode = 1;
} finally {
  recorder?.dispose();
  await attachment?.browser?.close().catch(() => undefined);
}
