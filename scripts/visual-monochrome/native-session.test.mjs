import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts/visual-monochrome/native-session.ps1');
const VITE_CONFIG_PATH = path.join(REPO_ROOT, 'app/vite.config.ts');
const PRODUCTION_CAPABILITIES = ['default', 'pet-mini-panel', 'pet-overlay', 'workbench-window'];
const TEST_CAPABILITY = 'monochrome-test';
const MONOCHROME_VISUAL_TEST = 'monochrome-visual-test';
const FIXED_IDENTIFIER_SUFFIX = 'fedcba9876543210';
const FIXED_NONCE = 'abcdef0123456789';
const FIXED_PORT = 5199;
const FIXED_COMMIT = '10ade2cb205be6aae93e239e8debd9eaf584b6de';
const FIXED_EVIDENCE_TOKEN = '0123456789abcdef0123456789abcdef';
const EVIDENCE_SCHEMA_VERSION = 'vibespace.monochrome.native-evidence.v1';
const DENIED_EFFECT_MANIFEST_HASH =
  '24d75985399db9fb179ac64a10b982801fcb7681bf3f13a5a62d2340fa04850c';
const DENIED_EFFECT_IDS = [
  'notification',
  'processRelaunch',
  'updater',
  'shellOpen',
  'externalHttp',
  'keychain',
  'registry',
  'launcher',
  'tray',
  'singleInstance',
  'globalShortcut',
  'deepLink',
  'autostart',
];
const FIXTURE_ROUTE_AND_QUERY =
  '/chat?monochrome-fixture=chat&monochrome-fixture-hash=fd8950bf1a41f18797c3e4ea97ad25f1eac86ffda0862cc61e361bdea2a158c9&monochrome-surface=route:chat&monochrome-theme=monochrome&monochrome-origami-gate=false';
const RAW_EXECUTABLE = 'C:\\SensitiveUser\\Programs\\VibeSpace.exe';
const RAW_COMMAND = `${RAW_EXECUTABLE} --production --token never-persist-this`;
const RAW_LAUNCHER = 'C:\\SensitiveUser\\Start Menu\\Programs\\VibeSpace.lnk';
const RAW_PATH = 'C:\\SensitiveUser\\bin;C:\\Windows\\System32';
const RAW_KEYCHAIN_NAMESPACE = 'ai.jarvis.desktop.sensitive';
const EXACT_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'self' http://127.0.0.1:5199 ws://127.0.0.1:5199; media-src 'self' blob: data:; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; navigate-to 'self' http://127.0.0.1:5199;";
const TEST_ARTIFACT_ROOT = path.join(
  REPO_ROOT,
  '.artifacts',
  'monochrome',
  `native-session-tests-${process.pid}-${Date.now()}`,
);
const TEST_NATIVE_BUILD_ROOTS = new Set();
let ownedPathSequence = 0;
mkdirSync(TEST_ARTIFACT_ROOT, { recursive: true });
after(() => {
  rmSync(TEST_ARTIFACT_ROOT, { recursive: true, force: true });
  for (const buildRoot of TEST_NATIVE_BUILD_ROOTS) {
    rmSync(buildRoot, { recursive: true, force: true });
  }
});

function sha256Lower(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function nativeBuildRelativePath(sessionRoot) {
  return `app/src-tauri/target/monochrome-sessions/${sha256Lower(path.resolve(sessionRoot)).slice(0, 32)}`;
}

function makeSessionRoot() {
  const sessionRoot = path.join(
    TEST_ARTIFACT_ROOT,
    `session-${String(++ownedPathSequence).padStart(4, '0')}`,
  );
  mkdirSync(sessionRoot, { recursive: true });
  TEST_NATIVE_BUILD_ROOTS.add(path.join(REPO_ROOT, nativeBuildRelativePath(sessionRoot)));
  return sessionRoot;
}

function makeOwnedFile(name, value) {
  const fixtureRoot = path.join(
    TEST_ARTIFACT_ROOT,
    `${name}-${String(++ownedPathSequence).padStart(4, '0')}`,
  );
  mkdirSync(fixtureRoot, { recursive: true });
  const fixturePath = path.join(fixtureRoot, `${name}.json`);
  writeFileSync(fixturePath, JSON.stringify(value), 'utf8');
  return fixturePath;
}

function protectedSnapshot(overrides = {}) {
  return {
    processes: [
      {
        pid: 4321,
        name: 'VibeSpace.exe',
        creationTime: '2026-07-29T10:00:00Z',
        executable: RAW_EXECUTABLE,
        commandLine: RAW_COMMAND,
      },
    ],
    listener: { pid: 4321, port: 5173, host: '127.0.0.1' },
    launcher: {
      path: RAW_LAUNCHER,
      exists: true,
      type: 'regular-file',
      content: 'sensitive-launcher-bytes',
    },
    registryValues: [
      {
        keyPath: 'HKCU\\Environment',
        valueName: 'Path',
        exists: true,
        type: 'String',
        value: RAW_PATH,
      },
      {
        keyPath: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
        valueName: 'VibeSpace',
        exists: false,
        type: null,
        value: null,
      },
    ],
    credential: { namespace: RAW_KEYCHAIN_NAMESPACE, targetCount: 0 },
    ...overrides,
  };
}

function writeProtectedFixture({ after = protectedSnapshot() } = {}) {
  return makeOwnedFile('protected-state', { before: protectedSnapshot(), after });
}

function powershellArguments({
  sessionRoot,
  port = FIXED_PORT,
  fixturePath = writeProtectedFixture(),
  ownedProcessFixture,
  evidenceFixture,
  baseConfigFixture,
  testCapabilityFixture,
  unsignedNsisArtifactFixture,
  preserveArtifacts = true,
} = {}) {
  const args = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    SCRIPT_PATH,
    '-ValidateOnly',
    '-SessionRoot',
    sessionRoot,
    '-IdentifierSuffix',
    FIXED_IDENTIFIER_SUFFIX,
    '-Nonce',
    FIXED_NONCE,
    '-Port',
    String(port),
    '-RepoRoot',
    REPO_ROOT,
    '-Commit',
    FIXED_COMMIT,
    '-ProtectedStateFixture',
    fixturePath,
    '-EvidenceToken',
    FIXED_EVIDENCE_TOKEN,
  ];
  if (preserveArtifacts) args.push('-PreserveArtifacts');
  if (ownedProcessFixture) {
    args.push('-OwnedProcessFixture', ownedProcessFixture);
  }
  if (evidenceFixture) args.push('-EvidenceFixture', evidenceFixture);
  if (baseConfigFixture) args.push('-BaseConfigFixture', baseConfigFixture);
  if (testCapabilityFixture) args.push('-TestCapabilityFixture', testCapabilityFixture);
  if (unsignedNsisArtifactFixture) {
    args.push('-UnsignedNsisArtifactFixture', unsignedNsisArtifactFixture);
  }
  return args;
}

function runValidateOnly(sessionRoot, options = {}) {
  const stdout = execFileSync('powershell', powershellArguments({ sessionRoot, ...options }), {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

function runValidateOnlyFailure(sessionRoot, options = {}) {
  return spawnSync('powershell', powershellArguments({ sessionRoot, ...options }), {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
}

function writeOwnedProcessFixture({
  drift = false,
  protectedPid = false,
  cleanupBranch,
  includeRootStop = false,
} = {}) {
  const sessionOwner = {
    pid: 1111,
    parentPid: 1000,
    creationTime: '2026-07-29T10:59:00.000Z',
    executable: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    commandLine: 'powershell.exe -File native-session.ps1',
  };
  const root = {
    pid: protectedPid ? 4321 : 9876,
    parentPid: 1111,
    creationTime: '2026-07-29T11:00:00Z',
    executable: 'C:\\Contained\\native\\cargo-target\\release\\jarvis.exe',
    commandLine: 'C:\\Contained\\native\\cargo-target\\release\\jarvis.exe',
  };
  const descendant = {
    pid: 9877,
    parentPid: root.pid,
    creationTime: '2026-07-29T11:00:01Z',
    executable: 'C:\\Program Files\\WebView2\\msedgewebview2.exe',
    commandLine: 'msedgewebview2.exe --embedded-browser-webview=1',
  };
  return makeOwnedFile('owned-process', {
    sessionStartedAtUtc: '2026-07-29T10:58:59.000Z',
    cleanupBranch,
    evidenceStatus: 'NOT_RUN',
    before: { sessionOwner, root, descendants: [descendant] },
    after: {
      sessionOwner,
      root: drift ? { ...root, commandLine: `${root.commandLine} --identity-drift` } : root,
      descendants: [descendant],
    },
    stoppedPids: includeRootStop ? [descendant.pid, root.pid] : [descendant.pid],
  });
}

function evidenceAuthenticationHash() {
  return sha256Lower(`${sha256Lower(FIXED_NONCE)}\n${FIXED_EVIDENCE_TOKEN}`);
}

function validEvidence(overrides = {}) {
  const handshake = {
    profile: MONOCHROME_VISUAL_TEST,
    appIdentifier: `ai.vibespace.monochrome.test${FIXED_IDENTIFIER_SUFFIX}`,
    capabilityIdentifier: TEST_CAPABILITY,
    sessionNonceHash: sha256Lower(FIXED_NONCE),
  };
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    authenticationHash: evidenceAuthenticationHash(),
    sessionNonceHash: sha256Lower(FIXED_NONCE),
    producer: {
      pid: 9876,
      creationTimeUtc: '2026-07-29T11:00:00.000Z',
      creationTimeHash: sha256Lower('2026-07-29T11:00:00.000Z'),
      executableHash: '1'.repeat(64),
      commandHash: '2'.repeat(64),
    },
    nativeHandshake: handshake,
    frontendHandshake: handshake,
    readiness: {
      status: 'PASS',
      application: 'READY',
      fixtureSmoke: 'PASS',
      surface: 'route:chat',
      theme: 'monochrome',
      font: 'READY',
      fallback: 'NOT_USED',
    },
    deniedEffects: {
      status: 'PASS',
      manifestHash: DENIED_EFFECT_MANIFEST_HASH,
      counters: Object.fromEntries(DENIED_EFFECT_IDS.map((id) => [id, 0])),
    },
    errors: { page: [], native: [] },
    ...overrides,
  };
}

function writeEvidenceFixture(overrides = {}) {
  return makeOwnedFile('native-evidence', validEvidence(overrides));
}

function writeBaseConfigFixture(mutator = (value) => value) {
  const base = JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'app/src-tauri/tauri.conf.json'), 'utf8'),
  );
  return makeOwnedFile('base-config', mutator(structuredClone(base)));
}

function writeCapabilityFixture(mutator = (value) => value) {
  const capability = JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'app/src-tauri/capabilities/monochrome-test.json'), 'utf8'),
  );
  return makeOwnedFile('test-capability', mutator(structuredClone(capability)));
}

function powershellFunctionSource(name, nextName) {
  const source = readFileSync(SCRIPT_PATH, 'utf8');
  const start = source.indexOf(`function ${name} {`);
  const next = source.indexOf(`function ${nextName} {`, start + 1);
  const end = next === -1 ? source.length : next;
  assert.notEqual(start, -1, `missing PowerShell function ${name}`);
  return source.slice(start, end);
}

function powershellTryStatements(name) {
  const escapedPath = SCRIPT_PATH.replaceAll("'", "''");
  const command = `
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
  '${escapedPath}',
  [ref]$tokens,
  [ref]$parseErrors
)
$function = $ast.Find({
  param($node)
  $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
    $node.Name -eq '${name}'
}, $true)
$tries = @($function.Body.FindAll({
  param($node)
  $node -is [System.Management.Automation.Language.TryStatementAst]
}, $true) | ForEach-Object {
  [pscustomobject]@{
    body = $_.Body.Extent.Text
    finally = if ($null -eq $_.Finally) { $null } else { $_.Finally.Extent.Text }
  }
})
[pscustomobject]@{
  parseErrors = @($parseErrors | ForEach-Object { $_.Message })
  tries = $tries
} | ConvertTo-Json -Depth 8 -Compress
`;
  const result = JSON.parse(
    execFileSync('powershell', ['-NoProfile', '-Command', command], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }),
  );
  assert.deepEqual(result.parseErrors, []);
  return result.tries;
}

test('native-session.ps1 exists as a contained runner contract', () => {
  assert.equal(existsSync(SCRIPT_PATH), true, 'missing native-session.ps1');
});

test('ValidateOnly emits a unique identity and strict unused loopback port without an owner kill path', () => {
  const report = runValidateOnly(makeSessionRoot());
  assert.equal(report.mode, 'validate-only');
  assert.equal(report.identity.host, '127.0.0.1');
  assert.equal(report.identity.port, FIXED_PORT);
  assert.equal(report.identity.devUrl, `http://127.0.0.1:${FIXED_PORT}`);
  assert.equal(
    report.identity.identifier,
    `ai.vibespace.monochrome.test${FIXED_IDENTIFIER_SUFFIX}`,
  );
  assert.equal(report.portSelection.killsOwner, false);
  assert.equal(report.portSelection.usesDevDesktopHelper, false);
  assert.equal(report.portSelection.ownerPid, null);
  assert.equal(
    report.portSelection.verification,
    'exclusive-bind-reservation-held-through-validation',
  );
  assert.equal(report.portSelection.reservationReleasedAfterValidation, true);
  assert.equal(report.session.commit, FIXED_COMMIT);
  assert.equal(report.session.nonceHash, sha256Lower(FIXED_NONCE));
  assert.match(report.session.nonceHash, /^[0-9a-f]{64}$/u);
  assert.equal('nonce' in report.session, false);
});

