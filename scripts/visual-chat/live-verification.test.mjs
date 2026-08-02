import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  clickUniqueVisibleRole,
  navigateNonChatPage,
  parseLiveVerificationArguments,
  runLiveVerification,
  writeAtomicJsonReceipt,
} from './live-verification.mjs';
import {
  CONTEXT_OPTIONS,
  NONCHAT_VIEWPORT,
  runNonChatScopeCapture,
} from './nonchat-scope-capture.mjs';

function makeRoot() {
  const root = resolve(
    tmpdir(),
    `origami-live-verification-${process.pid}-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'dist', 'index.html'), '<main>built</main>\n');
  return root;
}

function cleanRoot(root) {
  rmSync(root, { recursive: true, force: true });
}

test('production navigation clicks exactly one visible accessible control and ignores hidden cached copies', async () => {
  const clicks = [];
  const waits = [];
  const makeLocator = (matches) => ({
    filter: (options) => {
      assert.deepEqual(options, { visible: true });
      return makeLocator(matches.filter(({ visible }) => visible));
    },
    first: () => ({
      waitFor: async (options) => waits.push(options),
    }),
    count: async () => matches.length,
    nth: (index) => ({
      isVisible: async () => matches[index].visible,
      click: async () => clicks.push(matches[index].id),
    }),
  });
  const page = {
    getByRole: (role, options) => {
      assert.equal(role, 'button');
      assert.deepEqual(options, { name: 'Schedule', exact: true });
      return makeLocator([
        { id: 'hidden-cached-schedule', visible: false },
        { id: 'live-schedule', visible: true },
      ]);
    },
  };

  assert.equal(await clickUniqueVisibleRole(page, 'button', ['Schedule'], 'Schedule'), 'Schedule');
  assert.deepEqual(clicks, ['live-schedule']);
  assert.deepEqual(waits, [{ state: 'visible', timeout: 5_000 }]);
});

test('production navigation fails closed when an accessible control has multiple visible copies', async () => {
  const locator = {
    filter: () => locator,
    first: () => ({ waitFor: async () => {} }),
    count: async () => 2,
    nth: () => ({ isVisible: async () => true, click: async () => {} }),
  };
  await assert.rejects(
    clickUniqueVisibleRole(
      { getByRole: () => locator },
      'tab',
      ['Appearance'],
      'Settings Appearance',
    ),
    /exactly one visible.*Settings Appearance/i,
  );
});

test('Settings Appearance evidence opens over Terminals so the Chat presentation gate stays inactive', async () => {
  const events = [];
  const page = {
    goto: async () => events.push('goto'),
    locator: () => ({ waitFor: async () => events.push('root-ready') }),
    reload: async () => events.push('reload'),
    getByRole: (role, { name }) => {
      const locator = {
        filter: () => locator,
        first: () => ({ waitFor: async () => events.push(`ready:${role}:${name}`) }),
        count: async () => 1,
        nth: () => ({ click: async () => events.push(`click:${role}:${name}`) }),
      };
      return locator;
    },
  };
  const state = {
    baseUrl: 'http://127.0.0.1:4173',
    persistenceContract: {},
    waitForJarvisDatabase: async () => events.push('database-ready'),
    waitForInitialLocalSeed: async () => events.push('initial-seed'),
    seedOrigamiIndexedDb: async () => events.push('indexeddb-seed'),
  };

  await navigateNonChatPage(page, { route: 'settings-appearance' }, state);

  assert.deepEqual(
    events.filter((event) => event.startsWith('click:')),
    ['click:button:Terminals', 'click:button:Settings', 'click:tab:Appearance'],
  );
});

test('interaction mode composes capture with the interaction page audit and atomically persists its receipt', async () => {
  const root = makeRoot();
  const calls = [];
  const page = { id: 'injected-page' };
  try {
    const result = await runLiveVerification(
      {
        mode: 'interaction',
        runId: 'interaction-001',
        rootDirectory: root,
        distDirectory: 'dist',
        outputPath: '.artifacts/origami-chat/final-chat.png',
        receiptPath: '.artifacts/origami-chat/interaction-001.receipt.json',
      },
      {
        runInteractionAudit: async (receivedPage) => {
          assert.equal(receivedPage, page);
          calls.push('audit');
          return { schemaVersion: 1, submission: { send: true, ctrlEnter: true } };
        },
        captureOrigamiChat: async (options) => {
          calls.push('capture');
          assert.equal(typeof options.pageAudit, 'function');
          const audit = await options.pageAudit(page);
          return {
            schemaVersion: 1,
            outputRelativePath: '.artifacts/origami-chat/final-chat.png',
            pageAudit: { executed: true, receipt: audit },
          };
        },
      },
    );

    assert.deepEqual(calls, ['capture', 'audit']);
    assert.equal(result.mode, 'interaction');
    assert.equal(result.verification.interaction.submission.ctrlEnter, true);
    const receiptPath = join(root, '.artifacts/origami-chat/interaction-001.receipt.json');
    assert.deepEqual(JSON.parse(readFileSync(receiptPath, 'utf8')), result);
    assert.deepEqual(readdirSync(join(root, '.artifacts/origami-chat')).sort(), [
      'interaction-001.receipt.json',
    ]);
  } finally {
    cleanRoot(root);
  }
});

test('nonchat mode runs the exact six-case matrix with one server/browser and disposes each case before the next', async () => {
  const root = makeRoot();
  const events = [];
  let activeCase = null;
  let serverStarts = 0;
  let browserLaunches = 0;
  try {
    const result = await runLiveVerification(
      {
        mode: 'nonchat',
        runId: 'nonchat-001',
        rootDirectory: root,
        distDirectory: 'dist',
        artifactRoot: '.artifacts/origami-chat/nonchat',
        receiptPath: '.artifacts/origami-chat/nonchat-001.receipt.json',
      },
      {
        startStaticServer: async () => {
          serverStarts += 1;
          return {
            baseUrl: 'http://127.0.0.1:4173',
            close: async () => events.push('server:close'),
          };
        },
        launchResolvedBrowser: async () => {
          browserLaunches += 1;
          return {
            source: 'injected-browser',
            browser: { close: async () => events.push('browser:close') },
          };
        },
        runNonChatScopeCapture,
        acquirePage: async (scopeCase, acquisition) => {
          assert.equal(activeCase, null, 'the prior case must be disposed before acquisition');
          assert.deepEqual(acquisition.viewport, NONCHAT_VIEWPORT);
          assert.deepEqual(acquisition.contextOptions, CONTEXT_OPTIONS);
          activeCase = scopeCase.id;
          events.push(`acquire:${scopeCase.id}`);
          return {
            page: {
              waitForSelector: async () => {},
              evaluate: async () => ({
                documentTheme: scopeCase.documentTheme,
                chatPagePresent: scopeCase.route === 'chat',
                gateActive: false,
              }),
              screenshot: async ({ path }) => writeFileSync(path, `png:${scopeCase.id}`),
            },
            dispose: async () => {
              events.push(`dispose:${scopeCase.id}`);
              activeCase = null;
            },
          };
        },
        navigate: async (_page, scopeCase) => events.push(`navigate:${scopeCase.id}`),
      },
    );

    assert.equal(serverStarts, 1);
    assert.equal(browserLaunches, 1);
    assert.equal(result.verification.caseCount, 6);
    assert.deepEqual(
      result.verification.cases.map(({ caseId }) => caseId),
      [
        'schedule-vibespace',
        'terminal-vibespace',
        'settings-appearance-vibespace',
        'chat-default',
        'chat-jarvis',
        'chat-monochrome',
      ],
    );
    assert.equal(
      result.verification.cases.every(({ gateActive }) => gateActive === false),
      true,
    );
    for (const { caseId } of result.verification.cases) {
      const acquireIndex = events.indexOf(`acquire:${caseId}`);
      const disposeIndex = events.indexOf(`dispose:${caseId}`);
      assert.ok(acquireIndex >= 0 && disposeIndex > acquireIndex);
    }
    assert.deepEqual(events.slice(-2), ['browser:close', 'server:close']);
    assert.equal(activeCase, null);
    assert.equal(existsSync(join(root, '.artifacts/origami-chat/nonchat-001.receipt.json')), true);
  } finally {
    cleanRoot(root);
  }
});

test('nonchat mode preserves the primary failure before browser and server cleanup failures', async () => {
  const root = makeRoot();
  const primary = new Error('capture failed');
  const browserFailure = new Error('browser close failed');
  const serverFailure = new Error('server close failed');
  try {
    await assert.rejects(
      runLiveVerification(
        {
          mode: 'nonchat',
          rootDirectory: root,
          distDirectory: 'dist',
        },
        {
          startStaticServer: async () => ({
            baseUrl: 'http://127.0.0.1:4173',
            close: async () => {
              throw serverFailure;
            },
          }),
          launchResolvedBrowser: async () => ({
            browser: {
              close: async () => {
                throw browserFailure;
              },
            },
          }),
          runNonChatScopeCapture: async () => {
            throw primary;
          },
          acquirePage: async () => {
            throw new Error('unused acquirePage');
          },
          navigate: async () => {
            throw new Error('unused navigate');
          },
        },
      ),
      (error) => {
        assert.ok(error instanceof AggregateError);
        assert.deepEqual(error.errors, [primary, browserFailure, serverFailure]);
        return true;
      },
    );
  } finally {
    cleanRoot(root);
  }
});

test('real nonchat adapters use the locked context options and deterministic fixture helpers', async () => {
  const root = makeRoot();
  const calls = [];
  const page = {
    goto: async () => calls.push('goto'),
    locator: () => ({ waitFor: async () => calls.push('root-ready') }),
    reload: async () => calls.push('reload'),
  };
  try {
    await runLiveVerification(
      {
        mode: 'nonchat',
        runId: 'adapter-001',
        rootDirectory: root,
        distDirectory: 'dist',
      },
      {
        startStaticServer: async () => ({
          baseUrl: 'http://127.0.0.1:4173',
          close: async () => calls.push('server:close'),
        }),
        launchResolvedBrowser: async () => ({
          source: 'injected-browser',
          browser: {
            newContext: async (options) => {
              assert.deepEqual(options, {
                viewport: { width: 1672, height: 941 },
                deviceScaleFactor: 1,
                reducedMotion: 'reduce',
                colorScheme: 'light',
                locale: 'en-US',
                timezoneId: 'UTC',
              });
              calls.push('context');
              return {
                newPage: async () => page,
                close: async () => calls.push('context:close'),
              };
            },
            close: async () => calls.push('browser:close'),
          },
        }),
        persistenceContract: { injected: 'persistence' },
        themeContract: { storageKey: 'theme', storeVersion: 1, theme: 'vibespace' },
        validateFixturePersistence: () => calls.push('validate-fixture'),
        installDeterministicOllamaFixture: async () => calls.push('ollama-fixture'),
        installOrigamiLocalState: async (_page, theme) => calls.push(`local-state:${theme.theme}`),
        waitForJarvisDatabase: async () => calls.push('database-ready'),
        waitForInitialLocalSeed: async () => calls.push('initial-seed'),
        seedOrigamiIndexedDb: async () => calls.push('indexeddb-seed'),
        runNonChatScopeCapture: async (_options, adapters) => {
          const scopeCase = {
            id: 'chat-default',
            route: 'chat',
            themeId: 'default',
            documentTheme: 'dark',
          };
          const acquired = await adapters.acquirePage(scopeCase, {
            viewport: NONCHAT_VIEWPORT,
            contextOptions: CONTEXT_OPTIONS,
          });
          await adapters.navigate(acquired.page, scopeCase);
          await acquired.dispose();
          return { schemaVersion: 1, caseCount: 1, cases: [{ caseId: scopeCase.id }] };
        },
      },
    );

    assert.deepEqual(calls, [
      'validate-fixture',
      'context',
      'ollama-fixture',
      'local-state:default',
      'goto',
      'root-ready',
      'database-ready',
      'initial-seed',
      'indexeddb-seed',
      'reload',
      'context:close',
      'browser:close',
      'server:close',
    ]);
  } finally {
    cleanRoot(root);
  }
});

test('fails closed on remote URLs, outside artifacts, stale receipts, unknown arguments, and unknown modes', async () => {
  const root = makeRoot();
  let effects = 0;
  const dependencies = {
    captureOrigamiChat: async () => {
      effects += 1;
      return {};
    },
  };
  try {
    await assert.rejects(
      runLiveVerification(
        {
          mode: 'interaction',
          rootDirectory: root,
          distDirectory: 'dist',
          baseUrl: 'https://example.com',
        },
        dependencies,
      ),
      /loopback|local HTTP/i,
    );
    await assert.rejects(
      runLiveVerification(
        {
          mode: 'interaction',
          rootDirectory: root,
          distDirectory: 'dist',
          receiptPath: join(root, '..', 'outside.json'),
        },
        dependencies,
      ),
      /receiptPath.*inside/i,
    );
    mkdirSync(join(root, '.artifacts/origami-chat'), { recursive: true });
    writeFileSync(join(root, '.artifacts/origami-chat/stale.json'), '{}\n');
    await assert.rejects(
      runLiveVerification(
        {
          mode: 'interaction',
          rootDirectory: root,
          distDirectory: 'dist',
          receiptPath: '.artifacts/origami-chat/stale.json',
        },
        dependencies,
      ),
      /stale|exists/i,
    );
    await assert.rejects(
      runLiveVerification(
        { mode: 'surprise', rootDirectory: root, distDirectory: 'dist' },
        dependencies,
      ),
      /unknown.*mode/i,
    );
    assert.throws(
      () => parseLiveVerificationArguments(['--mode', 'interaction', '--mystery']),
      /unknown.*argument/i,
    );
    assert.equal(effects, 0);
  } finally {
    cleanRoot(root);
  }
});

test('atomic receipt writer refuses overwrite and leaves no temporary residue', () => {
  const root = makeRoot();
  try {
    const receiptPath = join(root, '.artifacts/origami-chat/receipt.json');
    writeAtomicJsonReceipt({
      rootDirectory: root,
      receiptPath,
      value: { schemaVersion: 1, ok: true },
    });
    assert.equal(readFileSync(receiptPath, 'utf8'), '{\n  "schemaVersion": 1,\n  "ok": true\n}\n');
    assert.throws(
      () =>
        writeAtomicJsonReceipt({
          rootDirectory: root,
          receiptPath,
          value: { schemaVersion: 1, ok: false },
        }),
      /exists|overwrite|stale/i,
    );
    assert.deepEqual(readdirSync(join(root, '.artifacts/origami-chat')), ['receipt.json']);
  } finally {
    cleanRoot(root);
  }
});

test('atomic receipt values reject nested undefined instead of silently dropping evidence', () => {
  const root = makeRoot();
  try {
    const receiptPath = join(root, '.artifacts/origami-chat/undefined.json');
    assert.throws(
      () =>
        writeAtomicJsonReceipt({
          rootDirectory: root,
          receiptPath,
          value: { schemaVersion: 1, evidence: { required: undefined } },
        }),
      /lossless|JSON-safe/i,
    );
    assert.equal(existsSync(receiptPath), false);
  } finally {
    cleanRoot(root);
  }
});

test('composed interaction receipts reject non-finite values instead of persisting changed evidence', async () => {
  const root = makeRoot();
  try {
    const receiptPath = join(root, '.artifacts/origami-chat/non-finite.json');
    await assert.rejects(
      runLiveVerification(
        {
          mode: 'interaction',
          rootDirectory: root,
          distDirectory: 'dist',
          receiptPath,
        },
        {
          runInteractionAudit: async () => ({
            schemaVersion: 1,
            evidence: { score: Number.NaN },
          }),
          captureOrigamiChat: async (options) => ({
            schemaVersion: 1,
            outputRelativePath: '.artifacts/origami-chat/final-chat.png',
            pageAudit: { executed: true, receipt: await options.pageAudit({}) },
          }),
        },
      ),
      /lossless|JSON-safe/i,
    );
    assert.equal(existsSync(receiptPath), false);
  } finally {
    cleanRoot(root);
  }
});

test('artifact validation rejects a linked directory that resolves outside the repository', (t) => {
  const root = makeRoot();
  const outside = makeRoot();
  try {
    mkdirSync(join(root, '.artifacts'), { recursive: true });
    try {
      symlinkSync(outside, join(root, '.artifacts/origami-chat'), 'junction');
    } catch {
      t.skip('directory link creation is not permitted on this platform');
      return;
    }
    assert.throws(
      () =>
        writeAtomicJsonReceipt({
          rootDirectory: root,
          receiptPath: '.artifacts/origami-chat/receipt.json',
          value: { schemaVersion: 1 },
        }),
      /symbolic link|regular directories|directory/i,
    );
    assert.equal(existsSync(join(outside, 'receipt.json')), false);
  } finally {
    cleanRoot(root);
    cleanRoot(outside);
  }
});
