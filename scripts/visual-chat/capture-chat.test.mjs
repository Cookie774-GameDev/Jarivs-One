import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CHAT_READY_SELECTORS,
  HISTORICAL_CHAT_ROOT_SELECTOR,
  ORIGAMI_VIEWPORT,
  assertChatCaptureOptions,
  assertRealChatRoot,
  loadThemePersistenceContract,
  prepareHistoricalChatRoot,
  waitForStableChatLayout,
  withScreenshotFreeze,
} from './capture-chat.mjs';
import { buildBrowserLaunchAttempts } from './browser-launch.mjs';
import { resolveStaticRequest } from './static-server.mjs';
import { ORIGAMI_CHAT_FIXTURE } from '../../tests/visual/chat/fixture-data.mjs';
import * as browserLaunchModule from './browser-launch.mjs';
import * as captureModule from './capture-chat.mjs';
import * as chatFixtureModule from './chat-fixture.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

async function withBrowserGlobals(globals, callback) {
  const descriptors = new Map(
    Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  try {
    for (const [key, value] of Object.entries(globals)) {
      Object.defineProperty(globalThis, key, {
        configurable: true,
        writable: true,
        value,
      });
    }
    return await callback();
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('capture arguments require a built distribution and contained artifact path', () => {
  const accepted = assertChatCaptureOptions(
    {
      distDirectory: resolve(ROOT, 'app/dist'),
      outputPath: resolve(ROOT, '.artifacts/origami-chat/chat.png'),
    },
    { rootDirectory: ROOT, checkFile: () => true },
  );
  assert.equal(accepted.outputPath, resolve(ROOT, '.artifacts/origami-chat/chat.png'));
  assert.equal(accepted.historicalChatRoot, false);
  assert.equal(
    assertChatCaptureOptions(
      {
        distDirectory: resolve(ROOT, 'app/dist'),
        outputPath: resolve(ROOT, '.artifacts/origami-chat/historical.png'),
        historicalChatRoot: true,
      },
      { rootDirectory: ROOT, checkFile: () => true },
    ).historicalChatRoot,
    true,
  );
  assert.throws(
    () =>
      assertChatCaptureOptions(
        {
          distDirectory: resolve(ROOT, 'app/dist'),
          outputPath: resolve(ROOT, '.artifacts/origami-chat/historical.png'),
          historicalChatRoot: 'true',
        },
        { rootDirectory: ROOT, checkFile: () => true },
      ),
    /historicalChatRoot.*boolean/i,
  );
  assert.throws(
    () =>
      assertChatCaptureOptions(
        {
          distDirectory: resolve(ROOT, 'app/dist'),
          outputPath: resolve(ROOT, 'chat.png'),
        },
        { rootDirectory: ROOT, checkFile: () => true },
      ),
    /inside .*\.artifacts/i,
  );
  assert.throws(
    () =>
      assertChatCaptureOptions(
        { distDirectory: '', outputPath: resolve(ROOT, '.artifacts/chat.png') },
        { rootDirectory: ROOT, checkFile: () => true },
      ),
    /distDirectory/i,
  );
  assert.throws(
    () =>
      assertChatCaptureOptions(
        {
          distDirectory: resolve(ROOT, 'missing'),
          outputPath: resolve(ROOT, '.artifacts/chat.png'),
        },
        { rootDirectory: ROOT, checkFile: () => false },
      ),
    /index\.html/i,
  );
});

test('capture derives the UI persistence key and version from the production source', () => {
  const source = JSON.parse(
    readFileSync(resolve(ROOT, 'app/src/features/appearance/themeContract.source.json'), 'utf8'),
  );
  assert.deepEqual(loadThemePersistenceContract(ROOT), {
    storageKey: source.storageKey,
    storeVersion: source.storeVersion,
    theme: 'vibespace',
  });
});

test('capture contract locks viewport and concrete real Chat seams', () => {
  assert.deepEqual(ORIGAMI_VIEWPORT, {
    width: 1672,
    height: 941,
    deviceScaleFactor: 1,
  });
  assert.deepEqual(CHAT_READY_SELECTORS, {
    root: '#root',
    chat: '[data-vibespace-page="chat"]',
    session: '[data-testid="jarvis-session-panel"]',
    composer: 'textarea[aria-label="Message"]',
    thread: '[role="log"][data-tour="chat-thread"]',
  });
  assert.equal(
    HISTORICAL_CHAT_ROOT_SELECTOR,
    '[data-terminal-drop="chat"][data-terminal-drop-chat-id]',
  );
});

test('historical mode marks exactly one structural Chat root without replacing real components', async () => {
  const attributes = new Map();
  const historicalRoot = {
    querySelector: (selector) =>
      [
        CHAT_READY_SELECTORS.session,
        CHAT_READY_SELECTORS.composer,
        CHAT_READY_SELECTORS.thread,
      ].includes(selector)
        ? {}
        : null,
    setAttribute: (name, value) => attributes.set(name, value),
  };
  const composerRoot = {
    querySelector: (selector) => (selector === CHAT_READY_SELECTORS.composer ? {} : null),
  };
  const document = {
    querySelectorAll: (selector) =>
      selector === HISTORICAL_CHAT_ROOT_SELECTOR ? [composerRoot, historicalRoot] : [],
  };
  const page = {
    waitForFunction: async (callback, payload) =>
      withBrowserGlobals({ document }, () => assert.equal(callback(payload), true)),
    evaluate: async (callback, payload) =>
      withBrowserGlobals({ document }, () => callback(payload)),
  };

  assert.deepEqual(await prepareHistoricalChatRoot(page), {
    injected: true,
    selector: HISTORICAL_CHAT_ROOT_SELECTOR,
  });
  assert.equal(attributes.get('data-vibespace-page'), 'chat');
  assert.equal(attributes.get('data-origami-historical-root'), 'true');
});

test('browser launch attempts preserve configured, Edge, Chrome, managed order', () => {
  assert.deepEqual(
    buildBrowserLaunchAttempts({
      browserExecutable: undefined,
      environment: { VIBESPACE_BROWSER_EXECUTABLE: 'C:\\Browsers\\custom.exe' },
    }),
    [
      {
        source: 'VIBESPACE_BROWSER_EXECUTABLE',
        options: { executablePath: 'C:\\Browsers\\custom.exe' },
      },
      { source: 'msedge', options: { channel: 'msedge' } },
      { source: 'chrome', options: { channel: 'chrome' } },
      { source: 'playwright-chromium', options: {} },
    ],
  );
});

test('browser launcher resolves installed playwright-core without launching a process', async () => {
  assert.equal(typeof browserLaunchModule.loadChromiumType, 'function');
  const chromium = await browserLaunchModule.loadChromiumType();
  assert.equal(typeof chromium.launch, 'function');
});

test('browser launcher attempts every source in order through an injected Chromium boundary', async () => {
  const calls = [];
  const managedBrowser = { close: async () => undefined };
  const chromiumType = {
    launch: async (options) => {
      calls.push(options);
      if (calls.length < 4) throw new Error(`synthetic launch failure ${calls.length}`);
      return managedBrowser;
    },
  };

  const receipt = await browserLaunchModule.launchResolvedBrowser({
    environment: { VIBESPACE_BROWSER_EXECUTABLE: 'C:\\Browsers\\custom.exe' },
    chromiumType,
  });

  assert.deepEqual(calls, [
    { headless: true, executablePath: 'C:\\Browsers\\custom.exe' },
    { headless: true, channel: 'msedge' },
    { headless: true, channel: 'chrome' },
    { headless: true },
  ]);
  assert.equal(receipt.browser, managedBrowser);
  assert.equal(receipt.source, 'playwright-chromium');
});

test('capture installs deterministic loopback Ollama responses without external network access', async () => {
  assert.equal(typeof captureModule.installDeterministicOllamaFixture, 'function');
  const registrations = [];
  const context = {
    route: async (matcher, handler) => registrations.push({ matcher, handler }),
  };

  const receipt = await captureModule.installDeterministicOllamaFixture(
    context,
    ORIGAMI_CHAT_FIXTURE,
  );
  assert.deepEqual(receipt, {
    hosts: ['127.0.0.1', 'localhost'],
    port: 11434,
    paths: ['/api/version', '/api/tags'],
    model: ORIGAMI_CHAT_FIXTURE.modelSelection.modelId,
  });
  assert.equal(registrations.length, 1);
  assert.ok(registrations[0].matcher instanceof RegExp);

  async function dispatch(url, method = 'GET') {
    const result = {};
    await registrations[0].handler({
      request: () => ({ url: () => url, method: () => method }),
      fulfill: async (options) => {
        result.fulfill = options;
      },
      abort: async (reason) => {
        result.abort = reason;
      },
    });
    return result;
  }

  const version = await dispatch('http://127.0.0.1:11434/api/version');
  assert.equal(version.fulfill.status, 200);
  assert.deepEqual(JSON.parse(version.fulfill.body), { version: 'origami-visual-fixture' });

  const tags = await dispatch('http://localhost:11434/api/tags');
  assert.equal(tags.fulfill.status, 200);
  assert.deepEqual(JSON.parse(tags.fulfill.body), {
    models: [
      {
        name: ORIGAMI_CHAT_FIXTURE.modelSelection.modelId,
        size: 0,
        modified_at: new Date(ORIGAMI_CHAT_FIXTURE.clock).toISOString(),
      },
    ],
  });

  assert.deepEqual(await dispatch('http://127.0.0.1:11434/api/generate'), {
    abort: 'blockedbyclient',
  });
  assert.deepEqual(await dispatch('http://127.0.0.1:11434/api/version', 'POST'), {
    abort: 'blockedbyclient',
  });
});

test('fixture persistence is validated against source-derived auth and database contracts', () => {
  assert.equal(typeof chatFixtureModule.loadLocalPersistenceContract, 'function');
  assert.equal(typeof chatFixtureModule.validateFixturePersistence, 'function');

  const contract = chatFixtureModule.loadLocalPersistenceContract(ROOT);
  assert.equal(contract.auth.storageKey, 'jarvis-auth');
  assert.equal(contract.auth.storeVersion, 14);
  assert.deepEqual(contract.ui.persistedKeys, [
    'navOpen',
    'inspectorOpen',
    'activeChatId',
    'activeAgentId',
    'navSectionsCollapsed',
    'chatMode',
    'theme',
    'density',
    'onboardingComplete',
    'productTutorialStatus',
    'ambient',
    'ambientThresholdMs',
    'ambientDrone',
    'ambientTrack',
    'ambientVolume',
    'ambientAlwaysPlay',
    'composerStt',
    'defaultTerminalFontSize',
    'notificationMaster',
    'doneNotifications',
    'aiCompletionCue',
    'lastSeenWhatsNewVersion',
  ]);
  assert.equal(contract.ui.currentWhatsNewVersion, '1.5.0');
  assert.equal(contract.database.name, 'jarvis-v1');
  assert.equal(contract.database.version, 8);
  assert.deepEqual(
    [
      'agents',
      'chats',
      'jarvis_events',
      'jarvis_runs',
      'messages',
      'projects',
      'workspaces',
    ].filter((storeName) => !contract.database.storeNames.includes(storeName)),
    [],
  );
  assert.deepEqual(chatFixtureModule.validateFixturePersistence(ORIGAMI_CHAT_FIXTURE, contract), {
    authStorageKey: 'jarvis-auth',
    authStoreVersion: 14,
    uiPersistedKeys: contract.ui.persistedKeys,
    databaseName: 'jarvis-v1',
    databaseVersion: 8,
    seededStores: [
      'workspaces',
      'projects',
      'chats',
      'messages',
      'agents',
      'jarvis_runs',
      'jarvis_events',
    ],
  });

  const staleFixture = structuredClone(ORIGAMI_CHAT_FIXTURE);
  staleFixture.auth.unpersistedVisualShortcut = true;
  assert.throws(
    () => chatFixtureModule.validateFixturePersistence(staleFixture, contract),
    /auth field.*unpersistedVisualShortcut/i,
  );
  delete staleFixture.auth.unpersistedVisualShortcut;
  delete staleFixture.workspace.owner_id;
  assert.throws(
    () => chatFixtureModule.validateFixturePersistence(staleFixture, contract),
    /workspaces.*owner_id/i,
  );
});

test('fixture persistence rejects unpersisted UI fields', () => {
  const contract = chatFixtureModule.loadLocalPersistenceContract(ROOT);
  const staleUiFixture = structuredClone(ORIGAMI_CHAT_FIXTURE);
  staleUiFixture.ui.transientOverlay = true;
  assert.throws(
    () => chatFixtureModule.validateFixturePersistence(staleUiFixture, contract),
    /ui field.*transientOverlay/i,
  );
  delete staleUiFixture.ui.transientOverlay;
  staleUiFixture.ui.lastSeenWhatsNewVersion = '1.4.0';
  assert.throws(
    () => chatFixtureModule.validateFixturePersistence(staleUiFixture, contract),
    /lastSeenWhatsNewVersion.*current production version/i,
  );
});

test('fixture persistence rejects mapper-incomplete Jarvis run rows', () => {
  const contract = chatFixtureModule.loadLocalPersistenceContract(ROOT);
  const incompleteRunFixture = structuredClone(ORIGAMI_CHAT_FIXTURE);
  incompleteRunFixture.activity.runs.push({
    id: 'jrun_incomplete',
    account_id: ORIGAMI_CHAT_FIXTURE.auth.localUserId,
    chat_id: ORIGAMI_CHAT_FIXTURE.chat.id,
    status: 'completed',
    agent_id: ORIGAMI_CHAT_FIXTURE.ids.jarvisAgent,
    identity_version: 1,
    profile_revision_id: 'jprofile_incomplete',
    model: {},
    created_at: ORIGAMI_CHAT_FIXTURE.clock,
    updated_at: ORIGAMI_CHAT_FIXTURE.clock,
  });
  assert.throws(
    () => chatFixtureModule.validateFixturePersistence(incompleteRunFixture, contract),
    /jarvis_runs.*source/i,
  );
});

test('fixture persistence rejects mapper-incomplete Jarvis event rows', () => {
  const contract = chatFixtureModule.loadLocalPersistenceContract(ROOT);
  const incompleteEventFixture = structuredClone(ORIGAMI_CHAT_FIXTURE);
  incompleteEventFixture.activity.events.push({
    run_id: 'jrun_incomplete',
    seq: 1,
    idempotency_key: 'incomplete-event',
    type: 'tool',
    status: 'completed',
    title: 'Incomplete event',
    artifact_ids: [],
    created_at: ORIGAMI_CHAT_FIXTURE.clock,
  });
  assert.throws(
    () => chatFixtureModule.validateFixturePersistence(incompleteEventFixture, contract),
    /jarvis_events.*source_refs/i,
  );
});

test('local state freezes both Date.now and zero-argument new Date before app boot', async () => {
  let initScript;
  let initArgument;
  const page = {
    addInitScript: async (callback, argument) => {
      initScript = callback;
      initArgument = argument;
    },
  };
  const persistence = {
    auth: { storageKey: 'jarvis-auth', storeVersion: 14 },
    database: { name: 'jarvis-v1', version: 8 },
  };
  await chatFixtureModule.installOrigamiLocalState(
    page,
    { storageKey: 'jarvis-ui', storeVersion: 5, theme: 'vibespace' },
    ORIGAMI_CHAT_FIXTURE,
    persistence,
  );

  const storage = new Map();
  const localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  const originalDate = globalThis.Date;
  const originalNow = originalDate.now;
  try {
    await withBrowserGlobals({ localStorage }, async () => initScript(initArgument));
    const captureNow = ORIGAMI_CHAT_FIXTURE.clock + 3 * 60 * 60 * 1000;
    assert.equal(Date.now(), captureNow);
    assert.equal(new Date().getTime(), captureNow);
    assert.equal(new Date(123).getTime(), 123);
    assert.deepEqual(JSON.parse(storage.get('jarvis-auth')), {
      state: ORIGAMI_CHAT_FIXTURE.auth,
      version: 14,
    });
  } finally {
    globalThis.Date = originalDate;
    originalDate.now = originalNow;
  }
});

test('fixture seeding waits for durable bootstrap rows instead of navigation copy', async () => {
  assert.equal(typeof chatFixtureModule.waitForInitialLocalSeed, 'function');

  function indexedDbWithCounts(counts) {
    return {
      open: () => {
        const openRequest = {};
        queueMicrotask(() => {
          openRequest.result = {
            close: () => undefined,
            objectStoreNames: {
              contains: (storeName) => ['workspaces', 'projects', 'agents'].includes(storeName),
            },
            transaction: () => ({
              objectStore: (storeName) => ({
                count: () => {
                  const countRequest = {};
                  queueMicrotask(() => {
                    countRequest.result = counts[storeName] ?? 0;
                    countRequest.onsuccess();
                  });
                  return countRequest;
                },
              }),
            }),
          };
          openRequest.onsuccess();
        });
        return openRequest;
      },
    };
  }

  const pageForCounts = (counts) => ({
    waitForFunction: async (callback, argument) => {
      const ready = await withBrowserGlobals({ indexedDB: indexedDbWithCounts(counts) }, () =>
        callback(argument),
      );
      if (!ready) throw new Error('synthetic initial seed timeout');
    },
  });
  const persistence = { database: { name: 'jarvis-v1' } };

  await chatFixtureModule.waitForInitialLocalSeed(
    pageForCounts({ workspaces: 1, projects: 1, agents: 2 }),
    persistence,
  );
  await assert.rejects(
    () =>
      chatFixtureModule.waitForInitialLocalSeed(
        pageForCounts({ workspaces: 1, projects: 1, agents: 0 }),
        persistence,
      ),
    /synthetic initial seed timeout/,
  );
});

test('static asset resolution stays inside the served distribution', () => {
  const referenceRoot = resolve(ROOT, 'tests/visual/chat/reference');
  assert.equal(
    resolveStaticRequest(referenceRoot, '/target-chat.png?cache-bust=1'),
    resolve(referenceRoot, 'target-chat.png'),
  );
  assert.equal(resolveStaticRequest(referenceRoot, '/%2e%2e/%2e%2e/package.json'), null);
  assert.equal(resolveStaticRequest(referenceRoot, '/missing.js'), null);
});

test('stable readiness requests three identical animation-frame snapshots', async () => {
  let evaluated;
  const page = {
    evaluate: async (callback, argument) => {
      evaluated = { callback: String(callback), argument };
      return { stableFrames: 3, snapshot: 'stable' };
    },
  };
  const receipt = await waitForStableChatLayout(page);
  assert.equal(receipt.stableFrames, 3);
  assert.equal(evaluated.argument.requiredIdenticalFrames, 3);
  assert.match(evaluated.callback, /requestAnimationFrame/);
  assert.doesNotMatch(evaluated.callback, /setTimeout|waitForTimeout/);
});

test('capture establishes exact document-top and bottom-sticky Chat scroll positions', async () => {
  assert.equal(typeof captureModule.establishDeterministicScroll, 'function');
  let threadTop = 0;
  const thread = {
    scrollHeight: 900,
    clientHeight: 300,
    scrollLeft: 17,
    get scrollTop() {
      return threadTop;
    },
    set scrollTop(value) {
      threadTop = Math.max(0, Math.min(Number(value), this.scrollHeight - this.clientHeight));
    },
  };
  const scrollingElement = {
    scrollTop: 40,
    scrollLeft: 9,
  };
  const fakeWindow = {
    scrollX: 12,
    scrollY: 24,
    scrollTo: (x, y) => {
      fakeWindow.scrollX = x;
      fakeWindow.scrollY = y;
    },
  };
  const fakeDocument = {
    scrollingElement,
    querySelector: (selector) => (selector === CHAT_READY_SELECTORS.thread ? thread : null),
  };
  const page = {
    evaluate: (callback, argument) =>
      withBrowserGlobals({ document: fakeDocument, window: fakeWindow }, () => callback(argument)),
  };

  assert.deepEqual(await captureModule.establishDeterministicScroll(page), {
    documentScrollX: 0,
    documentScrollY: 0,
    threadScrollLeft: 0,
    threadScrollTop: 600,
    threadScrollMaximum: 600,
  });
});

test('capture waits for the exact source-backed session labels and values', async () => {
  assert.equal(typeof captureModule.waitForDeterministicSessionMetrics, 'function');
  const metricCards = Object.entries(ORIGAMI_CHAT_FIXTURE.sessionMetrics.values).map(
    ([label, value]) => ({
      children: [{ textContent: label }, { textContent: value }],
    }),
  );
  const panel = {
    textContent: [
      'Jarvis session',
      ORIGAMI_CHAT_FIXTURE.sessionMetrics.status,
      ORIGAMI_CHAT_FIXTURE.sessionMetrics.agentTurns,
      ORIGAMI_CHAT_FIXTURE.sessionMetrics.doingNow,
    ].join(' '),
    querySelectorAll: () => metricCards,
  };
  const fakeDocument = {
    querySelector: (selector) => (selector === CHAT_READY_SELECTORS.session ? panel : null),
  };
  const page = {
    waitForFunction: async (callback, argument) => {
      const value = await withBrowserGlobals({ document: fakeDocument }, () => callback(argument));
      if (!value) throw new Error('synthetic readiness timeout');
      return { jsonValue: async () => value };
    },
    evaluate: (callback, argument) =>
      withBrowserGlobals({ document: fakeDocument }, () => callback(argument)),
  };

  assert.deepEqual(
    await captureModule.waitForDeterministicSessionMetrics(
      page,
      ORIGAMI_CHAT_FIXTURE.sessionMetrics,
    ),
    ORIGAMI_CHAT_FIXTURE.sessionMetrics,
  );

  panel.textContent += ' 1 turn';
  await assert.rejects(
    () =>
      captureModule.waitForDeterministicSessionMetrics(page, ORIGAMI_CHAT_FIXTURE.sessionMetrics),
    /synthetic readiness timeout/,
  );
  panel.textContent = panel.textContent.replace(' 1 turn', '');

  metricCards[3].children[1].textContent = '999';
  await assert.rejects(
    () =>
      captureModule.waitForDeterministicSessionMetrics(page, ORIGAMI_CHAT_FIXTURE.sessionMetrics),
    /synthetic readiness timeout/,
  );
});

test('session readiness timeout reports the observed panel metrics', async () => {
  const observedCards = [
    ['Edited files', '0'],
    ['Lines in/out', '+0 / -0'],
    ['Tokens in', '0'],
    ['Tokens out', '0'],
    ['Started', '—'],
    ['Duration', '0ms'],
  ].map(([label, value]) => ({
    children: [{ textContent: label }, { textContent: value }],
  }));
  const panel = {
    textContent: 'Jarvis session Idle Now: Ready — send a message to start this session',
    querySelectorAll: () => observedCards,
  };
  const fakeDocument = {
    querySelector: (selector) => (selector === CHAT_READY_SELECTORS.session ? panel : null),
  };
  const timeout = new Error('synthetic readiness timeout');
  const page = {
    waitForFunction: async () => {
      throw timeout;
    },
    evaluate: (callback, argument) =>
      withBrowserGlobals({ document: fakeDocument }, () => callback(argument)),
  };

  await assert.rejects(
    () =>
      captureModule.waitForDeterministicSessionMetrics(page, ORIGAMI_CHAT_FIXTURE.sessionMetrics),
    (error) => {
      assert.match(error.message, /synthetic readiness timeout/);
      assert.match(error.message, /Ready — send a message to start this session/);
      assert.match(error.message, /\"Started\":\"—\"/);
      assert.match(error.message, /\"Duration\":\"0ms\"/);
      assert.match(error.message, /expected/i);
      return true;
    },
  );
});

test('capture requires one visible opener and the real visible Jarvis module state', async () => {
  assert.equal(typeof captureModule.openRequiredJarvisModule, 'function');
  let clicked = false;
  const visible = {
    count: async () => 1,
    isVisible: async () => true,
    waitFor: async () => undefined,
  };
  const opener = {
    ...visible,
    click: async () => {
      clicked = true;
    },
  };
  const status = {
    ...visible,
    textContent: async () => 'Ready',
  };
  const clickToTalk = visible;
  const panel = {
    ...visible,
    getAttribute: async (name) => (name === 'data-reduced-motion' ? 'true' : null),
    getByRole: (role, options = {}) => {
      if (role === 'status') return status;
      if (role === 'button' && options.name === 'Click to talk') return clickToTalk;
      return visible;
    },
  };
  const page = {
    getByRole: (_role, { name }) => {
      assert.equal(name, 'Open Jarvis voice panel');
      return opener;
    },
    getByLabel: (label, options) => {
      assert.equal(label, 'Jarvis voice session');
      assert.deepEqual(options, { exact: true });
      return panel;
    },
  };

  assert.deepEqual(await captureModule.openRequiredJarvisModule(page), {
    opened: true,
    reducedMotion: true,
    status: 'Ready',
    control: 'Click to talk',
  });
  assert.equal(clicked, true);
});

test('capture rejects missing, ambiguous, or invisible Jarvis openers', async () => {
  assert.equal(typeof captureModule.openRequiredJarvisModule, 'function');
  for (const opener of [
    { count: async () => 0, isVisible: async () => false },
    { count: async () => 2, isVisible: async () => true },
    { count: async () => 1, isVisible: async () => false },
  ]) {
    const page = { getByRole: () => opener };
    await assert.rejects(
      () => captureModule.openRequiredJarvisModule(page),
      /exactly one visible.*Jarvis opener/i,
    );
  }
});

test('capture rejects error, listening, and late-transition Jarvis states', async () => {
  assert.equal(typeof captureModule.assertJarvisReadyState, 'function');
  const state = { status: 'Ready', control: 'Click to talk' };
  const visible = {
    count: async () => 1,
    isVisible: async () => true,
    waitFor: async () => undefined,
  };
  const missing = {
    count: async () => 0,
    isVisible: async () => false,
    waitFor: async () => undefined,
  };
  const panel = {
    ...visible,
    getByRole: (role, options = {}) => {
      if (role === 'status') {
        return {
          ...visible,
          textContent: async () => state.status,
        };
      }
      if (role === 'button' && options.name === 'Click to talk') {
        return state.control === 'Click to talk' ? visible : missing;
      }
      return missing;
    },
  };
  const page = { getByLabel: () => panel };

  assert.deepEqual(await captureModule.assertJarvisReadyState(page), {
    status: 'Ready',
    control: 'Click to talk',
  });

  state.status = 'Listening';
  state.control = 'Stop listening';
  await assert.rejects(
    () => captureModule.assertJarvisReadyState(page),
    /Ready.*Click to talk.*Listening/i,
  );

  state.status = 'Voice error';
  state.control = 'Click to talk';
  await assert.rejects(
    () => captureModule.assertJarvisReadyState(page),
    /Ready.*Click to talk.*Voice error/i,
  );
});

test('screenshot boundary rechecks Jarvis after a late transition and refuses capture', async () => {
  assert.equal(typeof captureModule.captureReadyJarvisScreenshot, 'function');
  const state = { status: 'Ready', control: 'Click to talk' };
  const visible = {
    count: async () => 1,
    isVisible: async () => true,
    waitFor: async () => undefined,
  };
  const missing = {
    count: async () => 0,
    isVisible: async () => false,
    waitFor: async () => undefined,
  };
  const panel = {
    ...visible,
    getByRole: (role, options = {}) => {
      if (role === 'status') {
        return { ...visible, textContent: async () => state.status };
      }
      if (role === 'button' && options.name === 'Click to talk') {
        return state.control === 'Click to talk' ? visible : missing;
      }
      return missing;
    },
  };
  const fakeWindow = { requestAnimationFrame: () => 41 };
  const fakeDocument = { documentElement: { dataset: {} } };
  let screenshotCalls = 0;
  let styleRemoved = false;
  const page = {
    getByLabel: () => panel,
    addStyleTag: async () => ({
      evaluate: async (callback) =>
        callback({
          remove: () => {
            styleRemoved = true;
          },
        }),
    }),
    evaluate: (callback) =>
      withBrowserGlobals({ document: fakeDocument, window: fakeWindow }, () => callback()),
    screenshot: async () => {
      screenshotCalls += 1;
    },
  };

  assert.deepEqual(await captureModule.assertJarvisReadyState(page), {
    status: 'Ready',
    control: 'Click to talk',
  });
  state.status = 'Listening';
  state.control = 'Stop listening';

  await assert.rejects(
    () => captureModule.captureReadyJarvisScreenshot(page, { path: 'never-written.png' }),
    /Ready.*Click to talk.*Listening/i,
  );
  assert.equal(screenshotCalls, 0);
  assert.equal(styleRemoved, true);
});

test('screenshot freeze is scoped to the screenshot callback and always removed', async () => {
  const calls = [];
  const style = {
    evaluate: async (callback) => callback({ remove: () => calls.push('remove') }),
  };
  const originalRequestAnimationFrame = () => 41;
  const fakeWindow = { requestAnimationFrame: originalRequestAnimationFrame };
  const fakeDocument = { documentElement: { dataset: {} } };
  const page = {
    addStyleTag: async ({ content }) => {
      calls.push(content);
      return style;
    },
    evaluate: (callback) =>
      withBrowserGlobals({ document: fakeDocument, window: fakeWindow }, () => callback()),
  };
  await assert.rejects(
    () =>
      withScreenshotFreeze(page, async () => {
        calls.push('capture');
        assert.equal(
          fakeWindow.requestAnimationFrame(() => undefined),
          0,
        );
        assert.equal(fakeDocument.documentElement.dataset.origamiScreenshotFreeze, 'true');
        throw new Error('synthetic screenshot failure');
      }),
    /synthetic screenshot failure/,
  );
  assert.match(calls[0], /animation-duration/);
  assert.match(calls[0], /caret-color/);
  assert.match(calls[0], /Microphone volume level indicator/);
  assert.match(calls[0], /animate-(?:pulse|ping|spin)/);
  assert.match(calls[0], /jarvis-voice-panel/);
  assert.deepEqual(calls.slice(1), ['capture', 'remove']);
  assert.equal(fakeWindow.requestAnimationFrame, originalRequestAnimationFrame);
  assert.equal(fakeDocument.documentElement.dataset.origamiScreenshotFreeze, undefined);
});

test('screenshot freeze cleans up a partially failed activation', async () => {
  const calls = [];
  const originalRequestAnimationFrame = () => 41;
  const fakeWindow = { requestAnimationFrame: originalRequestAnimationFrame };
  const fakeDocument = { documentElement: { dataset: {} } };
  let evaluations = 0;
  const page = {
    addStyleTag: async () => ({
      evaluate: async (callback) => callback({ remove: () => calls.push('remove') }),
    }),
    evaluate: async (callback) => {
      evaluations += 1;
      const result = await withBrowserGlobals({ document: fakeDocument, window: fakeWindow }, () =>
        callback(),
      );
      if (evaluations === 1) throw new Error('activation failed');
      return result;
    },
  };

  await assert.rejects(
    () => withScreenshotFreeze(page, async () => calls.push('capture')),
    /activation failed/,
  );
  assert.equal(evaluations, 2);
  assert.deepEqual(calls, ['remove']);
  assert.equal(fakeWindow.requestAnimationFrame, originalRequestAnimationFrame);
  assert.equal(fakeDocument.documentElement.dataset.origamiScreenshotFreeze, undefined);
});

test('screenshot freeze preserves capture failure before independent restore failures', async () => {
  const calls = [];
  let evaluations = 0;
  const page = {
    addStyleTag: async () => ({
      evaluate: async (callback) =>
        callback({
          remove: () => {
            calls.push('remove');
            throw new Error('style remove failed');
          },
        }),
    }),
    evaluate: async () => {
      evaluations += 1;
      if (evaluations === 2) throw new Error('DOM restore failed');
    },
  };
  const captureFailure = new Error('capture failed');

  await assert.rejects(
    () =>
      withScreenshotFreeze(page, async () => {
        throw captureFailure;
      }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, /capture and screenshot cleanup failed/i);
      assert.equal(error.errors[0], captureFailure);
      assert.deepEqual(
        error.errors.slice(1).map((entry) => entry.message),
        ['DOM restore failed', 'style remove failed'],
      );
      return true;
    },
  );
  assert.deepEqual(calls, ['remove']);
});

test('capture refuses a page without the genuine Chat root', async () => {
  const page = {
    locator: () => ({
      count: async () => 0,
      isVisible: async () => false,
    }),
  };
  await assert.rejects(() => assertRealChatRoot(page), /real Chat root/i);
});

test('capture permits only the exact documented native web-preview diagnostics', () => {
  assert.equal(typeof captureModule.assertNoUnexpectedPageErrors, 'function');
  assert.deepEqual(captureModule.DOCUMENTED_TAURI_PREVIEW_ERRORS, [
    "pageerror: Cannot read properties of undefined (reading 'invoke')",
    'console: [boot] account scope startup: jarvis_kernel_host_not_installed',
  ]);
  assert.doesNotThrow(() =>
    captureModule.assertNoUnexpectedPageErrors([
      "pageerror: Cannot read properties of undefined (reading 'invoke')",
      'console: [boot] account scope startup: jarvis_kernel_host_not_installed',
    ]),
  );
  assert.throws(
    () =>
      captureModule.assertNoUnexpectedPageErrors([
        'pageerror: TypeError: synthetic __TAURI_INTERNALS__ invoke corruption',
      ]),
    /Unexpected page errors.*synthetic/s,
  );
  assert.throws(
    () =>
      captureModule.assertNoUnexpectedPageErrors([
        'console: Tauri filesystem returned corrupt application data',
      ]),
    /Unexpected page errors.*corrupt/s,
  );
  assert.throws(
    () =>
      captureModule.assertNoUnexpectedPageErrors([
        'console: [boot] account scope startup: jarvis_kernel_host_not_installed: synthetic',
      ]),
    /Unexpected page errors.*synthetic/s,
  );
});

test('capture source contains no fixed sleep', () => {
  const source = readFileSync(resolve(HERE, 'capture-chat.mjs'), 'utf8');
  assert.doesNotMatch(source, /waitForTimeout|setTimeout\s*\(/);
});

test('cleanup attempts every resource and surfaces close failures instead of reporting success', async () => {
  assert.equal(typeof captureModule.closeCaptureResources, 'function');
  const calls = [];
  const resources = Object.fromEntries(
    ['page', 'context', 'browser', 'server'].map((name) => [
      name,
      {
        close: async () => {
          calls.push(name);
          if (name === 'context') throw new Error('context close failed');
        },
      },
    ]),
  );

  await assert.rejects(
    () => captureModule.closeCaptureResources(resources),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, /cleanup failed/i);
      assert.deepEqual(
        error.errors.map((entry) => entry.message),
        ['context close failed'],
      );
      return true;
    },
  );
  assert.deepEqual(calls, ['page', 'context', 'browser', 'server']);
});

test('cleanup preserves a primary capture failure alongside cleanup failures', async () => {
  assert.equal(typeof captureModule.closeCaptureResources, 'function');
  const primary = new Error('capture failed');
  const resources = {
    browser: { close: async () => Promise.reject(new Error('browser close failed')) },
  };

  await assert.rejects(
    () => captureModule.closeCaptureResources(resources, primary),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, /capture and cleanup failed/i);
      assert.equal(error.errors[0], primary);
      assert.match(error.errors[1].message, /browser close failed/);
      return true;
    },
  );
});
