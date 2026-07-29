import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ORIGAMI_ASSISTANT_MESSAGE_TEXT,
  ORIGAMI_CHAT_FIXTURE,
  ORIGAMI_USER_MESSAGE_TEXT,
} from '../../tests/visual/chat/fixture-data.mjs';
import { launchResolvedBrowser } from './browser-launch.mjs';
import {
  installOrigamiLocalState,
  loadLocalPersistenceContract,
  seedOrigamiIndexedDb,
  validateFixturePersistence,
  waitForInitialLocalSeed,
  waitForJarvisDatabase,
} from './chat-fixture.mjs';
import { startStaticServer } from './static-server.mjs';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIRECTORY = resolve(MODULE_DIRECTORY, '../..');
const THEME_SOURCE_PATH = 'app/src/features/appearance/themeContract.source.json';

export const ORIGAMI_VIEWPORT = Object.freeze({
  width: 1672,
  height: 941,
  deviceScaleFactor: 1,
});

export const CHAT_READY_SELECTORS = Object.freeze({
  root: '#root',
  chat: '[data-vibespace-page="chat"]',
  session: '[data-testid="jarvis-session-panel"]',
  composer: 'textarea[aria-label="Message"]',
  thread: '[role="log"][data-tour="chat-thread"]',
});

function isContained(parent, candidate) {
  return candidate === parent || candidate.startsWith(`${parent}${sep}`);
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function isLocalBaseUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'http:' &&
      (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1')
    );
  } catch {
    return false;
  }
}

export function assertChatCaptureOptions(
  options,
  { rootDirectory = DEFAULT_ROOT_DIRECTORY, checkFile = (path) => existsSync(path) } = {},
) {
  if (!options || typeof options !== 'object') {
    throw new TypeError('capture options are required.');
  }
  const root = resolve(rootDirectory);
  const distDirectory = resolve(
    root,
    requireNonEmptyString(options.distDirectory, 'distDirectory'),
  );
  const outputPath = resolve(root, requireNonEmptyString(options.outputPath, 'outputPath'));
  const artifactRoot = resolve(root, '.artifacts');
  if (!isContained(artifactRoot, outputPath)) {
    throw new Error(`outputPath must stay inside ${artifactRoot}.`);
  }
  if (extname(outputPath).toLowerCase() !== '.png') {
    throw new Error('outputPath must name a PNG file.');
  }
  if (!checkFile(resolve(distDirectory, 'index.html'))) {
    throw new Error(`distDirectory must contain a built index.html: ${distDirectory}`);
  }
  if (options.baseUrl !== undefined && !isLocalBaseUrl(options.baseUrl)) {
    throw new Error('baseUrl must be a local HTTP URL.');
  }
  return {
    rootDirectory: root,
    distDirectory,
    outputPath,
    baseUrl: options.baseUrl,
    browserExecutable: options.browserExecutable,
  };
}

export function loadThemePersistenceContract(rootDirectory = DEFAULT_ROOT_DIRECTORY) {
  const source = JSON.parse(readFileSync(resolve(rootDirectory, THEME_SOURCE_PATH), 'utf8'));
  if (
    typeof source.storageKey !== 'string' ||
    !Number.isInteger(source.storeVersion) ||
    !source.selectableThemes?.some(({ id }) => id === 'vibespace')
  ) {
    throw new Error(`Invalid theme persistence source: ${THEME_SOURCE_PATH}`);
  }
  return {
    storageKey: source.storageKey,
    storeVersion: source.storeVersion,
    theme: 'vibespace',
  };
}

export async function assertRealChatRoot(page) {
  const root = page.locator(CHAT_READY_SELECTORS.chat);
  const count = await root.count();
  if (count !== 1 || !(await root.isVisible())) {
    throw new Error(
      `Refusing capture: expected one visible real Chat root (${CHAT_READY_SELECTORS.chat}).`,
    );
  }
  return root;
}

