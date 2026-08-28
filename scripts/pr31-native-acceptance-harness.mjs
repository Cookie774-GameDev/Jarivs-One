#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execFileCallback);

export const DEFAULT_CDP_PORT = 9223;
export const DEFAULT_CDP_ENDPOINT = `http://127.0.0.1:${DEFAULT_CDP_PORT}`;
export const OFFICIAL_WINDOW_TITLE = 'VibeSpace';
export const OFFICIAL_PROFILE_PARTS = Object.freeze(['ai.jarvis.desktop', 'EBWebView']);

const SAFE_CODE = /^[a-z][a-z0-9_.:-]{1,127}$/u;
const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}\.(?:json|png)$/u;
const SENSITIVE_KEY = /(?:token|secret|password|credential|authorization|cancellation.?key)/iu;
const SENSITIVE_QUERY_KEY =
  /^(?:access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|key|secret|client[_-]?secret|password|pass|authorization|signature|sig|code|cancellation[_-]?key)$/iu;
const SENSITIVE_VALUE_PATTERNS = Object.freeze([
  /\b(?:authorization\s*:\s*)?(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/iu,
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|password|authorization|cancellation[_-]?key)\s*[:=]\s*[^\s&,;]{4,}/iu,
  /\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{12,}/u,
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{30,}|xox[baprs]-[A-Za-z0-9-]{12,})\b/u,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/u,
]);
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);

export class NativeAcceptanceHarnessError extends Error {
  constructor(code, stage = 'harness', details = undefined) {
    super(code);
    this.name = 'NativeAcceptanceHarnessError';
    this.code = SAFE_CODE.test(code) ? code : 'native_acceptance_failed';
    this.stage = SAFE_CODE.test(stage) ? stage : 'harness';
    this.details = sanitizeEvidence(details);
  }
}

function fail(code, stage, details) {
  throw new NativeAcceptanceHarnessError(code, stage, details);
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isSecretBearingValue(value) {
  if (SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value))) return true;
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(value)) return false;
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) return true;
    return [...parsed.searchParams.keys()].some((name) => SENSITIVE_QUERY_KEY.test(name));
  } catch {
    return false;
  }
}

export function sanitizeEvidence(value, key = '', depth = 0) {
  if (depth > 8) return '[depth-limited]';
  if (SENSITIVE_KEY.test(key)) return '[redacted]';
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    return isSecretBearingValue(value) ? '[redacted-secret-bearing-value]' : value.slice(0, 1_024);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 200).map((item) => sanitizeEvidence(item, key, depth + 1));
  }
  if (typeof value === 'object') {
    const result = {};
    for (const [childKey, childValue] of Object.entries(value).slice(0, 200)) {
      result[childKey] = sanitizeEvidence(childValue, childKey, depth + 1);
    }
    return result;
  }
  return String(value).slice(0, 1_024);
}

function normalizeProcess(raw) {
  return {
    name: String(raw?.Name ?? raw?.name ?? ''),
    pid: Number(raw?.ProcessId ?? raw?.pid),
    parentPid: Number(raw?.ParentProcessId ?? raw?.parentPid),
    executablePath: String(raw?.ExecutablePath ?? raw?.executablePath ?? ''),
    commandLine: String(raw?.CommandLine ?? raw?.commandLine ?? ''),
  };
}

function normalizeListener(raw) {
  return {
    localAddress: String(raw?.LocalAddress ?? raw?.localAddress ?? ''),
    localPort: Number(raw?.LocalPort ?? raw?.localPort),
    owningProcess: Number(raw?.OwningProcess ?? raw?.owningProcess),
  };
}

function normalizeWindowsPath(value) {
  return path.win32
    .normalize(String(value ?? ''))
    .replace(/[\\/]+$/u, '')
    .toLowerCase();
}