test('ValidateOnly refuses an occupied loopback port and leaves its owner listening', async () => {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.equal(typeof address, 'object');
  const result = runValidateOnlyFailure(makeSessionRoot(), { port: address.port });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /strict loopback port.*already in use/iu);
  assert.equal(server.listening, true, 'runner must not terminate the listener owner');
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test('generated override replaces capabilities and CSP with exact test-only values', () => {
  const report = runValidateOnly(makeSessionRoot());
  const override = report.overrideConfig;
  assert.deepEqual(override.app.security.capabilities, [TEST_CAPABILITY]);
  assert.equal(override.app.security.csp, EXACT_CSP);
  assert.equal(override.build.beforeDevCommand, null);
  assert.equal(override.build.devUrl, `http://127.0.0.1:${FIXED_PORT}`);
  assert.equal(override.identifier, `ai.vibespace.monochrome.test${FIXED_IDENTIFIER_SUFFIX}`);
  assert.equal(override.bundle.active, false);
  assert.equal(override.bundle.createUpdaterArtifacts, false);
  assert.equal(override.plugins.updater, null);
  assert.deepEqual(override.app.windows, [
    {
      label: TEST_CAPABILITY,
      title: 'VibeSpace MonoChrome Visual Test',
      url: `http://127.0.0.1:${FIXED_PORT}${FIXTURE_ROUTE_AND_QUERY}`,
      visible: false,
    },
  ]);
  assert.equal(/(?:https|wss):|\*|localhost/iu.test(override.app.security.csp), false);
  assert.equal(/https?:\/\/(?!127\.0\.0\.1)/iu.test(override.app.security.csp), false);
  assert.equal(/wss?:\/\/(?!127\.0\.0\.1)/iu.test(override.app.security.csp), false);
  assert.deepEqual(report.effectiveConfigs.dev.app.windows, override.app.windows);
  assert.deepEqual(report.effectiveConfigs.dev.app.security.capabilities, [TEST_CAPABILITY]);
  assert.equal(report.effectiveConfigs.dev.plugins.updater, null);
  assert.equal(report.effectiveConfigs.dev.bundle.active, false);
  assert.equal(report.effectiveConfigs.dev.bundle.createUpdaterArtifacts, false);
});

test('NSIS override is unsigned-only metadata and never enables updater or installer launch', () => {
  const report = runValidateOnly(makeSessionRoot());
  const nsis = report.nsisConfig;
  assert.equal(nsis.bundle.createUpdaterArtifacts, false);
  assert.deepEqual(nsis.bundle.targets, ['nsis']);
  assert.equal(nsis.identifier, `ai.vibespace.monochrome.test${FIXED_IDENTIFIER_SUFFIX}`);
  assert.equal(nsis.app.windows[0].url, FIXTURE_ROUTE_AND_QUERY);
  assert.equal(report.executionModes.buildUnsignedNsisArtifact.launchesInstaller, false);
  assert.equal(report.executionModes.buildUnsignedNsisArtifact.signsArtifact, false);
  assert.equal(report.executionModes.buildUnsignedNsisArtifact.publishesArtifact, false);
});

test('optimized release config uses the embedded frontend and exact test-only native boundary', () => {
  const report = runValidateOnly(makeSessionRoot());
  assert.equal(report.releaseConfig.app.windows[0].url, FIXTURE_ROUTE_AND_QUERY);
  assert.deepEqual(report.releaseConfig.app.security.capabilities, [TEST_CAPABILITY]);
  assert.equal(report.releaseConfig.app.security.csp, EXACT_CSP);
  assert.equal(report.releaseConfig.bundle.active, false);
  assert.equal(report.releaseConfig.bundle.createUpdaterArtifacts, false);
  assert.equal(report.executionModes.buildReleaseExecutable.launchesNativeApp, true);
  assert.equal(report.executionModes.buildReleaseExecutable.requiresOptimizedExecutable, true);
  assert.equal(report.executionModes.buildReleaseExecutable.requiresIdentityBoundCleanup, true);
  assert.equal(report.executionModes.buildReleaseExecutable.requiresAuthenticatedEvidence, true);
  assert.equal(report.executionModes.buildReleaseExecutable.deadlineSeconds, 120);
});

test('build keeps parent toolchain homes while child-only paths stay relative to the session root', () => {
  const report = runValidateOnly(makeSessionRoot());
  const build = report.buildEnvironment;
  assert.equal(build.usesParentToolchainHomes, true);
  assert.equal(build.relocatesCargoHome, false);
  assert.equal(build.relocatesRustupHome, false);
  assert.equal(build.retainsParentUserHomeUntilChildLaunch, true);
  for (const key of ['cargoHome', 'rustupHome', 'userProfile', 'home']) {
    assert.equal(build[key].present, true, `missing ${key} metadata`);
    assert.equal(build[key].type, 'path');
    assert.match(build[key].sha256, /^[0-9a-f]{64}$/u);
    assert.equal('value' in build[key], false);
  }
  assert.match(
    build.cargoTarget.relativePath,
    /^app\/src-tauri\/target\/monochrome-sessions\/[0-9a-f]{32}$/u,
  );
  assert.equal(build.cargoTarget.underSessionRoot, false);
  assert.equal(build.cargoTarget.underRepoOwnedBuildRoot, true);
  assert.equal(build.cargoTarget.applicationControlCompatible, true);

  const child = report.childEnvironment;
  assert.equal(child.VIBESPACE_RUNTIME_PROFILE, MONOCHROME_VISUAL_TEST);
  assert.equal(child.VIBESPACE_MONOCHROME_SESSION_NONCE_HASH, sha256Lower(FIXED_NONCE));
  for (const key of [
    'APPDATA',
    'LOCALAPPDATA',
    'USERPROFILE',
    'HOME',
    'HOMEDRIVE',
    'HOMEPATH',
    'WEBVIEW2_USER_DATA_FOLDER',
    'TEMP',
    'TMP',
  ]) {
    assert.match(child.paths[key], /^native\/profile\//u);
  }
  assert.equal('CARGO_HOME' in child, false);
  assert.equal('RUSTUP_HOME' in child, false);
});

test('paired compile/native signals and handshake expectations agree exactly without persisting the nonce', () => {
  const report = runValidateOnly(makeSessionRoot());
  const nonceHash = sha256Lower(FIXED_NONCE);
  assert.deepEqual(report.viteEnvironment, {
    VITE_VIBESPACE_RUNTIME_PROFILE: MONOCHROME_VISUAL_TEST,
    VITE_VIBESPACE_MONOCHROME_APP_IDENTIFIER: `ai.vibespace.monochrome.test${FIXED_IDENTIFIER_SUFFIX}`,
    VITE_VIBESPACE_MONOCHROME_CAPABILITY_IDENTIFIER: TEST_CAPABILITY,
    VITE_VIBESPACE_MONOCHROME_SESSION_NONCE_HASH: nonceHash,
  });
  assert.deepEqual(report.runtimeHandshake.expected, {
    profile: MONOCHROME_VISUAL_TEST,
    appIdentifier: `ai.vibespace.monochrome.test${FIXED_IDENTIFIER_SUFFIX}`,
    capabilityIdentifier: TEST_CAPABILITY,
    sessionNonceHash: nonceHash,
  });
  assert.deepEqual(report.runtimeHandshake.responseFields, [
    'profile',
    'appIdentifier',
    'capabilityIdentifier',
    'sessionNonceHash',
  ]);
  assert.equal(report.runtimeHandshake.command, 'runtime_profile_query');
  assert.equal(report.runtimeHandshake.status, 'NOT_RUN');
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes(FIXED_NONCE), false);
});

test('protected-state persistence contains hashes and metadata only', () => {
  const report = runValidateOnly(makeSessionRoot());
  const protectedState = report.protectedState;
  assert.equal(protectedState.processCount, 1);
  assert.equal(protectedState.processes.length, 1);
  const proc = protectedState.processes[0];
  assert.equal(proc.pid, 4321);
  assert.equal(proc.executableHash, sha256Lower(RAW_EXECUTABLE));
  assert.equal(proc.commandHash, sha256Lower(RAW_COMMAND));
  assert.match(proc.creationTimeHash, /^[0-9a-f]{64}$/u);
  assert.equal(protectedState.launcher.pathHash, sha256Lower(RAW_LAUNCHER));
  assert.equal(protectedState.launcher.contentHash, sha256Lower('sensitive-launcher-bytes'));
  assert.equal(protectedState.launcher.exists, true);
  assert.equal(protectedState.launcher.type, 'regular-file');
  assert.equal(protectedState.registryValues.length, 2);
  assert.equal(protectedState.registryValues[0].valueHash, sha256Lower(RAW_PATH));
  assert.equal(protectedState.credential.namespaceHash, sha256Lower(RAW_KEYCHAIN_NAMESPACE));
  assert.equal(protectedState.credential.targetCount, 0);
  const serialized = JSON.stringify(protectedState);
  for (const forbidden of [
    RAW_EXECUTABLE,
    RAW_COMMAND,
    RAW_LAUNCHER,
    RAW_PATH,
    RAW_KEYCHAIN_NAMESPACE,
    'SensitiveUser',
  ]) {
    assert.equal(
      serialized.includes(forbidden),
      false,
      `persisted raw protected value: ${forbidden}`,
    );
  }
});

test('ValidateOnly refuses protected-state identity drift and never offers host repair', () => {
  const drifted = protectedSnapshot({
    processes: [
      {
        ...protectedSnapshot().processes[0],
        commandLine: `${RAW_COMMAND} --drifted`,
      },
    ],
  });
  const fixturePath = writeProtectedFixture({ after: drifted });
  const result = runValidateOnlyFailure(makeSessionRoot(), { fixturePath });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /protected state drift/iu);
  assert.equal(/repair|set-itemproperty|remove-itemproperty/iu.test(result.stdout), false);
});

test('ValidateOnly refuses a reparse-point session root before writing evidence', () => {
  const parent = makeSessionRoot();
  const target = path.join(parent, 'target');
  const link = path.join(parent, 'session-link');
  mkdirSync(target);
  symlinkSync(target, link, 'junction');
  const result = runValidateOnlyFailure(link);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /reparse point/iu);
  assert.equal(existsSync(path.join(target, 'session-manifest.json')), false);
});

test('cleanup policy is identity-bound, descendant-only, drift-refusing, and never repairs host state', () => {
  const report = runValidateOnly(makeSessionRoot());
  const cargoTarget = report.buildEnvironment.cargoTarget.relativePath;
  assert.deepEqual(report.cleanup, {
    scope: 'owned-descendants-only',
    identityFields: [
      'pid',
      'parentPid',
      'creationTimeUtc',
      'creationTimeHash',
      'executableHash',
      'commandHash',
    ],
    containedPaths: [cargoTarget, 'native/profile', 'playwright/profile', 'vite/cache'],
    stopsProtectedPids: false,
    rejectsIdentityDrift: true,
    rejectsReparsePoint: true,
    rejectsProtectedStateDrift: true,
    rejectsAmbiguousAncestry: true,
    requiresParentChainValidation: true,
    requiresCreationAfterSessionAndParent: true,
    rootStopRequiresNonceConfirmedHandshake: false,
    rootStopRequiresExactOwnedIdentity: true,
    cleanupRunsWithoutAcceptedEvidence: true,
    preservesEarlierDescendantSnapshots: true,
    revalidatesEveryPathComponentBeforeUse: true,
    killsByPort: false,
    repairsHostState: false,
    stopsOwnedRootOnFailureOnly: true,
    preservesProfileEvidence: true,
  });
});

test('owned process evidence remains NOT_RUN in validation but freezes the exact launch identity contract', () => {
  const report = runValidateOnly(makeSessionRoot());
  const cargoTarget = report.buildEnvironment.cargoTarget.relativePath;
  assert.deepEqual(report.ownedProcesses, {
    status: 'NOT_RUN',
    optimizedExecutable: {
      relativePath: `${cargoTarget}/release/jarvis.exe`,
      underSessionRoot: false,
      underRepoOwnedBuildRoot: true,
      applicationControlCompatible: true,
      expectedType: 'regular-file-no-reparse',
    },
    sessionStartedAtUtc: report.ownedProcesses.sessionStartedAtUtc,
    identityFields: [
      'pid',
      'parentPid',
      'creationTimeUtc',
      'creationTimeHash',
      'executableHash',
      'commandHash',
    ],
    sessionOwner: report.ownedProcesses.sessionOwner,
    cleanupBranch: null,
    evidenceStatus: 'NOT_RUN',
    acceptanceIndependentCleanup: true,
    root: null,
    descendants: [],
    stoppedPids: [],
  });
});

test('owned process fixture records only hashed identities and exact descendant cleanup', () => {
  const report = runValidateOnly(makeSessionRoot(), {
    ownedProcessFixture: writeOwnedProcessFixture(),
  });
  assert.equal(report.ownedProcesses.status, 'VALIDATED_FIXTURE');
  assert.equal(report.ownedProcesses.root.pid, 9876);
  assert.equal(report.ownedProcesses.root.creationTimeUtc, '2026-07-29T11:00:00Z');
  assert.equal(report.ownedProcesses.descendants.length, 1);
  assert.equal(report.ownedProcesses.descendants[0].pid, 9877);
  assert.deepEqual(report.ownedProcesses.stoppedPids, [9877]);
  for (const identity of [report.ownedProcesses.root, ...report.ownedProcesses.descendants]) {
    assert.match(identity.creationTimeHash, /^[0-9a-f]{64}$/u);
    assert.match(identity.executableHash, /^[0-9a-f]{64}$/u);
    assert.match(identity.commandHash, /^[0-9a-f]{64}$/u);
    assert.equal('executable' in identity, false);
    assert.equal('commandLine' in identity, false);
  }
  assert.equal(JSON.stringify(report).includes('msedgewebview2.exe'), false);
});

