import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIRECTORY = resolve(MODULE_DIRECTORY, '../..');

export const DEFAULT_ARTIFACT_ROOT = '.artifacts/origami-nonchat-scope';

export const NONCHAT_VIEWPORT = Object.freeze({
  width: 1672,
  height: 941,
  deviceScaleFactor: 1,
});

export const CONTEXT_OPTIONS = Object.freeze({
  reducedMotion: 'reduce',
  colorScheme: 'light',
  locale: 'en-US',
  timezoneId: 'UTC',
});

export const CHAT_GATE_DOCUMENT_THEME = 'vibespace';
export const CHAT_ROUTE = 'chat';

// The Chat gate mirrors the production Origami scope: presentation activates only when the
// document theme is `vibespace` AND the real Chat page is present. Every case in this harness
// must keep this gate inactive so non-Chat surfaces retain their existing appearance.
export const CHAT_GATE_SCOPE =
  "html[data-theme='vibespace'] body:has(main[aria-label='Workspace'] [data-vibespace-page='chat'])";

// Selectable theme ids map onto the document `data-theme` attribute exactly as the production
// theme contract does (app/src/features/appearance/themeContract.source.json).
export const THEME_CONTRACT = Object.freeze({
  jarvis: 'jarvis',
  vibespace: 'vibespace',
  default: 'dark',
  monochrome: 'monochrome',
});

export const DOCUMENT_THEMES = Object.freeze([...new Set(Object.values(THEME_CONTRACT))]);

// Readiness selectors are grounded in real, stable production markup:
// - chat: ChatView.tsx renders `data-vibespace-page="chat"` on the real Chat root.
// - terminal: PageRouter.tsx wraps TerminalsPage in `[data-terminal-route-cache]`.
// - schedule: SchedulePage.tsx renders the route-specific primary heading below.
export const NONCHAT_ROUTES = Object.freeze({
  schedule: Object.freeze({
    label: 'VibeSpace Schedule',
    readiness: Object.freeze({
      selector: 'h1:has-text("Events, timed tasks, and AI plans")',
    }),
  }),
  terminal: Object.freeze({
    label: 'VibeSpace Terminals',
    readiness: Object.freeze({ selector: '[data-terminal-route-cache]' }),
  }),
  'settings-appearance': Object.freeze({
    label: 'VibeSpace Settings Appearance',
    readiness: Object.freeze({
      selector: '[role="radiogroup"][aria-label="App theme"]',
    }),
  }),
  chat: Object.freeze({
    label: 'Chat under a non-VibeSpace theme',
    readiness: Object.freeze({ selector: '[data-vibespace-page="chat"]' }),
  }),
});

const READINESS_STATE = 'visible';
const DEFAULT_READINESS_TIMEOUT_MS = 30000;

export class NonChatScopeInputError extends Error {
  constructor(code, message) {
    super(`[${code}] ${message}`);
    this.name = 'NonChatScopeInputError';
    this.code = code;
  }
}

function inputError(code, message) {
  throw new NonChatScopeInputError(code, message);
}

export function isLocalBaseUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'http:' &&
      url.username === '' &&
      url.password === '' &&
      (url.hostname === '127.0.0.1' ||
        url.hostname === 'localhost' ||
        url.hostname === '[::1]' ||
        url.hostname === '::1')
    );
  } catch {
    return false;
  }
}

function toRelativePath(rootDirectory, absolutePath) {
  return relative(rootDirectory, absolutePath).replaceAll('\\', '/');
}

function resolveArtifactRoot(rootDirectory, artifactRoot) {
  const root = resolve(rootDirectory);
  const artifacts = resolve(root, artifactRoot ?? DEFAULT_ARTIFACT_ROOT);
  const allowedArtifacts = resolve(root, '.artifacts');
  if (!isInsideRoot(allowedArtifacts, artifacts)) {
    inputError(
      'ARTIFACT_ROOT_UNSAFE',
      `Artifact root must stay inside ${allowedArtifacts}: ${artifacts}.`,
    );
  }
  return artifacts;
}