function commandLineValue(commandLine, option) {
  const escaped = option.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = String(commandLine).match(
    new RegExp(`(?:^|\\s)--${escaped}(?:=|\\s+)(?:"([^"]+)"|'([^']+)'|([^\\s]+))`, 'iu'),
  );
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function isDescendant(candidate, ancestorPid, byPid) {
  const visited = new Set();
  let cursor = candidate;
  while (cursor && cursor.parentPid > 0 && !visited.has(cursor.pid)) {
    if (cursor.parentPid === ancestorPid) return true;
    visited.add(cursor.pid);
    cursor = byPid.get(cursor.parentPid);
  }
  return false;
}

export function resolveOfficialNativeTarget(rawProcesses, options = {}) {
  const localAppData = String(options.localAppData ?? '');
  if (!localAppData) fail('local_app_data_unavailable', 'identity');
  const officialProfile = normalizeWindowsPath(
    path.win32.join(localAppData, ...OFFICIAL_PROFILE_PARTS),
  );
  const processes = (rawProcesses ?? [])
    .map(normalizeProcess)
    .filter((item) => Number.isInteger(item.pid) && item.pid > 0);
  const byPid = new Map(processes.map((item) => [item.pid, item]));
  const jarvisProcesses = processes.filter(
    (item) =>
      item.name.toLowerCase() === 'jarvis.exe' &&
      path.win32.basename(item.executablePath).toLowerCase() === 'jarvis.exe' &&
      (!options.jarvisPid || item.pid === options.jarvisPid),
  );
  const candidates = [];
  for (const jarvis of jarvisProcesses) {
    for (const process of processes) {
      if (
        process.name.toLowerCase() !== 'msedgewebview2.exe' ||
        !isDescendant(process, jarvis.pid, byPid)
      ) {
        continue;
      }
      const profile = commandLineValue(process.commandLine, 'user-data-dir');
      const cdpPort = Number(commandLineValue(process.commandLine, 'remote-debugging-port'));
      if (
        !profile ||
        normalizeWindowsPath(profile) !== officialProfile ||
        !Number.isInteger(cdpPort) ||
        cdpPort < 1 ||
        cdpPort > 65_535 ||
        (options.cdpPort && cdpPort !== options.cdpPort)
      ) {
        continue;
      }
      candidates.push({
        jarvis,
        webView: process,
        profile: path.win32.normalize(profile),
        cdpPort,
      });
    }
  }
  const unique = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.jarvis.pid}:${candidate.cdpPort}`;
    const previous = unique.get(key);
    const candidateIsRoot = candidate.webView.parentPid === candidate.jarvis.pid;
    const previousIsRoot = previous?.webView.parentPid === previous?.jarvis.pid;
    if (
      !previous ||
      (candidateIsRoot && !previousIsRoot) ||
      (candidateIsRoot === previousIsRoot && candidate.webView.pid < previous.webView.pid)
    ) {
      unique.set(key, candidate);
    }
  }
  if (unique.size !== 1) {
    fail(
      unique.size === 0 ? 'official_native_target_not_found' : 'official_native_target_ambiguous',
      'identity',
      { candidateCount: unique.size },
    );
  }
  const [{ jarvis, webView, profile, cdpPort }] = unique.values();
  return Object.freeze({
    jarvisPid: jarvis.pid,
    webViewPid: webView.pid,
    executablePath: jarvis.executablePath,
    profile,
    cdpPort,
    endpoint: `http://127.0.0.1:${cdpPort}`,
    ownership: 'jarvis_descendant_exact_official_profile',
  });
}

export function captureSafetySnapshot(rawState, label = 'safety') {
  const processes = (rawState?.processes ?? []).map(normalizeProcess);
  const listeners = (rawState?.listeners ?? []).map(normalizeListener);
  return Object.freeze({
    label: String(label).slice(0, 160),
    capturedAt: String(rawState?.capturedAt ?? new Date().toISOString()),
    ollamaProcessCount: processes.filter((item) => item.name.toLowerCase() === 'ollama.exe').length,
    listener11434Count: listeners.filter((item) => item.localPort === 11_434).length,
  });
}

export function assertZeroOllama(snapshot, stage = 'safety') {
  if (snapshot?.ollamaProcessCount !== 0 || snapshot?.listener11434Count !== 0) {
    fail('forbidden_ollama_or_11434', stage, snapshot);
  }
  return snapshot;
}