export async function waitForStableChatLayout(
  page,
  { requiredIdenticalFrames = 3, maximumFrames = 240 } = {},
) {
  return page.evaluate(
    async ({ requiredIdenticalFrames: required, maximumFrames: maximum, selectors }) => {
      const nextFrame = () => new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
      const snapshot = () => {
        const values = Object.values(selectors).map((selector) => {
          const element = document.querySelector(selector);
          if (!element) return `${selector}:missing`;
          const rect = element.getBoundingClientRect();
          return [
            selector,
            rect.x,
            rect.y,
            rect.width,
            rect.height,
            element.scrollWidth,
            element.scrollHeight,
            element.scrollLeft,
            element.scrollTop,
          ].join(':');
        });
        values.push(
          `viewport:${window.innerWidth}:${window.innerHeight}:${window.scrollX}:${window.scrollY}`,
        );
        return values.join('|');
      };
      let previous = '';
      let identical = 0;
      for (let frame = 1; frame <= maximum; frame += 1) {
        await nextFrame();
        const current = snapshot();
        identical = current === previous ? identical + 1 : 1;
        previous = current;
        if (identical >= required) {
          return { stableFrames: identical, sampledFrames: frame, snapshot: current };
        }
      }
      throw new Error(`Chat layout did not stabilize across ${maximum} animation frames.`);
    },
    {
      requiredIdenticalFrames,
      maximumFrames,
      selectors: CHAT_READY_SELECTORS,
    },
  );
}

const SCREENSHOT_FREEZE_CSS = `
  html[data-origami-screenshot-freeze="true"] *,
  html[data-origami-screenshot-freeze="true"] *::before,
  html[data-origami-screenshot-freeze="true"] *::after {
    animation-delay: 0s !important;
    animation-duration: 0s !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-delay: 0s !important;
    transition-duration: 0s !important;
    caret-color: transparent !important;
  }
  html[data-origami-screenshot-freeze="true"] [aria-label="Microphone volume level indicator"] > * {
    transform: scaleY(0.2) !important;
  }
  html[data-origami-screenshot-freeze="true"] .animate-pulse,
  html[data-origami-screenshot-freeze="true"] .animate-ping,
  html[data-origami-screenshot-freeze="true"] .animate-spin,
  html[data-origami-screenshot-freeze="true"] [class*="shimmer"],
  html[data-origami-screenshot-freeze="true"] [class*="pulse"],
  html[data-origami-screenshot-freeze="true"] .jarvis-voice-panel canvas {
    animation: none !important;
    transition: none !important;
  }
`;