function isInsideRoot(parent, candidate) {
  return candidate === parent || candidate.startsWith(`${parent}${sep}`);
}

function buildCase(definition, rootDirectory, artifactRoot) {
  const route = NONCHAT_ROUTES[definition.route];
  const documentTheme = THEME_CONTRACT[definition.themeId];
  const outputPath = resolve(artifactRoot, `${definition.id}.png`);
  const receiptPath = resolve(artifactRoot, `${definition.id}.receipt.json`);
  const gateActive = definition.route === CHAT_ROUTE && documentTheme === CHAT_GATE_DOCUMENT_THEME;
  return {
    id: definition.id,
    route: definition.route,
    routeLabel: route.label,
    themeId: definition.themeId,
    documentTheme,
    readiness: { selector: route.readiness.selector, state: READINESS_STATE },
    viewport: NONCHAT_VIEWPORT,
    outputPath,
    receiptPath,
    outputRelativePath: toRelativePath(rootDirectory, outputPath),
    receiptRelativePath: toRelativePath(rootDirectory, receiptPath),
    purpose: definition.purpose ?? `${route.label} must retain its existing appearance.`,
    gateActive,
  };
}

export function buildNonChatScopeMatrix({
  rootDirectory = DEFAULT_ROOT_DIRECTORY,
  artifactRoot,
  nonVibespaceChatThemeId,
} = {}) {
  const root = resolve(rootDirectory);
  const artifacts = resolveArtifactRoot(root, artifactRoot);
  if (
    nonVibespaceChatThemeId !== undefined &&
    THEME_CONTRACT[nonVibespaceChatThemeId] === undefined
  ) {
    inputError('THEME_UNKNOWN', `Unknown non-VibeSpace chat theme id: ${nonVibespaceChatThemeId}.`);
  }
  const chatThemeIds = nonVibespaceChatThemeId
    ? [nonVibespaceChatThemeId]
    : ['default', 'jarvis', 'monochrome'];
  const definitions = [
    { id: 'schedule-vibespace', route: 'schedule', themeId: 'vibespace' },
    { id: 'terminal-vibespace', route: 'terminal', themeId: 'vibespace' },
    {
      id: 'settings-appearance-vibespace',
      route: 'settings-appearance',
      themeId: 'vibespace',
    },
    ...chatThemeIds.map((themeId) => ({
      id: `chat-${themeId}`,
      route: 'chat',
      themeId,
    })),
  ];
  return definitions.map((definition) => buildCase(definition, root, artifacts));
}