test('owned process fixture refuses PID identity drift and protected-PID overlap', () => {
  const drift = runValidateOnlyFailure(makeSessionRoot(), {
    ownedProcessFixture: writeOwnedProcessFixture({ drift: true }),
  });
  assert.notEqual(drift.status, 0);
  assert.match(`${drift.stdout}\n${drift.stderr}`, /owned process identity drift/iu);

  const protectedOverlap = runValidateOnlyFailure(makeSessionRoot(), {
    ownedProcessFixture: writeOwnedProcessFixture({ protectedPid: true }),
  });
  assert.notEqual(protectedOverlap.status, 0);
  assert.match(`${protectedOverlap.stdout}\n${protectedOverlap.stderr}`, /protected pid overlap/iu);
});

test('runner publishes the exact ordinary/test runtime-profile interface oracle', () => {
  const report = runValidateOnly(makeSessionRoot());
  assert.deepEqual(report.interfaceContract, {
    testMode: {
      profile: MONOCHROME_VISUAL_TEST,
      appIdentifierPattern: '^ai\\.vibespace\\.monochrome\\.test[0-9a-f]+$',
      capabilityIdentifier: TEST_CAPABILITY,
      sessionNonceHashPattern: '^[0-9a-f]{64}$',
      deniedBeforePrivilegedEffectAdapters: true,
    },
    ordinaryMode: {
      rejectsTestOnlySignals: [
        'VITE_VIBESPACE_MONOCHROME_APP_IDENTIFIER',
        'VITE_VIBESPACE_MONOCHROME_CAPABILITY_IDENTIFIER',
        'VITE_VIBESPACE_MONOCHROME_SESSION_NONCE_HASH',
        'VIBESPACE_MONOCHROME_SESSION_NONCE_HASH',
      ],
      evidence: {
        appIdentifier: null,
        capabilityIdentifier: null,
        sessionNonceHash: null,
      },
    },
  });
});

test('release and NSIS command plans are isolated, unsigned, and distinguish their modes', () => {
  const report = runValidateOnly(makeSessionRoot());
  assert.deepEqual(report.releaseCommand.arguments, [
    '--prefix',
    'app',
    'run',
    'tauri',
    '--',
    'build',
    '--no-bundle',
    '--no-sign',
    '--config',
    'release-override.json',
  ]);
  assert.deepEqual(report.nsisCommand.arguments, [
    '--prefix',
    'app',
    'run',
    'tauri',
    '--',
    'build',
    '--bundles',
    'nsis',
    '--no-sign',
    '--config',
    'nsis-override.json',
  ]);
  assert.deepEqual(Object.keys(report.executionModes).sort(), [
    'buildReleaseExecutable',
    'buildUnsignedNsisArtifact',
    'installedPackageSandboxVm',
    'platformCoverage',
    'runCargoLibraryTests',
    'runContainedDevSession',
    'validateOnly',
  ]);
  assert.equal(report.releaseCommand.arguments.includes('publish'), false);
  assert.equal(report.nsisCommand.arguments.includes('publish'), false);
});

test('ValidateOnly truthfully preserves generated artifacts only with explicit PreserveArtifacts', () => {
  const sessionRoot = makeSessionRoot();
  const report = runValidateOnly(sessionRoot);
  assert.deepEqual(report.writtenFiles, [
    'session-owner.json',
    'override.json',
    'release-override.json',
    'nsis-override.json',
    'session-manifest.json',
  ]);
  for (const relativePath of report.writtenFiles) {
    assert.equal(existsSync(path.join(sessionRoot, relativePath)), true, relativePath);
  }
  const overrideOnDisk = JSON.parse(readFileSync(path.join(sessionRoot, 'override.json'), 'utf8'));
  assert.deepEqual(overrideOnDisk.app.security.capabilities, [TEST_CAPABILITY]);
  const manifestOnDisk = JSON.parse(
    readFileSync(path.join(sessionRoot, 'session-manifest.json'), 'utf8'),
  );
  assert.equal(manifestOnDisk.session.nonceHash, sha256Lower(FIXED_NONCE));
  assert.equal('nonce' in manifestOnDisk.session, false);
  assert.equal(JSON.stringify(manifestOnDisk).includes('SensitiveUser'), false);
  assert.equal('sessionRoot' in report, false);
  assert.match(report.sessionRootHash, /^[0-9a-f]{64}$/u);
});

test('ValidateOnly self-cleans its nonce-owned session tree by default', () => {
  const sessionRoot = makeSessionRoot();
  const report = runValidateOnly(sessionRoot, { preserveArtifacts: false });
  assert.equal(report.mode, 'validate-only');
  assert.equal(report.artifactDisposition, 'SELF_CLEANED');
  assert.equal(existsSync(sessionRoot), false);
});

test('artifact disposition truthfully distinguishes self-cleaned validation from preserved live evidence', () => {
  const disposition = powershellFunctionSource(
    'Get-ArtifactDisposition',
    'Set-ReportDeniedEffectsFromEvidence',
  );
  const command = `${disposition}
$modes = @(
  [pscustomobject]@{ mode = 'ValidateOnly'; preserve = $false },
  [pscustomobject]@{ mode = 'ValidateOnly'; preserve = $true },
  [pscustomobject]@{ mode = 'BuildReleaseExecutable'; preserve = $false },
  [pscustomobject]@{ mode = 'BuildUnsignedNsisArtifact'; preserve = $false },
  [pscustomobject]@{ mode = 'RunContainedDevSession'; preserve = $false }
)
$modes | ForEach-Object {
  Get-ArtifactDisposition -ParameterSetName $_.mode -PreserveArtifacts $_.preserve
} | ConvertTo-Json -Compress
`;
  const result = JSON.parse(
    execFileSync('powershell', ['-NoProfile', '-Command', command], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }),
  );

  assert.deepEqual(result, [
    'SELF_CLEANED',
    'PRESERVED_EXPLICITLY',
    'PRESERVED_FOR_EVIDENCE',
    'PRESERVED_FOR_EVIDENCE',
    'PRESERVED_FOR_EVIDENCE',
  ]);
});

test('a retry preserves stale authenticated evidence before opening the one-shot producer path', () => {
  const sessionRoot = makeSessionRoot();
  const evidenceDirectory = path.join(sessionRoot, 'evidence');
  const evidencePath = path.join(evidenceDirectory, 'native-evidence.json');
  const previousEvidence = `${JSON.stringify({ attempt: 'previous', nonce: 'old' })}\n`;
  mkdirSync(evidenceDirectory, { recursive: true });
  writeFileSync(evidencePath, previousEvidence, 'utf8');

  const absolutePath = powershellFunctionSource('Get-AbsolutePath', 'Test-IsContainedPath');
  const containedPath = powershellFunctionSource(
    'Test-IsContainedPath',
    'Assert-NoReparsePathComponents',
  );
  const reparseGuard = powershellFunctionSource(
    'Assert-NoReparsePathComponents',
    'Assert-OrdinaryDirectory',
  );
  const ordinaryDirectory = powershellFunctionSource(
    'Assert-OrdinaryDirectory',
    'Ensure-ContainedDirectory',
  );
  const containedDirectory = powershellFunctionSource(
    'Ensure-ContainedDirectory',
    'New-StrictLoopbackReservation',
  );
  const fileHash = powershellFunctionSource('Get-FileSha256', 'New-RandomHex');
  const staleEvidenceArchive = powershellFunctionSource(
    'Move-StaleEvidenceToAttemptArchive',
    'Write-JsonFile',
  );
  const quotedRoot = sessionRoot.replaceAll("'", "''");
  const command = `${absolutePath}
${containedPath}
${reparseGuard}
${ordinaryDirectory}
${containedDirectory}
${fileHash}
${staleEvidenceArchive}
$SessionTrustedRoot = '${quotedRoot}'
Move-StaleEvidenceToAttemptArchive -SessionRoot '${quotedRoot}' -StartedAtUtc ([datetime]'2026-07-30T02:30:00Z') -NonceHash '${'a'.repeat(64)}' | ConvertTo-Json -Compress
`;
  const archivedRelativePath = JSON.parse(
    execFileSync('powershell', ['-NoProfile', '-Command', command], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }),
  );
  const archivedPath = path.join(sessionRoot, ...archivedRelativePath.split('/'));

  assert.equal(existsSync(evidencePath), false);
  assert.equal(existsSync(archivedPath), true);
  assert.equal(readFileSync(archivedPath, 'utf8'), previousEvidence);
  assert.match(
    archivedRelativePath,
    /^logs\/evidence-attempts\/20260730T023000000Z-[a-f0-9]{12}-[a-f0-9]{16}\.json$/u,
  );
});

test('denied-effect counters are recorded honestly as NOT_RUN during validation', () => {
  const report = runValidateOnly(makeSessionRoot());
  assert.equal(report.deniedEffects.status, 'NOT_RUN');
  assert.deepEqual(Object.keys(report.deniedEffects.counters), DENIED_EFFECT_IDS);
  assert.equal(
    Object.values(report.deniedEffects.counters).every((value) => value === null),
    true,
  );
});

test('evidence channel contract is nonce-bound, deadline-bounded, and requires every producer surface', () => {
  const report = runValidateOnly(makeSessionRoot());
  assert.deepEqual(report.evidenceChannel, {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    relativePath: 'evidence/native-evidence.json',
    status: 'NOT_RUN',
    deadlineSeconds: 120,
    authentication: {
      algorithm: 'sha256',
      proofInput: 'sessionNonceHash-newline-ephemeralEvidenceToken',
      expectedHash: evidenceAuthenticationHash(),
      rawTokenPersisted: false,
    },
    required: {
      nativeHandshake: ['profile', 'appIdentifier', 'capabilityIdentifier', 'sessionNonceHash'],
      frontendHandshake: ['profile', 'appIdentifier', 'capabilityIdentifier', 'sessionNonceHash'],
      readiness: ['status', 'application', 'fixtureSmoke', 'surface', 'theme', 'font', 'fallback'],
      deniedEffects: ['status', 'manifestHash', 'counters'],
      errors: ['page', 'native'],
      producer: ['pid', 'creationTimeUtc', 'creationTimeHash', 'executableHash', 'commandHash'],
    },
    result: null,
  });
});

test('evidence validator accepts an exact authenticated fixture without inventing execution', () => {
  const report = runValidateOnly(makeSessionRoot(), {
    evidenceFixture: writeEvidenceFixture(),
  });
  assert.equal(report.evidenceChannel.status, 'VALIDATED_FIXTURE');
  assert.equal(report.runtimeHandshake.status, 'VALIDATED_FIXTURE');
  assert.equal(report.deniedEffects.status, 'VALIDATED_FIXTURE');
  assert.equal(report.harnessHandoff.status, 'NOT_RUN');
  assert.deepEqual(report.nativeEvidence, {
    profile: null,
    appIdentifier: null,
    capabilityIdentifier: null,
    sessionNonceHash: null,
  });
  assert.deepEqual(report.outcomes.optimizedExecutable, {
    status: 'NOT_RUN',
    evidence: null,
  });
  assert.equal(report.evidenceChannel.result.readiness.status, 'PASS');
  assert.deepEqual(report.evidenceChannel.result.errors, { page: [], native: [] });
  assert.equal(
    report.evidenceChannel.result.deniedEffects.manifestHash,
    DENIED_EFFECT_MANIFEST_HASH,
  );
  assert.deepEqual(
    Object.keys(report.evidenceChannel.result.deniedEffects.counters),
    DENIED_EFFECT_IDS,
  );
  assert.equal(
    Object.values(report.evidenceChannel.result.deniedEffects.counters).every(
      (value) => value === 0,
    ),
    true,
  );
  assert.equal(JSON.stringify(report).includes(FIXED_EVIDENCE_TOKEN), false);
});

test('harness handoff cannot become READY from synthetic validation evidence', () => {
  const report = runValidateOnly(makeSessionRoot(), {
    evidenceFixture: writeEvidenceFixture(),
  });
  assert.equal(report.contained, true);
  assert.deepEqual(report.nativeEvidence, {
    profile: null,
    appIdentifier: null,
    capabilityIdentifier: null,
    sessionNonceHash: null,
  });
  assert.deepEqual(report.harnessHandoff, {
    status: 'NOT_RUN',
    reportRelativePath: 'session-manifest.json',
    consumerArgument: '--handshake-report',
    requiredTopLevelFields: ['contained', 'nativeEvidence'],
    readinessSource: 'actual-authenticated-product-producer-only',
  });
  assert.equal(JSON.stringify(report).includes(FIXED_NONCE), false);
});

test('harness handoff rejects shape drift and remains NOT_RUN without producer evidence', () => {
  const report = runValidateOnly(makeSessionRoot());
  assert.equal(report.contained, true);
  assert.deepEqual(report.nativeEvidence, {
    profile: null,
    appIdentifier: null,
    capabilityIdentifier: null,
    sessionNonceHash: null,
  });
  assert.equal(report.harnessHandoff.status, 'NOT_RUN');
  const drift = runValidateOnlyFailure(makeSessionRoot(), {
    evidenceFixture: makeOwnedFile('shape-drift-evidence', {
      ...validEvidence(),
      nativeHandshake: {
        profile: MONOCHROME_VISUAL_TEST,
        app_identifier: `ai.vibespace.monochrome.test${FIXED_IDENTIFIER_SUFFIX}`,
        capabilityIdentifier: TEST_CAPABILITY,
        sessionNonceHash: sha256Lower(FIXED_NONCE),
      },
    }),
  });
  assert.notEqual(drift.status, 0);
  assert.match(`${drift.stdout}\n${drift.stderr}`, /nativeHandshake fields/iu);
});