export function captureOfficialIdentity(rawState, options = {}) {
  const target = resolveOfficialNativeTarget(rawState?.processes ?? [], options);
  const listeners = (rawState?.listeners ?? []).map(normalizeListener);
  const cdpListeners = listeners.filter((item) => item.localPort === target.cdpPort);
  if (
    cdpListeners.length !== 1 ||
    cdpListeners[0].owningProcess !== target.webViewPid ||
    !LOOPBACK_HOSTS.has(cdpListeners[0].localAddress)
  ) {
    fail('official_cdp_listener_ownership_mismatch', 'identity', {
      cdpPort: target.cdpPort,
      listenerCount: cdpListeners.length,
      listenerOwnerPid: cdpListeners[0]?.owningProcess ?? null,
      expectedOwnerPid: target.webViewPid,
    });
  }
  return Object.freeze({
    ...target,
    listenerAddress: cdpListeners[0].localAddress,
    capturedAt: String(rawState?.capturedAt ?? new Date().toISOString()),
  });
}

export async function readWindowsNativeState(dependencies = {}) {
  const platform = dependencies.platform ?? process.platform;
  if (platform !== 'win32') fail('windows_required', 'process_probe');
  const run = dependencies.execFile ?? execFile;
  const command = [
    '$processes=@(Get-CimInstance Win32_Process | Select-Object Name,ProcessId,ParentProcessId,ExecutablePath,CommandLine)',
    '$listeners=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess)',
    '[pscustomobject]@{capturedAt=(Get-Date -Format o);processes=$processes;listeners=$listeners}|ConvertTo-Json -Depth 5 -Compress',
  ].join(';');
  let stdout;
  try {
    ({ stdout } = await run(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { encoding: 'utf8', windowsHide: true, timeout: 15_000, maxBuffer: 8 * 1024 * 1024 },
    ));
  } catch {
    fail('process_inspection_unavailable', 'process_probe');
  }
  try {
    const parsed = JSON.parse(stdout);
    return {
      capturedAt: parsed.capturedAt,
      processes: Array.isArray(parsed.processes)
        ? parsed.processes
        : [parsed.processes].filter(Boolean),
      listeners: Array.isArray(parsed.listeners)
        ? parsed.listeners
        : [parsed.listeners].filter(Boolean),
    };
  } catch {
    fail('process_inspection_invalid', 'process_probe');
  }
}

function defaultDelay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

export async function waitForSemantic(options) {
  const description = String(options?.description ?? 'condition');
  const observe = options?.observe;
  const accept = options?.accept ?? Boolean;
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const intervalMs = options?.intervalMs ?? 100;
  const clock = options?.clock ?? (() => Date.now());
  const delay = options?.delay ?? defaultDelay;
  if (
    typeof observe !== 'function' ||
    typeof accept !== 'function' ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs < 0 ||
    !Number.isFinite(intervalMs) ||
    intervalMs < 0
  ) {
    fail('invalid_semantic_wait', 'wait');
  }
  const started = clock();
  let attempts = 0;
  let lastValue;
  while (clock() - started <= timeoutMs) {
    attempts += 1;
    lastValue = await observe();
    options?.onObservation?.(sanitizeEvidence(lastValue), attempts);
    if (await accept(lastValue)) {
      return Object.freeze({ value: lastValue, attempts, elapsedMs: clock() - started });
    }
    await delay(intervalMs);
  }
  fail('semantic_wait_timeout', 'wait', {
    description,
    attempts,
    elapsedMs: clock() - started,
    lastValue: sanitizeEvidence(lastValue),
  });
}

export function assertSemantic(name, condition, details = undefined) {
  if (!condition) fail('semantic_assertion_failed', 'assertion', { name, details });
  return Object.freeze({ name: String(name), passed: true, details: sanitizeEvidence(details) });
}

export async function probeOfficialPage(page) {
  if (!page || (typeof page.isClosed === 'function' && page.isClosed())) {
    return { ready: false, reason: 'closed' };
  }
  let url;
  let title;
  let documentProof;
  try {
    url = page.url();
    title = await page.title();
    documentProof = await page.evaluate(() => ({
      readyState: document.readyState,
      hasRoot: Boolean(document.querySelector('#root')),
      hasTauri:
        typeof window.__TAURI_INTERNALS__ === 'object' && window.__TAURI_INTERNALS__ !== null,
      hasPublicSurface: Boolean(
        document.querySelector('main, [role="main"], nav, [role="navigation"]'),
      ),
    }));
  } catch {
    return { ready: false, reason: 'inspection_failed' };
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ready: false, reason: 'invalid_url', url: String(url) };
  }
  const ready =
    LOOPBACK_HOSTS.has(parsed.hostname) &&
    title === OFFICIAL_WINDOW_TITLE &&
    documentProof.readyState === 'complete' &&
    documentProof.hasRoot &&
    documentProof.hasTauri &&
    documentProof.hasPublicSurface;
  return {
    ready,
    reason: ready ? 'official_ready' : 'not_ready',
    url: parsed.href,
    title,
    ...documentProof,
  };
}

