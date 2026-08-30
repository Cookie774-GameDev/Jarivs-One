import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  NativeQuestionADriverError,
  assessVisibleResponse,
  assertExactRoute,
  assertLiveEffortAuthority,
  assertPersistedRouteSelection,
  classifyConsoleError,
  createPhase0QuestionAContribution,
  parseArgs,
  requestFixtureSha256,
  resolveOfficialNativeTarget,
  safeDispatchReceipt,
} from './pr31-native-question-a.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE = 'D:\\VibeSpace-Testing\\evidence';
const PROMPT = 'D:\\VibeSpace-Testing\\question-a.txt';
const LOCAL = 'C:\\Users\\viper\\AppData\\Local';

function processRow(name, pid, parentPid, executablePath, commandLine = '') {
  return {
    Name: name,
    ProcessId: pid,
    ParentProcessId: parentPid,
    ExecutablePath: executablePath,
    CommandLine: commandLine,
  };
}

function officialProcesses(port = 9333, jarvisPid = 100) {
  return [
    processRow('jarvis.exe', jarvisPid, 9, 'D:\\VibeSpace\\jarvis.exe', 'jarvis.exe'),
    processRow(
      'msedgewebview2.exe',
      jarvisPid + 1,
      jarvisPid,
      'C:\\Program Files\\WebView2\\msedgewebview2.exe',
      `msedgewebview2.exe --user-data-dir="${LOCAL}\\ai.jarvis.desktop\\EBWebView" --remote-debugging-port=${port}`,
    ),
    processRow(
      'msedgewebview2.exe',
      jarvisPid + 2,
      jarvisPid + 1,
      'C:\\Program Files\\WebView2\\msedgewebview2.exe',
      'msedgewebview2.exe --type=renderer',
    ),
  ];
}

function sendArgs(extra = []) {
  return [
    '--send',
    '--evidence-dir',
    EVIDENCE,
    '--prompt-file',
    PROMPT,
    '--jarvis-pid',
    '100',
    '--expect-provider',
    'opencode',
    '--expect-connection',
    'opencode-cli',
    '--expect-model',
    'opencode-go/deepseek-v4-flash-vision-exp',
    '--reject-effort',
    'medium',
    '--expect-effort',
    'high',
    '--expect-performance',
    'quality',
    '--expect-fast',
    'off',
    '--expect-rlm',
    'on',
    ...extra,
  ];
}

test('accepts an explicit per-run approve-all expectation without making it mandatory', () => {
  assert.equal(parseArgs(sendArgs()).expectedApproveAll, undefined);
  assert.equal(parseArgs(sendArgs(['--expect-approve-all', 'on'])).expectedApproveAll, 'on');
  assert.throws(
    () => parseArgs(sendArgs(['--expect-approve-all', 'maybe'])),
    (error) =>
      error instanceof NativeQuestionADriverError && error.code === 'invalid_expected_approve_all',
  );
});

test('can explicitly reuse a pre-scoped active chat without changing the default', () => {
  assert.equal(parseArgs(sendArgs()).reuseActiveChat, undefined);
  assert.equal(parseArgs(sendArgs(['--reuse-active-chat'])).reuseActiveChat, true);
});

test('completion accepts cleared one-shot controls but preserves exact durable selection', () => {
  const expected = parseArgs(sendArgs(['--expect-approve-all', 'on']));
  const completed = {
    selection: {
      providerId: 'opencode',
      connectionId: 'opencode-cli',
      modelId: 'opencode-go/deepseek-v4-flash-vision-exp',
    },
    runtime: {
      effort: '',
      runtimeEffort: '',
      performance: '',
      fastMode: '',
      rlmEnabled: false,
      approveAllForRun: false,
    },
  };

  assert.doesNotThrow(() => assertPersistedRouteSelection(completed, expected));
  assert.throws(
    () =>
      assertPersistedRouteSelection(
        { ...completed, selection: { ...completed.selection, modelId: 'substituted' } },
        expected,
      ),
    (error) => error instanceof NativeQuestionADriverError && error.code === 'exact_route_mismatch',
  );
});