export function assertNonChatScopeCase(
  rawCase,
  { rootDirectory = DEFAULT_ROOT_DIRECTORY, artifactRoot } = {},
) {
  if (!rawCase || typeof rawCase !== 'object') {
    inputError('CASE_REQUIRED', 'Each non-Chat scope case must be an object.');
  }
  const root = resolve(rootDirectory);
  const artifacts = resolveArtifactRoot(root, artifactRoot);

  const id = typeof rawCase.id === 'string' ? rawCase.id.trim() : '';
  if (id.length === 0 || id !== rawCase.id || /[/\\\0]/u.test(id)) {
    inputError(
      'CASE_ID',
      'Case id must be a non-empty, trim-stable identifier without path separators.',
    );
  }

  const route = rawCase.route;
  if (typeof route !== 'string' || NONCHAT_ROUTES[route] === undefined) {
    inputError('ROUTE_UNKNOWN', `Case ${id} has an unsupported route: ${String(route)}.`);
  }

  const themeId = rawCase.themeId;
  if (typeof themeId !== 'string' || THEME_CONTRACT[themeId] === undefined) {
    inputError('THEME_UNKNOWN', `Case ${id} has an unknown theme id: ${String(themeId)}.`);
  }
  const documentTheme = THEME_CONTRACT[themeId];
  if (rawCase.documentTheme !== undefined && rawCase.documentTheme !== documentTheme) {
    inputError(
      'THEME_MISMATCH',
      `Case ${id} documentTheme ${String(rawCase.documentTheme)} does not match theme id ${themeId}.`,
    );
  }

  const selector =
    rawCase.readiness && typeof rawCase.readiness.selector === 'string'
      ? rawCase.readiness.selector.trim()
      : '';
  if (selector.length === 0) {
    inputError('READINESS_MISSING', `Case ${id} must declare a non-empty readiness selector.`);
  }

  if (rawCase.viewport !== undefined && rawCase.viewport !== NONCHAT_VIEWPORT) {
    const { width, height, deviceScaleFactor } = rawCase.viewport ?? {};
    if (
      width !== NONCHAT_VIEWPORT.width ||
      height !== NONCHAT_VIEWPORT.height ||
      deviceScaleFactor !== NONCHAT_VIEWPORT.deviceScaleFactor
    ) {
      inputError('VIEWPORT_MISMATCH', `Case ${id} must use the locked non-Chat viewport.`);
    }
  }

  if (route === CHAT_ROUTE && documentTheme === CHAT_GATE_DOCUMENT_THEME) {
    inputError(
      'CASE_ACTIVATES_CHAT_GATE',
      `Case ${id} combines the Chat route with the vibespace theme and would activate the Chat gate.`,
    );
  }

  if (rawCase.baseUrl !== undefined && !isLocalBaseUrl(rawCase.baseUrl)) {
    inputError('BASE_URL_NOT_LOCAL', `Case ${id} baseUrl must be a loopback HTTP URL.`);
  }

  if (typeof rawCase.outputPath !== 'string' || rawCase.outputPath.trim().length === 0) {
    inputError('OUTPUT_PATH_UNSAFE', `Case ${id} must declare an outputPath.`);
  }
  const outputPath = resolve(root, rawCase.outputPath);
  if (!isInsideRoot(artifacts, outputPath)) {
    inputError('OUTPUT_PATH_UNSAFE', `Case ${id} outputPath must stay inside ${artifacts}.`);
  }
  if (extname(outputPath).toLowerCase() !== '.png') {
    inputError('OUTPUT_PATH_UNSAFE', `Case ${id} outputPath must name a PNG file.`);
  }
  if (existsSync(outputPath)) {
    inputError(
      'OUTPUT_EXISTS',
      `Case ${id} outputPath already exists (stale output refused): ${outputPath}.`,
    );
  }

  const receiptPath = outputPath.replace(/\.png$/iu, '.receipt.json');
  if (existsSync(receiptPath)) {
    inputError(
      'RECEIPT_EXISTS',
      `Case ${id} receiptPath already exists (stale receipt refused): ${receiptPath}.`,
    );
  }
  return {
    id,
    route,
    routeLabel: NONCHAT_ROUTES[route].label,
    themeId,
    documentTheme,
    readiness: { selector, state: READINESS_STATE },
    viewport: NONCHAT_VIEWPORT,
    outputPath,
    receiptPath,
    outputRelativePath: toRelativePath(root, outputPath),
    receiptRelativePath: toRelativePath(root, receiptPath),
    purpose: typeof rawCase.purpose === 'string' ? rawCase.purpose : NONCHAT_ROUTES[route].label,
    gateActive: false,
    ...(rawCase.baseUrl !== undefined ? { baseUrl: rawCase.baseUrl } : {}),
  };
}

