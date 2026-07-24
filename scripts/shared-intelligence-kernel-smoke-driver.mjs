import { createHash } from 'node:crypto';
import { lstat, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const ARGUMENT_NAMES = Object.freeze([
  '--cdp-port',
  '--scenario',
  '--evidence-dir',
  '--expected-native-pid',
  '--expected-profile',
  '--expected-nonce',
]);

const SCENARIO_IDS = Object.freeze([
  'transport_provider_success',
  'transport_cli_success',
  'voice_turn_stop',
  'native_stt_voice_turn',
  'approval_safe_auto',
  'approval_confirm',
  'approval_dangerous',
  'artifact_provider',
  'artifact_file_action',
  'artifact_terminal',
  'schedule_dispatch',
  'schedule_transport_retry',
  'live_evidence_restart',
  'command_center_reduced_motion',
  'hive_dispatch',
  'partial_response',
  'provider_failure',
  'cancel_before_claim',
  'cancel_running',
  'cancel_completion_race',
]);

const EVIDENCE_IDS = Object.freeze([
  'smoke.binding',
  'smoke.binding-error',
  'smoke.dispatch-kind',
  'smoke.runtime-state',
  'voice.open',
  'voice.transcript',
  'voice.stt-fixture',
  'voice.stt-state',
  'voice.state',
  'voice.stop',
  'chat.runtime-ready',
  'chat.run-shell',
  'approval.card',
  'run.status',
  'outputs.tab',
  'live.systems-tab',
  'live.system.node',
  'live.reconstructed-node',
  'terminal.execution',
  'cancellation.delivery',
  'run.error',
  'run.partial',
]);

const CONTROL_IDS = Object.freeze([
  'chat.composer',
  'chat.submit',
  'model.picker',
  'model.transport-native',
  'model.transport-cli',
  'approval.confirm',
  'approval.confirm-dangerous',
  'chat.return',
  'schedule.fixture',
  'schedule.retry-fixture',
  'schedule.dispatch',
  'hive.fixture',
  'hive.dispatch',
  'command-center.disclosure',
  'command-center.surface',
  'live.system.node',
  'outputs.state',
  'Retry transport',
]);

const SELECTOR_IDS = Object.freeze([...EVIDENCE_IDS, ...CONTROL_IDS]);

const NATIVE_BINDING_ERROR_CODES = Object.freeze([
  'sik_smoke_release_build',
  'sik_smoke_flag_disabled',
  'sik_smoke_non_loopback_host',
  'sik_smoke_invalid_port',
  'sik_smoke_port_not_bound',
  'sik_smoke_invalid_profile',
  'sik_smoke_appdata_outside_profile',
  'sik_smoke_localappdata_outside_profile',
  'sik_smoke_invalid_nonce',
  'sik_smoke_invalid_window',
  'sik_smoke_binding_invalid',
]);

const APPROVAL_PRESENTATION_FAILURE_CODES = Object.freeze([
  'identity_missing',
  'host_unavailable',
  'host_released',
  'request_timed_out',
  'client_disposed',
  'invalid_response',
  'kernel_not_activated',
  'request_failed',
]);

const KERNEL_RUNTIME_STAGES = Object.freeze([
  'accepted',
  'chat',
  'validated',
  'agent',
  'context',
  'execution',
  'hive_turn',
  'hive_plan',
  'hive_workers',
  'hive_final',
]);

const SAFE_STATE_ATTRIBUTES = Object.freeze([
  'data-error-code',
  'data-initialization-phase',
  'data-terminal-status',
  'data-dispatch-kind',
  'data-runtime-state',
  'data-run-status',
  'data-voice-state',
  'data-stt-state',
  'data-status',
  'data-approval-kind',
  'data-engine-id',
  'data-model-id',
  'data-fixture-sha256',
  'data-session-bound',
  'data-run-bound',
  'data-blocker-code',
  'data-run-digest',
  'data-snapshot-digest',
  'data-request-digest',
  'data-attempt-number',
  'data-effect-barrier-state',
  'data-effect-barrier-version',
  'data-attempt-state',
  'data-response-started',
  'data-chunk-count',
  'data-action-dispatch-count',
  'data-approval-count',
  'data-artifact-count',
  'data-executor-claim-count',
  'data-live-node-state',
  'data-live-proof-ref',
  'data-motion-enabled',
  'data-focus-state',
  'data-sik-output-count',
  'data-sik-assistant-count',
  'data-sik-transport',
]);

const DRIVER_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = await realpath(path.resolve(DRIVER_DIRECTORY, '..'));
const TASK22_EVIDENCE_ROOT = path.join(
  REPOSITORY_ROOT,
  '.superpowers',
  'sdd',
  'evidence',
  'task-22',
);
const TIMEOUT_MS = 60_000;
const VOICE_FIXTURE_SHA256 = 'b3bab750a95495ae54c457b54cb9a066147e36acc6a711e1a09ea05265c272f7';

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function parseArguments(argv) {
  if (argv.length !== ARGUMENT_NAMES.length * 2) fail('kernel_smoke_arguments_invalid');
  const parsed = Object.create(null);
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!ARGUMENT_NAMES.includes(name) || !value || parsed[name] !== undefined) {
      fail('kernel_smoke_arguments_invalid');
    }
    parsed[name] = value;
  }
  if (Object.keys(parsed).length !== ARGUMENT_NAMES.length) {
    fail('kernel_smoke_arguments_invalid');
  }
  return parsed;
}

function parsePositiveInteger(value, maximum, code) {
  if (!/^[1-9][0-9]*$/.test(value)) fail(code);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) fail(code);
  return parsed;
}