test('defaults to inspection and cannot accept prompt material', () => {
  assert.equal(parseArgs(['--evidence-dir', EVIDENCE]).mode, 'inspect');
  assert.throws(
    () => parseArgs(['--inspect', '--evidence-dir', EVIDENCE, '--prompt-file', PROMPT]),
    (error) =>
      error instanceof NativeQuestionADriverError &&
      error.code === 'inspection_cannot_accept_prompt',
  );
  assert.throws(
    () => parseArgs(['--inspect', '--send', '--evidence-dir', EVIDENCE]),
    /invalid_arguments/u,
  );
});

test('send mode requires explicit route authority and at most three runs', () => {
  const parsed = parseArgs(sendArgs(['--runs', '3']));
  assert.equal(parsed.runs, 3);
  assert.equal(parsed.expectedProvider, 'opencode');
  assert.equal(parsed.expectedConnection, 'opencode-cli');
  assert.equal(parsed.expectedModel, 'opencode-go/deepseek-v4-flash-vision-exp');
  assert.equal(parsed.rejectedEffort, 'medium');
  assert.equal(parsed.expectedEffort, 'high');
  assert.equal(parsed.expectedPerformance, 'quality');
  assert.equal(parsed.expectedFast, 'off');
  assert.equal(parsed.expectedRlm, 'on');
  assert.equal(parsed.jarvisPid, 100);
  assert.throws(
    () => parseArgs(['--send', '--evidence-dir', EVIDENCE]),
    /send_authority_incomplete/u,
  );
  const withoutPid = sendArgs();
  withoutPid.splice(withoutPid.indexOf('--jarvis-pid'), 2);
  assert.throws(() => parseArgs(withoutPid), /send_authority_incomplete/u);
  assert.throws(() => parseArgs(sendArgs(['--runs', '4'])), /invalid_run_count/u);
  const invalidRlm = sendArgs();
  invalidRlm[invalidRlm.indexOf('--expect-rlm') + 1] = 'invalid';
  assert.throws(() => parseArgs(invalidRlm), /invalid_expected_rlm/u);
  const invalidRejectedEffort = sendArgs();
  invalidRejectedEffort[invalidRejectedEffort.indexOf('--reject-effort') + 1] = 'extreme';
  assert.throws(() => parseArgs(invalidRejectedEffort), /invalid_rejected_effort/u);
  assert.throws(
    () => parseArgs(sendArgs(['--prompt', 'PRIVATE'])),
    (error) => error instanceof NativeQuestionADriverError && error.code === 'invalid_arguments',
  );
});

test('proves the CDP port is owned by a jarvis descendant on the exact official profile', () => {
  assert.deepEqual(resolveOfficialNativeTarget(officialProcesses(), { localAppData: LOCAL }), {
    jarvisPid: 100,
    webViewPid: 101,
    executablePath: 'D:\\VibeSpace\\jarvis.exe',
    profile: `${LOCAL}\\ai.jarvis.desktop\\EBWebView`,
    cdpPort: 9333,
    ownership: 'jarvis_descendant_exact_official_profile',
  });
});

test('fails closed for standalone, wrong-profile, ambiguous, or mismatched-port targets', () => {
  const standalone = officialProcesses().filter((row) => row.Name !== 'jarvis.exe');
  assert.throws(
    () => resolveOfficialNativeTarget(standalone, { localAppData: LOCAL }),
    /official_native_target_not_found/u,
  );
  const wrongProfile = officialProcesses().map((row) =>
    row.Name === 'msedgewebview2.exe' && row.CommandLine.includes('user-data-dir')
      ? { ...row, CommandLine: row.CommandLine.replace('ai.jarvis.desktop', 'standalone.browser') }
      : row,
  );
  assert.throws(
    () => resolveOfficialNativeTarget(wrongProfile, { localAppData: LOCAL }),
    /official_native_target_not_found/u,
  );
  assert.throws(
    () =>
      resolveOfficialNativeTarget(
        [...officialProcesses(9333, 100), ...officialProcesses(9444, 200)],
        { localAppData: LOCAL },
      ),
    /official_native_target_ambiguous/u,
  );
  assert.throws(
    () =>
      resolveOfficialNativeTarget(officialProcesses(), {
        localAppData: LOCAL,
        cdpPort: 9444,
      }),
    /official_native_target_not_found/u,
  );
});

