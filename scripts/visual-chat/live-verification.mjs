import {
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import {
  captureOrigamiChat,
  installDeterministicOllamaFixture,
  loadThemePersistenceContract,
} from './capture-chat.mjs';
import { launchResolvedBrowser } from './browser-launch.mjs';
import {
  installOrigamiLocalState,
  loadLocalPersistenceContract,
  seedOrigamiIndexedDb,
  validateFixturePersistence,
  waitForInitialLocalSeed,
  waitForJarvisDatabase,
} from './chat-fixture.mjs';
import { runInteractionAudit } from './interaction-audit.mjs';
import {
  CONTEXT_OPTIONS,
  NONCHAT_VIEWPORT,
  runNonChatScopeCapture,
} from './nonchat-scope-capture.mjs';
import { startStaticServer } from './static-server.mjs';
import { ORIGAMI_CHAT_FIXTURE } from '../../tests/visual/chat/fixture-data.mjs';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIRECTORY = resolve(MODULE_DIRECTORY, '../..');
const DEFAULT_ARTIFACT_ROOT = '.artifacts/origami-chat';
const MODES = new Set(['interaction', 'nonchat']);
const RUN_OPTION_KEYS = new Set([
  'mode',
  'runId',
  'rootDirectory',
  'distDirectory',
  'artifactRoot',
  'outputPath',
  'receiptPath',
  'baseUrl',
  'browserExecutable',
  'historicalChatRoot',
]);

function isContained(parent, candidate) {
  return candidate === parent || candidate.startsWith(`${parent}${sep}`);
}

function lstatEntry(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0 || value !== value.trim()) {
    throw new Error(`${label} must be a non-empty, trim-stable string.`);
  }
  return value;
}

function requireRunId(value) {
  const runId = requireString(value, 'runId');
  if (/[/\\\0]/u.test(runId)) {
    throw new Error('runId must not contain path separators or NUL.');
  }
  return runId;
}

function requireRepositoryRoot(value) {
  const root = resolve(value ?? DEFAULT_ROOT_DIRECTORY);
  const entry = lstatEntry(root);
  if (!entry?.isDirectory()) {
    throw new Error(`rootDirectory must be an existing directory: ${root}.`);
  }
  if (entry.isSymbolicLink()) {
    throw new Error(`rootDirectory must not be a symbolic link: ${root}.`);
  }
  return root;
}

function requireLoopbackUrl(value, label = 'baseUrl') {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a loopback local HTTP URL.`);
  }
  if (
    url.protocol !== 'http:' ||
    url.username !== '' ||
    url.password !== '' ||
    !['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname)
  ) {
    throw new Error(`${label} must be a loopback local HTTP URL.`);
  }
  return value;
}

function assertKnownOptions(options) {
  for (const key of Object.keys(options)) {
    if (!RUN_OPTION_KEYS.has(key)) {
      throw new Error(`Unknown live verification option: ${key}.`);
    }
  }
}

function assertSafeExistingAncestors(rootDirectory, candidate, label) {
  const root = resolve(rootDirectory);
  const target = resolve(candidate);
  if (!isContained(root, target)) {
    throw new Error(`${label} must stay inside rootDirectory: ${target}.`);
  }
  const realRoot = realpathSync(root);
  const parent = dirname(target);
  const relativeParent = relative(root, parent);
  let current = root;
  for (const segment of relativeParent === '' ? [] : relativeParent.split(/[\\/]/u)) {
    current = resolve(current, segment);
    const entry = lstatEntry(current);
    if (!entry) break;
    if (entry.isSymbolicLink()) {
      throw new Error(`${label} must not traverse a symbolic link: ${current}.`);
    }
    if (!entry.isDirectory()) {
      throw new Error(`${label} parent must be a directory: ${current}.`);
    }
    if (!isContained(realRoot, realpathSync(current))) {
      throw new Error(`${label} resolves outside rootDirectory: ${current}.`);
    }
  }
  const targetEntry = lstatEntry(target);
  if (targetEntry?.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link: ${target}.`);
  }
  return target;
}