test('runner exposes the missing real product producer as a non-bypassable dependency', () => {
  const report = runValidateOnly(makeSessionRoot());
  assert.deepEqual(report.productProducerDependency, {
    status: 'MISSING_PRODUCT_INTEGRATION',
    owner: 'frontend-native-integration-lane',
    requiredEnvironment: [
      'VIBESPACE_MONOCHROME_EVIDENCE_PATH',
      'VIBESPACE_MONOCHROME_EVIDENCE_TOKEN',
      'VIBESPACE_MONOCHROME_SESSION_NONCE_HASH',
    ],
    requiredOrigin: 'actual-owned-native-process-tree',
    fixtureMayValidateSchema: true,
    fixtureMaySetReady: false,
    executableModeFailsClosedWhileMissing: true,
  });
  assert.equal(report.harnessHandoff.status, 'NOT_RUN');
});

test('real product producer interface freezes command, authentication, and atomic file ownership', () => {
  const report = runValidateOnly(makeSessionRoot());
  assert.deepEqual(report.productProducerInterface, {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    runtimeQuery: {
      command: 'runtime_profile_query',
      requestFields: [],
      resultFields: [
        'profile',
        'appIdentifier',
        'capabilityIdentifier',
        'sessionNonceHash',
        'deniedEffects',
      ],
    },
    evidenceCommit: {
      command: 'monochrome_evidence_commit',
      requestFields: ['nativeHandshake', 'frontendHandshake', 'readiness', 'errors'],
      resultFields: ['status', 'schemaVersion', 'sessionNonceHash', 'producer'],
    },
    authentication: {
      owner: 'native-rust-command',
      tokenEnvironment: 'VIBESPACE_MONOCHROME_EVIDENCE_TOKEN',
      nonceHashEnvironment: 'VIBESPACE_MONOCHROME_SESSION_NONCE_HASH',
      proof: 'sha256(sessionNonceHash-newline-ephemeralEvidenceToken)',
      tokenExposedToFrontend: false,
    },
    fileWrite: {
      owner: 'native-rust-command',
      pathEnvironment: 'VIBESPACE_MONOCHROME_EVIDENCE_PATH',
      strategy: 'same-directory-temp-file-fsync-atomic-rename',
      frontendDirectWriteAllowed: false,
    },
  });
});

test('all fixture and override injection parameters are validation-only by parameter-set contract', () => {
  const source = readFileSync(SCRIPT_PATH, 'utf8');
  for (const parameter of [
    'ProtectedStateFixture',
    'OwnedProcessFixture',
    'EvidenceFixture',
    'BaseConfigFixture',
    'TestCapabilityFixture',
    'UnsignedNsisArtifactFixture',
  ]) {
    const declaration = new RegExp(
      String.raw`\[Parameter\(ParameterSetName = 'ValidateOnly'\)\][\s\S]{0,120}\$(?:${parameter})\b`,
      'u',
    );
    assert.match(source, declaration, `${parameter} must be validation-only`);
  }
  assert.match(source, /Alias\('EvidenceFixturePath'\)/u);
  assert.match(source, /Alias\('ProtectedAfterFixturePath'\)/u);
});

test('evidence validator rejects authentication, handshake, readiness, errors, and denied-counter drift', () => {
  const adversarial = [
    validEvidence({ authenticationHash: '0'.repeat(64) }),
    validEvidence({
      nativeHandshake: {
        ...validEvidence().nativeHandshake,
        profile: 'ordinary',
      },
    }),
    validEvidence({ readiness: { ...validEvidence().readiness, application: 'NOT_RUN' } }),
    validEvidence({ errors: { page: ['boom'], native: [] } }),
    validEvidence({
      deniedEffects: {
        ...validEvidence().deniedEffects,
        counters: { ...validEvidence().deniedEffects.counters, registry: 1 },
      },
    }),
  ];
  for (const evidence of adversarial) {
    const result = runValidateOnlyFailure(makeSessionRoot(), {
      evidenceFixture: makeOwnedFile('adversarial-evidence', evidence),
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /evidence/iu);
  }
});

test('evidence validator requires exact NOT_USED fallback before report promotion', () => {
  for (const fallback of ['USED', 'NOT_RUN', 'not_used']) {
    const evidence = validEvidence({
      readiness: { ...validEvidence().readiness, fallback },
    });
    const result = runValidateOnlyFailure(makeSessionRoot(), {
      evidenceFixture: makeOwnedFile('fallback-evidence', evidence),
    });
    assert.notEqual(result.status, 0, `fallback ${fallback} must fail closed`);
    assert.match(`${result.stdout}\n${result.stderr}`, /evidence readiness/iu);
  }
});

test('evidence validator requires the exact denied-effect manifest, order, integer type, and zero value', () => {
  const exactCounters = validEvidence().deniedEffects.counters;
  const invalidDeniedEffects = [
    {
      ...validEvidence().deniedEffects,
      manifestHash: '3'.repeat(64),
    },
    {
      ...validEvidence().deniedEffects,
      counters: Object.fromEntries([...DENIED_EFFECT_IDS].reverse().map((id) => [id, 0])),
    },
    ...[null, false, '0', 0.4].map((invalidValue) => ({
      ...validEvidence().deniedEffects,
      counters: { ...exactCounters, registry: invalidValue },
    })),
  ];

  for (const deniedEffects of invalidDeniedEffects) {
    const result = runValidateOnlyFailure(makeSessionRoot(), {
      evidenceFixture: writeEvidenceFixture({ deniedEffects }),
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /deniedEffects|counter|manifest/iu);
  }
});

test('report denied-effect publication copies evidence values instead of synthesizing counters', () => {
  const copy = powershellFunctionSource(
    'Set-ReportDeniedEffectsFromEvidence',
    'Assert-AndSanitizeEvidence',
  );
  const ids = DENIED_EFFECT_IDS.map((id) => `'${id}'`).join(', ');
  const command = `$DeniedEffectIds = @(${ids})
${copy}
$source = [ordered]@{}
$expected = [ordered]@{}
$index = 1
foreach ($effectId in $DeniedEffectIds) {
  $source[$effectId] = [long]$index
  $expected[$effectId] = [long]$index
  $index += 1
}
$report = [ordered]@{ deniedEffects = [ordered]@{ status = 'NOT_RUN'; counters = $null } }
$evidence = [pscustomobject]@{ deniedEffects = [pscustomobject]@{ status = 'PASS'; counters = [pscustomobject]$source } }
Set-ReportDeniedEffectsFromEvidence -Report $report -Evidence $evidence
[pscustomobject]@{ actual = $report.deniedEffects; expected = $expected } | ConvertTo-Json -Depth 8 -Compress
`;
  const result = JSON.parse(
    execFileSync('powershell', ['-NoProfile', '-Command', command], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }),
  );
  assert.equal(result.actual.status, 'PASS');
  assert.deepEqual(result.actual.counters, result.expected);
});

test('post-launch cleanup policy is acceptance-independent for every owned failure branch', () => {
  const branches = [
    'vite-startup-error',
    'vite-listener-timeout',
    'native-startup-error',
    'native-early-exit',
    'native-evidence-timeout',
    'optimized-early-exit',
    'optimized-evidence-error',
  ];
  for (const cleanupBranch of branches) {
    const report = runValidateOnly(makeSessionRoot(), {
      ownedProcessFixture: writeOwnedProcessFixture({
        cleanupBranch,
        includeRootStop: true,
      }),
    });
    assert.equal(report.ownedProcesses.status, 'VALIDATED_FIXTURE');
    assert.equal(report.ownedProcesses.cleanupBranch, cleanupBranch);
    assert.equal(report.ownedProcesses.evidenceStatus, 'NOT_RUN');
    assert.equal(report.ownedProcesses.acceptanceIndependentCleanup, true);
    assert.deepEqual(report.ownedProcesses.stoppedPids, [9877, 9876]);
  }
});

test('dev and optimized execution functions place exact cleanup in unconditional finally paths', () => {
  const source = readFileSync(SCRIPT_PATH, 'utf8');
  const dev = powershellFunctionSource('Invoke-ContainedDevSession', 'Invoke-OptimizedNativeChild');
  const lane = powershellFunctionSource(
    'Invoke-IdentityBoundCleanupLane',
    'Invoke-ContainedDevSession',
  );
  const optimized = powershellFunctionSource('Invoke-OptimizedNativeChild', 'END_OF_RUNNER');
  assert.match(dev, /finally\s*\{[\s\S]*Invoke-IdentityBoundCleanupLane/u);
  assert.match(lane, /Stop-IdentityBoundProcessTree/u);
  assert.doesNotMatch(
    dev,
    /if\s*\(\$null -ne \$validatedEvidence\)\s*\{[\s\S]{0,600}Stop-IdentityBoundProcessTree/u,
  );
  assert.match(optimized, /finally\s*\{[\s\S]*Invoke-IdentityBoundCleanupLane/u);
  assert.doesNotMatch(optimized, /Refusing root cleanup without a nonce-confirmed/iu);
  assert.match(source, /function Merge-OwnedProcessSnapshots/u);
  assert.match(dev, /Merge-OwnedProcessSnapshots/u);
  assert.match(optimized, /Merge-OwnedProcessSnapshots/u);
});

test('optimized cleanup boundary is active at launch and encloses every initial identity validation', () => {
  const cleanupTries = powershellTryStatements('Invoke-OptimizedNativeChild').filter((statement) =>
    statement.finally?.includes('Invoke-IdentityBoundCleanupLane'),
  );
  assert.equal(cleanupTries.length, 1, 'optimized lane must have one cleanup-bearing try/finally');
  const [{ body, finally: cleanup }] = cleanupTries;
  const orderedMarkers = [
    '$nativeProcess = Start-Process',
    '$candidateRootIdentity = Get-OwnedProcessIdentity',
    'Assert-OwnedProcessAncestry',
    'Optimized native child executable identity does not match the built artifact.',
    'Protected PID overlap detected for the optimized native child.',
    '$rootIdentity = $candidateRootIdentity',
    '$deadline = [datetime]::UtcNow.AddSeconds($EvidenceTimeoutSeconds)',
  ];
  let prior = -1;
  for (const marker of orderedMarkers) {
    const index = body.indexOf(marker);
    assert.notEqual(index, -1, `${marker} must be inside the cleanup-bearing try body`);
    assert.ok(index > prior, `${marker} must preserve deterministic post-launch ordering`);
    prior = index;
  }
  assert.match(cleanup, /Invoke-IdentityBoundCleanupLane/u);
  assert.match(cleanup, /-RootIdentity \$rootIdentity/u);
  assert.doesNotMatch(cleanup, /candidateRootIdentity/u);
  assert.doesNotMatch(cleanup, /Stop-Process|taskkill|kill\s/u);
});

test('identity cleanup continues after injected protected and stop failures and aggregates categories', () => {
  const cleanup = powershellFunctionSource(
    'Stop-IdentityBoundProcessTree',
    'Invoke-ContainedDevSession',
  );
  const command = `${cleanup}
$global:attempts = @()
$resolver = { param($processId) [pscustomobject]@{ pid = $processId } }
$comparer = { param($expected, $actual) $true }
$stopper = { param($processId) $global:attempts += $processId; if ($processId -eq 3) { throw 'injected stop failure' } }
$root = [pscustomobject]@{ pid = 1; creationTime = '2026-07-29T11:00:00Z' }
$descendants = @(
  [pscustomobject]@{ pid = 2; creationTime = '2026-07-29T11:00:02Z' },
  [pscustomobject]@{ pid = 3; creationTime = '2026-07-29T11:00:01Z' }
)
$result = Stop-IdentityBoundProcessTree -RootIdentity $root -Descendants $descendants -ProtectedPids @(2) -IdentityResolver $resolver -IdentityComparer $comparer -ProcessStopper $stopper
[pscustomobject]@{ attempts = $global:attempts; errors = $result.errors; stopped = $result.stoppedPids } | ConvertTo-Json -Compress
`;
  const result = JSON.parse(
    execFileSync('powershell', ['-NoProfile', '-Command', command], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }),
  );
  assert.deepEqual(result.attempts, [3, 1]);
  assert.deepEqual(
    result.errors.map(({ category, pid }) => [category, pid]),
    [
      ['protected-identity', 2],
      ['stop-failed', 3],
    ],
  );
  assert.deepEqual(result.stopped, [1]);
});

test('identity cleanup deterministically breaks equal creation-time ties by descending PID', () => {
  const cleanup = powershellFunctionSource(
    'Stop-IdentityBoundProcessTree',
    'Invoke-IdentityBoundCleanupLane',
  );
  const command = `${cleanup}
function Invoke-EqualTimeOrder([int[]]$pids) {
  $global:attempts = @()
  $resolver = { param($processId) [pscustomobject]@{ pid = $processId } }
  $comparer = { param($expected, $actual) $true }
  $stopper = { param($processId) $global:attempts += $processId }
  $root = [pscustomobject]@{ pid = 1; creationTime = '2026-07-29T11:00:00Z' }
  $descendants = @($pids | ForEach-Object {
    [pscustomobject]@{ pid = $_; creationTime = '2026-07-29T11:00:01Z' }
  })
  $null = Stop-IdentityBoundProcessTree -RootIdentity $root -Descendants $descendants -ProtectedPids @() -IdentityResolver $resolver -IdentityComparer $comparer -ProcessStopper $stopper
  return @($global:attempts)
}
[pscustomobject]@{
  first = @(Invoke-EqualTimeOrder @(2, 4, 3))
  second = @(Invoke-EqualTimeOrder @(3, 2, 4))
} | ConvertTo-Json -Depth 8 -Compress
`;
  const result = JSON.parse(
    execFileSync('powershell', ['-NoProfile', '-Command', command], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }),
  );
  assert.deepEqual(result.first, [4, 3, 2, 1]);
  assert.deepEqual(result.second, [4, 3, 2, 1]);
});

test('lane refresh failure still cleans retained identities and continues through the second lane', () => {
  const treeCleanup = powershellFunctionSource(
    'Stop-IdentityBoundProcessTree',
    'Invoke-IdentityBoundCleanupLane',
  );
  const laneCleanup = powershellFunctionSource(
    'Invoke-IdentityBoundCleanupLane',
    'Invoke-ContainedDevSession',
  );
  const command = `${treeCleanup}
${laneCleanup}
$global:attempts = @()
$identityResolver = { param($processId) [pscustomobject]@{ pid = $processId } }
$identityComparer = { param($expected, $actual) $true }
$stopper = {
  param($processId)
  $global:attempts += $processId
  if ($processId -eq 12) { throw 'injected retained descendant stop failure' }
}
$merge = { param($recorded, $current) @($recorded) + @($current) }
$ancestry = { param($snapshot, $startedAt) }
$native = Invoke-IdentityBoundCleanupLane -Lane native -RootIdentity ([pscustomobject]@{ pid = 11; creationTime = '2026-07-29T11:00:00Z' }) -RetainedDescendants @([pscustomobject]@{ pid = 12; creationTime = '2026-07-29T11:00:01Z' }) -SessionOwner ([pscustomobject]@{ pid = 10 }) -SessionStartedAtUtc ([datetime]'2026-07-29T10:59:00Z') -DescendantResolver { throw 'injected refresh failure' } -SnapshotMerger $merge -AncestryValidator $ancestry -IdentityResolver $identityResolver -IdentityComparer $identityComparer -ProcessStopper $stopper
$vite = Invoke-IdentityBoundCleanupLane -Lane vite -RootIdentity ([pscustomobject]@{ pid = 21; creationTime = '2026-07-29T11:00:00Z' }) -RetainedDescendants @([pscustomobject]@{ pid = 22; creationTime = '2026-07-29T11:00:01Z' }) -SessionOwner ([pscustomobject]@{ pid = 10 }) -SessionStartedAtUtc ([datetime]'2026-07-29T10:59:00Z') -DescendantResolver { @() } -SnapshotMerger $merge -AncestryValidator $ancestry -IdentityResolver $identityResolver -IdentityComparer $identityComparer -ProcessStopper $stopper
[pscustomobject]@{ attempts = $global:attempts; errors = @($native.errors) + @($vite.errors); nativeStopped = $native.stoppedPids; viteStopped = $vite.stoppedPids } | ConvertTo-Json -Depth 8 -Compress
`;
  const result = JSON.parse(
    execFileSync('powershell', ['-NoProfile', '-Command', command], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }),
  );
  assert.deepEqual(result.attempts, [12, 11, 22, 21]);
  assert.deepEqual(result.errors, ['native/validation-failed', 'native/stop-failed/12']);
  assert.deepEqual(result.nativeStopped, [11]);
  assert.deepEqual(result.viteStopped, [22, 21]);
});

test('resolver and comparer exceptions fail only their identity while later descendants and root continue', () => {
  const cleanup = powershellFunctionSource(
    'Stop-IdentityBoundProcessTree',
    'Invoke-IdentityBoundCleanupLane',
  );
  const command = `${cleanup}
$global:attempts = @()
$resolver = {
  param($processId)
  if ($processId -eq 4) { throw 'injected resolver failure' }
  [pscustomobject]@{ pid = $processId }
}
$comparer = {
  param($expected, $actual)
  if ($expected.pid -eq 3) { throw 'injected comparer failure' }
  $true
}
$stopper = { param($processId) $global:attempts += $processId }
$root = [pscustomobject]@{ pid = 1; creationTime = '2026-07-29T11:00:00Z' }
$descendants = @(
  [pscustomobject]@{ pid = 2; creationTime = '2026-07-29T11:00:01Z' },
  [pscustomobject]@{ pid = 3; creationTime = '2026-07-29T11:00:02Z' },
  [pscustomobject]@{ pid = 4; creationTime = '2026-07-29T11:00:03Z' }
)
$result = Stop-IdentityBoundProcessTree -RootIdentity $root -Descendants $descendants -IdentityResolver $resolver -IdentityComparer $comparer -ProcessStopper $stopper
$absentDescendant = [pscustomobject]@{ pid = 99; creationTime = '2026-07-29T11:00:01Z' }
$rootResolverFailure = Stop-IdentityBoundProcessTree -RootIdentity $root -Descendants @($absentDescendant) -IdentityResolver { param($processId) if ($processId -eq 99) { return $null }; throw 'injected root resolver failure' } -IdentityComparer { param($expected, $actual) $true } -ProcessStopper $stopper
$rootComparerFailure = Stop-IdentityBoundProcessTree -RootIdentity $root -Descendants @($absentDescendant) -IdentityResolver { param($processId) if ($processId -eq 99) { return $null }; [pscustomobject]@{ pid = $processId } } -IdentityComparer { param($expected, $actual) throw 'injected root comparer failure' } -ProcessStopper $stopper
[pscustomobject]@{ attempts = $global:attempts; errors = $result.errors; stopped = $result.stoppedPids; rootResolverErrors = $rootResolverFailure.errors; rootComparerErrors = $rootComparerFailure.errors } | ConvertTo-Json -Depth 8 -Compress
`;
  const result = JSON.parse(
    execFileSync('powershell', ['-NoProfile', '-Command', command], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }),
  );
  assert.deepEqual(result.attempts, [2, 1]);
  assert.deepEqual(
    result.errors.map(({ category, pid }) => [category, pid]),
    [
      ['resolver-failed', 4],
      ['comparer-failed', 3],
    ],
  );
  assert.deepEqual(result.stopped, [2, 1]);
  assert.deepEqual(
    result.rootResolverErrors.map(({ category, pid }) => [category, pid]),
    [['resolver-failed', 1]],
  );
  assert.deepEqual(
    result.rootComparerErrors.map(({ category, pid }) => [category, pid]),
    [['comparer-failed', 1]],
  );
});