test('captures only exact dispatch identity and omits prompt, source, and credentials', () => {
  const secret = 'sk-private-do-not-record';
  const receipt = safeDispatchReceipt({
    chatId: 'chat-1',
    text: `PRIVATE PROMPT ${secret}`,
    filePaths: ['C:\\private-source'],
    apiKey: secret,
    modelSelectionOverride: {
      mode: 'single',
      providerId: 'opencode',
      connectionId: 'opencode-cli',
      modelId: 'opencode-go/deepseek-v4-flash-vision-exp',
    },
    reasoningPreference: { effortOverride: 'high' },
    runtimeSettings: {
      effort: 'high',
      performance: 'quality',
      fastMode: 'off',
      rlmEnabled: true,
    },
  });
  assert.deepEqual(receipt, {
    chatId: 'chat-1',
    providerId: 'opencode',
    connectionId: 'opencode-cli',
    modelId: 'opencode-go/deepseek-v4-flash-vision-exp',
    effort: 'high',
    runtimeEffort: 'high',
    performance: 'quality',
    fastMode: 'off',
    rlmEnabled: true,
    approveAllForRun: false,
  });
  assert.doesNotMatch(JSON.stringify(receipt), /PRIVATE|private-source|sk-private/u);
  assert.doesNotThrow(() => assertExactRoute(receipt, parseArgs(sendArgs())));
  assert.throws(
    () => assertExactRoute({ ...receipt, modelId: 'substituted' }, parseArgs(sendArgs())),
    (error) => error instanceof NativeQuestionADriverError && error.code === 'exact_route_mismatch',
  );
  assert.throws(
    () => assertExactRoute({ ...receipt, rlmEnabled: false }, parseArgs(sendArgs())),
    (error) => error instanceof NativeQuestionADriverError && error.code === 'exact_route_mismatch',
  );
  assert.throws(
    () => assertExactRoute({ ...receipt, runtimeEffort: 'auto' }, parseArgs(sendArgs())),
    (error) => error instanceof NativeQuestionADriverError && error.code === 'exact_route_mismatch',
  );
});

test('rejects secret-bearing or malformed dispatch identity instead of recording it', () => {
  const secret = 'PRIVATE VALUE WITH SPACES sk-secret';
  const receipt = safeDispatchReceipt({
    chatId: secret,
    modelSelectionOverride: {
      mode: 'single',
      providerId: secret,
      connectionId: secret,
      modelId: secret,
    },
    reasoningPreference: { effortOverride: secret },
    runtimeSettings: { effort: secret, performance: secret, fastMode: secret },
  });
  assert.deepEqual(receipt, {
    chatId: '',
    providerId: '',
    connectionId: '',
    modelId: '',
    effort: '',
    runtimeEffort: '',
    performance: '',
    fastMode: '',
    rlmEnabled: false,
    approveAllForRun: false,
  });
  assert.doesNotMatch(JSON.stringify(receipt), /PRIVATE|sk-secret/u);
});