export function assertNonChatScopeMatrix(cases, options = {}) {
  if (!Array.isArray(cases) || cases.length === 0) {
    inputError('MATRIX_EMPTY', 'A non-Chat scope matrix must contain at least one case.');
  }
  const normalized = cases.map((rawCase) => assertNonChatScopeCase(rawCase, options));
  const seenIds = new Set();
  const seenCombinations = new Set();
  const seenOutputs = new Set();
  for (const scopeCase of normalized) {
    if (seenIds.has(scopeCase.id)) {
      inputError('DUPLICATE_CASE_ID', `Duplicate non-Chat scope case id: ${scopeCase.id}.`);
    }
    seenIds.add(scopeCase.id);
    const combination = `${scopeCase.route}|${scopeCase.documentTheme}`;
    if (seenCombinations.has(combination)) {
      inputError('DUPLICATE_CASE', `Duplicate non-Chat scope route/theme case: ${combination}.`);
    }
    seenCombinations.add(combination);
    if (seenOutputs.has(scopeCase.outputPath)) {
      inputError(
        'DUPLICATE_OUTPUT',
        `Duplicate non-Chat scope output path: ${scopeCase.outputPath}.`,
      );
    }
    seenOutputs.add(scopeCase.outputPath);
  }
  return { cases: normalized };
}

// Serialized to the captured page via page.evaluate. Returns whether the Chat gate is active so
// the harness can refuse any case that accidentally activates Origami presentation.
export function chatGateProbe() {
  const documentTheme = document.documentElement.getAttribute('data-theme');
  const chatPagePresent = document.querySelector('[data-vibespace-page="chat"]') !== null;
  return {
    documentTheme,
    chatPagePresent,
    gateActive: documentTheme === 'vibespace' && chatPagePresent,
  };
}

function assertGateProbe(scopeCase, gate) {
  if (
    !gate ||
    typeof gate !== 'object' ||
    typeof gate.documentTheme !== 'string' ||
    typeof gate.chatPagePresent !== 'boolean' ||
    typeof gate.gateActive !== 'boolean'
  ) {
    inputError('GATE_PROBE_INVALID', `Case ${scopeCase.id} returned invalid Chat gate evidence.`);
  }
  if (gate.documentTheme !== scopeCase.documentTheme) {
    inputError(
      'THEME_RUNTIME_MISMATCH',
      `Case ${scopeCase.id} expected document theme ${scopeCase.documentTheme}, received ${gate.documentTheme}.`,
    );
  }
  const expectedGateActive =
    gate.documentTheme === CHAT_GATE_DOCUMENT_THEME && gate.chatPagePresent;
  if (gate.gateActive !== expectedGateActive) {
    inputError(
      'GATE_PROBE_MISMATCH',
      `Case ${scopeCase.id} returned internally inconsistent Chat gate evidence.`,
    );
  }
  if (expectedGateActive) {
    inputError(
      'CASE_ACTIVATES_CHAT_GATE',
      `Case ${scopeCase.id} activated the Chat gate at capture time; refusing non-Chat scope capture.`,
    );
  }
  return gate;
}

export async function closeNonChatResources(disposers, primaryError) {
  const errors = [];
  if (primaryError) {
    errors.push(primaryError instanceof Error ? primaryError : new Error(String(primaryError)));
  }
  for (const disposer of disposers ?? []) {
    if (!disposer || typeof disposer.close !== 'function') continue;
    try {
      await disposer.close();
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      primaryError ? 'Non-Chat capture and cleanup failed.' : 'Non-Chat capture cleanup failed.',
    );
  }
}

