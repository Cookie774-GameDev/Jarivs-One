import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';

import {
  NativeAcceptanceHarnessError,
  assertSemanticAttribute,
  assertSemanticText,
  assertZeroOllama,
  attachOfficialNative,
  captureOfficialIdentity,
  captureSafetySnapshot,
  captureScreenshot,
  createEvidencePacket,
  createPageEventRecorder,
  discoverCanonicalApprovalTarget,
  finalizeEvidencePacket,
  parseArgs,
  readWindowsNativeState,
  recordAssertion,
  recordFirstFailure,
  resolveOfficialNativeTarget,
  runReadOnlySmoke,
  sanitizeEvidence,
  selectStableOfficialPage,
  sha256,
  waitForSemantic,
  waitForSemanticLocator,
  writeEvidencePacket,
} from './pr31-native-acceptance-harness.mjs';

const LOCAL_APP_DATA = 'C:\\Users\\tester\\AppData\\Local';
const PROFILE = `${LOCAL_APP_DATA}\\ai.jarvis.desktop\\EBWebView`;
const tempDirectories = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function tempDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pr31-native-harness-'));
  tempDirectories.push(directory);
  return directory;
}

function processRow(name, pid, parentPid, executablePath, commandLine = '') {
  return {
    Name: name,
    ProcessId: pid,
    ParentProcessId: parentPid,
    ExecutablePath: executablePath,
    CommandLine: commandLine,
  };
}

function officialState({ jarvisPid = 100, webViewPid = 110, cdpPort = 9223 } = {}) {
  return {
    capturedAt: '2026-08-28T18:00:00.000Z',
    processes: [
      processRow('jarvis.exe', jarvisPid, 9, 'D:\\VibeSpace\\jarvis.exe', 'jarvis.exe'),
      processRow(
        'msedgewebview2.exe',
        webViewPid,
        jarvisPid,
        'C:\\Program Files\\WebView2\\msedgewebview2.exe',
        `msedgewebview2.exe --user-data-dir="${PROFILE}" --remote-debugging-port=${cdpPort}`,
      ),
      processRow(
        'msedgewebview2.exe',
        webViewPid - 1,
        webViewPid,
        'C:\\Program Files\\WebView2\\msedgewebview2.exe',
        `msedgewebview2.exe --type=renderer --user-data-dir="${PROFILE}" --remote-debugging-port=${cdpPort}`,
      ),
    ],
    listeners: [{ LocalAddress: '127.0.0.1', LocalPort: cdpPort, OwningProcess: webViewPid }],
  };
}

class FakePage extends EventEmitter {
  constructor(options = {}) {
    super();
    this.href = options.url ?? 'http://localhost:5173/?route=chat';
    this.pageTitle = options.title ?? 'VibeSpace';
    this.proofs = options.proofs ?? [
      {
        readyState: 'complete',
        hasRoot: true,
        hasTauri: true,
        hasPublicSurface: true,
      },
    ];
    this.closed = options.closed ?? false;
    this.evaluateCalls = 0;
    this.screenshotBuffer = options.screenshotBuffer ?? Buffer.from('fake-png');
  }

  url() {
    return this.href;
  }

  async title() {
    return this.pageTitle;
  }

  isClosed() {
    return this.closed;
  }

  async evaluate() {
    const value = this.proofs[Math.min(this.evaluateCalls, this.proofs.length - 1)];
    this.evaluateCalls += 1;
    return value;
  }

  async screenshot(options) {
    await writeFile(options.path, this.screenshotBuffer);
    return this.screenshotBuffer;
  }
}

class FakeLocator {
  constructor(options = {}) {
    this.countValue = options.count ?? 1;
    this.visible = options.visible ?? true;
    this.enabled = options.enabled ?? true;
    this.text = options.text ?? '';
    this.attributes = options.attributes ?? {};
  }

  async count() {
    return this.countValue;
  }

  async isVisible() {
    return this.visible;
  }

  async isEnabled() {
    return this.enabled;
  }

  async textContent() {
    return this.text;
  }

  async getAttribute(name) {
    return this.attributes[name] ?? null;
  }
}

class FakeApprovalCard extends FakeLocator {
  constructor(options = {}) {
    super(options);
    this.button = new FakeLocator({
      count: options.denyCount ?? 1,
      visible: options.denyVisible ?? true,
      enabled: options.denyEnabled ?? true,
    });
  }