test('adapts exact dispatch plus observed Gateway authority into a metadata-only Phase 0 contribution', () => {
  const dispatch = safeDispatchReceipt({
    chatId: 'chat-1',
    text: 'PRIVATE PROMPT',
    modelSelectionOverride: {
      mode: 'single',
      providerId: 'opencode',
      connectionId: 'opencode-cli',
      modelId: 'opencode-go/deepseek-v4-flash-vision-exp',
    },
    reasoningPreference: { effortOverride: 'high' },
    runtimeSettings: {
      effort: 'high',
      performance: 'quality',
      fastMode: 'off',
      rlmEnabled: true,
    },
  });
  const executionIdentity = {
    transportConnectionId: 'opencode-cli',
    transportAdapterId: 'opencode',
    upstreamProviderId: 'opencode-go',
    upstreamModelId: 'deepseek-v4-flash-vision-exp',
    providerQualifiedModelId: 'opencode-go/deepseek-v4-flash-vision-exp',
    authBillingRoute: 'opencode-provider-session',
    effort: 'high',
    fastVariant: 'standard',
    catalogRevision: `sha256:${'a'.repeat(64)}`,
    observedProviderIdentity: 'opencode-go/deepseek-v4-flash-vision-exp',
  };
  const requestFixtureHash = requestFixtureSha256('PRIVATE PROMPT');
  const contribution = createPhase0QuestionAContribution({
    nativeRunId: 'native-run-1',
    evidenceId: 'question-a-1',
    fixture: 'deepseek_v4_flash_vision_exp',
    scenarioId: 'explicit_rlm_on',
    activation: 'explicit_rlm_on',
    requestFixtureHash,
    dispatch,
    requestedExecutionIdentity: executionIdentity,
    observedAuthority: {
      executionIdentity,
      performance: 'quality',
      scopeRevision: 'chat-1:7',
    },
    routeObservation: {
      liveCatalogAuthenticated: true,
      completedThroughOpenCode: true,
      contextReceiptVerified: true,
      silentFallbackUsed: false,
    },
    actualTerminalStatus: 'done',
    cwd: 'C:\\repo',
    gateway: {
      operation: 'investigate',
      invocationCount: 1,
      initialMatchCount: 1,
      continuationCount: 0,
      receiptUri: 'vibespace:context/receipt/explicit-rlm',
      sourceUris: ['vibespace:context/source/explicit-rlm'],
      evidenceUris: ['vibespace:context/evidence/explicit-rlm'],
    },
    outcome: {
      terminalStatus: 'done',
      groundedFinalAnswer: true,
      duplicateDispatchCount: 0,
      duplicateToolEffectCount: 0,
      localFallbackUsed: false,
    },
  });

  assert.equal(contribution.route.observed.upstreamProviderId, 'opencode-go');
  assert.equal(contribution.route.observed.fastMode, 'off');
  assert.equal(
    contribution.route.observed.sessionIdentityHash,
    contribution.route.requested.sessionIdentityHash,
  );
  assert.equal(contribution.scenario.requestFixtureHash, requestFixtureHash);
  assert.equal(contribution.scenario.gateway.operation, 'investigate');
  assert.doesNotMatch(JSON.stringify(contribution), /PRIVATE PROMPT/u);

  const drifted = structuredClone(executionIdentity);
  drifted.upstreamModelId = 'substituted';
  drifted.providerQualifiedModelId = 'opencode-go/substituted';
  drifted.observedProviderIdentity = 'opencode-go/substituted';
  assert.throws(
    () =>
      createPhase0QuestionAContribution({
        nativeRunId: 'native-run-1',
        evidenceId: 'question-a-1',
        fixture: 'deepseek_v4_flash_vision_exp',
        scenarioId: 'explicit_rlm_on',
        activation: 'explicit_rlm_on',
        requestFixtureHash,
        dispatch,
        requestedExecutionIdentity: executionIdentity,
        observedAuthority: {
          executionIdentity: drifted,
          performance: 'quality',
          scopeRevision: 'chat-1:7',
        },
        routeObservation: {
          liveCatalogAuthenticated: true,
          completedThroughOpenCode: true,
          contextReceiptVerified: true,
          silentFallbackUsed: false,
        },
        actualTerminalStatus: 'done',
        cwd: 'C:\\repo',
        gateway: contribution.scenario.gateway,
        outcome: contribution.scenario.outcome,
      }),
    /phase0_observed_route_mismatch/u,
  );
  assert.throws(() => createPhase0QuestionAContribution({}), /phase0_observed_authority_required/u);

  const missingProviderReceipt = structuredClone(executionIdentity);
  delete missingProviderReceipt.observedProviderIdentity;
  assert.throws(
    () =>
      createPhase0QuestionAContribution({
        nativeRunId: 'native-run-1',
        evidenceId: 'question-a-1',
        fixture: 'deepseek_v4_flash_vision_exp',
        scenarioId: 'explicit_rlm_on',
        activation: 'explicit_rlm_on',
        requestFixtureHash,
        dispatch,
        requestedExecutionIdentity: executionIdentity,
        observedAuthority: {
          executionIdentity: missingProviderReceipt,
          performance: 'quality',
          scopeRevision: 'chat-1:7',
        },
        routeObservation: {
          liveCatalogAuthenticated: true,
          completedThroughOpenCode: true,
          contextReceiptVerified: true,
          silentFallbackUsed: false,
        },
        actualTerminalStatus: 'done',
        cwd: 'C:\\repo',
        gateway: contribution.scenario.gateway,
        outcome: contribution.scenario.outcome,
      }),
    /phase0_observed_route_invalid/u,
  );

  assert.throws(
    () =>
      createPhase0QuestionAContribution({
        nativeRunId: 'native-run-1',
        evidenceId: 'question-a-1',
        fixture: 'deepseek_v4_flash_vision_exp',
        scenarioId: 'explicit_rlm_on',
        activation: 'explicit_rlm_on',
        requestFixtureHash,
        dispatch,
        requestedExecutionIdentity: executionIdentity,
        observedAuthority: {
          executionIdentity,
          performance: 'quality',
          scopeRevision: 'chat-1:7',
        },
        routeObservation: {
          liveCatalogAuthenticated: true,
          completedThroughOpenCode: true,
          contextReceiptVerified: false,
          silentFallbackUsed: false,
        },
        actualTerminalStatus: 'error',
        cwd: 'C:\\repo',
        gateway: contribution.scenario.gateway,
        outcome: contribution.scenario.outcome,
      }),
    /phase0_route_observation_failed/u,
  );

  assert.throws(
    () =>
      createPhase0QuestionAContribution({
        nativeRunId: 'native-run-1',
        evidenceId: 'question-a-1',
        fixture: 'deepseek_v4_flash_vision_exp',
        scenarioId: 'explicit_rlm_on',
        activation: 'explicit_rlm_on',
        requestFixtureHash,
        dispatch,
        requestedExecutionIdentity: executionIdentity,
        observedAuthority: {
          executionIdentity,
          performance: 'quality',
          scopeRevision: 'chat-1:7',
        },
        routeObservation: {
          liveCatalogAuthenticated: true,
          completedThroughOpenCode: true,
          contextReceiptVerified: true,
          silentFallbackUsed: false,
        },
        actualTerminalStatus: 'error',
        cwd: 'C:\\repo',
        gateway: contribution.scenario.gateway,
        outcome: contribution.scenario.outcome,
      }),
    /phase0_terminal_status_mismatch/u,
  );

  for (const receiptUri of [
    'vibespace:context/receipt/../',
    'vibespace:context/receipt/sk-proj-abcdefghijklmnopqrstuvwx',
  ]) {
    assert.throws(
      () =>
        createPhase0QuestionAContribution({
          nativeRunId: 'native-run-1',
          evidenceId: 'question-a-1',
          fixture: 'deepseek_v4_flash_vision_exp',
          scenarioId: 'explicit_rlm_on',
          activation: 'explicit_rlm_on',
          requestFixtureHash,
          dispatch,
          requestedExecutionIdentity: executionIdentity,
          observedAuthority: {
            executionIdentity,
            performance: 'quality',
            scopeRevision: 'chat-1:7',
          },
          routeObservation: {
            liveCatalogAuthenticated: true,
            completedThroughOpenCode: true,
            contextReceiptVerified: true,
            silentFallbackUsed: false,
          },
          actualTerminalStatus: 'done',
          cwd: 'C:\\repo',
          gateway: { ...contribution.scenario.gateway, receiptUri },
          outcome: contribution.scenario.outcome,
        }),
      /phase0_gateway_observation_invalid|phase0_unsafe_observation/u,
    );
  }
});