test('merge and optimized ancestry failures exclude new candidates while retained identities still stop', () => {
  const treeCleanup = powershellFunctionSource(
    'Stop-IdentityBoundProcessTree',
    'Invoke-IdentityBoundCleanupLane',
  );
  const laneCleanup = powershellFunctionSource(
    'Invoke-IdentityBoundCleanupLane',
    'Invoke-ContainedDevSession',
  );
  const optimized = powershellFunctionSource('Invoke-OptimizedNativeChild', 'END_OF_RUNNER');
  assert.match(optimized, /Invoke-IdentityBoundCleanupLane/u);
  const command = `${treeCleanup}
${laneCleanup}
$global:attempts = @()
$identityResolver = { param($processId) [pscustomobject]@{ pid = $processId } }
$identityComparer = { param($expected, $actual) $true }
$stopper = { param($processId) $global:attempts += $processId }
$mergeFailure = Invoke-IdentityBoundCleanupLane -Lane native -RootIdentity ([pscustomobject]@{ pid = 11; creationTime = '2026-07-29T11:00:00Z' }) -RetainedDescendants @([pscustomobject]@{ pid = 12; creationTime = '2026-07-29T11:00:01Z' }) -SessionOwner ([pscustomobject]@{ pid = 10 }) -SessionStartedAtUtc ([datetime]'2026-07-29T10:59:00Z') -DescendantResolver { [pscustomobject]@{ pid = 13; creationTime = '2026-07-29T11:00:02Z' } } -SnapshotMerger { throw 'injected merge failure' } -AncestryValidator { } -IdentityResolver $identityResolver -IdentityComparer $identityComparer -ProcessStopper $stopper
$optimizedFailure = Invoke-IdentityBoundCleanupLane -Lane optimized -RootIdentity ([pscustomobject]@{ pid = 21; creationTime = '2026-07-29T11:00:00Z' }) -RetainedDescendants @([pscustomobject]@{ pid = 22; creationTime = '2026-07-29T11:00:01Z' }) -SessionOwner ([pscustomobject]@{ pid = 20 }) -SessionStartedAtUtc ([datetime]'2026-07-29T10:59:00Z') -DescendantResolver { [pscustomobject]@{ pid = 23; creationTime = '2026-07-29T11:00:02Z' } } -SnapshotMerger { param($recorded, $current) @($recorded) + @($current) } -AncestryValidator { throw 'injected ancestry failure' } -IdentityResolver $identityResolver -IdentityComparer $identityComparer -ProcessStopper $stopper
[pscustomobject]@{ attempts = $global:attempts; mergeErrors = $mergeFailure.errors; optimizedErrors = $optimizedFailure.errors } | ConvertTo-Json -Depth 8 -Compress
`;
  const result = JSON.parse(
    execFileSync('powershell', ['-NoProfile', '-Command', command], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }),
  );
  assert.deepEqual(result.attempts, [12, 11, 22, 21]);
  assert.deepEqual(result.mergeErrors, ['native/validation-failed']);
  assert.deepEqual(result.optimizedErrors, ['optimized/validation-failed']);
});

test('contained dev computes absent Cargo and Rustup homes from the parent profile and restores absence', () => {
  const source = readFileSync(SCRIPT_PATH, 'utf8');
  const dev = powershellFunctionSource('Invoke-ContainedDevSession', 'Invoke-OptimizedNativeChild');
  assert.match(source, /\$parentUserProfile\s*=\s*\[string\]\$env:USERPROFILE/u);
  assert.match(source, /\$cargoHome[\s\S]*Join-Path \$parentUserProfile '\.cargo'/u);
  assert.match(source, /\$rustupHome[\s\S]*Join-Path \$parentUserProfile '\.rustup'/u);
  assert.match(dev, /CARGO_HOME\s*=\s*\$cargoHome/u);
  assert.match(dev, /RUSTUP_HOME\s*=\s*\$rustupHome/u);
  assert.match(
    dev,
    /\$savedNativeEnvironment\[\$entry\.Key\][\s\S]*SetEnvironmentVariable\(\$entry\.Key, \$savedNativeEnvironment\[\$entry\.Key\]\)/u,
  );
});

test('optimized executable containment is rooted at the isolated native build target', () => {
  const absolutePath = powershellFunctionSource('Get-AbsolutePath', 'Test-IsContainedPath');
  const containedPath = powershellFunctionSource(
    'Test-IsContainedPath',
    'Assert-NoReparsePathComponents',
  );
  const buildArtifactGuard = powershellFunctionSource(
    'Assert-IsolatedNativeBuildArtifactPath',
    'Invoke-OptimizedNativeChild',
  );
  const command = `${absolutePath}
${containedPath}
${buildArtifactGuard}
$buildRoot = 'C:\\repo\\app\\src-tauri\\target\\monochrome-sessions\\abc123'
$withinBuildRoot = $true
try {
  Assert-IsolatedNativeBuildArtifactPath -NativeBuildRoot $buildRoot -Candidate "$buildRoot\\release\\jarvis.exe"
}
catch {
  $withinBuildRoot = $false
}
$siblingRejected = $false
try {
  Assert-IsolatedNativeBuildArtifactPath -NativeBuildRoot $buildRoot -Candidate 'C:\\repo\\.artifacts\\monochrome\\session\\release\\jarvis.exe'
}
catch {
  $siblingRejected = $true
}
[pscustomobject]@{
  withinBuildRoot = $withinBuildRoot
  siblingRejected = $siblingRejected
} | ConvertTo-Json -Compress
`;
  const result = JSON.parse(
    execFileSync('powershell', ['-NoProfile', '-Command', command], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }),
  );

  assert.deepEqual(result, {
    withinBuildRoot: true,
    siblingRejected: true,
  });
});