function requireArtifactPath(rootDirectory, candidate, label, extension) {
  const root = resolve(rootDirectory);
  const artifactRoot = resolve(root, DEFAULT_ARTIFACT_ROOT);
  const target = resolve(root, requireString(candidate, label));
  if (!isContained(artifactRoot, target)) {
    throw new Error(`${label} must stay inside ${artifactRoot}.`);
  }
  assertSafeExistingAncestors(root, target, label);
  if (extname(target).toLowerCase() !== extension) {
    throw new Error(`${label} must name a ${extension} file.`);
  }
  return target;
}

function requireArtifactDirectory(rootDirectory, candidate, label) {
  const root = resolve(rootDirectory);
  const artifactRoot = resolve(root, DEFAULT_ARTIFACT_ROOT);
  const target = resolve(root, requireString(candidate, label));
  if (!isContained(artifactRoot, target)) {
    throw new Error(`${label} must stay inside ${artifactRoot}.`);
  }
  assertSafeExistingAncestors(root, resolve(target, 'placeholder'), label);
  const entry = lstatEntry(target);
  if (entry && !entry.isDirectory()) {
    throw new Error(`${label} must be a directory: ${target}.`);
  }
  return target;
}

function ensureSafeDirectory(rootDirectory, directory, label) {
  const root = resolve(rootDirectory);
  const relativeDirectory = relative(root, resolve(directory));
  let current = root;
  for (const segment of relativeDirectory === '' ? [] : relativeDirectory.split(/[\\/]/u)) {
    current = resolve(current, segment);
    const entry = lstatEntry(current);
    if (!entry) mkdirSync(current);
    const confirmed = lstatEntry(current);
    if (!confirmed?.isDirectory() || confirmed.isSymbolicLink()) {
      throw new Error(`${label} must use regular directories: ${current}.`);
    }
    if (!isContained(realpathSync(root), realpathSync(current))) {
      throw new Error(`${label} resolves outside rootDirectory: ${current}.`);
    }
  }
}

function jsonClone(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  let serialized;
  let parsed;
  try {
    serialized = JSON.stringify(value);
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new Error(`${label} must be JSON serializable.`, { cause: error });
  }
  if (!isDeepStrictEqual(parsed, value)) {
    throw new Error(`${label} must be losslessly JSON-safe plain data.`);
  }
  return parsed;
}

export function writeAtomicJsonReceipt({ rootDirectory, receiptPath, value }) {
  const root = requireRepositoryRoot(rootDirectory);
  const target = requireArtifactPath(root, receiptPath, 'receiptPath', '.json');
  if (existsSync(target)) {
    throw new Error(`Refusing stale receipt overwrite; receiptPath already exists: ${target}.`);
  }
  const stableValue = jsonClone(value, 'receipt value');
  ensureSafeDirectory(root, dirname(target), 'receiptPath');
  const temporaryPath = `${target}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`;
  let primaryError;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(stableValue, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    renameSync(temporaryPath, target);
  } catch (error) {
    primaryError = error instanceof Error ? error : new Error(String(error));
  }
  if (primaryError) {
    try {
      rmSync(temporaryPath, { force: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [
          primaryError,
          cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError)),
        ],
        'Atomic receipt write and cleanup failed.',
      );
    }
    throw primaryError;
  }
  return target;
}

function normalizeOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('Live verification options are required.');
  }
  assertKnownOptions(options);
  const mode = requireString(options.mode, 'mode');
  if (!MODES.has(mode)) throw new Error(`Unknown live verification mode: ${mode}.`);
  const rootDirectory = requireRepositoryRoot(options.rootDirectory);
  const runId = requireRunId(options.runId ?? `origami-${mode}`);
  const distDirectory = resolve(
    rootDirectory,
    requireString(options.distDirectory, 'distDirectory'),
  );
  if (!isContained(rootDirectory, distDirectory)) {
    throw new Error(`distDirectory must stay inside rootDirectory: ${distDirectory}.`);
  }
  assertSafeExistingAncestors(rootDirectory, resolve(distDirectory, 'index.html'), 'distDirectory');
  if (!existsSync(resolve(distDirectory, 'index.html'))) {
    throw new Error(`distDirectory must contain a built index.html: ${distDirectory}.`);
  }
  const artifactRoot = requireArtifactDirectory(
    rootDirectory,
    options.artifactRoot ?? `${DEFAULT_ARTIFACT_ROOT}/nonchat`,
    'artifactRoot',
  );
  const receiptPath = requireArtifactPath(
    rootDirectory,
    options.receiptPath ?? `${DEFAULT_ARTIFACT_ROOT}/${runId}.${mode}.receipt.json`,
    'receiptPath',
    '.json',
  );
  if (existsSync(receiptPath)) {
    throw new Error(
      `Refusing stale receipt overwrite; receiptPath already exists: ${receiptPath}.`,
    );
  }
  const normalized = {
    mode,
    runId,
    rootDirectory,
    distDirectory,
    artifactRoot,
    receiptPath,
    browserExecutable: options.browserExecutable,
    historicalChatRoot: options.historicalChatRoot ?? false,
  };
  if (options.baseUrl !== undefined) {
    normalized.baseUrl = requireLoopbackUrl(options.baseUrl);
  }
  if (mode === 'interaction') {
    normalized.outputPath = requireArtifactPath(
      rootDirectory,
      options.outputPath ?? `${DEFAULT_ARTIFACT_ROOT}/final-chat.png`,
      'outputPath',
      '.png',
    );
    if (existsSync(normalized.outputPath)) {
      throw new Error(
        `Refusing stale screenshot overwrite; outputPath exists: ${normalized.outputPath}.`,
      );
    }
  } else if (options.outputPath !== undefined) {
    throw new Error('outputPath is only valid in interaction mode.');
  }
  return normalized;
}

function relativePath(rootDirectory, path) {
  return relative(rootDirectory, path).replaceAll('\\', '/');
}

async function runInteractionMode(options, dependencies) {
  const capture = dependencies.captureOrigamiChat ?? captureOrigamiChat;
  const audit = dependencies.runInteractionAudit ?? runInteractionAudit;
  const captureReceipt = await capture({
    distDirectory: options.distDirectory,
    outputPath: options.outputPath,
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
    ...(options.browserExecutable ? { browserExecutable: options.browserExecutable } : {}),
    historicalChatRoot: options.historicalChatRoot,
    pageAudit: (page) => audit(page),
  });
  const interaction = captureReceipt?.pageAudit;
  if (
    !interaction ||
    interaction.executed !== true ||
    !interaction.receipt ||
    typeof interaction.receipt !== 'object' ||
    Array.isArray(interaction.receipt)
  ) {
    throw new Error('Interaction capture did not return an executed JSON pageAudit receipt.');
  }
  return {
    schemaVersion: 1,
    mode: 'interaction',
    runId: options.runId,
    outputRelativePath:
      captureReceipt.outputRelativePath ?? relativePath(options.rootDirectory, options.outputPath),
    verification: {
      interaction: jsonClone(interaction.receipt, 'interaction receipt'),
      capture: jsonClone(captureReceipt, 'capture receipt'),
    },
  };
}

export async function clickUniqueVisibleRole(page, role, labels, label) {
  for (const accessibleName of labels) {
    const visibleMatches = page
      .getByRole(role, { name: accessibleName, exact: true })
      .filter({ visible: true });
    try {
      await visibleMatches.first().waitFor({ state: 'visible', timeout: 5_000 });
    } catch {
      continue;
    }
    const visibleCount = await visibleMatches.count();
    if (visibleCount > 1) {
      throw new Error(`Expected exactly one visible ${label} ${role}; found ${visibleCount}.`);
    }
    if (visibleCount === 1) {
      await visibleMatches.nth(0).click();
      return accessibleName;
    }
  }
  throw new Error(`Expected exactly one visible ${label} ${role}; found none.`);
}