export async function selectStableOfficialPage(pagesProvider, options = {}) {
  const getPages =
    typeof pagesProvider === 'function' ? pagesProvider : async () => [...(pagesProvider ?? [])];
  const stableObservations = options.stableObservations ?? 2;
  let previousKey = '';
  let stableCount = 0;
  const result = await waitForSemantic({
    description: 'one stable official VibeSpace page',
    timeoutMs: options.timeoutMs ?? 10_000,
    intervalMs: options.intervalMs ?? 100,
    clock: options.clock,
    delay: options.delay,
    observe: async () => {
      const pages = await getPages();
      const inspected = [];
      for (const page of pages) inspected.push({ page, proof: await probeOfficialPage(page) });
      const candidates = inspected.filter((item) => item.proof.ready);
      if (candidates.length !== 1) {
        previousKey = '';
        stableCount = 0;
        return { accepted: false, candidateCount: candidates.length, pageCount: pages.length };
      }
      const candidate = candidates[0];
      const key = `${candidate.proof.url}\n${candidate.proof.title}`;
      stableCount = key === previousKey ? stableCount + 1 : 1;
      previousKey = key;
      return {
        accepted: stableCount >= stableObservations,
        candidateCount: 1,
        stableCount,
        page: candidate.page,
        proof: candidate.proof,
      };
    },
    accept: (value) => value.accepted === true,
  });
  return Object.freeze({
    page: result.value.page,
    proof: Object.freeze(result.value.proof),
    attempts: result.attempts,
    stableObservations: result.value.stableCount,
  });
}

function identityKey(identity) {
  return [
    identity.jarvisPid,
    identity.webViewPid,
    identity.cdpPort,
    normalizeWindowsPath(identity.executablePath),
    normalizeWindowsPath(identity.profile),
    identity.ownership,
  ].join('|');
}

export async function attachOfficialNative(options = {}) {
  const stateProbe = options.stateProbe ?? readWindowsNativeState;
  const localAppData = options.localAppData ?? process.env.LOCALAPPDATA;
  const beforeState = await stateProbe();
  const safetyBefore = assertZeroOllama(
    captureSafetySnapshot(beforeState, 'attach:before'),
    'attach',
  );
  const identityBefore = captureOfficialIdentity(beforeState, {
    localAppData,
    cdpPort: options.cdpPort,
    jarvisPid: options.jarvisPid,
  });
  const chromium = options.chromium;
  if (!chromium || typeof chromium.connectOverCDP !== 'function') {
    fail('chromium_dependency_required', 'attach');
  }
  let browser;
  try {
    browser = await chromium.connectOverCDP(identityBefore.endpoint, {
      timeout: options.attachTimeoutMs ?? 10_000,
    });
    const selected = await selectStableOfficialPage(
      () => browser.contexts().flatMap((context) => context.pages()),
      {
        timeoutMs: options.readinessTimeoutMs ?? 10_000,
        intervalMs: options.intervalMs ?? 100,
        stableObservations: options.stableObservations ?? 2,
        clock: options.clock,
        delay: options.delay,
      },
    );
    const afterState = await stateProbe();
    const safetyAfter = assertZeroOllama(
      captureSafetySnapshot(afterState, 'attach:after'),
      'attach',
    );
    const identityAfter = captureOfficialIdentity(afterState, {
      localAppData,
      cdpPort: identityBefore.cdpPort,
      jarvisPid: identityBefore.jarvisPid,
    });
    if (identityKey(identityBefore) !== identityKey(identityAfter)) {
      fail('official_native_identity_changed', 'attach', {
        before: identityBefore,
        after: identityAfter,
      });
    }
    return Object.freeze({
      browser,
      page: selected.page,
      readiness: selected,
      identity: identityAfter,
      safety: Object.freeze([safetyBefore, safetyAfter]),
    });
  } catch (error) {
    await browser?.close().catch(() => undefined);
    throw error;
  }
}