test('contained dev supplies its isolated Vite cache through config without unsupported CLI flags', () => {
  const dev = powershellFunctionSource('Invoke-ContainedDevSession', 'Invoke-OptimizedNativeChild');
  const viteConfig = readFileSync(VITE_CONFIG_PATH, 'utf8');
  const viteArguments = dev.match(/\$viteArguments\s*=\s*@\([\s\S]*?\n  \)/u)?.[0] ?? '';

  assert.doesNotMatch(dev, /['"]--cacheDir['"]/u);
  assert.doesNotMatch(viteArguments, /['"]--prefix['"]/u);
  assert.match(
    dev,
    /\$viteWorkingDirectory\s*=\s*Get-AbsolutePath[\s\S]*Join-Path \$RepoRoot 'app'/u,
  );
  assert.match(dev, /-WorkingDirectory \$viteWorkingDirectory/u);
  assert.match(dev, /VIBESPACE_VITE_CACHE_DIR\s*=\s*\$absoluteDirectories\['vite\/cache'\]/u);
  assert.match(dev, /\$viteLaunchEnvironment\.GetEnumerator\(\)/u);
  assert.match(viteConfig, /process\.env\.VIBESPACE_VITE_CACHE_DIR/u);
  assert.match(viteConfig, /path\.isAbsolute\(rawViteCacheDir\)/u);
  assert.match(viteConfig, /cacheDir:\s*viteCacheDir/u);
  assert.doesNotMatch(viteConfig, /VITE_VIBESPACE_CACHE_DIR/u);
});

test('contained dev publishes session path authority before the native producer can launch', () => {
  const dev = powershellFunctionSource('Invoke-ContainedDevSession', 'Invoke-OptimizedNativeChild');
  const manifestWrite = dev.indexOf('Write-JsonFile -Path $manifestPath -Value $report');
  const nativeLaunch = dev.indexOf('$nativeProcess = Start-Process');

  assert.notEqual(manifestWrite, -1, 'contained dev must publish its session manifest');
  assert.notEqual(nativeLaunch, -1, 'contained dev must launch its native producer');
  assert.ok(
    manifestWrite < nativeLaunch,
    'the producer path validator must observe session-manifest.json before native launch',
  );
});

test('optimized release publishes session path authority before its native producer can launch', () => {
  const optimized = powershellFunctionSource('Invoke-OptimizedNativeChild', 'END_OF_RUNNER');
  const manifestWrite = optimized.indexOf('Write-JsonFile -Path $manifestPath -Value $report');
  const nativeLaunch = optimized.indexOf('$nativeProcess = Start-Process');

  assert.notEqual(manifestWrite, -1, 'optimized release must publish its session manifest');
  assert.notEqual(nativeLaunch, -1, 'optimized release must launch its native producer');
  assert.ok(
    manifestWrite < nativeLaunch,
    'the optimized producer path validator must observe session-manifest.json before native launch',
  );
});

test('contained dev preserves Vite diagnostics and never masks its primary failure with cleanup errors', () => {
  const dev = powershellFunctionSource('Invoke-ContainedDevSession', 'Invoke-OptimizedNativeChild');

  assert.match(dev, /\$viteStandardOutputPath\s*=\s*Join-Path \$viteLogRoot/u);
  assert.match(dev, /\$viteStandardErrorPath\s*=\s*Join-Path \$viteLogRoot/u);
  assert.match(dev, /-RedirectStandardOutput \$viteStandardOutputPath/u);
  assert.match(dev, /-RedirectStandardError \$viteStandardErrorPath/u);
  assert.match(dev, /\$nativeStandardOutputPath\s*=\s*Join-Path \$nativeLogRoot/u);
  assert.match(dev, /\$nativeStandardErrorPath\s*=\s*Join-Path \$nativeLogRoot/u);
  assert.match(dev, /-RedirectStandardOutput \$nativeStandardOutputPath/u);
  assert.match(dev, /-RedirectStandardError \$nativeStandardErrorPath/u);
  assert.match(dev, /catch\s*\{\s*\$primaryFailure\s*=\s*\$_\s*throw\s*\}/u);
  assert.match(dev, /Contained dev session failed: \$\(\$primaryFailure\.Exception\.Message\)/u);
  assert.match(dev, /Cleanup errors: \$\(\$cleanupErrors -join ', '\)/u);
  assert.match(
    dev,
    /if\s*\(\$viteProcess\.HasExited\)\s*\{\s*throw 'Vite exited before authenticated evidence reached PASS\.'/u,
  );
  assert.match(dev, /CARGO_TARGET_DIR\s*=\s*\$absoluteDirectories\['native\/cargo-target'\]/u);
});

test('owned process ancestry accepts the ordered dictionaries produced by the live runner', () => {
  const optionalProperty = powershellFunctionSource(
    'Get-OptionalProperty',
    'ConvertTo-ProtectedMetadata',
  );
  const ancestry = powershellFunctionSource(
    'Assert-OwnedProcessAncestry',
    'Read-OwnedProcessFixture',
  );
  const command = `${optionalProperty}
${ancestry}
$owner = [ordered]@{ pid = 100; parentPid = 1; creationTime = '2026-07-30T12:00:00Z' }
$root = [ordered]@{ pid = 101; parentPid = 100; creationTime = '2026-07-30T12:00:01Z' }
$snapshot = [ordered]@{ sessionOwner = $owner; root = $root; descendants = @() }
Assert-OwnedProcessAncestry -Snapshot $snapshot -SessionStartedAtUtc ([datetime]'2026-07-30T12:00:00Z')
'PASS'
`;
  const output = execFileSync('powershell', ['-NoProfile', '-Command', command], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).trim();
  assert.equal(output, 'PASS');
});

test('owned process evidence hashes executable bytes and the Windows UTF-16 command line', () => {
  const executablePath = makeOwnedFile('producer-executable', {
    marker: 'native producer executable bytes',
  });
  const commandLine = `"${executablePath}" --fixture λ`;
  const hash = powershellFunctionSource('Get-Sha256', 'Get-FileSha256');
  const fileHash = powershellFunctionSource('Get-FileSha256', 'New-RandomHex');
  const optionalProperty = powershellFunctionSource(
    'Get-OptionalProperty',
    'ConvertTo-ProtectedMetadata',
  );
  const metadata = powershellFunctionSource(
    'ConvertTo-OwnedProcessMetadata',
    'ConvertTo-OwnedProcessSet',
  );
  const command = `${hash}
${fileHash}
${optionalProperty}
${metadata}
$process = [pscustomobject]@{
  pid = 42
  parentPid = 7
  creationTime = '2026-07-30T06:37:33.0565448Z'
  executable = $env:TEST_PRODUCER_EXECUTABLE
  commandLine = $env:TEST_PRODUCER_COMMAND
}
ConvertTo-OwnedProcessMetadata -Process $process | ConvertTo-Json -Compress
`;
  const result = JSON.parse(
    execFileSync('powershell', ['-NoProfile', '-Command', command], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        TEST_PRODUCER_EXECUTABLE: executablePath,
        TEST_PRODUCER_COMMAND: commandLine,
      },
    }),
  );

  assert.equal(
    result.executableHash,
    createHash('sha256').update(readFileSync(executablePath)).digest('hex'),
  );
  assert.equal(
    result.commandHash,
    createHash('sha256').update(commandLine, 'utf16le').digest('hex'),
  );
});

test('producer reconciliation retries incomplete WMI fields and restores exact creation ticks', () => {
  const optionalProperty = powershellFunctionSource(
    'Get-OptionalProperty',
    'ConvertTo-ProtectedMetadata',
  );
  const merge = powershellFunctionSource(
    'Merge-OwnedProcessSnapshots',
    'Read-ValidatedEvidenceFile',
  );
  const resolver = powershellFunctionSource(
    'Resolve-EvidenceProducerIdentity',
    'Stop-IdentityBoundProcessTree',
  );
  const command = `${optionalProperty}
${merge}
${resolver}
$global:attempts = 0
$recorded = [ordered]@{
  pid = 42
  parentPid = 7
  creationTime = '2026-07-30T06:37:33.0565440Z'
  executable = ''
  commandLine = ''
}
$identityResolver = {
  param($processId)
  $global:attempts += 1
  [ordered]@{
    pid = $processId
    parentPid = 7
    creationTime = '2026-07-30T06:37:33.0565440Z'
    executable = if ($global:attempts -eq 1) { '' } else { 'C:\\VibeSpace\\jarvis.exe' }
    commandLine = if ($global:attempts -eq 1) { '' } else { '"C:\\VibeSpace\\jarvis.exe"' }
  }
}
$exactCreationResolver = {
  param($processId)
  [datetime]'2026-07-30T06:37:33.0565448Z'
}
$identity = Resolve-EvidenceProducerIdentity -RecordedIdentity $recorded -IdentityResolver $identityResolver -ExactCreationResolver $exactCreationResolver -Sleeper { param($milliseconds) }
$drift = $null
try {
  Resolve-EvidenceProducerIdentity -RecordedIdentity $identity -IdentityResolver $identityResolver -ExactCreationResolver { param($processId) [datetime]'2026-07-30T06:37:33.0565450Z' } -Sleeper { param($milliseconds) }
}
catch {
  $drift = $_.Exception.Message
}
[pscustomobject]@{ identity = $identity; attempts = $global:attempts; drift = $drift } | ConvertTo-Json -Depth 6 -Compress
`;
  const result = JSON.parse(
    execFileSync('powershell', ['-NoProfile', '-Command', command], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }),
  );

  assert.equal(result.attempts, 3);
  assert.match(result.drift, /creation identity drifted/u);
  assert.deepEqual(result.identity, {
    pid: 42,
    parentPid: 7,
    creationTime: '2026-07-30T06:37:33.0565448Z',
    executable: 'C:\\VibeSpace\\jarvis.exe',
    commandLine: '"C:\\VibeSpace\\jarvis.exe"',
  });
});

test('contained dev normalizes the single producer candidate before indexed reconciliation', () => {
  const dev = powershellFunctionSource('Invoke-ContainedDevSession', 'Invoke-OptimizedNativeChild');

  assert.match(
    dev,
    /\$producer\s*=\s*@\(\s*\(@\(\$nativeRoot\)\s*\+\s*\$nativeDescendants\)\s*\|[\s\S]*?Where-Object[\s\S]*?\)\s*if\s*\(\$producer\.Count -ne 1\)/u,
  );
  assert.match(dev, /Resolve-EvidenceProducerIdentity -RecordedIdentity \$producer\[0\]/u);
});

test('owned process snapshot conflicts name changed metadata fields without leaking raw identity values', () => {
  const hash = powershellFunctionSource('Get-Sha256', 'Get-FileSha256');
  const optionalProperty = powershellFunctionSource(
    'Get-OptionalProperty',
    'ConvertTo-ProtectedMetadata',
  );
  const metadata = powershellFunctionSource(
    'ConvertTo-OwnedProcessMetadata',
    'ConvertTo-OwnedProcessSet',
  );
  const comparer = powershellFunctionSource(
    'Test-OwnedProcessIdentityEqual',
    'Merge-OwnedProcessSnapshots',
  );
  const merge = powershellFunctionSource(
    'Merge-OwnedProcessSnapshots',
    'Read-ValidatedEvidenceFile',
  );
  const command = `${hash}
${optionalProperty}
${metadata}
${comparer}
${merge}
$recorded = [ordered]@{ pid = 101; parentPid = 100; creationTime = '2026-07-30T12:00:01Z'; executable = 'PRIVATE-A'; commandLine = 'PRIVATE-COMMAND-A' }
$current = [ordered]@{ pid = 101; parentPid = 100; creationTime = '2026-07-30T12:00:01Z'; executable = 'PRIVATE-A'; commandLine = 'PRIVATE-COMMAND-B' }
try {
  Merge-OwnedProcessSnapshots -Recorded @($recorded) -Current @($current)
}
catch {
  $_.Exception.Message
}
`;
  const output = execFileSync('powershell', ['-NoProfile', '-Command', command], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).trim();
  assert.match(output, /changed fields: commandHash/u);
  assert.doesNotMatch(output, /PRIVATE-/u);
});

test('owned process snapshot merge retains non-empty executable and command observations', () => {
  const hash = powershellFunctionSource('Get-Sha256', 'Get-FileSha256');
  const optionalProperty = powershellFunctionSource(
    'Get-OptionalProperty',
    'ConvertTo-ProtectedMetadata',
  );
  const metadata = powershellFunctionSource(
    'ConvertTo-OwnedProcessMetadata',
    'ConvertTo-OwnedProcessSet',
  );
  const comparer = powershellFunctionSource(
    'Test-OwnedProcessIdentityEqual',
    'Merge-OwnedProcessSnapshots',
  );
  const merge = powershellFunctionSource(
    'Merge-OwnedProcessSnapshots',
    'Read-ValidatedEvidenceFile',
  );
  const command = `${hash}
${optionalProperty}
${metadata}
${comparer}
${merge}
$incomplete = [ordered]@{ pid = 101; parentPid = 100; creationTime = '2026-07-30T12:00:01Z'; executable = ''; commandLine = '' }
$complete = [ordered]@{ pid = 101; parentPid = 100; creationTime = '2026-07-30T12:00:01Z'; executable = 'FULL-EXE'; commandLine = 'FULL-COMMAND' }
$forward = @(Merge-OwnedProcessSnapshots -Recorded @($incomplete) -Current @($complete))[0]
$reverse = @(Merge-OwnedProcessSnapshots -Recorded @($complete) -Current @($incomplete))[0]
[pscustomobject]@{
  forwardExecutable = $forward.executable
  forwardCommand = $forward.commandLine
  reverseExecutable = $reverse.executable
  reverseCommand = $reverse.commandLine
} | ConvertTo-Json -Compress
`;
  const output = JSON.parse(
    execFileSync('powershell', ['-NoProfile', '-Command', command], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }),
  );
  assert.deepEqual(output, {
    forwardExecutable: 'FULL-EXE',
    forwardCommand: 'FULL-COMMAND',
    reverseExecutable: 'FULL-EXE',
    reverseCommand: 'FULL-COMMAND',
  });
});

test('owned process snapshot merge replaces an exited recorded PID with its current reused identity', () => {
  const hash = powershellFunctionSource('Get-Sha256', 'Get-FileSha256');
  const optionalProperty = powershellFunctionSource(
    'Get-OptionalProperty',
    'ConvertTo-ProtectedMetadata',
  );
  const metadata = powershellFunctionSource(
    'ConvertTo-OwnedProcessMetadata',
    'ConvertTo-OwnedProcessSet',
  );
  const comparer = powershellFunctionSource(
    'Test-OwnedProcessIdentityEqual',
    'Merge-OwnedProcessSnapshots',
  );
  const merge = powershellFunctionSource(
    'Merge-OwnedProcessSnapshots',
    'Read-ValidatedEvidenceFile',
  );
  const command = `${hash}
${optionalProperty}
${metadata}
${comparer}
${merge}
$recorded = [ordered]@{ pid = 101; parentPid = 100; creationTime = '2026-07-30T12:00:01Z'; executable = 'OLD-EXE'; commandLine = 'OLD-COMMAND' }
$current = [ordered]@{ pid = 101; parentPid = 100; creationTime = '2026-07-30T12:00:05Z'; executable = 'NEW-EXE'; commandLine = 'NEW-COMMAND' }
$result = @(Merge-OwnedProcessSnapshots -Recorded @($recorded) -Current @($current))[0]
$result | ConvertTo-Json -Compress
`;
  const output = JSON.parse(
    execFileSync('powershell', ['-NoProfile', '-Command', command], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }),
  );
  assert.deepEqual(output, {
    pid: 101,
    parentPid: 100,
    creationTime: '2026-07-30T12:00:05Z',
    executable: 'NEW-EXE',
    commandLine: 'NEW-COMMAND',
  });
});