  getByRole(role, options = {}) {
    assert.equal(role, 'button');
    assert.equal(options.name, 'Deny action');
    assert.equal(options.exact, true);
    return this.button;
  }
}

class FakeApprovalGroups {
  constructor(cards) {
    this.cards = cards;
  }

  async count() {
    return this.cards.length;
  }

  nth(index) {
    return this.cards[index];
  }
}

class FakeApprovalPage {
  constructor(cards) {
    this.groups = new FakeApprovalGroups(cards);
  }

  getByRole(role) {
    assert.equal(role, 'group');
    return this.groups;
  }
}

function fakeClock() {
  let now = 0;
  return {
    clock: () => now,
    delay: async (milliseconds) => {
      now += milliseconds;
    },
  };
}

function fakeChromium(page) {
  const browser = {
    closeCalls: 0,
    contexts: () => [{ pages: () => [page] }],
    async close() {
      this.closeCalls += 1;
    },
  };
  const calls = [];
  return {
    browser,
    calls,
    chromium: {
      async connectOverCDP(endpoint, options) {
        calls.push({ endpoint, options });
        return browser;
      },
    },
  };
}

test('resolves the direct jarvis WebView root on the exact official profile', () => {
  const state = officialState();
  assert.deepEqual(resolveOfficialNativeTarget(state.processes, { localAppData: LOCAL_APP_DATA }), {
    jarvisPid: 100,
    webViewPid: 110,
    executablePath: 'D:\\VibeSpace\\jarvis.exe',
    profile: PROFILE,
    cdpPort: 9223,
    endpoint: 'http://127.0.0.1:9223',
    ownership: 'jarvis_descendant_exact_official_profile',
  });
});

test('fails closed for standalone, wrong-profile, and ambiguous official targets', () => {
  const state = officialState();
  assert.throws(
    () =>
      resolveOfficialNativeTarget(
        state.processes.filter((row) => row.Name !== 'jarvis.exe'),
        { localAppData: LOCAL_APP_DATA },
      ),
    /official_native_target_not_found/u,
  );
  const wrongProfile = state.processes.map((row) => ({
    ...row,
    CommandLine: row.CommandLine.replace('ai.jarvis.desktop', 'standalone.browser'),
  }));
  assert.throws(
    () => resolveOfficialNativeTarget(wrongProfile, { localAppData: LOCAL_APP_DATA }),
    /official_native_target_not_found/u,
  );
  const other = officialState({ jarvisPid: 200, webViewPid: 210, cdpPort: 9333 });
  assert.throws(
    () =>
      resolveOfficialNativeTarget([...state.processes, ...other.processes], {
        localAppData: LOCAL_APP_DATA,
      }),
    /official_native_target_ambiguous/u,
  );
});

test('captures exact CDP listener ownership and rejects a standalone listener', () => {
  const state = officialState();
  assert.deepEqual(captureOfficialIdentity(state, { localAppData: LOCAL_APP_DATA }), {
    jarvisPid: 100,
    webViewPid: 110,
    executablePath: 'D:\\VibeSpace\\jarvis.exe',
    profile: PROFILE,
    cdpPort: 9223,
    endpoint: 'http://127.0.0.1:9223',
    ownership: 'jarvis_descendant_exact_official_profile',
    listenerAddress: '127.0.0.1',
    capturedAt: state.capturedAt,
  });
  assert.throws(
    () =>
      captureOfficialIdentity(
        {
          ...state,
          listeners: [{ LocalAddress: '127.0.0.1', LocalPort: 9223, OwningProcess: 999 }],
        },
        { localAppData: LOCAL_APP_DATA },
      ),
    /official_cdp_listener_ownership_mismatch/u,
  );
});

test('the safety guard fails on either Ollama process or port 11434 listener', () => {
  const clean = captureSafetySnapshot(officialState(), 'clean');
  assert.deepEqual(assertZeroOllama(clean), clean);
  const processViolation = captureSafetySnapshot({
    ...officialState(),
    processes: [...officialState().processes, processRow('ollama.exe', 300, 100, 'ollama.exe')],
  });
  assert.throws(() => assertZeroOllama(processViolation), /forbidden_ollama_or_11434/u);
  const portViolation = captureSafetySnapshot({
    ...officialState(),
    listeners: [...officialState().listeners, { LocalPort: 11434, OwningProcess: 300 }],
  });
  assert.throws(() => assertZeroOllama(portViolation), /forbidden_ollama_or_11434/u);
});