export async function navigateNonChatPage(page, scopeCase, state) {
  await page.goto(state.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('#root').waitFor({ state: 'visible' });
  await state.waitForJarvisDatabase(page, state.persistenceContract);
  await state.waitForInitialLocalSeed(page, state.persistenceContract);
  await state.seedOrigamiIndexedDb(page, ORIGAMI_CHAT_FIXTURE, state.persistenceContract);
  await page.reload({ waitUntil: 'domcontentloaded' });
  if (scopeCase.route === 'schedule') {
    await clickUniqueVisibleRole(page, 'button', ['Schedule'], 'Schedule');
  } else if (scopeCase.route === 'terminal') {
    await clickUniqueVisibleRole(page, 'button', ['Terminals', 'Terminal'], 'Terminals');
  } else if (scopeCase.route === 'settings-appearance') {
    await clickUniqueVisibleRole(page, 'button', ['Terminals', 'Terminal'], 'Terminals');
    await page
      .locator('[data-terminal-route-cache]')
      .waitFor({ state: 'visible', timeout: 30_000 });
    await clickUniqueVisibleRole(page, 'button', ['Settings'], 'Settings');
    await clickUniqueVisibleRole(page, 'tab', ['Appearance'], 'Settings Appearance');
  }
}

async function acquireRealNonChatPage(browser, scopeCase, acquisition, state) {
  const context = await browser.newContext({
    viewport: {
      width: acquisition.viewport.width,
      height: acquisition.viewport.height,
    },
    deviceScaleFactor: acquisition.viewport.deviceScaleFactor,
    ...acquisition.contextOptions,
  });
  let page;
  try {
    await state.installDeterministicOllamaFixture(context, ORIGAMI_CHAT_FIXTURE);
    page = await context.newPage();
    await state.installOrigamiLocalState(
      page,
      { ...state.themeContract, theme: scopeCase.themeId },
      ORIGAMI_CHAT_FIXTURE,
      state.persistenceContract,
    );
    return { page, dispose: () => context.close() };
  } catch (error) {
    try {
      await context.close();
    } catch (cleanupError) {
      throw new AggregateError(
        [
          error instanceof Error ? error : new Error(String(error)),
          cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError)),
        ],
        `Non-Chat case ${scopeCase.id} setup and cleanup failed.`,
      );
    }
    throw error;
  }
}