function normalizeForComparison(value) {
  const normalized = path.resolve(value).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isStrictDescendant(candidate, parent) {
  const normalizedCandidate = normalizeForComparison(candidate);
  const normalizedParent = normalizeForComparison(parent);
  return (
    normalizedCandidate !== normalizedParent &&
    normalizedCandidate.startsWith(`${normalizedParent}${path.sep}`)
  );
}

async function canonicalExistingDirectory(value, code) {
  if (!path.isAbsolute(value) || value !== value.trim()) fail(code);
  let canonical;
  try {
    canonical = await realpath(value);
    if (!(await stat(canonical)).isDirectory()) fail(code);
  } catch {
    fail(code);
  }
  if (normalizeForComparison(value) !== normalizeForComparison(canonical)) fail(code);
  return canonical;
}

async function validateArguments(argv) {
  const parsed = parseArguments(argv);
  const cdpPort = parsePositiveInteger(parsed['--cdp-port'], 65_535, 'kernel_smoke_port_invalid');
  const nativePid = parsePositiveInteger(
    parsed['--expected-native-pid'],
    Number.MAX_SAFE_INTEGER,
    'kernel_smoke_pid_invalid',
  );
  const scenario = parsed['--scenario'];
  if (!SCENARIO_IDS.includes(scenario)) fail('kernel_smoke_scenario_invalid');
  const nonce = parsed['--expected-nonce'];
  if (!/^[a-f0-9]{64}$/.test(nonce)) fail('kernel_smoke_nonce_invalid');

  const evidenceDirectory = await canonicalExistingDirectory(
    parsed['--evidence-dir'],
    'kernel_smoke_evidence_directory_invalid',
  );
  const expectedProfile = await canonicalExistingDirectory(
    parsed['--expected-profile'],
    'kernel_smoke_profile_invalid',
  );
  const task22EvidenceAllowed = isStrictDescendant(evidenceDirectory, TASK22_EVIDENCE_ROOT);
  if (
    !isStrictDescendant(evidenceDirectory, path.dirname(evidenceDirectory)) ||
    (isStrictDescendant(evidenceDirectory, REPOSITORY_ROOT) && !task22EvidenceAllowed) ||
    normalizeForComparison(evidenceDirectory) === normalizeForComparison(REPOSITORY_ROOT) ||
    isStrictDescendant(expectedProfile, REPOSITORY_ROOT) ||
    normalizeForComparison(expectedProfile) === normalizeForComparison(REPOSITORY_ROOT) ||
    isStrictDescendant(evidenceDirectory, expectedProfile) ||
    isStrictDescendant(expectedProfile, evidenceDirectory) ||
    normalizeForComparison(evidenceDirectory) === normalizeForComparison(expectedProfile)
  ) {
    fail('kernel_smoke_path_containment_invalid');
  }

  return Object.freeze({
    cdpPort,
    scenario,
    evidenceDirectory,
    nativePid,
    expectedProfile,
    nonce,
  });
}

function evidenceSelector(id) {
  if (!SELECTOR_IDS.includes(id)) fail('kernel_smoke_evidence_selector_invalid');
  return `[data-sik-evidence="${id}"]`;
}

function evidenceLocator(page, id) {
  return page.locator(evidenceSelector(id));
}

async function requireUniqueEvidence(page, id) {
  const locator = evidenceLocator(page, id);
  try {
    await locator.first().waitFor({ state: 'attached', timeout: TIMEOUT_MS });
    if ((await locator.count()) !== 1) fail('kernel_smoke_evidence_ambiguous');
    return locator.first();
  } catch (error) {
    if (typeof error?.code === 'string' && error.code.startsWith('kernel_smoke_')) throw error;
    if (page.isClosed()) fail('kernel_smoke_page_closed');
    fail(`kernel_smoke_evidence_missing:${id}`);
  }
}

async function requireUniqueEvidenceState(page, id, attribute, value) {
  if (!SAFE_STATE_ATTRIBUTES.includes(attribute) || !/^[a-z0-9_-]+$/.test(value)) {
    fail('kernel_smoke_evidence_state_selector_invalid');
  }
  const locator = page.locator(`${evidenceSelector(id)}[${attribute}="${value}"]`);
  try {
    await locator.first().waitFor({ state: 'attached', timeout: TIMEOUT_MS });
    if ((await locator.count()) !== 1) fail('kernel_smoke_evidence_ambiguous');
    return locator.first();
  } catch (error) {
    if (typeof error?.code === 'string' && error.code.startsWith('kernel_smoke_')) throw error;
    if (page.isClosed()) fail('kernel_smoke_page_closed');
    fail(`kernel_smoke_evidence_state_missing:${id}:${attribute}:${value}`);
  }
}

async function waitForAttribute(
  locator,
  attribute,
  accepted,
  timeoutCode = 'kernel_smoke_state_timeout',
) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const value = await locator.getAttribute(attribute);
    if (accepted.includes(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  fail(timeoutCode);
}

async function waitForScheduleRunState(locator, expected, phase) {
  const known = [
    'queued',
    'compiling',
    'running',
    'awaiting_approval',
    'partial',
    'completed',
    'failed',
    'cancelled',
    'timed_out',
  ];
  const deadline = Date.now() + TIMEOUT_MS;
  let lastState = 'invalid';
  while (Date.now() < deadline) {
    const value = await locator.getAttribute('data-run-status');
    if (known.includes(value)) lastState = value;
    if (value === expected) return value;
    if (expected === 'running' && ['failed', 'cancelled', 'timed_out'].includes(value)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  fail(`kernel_smoke_schedule_run_state_timeout:${phase}:${lastState}`);
}

async function findBoundPage(browser) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const matches = [];
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        const rejected = evidenceLocator(page, 'smoke.binding-error');
        const rejectedCount = await rejected.count();
        if (rejectedCount > 1) fail('kernel_smoke_binding_error_ambiguous');
        if (rejectedCount === 1) {
          const code = await rejected.getAttribute('data-error-code');
          if (!NATIVE_BINDING_ERROR_CODES.includes(code)) {
            fail('kernel_smoke_binding_error_invalid');
          }
          fail(`kernel_smoke_native_binding_rejected:${code}`);
        }
        if ((await evidenceLocator(page, 'smoke.binding').count()) > 0) matches.push(page);
      }
    }
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) fail('kernel_smoke_binding_ambiguous');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  fail('kernel_smoke_binding_missing');
}

async function attestBinding(page, expected) {
  const binding = await requireUniqueEvidence(page, 'smoke.binding');
  const actual = Object.freeze({
    nativePid: await binding.getAttribute('data-native-pid'),
    cdpPort: await binding.getAttribute('data-cdp-port'),
    profileSha256: await binding.getAttribute('data-profile-sha256'),
    nonce: await binding.getAttribute('data-nonce'),
  });
  const expectedDigest = createHash('sha256')
    .update(expected.expectedProfile, 'utf8')
    .digest('hex');
  if (
    actual.nativePid !== String(expected.nativePid) ||
    actual.cdpPort !== String(expected.cdpPort) ||
    actual.profileSha256 !== expectedDigest ||
    actual.nonce !== expected.nonce
  ) {
    fail('kernel_smoke_binding_mismatch');
  }
  return Object.freeze({
    nativePid: expected.nativePid,
    cdpPort: expected.cdpPort,
    profileSha256: expectedDigest,
    nonce: expected.nonce,
  });
}

async function clickEvidence(page, id) {
  const locator = await requireUniqueEvidence(page, id);
  await locator.click();
}