export async function waitForSemanticLocator(locator, options = {}) {
  const state = options.state ?? 'visible';
  return waitForSemantic({
    description: options.description ?? `locator ${state}`,
    timeoutMs: options.timeoutMs ?? 10_000,
    intervalMs: options.intervalMs ?? 100,
    clock: options.clock,
    delay: options.delay,
    observe: async () => ({
      count: await locator.count(),
      visible: await locator.isVisible().catch(() => false),
      enabled: await locator.isEnabled().catch(() => false),
    }),
    accept: (value) => {
      if (state === 'absent') return value.count === 0;
      if (state === 'hidden') return value.count === 0 || !value.visible;
      if (state === 'enabled') return value.count === 1 && value.visible && value.enabled;
      return value.count === 1 && value.visible;
    },
  });
}

export async function discoverCanonicalApprovalTarget(page, options = {}) {
  const actionId = String(options.actionId ?? '');
  const expectedApprovalStatus = String(options.approvalStatus ?? 'pending');
  const expectedRunStatus = String(options.runStatus ?? 'awaiting_approval');
  const expectedMessagePartStatus = String(options.messagePartStatus ?? 'pending');
  const readStoredApproval = options.readStoredApproval;
  const stableObservations = options.stableObservations ?? 2;
  if (
    !page?.getByRole ||
    !SAFE_CODE.test(actionId) ||
    !SAFE_CODE.test(expectedApprovalStatus) ||
    !SAFE_CODE.test(expectedRunStatus) ||
    !SAFE_CODE.test(expectedMessagePartStatus) ||
    typeof readStoredApproval !== 'function' ||
    !Number.isInteger(stableObservations) ||
    stableObservations < 1
  ) {
    fail('invalid_canonical_approval_discovery', 'discovery');
  }

  const groups = page.getByRole('group');
  let lastIdentityKey = null;
  let stableCount = 0;
  let acceptedTarget = null;
  const result = await waitForSemantic({
    description:
      options.description ?? 'one accessible canonical approval with exact stored identity',
    timeoutMs: options.timeoutMs ?? 10_000,
    intervalMs: options.intervalMs ?? 100,
    clock: options.clock,
    delay: options.delay,
    observe: async () => {
      const groupCount = await groups.count();
      const candidates = [];
      for (let index = 0; index < Math.min(groupCount, 100); index += 1) {
        const card = groups.nth(index);
        const [visible, kind, status, cardActionId, approvalId, labelledBy] = await Promise.all([
          card.isVisible().catch(() => false),
          card.getAttribute('data-approval-kind'),
          card.getAttribute('data-status'),
          card.getAttribute('data-action-id'),
          card.getAttribute('data-approval-id'),
          card.getAttribute('aria-labelledby'),
        ]);
        if (
          !visible ||
          kind !== 'canonical' ||
          status !== expectedApprovalStatus ||
          cardActionId !== actionId ||
          typeof approvalId !== 'string' ||
          approvalId.length < 1 ||
          approvalId.length > 256 ||
          typeof labelledBy !== 'string' ||
          labelledBy.length < 1
        ) {
          continue;
        }
        const deny = card.getByRole('button', { name: 'Deny action', exact: true });
        const [denyCount, denyVisible, denyEnabled] = await Promise.all([
          deny.count(),
          deny.isVisible().catch(() => false),
          deny.isEnabled().catch(() => false),
        ]);
        if (denyCount !== 1 || !denyVisible || !denyEnabled) continue;
        candidates.push({ card, approvalId });
      }

      if (candidates.length !== 1) {
        lastIdentityKey = null;
        stableCount = 0;
        acceptedTarget = null;
        return {
          accessibleGroupCount: groupCount,
          exactCardCount: candidates.length,
          storedIdentityExact: false,
          stableCount,
        };
      }

      const candidate = candidates[0];
      let storedIdentity = null;
      try {
        storedIdentity = await readStoredApproval(candidate.approvalId);
      } catch {
        storedIdentity = null;
      }
      const approval = storedIdentity?.approval;
      const run = storedIdentity?.run;
      const messagePart = storedIdentity?.messagePart;
      const storedIdentityExact = Boolean(
        approval &&
        run &&
        messagePart &&
        approval.id === candidate.approvalId &&
        approval.actionId === actionId &&
        approval.status === expectedApprovalStatus &&
        typeof approval.runId === 'string' &&
        run.id === approval.runId &&
        run.status === expectedRunStatus &&
        messagePart.approvalId === candidate.approvalId &&
        messagePart.actionId === actionId &&
        messagePart.status === expectedMessagePartStatus,
      );
      if (!storedIdentityExact) {
        lastIdentityKey = null;
        stableCount = 0;
        acceptedTarget = null;
        return {
          accessibleGroupCount: groupCount,
          exactCardCount: 1,
          storedIdentityExact: false,
          stableCount,
        };
      }

      const identityKey = [
        candidate.approvalId,
        approval.runId,
        approval.actionId,
        approval.status,
        run.status,
        messagePart.status,
      ].join(':');
      stableCount = identityKey === lastIdentityKey ? stableCount + 1 : 1;
      lastIdentityKey = identityKey;
      acceptedTarget = { ...candidate, storedIdentity };
      return {
        accessibleGroupCount: groupCount,
        exactCardCount: 1,
        storedIdentityExact: true,
        stableCount,
      };
    },
    accept: (observation) =>
      observation.storedIdentityExact && observation.stableCount >= stableObservations,
  });

  if (!acceptedTarget) fail('canonical_approval_discovery_lost', 'discovery');
  return Object.freeze({
    ...acceptedTarget,
    observations: result.attempts,
    elapsedMs: result.elapsedMs,
    stableObservations: result.value.stableCount,
  });
}