test('live snapshot reconciliation prunes exited historical descendants but retains current enrichment', () => {
  const hash = powershellFunctionSource('Get-Sha256', 'Get-FileSha256');
  const optionalProperty = powershellFunctionSource(
    'Get-OptionalProperty',
    'ConvertTo-ProtectedMetadata',
  );
  const metadata = powershellFunctionSource(
    'ConvertTo-OwnedProcessMetadata',
    'ConvertTo-OwnedProcessSet',
  );
  const comparer = powershellFunctionSource(
    'Test-OwnedProcessIdentityEqual',
    'Merge-OwnedProcessSnapshots',
  );
  const merge = powershellFunctionSource(
    'Merge-OwnedProcessSnapshots',
    'Read-ValidatedEvidenceFile',
  );
  const command = `${hash}
${optionalProperty}
${metadata}
${comparer}
${merge}
$recorded = @(
  [ordered]@{ pid = 101; parentPid = 100; creationTime = '2026-07-30T12:00:01Z'; executable = 'PARENT'; commandLine = 'PARENT' },
  [ordered]@{ pid = 102; parentPid = 101; creationTime = '2026-07-30T12:00:02Z'; executable = 'EXITED'; commandLine = 'EXITED' }
)
$current = @(
  [ordered]@{ pid = 101; parentPid = 100; creationTime = '2026-07-30T12:00:01Z'; executable = ''; commandLine = '' }
)
@(Merge-OwnedProcessSnapshots -Recorded $recorded -Current $current -PruneAbsentRecorded) | ConvertTo-Json -Depth 4 -Compress
`;
  const output = JSON.parse(
    execFileSync('powershell', ['-NoProfile', '-Command', command], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }),
  );
  assert.deepEqual(output, {
    pid: 101,
    parentPid: 100,
    creationTime: '2026-07-30T12:00:01Z',
    executable: 'PARENT',
    commandLine: 'PARENT',
  });
});

test('live descendant discovery excludes stale children from a reused parent PID', () => {
  const optionalProperty = powershellFunctionSource(
    'Get-OptionalProperty',
    'ConvertTo-ProtectedMetadata',
  );
  const fromCim = powershellFunctionSource('ConvertFrom-CimProcess', 'Get-OwnedProcessIdentity');
  const descendants = powershellFunctionSource(
    'Get-OwnedDescendantIdentities',
    'Test-OwnedProcessIdentityEqual',
  );
  const command = `${optionalProperty}
${fromCim}
${descendants}
$root = [ordered]@{ pid = 100; parentPid = 1; creationTime = '2026-07-30T12:00:00Z'; executable = 'root'; commandLine = 'root' }
$processes = @(
  [pscustomobject]@{ ProcessId = 200; ParentProcessId = 100; CreationDate = [datetime]'2026-07-30T11:00:00Z'; ExecutablePath = 'stale'; CommandLine = 'stale' },
  [pscustomobject]@{ ProcessId = 201; ParentProcessId = 100; CreationDate = [datetime]'2026-07-30T12:00:01Z'; ExecutablePath = 'valid'; CommandLine = 'valid' },
  [pscustomobject]@{ ProcessId = 202; ParentProcessId = 201; CreationDate = [datetime]'2026-07-30T11:30:00Z'; ExecutablePath = 'stale-grandchild'; CommandLine = 'stale-grandchild' },
  [pscustomobject]@{ ProcessId = 203; ParentProcessId = 201; CreationDate = [datetime]'2026-07-30T12:00:02Z'; ExecutablePath = 'valid-grandchild'; CommandLine = 'valid-grandchild' }
)
@(Get-OwnedDescendantIdentities -RootIdentity $root -ProcessSnapshot $processes).pid | ConvertTo-Json -Compress
`;
  const output = JSON.parse(
    execFileSync('powershell', ['-NoProfile', '-Command', command], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }),
  );
  assert.deepEqual(output, [201, 203]);
});

test('live loops promote descendant candidates only after ancestry validation', () => {
  const dev = powershellFunctionSource('Invoke-ContainedDevSession', 'Invoke-OptimizedNativeChild');
  const optimized = powershellFunctionSource('Invoke-OptimizedNativeChild', 'END_OF_RUNNER');

  assert.match(
    dev,
    /\$candidateViteDescendants[\s\S]*Assert-OwnedProcessAncestry[\s\S]*\$viteDescendants\s*=\s*\$candidateViteDescendants/u,
  );
  assert.match(
    dev,
    /\$candidateNativeDescendants[\s\S]*Assert-OwnedProcessAncestry[\s\S]*\$nativeDescendants\s*=\s*\$candidateNativeDescendants/u,
  );
  assert.match(
    optimized,
    /\$candidateDescendants[\s\S]*Assert-OwnedProcessAncestry[\s\S]*\$trackedDescendants\s*=\s*@\{\}/u,
  );
  assert.equal((dev.match(/-PruneAbsentRecorded/gu) ?? []).length, 2);
  assert.match(optimized, /-PruneAbsentRecorded/u);
});

test('executable mode contract fails closed on timeout, early exit, NOT_RUN, or missing producer fields', () => {
  const report = runValidateOnly(makeSessionRoot());
  assert.deepEqual(report.executableSuccessGate, {
    deadlineSeconds: 120,
    pollMilliseconds: 250,
    failsOnProcessExitBeforeEvidence: true,
    failsOnTimeout: true,
    failsOnNotRun: true,
    failsOnMissingFields: true,
    requiresAuthenticatedNonceBoundEvidence: true,
    requiresApplicationReady: true,
    requiresSyntheticFixtureSmoke: true,
    requiresZeroPageAndNativeErrors: true,
    requiresAllDeniedEffectCountersZero: true,
  });
});

test('pure effective-config merge replaces arrays and nulls updater under an adversarial base', () => {
  const baseConfigFixture = writeBaseConfigFixture((base) => {
    base.app.windows.push({
      label: 'adversarial',
      title: 'Must not survive merge',
      url: 'https://example.invalid',
    });
    base.plugins.updater.endpoints.push('https://example.invalid/update.json');
    base.bundle.targets = ['nsis', 'msi'];
    return base;
  });
  const report = runValidateOnly(makeSessionRoot(), { baseConfigFixture });
  for (const name of ['dev', 'release', 'nsis']) {
    const effective = report.effectiveConfigs[name];
    assert.equal(effective.app.windows.length, 1);
    assert.equal(effective.app.windows[0].label, TEST_CAPABILITY);
    assert.deepEqual(effective.app.security.capabilities, [TEST_CAPABILITY]);
    assert.equal(effective.plugins.updater, null);
    assert.equal(effective.bundle.createUpdaterArtifacts, false);
    assert.equal(JSON.stringify(effective).includes('example.invalid'), false);
  }
  assert.equal(report.effectiveConfigs.dev.bundle.active, false);
  assert.equal(report.effectiveConfigs.release.bundle.active, false);
  assert.equal(report.effectiveConfigs.nsis.bundle.active, true);
  assert.deepEqual(report.effectiveConfigs.nsis.bundle.targets, ['nsis']);
});

test('config and capability validators reject adversarial production closure and permission broadening', () => {
  const badBase = writeBaseConfigFixture((base) => {
    base.app.security.capabilities.pop();
    return base;
  });
  const badBaseResult = runValidateOnlyFailure(makeSessionRoot(), {
    baseConfigFixture: badBase,
  });
  assert.notEqual(badBaseResult.status, 0);
  assert.match(`${badBaseResult.stdout}\n${badBaseResult.stderr}`, /production capability/iu);

  const badCapability = writeCapabilityFixture((capability) => {
    capability.permissions.push('shell:allow-open');
    return capability;
  });
  const badCapabilityResult = runValidateOnlyFailure(makeSessionRoot(), {
    testCapabilityFixture: badCapability,
  });
  assert.notEqual(badCapabilityResult.status, 0);
  assert.match(`${badCapabilityResult.stdout}\n${badCapabilityResult.stderr}`, /permission/iu);
});

test('path validator rejects a reparse point in an intermediate existing component', () => {
  const parent = path.join(TEST_ARTIFACT_ROOT, `path-parent-${++ownedPathSequence}`);
  const target = path.join(parent, 'target');
  const link = path.join(parent, 'link');
  mkdirSync(target, { recursive: true });
  symlinkSync(target, link, 'junction');
  const result = runValidateOnlyFailure(path.join(link, 'nested-session'));
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /reparse point.*component/iu);
});

test('owned-process validator rejects impossible creation order and ambiguous parent chains', () => {
  const impossible = JSON.parse(readFileSync(writeOwnedProcessFixture(), 'utf8'));
  impossible.before.descendants[0].creationTime = '2026-07-29T10:59:59.000Z';
  impossible.after.descendants[0].creationTime = '2026-07-29T10:59:59.000Z';
  const impossibleResult = runValidateOnlyFailure(makeSessionRoot(), {
    ownedProcessFixture: makeOwnedFile('impossible-ancestry', impossible),
  });
  assert.notEqual(impossibleResult.status, 0);
  assert.match(
    `${impossibleResult.stdout}\n${impossibleResult.stderr}`,
    /creation order|ancestry/iu,
  );

  const ambiguous = JSON.parse(readFileSync(writeOwnedProcessFixture(), 'utf8'));
  ambiguous.before.descendants[0].parentPid = 7777;
  ambiguous.after.descendants[0].parentPid = 7777;
  const ambiguousResult = runValidateOnlyFailure(makeSessionRoot(), {
    ownedProcessFixture: makeOwnedFile('ambiguous-ancestry', ambiguous),
  });
  assert.notEqual(ambiguousResult.status, 0);
  assert.match(`${ambiguousResult.stdout}\n${ambiguousResult.stderr}`, /parent chain|ancestry/iu);
});

test('artifact and platform outcome rows remain separate and host install is prohibited', () => {
  const report = runValidateOnly(makeSessionRoot());
  const cargoTarget = report.buildEnvironment.cargoTarget.relativePath;
  assert.deepEqual(report.outcomes.optimizedExecutable, {
    status: 'NOT_RUN',
    evidence: null,
  });
  assert.equal(report.outcomes.unsignedNsisArtifact.status, 'NOT_RUN');
  assert.equal(
    report.outcomes.installedPackageSandboxVm.status,
    'SKIPPED_NOT_APPLICABLE_HOST_INSTALL_PROHIBITED',
  );
  assert.equal(report.outcomes.installedPackageSandboxVm.requiresSandboxVm, true);
  assert.equal(report.outcomes.platforms.macOSWebKit.status, 'SKIPPED_NOT_APPLICABLE_WINDOWS_HOST');
  assert.equal(report.outcomes.platforms.linux.status, 'SKIPPED_NOT_APPLICABLE_WINDOWS_HOST');
  assert.deepEqual(report.artifactContract, {
    relativePath: `${cargoTarget}/release/bundle/nsis/VibeSpace_1.5.0_x64-setup.exe`,
    expectedType: 'regular-file-no-reparse',
    requiresContainedPath: true,
    requiresSha256: true,
    requiresPositiveSize: true,
    requiresConfigHash: true,
    requiresCommitBuildIdentity: true,
  });
});

test('unsigned NSIS artifact validator records exact contained file, hash, size, config, and build identity', () => {
  const sessionRoot = makeSessionRoot();
  const artifactRelativePath = `${nativeBuildRelativePath(sessionRoot)}/release/bundle/nsis/VibeSpace_1.5.0_x64-setup.exe`;
  const artifactPath = path.join(REPO_ROOT, artifactRelativePath);
  mkdirSync(path.dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, Buffer.from('MZ-contained-unsigned-nsis-fixture', 'utf8'));
  const report = runValidateOnly(sessionRoot, {
    unsignedNsisArtifactFixture: artifactPath,
  });
  assert.equal(report.outcomes.unsignedNsisArtifact.status, 'VALIDATED_FIXTURE');
  assert.deepEqual(report.outcomes.unsignedNsisArtifact.evidence, {
    relativePath: artifactRelativePath,
    sha256: sha256Lower('MZ-contained-unsigned-nsis-fixture'),
    sizeBytes: Buffer.byteLength('MZ-contained-unsigned-nsis-fixture'),
    configHash: report.outcomes.unsignedNsisArtifact.evidence.configHash,
    commit: FIXED_COMMIT,
    identifier: `ai.vibespace.monochrome.test${FIXED_IDENTIFIER_SUFFIX}`,
  });
  assert.match(report.outcomes.unsignedNsisArtifact.evidence.configHash, /^[0-9a-f]{64}$/u);
});

test('contained dev lifecycle revalidates the exact Vite listener and never kills a port owner', () => {
  const report = runValidateOnly(makeSessionRoot());
  assert.deepEqual(report.devSessionLifecycle, {
    status: 'NOT_RUN',
    vite: {
      command: 'npm',
      requiresContainedCache: true,
      requiresExactListenerIdentity: true,
      identityFields: [
        'pid',
        'creationTimeUtc',
        'creationTimeHash',
        'executableHash',
        'commandHash',
      ],
    },
    native: {
      requiresAuthenticatedEvidence: true,
      requiresProductOwnedReadiness: true,
    },
    reservation: {
      heldUntilViteLaunch: true,
      releasedOnlyForAtomicLaunch: true,
      listenerMustMatchViteProcessTree: true,
    },
    cleanup: {
      identityBoundDescendantsOnly: true,
      acceptanceIndependent: true,
      killsByPort: false,
    },
  });
});