export async function withScreenshotFreeze(page, capture) {
  let style;
  let activationAttempted = false;
  let primaryError;
  let result;
  try {
    style = await page.addStyleTag({ content: SCREENSHOT_FREEZE_CSS });
    activationAttempted = true;
    await page.evaluate(() => {
      if (window.__origamiScreenshotFreezeState) {
        throw new Error('Screenshot freeze is already active.');
      }
      window.__origamiScreenshotFreezeState = {
        requestAnimationFrame: window.requestAnimationFrame,
      };
      document.documentElement.dataset.origamiScreenshotFreeze = 'true';
      window.requestAnimationFrame = () => 0;
    });
    result = await capture();
  } catch (error) {
    primaryError = error instanceof Error ? error : new Error(String(error));
  }

  const cleanupErrors = [];
  if (activationAttempted) {
    try {
      await page.evaluate(() => {
        const state = window.__origamiScreenshotFreezeState;
        if (state) window.requestAnimationFrame = state.requestAnimationFrame;
        delete window.__origamiScreenshotFreezeState;
        delete document.documentElement.dataset.origamiScreenshotFreeze;
      });
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  if (style) {
    try {
      await style.evaluate((node) => node.remove());
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      primaryError ? [primaryError, ...cleanupErrors] : cleanupErrors,
      primaryError
        ? 'Capture and screenshot cleanup failed.'
        : 'Screenshot cleanup failed after capture.',
    );
  }
  if (primaryError) throw primaryError;
  return result;
}

export const DOCUMENTED_TAURI_PREVIEW_ERRORS = Object.freeze([
  "pageerror: Cannot read properties of undefined (reading 'invoke')",
  'console: [boot] account scope startup: jarvis_kernel_host_not_installed',
]);

function isDocumentedMissingTauriBridge(message) {
  return DOCUMENTED_TAURI_PREVIEW_ERRORS.includes(message);
}

function observePageErrors(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

export async function installDeterministicOllamaFixture(context, fixture) {
  const hosts = ['127.0.0.1', 'localhost'];
  const paths = ['/api/version', '/api/tags'];
  const model = fixture.modelSelection.modelId;
  await context.route(/^http:\/\/(?:127\.0\.0\.1|localhost):11434\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'GET' || url.search || !paths.includes(url.pathname)) {
      await route.abort('blockedbyclient');
      return;
    }
    const body =
      url.pathname === '/api/version'
        ? { version: 'origami-visual-fixture' }
        : {
            models: [
              {
                name: model,
                size: 0,
                modified_at: new Date(fixture.clock).toISOString(),
              },
            ],
          };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  return { hosts, port: 11434, paths, model };
}

export function assertNoUnexpectedPageErrors(errors) {
  const unexpected = errors.filter((message) => !isDocumentedMissingTauriBridge(message));
  if (unexpected.length > 0) {
    throw new Error(`Unexpected page errors:\n${unexpected.join('\n')}`);
  }
}

async function waitForChatReady(page) {
  await page.locator(CHAT_READY_SELECTORS.root).waitFor({ state: 'visible' });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.locator(CHAT_READY_SELECTORS.chat).waitFor({ state: 'visible' });
  await page.waitForFunction(
    ({ userMessage, assistantParagraphs }) => {
      const visibleText = document.body.innerText;
      return (
        visibleText.includes(userMessage) &&
        assistantParagraphs.every((paragraph) => visibleText.includes(paragraph))
      );
    },
    {
      userMessage: ORIGAMI_USER_MESSAGE_TEXT,
      assistantParagraphs: ORIGAMI_ASSISTANT_MESSAGE_TEXT.split('\n\n'),
    },
  );
  await page.locator(CHAT_READY_SELECTORS.session).waitFor({ state: 'visible' });
  await page.locator(CHAT_READY_SELECTORS.composer).waitFor({ state: 'visible' });
  await page.locator(CHAT_READY_SELECTORS.thread).waitFor({ state: 'visible' });
  for (const label of ['Writer', 'Researcher', 'Memory Keeper']) {
    await page.getByText(label, { exact: true }).waitFor({ state: 'visible' });
  }
  await assertRealChatRoot(page);
}

export async function waitForDeterministicSessionMetrics(page, expected) {
  try {
    const handle = await page.waitForFunction(
      ({ selectors, expectedMetrics }) => {
        const panel = document.querySelector(selectors.session);
        if (!panel) return false;
        const normalize = (value) => value?.replace(/\s+/g, ' ').trim() ?? '';
        const panelText = normalize(panel.textContent);
        const requiredLabels = [expectedMetrics.status, expectedMetrics.doingNow];
        const hasExpectedTurnLabel =
          expectedMetrics.agentTurns.length > 0
            ? panelText.includes(expectedMetrics.agentTurns)
            : !/\b\d+\s+turn(?:s)?\b/i.test(panelText);
        if (!requiredLabels.every((value) => panelText.includes(value)) || !hasExpectedTurnLabel) {
          return false;
        }
        const values = Object.fromEntries(
          [...panel.querySelectorAll('.grid > div')].map((card) => [
            normalize(card.children[0]?.textContent),
            normalize(card.children[1]?.textContent),
          ]),
        );
        if (
          !Object.entries(expectedMetrics.values).every(([label, value]) => values[label] === value)
        ) {
          return false;
        }
        return expectedMetrics;
      },
      { selectors: CHAT_READY_SELECTORS, expectedMetrics: expected },
    );
    return handle.jsonValue();
  } catch (error) {
    const observed = await page.evaluate(
      ({ sessionSelector }) => {
        const panel = document.querySelector(sessionSelector);
        if (!panel) return { panelPresent: false, panelText: '', values: {} };
        const normalize = (value) => value?.replace(/\s+/g, ' ').trim() ?? '';
        return {
          panelPresent: true,
          panelText: normalize(panel.textContent),
          values: Object.fromEntries(
            [...panel.querySelectorAll('.grid > div')].map((card) => [
              normalize(card.children[0]?.textContent),
              normalize(card.children[1]?.textContent),
            ]),
          ),
        };
      },
      { sessionSelector: CHAT_READY_SELECTORS.session },
    );
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${message}\nExpected session metrics: ${JSON.stringify(expected)}\nObserved session metrics: ${JSON.stringify(observed)}`,
      { cause: error },
    );
  }
}

export async function establishDeterministicScroll(page) {
  return page.evaluate(
    ({ threadSelector }) => {
      const thread = document.querySelector(threadSelector);
      if (!thread) throw new Error(`Chat thread is missing: ${threadSelector}`);
      window.scrollTo(0, 0);
      if (document.scrollingElement) {
        document.scrollingElement.scrollLeft = 0;
        document.scrollingElement.scrollTop = 0;
      }
      thread.scrollLeft = 0;
      thread.scrollTop = thread.scrollHeight;
      const threadScrollMaximum = Math.max(0, thread.scrollHeight - thread.clientHeight);
      const receipt = {
        documentScrollX: window.scrollX,
        documentScrollY: window.scrollY,
        threadScrollLeft: thread.scrollLeft,
        threadScrollTop: thread.scrollTop,
        threadScrollMaximum,
      };
      if (
        receipt.documentScrollX !== 0 ||
        receipt.documentScrollY !== 0 ||
        receipt.threadScrollLeft !== 0 ||
        receipt.threadScrollTop !== threadScrollMaximum
      ) {
        throw new Error(
          `Could not establish deterministic Chat scroll: ${JSON.stringify(receipt)}`,
        );
      }
      return receipt;
    },
    { threadSelector: CHAT_READY_SELECTORS.thread },
  );
}

export async function openRequiredJarvisModule(page) {
  const opener = page.getByRole('button', { name: 'Open Jarvis voice panel' });
  if ((await opener.count()) !== 1 || !(await opener.isVisible())) {
    throw new Error('Refusing capture: expected exactly one visible Jarvis opener.');
  }
  await opener.click();
  const panel = page.getByLabel('Jarvis voice session', { exact: true });
  await panel.waitFor({ state: 'visible' });
  if ((await panel.count()) !== 1 || !(await panel.isVisible())) {
    throw new Error('Refusing capture: expected exactly one visible real Jarvis voice module.');
  }
  const closeButton = panel.getByRole('button', { name: 'Close Jarvis voice session' });
  await closeButton.waitFor({ state: 'visible' });
  const reducedMotion = (await panel.getAttribute('data-reduced-motion')) === 'true';
  if (!reducedMotion) {
    throw new Error('Refusing capture: Jarvis voice module did not activate reduced motion.');
  }
  const readyState = await assertJarvisReadyState(page);
  return { opened: true, reducedMotion, ...readyState };
}

export async function assertJarvisReadyState(page) {
  const panel = page.getByLabel('Jarvis voice session', { exact: true });
  const panelCount = await panel.count();
  const panelVisible = panelCount === 1 && (await panel.isVisible());
  const status = panel.getByRole('status');
  const statusCount = panelVisible ? await status.count() : 0;
  const statusVisible = statusCount === 1 && (await status.isVisible());
  const statusText = statusVisible ? (await status.textContent())?.replace(/\s+/g, ' ').trim() : '';
  const clickToTalk = panel.getByRole('button', { name: 'Click to talk', exact: true });
  const controlCount = panelVisible ? await clickToTalk.count() : 0;
  const controlVisible = controlCount === 1 && (await clickToTalk.isVisible());
  if (!panelVisible || statusText !== 'Ready' || !controlVisible) {
    throw new Error(
      `Refusing capture: expected Jarvis Ready status and Click to talk control; observed status "${statusText || 'missing'}" and ${controlCount} matching control(s).`,
    );
  }
  return { status: 'Ready', control: 'Click to talk' };
}

export async function captureReadyJarvisScreenshot(page, screenshotOptions) {
  let readyState;
  await withScreenshotFreeze(page, async () => {
    readyState = await assertJarvisReadyState(page);
    await page.screenshot(screenshotOptions);
  });
  return readyState;
}

export async function closeCaptureResources(resources, primaryError) {
  const cleanupErrors = [];
  for (const resourceName of ['page', 'context', 'browser', 'server']) {
    const resource = resources[resourceName];
    if (!resource || typeof resource.close !== 'function') continue;
    try {
      await resource.close();
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      primaryError ? [primaryError, ...cleanupErrors] : cleanupErrors,
      primaryError ? 'Capture and cleanup failed.' : 'Capture cleanup failed.',
    );
  }
}

export async function captureOrigamiChat(options) {
  const validated = assertChatCaptureOptions(options);
  const themeContract = loadThemePersistenceContract(validated.rootDirectory);
  const persistenceContract = loadLocalPersistenceContract(validated.rootDirectory);
  const persistenceReceipt = validateFixturePersistence(ORIGAMI_CHAT_FIXTURE, persistenceContract);
  let server;
  let browser;
  let context;
  let page;
  let browserSource;
  let ollamaFixture;
  let primaryError;
  try {
    if (!validated.baseUrl) server = await startStaticServer(validated);
    const baseUrl = validated.baseUrl ?? server.baseUrl;
    const launched = await launchResolvedBrowser({
      browserExecutable: validated.browserExecutable,
    });
    browser = launched.browser;
    browserSource = launched.source;
    context = await browser.newContext({
      viewport: {
        width: ORIGAMI_VIEWPORT.width,
        height: ORIGAMI_VIEWPORT.height,
      },
      deviceScaleFactor: ORIGAMI_VIEWPORT.deviceScaleFactor,
      reducedMotion: 'reduce',
      colorScheme: 'light',
      locale: 'en-US',
      timezoneId: 'UTC',
    });
    ollamaFixture = await installDeterministicOllamaFixture(context, ORIGAMI_CHAT_FIXTURE);
    page = await context.newPage();
    const pageErrors = observePageErrors(page);
    await installOrigamiLocalState(page, themeContract, ORIGAMI_CHAT_FIXTURE, persistenceContract);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator(CHAT_READY_SELECTORS.root).waitFor({ state: 'visible' });
    await waitForJarvisDatabase(page, persistenceContract);
    await waitForInitialLocalSeed(page, persistenceContract);
    const seedReceipt = await seedOrigamiIndexedDb(page, ORIGAMI_CHAT_FIXTURE, persistenceContract);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForChatReady(page);
    const sessionMetrics = await waitForDeterministicSessionMetrics(
      page,
      ORIGAMI_CHAT_FIXTURE.sessionMetrics,
    );
    const jarvisModule = await openRequiredJarvisModule(page);
    const scroll = await establishDeterministicScroll(page);
    await waitForStableChatLayout(page);
    assertNoUnexpectedPageErrors(pageErrors);
    mkdirSync(dirname(validated.outputPath), { recursive: true });
    const jarvisStateAtCapture = await captureReadyJarvisScreenshot(page, {
      path: validated.outputPath,
      fullPage: false,
      animations: 'disabled',
      caret: 'hide',
    });
    assertNoUnexpectedPageErrors(pageErrors);
    return {
      schemaVersion: 1,
      outputPath: validated.outputPath,
      outputRelativePath: relative(validated.rootDirectory, validated.outputPath).replaceAll(
        '\\',
        '/',
      ),
      baseUrl,
      browserSource,
      ollamaFixture,
      viewport: ORIGAMI_VIEWPORT,
      theme: themeContract,
      fixtureSchemaVersion: ORIGAMI_CHAT_FIXTURE.schemaVersion,
      persistence: persistenceReceipt,
      seed: seedReceipt,
      sessionMetrics,
      jarvisModule,
      jarvisStateAtCapture,
      jarvisModuleOpened: jarvisModule.opened,
      scroll,
      unexpectedPageErrors: [],
    };
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    await closeCaptureResources({ page, context, browser, server }, primaryError);
  }
}

function parseCliArguments(argumentsList) {
  const values = {};
  for (let index = 0; index < argumentsList.length; index += 1) {
    const flag = argumentsList[index];
    if (flag === '--dist') values.distDirectory = argumentsList[++index];
    else if (flag === '--output') values.outputPath = argumentsList[++index];
    else if (flag === '--base-url') values.baseUrl = argumentsList[++index];
    else if (flag === '--browser-executable') values.browserExecutable = argumentsList[++index];
    else throw new Error(`Unknown capture argument: ${flag}`);
  }
  return values;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  captureOrigamiChat(parseCliArguments(process.argv.slice(2)))
    .then((receipt) => process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
      process.exitCode = 1;
    });
}