export async function assertSemanticText(locator, expected, options = {}) {
  const actual = String((await locator.textContent()) ?? '').trim();
  const passed =
    expected instanceof RegExp
      ? expected.test(actual)
      : options.exact === false
        ? actual.includes(String(expected))
        : actual === String(expected);
  return assertSemantic(options.name ?? 'semantic text', passed, {
    actualSha256: sha256(actual),
    actualCharCount: actual.length,
  });
}

export async function assertSemanticAttribute(locator, attribute, expected, options = {}) {
  const actual = await locator.getAttribute(attribute);
  return assertSemantic(options.name ?? `attribute ${attribute}`, actual === expected, {
    attribute,
    actual,
    expected,
  });
}

export function createPageEventRecorder(page, options = {}) {
  const events = [];
  const limit = options.limit ?? 200;
  const push = (event) => {
    if (events.length < limit) events.push(Object.freeze(event));
  };
  const onConsole = (message) => {
    if (!['error', 'warning'].includes(message.type())) return;
    const text = String(message.text());
    push({
      source: 'console',
      type: message.type(),
      textSha256: sha256(text),
      charCount: text.length,
    });
  };
  const onPageError = (error) => {
    const text = String(error);
    push({
      source: 'page',
      type: error?.name ?? 'Error',
      textSha256: sha256(text),
      charCount: text.length,
    });
  };
  const onRequestFailed = (request) => {
    const raw = String(request.failure()?.errorText ?? '');
    const code = raw.match(/(?:net::)?(ERR_[A-Z0-9_]+)/u)?.[1] ?? 'request_failed';
    push({ source: 'network', type: code, resourceType: request.resourceType() });
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('requestfailed', onRequestFailed);
  return Object.freeze({
    snapshot: () => Object.freeze(events.map((event) => ({ ...event }))),
    dispose: () => {
      page.off?.('console', onConsole);
      page.off?.('pageerror', onPageError);
      page.off?.('requestfailed', onRequestFailed);
    },
  });
}

export function createEvidencePacket(options = {}) {
  return {
    schemaVersion: 1,
    taskId: String(options.taskId ?? 'native-acceptance').slice(0, 160),
    startedAt: String(options.startedAt ?? new Date().toISOString()),
    status: 'running',
    captureHead: String(options.captureHead ?? ''),
    identity: sanitizeEvidence(options.identity),
    safety: sanitizeEvidence(options.safety ?? []),
    assertions: [],
    artifacts: [],
    events: [],
    firstFailure: null,
    metadata: sanitizeEvidence(options.metadata ?? {}),
  };
}

export function recordAssertion(packet, name, passed, details = undefined) {
  const entry = Object.freeze({
    name: String(name),
    passed: Boolean(passed),
    details: sanitizeEvidence(details),
  });
  packet.assertions.push(entry);
  if (!entry.passed) {
    recordFirstFailure(
      packet,
      new NativeAcceptanceHarnessError('semantic_assertion_failed', 'assertion', { name, details }),
    );
  }
  return entry;
}

export function recordFirstFailure(packet, error, stage = undefined) {
  if (packet.firstFailure) return packet.firstFailure;
  const known = error instanceof NativeAcceptanceHarnessError;
  packet.firstFailure = Object.freeze({
    code: known ? error.code : 'native_acceptance_unexpected_failure',
    stage: stage ?? (known ? error.stage : 'scenario'),
    name: known ? error.name : 'Error',
    details: known ? sanitizeEvidence(error.details) : undefined,
  });
  packet.status = 'failed';
  return packet.firstFailure;
}

export function finalizeEvidencePacket(packet, options = {}) {
  if (options.events) packet.events = sanitizeEvidence(options.events);
  if (options.safety) packet.safety = sanitizeEvidence(options.safety);
  packet.completedAt = String(options.completedAt ?? new Date().toISOString());
  if (!packet.firstFailure) {
    packet.status = packet.assertions.every((item) => item.passed) ? 'passed' : 'failed';
  }
  return Object.freeze(sanitizeEvidence(packet));
}

async function ensureEvidenceDirectory(directory) {
  const resolvedInput = path.resolve(directory);
  await mkdir(resolvedInput, { recursive: true });
  const info = await lstat(resolvedInput);
  if (!info.isDirectory() || info.isSymbolicLink()) fail('unsafe_evidence_directory', 'evidence');
  return realpath(resolvedInput);
}

export async function captureScreenshot(options) {
  const evidenceDirectory = await ensureEvidenceDirectory(options.evidenceDirectory);
  const name = String(options.name ?? 'screenshot.png');
  if (!SAFE_FILE_NAME.test(name) || !name.endsWith('.png')) {
    fail('unsafe_screenshot_name', 'screenshot');
  }
  const outputPath = path.join(evidenceDirectory, name);
  const buffer = await options.page.screenshot({
    path: outputPath,
    animations: 'disabled',
    fullPage: options.fullPage === true,
  });
  const metadata = await options.imageMetadata(buffer, outputPath);
  if (
    !Number.isInteger(metadata?.width) ||
    metadata.width < 1 ||
    !Number.isInteger(metadata?.height) ||
    metadata.height < 1
  ) {
    fail('invalid_screenshot_dimensions', 'screenshot');
  }
  return Object.freeze({
    name,
    width: metadata.width,
    height: metadata.height,
    byteCount: buffer.length,
    sha256: sha256(buffer),
  });
}

export async function writeEvidencePacket(options) {
  const evidenceDirectory = await ensureEvidenceDirectory(options.evidenceDirectory);
  const name = String(options.name ?? 'native-acceptance.json');
  if (!SAFE_FILE_NAME.test(name) || !name.endsWith('.json')) {
    fail('unsafe_evidence_name', 'evidence');
  }
  const outputPath = path.join(evidenceDirectory, name);
  const body = `${JSON.stringify(sanitizeEvidence(options.packet), null, 2)}\n`;
  await writeFile(outputPath, body, { encoding: 'utf8', flag: options.overwrite ? 'w' : 'wx' });
  return Object.freeze({ name, byteCount: Buffer.byteLength(body), sha256: sha256(body) });
}

export function parseArgs(argv) {
  const options = { smoke: false, cdpPort: DEFAULT_CDP_PORT };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!name.startsWith('--') || seen.has(name)) fail('invalid_arguments', 'arguments');
    seen.add(name);
    if (name === '--smoke-current') {
      options.smoke = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail('invalid_arguments', 'arguments');
    index += 1;
    if (name === '--evidence-dir') options.evidenceDirectory = path.resolve(value);
    else if (name === '--cdp-port') options.cdpPort = Number(value);
    else if (name === '--jarvis-pid') options.jarvisPid = Number(value);
    else fail('invalid_arguments', 'arguments');
  }
  if (!options.smoke || !options.evidenceDirectory) fail('smoke_arguments_required', 'arguments');
  if (!Number.isInteger(options.cdpPort) || options.cdpPort < 1 || options.cdpPort > 65_535) {
    fail('invalid_cdp_port', 'arguments');
  }
  if (
    options.jarvisPid !== undefined &&
    (!Number.isInteger(options.jarvisPid) || options.jarvisPid < 1)
  ) {
    fail('invalid_jarvis_pid', 'arguments');
  }
  return Object.freeze(options);
}