async function requestCancellationOrObserveCompletion(page) {
  const run = await requireUniqueEvidence(page, 'run.status');
  const cancellation = evidenceLocator(page, 'cancellation.delivery');
  const deadline = Date.now() + TIMEOUT_MS;
  let lastStatus = 'invalid';
  while (Date.now() < deadline) {
    const status = await run.getAttribute('data-run-status');
    if (typeof status === 'string') lastStatus = status;
    if (['cancelled', 'completed'].includes(status)) return `terminal:${status}`;
    const count = await cancellation.count();
    if (count > 1) fail('kernel_smoke_evidence_ambiguous');
    if (count === 1) {
      try {
        await cancellation.first().click();
        return 'cancellation_requested';
      } catch {
        if (page.isClosed()) fail('kernel_smoke_page_closed');
        const settled = await run.getAttribute('data-run-status');
        if (['cancelled', 'completed'].includes(settled)) return `terminal:${settled}`;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  fail(`kernel_smoke_cancellation_race_timeout:${lastStatus}`);
}

async function clickReadyScheduleEvidence(page, id) {
  const control = await requireUniqueEvidence(page, id);
  const deadline = Date.now() + TIMEOUT_MS;
  let lastState = 'invalid';
  while (Date.now() < deadline) {
    const state = await control.getAttribute('data-sik-schedule-state');
    if (typeof state === 'string') lastState = state;
    if (state === 'idle') {
      await control.click();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  fail(`kernel_smoke_schedule_fixture_readiness_timeout:${lastState}`);
}

async function waitForScheduleFixtureDispatch(page, id) {
  const control = await requireUniqueEvidence(page, id);
  const known = [
    'idle',
    'creating',
    'dispatching',
    'dispatch-claim',
    'dispatch-output',
    'dispatch-kernel',
    'dispatch-settle',
    'dispatch-failed',
    'opening',
    'completed',
    'error-create',
    'error-dispatch',
    'error-open',
    'unavailable-binding',
    'unavailable-identity',
    'unavailable-workspace',
    'unavailable-agent',
    'unavailable-model',
  ];
  const deadline = Date.now() + TIMEOUT_MS;
  let lastState = 'invalid';
  while (Date.now() < deadline) {
    const state = await control.getAttribute('data-sik-schedule-state');
    if (known.includes(state)) lastState = state;
    if (state === 'completed') return;
    if (state?.startsWith('error-')) fail(`kernel_smoke_schedule_fixture_${state}`);
    if (state?.startsWith('unavailable-')) fail(`kernel_smoke_schedule_fixture_${state}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  fail(`kernel_smoke_schedule_fixture_timeout:${lastState}`);
}

async function prepareCollapsedCommandCenter(page) {
  const disclosure = await requireUniqueEvidence(page, 'command-center.disclosure');
  const expansion = await disclosure.getAttribute('aria-expanded');
  if (!['true', 'false'].includes(expansion)) {
    fail('kernel_smoke_command_center_expansion_invalid');
  }
  if (expansion === 'true') {
    await disclosure.click();
    await waitForAttribute(disclosure, 'aria-expanded', ['false']);
  }
}

async function runClosedStage(code, operation) {
  if (!/^kernel_smoke_artifact_terminal_[a-z_]+_failed$/.test(code)) {
    fail('kernel_smoke_driver_stage_invalid');
  }
  try {
    return await operation();
  } catch (error) {
    if (typeof error?.code === 'string') throw error;
    fail(code);
  }
}

async function clickApprovalEvidence(page, id) {
  const control = evidenceLocator(page, id);
  const pendingCanonicalCard = page.locator(
    `${evidenceSelector('approval.card')}[data-status="pending"][data-approval-kind="canonical"]`,
  );
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const controlCount = await control.count();
    if (controlCount > 1) fail('kernel_smoke_evidence_ambiguous');
    if (controlCount === 1) {
      await control.first().click();
      return;
    }
    const cardCount = await pendingCanonicalCard.count();
    if (cardCount > 1) fail('kernel_smoke_evidence_ambiguous');
    if (cardCount === 1) {
      const card = pendingCanonicalCard.first();
      if ((await card.getAttribute('data-presentation-state')) === 'failed') {
        const code = await card.getAttribute('data-presentation-code');
        if (!APPROVAL_PRESENTATION_FAILURE_CODES.includes(code)) {
          fail('kernel_smoke_approval_presentation_code_invalid');
        }
        fail(`kernel_smoke_approval_presentation_failed:${code}`);
      }
    }
    if (page.isClosed()) fail('kernel_smoke_page_closed');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  fail(`kernel_smoke_evidence_missing:${id}`);
}

async function fillEvidence(page, id, value) {
  const locator = await requireUniqueEvidence(page, id);
  await locator.fill(value);
}

async function readOptionalRunDigest(page) {
  const locator = evidenceLocator(page, 'run.status');
  const count = await locator.count();
  if (count === 0) return undefined;
  if (count !== 1) fail('kernel_smoke_evidence_ambiguous');

  const status = await locator.first().getAttribute('data-run-status');
  const digest = await locator.first().getAttribute('data-run-digest');
  if (status === 'empty' && digest === null) return undefined;
  if (!/^[a-f0-9]{64}$/.test(digest ?? '')) fail('kernel_smoke_run_digest_invalid');
  return digest;
}

async function waitForNewRunDigest(page, previousRunDigest) {
  const runStatus = await requireUniqueEvidence(page, 'run.status');
  const currentRunDigest = previousRunDigest
    ? await waitForDifferentAttribute(runStatus, 'data-run-digest', previousRunDigest)
    : await waitForMatchingAttribute(runStatus, 'data-run-digest', /^[a-f0-9]{64}$/);
  if (!/^[a-f0-9]{64}$/.test(currentRunDigest)) fail('kernel_smoke_run_digest_invalid');
}

async function submitChatFixture(page, fixture) {
  await requireUniqueEvidence(page, 'chat.runtime-ready');
  const previousRunDigest = await readOptionalRunDigest(page);
  await fillEvidence(page, 'chat.composer', fixture);
  await clickEvidence(page, 'chat.submit');
  await requireUniqueEvidence(page, 'smoke.runtime-state');
  let dispatch;
  try {
    dispatch = await requireUniqueEvidence(page, 'smoke.dispatch-kind');
  } catch (error) {
    if (error?.code !== 'kernel_smoke_evidence_missing:smoke.dispatch-kind') throw error;
    const runtime = await requireUniqueEvidence(page, 'smoke.runtime-state');
    const state = await runtime.getAttribute('data-runtime-state');
    if (!['sent', 'running', 'done', 'error', 'cancelled'].includes(state)) {
      fail('kernel_smoke_runtime_state_invalid');
    }
    fail(`kernel_smoke_provider_not_reached:${state}`);
  }
  const path = await waitForAttribute(
    dispatch,
    'data-dispatch-kind',
    ['protected', 'unprotected'],
    'kernel_smoke_dispatch_state_timeout',
  );
  if (path !== 'protected') fail('kernel_smoke_unprotected_provider_dispatch');
  await waitForNewRunDigest(page, previousRunDigest);
}

async function selectSmokeTransport(page, transport) {
  if (!['native', 'cli'].includes(transport)) fail('kernel_smoke_transport_invalid');
  const picker = await requireUniqueEvidence(page, 'model.picker');
  await picker.click();
  await clickEvidence(page, transport === 'cli' ? 'model.transport-cli' : 'model.transport-native');
  await waitForAttribute(
    picker,
    'data-sik-transport',
    [transport],
    'kernel_smoke_transport_state_timeout',
  );
}

async function readOptionalRuntimeFailureCode(page) {
  const runtime = evidenceLocator(page, 'smoke.runtime-state');
  const runtimeCount = await runtime.count();
  if (runtimeCount > 1) fail('kernel_smoke_evidence_ambiguous');
  if (runtimeCount === 0) return 'kernel_runtime_failure';
  await waitForAttribute(runtime.first(), 'data-runtime-state', ['error']);
  const candidate = await runtime.first().getAttribute('data-error-code');
  return /^kernel_[a-z0-9_]{1,120}$/.test(candidate ?? '') ? candidate : 'kernel_runtime_failure';
}

async function waitForRunStatus(page, accepted) {
  const locator = await requireUniqueEvidence(page, 'run.status');
  const terminalStatuses = ['partial', 'completed', 'failed', 'cancelled', 'timed_out'];
  const nonterminalStatuses = ['empty', 'queued', 'compiling', 'running', 'awaiting_approval'];
  const deadline = Date.now() + TIMEOUT_MS;
  let lastStatus;
  while (Date.now() < deadline) {
    const status = await locator.getAttribute('data-run-status');
    if (nonterminalStatuses.includes(status)) lastStatus = status;
    if (accepted.includes(status)) return status;
    if (terminalStatuses.includes(status)) {
      if (status === 'failed' || status === 'timed_out') {
        const errorCode = await readOptionalRuntimeFailureCode(page);
        fail(`kernel_smoke_unexpected_run_status:${status}:${errorCode}`);
      }
      fail(`kernel_smoke_unexpected_run_status:${status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const runtime = evidenceLocator(page, 'smoke.runtime-state');
  const runtimeCount = await runtime.count();
  if (runtimeCount > 1) fail('kernel_smoke_evidence_ambiguous');
  const runtimeState =
    runtimeCount === 1 ? await runtime.first().getAttribute('data-runtime-state') : undefined;
  const safeRuntimeState =
    runtimeCount === 0
      ? 'missing'
      : ['sent', 'running', 'done', 'error', 'cancelled'].includes(runtimeState)
        ? runtimeState
        : 'invalid';
  fail(`kernel_smoke_run_state_timeout:${lastStatus ?? 'invalid'}:${safeRuntimeState}`);
}

function allZeroDurations(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .every((item) => item === '0s' || item === '0ms');
}

async function reducedMotionEvidence(page) {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const document = await session.send('DOM.getDocument');
    const selected = await session.send('DOM.querySelector', {
      nodeId: document.root.nodeId,
      selector: evidenceSelector('command-center.surface'),
    });
    if (!selected.nodeId) fail('kernel_smoke_command_center_surface_missing');
    const descendants = await session.send('DOM.querySelectorAll', {
      nodeId: selected.nodeId,
      selector: '*',
    });
    const elementNodeIds = [selected.nodeId, ...descendants.nodeIds];
    const checkedNodeIds = new Set(elementNodeIds);
    let pseudoElementCount = 0;
    for (const nodeId of elementNodeIds) {
      const described = await session.send('DOM.describeNode', { nodeId, depth: 0 });
      for (const pseudoElement of described.node.pseudoElements ?? []) {
        if (pseudoElement.nodeId && !checkedNodeIds.has(pseudoElement.nodeId)) {
          checkedNodeIds.add(pseudoElement.nodeId);
          pseudoElementCount += 1;
        }
      }
    }
    for (const nodeId of checkedNodeIds) {
      const computed = await session.send('CSS.getComputedStyleForNode', { nodeId });
      const values = Object.fromEntries(
        computed.computedStyle
          .filter(({ name }) =>
            [
              'animation-name',
              'animation-duration',
              'animation-delay',
              'transition-duration',
              'transition-delay',
            ].includes(name),
          )
          .map(({ name, value }) => [name, value]),
      );
      if (
        values['animation-name'] !== 'none' ||
        !allZeroDurations(values['animation-duration'] ?? '') ||
        !allZeroDurations(values['animation-delay'] ?? '') ||
        !allZeroDurations(values['transition-duration'] ?? '') ||
        !allZeroDurations(values['transition-delay'] ?? '')
      ) {
        fail('kernel_smoke_reduced_motion_computed_style_invalid');
      }
    }
    return {
      checkedNodeCount: checkedNodeIds.size,
      pseudoElementCount,
      zeroMotion: true,
    };
  } finally {
    await session.detach().catch(() => undefined);
  }
}

async function readAttributes(locator, names) {
  const result = Object.create(null);
  for (const name of names) result[name] = await locator.getAttribute(name);
  return result;
}

const VOICE_TERMINAL_ATTRIBUTES = Object.freeze(['data-run-status', 'data-run-digest']);

async function readAssistantCount(chatShell) {
  const value = await chatShell.getAttribute('data-sik-assistant-count');
  if (!/^(0|[1-9][0-9]*)$/.test(value ?? '') || !Number.isSafeInteger(Number(value))) {
    fail('kernel_smoke_voice_assistant_count_invalid');
  }
  return value;
}

function assertNoVoiceSuccessEvidence(attributes, expectedAssistantCount) {
  const expected = {
    'data-run-status': 'cancelled',
    'data-sik-assistant-count': expectedAssistantCount,
  };
  for (const [name, value] of Object.entries(expected)) {
    if (attributes[name] !== value) fail('kernel_smoke_voice_post_stop_success_detected');
  }
  if (!/^[a-f0-9]{64}$/.test(attributes['data-run-digest'] ?? '')) {
    fail('kernel_smoke_voice_terminal_digest_missing');
  }
}

async function waitForDifferentAttribute(locator, attribute, previous) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const value = await locator.getAttribute(attribute);
    if (value && value !== previous) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  fail('kernel_smoke_state_timeout');
}

async function waitForMatchingAttribute(locator, attribute, pattern) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const value = await locator.getAttribute(attribute);
    if (value && pattern.test(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  fail('kernel_smoke_state_timeout');
}

async function waitForTerminalSession(locator) {
  const deadline = Date.now() + TIMEOUT_MS;
  let lastPhase = 'kernel_terminal_phase_unknown';
  while (Date.now() < deadline) {
    const sessionId = await locator.getAttribute('data-session-id');
    if (/^[A-Za-z0-9_-]{1,160}$/.test(sessionId ?? '')) return sessionId;
    const phase = await locator.getAttribute('data-initialization-phase');
    if (/^kernel_terminal_phase_[a-z_]{1,80}$/.test(phase ?? '')) lastPhase = phase;
    const failure = await locator.getAttribute('data-error-code');
    if (/^kernel_terminal_[a-z0-9_]{1,100}$/.test(failure ?? '')) {
      fail(`kernel_smoke_terminal_initialization_failed:${failure}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  fail(`kernel_smoke_terminal_session_timeout:${lastPhase}`);
}

async function waitForTerminalSettlement(locator) {
  const deadline = Date.now() + TIMEOUT_MS;
  const pending = ['queued', 'starting', 'running', 'cancellation_requested'];
  let lastStatus = 'missing';
  let lastPhase = 'kernel_terminal_phase_unknown';
  while (Date.now() < deadline) {
    const status = await locator.getAttribute('data-terminal-status');
    if (status === 'complete') return status;
    if (status === 'failed' || status === 'cancelled') {
      fail(`kernel_smoke_terminal_execution_terminal:${status}`);
    }
    if (pending.includes(status)) lastStatus = status;
    const phase = await locator.getAttribute('data-initialization-phase');
    if (/^kernel_terminal_phase_[a-z_]{1,80}$/.test(phase ?? '')) lastPhase = phase;
    const failure = await locator.getAttribute('data-error-code');
    if (/^kernel_terminal_[a-z0-9_]{1,100}$/.test(failure ?? '')) {
      fail(`kernel_smoke_terminal_initialization_failed:${failure}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  let fixtureObservation = 'fixture_missing';
  try {
    const renderedRows = await locator.locator('.xterm-rows').allTextContents();
    if (renderedRows.join('\n').includes('VibeSpace kernel terminal fixture')) {
      fixtureObservation = 'fixture_seen';
    }
  } catch {
    fixtureObservation = 'fixture_unreadable';
  }
  fail(`kernel_smoke_terminal_execution_timeout:${lastStatus}:${lastPhase}:${fixtureObservation}`);
}

async function liveNodeEvidence(page, evidenceId = 'live.system.node') {
  const locator = evidenceLocator(page, evidenceId);
  const records = [];
  for (let index = 0; index < (await locator.count()); index += 1) {
    records.push(
      await readAttributes(locator.nth(index), ['data-live-node-state', 'data-live-proof-ref']),
    );
  }
  return records;
}

const LIVE_PROOF_REF_PATTERN = /^jlive_[a-f0-9]{64}$/;
const TERMINAL_LIVE_STATES = Object.freeze(['completed', 'degraded']);
const ACTIVE_LIVE_STATES = Object.freeze(['active', 'busy', 'ready']);

function validateExpectedLiveNodes(nodes, acceptedStates, missingCode) {
  if (nodes.length === 0) fail(missingCode);
  const proofRefs = new Set();
  for (const node of nodes) {
    const state = node['data-live-node-state'];
    const proofRef = node['data-live-proof-ref'];
    if (!acceptedStates.includes(state)) fail('kernel_smoke_live_state_invalid');
    if (!LIVE_PROOF_REF_PATTERN.test(proofRef ?? '')) {
      fail('kernel_smoke_live_proof_ref_invalid');
    }
    if (proofRefs.has(proofRef)) fail('kernel_smoke_live_proof_duplicate');
    proofRefs.add(proofRef);
  }
  return proofRefs;
}

function assertExactReconstructedLiveNodeEvidence(
  nodes,
  completedProofs,
  orphanProofs,
  allowMissing = false,
) {
  const observedProofs = new Set();
  for (const node of nodes) {
    const state = node['data-live-node-state'];
    const proofRef = node['data-live-proof-ref'];
    if (!LIVE_PROOF_REF_PATTERN.test(proofRef ?? '')) {
      fail('kernel_smoke_live_proof_ref_invalid');
    }
    if (!['completed', 'degraded'].includes(state)) {
      fail('kernel_smoke_live_state_invalid');
    }
    if (observedProofs.has(proofRef)) fail('kernel_smoke_live_proof_duplicate');
    if (orphanProofs.has(proofRef)) fail('kernel_smoke_live_orphan_active_restored');
    observedProofs.add(proofRef);
  }
  for (const proofRef of observedProofs) {
    if (!completedProofs.has(proofRef)) {
      fail('kernel_smoke_live_unexpected_terminal_proof_restored');
    }
  }
  if (observedProofs.size !== completedProofs.size) {
    if (allowMissing) return false;
    fail('kernel_smoke_live_completed_proof_not_restored');
  }
  for (const proofRef of completedProofs) {
    if (!observedProofs.has(proofRef)) {
      if (allowMissing) return false;
      fail('kernel_smoke_live_completed_proof_not_restored');
    }
  }
  return true;
}

async function waitForReconstructedLiveNodeEvidence(
  page,
  completedProofs,
  orphanProofs,
  timeoutMs = 20_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const nodes = await liveNodeEvidence(page, 'live.reconstructed-node');
    if (assertExactReconstructedLiveNodeEvidence(nodes, completedProofs, orphanProofs, true)) {
      return nodes;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  fail('kernel_smoke_live_completed_proof_not_restored');
}

async function runScenario(page, scenario, restartCheckpoint, evidenceDirectory) {
  if (!restartCheckpoint) {
    if (scenario === 'transport_cli_success') {
      await selectSmokeTransport(page, 'cli');
    } else {
      await selectSmokeTransport(page, 'native');
    }
  }
  switch (scenario) {
    case 'voice_turn_stop':
      await clickEvidence(page, 'voice.open');
      {
        const openedVoiceState = await requireUniqueEvidence(page, 'voice.state');
        await waitForAttribute(openedVoiceState, 'data-voice-state', ['listening']);
        await captureVisualEvidence(page, evidenceDirectory, scenario, 'listening');
      }
      const previousVoiceRunDigest = await readOptionalRunDigest(page);
      const sessionEvidence = await requireUniqueEvidence(page, 'voice.stt-state');
      await waitForAttribute(
        sessionEvidence,
        'data-session-bound',
        ['true'],
        'kernel_smoke_voice_session_timeout',
      );
      await clickEvidence(page, 'voice.transcript');
      await waitForNewRunDigest(page, previousVoiceRunDigest);
      await waitForRunStatus(page, ['running']);
      const voiceState = await requireUniqueEvidence(page, 'voice.state');
      await waitForAttribute(
        voiceState,
        'data-voice-state',
        ['thinking', 'speaking'],
        'kernel_smoke_voice_cancellable_timeout',
      );
      const chatShell = await requireUniqueEvidence(page, 'chat.run-shell');
      const assistantCountBeforeStop = await readAssistantCount(chatShell);
      await clickEvidence(page, 'voice.stop');
      await waitForRunStatus(page, ['cancelled']);
      const terminal = await requireUniqueEvidence(page, 'run.status');
      const beforeRuntimeSettled = await readAttributes(terminal, VOICE_TERMINAL_ATTRIBUTES);
      beforeRuntimeSettled['data-sik-assistant-count'] = await readAssistantCount(chatShell);
      assertNoVoiceSuccessEvidence(beforeRuntimeSettled, assistantCountBeforeStop);
      const runtime = await requireUniqueEvidence(page, 'smoke.runtime-state');
      await waitForAttribute(
        runtime,
        'data-runtime-state',
        ['cancelled'],
        'kernel_smoke_voice_runtime_cancel_timeout',
      );
      const afterRuntimeSettled = await readAttributes(terminal, VOICE_TERMINAL_ATTRIBUTES);
      afterRuntimeSettled['data-sik-assistant-count'] = await readAssistantCount(chatShell);
      assertNoVoiceSuccessEvidence(afterRuntimeSettled, assistantCountBeforeStop);
      if (beforeRuntimeSettled['data-run-digest'] !== afterRuntimeSettled['data-run-digest']) {
        fail('kernel_smoke_voice_terminal_state_changed');
      }
      return {
        outcome: 'PASS',
        voiceCancellation: {
          assistantCountBeforeStop,
          beforeRuntimeSettled,
          afterRuntimeSettled,
        },
      };
    case 'native_stt_voice_turn': {
      await clickEvidence(page, 'voice.open');
      await requireUniqueEvidence(page, 'voice.state');
      await clickEvidence(page, 'voice.stt-fixture');
      const sttEvidence = await requireUniqueEvidence(page, 'voice.stt-state');
      const state = await waitForAttribute(sttEvidence, 'data-stt-state', [
        'submitted',
        'blocked_external',
      ]);
      if (state === 'blocked_external') {
        const blocker = await sttEvidence.getAttribute('data-blocker-code');
        if (
          ![
            'fixture_contract',
            'model_unavailable',
            'python_unavailable',
            'engine_failed',
            'transcript_mismatch',
          ].includes(blocker)
        ) {
          fail('kernel_smoke_stt_blocker_missing');
        }
        return 'BLOCKED_EXTERNAL';
      }
      if (
        (await sttEvidence.getAttribute('data-engine-id')) !== 'faster-whisper' ||
        (await sttEvidence.getAttribute('data-fixture-sha256')) !== VOICE_FIXTURE_SHA256
      ) {
        fail('kernel_smoke_stt_evidence_mismatch');
      }
      await waitForAttribute(sttEvidence, 'data-session-bound', ['true']);
      await waitForAttribute(sttEvidence, 'data-run-bound', ['true']);
      await waitForRunStatus(page, ['completed']);
      return 'PASS';
    }
    case 'approval_safe_auto':
      await submitChatFixture(page, 'Search for the fixed smoke fixture.');
      await waitForRunStatus(page, ['completed']);
      {
        const approval = await requireUniqueEvidence(page, 'approval.card');
        await waitForAttribute(approval, 'data-approval-kind', ['canonical']);
        await waitForAttribute(approval, 'data-status', ['success']);
      }
      return 'PASS';
    case 'approval_confirm':
      await submitChatFixture(page, 'Create one fixed smoke terminal.');
      await waitForRunStatus(page, ['awaiting_approval']);
      await captureVisualEvidence(page, evidenceDirectory, scenario, 'waiting-approval');
      await clickApprovalEvidence(page, 'approval.confirm');
      {
        const approval = await requireUniqueEvidenceState(
          page,
          'approval.card',
          'data-status',
          'queued',
        );
        await waitForAttribute(approval, 'data-approval-kind', ['canonical']);
      }
      await waitForRunStatus(page, ['running']);
      return 'PASS';
    case 'approval_dangerous':
      await submitChatFixture(page, 'Cancel the selected fixed smoke task.');
      await waitForRunStatus(page, ['awaiting_approval']);
      await clickApprovalEvidence(page, 'approval.confirm-dangerous');
      await waitForRunStatus(page, ['completed']);
      return 'PASS';
    case 'artifact_provider':
      await submitChatFixture(page, 'Produce the fixed provider artifact.');
      await prepareCollapsedCommandCenter(page);
      await captureVisualEvidence(page, evidenceDirectory, scenario, 'collapsed');
      await clickEvidence(page, 'command-center.disclosure');
      await clickEvidence(page, 'outputs.tab');
      await waitForRunStatus(page, ['completed']);
      return 'PASS';
    case 'artifact_file_action':
      await submitChatFixture(page, 'Produce the fixed file action artifact.');
      await prepareCollapsedCommandCenter(page);
      await clickEvidence(page, 'command-center.disclosure');
      await clickEvidence(page, 'outputs.tab');
      await waitForRunStatus(page, ['completed']);
      return 'PASS';
    case 'artifact_terminal':
      await runClosedStage('kernel_smoke_artifact_terminal_submit_failed', () =>
        submitChatFixture(page, 'Produce the fixed terminal artifact.'),
      );
      await runClosedStage('kernel_smoke_artifact_terminal_approval_wait_failed', () =>
        waitForRunStatus(page, ['awaiting_approval']),
      );
      await runClosedStage('kernel_smoke_artifact_terminal_approval_click_failed', () =>
        clickApprovalEvidence(page, 'approval.confirm-dangerous'),
      );
      await runClosedStage('kernel_smoke_artifact_terminal_attach_wait_failed', async () => {
        const terminalExecution = await requireUniqueEvidence(page, 'terminal.execution');
        await waitForTerminalSession(terminalExecution);
        await waitForTerminalSettlement(terminalExecution);
      });
      await runClosedStage('kernel_smoke_artifact_terminal_chat_return_failed', () =>
        clickEvidence(page, 'chat.return'),
      );
      await runClosedStage('kernel_smoke_artifact_terminal_disclosure_prepare_failed', () =>
        prepareCollapsedCommandCenter(page),
      );
      await runClosedStage('kernel_smoke_artifact_terminal_disclosure_click_failed', () =>
        clickEvidence(page, 'command-center.disclosure'),
      );
      await runClosedStage('kernel_smoke_artifact_terminal_outputs_click_failed', () =>
        clickEvidence(page, 'outputs.tab'),
      );
      await runClosedStage('kernel_smoke_artifact_terminal_completion_wait_failed', () =>
        waitForRunStatus(page, ['completed']),
      );
      return 'PASS';
    case 'schedule_transport_retry':
      if (!restartCheckpoint) {
        await clickEvidence(page, 'schedule.fixture');
        await clickReadyScheduleEvidence(page, 'schedule.retry-fixture');
        await waitForScheduleFixtureDispatch(page, 'schedule.retry-fixture');
        const status = await requireUniqueEvidence(page, 'run.status');
        await waitForScheduleRunState(status, 'running', 'settled');
        await waitForMatchingAttribute(status, 'data-run-digest', /^[a-f0-9]{64}$/);
        const expected = {
          'data-attempt-number': '1',
          'data-attempt-state': 'retryable_failed',
          'data-effect-barrier-state': 'open',
          'data-effect-barrier-version': '0',
          'data-response-started': 'false',
          'data-chunk-count': '0',
          'data-action-dispatch-count': '0',
          'data-approval-count': '0',
          'data-artifact-count': '0',
          'data-executor-claim-count': '0',
        };
        for (const [name, value] of Object.entries(expected)) {
          await waitForAttribute(
            status,
            name,
            [value],
            `kernel_smoke_schedule_zero_effect_timeout:${name}`,
          );
        }
        await waitForMatchingAttribute(status, 'data-snapshot-digest', /^[a-f0-9]{64}$/);
        await waitForMatchingAttribute(status, 'data-request-digest', /^[a-f0-9]{64}$/);
        const before = await readAttributes(status, [
          'data-run-digest',
          'data-snapshot-digest',
          'data-request-digest',
          ...Object.keys(expected),
        ]);
        for (const [name, value] of Object.entries(expected)) {
          if (before[name] !== value) fail('kernel_smoke_schedule_zero_effect_evidence_invalid');
        }
        for (const name of ['data-run-digest', 'data-snapshot-digest', 'data-request-digest']) {
          if (!/^[a-f0-9]{64}$/.test(before[name] ?? '')) {
            fail('kernel_smoke_schedule_binding_digest_missing');
          }
        }
        return { outcome: 'RESTART_REQUIRED', restartBefore: before };
      }
      {
        const status = await requireUniqueEvidence(page, 'run.status');
        await waitForScheduleRunState(status, 'running', 'restart');
        const before = restartCheckpoint.before;
        for (const name of [
          'data-run-digest',
          'data-snapshot-digest',
          'data-request-digest',
          'data-attempt-number',
        ]) {
          await waitForAttribute(status, name, [before[name]]);
        }
        await new Promise((resolve) => setTimeout(resolve, 750));
        if ((await evidenceLocator(page, 'cancellation.delivery').count()) !== 0) {
          fail('kernel_smoke_schedule_cancel_not_suppressed');
        }
        await clickEvidence(page, 'Retry transport');
        await waitForAttribute(status, 'data-run-status', ['completed']);
        await waitForAttribute(status, 'data-attempt-number', ['2']);
        await waitForAttribute(status, 'data-attempt-state', ['completed']);
        await waitForAttribute(status, 'data-run-digest', [before['data-run-digest']]);
        await waitForAttribute(status, 'data-snapshot-digest', [before['data-snapshot-digest']]);
        const requestDigest = await waitForDifferentAttribute(
          status,
          'data-request-digest',
          before['data-request-digest'],
        );
        return {
          outcome: 'PASS',
          scheduleRetry: {
            before,
            after: await readAttributes(status, [
              'data-run-digest',
              'data-snapshot-digest',
              'data-request-digest',
              'data-attempt-number',
              'data-attempt-state',
              'data-effect-barrier-state',
              'data-effect-barrier-version',
            ]),
            requestDigestChanged: requestDigest !== before['data-request-digest'],
          },
        };
      }
    case 'provider_failure':
      await submitChatFixture(page, 'Return the fixed provider failure.');
      await requireUniqueEvidence(page, 'run.error');
      return 'PASS';
    case 'partial_response':
      await submitChatFixture(page, 'Return the fixed partial smoke response.');
      await requireUniqueEvidence(page, 'run.partial');
      return 'PASS';
    case 'live_evidence_restart':
      if (!restartCheckpoint) {
        await submitChatFixture(page, 'Verify fixed live evidence across restart.');
        await waitForRunStatus(page, ['completed']);
        await prepareCollapsedCommandCenter(page);
        await clickEvidence(page, 'command-center.disclosure');
        await clickEvidence(page, 'live.systems-tab');
        await requireUniqueEvidence(page, 'live.system.node');
        const completedNodes = (await liveNodeEvidence(page)).filter(
          ({ ['data-live-node-state']: state }) => ['completed', 'degraded'].includes(state),
        );
        validateExpectedLiveNodes(
          completedNodes,
          TERMINAL_LIVE_STATES,
          'kernel_smoke_live_completed_proof_missing',
        );
        await submitChatFixture(page, 'Verify fixed live evidence across restart.');
        await waitForRunStatus(page, ['running']);
        await clickEvidence(page, 'live.systems-tab');
        const activeNodes = (await liveNodeEvidence(page)).filter(
          ({ ['data-live-node-state']: state }) => ['active', 'busy', 'ready'].includes(state),
        );
        validateExpectedLiveNodes(
          activeNodes,
          ACTIVE_LIVE_STATES,
          'kernel_smoke_live_active_proof_missing',
        );
        return {
          outcome: 'RESTART_REQUIRED',
          restartBefore: { completedNodes, activeNodes },
        };
      }
      {
        const completedProofs = validateExpectedLiveNodes(
          restartCheckpoint.before.completedNodes,
          TERMINAL_LIVE_STATES,
          'kernel_smoke_live_completed_proof_missing',
        );
        const orphanProofs = validateExpectedLiveNodes(
          restartCheckpoint.before.activeNodes,
          ACTIVE_LIVE_STATES,
          'kernel_smoke_live_active_proof_missing',
        );
        const nodes = await waitForReconstructedLiveNodeEvidence(
          page,
          completedProofs,
          orphanProofs,
        );
        assertExactReconstructedLiveNodeEvidence(nodes, completedProofs, orphanProofs);
        return { outcome: 'PASS', liveRestart: { before: restartCheckpoint.before, after: nodes } };
      }
    case 'command_center_reduced_motion':
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await submitChatFixture(page, 'Verify the fixed reduced motion controls.');
      await waitForRunStatus(page, ['completed']);
      await prepareCollapsedCommandCenter(page);
      {
        const surface = await requireUniqueEvidence(page, 'command-center.surface');
        await waitForAttribute(surface, 'data-motion-enabled', ['false']);
        const disclosure = await requireUniqueEvidence(page, 'command-center.disclosure');
        await disclosure.press('Enter');
        await waitForAttribute(disclosure, 'aria-expanded', ['true']);
        await waitForAttribute(disclosure, 'data-focus-state', ['focused']);
        const outputs = await requireUniqueEvidence(page, 'outputs.tab');
        await outputs.press('ArrowRight');
        const liveSystems = await requireUniqueEvidence(page, 'live.systems-tab');
        await waitForAttribute(liveSystems, 'data-focus-state', ['focused']);
        return { outcome: 'PASS', reducedMotion: await reducedMotionEvidence(page) };
      }
    case 'cancel_before_claim':
      await submitChatFixture(page, 'Cancel the fixed turn before an effect claim.');
      await clickEvidence(page, 'cancellation.delivery');
      await waitForRunStatus(page, ['cancelled']);
      return 'PASS';
    case 'cancel_running':
      await submitChatFixture(page, 'Cancel the fixed running turn.');
      await waitForRunStatus(page, ['running']);
      await clickEvidence(page, 'cancellation.delivery');
      await waitForRunStatus(page, ['cancelled']);
      return 'PASS';
    case 'cancel_completion_race':
      await submitChatFixture(page, 'Resolve the fixed cancellation completion race.');
      {
        const decision = await requestCancellationOrObserveCompletion(page);
        const terminalStatus = await waitForRunStatus(page, ['cancelled', 'completed']);
        return { outcome: 'PASS', cancellationRace: { decision, terminalStatus } };
      }
    case 'transport_provider_success':
      await submitChatFixture(page, 'Verify the provider transport smoke fixture.');
      await requireUniqueEvidence(page, 'chat.run-shell');
      await waitForRunStatus(page, ['completed']);
      return 'PASS';
    case 'transport_cli_success':
      await submitChatFixture(page, 'Verify the CLI transport smoke fixture.');
      await requireUniqueEvidence(page, 'chat.run-shell');
      await waitForRunStatus(page, ['completed']);
      return 'PASS';
    case 'schedule_dispatch':
      await clickEvidence(page, 'schedule.fixture');
      await clickReadyScheduleEvidence(page, 'schedule.dispatch');
      await waitForScheduleFixtureDispatch(page, 'schedule.dispatch');
      await waitForRunStatus(page, ['completed']);
      return 'PASS';
    case 'hive_dispatch':
      await requireUniqueEvidence(page, 'chat.runtime-ready');
      await clickEvidence(page, 'hive.fixture');
      await clickEvidence(page, 'hive.dispatch');
      {
        const hiveRuntime = await requireUniqueEvidence(page, 'smoke.runtime-state');
        let hiveDispatch;
        try {
          hiveDispatch = await requireUniqueEvidence(page, 'smoke.dispatch-kind');
        } catch (error) {
          if (error?.code !== 'kernel_smoke_evidence_missing:smoke.dispatch-kind') throw error;
          const state = await hiveRuntime.getAttribute('data-runtime-state');
          const candidate = await hiveRuntime.getAttribute('data-error-code');
          const stage = await hiveRuntime.getAttribute('data-initialization-phase');
          const safeState = ['sent', 'running', 'done', 'error', 'cancelled'].includes(state)
            ? state
            : 'invalid';
          const safeError = /^kernel_[a-z0-9_]{1,120}$/.test(candidate ?? '')
            ? candidate
            : 'kernel_runtime_failure';
          const safeStage = KERNEL_RUNTIME_STAGES.includes(stage) ? stage : 'invalid';
          fail(`kernel_smoke_hive_provider_not_reached:${safeState}:${safeError}:${safeStage}`);
        }
        // Specialist Hive workers intentionally retain their own prompts and may
        // dispatch before the protected JARVIS finalizer. Attest the finalizer's
        // protected route instead of rejecting that earlier worker observation.
        await waitForMatchingAttribute(hiveDispatch, 'data-dispatch-kind', /^protected$/);
        await waitForAttribute(
          hiveRuntime,
          'data-runtime-state',
          ['done'],
          'kernel_smoke_hive_runtime_timeout',
        );
        const hiveChatShell = await requireUniqueEvidence(page, 'chat.run-shell');
        await waitForMatchingAttribute(hiveChatShell, 'data-sik-assistant-count', /^[1-9][0-9]*$/);
      }
      await waitForRunStatus(page, ['completed']);
      return 'PASS';
    default:
      fail('kernel_smoke_scenario_invalid');
  }
}

async function collectSanitizedEvidence(page) {
  const records = [];
  for (const id of EVIDENCE_IDS) {
    const locator = evidenceLocator(page, id);
    const count = await locator.count();
    const states = [];
    for (let index = 0; index < count; index += 1) {
      const item = locator.nth(index);
      const attributes = Object.create(null);
      for (const attribute of SAFE_STATE_ATTRIBUTES) {
        const value = await item.getAttribute(attribute);
        if (value !== null) attributes[attribute] = value;
      }
      states.push(attributes);
    }
    records.push({ id, count, states });
  }
  return records;
}

async function assertNoRawAudio(page, evidence) {
  const html = await page.content();
  const serialized = JSON.stringify(evidence);
  if (html.includes('UklGR') || serialized.includes('UklGR') || /audioBase64/i.test(serialized)) {
    fail('kernel_smoke_raw_audio_exposed');
  }
}

function containedOutputPath(directory, name) {
  const output = path.resolve(directory, name);
  if (!isStrictDescendant(output, directory)) fail('kernel_smoke_evidence_escape');
  return output;
}

function restartCheckpointPath(options) {
  return containedOutputPath(
    options.evidenceDirectory,
    `${options.scenario}.restart-checkpoint.json`,
  );
}

async function readRestartCheckpoint(options) {
  if (!['schedule_transport_retry', 'live_evidence_restart'].includes(options.scenario)) {
    return undefined;
  }
  const checkpointPath = restartCheckpointPath(options);
  try {
    const checkpointStat = await stat(checkpointPath);
    if (!checkpointStat.isFile() || checkpointStat.size < 2 || checkpointStat.size > 32_768) {
      fail('kernel_smoke_restart_checkpoint_invalid');
    }
    const parsed = JSON.parse(await readFile(checkpointPath, 'utf8'));
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      parsed.schemaVersion !== 1 ||
      parsed.scenario !== options.scenario ||
      parsed.phase !== 'restart_required' ||
      !parsed.binding ||
      typeof parsed.binding !== 'object' ||
      Array.isArray(parsed.binding) ||
      !Number.isSafeInteger(parsed.binding.nativePid) ||
      parsed.binding.nativePid < 1 ||
      !Number.isSafeInteger(parsed.binding.cdpPort) ||
      parsed.binding.cdpPort < 1 ||
      parsed.binding.cdpPort > 65_535 ||
      !/^[a-f0-9]{64}$/.test(parsed.binding.profileSha256) ||
      !parsed.before ||
      typeof parsed.before !== 'object' ||
      Array.isArray(parsed.before)
    ) {
      fail('kernel_smoke_restart_checkpoint_invalid');
    }
    return Object.freeze(parsed);
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    if (error?.code) throw error;
    fail('kernel_smoke_restart_checkpoint_invalid');
  }
}

async function writeRestartCheckpoint(options, binding, before) {
  const checkpoint = Object.freeze({
    schemaVersion: 1,
    scenario: options.scenario,
    phase: 'restart_required',
    binding: {
      nativePid: binding.nativePid,
      cdpPort: binding.cdpPort,
      profileSha256: binding.profileSha256,
    },
    before,
  });
  await writeFile(restartCheckpointPath(options), `${JSON.stringify(checkpoint, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
}

async function requireAbsentOutput(output) {
  try {
    await lstat(output);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    fail('kernel_smoke_evidence_output_invalid');
  }
  fail('kernel_smoke_evidence_output_exists');
}

async function captureVisualEvidence(page, evidenceDirectory, scenario, stage) {
  if (!/^[a-z0-9-]+$/.test(stage)) fail('kernel_smoke_visual_stage_invalid');
  const screenshotPath = containedOutputPath(evidenceDirectory, `${scenario}.${stage}.png`);
  await requireAbsentOutput(screenshotPath);
  await page.screenshot({ path: screenshotPath, fullPage: true });
}

async function main() {
  const options = await validateArguments(process.argv.slice(2));
  let browser;
  let page;
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${options.cdpPort}`);
    page = await findBoundPage(browser);
    const binding = await attestBinding(page, options);
    const restartCheckpoint = await readRestartCheckpoint(options);
    if (
      restartCheckpoint &&
      (restartCheckpoint.binding.profileSha256 !== binding.profileSha256 ||
        restartCheckpoint.binding.nativePid === binding.nativePid ||
        restartCheckpoint.binding.cdpPort === binding.cdpPort)
    ) {
      fail('kernel_smoke_restart_binding_mismatch');
    }
    const scenarioResult = await runScenario(
      page,
      options.scenario,
      restartCheckpoint,
      options.evidenceDirectory,
    );
    const outcome = typeof scenarioResult === 'string' ? scenarioResult : scenarioResult.outcome;
    if (outcome === 'RESTART_REQUIRED') {
      if (restartCheckpoint) fail('kernel_smoke_restart_repeated');
      const restartBefore =
        typeof scenarioResult === 'object' && scenarioResult !== null
          ? scenarioResult.restartBefore
          : undefined;
      if (!restartBefore || typeof restartBefore !== 'object' || Array.isArray(restartBefore)) {
        fail('kernel_smoke_restart_checkpoint_invalid');
      }
      const phaseEvidence = Object.freeze({
        schemaVersion: 1,
        scenario: options.scenario,
        outcome,
        binding,
        scenarioEvidence: { restartBefore },
        observed: await collectSanitizedEvidence(page),
      });
      await assertNoRawAudio(page, phaseEvidence);
      const phaseScreenshotPath = containedOutputPath(
        options.evidenceDirectory,
        `${options.scenario}.before-restart.png`,
      );
      const phaseJsonPath = containedOutputPath(
        options.evidenceDirectory,
        `${options.scenario}.before-restart.json`,
      );
      await requireAbsentOutput(phaseScreenshotPath);
      await requireAbsentOutput(phaseJsonPath);
      await page.screenshot({ path: phaseScreenshotPath, fullPage: true });
      await writeFile(phaseJsonPath, `${JSON.stringify(phaseEvidence, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
      });
      await writeRestartCheckpoint(options, binding, restartBefore);
      process.stdout.write(`${JSON.stringify({ scenario: options.scenario, outcome })}\n`);
      process.exitCode = 10;
      return;
    }
    const scenarioEvidence =
      typeof scenarioResult === 'string'
        ? undefined
        : Object.fromEntries(Object.entries(scenarioResult).filter(([key]) => key !== 'outcome'));
    const evidence = Object.freeze({
      schemaVersion: 1,
      scenario: options.scenario,
      outcome,
      binding,
      ...(scenarioEvidence ? { scenarioEvidence } : {}),
      observed: await collectSanitizedEvidence(page),
    });
    await assertNoRawAudio(page, evidence);
    const screenshotPath = containedOutputPath(
      options.evidenceDirectory,
      `${options.scenario}.png`,
    );
    const jsonPath = containedOutputPath(options.evidenceDirectory, `${options.scenario}.json`);
    await requireAbsentOutput(screenshotPath);
    await requireAbsentOutput(jsonPath);
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
    });
    await writeFile(jsonPath, `${JSON.stringify(evidence, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    process.stdout.write(`${JSON.stringify({ scenario: options.scenario, outcome })}\n`);
  } catch (error) {
    if (page && !page.isClosed()) {
      try {
        const candidate = typeof error?.code === 'string' ? error.code : '';
        const failureCode = /^kernel_smoke_[a-z0-9_:.-]{1,180}$/.test(candidate)
          ? candidate
          : 'kernel_smoke_driver_failed';
        const failureEvidence = Object.freeze({
          schemaVersion: 1,
          scenario: options.scenario,
          outcome: 'FAIL',
          failureCode,
          observed: await collectSanitizedEvidence(page),
        });
        await assertNoRawAudio(page, failureEvidence);
        const failurePath = containedOutputPath(
          options.evidenceDirectory,
          `${options.scenario}.failure.json`,
        );
        await requireAbsentOutput(failurePath);
        await writeFile(failurePath, `${JSON.stringify(failureEvidence, null, 2)}\n`, {
          encoding: 'utf8',
          flag: 'wx',
        });
      } catch {
        // Preserve the original closed failure code even if diagnostics cannot be written.
      }
    }
    throw error;
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

main().catch((error) => {
  const code = typeof error?.code === 'string' ? error.code : 'kernel_smoke_driver_failed';
  process.stderr.write(`${code}\n`);
  process.exitCode = 2;
});