test('requires the exact effort to exist on the registered live model', () => {
  const authority = {
    registered: true,
    modelId: 'opencode-go/deepseek-v4-flash-vision-exp',
    variants: ['low', 'high', 'max'],
  };
  assert.doesNotThrow(() => assertLiveEffortAuthority(authority, 'high'));
  assert.throws(
    () => assertLiveEffortAuthority(authority, 'medium'),
    (error) =>
      error instanceof NativeQuestionADriverError &&
      error.code === 'expected_effort_not_live_supported',
  );
  assert.throws(
    () => assertLiveEffortAuthority({ ...authority, registered: false }, 'high'),
    (error) =>
      error instanceof NativeQuestionADriverError &&
      error.code === 'expected_model_not_live_registered',
  );
});

test('mechanically grades visible word bounds, internal markers, and duplicate tails', () => {
  const clean = Array.from({ length: 700 }, (_, index) => `fact${index}`).join(' ');
  assert.deepEqual(assessVisibleResponse(clean), {
    wordCount: 700,
    withinWordBounds: true,
    duplicateTail: false,
    internalMarker: false,
  });
  assert.equal(
    assessVisibleResponse(Array.from({ length: 649 }, (_, index) => `short${index}`).join(' '))
      .withinWordBounds,
    false,
  );
  assert.equal(assessVisibleResponse(`${clean} extra `.repeat(8)).withinWordBounds, false);
  assert.equal(
    assessVisibleResponse('Evidence [unverified output location omitted]').internalMarker,
    true,
  );
  const repeated = Array.from({ length: 60 }, (_, index) => `evidence${index}`).join(' ');
  assert.equal(assessVisibleResponse(`${repeated} ${repeated}`).duplicateTail, true);
});