test('semantic waits observe state until the condition is true', async () => {
  const time = fakeClock();
  let observations = 0;
  const result = await waitForSemantic({
    description: 'three observations',
    timeoutMs: 500,
    intervalMs: 25,
    ...time,
    observe: async () => ++observations,
    accept: (value) => value === 3,
  });
  assert.deepEqual(result, { value: 3, attempts: 3, elapsedMs: 50 });
});

test('semantic wait timeout reports bounded observations without raw exceptions', async () => {
  const time = fakeClock();
  await assert.rejects(
    waitForSemantic({
      description: 'never ready',
      timeoutMs: 30,
      intervalMs: 10,
      ...time,
      observe: async () => ({ ready: false, token: 'secret-value' }),
      accept: (value) => value.ready,
    }),
    (error) => {
      assert.equal(error.code, 'semantic_wait_timeout');
      assert.equal(error.details.lastValue.token, '[redacted]');
      assert.equal(error.details.attempts, 4);
      return true;
    },
  );
});

test('stable page selection ignores non-official pages and requires repeated readiness', async () => {
  const time = fakeClock();
  const devtools = new FakePage({ title: 'DevTools' });
  const official = new FakePage();
  const selected = await selectStableOfficialPage([devtools, official], {
    timeoutMs: 200,
    intervalMs: 10,
    stableObservations: 2,
    ...time,
  });
  assert.equal(selected.page, official);
  assert.equal(selected.stableObservations, 2);
  assert.equal(selected.proof.reason, 'official_ready');
});

test('stable page selection fails closed when two official pages are ready', async () => {
  const time = fakeClock();
  await assert.rejects(
    selectStableOfficialPage([new FakePage(), new FakePage()], {
      timeoutMs: 20,
      intervalMs: 10,
      ...time,
    }),
    /semantic_wait_timeout/u,
  );
});

test('official attachment verifies identity before and after CDP readiness', async () => {
  const state = officialState();
  const page = new FakePage();
  const fake = fakeChromium(page);
  const time = fakeClock();
  let probes = 0;
  const attachment = await attachOfficialNative({
    chromium: fake.chromium,
    stateProbe: async () => {
      probes += 1;
      return state;
    },
    localAppData: LOCAL_APP_DATA,
    stableObservations: 2,
    ...time,
  });
  assert.equal(attachment.page, page);
  assert.equal(attachment.identity.jarvisPid, 100);
  assert.equal(probes, 2);
  assert.deepEqual(fake.calls, [
    { endpoint: 'http://127.0.0.1:9223', options: { timeout: 10_000 } },
  ]);
});

test('official attachment disconnects and fails closed on identity drift', async () => {
  const page = new FakePage();
  const fake = fakeChromium(page);
  const states = [officialState(), officialState({ jarvisPid: 200, webViewPid: 210 })];
  const time = fakeClock();
  await assert.rejects(
    attachOfficialNative({
      chromium: fake.chromium,
      stateProbe: async () => states.shift(),
      localAppData: LOCAL_APP_DATA,
      stableObservations: 1,
      ...time,
    }),
    /official_native_target_not_found|official_native_identity_changed/u,
  );
  assert.equal(fake.browser.closeCalls, 1);
});

test('semantic locator waits and assertions use public roles, text, and attributes', async () => {
  const time = fakeClock();
  const locator = new FakeLocator({
    text: 'Connected',
    attributes: { 'data-status': 'ready' },
  });
  const result = await waitForSemanticLocator(locator, { state: 'enabled', ...time });
  assert.equal(result.value.enabled, true);
  assert.equal((await assertSemanticText(locator, 'Connected')).passed, true);
  assert.equal((await assertSemanticText(locator, /Connect/u)).passed, true);
  assert.equal((await assertSemanticAttribute(locator, 'data-status', 'ready')).passed, true);
  await assert.rejects(assertSemanticText(locator, 'Disconnected'), /semantic_assertion_failed/u);
});