async function closeOwnedResources(resources, primaryError) {
  const errors = [];
  if (primaryError) {
    errors.push(primaryError instanceof Error ? primaryError : new Error(String(primaryError)));
  }
  for (const resource of [resources.browser, resources.server]) {
    if (!resource || typeof resource.close !== 'function') continue;
    try {
      await resource.close();
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  if (errors.length > 1 || (!primaryError && errors.length > 0)) {
    throw new AggregateError(
      errors,
      primaryError ? 'Live verification and cleanup failed.' : 'Live verification cleanup failed.',
    );
  }
  if (primaryError) throw errors[0];
}

async function runNonChatMode(options, dependencies) {
  const resources = {};
  let primaryError;
  let verification;
  let browserSource;
  try {
    if (!options.baseUrl) {
      resources.server = await (dependencies.startStaticServer ?? startStaticServer)({
        distDirectory: options.distDirectory,
      });
    }
    const baseUrl = requireLoopbackUrl(options.baseUrl ?? resources.server?.baseUrl);
    const launched = await (dependencies.launchResolvedBrowser ?? launchResolvedBrowser)({
      browserExecutable: options.browserExecutable,
    });
    resources.browser = launched.browser;
    browserSource = launched.source;
    if (!resources.browser || typeof resources.browser.close !== 'function') {
      throw new Error('Browser launcher returned no closable browser.');
    }

    const usesRealAcquisition = !dependencies.acquirePage;
    const usesRealNavigation = !dependencies.navigate;
    const persistenceContract =
      dependencies.persistenceContract ??
      (usesRealAcquisition || usesRealNavigation
        ? loadLocalPersistenceContract(options.rootDirectory)
        : undefined);
    const themeContract =
      dependencies.themeContract ??
      (usesRealAcquisition ? loadThemePersistenceContract(options.rootDirectory) : undefined);
    if (usesRealAcquisition) {
      (dependencies.validateFixturePersistence ?? validateFixturePersistence)(
        ORIGAMI_CHAT_FIXTURE,
        persistenceContract,
      );
    }
    const state = {
      baseUrl,
      persistenceContract,
      themeContract,
      installDeterministicOllamaFixture:
        dependencies.installDeterministicOllamaFixture ?? installDeterministicOllamaFixture,
      installOrigamiLocalState: dependencies.installOrigamiLocalState ?? installOrigamiLocalState,
      waitForJarvisDatabase: dependencies.waitForJarvisDatabase ?? waitForJarvisDatabase,
      waitForInitialLocalSeed: dependencies.waitForInitialLocalSeed ?? waitForInitialLocalSeed,
      seedOrigamiIndexedDb: dependencies.seedOrigamiIndexedDb ?? seedOrigamiIndexedDb,
    };
    const acquirePage =
      dependencies.acquirePage ??
      ((scopeCase, acquisition) =>
        acquireRealNonChatPage(resources.browser, scopeCase, acquisition, state));
    const navigate =
      dependencies.navigate ?? ((page, scopeCase) => navigateNonChatPage(page, scopeCase, state));
    verification = await (dependencies.runNonChatScopeCapture ?? runNonChatScopeCapture)(
      {
        rootDirectory: options.rootDirectory,
        artifactRoot: options.artifactRoot,
        baseUrl,
        runId: options.runId,
      },
      { acquirePage, navigate },
    );
  } catch (error) {
    primaryError = error instanceof Error ? error : new Error(String(error));
  }
  await closeOwnedResources(resources, primaryError);
  return {
    schemaVersion: 1,
    mode: 'nonchat',
    runId: options.runId,
    browserSource,
    verification: jsonClone(verification, 'non-Chat verification receipt'),
  };
}

export async function runLiveVerification(options, dependencies = {}) {
  const normalized = normalizeOptions(options);
  const result =
    normalized.mode === 'interaction'
      ? await runInteractionMode(normalized, dependencies)
      : await runNonChatMode(normalized, dependencies);
  const writeReceipt = dependencies.writeReceipt ?? writeAtomicJsonReceipt;
  await writeReceipt({
    rootDirectory: normalized.rootDirectory,
    receiptPath: normalized.receiptPath,
    value: result,
  });
  return result;
}

function requireFlagValue(argumentsList, index, flag) {
  const value = argumentsList[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Live verification argument ${flag} requires a value.`);
  }
  return value;
}

export function parseLiveVerificationArguments(argumentsList) {
  const options = {};
  for (let index = 0; index < argumentsList.length; index += 1) {
    const flag = argumentsList[index];
    if (flag === '--historical-chat-root') {
      options.historicalChatRoot = true;
      continue;
    }
    const mappings = {
      '--mode': 'mode',
      '--run-id': 'runId',
      '--root': 'rootDirectory',
      '--dist': 'distDirectory',
      '--artifact-root': 'artifactRoot',
      '--output': 'outputPath',
      '--receipt': 'receiptPath',
      '--base-url': 'baseUrl',
      '--browser-executable': 'browserExecutable',
    };
    const key = mappings[flag];
    if (!key) throw new Error(`Unknown live verification argument: ${String(flag)}.`);
    options[key] = requireFlagValue(argumentsList, index, flag);
    index += 1;
  }
  return options;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  runLiveVerification(parseLiveVerificationArguments(process.argv.slice(2)))
    .then((receipt) => process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
      process.exitCode = 1;
    });
}