test('reduces console failures to stable non-content codes', () => {
  assert.equal(classifyConsoleError('401 Unauthorized: secret body omitted'), 'auth_error');
  assert.equal(
    classifyConsoleError('net::ERR_CONNECTION_REFUSED https://private.invalid/path'),
    'network_error',
  );
  assert.equal(classifyConsoleError('OpenCode protected turn failed.'), 'opencode_turn_error');
  assert.equal(classifyConsoleError('arbitrary private message'), 'console_error');
});

test('source can only attach to owned CDP and cannot launch, navigate, or close the app', async () => {
  const source = await readFile(path.join(HERE, 'pr31-native-question-a.mjs'), 'utf8');
  assert.match(source, /chromium\.connectOverCDP/u);
  assert.match(source, /ai\.jarvis\.desktop/u);
  assert.match(source, /jarvis\.exe/u);
  assert.match(source, /official_native_target_changed/u);
  assert.match(source, /process_inspection_unavailable/u);
  assert.match(source, /process_inspection_invalid/u);
  assert.match(source, /mode: 'send_failure'/u);
  assert.match(source, /data-vibespace-page/u);
  assert.match(source, /data-monochrome-surface/u);
  assert.match(source, /data-composer-effort/u);
  assert.match(source, /locator\('\[data-composer-effort\]'\)/u);
  assert.match(source, /Control\+Enter/u);
  assert.match(source, /local_control_dispatched_provider/u);
  assert.match(source, /rejected_effort_dispatched_provider/u);
  assert.match(source, /rejected_effort_mutated_state/u);
  assert.match(source, /rejected_effort_still_visible/u);
  assert.match(source, /\.jarvis-slash-dropdown/u);
  assert.match(source, /aria-label\$=" routes"/u);
  assert.match(source, /exact_model_route_ambiguous/u);
  assert.match(source, /group\.elementHandles\(\)/u);
  assert.match(source, /section\[aria-label="Chats"\]/u);
  assert.match(source, /runtime_control_\$\{field\}_not_applied/u);
  assert.match(source, /`\$\{expected\.expectedConnection\}:\$\{expected\.expectedModel\}`/u);
  assert.ok(
    source.indexOf('await configureExactModelViaUi(page, options)') <
      source.indexOf('stage = `run_${index + 1}_reject_unsupported_effort`') &&
      source.indexOf('stage = `run_${index + 1}_configure_runtime`') <
        source.indexOf('stage = `run_${index + 1}_reject_unsupported_effort`'),
    'the exact expected route must be configured before unsupported-effort proof',
  );
  for (const command of ['/effort ', '/performance ', '/fast ', '/rlm ']) {
    assert.match(source, new RegExp(command.replace('/', '\\/'), 'u'));
  }
  assert.match(source, /\/approve-all /u);
  assert.doesNotMatch(source, /chromium\.launch\s*\(/u);
  assert.doesNotMatch(source, /\.goto\s*\(/u);
  assert.doesNotMatch(source, /browser\.close\s*\(/u);
  assert.doesNotMatch(source, /localStorage\.(?:setItem|removeItem)\s*\(/u);
  assert.doesNotMatch(source, /detail\?\.text|detail\.text/u);
});