test('canonical approval discovery requires one accessible card and exact stored identity', async () => {
  const exactCard = new FakeApprovalCard({
    attributes: {
      role: 'group',
      'aria-labelledby': 'approval-title-jappr_1',
      'data-approval-kind': 'canonical',
      'data-status': 'pending',
      'data-action-id': 'files.create',
      'data-approval-id': 'jappr_1',
    },
  });
  const readStoredApproval = async (approvalId) => ({
    approval: {
      id: approvalId,
      actionId: 'files.create',
      status: 'pending',
      runId: 'run_1',
    },
    run: { id: 'run_1', status: 'awaiting_approval' },
    messagePart: {
      approvalId,
      actionId: 'files.create',
      status: 'pending',
    },
  });
  const found = await discoverCanonicalApprovalTarget(new FakeApprovalPage([exactCard]), {
    actionId: 'files.create',
    readStoredApproval,
    stableObservations: 2,
    timeoutMs: 20,
    intervalMs: 10,
    ...fakeClock(),
  });
  assert.equal(found.approvalId, 'jappr_1');
  assert.equal(found.card, exactCard);
  assert.equal(found.storedIdentity.run.status, 'awaiting_approval');

  await assert.rejects(
    discoverCanonicalApprovalTarget(new FakeApprovalPage([exactCard]), {
      actionId: 'files.create',
      readStoredApproval: async () => ({
        ...(await readStoredApproval('different_approval')),
      }),
      timeoutMs: 10,
      intervalMs: 10,
      ...fakeClock(),
    }),
    /semantic_wait_timeout/u,
  );
  await assert.rejects(
    discoverCanonicalApprovalTarget(new FakeApprovalPage([]), {
      actionId: 'files.create',
      readStoredApproval,
      timeoutMs: 10,
      intervalMs: 10,
      ...fakeClock(),
    }),
    /semantic_wait_timeout/u,
  );
});

test('page event evidence stores only hashes and bounded classifications', () => {
  const page = new FakePage();
  const recorder = createPageEventRecorder(page);
  const secret = 'sk-sensitive-value';
  page.emit('console', { type: () => 'error', text: () => secret });
  page.emit('pageerror', Object.assign(new Error(secret), { name: 'TypeError' }));
  page.emit('requestfailed', {
    failure: () => ({ errorText: 'net::ERR_CONNECTION_REFUSED' }),
    resourceType: () => 'fetch',
  });
  const events = recorder.snapshot();
  assert.equal(JSON.stringify(events).includes(secret), false);
  assert.equal(events[0].textSha256, sha256(secret));
  assert.equal(events[2].type, 'ERR_CONNECTION_REFUSED');
  recorder.dispose();
  assert.equal(page.listenerCount('console'), 0);
});

test('first failure is immutable and sensitive details are redacted', () => {
  const packet = createEvidencePacket({ taskId: 'fixture', metadata: { token: 'private' } });
  recordAssertion(packet, 'ready', true, { count: 1 });
  const first = recordFirstFailure(
    packet,
    new NativeAcceptanceHarnessError('fixture_failed', 'fixture', {
      cancellationKey: 'private-key',
      reason: 'bounded',
    }),
  );
  const second = recordFirstFailure(packet, new Error('raw secret should not appear'));
  assert.equal(first, second);
  assert.equal(first.details.cancellationKey, '[redacted]');
  assert.equal(JSON.stringify(first).includes('raw secret'), false);
  const completed = finalizeEvidencePacket(packet);
  assert.equal(completed.status, 'failed');
  assert.equal(completed.metadata.token, '[redacted]');
});

test('screenshot evidence captures exact dimensions, byte count, and digest', async () => {
  const directory = await tempDirectory();
  const page = new FakePage({ screenshotBuffer: Buffer.from('deterministic-png') });
  const artifact = await captureScreenshot({
    page,
    evidenceDirectory: directory,
    name: 'capture.png',
    imageMetadata: async () => ({ width: 1586, height: 992 }),
  });
  assert.deepEqual(artifact, {
    name: 'capture.png',
    width: 1586,
    height: 992,
    byteCount: 17,
    sha256: sha256('deterministic-png'),
  });
  assert.equal(await readFile(path.join(directory, 'capture.png'), 'utf8'), 'deterministic-png');
});

test('evidence packets are immutable on disk unless overwrite is explicit', async () => {
  const directory = await tempDirectory();
  const packet = finalizeEvidencePacket(createEvidencePacket({ taskId: 'fixture' }));
  const receipt = await writeEvidencePacket({
    evidenceDirectory: directory,
    name: 'packet.json',
    packet,
  });
  assert.equal(receipt.name, 'packet.json');
  await assert.rejects(
    writeEvidencePacket({ evidenceDirectory: directory, name: 'packet.json', packet }),
    (error) => error.code === 'EEXIST',
  );
});