export function planNonChatScopeCapture({
  rootDirectory = DEFAULT_ROOT_DIRECTORY,
  artifactRoot,
  nonVibespaceChatThemeId,
} = {}) {
  try {
    const matrix = buildNonChatScopeMatrix({
      rootDirectory,
      artifactRoot,
      ...(nonVibespaceChatThemeId ? { nonVibespaceChatThemeId } : {}),
    });
    const { cases } = assertNonChatScopeMatrix(matrix, { rootDirectory, artifactRoot });
    return {
      ok: true,
      schemaVersion: 1,
      chatGateScope: CHAT_GATE_SCOPE,
      viewport: NONCHAT_VIEWPORT,
      artifactRoot: toRelativePath(
        resolve(rootDirectory),
        resolveArtifactRoot(resolve(rootDirectory), artifactRoot),
      ),
      caseCount: cases.length,
      cases,
    };
  } catch (error) {
    return {
      ok: false,
      code: error instanceof NonChatScopeInputError ? error.code : 'PLAN_FAILED',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runNonChatScopeCapture(options = {}, dependencies = {}) {
  const rootDirectory = resolve(options.rootDirectory ?? DEFAULT_ROOT_DIRECTORY);
  const artifactRoot = resolveArtifactRoot(rootDirectory, options.artifactRoot);
  const matrix =
    options.cases !== undefined
      ? assertNonChatScopeMatrix(options.cases, {
          rootDirectory,
          artifactRoot: options.artifactRoot,
        }).cases
      : assertNonChatScopeMatrix(
          buildNonChatScopeMatrix({ rootDirectory, artifactRoot: options.artifactRoot }),
          {
            rootDirectory,
            artifactRoot: options.artifactRoot,
          },
        ).cases;

  const baseUrl = options.baseUrl ?? dependencies.server?.baseUrl;
  if (baseUrl === undefined) {
    inputError('BASE_URL_REQUIRED', 'A loopback baseUrl or an injected server is required.');
  }
  if (!isLocalBaseUrl(baseUrl)) {
    inputError('BASE_URL_NOT_LOCAL', `baseUrl must be a loopback HTTP URL: ${String(baseUrl)}.`);
  }
  if (typeof dependencies.acquirePage !== 'function') {
    inputError('DEPENDENCY_MISSING', 'dependencies.acquirePage must be a function.');
  }
  if (typeof dependencies.navigate !== 'function') {
    inputError('DEPENDENCY_MISSING', 'dependencies.navigate must be a function.');
  }

  const runId = options.runId ?? 'nonchat-scope';
  if (
    typeof runId !== 'string' ||
    runId.length === 0 ||
    runId !== runId.trim() ||
    /[/\\\0]/u.test(runId)
  ) {
    inputError(
      'RUN_ID',
      'runId must be a non-empty, trim-stable identifier without path separators.',
    );
  }
  const summaryPath = resolve(artifactRoot, `${runId}.receipt.json`);
  if (existsSync(summaryPath)) {
    inputError(
      'SUMMARY_EXISTS',
      `Summary receipt already exists (stale summary refused): ${summaryPath}.`,
    );
  }
  mkdirSync(artifactRoot, { recursive: true });

  const results = [];
  let runError;

  try {
    for (const scopeCase of matrix) {
      let page;
      let dispose;
      let caseError;
      try {
        const acquired = await dependencies.acquirePage(scopeCase, {
          baseUrl,
          viewport: NONCHAT_VIEWPORT,
          contextOptions: CONTEXT_OPTIONS,
        });
        page = acquired?.page;
        dispose = acquired?.dispose;
        if (!page)
          inputError('DEPENDENCY_MISSING', `acquirePage returned no page for ${scopeCase.id}.`);
        if (typeof dispose !== 'function') {
          if (typeof page.close === 'function') {
            dispose = () => page.close();
          }
          inputError(
            'DEPENDENCY_MISSING',
            `acquirePage returned no explicit disposer for ${scopeCase.id}.`,
          );
        }
        await dependencies.navigate(page, scopeCase, { baseUrl, viewport: NONCHAT_VIEWPORT });
        await page.waitForSelector(scopeCase.readiness.selector, {
          state: scopeCase.readiness.state,
          timeout: DEFAULT_READINESS_TIMEOUT_MS,
        });
        const gate = assertGateProbe(scopeCase, await page.evaluate(chatGateProbe));
        mkdirSync(dirname(scopeCase.outputPath), { recursive: true });
        await page.screenshot({
          path: scopeCase.outputPath,
          fullPage: false,
          animations: 'disabled',
          caret: 'hide',
        });
        if (!existsSync(scopeCase.outputPath) || statSync(scopeCase.outputPath).size === 0) {
          inputError(
            'SCREENSHOT_MISSING',
            `Case ${scopeCase.id} screenshot did not produce non-empty evidence at ${scopeCase.outputPath}.`,
          );
        }
        const sha256 = createHash('sha256')
          .update(readFileSync(scopeCase.outputPath))
          .digest('hex');
        const perCaseReceipt = {
          schemaVersion: 1,
          runId,
          caseId: scopeCase.id,
          route: scopeCase.route,
          themeId: scopeCase.themeId,
          documentTheme: scopeCase.documentTheme,
          readiness: scopeCase.readiness,
          viewport: NONCHAT_VIEWPORT,
          gate: {
            documentTheme: gate.documentTheme,
            chatPagePresent: gate.chatPagePresent,
            gateActive: gate.gateActive,
          },
          outputRelativePath: scopeCase.outputRelativePath,
          receiptRelativePath: scopeCase.receiptRelativePath,
          sha256,
          baseUrl,
          captured: true,
        };
        writeFileSync(scopeCase.receiptPath, `${JSON.stringify(perCaseReceipt, null, 2)}\n`);
        results.push({
          caseId: scopeCase.id,
          route: scopeCase.route,
          documentTheme: scopeCase.documentTheme,
          captured: true,
          gateActive: false,
          outputRelativePath: scopeCase.outputRelativePath,
          receiptRelativePath: scopeCase.receiptRelativePath,
          sha256,
        });
      } catch (error) {
        caseError = error instanceof Error ? error : new Error(String(error));
        results.push({
          caseId: scopeCase.id,
          route: scopeCase.route,
          documentTheme: scopeCase.documentTheme,
          captured: false,
          gateActive: false,
          outputRelativePath: scopeCase.outputRelativePath,
          receiptRelativePath: scopeCase.receiptRelativePath,
          error: caseError.message,
        });
      }
      await closeNonChatResources(
        typeof dispose === 'function' ? [{ name: `case:${scopeCase.id}`, close: dispose }] : [],
        caseError,
      );
    }
  } catch (error) {
    runError = error instanceof Error ? error : new Error(String(error));
  }

  let serverCleanupError;
  if (dependencies.server && dependencies.ownsServer) {
    if (typeof dependencies.server.close !== 'function') {
      serverCleanupError = new NonChatScopeInputError(
        'DEPENDENCY_MISSING',
        'Owned injected server must expose close().',
      );
    } else {
      try {
        await dependencies.server.close();
      } catch (error) {
        serverCleanupError = error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  if (runError && serverCleanupError) {
    const runErrors = runError instanceof AggregateError ? runError.errors : [runError];
    throw new AggregateError(
      [...runErrors, serverCleanupError],
      'Non-Chat capture and cleanup failed.',
    );
  }
  if (runError) throw runError;
  if (serverCleanupError) {
    throw new AggregateError([serverCleanupError], 'Non-Chat capture cleanup failed.');
  }

  const summary = {
    schemaVersion: 1,
    runId,
    chatGateScope: CHAT_GATE_SCOPE,
    viewport: NONCHAT_VIEWPORT,
    artifactRoot: toRelativePath(rootDirectory, artifactRoot),
    baseUrl,
    caseCount: results.length,
    cases: results,
    determinism: {
      fixedSleeps: false,
      remoteNavigation: false,
      browserLaunchInModule: false,
    },
  };
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  return { ...summary, summaryRelativePath: toRelativePath(rootDirectory, summaryPath) };
}

function parsePlanArguments(argumentsList) {
  const options = {};
  for (let index = 0; index < argumentsList.length; index += 1) {
    const flag = argumentsList[index];
    if (flag === '--root') options.rootDirectory = argumentsList[++index];
    else if (flag === '--artifact-root') options.artifactRoot = argumentsList[++index];
    else if (flag === '--non-vibespace-chat-theme')
      options.nonVibespaceChatThemeId = argumentsList[++index];
    else inputError('CLI_ARGUMENTS', `Unknown nonchat-scope argument: ${String(flag)}.`);
  }
  return options;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const plan = planNonChatScopeCapture(parsePlanArguments(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  process.exitCode = plan.ok ? 0 : 1;
}