async function currentGitHead() {
  try {
    const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const { stdout } = await execFile('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10_000,
    });
    return stdout.trim();
  } catch {
    return '';
  }
}

export async function runReadOnlySmoke(options, dependencies = {}) {
  const stateProbe = dependencies.stateProbe ?? readWindowsNativeState;
  const beforeState = await stateProbe();
  const beforeSafety = assertZeroOllama(captureSafetySnapshot(beforeState, 'smoke:before'));
  const beforeIdentity = captureOfficialIdentity(beforeState, {
    localAppData: dependencies.localAppData ?? process.env.LOCALAPPDATA,
    cdpPort: options.cdpPort,
    jarvisPid: options.jarvisPid,
  });
  const packet = createEvidencePacket({
    taskId: 'PR31-NATIVE-ACCEPTANCE-HARNESS-SMOKE',
    captureHead: dependencies.captureHead ?? (await currentGitHead()),
    identity: beforeIdentity,
    safety: [beforeSafety],
    metadata: { boundary: 'read-only current official public identity; no navigation or dispatch' },
  });
  let attachment;
  let recorder;
  try {
    attachment = await attachOfficialNative({
      chromium: dependencies.chromium,
      stateProbe,
      localAppData: dependencies.localAppData ?? process.env.LOCALAPPDATA,
      cdpPort: options.cdpPort,
      jarvisPid: options.jarvisPid,
      readinessTimeoutMs: options.readinessTimeoutMs,
    });
    recorder = createPageEventRecorder(attachment.page);
    const publicIdentity = await attachment.page.evaluate(() => ({
      title: document.title,
      route: new URL(window.location.href).searchParams.get('route'),
      readyState: document.readyState,
      hasRoot: Boolean(document.querySelector('#root')),
      hasTauri:
        typeof window.__TAURI_INTERNALS__ === 'object' && window.__TAURI_INTERNALS__ !== null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    }));
    recordAssertion(
      packet,
      'official current page is publicly ready',
      publicIdentity.title === OFFICIAL_WINDOW_TITLE &&
        publicIdentity.readyState === 'complete' &&
        publicIdentity.hasRoot &&
        publicIdentity.hasTauri,
      publicIdentity,
    );
    const artifact = await captureScreenshot({
      page: attachment.page,
      evidenceDirectory: options.evidenceDirectory,
      name: '00-native-harness-smoke.png',
      imageMetadata: dependencies.imageMetadata,
    });
    packet.artifacts.push(artifact);
    packet.metadata.publicIdentity = sanitizeEvidence(publicIdentity);
  } catch (error) {
    recordFirstFailure(packet, error);
  } finally {
    recorder?.dispose();
    await attachment?.browser.close().catch(() => undefined);
    const afterState = await stateProbe();
    const afterSafety = captureSafetySnapshot(afterState, 'smoke:after');
    try {
      assertZeroOllama(afterSafety);
    } catch (error) {
      recordFirstFailure(packet, error, 'smoke_after');
    }
    packet.safety.push(afterSafety);
  }
  const completed = finalizeEvidencePacket(packet, { events: recorder?.snapshot() ?? [] });
  const report = await writeEvidencePacket({
    evidenceDirectory: options.evidenceDirectory,
    name:
      completed.status === 'passed' ? 'native-harness-smoke.json' : 'native-harness-failure.json',
    packet: completed,
  });
  return Object.freeze({ ok: completed.status === 'passed', packet: completed, report });
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const [{ chromium }, sharpModule] = await Promise.all([
    import('playwright-core'),
    import('sharp'),
  ]);
  const result = await runReadOnlySmoke(options, {
    chromium,
    imageMetadata: async (buffer) => sharpModule.default(buffer).metadata(),
  });
  process.stdout.write(`${JSON.stringify({ ok: result.ok, report: result.report.name })}\n`);
  return result.ok ? 0 : 1;
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() ===
    path.resolve(fileURLToPath(import.meta.url)).toLowerCase();
if (invokedDirectly) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      const code =
        error instanceof NativeAcceptanceHarnessError
          ? error.code
          : 'native_acceptance_harness_failed';
      process.stderr.write(`${JSON.stringify({ ok: false, code })}\n`);
      process.exitCode = 1;
    });
}