test('Windows state probe parses singleton process and listener objects', async () => {
  const state = await readWindowsNativeState({
    platform: 'win32',
    execFile: async () => ({
      stdout: JSON.stringify({
        capturedAt: '2026-08-28T18:00:00.000Z',
        processes: { Name: 'jarvis.exe', ProcessId: 100 },
        listeners: { LocalAddress: '127.0.0.1', LocalPort: 9223, OwningProcess: 110 },
      }),
    }),
  });
  assert.equal(state.processes.length, 1);
  assert.equal(state.listeners.length, 1);
});

test('arguments authorize only a current-page read-only smoke', () => {
  const parsed = parseArgs([
    '--smoke-current',
    '--evidence-dir',
    'D:\\evidence',
    '--cdp-port',
    '9223',
    '--jarvis-pid',
    '100',
  ]);
  assert.equal(parsed.smoke, true);
  assert.equal(parsed.cdpPort, 9223);
  assert.equal(parsed.jarvisPid, 100);
  assert.throws(() => parseArgs(['--evidence-dir', 'D:\\evidence']), /smoke_arguments_required/u);
  assert.throws(
    () => parseArgs(['--smoke-current', '--evidence-dir', 'D:\\evidence', '--navigate', 'mcp']),
    /invalid_arguments/u,
  );
});

test('read-only smoke captures current public identity without navigation or dispatch', async () => {
  const directory = await tempDirectory();
  const state = officialState();
  const page = new FakePage({
    proofs: [
      { readyState: 'complete', hasRoot: true, hasTauri: true, hasPublicSurface: true },
      { readyState: 'complete', hasRoot: true, hasTauri: true, hasPublicSurface: true },
      {
        title: 'VibeSpace',
        route: 'chat',
        readyState: 'complete',
        hasRoot: true,
        hasTauri: true,
        viewport: { width: 1586, height: 992 },
      },
    ],
  });
  const fake = fakeChromium(page);
  let probes = 0;
  const result = await runReadOnlySmoke(
    { evidenceDirectory: directory, cdpPort: 9223, jarvisPid: 100 },
    {
      chromium: fake.chromium,
      localAppData: LOCAL_APP_DATA,
      captureHead: 'abc123',
      stateProbe: async () => {
        probes += 1;
        return state;
      },
      imageMetadata: async () => ({ width: 1586, height: 992 }),
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.packet.metadata.publicIdentity.route, 'chat');
  assert.equal(result.packet.identity.jarvisPid, 100);
  assert.equal(result.packet.artifacts[0].width, 1586);
  assert.equal(probes, 4);
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.browser.closeCalls, 1);
  const report = JSON.parse(
    await readFile(path.join(directory, 'native-harness-smoke.json'), 'utf8'),
  );
  assert.equal(report.status, 'passed');
  assert.equal(report.metadata.boundary.includes('no navigation or dispatch'), true);
});

test('sanitizer recursively redacts credential-shaped keys', () => {
  assert.deepEqual(
    sanitizeEvidence({ safe: 'visible', credentials: { token: 'secret' }, cancellationKey: 'x' }),
    { safe: 'visible', credentials: '[redacted]', cancellationKey: '[redacted]' },
  );
});

test('sanitizer redacts secret-bearing values even under benign keys', () => {
  assert.deepEqual(
    sanitizeEvidence({
      url: 'https://example.test/callback?safe=1&access_token=top-secret-token',
      message: 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature',
      text: 'Use api_key=sk-proj-abcdefghijklmnopqrstuvwx',
      endpoint: 'https://user:password@example.test/private',
      semanticText:
        'Approval decision could not be saved. Refresh protected state before retrying.',
      publicUrl: 'http://127.0.0.1:9223/?route=chat',
    }),
    {
      url: '[redacted-secret-bearing-value]',
      message: '[redacted-secret-bearing-value]',
      text: '[redacted-secret-bearing-value]',
      endpoint: '[redacted-secret-bearing-value]',
      semanticText:
        'Approval decision could not be saved. Refresh protected state before retrying.',
      publicUrl: 'http://127.0.0.1:9223/?route=chat',
    },
  );
});