test('contained dev native child receives complete isolated profile and temp roots', () => {
  const report = runValidateOnly(makeSessionRoot());
  assert.deepEqual(report.devChildEnvironment, {
    preservesParentToolchainHomes: true,
    relocatesCargoHome: false,
    relocatesRustupHome: false,
    paths: {
      APPDATA: 'native/profile/appdata',
      LOCALAPPDATA: 'native/profile/localappdata',
      USERPROFILE: 'native/profile/userprofile',
      HOME: 'native/profile/home',
      HOMEDRIVE: 'native/profile/home-drive',
      HOMEPATH: 'native/profile/home-path',
      WEBVIEW2_USER_DATA_FOLDER: 'native/profile/webview2',
      TEMP: 'native/profile/temp',
      TMP: 'native/profile/temp',
      VIBESPACE_MONOCHROME_PROFILE_ROOT: 'native/profile',
      VIBESPACE_MONOCHROME_APP_DATA_ROOT: 'native/profile/appdata',
    },
  });
});

test('optimized success gate requires full producer identity and actual PASS before outcome mutation', () => {
  const report = runValidateOnly(makeSessionRoot(), {
    evidenceFixture: writeEvidenceFixture(),
  });
  assert.deepEqual(report.optimizedSuccessGate, {
    requiredProducerIdentityFields: ['pid', 'creationTimeHash', 'executableHash', 'commandHash'],
    requiresExactOwnedRootMatch: true,
    requiresCurrentIdentityRevalidation: true,
    evidenceSource: 'actual-authenticated-product-producer-only',
    fixtureMaySetPass: false,
    passOutcome: 'optimizedExecutable',
  });
  assert.equal(report.outcomes.optimizedExecutable.status, 'NOT_RUN');
});

test('all fail-closed self-checks pass against the current committed/owned configuration', () => {
  const report = runValidateOnly(makeSessionRoot());
  for (const [name, ok] of Object.entries(report.selfChecks)) {
    assert.equal(ok, true, `self-check failed: ${name}`);
  }
  assert.deepEqual([...report.productionCapabilities].sort(), [...PRODUCTION_CAPABILITIES].sort());
  assert.equal(report.testCapability, TEST_CAPABILITY);
});

test('Cargo library-test mode is explicit, mutually exclusive, and freezes exact command and environment policy', () => {
  const source = readFileSync(SCRIPT_PATH, 'utf8');
  const report = runValidateOnly(makeSessionRoot());
  const cargoTarget = report.buildEnvironment.cargoTarget.relativePath;

  assert.match(
    source,
    /\[Parameter\(Mandatory = \$true, ParameterSetName = 'RunCargoLibraryTests'\)\]\s*\[switch\]\$RunCargoLibraryTests/u,
  );
  assert.equal(report.mode, 'validate-only');
  assert.deepEqual(report.cargoLibraryTestCommand, {
    executable: 'cargo',
    arguments: [
      'test',
      '--manifest-path',
      'app/src-tauri/Cargo.toml',
      '--locked',
      '--lib',
      '--',
      '--test-threads=1',
    ],
    workingDirectory: '.',
    environment: {
      CARGO_TARGET_DIR: `${cargoTarget}/cargo-library-tests`,
      CARGO_BUILD_JOBS: '1',
      RUST_TEST_THREADS: '1',
    },
  });
  assert.deepEqual(report.executionModes.runCargoLibraryTests, {
    buildsTests: true,
    launchesNativeApp: false,
    launchesInstaller: false,
    launchesVite: false,
    signsArtifact: false,
    publishesArtifact: false,
    requiresFreshTarget: true,
    requiresInputDriftCheck: true,
    requiresIdentityBoundCleanup: true,
    requiresUnambiguousLibrarySummary: true,
  });
  assert.equal(
    existsSync(path.join(REPO_ROOT, `${cargoTarget}/cargo-library-tests`)),
    false,
    'ValidateOnly must describe but not create the Cargo-library-test target',
  );
});

test('Cargo library-test executor never enters app, installer, release, or network flows', () => {
  const cargo = powershellFunctionSource('Invoke-ContainedCargoLibraryTests', 'New-RandomHex');

  assert.match(cargo, /Start-Process[\s\S]*-FilePath \$cargo\.Source/u);
  assert.match(cargo, /-RedirectStandardOutput \$cargoStandardOutputPath/u);
  assert.match(cargo, /-RedirectStandardError \$cargoStandardErrorPath/u);
  assert.match(cargo, /Invoke-IdentityBoundCleanupLane/u);
  assert.match(cargo, /Assert-CargoLibraryTestInputSnapshotStable/u);
  assert.match(cargo, /Get-CargoLibraryTestResult/u);
  assert.doesNotMatch(cargo, /\bnpm\b|\btauri\b|\bVite\b|\bnsis\b|jarvis\.exe|TcpListener/iu);
});

test('Cargo library-test cleanup evidence tolerates the helper result shape without losing the run', () => {
  const cargo = powershellFunctionSource('Invoke-ContainedCargoLibraryTests', 'New-RandomHex');

  assert.doesNotMatch(cargo, /\[string\]\$cleanup\.lane/u);
  assert.match(
    cargo,
    /Get-OptionalProperty[\s\S]*-InputObject \$cleanup[\s\S]*-Name 'lane'[\s\S]*-Default 'cargo-library-tests'/u,
  );
});

test('Cargo library-test result parser accepts one exact ok summary and rejects every ambiguous failure class', () => {
  const parser = powershellFunctionSource(
    'Get-CargoLibraryTestResult',
    'Invoke-ContainedCargoLibraryTests',
  );
  const command = `${parser}
$cases = @(
  [pscustomobject]@{
    name = 'pass'
    exitCode = 0
    stdout = "running 3 tests\`ntest result: ok. 3 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.02s\`n"
    stderr = "warning: synthetic warning\`n"
  },
  [pscustomobject]@{
    name = 'nonzero'
    exitCode = 1
    stdout = "test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s\`n"
    stderr = ''
  },
  [pscustomobject]@{
    name = 'policy'
    exitCode = 1
    stdout = ''
    stderr = 'An Application Control policy has blocked this file. (os error 4551)'
  },
  [pscustomobject]@{
    name = 'missing'
    exitCode = 0
    stdout = 'running 3 tests'
    stderr = ''
  },
  [pscustomobject]@{
    name = 'contradictory'
    exitCode = 0
    stdout = "test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s\`ntest result: FAILED. 2 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.03s"
    stderr = ''
  },
  [pscustomobject]@{
    name = 'error-marker'
    exitCode = 0
    stdout = "test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s"
    stderr = 'error: synthetic compiler failure'
  }
)
$cases | ForEach-Object {
  $case = $_
  try {
    $result = Get-CargoLibraryTestResult -ExitCode $case.exitCode -StandardOutput $case.stdout -StandardError $case.stderr
    [pscustomobject]@{ name = $case.name; accepted = $true; category = $result.status; passed = $result.passed }
  }
  catch {
    [pscustomobject]@{ name = $case.name; accepted = $false; category = $_.Exception.Message; passed = $null }
  }
} | ConvertTo-Json -Depth 8 -Compress
`;
  const result = JSON.parse(
    execFileSync('powershell', ['-NoProfile', '-Command', command], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }),
  );

  assert.deepEqual(result, [
    { name: 'pass', accepted: true, category: 'PASS', passed: 3 },
    { name: 'nonzero', accepted: false, category: 'CARGO_LIBRARY_TEST_FAILED', passed: null },
    { name: 'policy', accepted: false, category: 'BLOCKED_HOST_POLICY', passed: null },
    {
      name: 'missing',
      accepted: false,
      category: 'CARGO_LIBRARY_TEST_RESULT_AMBIGUOUS',
      passed: null,
    },
    {
      name: 'contradictory',
      accepted: false,
      category: 'CARGO_LIBRARY_TEST_RESULT_AMBIGUOUS',
      passed: null,
    },
    {
      name: 'error-marker',
      accepted: false,
      category: 'CARGO_LIBRARY_TEST_FAILED',
      passed: null,
    },
  ]);
});

test('Cargo input snapshot hashes every ordinary input, excludes target, and rejects reparse points and drift', () => {
  const snapshotSource = powershellFunctionSource(
    'Get-CargoLibraryTestInputSnapshot',
    'Assert-CargoLibraryTestInputSnapshotStable',
  );
  assert.match(snapshotSource, /\[StringComparer\]::Ordinal/u);

  const fixtureRoot = path.join(
    TEST_ARTIFACT_ROOT,
    `cargo-input-${String(++ownedPathSequence).padStart(4, '0')}`,
  );
  mkdirSync(path.join(fixtureRoot, 'src'), { recursive: true });
  mkdirSync(path.join(fixtureRoot, 'target'), { recursive: true });
  writeFileSync(path.join(fixtureRoot, 'Cargo.toml'), '[package]\nname="fixture"\n', 'utf8');
  writeFileSync(path.join(fixtureRoot, 'Cargo.lock'), 'version = 3\n', 'utf8');
  writeFileSync(path.join(fixtureRoot, 'src/lib.rs'), 'pub fn fixture() {}\n', 'utf8');
  writeFileSync(path.join(fixtureRoot, 'build.rs'), 'fn main() {}\n', 'utf8');
  writeFileSync(path.join(fixtureRoot, 'tauri.conf.json'), '{}\n', 'utf8');
  writeFileSync(path.join(fixtureRoot, 'target/ignored.bin'), 'ignored', 'utf8');

  const functions = [
    powershellFunctionSource('Get-Sha256', 'Get-BytesSha256'),
    powershellFunctionSource('Get-FileSha256', 'Get-CargoLibraryTestInputSnapshot'),
    powershellFunctionSource(
      'Get-CargoLibraryTestInputSnapshot',
      'Assert-CargoLibraryTestInputSnapshotStable',
    ),
    powershellFunctionSource(
      'Assert-CargoLibraryTestInputSnapshotStable',
      'Get-CargoLibraryTestResult',
    ),
  ].join('\n');
  const escapedRoot = fixtureRoot.replaceAll("'", "''");
  const command = `${functions}
$before = Get-CargoLibraryTestInputSnapshot -InputRoot '${escapedRoot}'
[System.IO.File]::WriteAllText((Join-Path '${escapedRoot}' 'src/lib.rs'), 'pub fn changed() {}')
$after = Get-CargoLibraryTestInputSnapshot -InputRoot '${escapedRoot}'
$driftRejected = $false
try {
  Assert-CargoLibraryTestInputSnapshotStable -Before $before -After $after
}
catch {
  $driftRejected = $_.Exception.Message -ceq 'CARGO_LIBRARY_TEST_INPUT_DRIFT'
}
[pscustomobject]@{
  files = @($before.files | ForEach-Object { $_.relativePath })
  inventoryDigest = $before.inventoryDigest
  rustSourceDigest = $before.rustSourceDigest
  buildInputDigest = $before.buildInputDigest
  configInputDigest = $before.configInputDigest
  driftRejected = $driftRejected
} | ConvertTo-Json -Depth 8 -Compress
`;
  const result = JSON.parse(
    execFileSync('powershell', ['-NoProfile', '-Command', command], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }),
  );
  assert.deepEqual(result.files, [
    'Cargo.lock',
    'Cargo.toml',
    'build.rs',
    'src/lib.rs',
    'tauri.conf.json',
  ]);
  assert.match(result.inventoryDigest, /^[0-9a-f]{64}$/u);
  assert.match(result.rustSourceDigest, /^[0-9a-f]{64}$/u);
  assert.match(result.buildInputDigest, /^[0-9a-f]{64}$/u);
  assert.match(result.configInputDigest, /^[0-9a-f]{64}$/u);
  assert.equal(result.driftRejected, true);

  const outside = path.join(TEST_ARTIFACT_ROOT, `cargo-input-outside-${++ownedPathSequence}`);
  mkdirSync(outside, { recursive: true });
  symlinkSync(outside, path.join(fixtureRoot, 'linked-input'), 'junction');
  const reparseResult = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `${functions}\nGet-CargoLibraryTestInputSnapshot -InputRoot '${escapedRoot}'`,
    ],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
  assert.notEqual(reparseResult.status, 0);
  assert.match(`${reparseResult.stdout}\n${reparseResult.stderr}`, /reparse/iu);
});

test('Cargo library-test evidence contract binds inputs, tools, process, logs, result, policy, and cleanup', () => {
  const source = readFileSync(SCRIPT_PATH, 'utf8');
  const report = runValidateOnly(makeSessionRoot());

  assert.deepEqual(report.outcomes.cargoLibraryTests, {
    status: 'NOT_RUN',
    evidence: null,
  });
  assert.deepEqual(report.cargoLibraryTestEvidenceContract.requiredBindings, [
    'branch',
    'head',
    'dirtyInputInventory',
    'dirtyInputDigest',
    'inputInventory',
    'inputInventoryDigest',
    'cargoTomlSha256',
    'cargoLockSha256',
    'rustSourceDigest',
    'buildInputDigest',
    'configInputDigest',
    'command',
    'environmentPolicy',
    'targetIdentity',
    'cargoVersion',
    'rustcVersion',
    'processIdentity',
    'startedAtUtc',
    'completedAtUtc',
    'exitCode',
    'stdout',
    'stderr',
    'testResult',
    'policyBlockSignatures',
    'cleanup',
    'artifactDisposition',
  ]);
  assert.equal(report.cargoLibraryTestEvidenceContract.requiresFreshLogs, true);
  assert.equal(report.cargoLibraryTestEvidenceContract.rejectsInputDrift, true);
  assert.equal(report.cargoLibraryTestEvidenceContract.passRequiresExitZero, true);
  assert.equal(report.cargoLibraryTestEvidenceContract.passRequiresOneOkLibrarySummary, true);
  assert.equal(report.cargoLibraryTestEvidenceContract.passRejectsFailureMarkers, true);
  assert.match(source, /git[\s\S]*status[\s\S]*--porcelain/u);
  assert.match(source, /cargo[\s\S]*--version/u);
  assert.match(source, /rustc[\s\S]*--version/u);
});
