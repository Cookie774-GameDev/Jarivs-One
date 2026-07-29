import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const MODULE_PATH = resolve(HERE, 'nonchat-scope-capture.mjs');

async function loadModule() {
  assert.equal(existsSync(MODULE_PATH), true, 'nonchat-scope-capture.mjs must exist');
  return import(`${pathToFileURL(MODULE_PATH).href}?test=${Date.now()}`);
}

function makeTempRoot() {
  return mkdtempSync(resolve(tmpdir(), 'vibespace-nonchat-scope-'));
}

function makeFakePage({ gate, writeScreenshot = true } = {}) {
  const calls = { waitForSelector: [], evaluate: 0, screenshot: [], closed: 0 };
  return {
    calls,
    async waitForSelector(selector, options) {
      calls.waitForSelector.push({ selector, options });
    },
    async evaluate() {
      calls.evaluate += 1;
      return typeof gate === 'function' ? gate() : gate;
    },
    async screenshot(options) {
      calls.screenshot.push(options);
      if (writeScreenshot) {
        writeFileSync(options.path, 'png-evidence');
      }
    },
    async close() {
      calls.closed += 1;
    },
  };
}

test('the canonical matrix covers every Task 8 unrelated route and non-VibeSpace Chat theme', async () => {
  const { buildNonChatScopeMatrix, NONCHAT_VIEWPORT } = await loadModule();
  const root = makeTempRoot();
  try {
    const cases = buildNonChatScopeMatrix({ rootDirectory: root });
    assert.equal(cases.length, 6);
    const byId = Object.fromEntries(cases.map((entry) => [entry.id, entry]));
    assert.deepEqual(
      cases.map((entry) => entry.id),
      [
        'schedule-vibespace',
        'terminal-vibespace',
        'settings-appearance-vibespace',
        'chat-default',
        'chat-jarvis',
        'chat-monochrome',
      ],
    );
    assert.equal(byId['schedule-vibespace'].route, 'schedule');
    assert.equal(byId['schedule-vibespace'].documentTheme, 'vibespace');
    assert.equal(byId['terminal-vibespace'].route, 'terminal');
    assert.equal(byId['terminal-vibespace'].documentTheme, 'vibespace');
    assert.equal(byId['settings-appearance-vibespace'].route, 'settings-appearance');
    assert.equal(byId['settings-appearance-vibespace'].documentTheme, 'vibespace');
    assert.equal(byId['chat-default'].route, 'chat');
    assert.equal(byId['chat-default'].documentTheme, 'dark');
    assert.equal(byId['chat-jarvis'].documentTheme, 'jarvis');
    assert.equal(byId['chat-monochrome'].documentTheme, 'monochrome');
    for (const entry of cases) {
      assert.equal(entry.gateActive, false, entry.id);
      assert.equal(entry.viewport, NONCHAT_VIEWPORT);
      assert.ok(entry.readiness.selector.length > 0, entry.id);
      assert.ok(entry.outputPath.endsWith('.png'), entry.id);
      assert.ok(entry.outputPath.startsWith(resolve(root, '.artifacts')), entry.id);
    }
    assert.equal(
      byId['schedule-vibespace'].readiness.selector,
      'h1:has-text("Events, timed tasks, and AI plans")',
    );
    assert.equal(byId['terminal-vibespace'].readiness.selector, '[data-terminal-route-cache]');
    assert.equal(
      byId['settings-appearance-vibespace'].readiness.selector,
      '[role="radiogroup"][aria-label="App theme"]',
    );
    assert.equal(byId['chat-default'].readiness.selector, '[data-vibespace-page="chat"]');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('base URL validation accepts only loopback HTTP and rejects remote URLs', async () => {
  const { isLocalBaseUrl } = await loadModule();
  assert.equal(isLocalBaseUrl('http://127.0.0.1:4173'), true);
  assert.equal(isLocalBaseUrl('http://localhost:5173'), true);
  assert.equal(isLocalBaseUrl('http://[::1]:4173'), true);
  assert.equal(isLocalBaseUrl('https://127.0.0.1:4173'), false);
  assert.equal(isLocalBaseUrl('http://example.com'), false);
  assert.equal(isLocalBaseUrl('http://192.168.0.10:4173'), false);
  assert.equal(isLocalBaseUrl('http://user:secret@127.0.0.1:4173'), false);
  assert.equal(isLocalBaseUrl('ftp://127.0.0.1'), false);
  assert.equal(isLocalBaseUrl('not a url'), false);
  assert.equal(isLocalBaseUrl(undefined), false);
});

test('case validation rejects missing readiness, unknown routes, and unknown themes', async () => {
  const { assertNonChatScopeCase } = await loadModule();
  const root = makeTempRoot();
  try {
    const base = {
      id: 'schedule-vibespace',
      route: 'schedule',
      themeId: 'vibespace',
      readiness: { selector: '[aria-label="Previous month"]' },
      outputPath: '.artifacts/origami-nonchat-scope/schedule-vibespace.png',
    };
    assert.ok(assertNonChatScopeCase(base, { rootDirectory: root }).gateActive === false);

    assert.throws(
      () =>
        assertNonChatScopeCase(
          { ...base, readiness: { selector: '   ' } },
          { rootDirectory: root },
        ),
      (error) => error.code === 'READINESS_MISSING',
    );
    assert.throws(
      () => assertNonChatScopeCase({ ...base, readiness: undefined }, { rootDirectory: root }),
      (error) => error.code === 'READINESS_MISSING',
    );
    assert.throws(
      () => assertNonChatScopeCase({ ...base, route: 'kanban' }, { rootDirectory: root }),
      (error) => error.code === 'ROUTE_UNKNOWN',
    );
    assert.throws(
      () => assertNonChatScopeCase({ ...base, themeId: 'solarized' }, { rootDirectory: root }),
      (error) => error.code === 'THEME_UNKNOWN',
    );
    assert.throws(
      () =>
        assertNonChatScopeCase(
          { ...base, themeId: 'vibespace', documentTheme: 'dark' },
          { rootDirectory: root },
        ),
      (error) => error.code === 'THEME_MISMATCH',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('case validation rejects any case that could activate the Chat gate', async () => {
  const { assertNonChatScopeCase } = await loadModule();
  const root = makeTempRoot();
  try {
    assert.throws(
      () =>
        assertNonChatScopeCase(
          {
            id: 'chat-vibespace',
            route: 'chat',
            themeId: 'vibespace',
            readiness: { selector: '[data-vibespace-page="chat"]' },
            outputPath: '.artifacts/origami-nonchat-scope/chat-vibespace.png',
          },
          { rootDirectory: root },
        ),
      (error) => error.code === 'CASE_ACTIVATES_CHAT_GATE',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('case validation rejects unsafe output paths and remote base URLs', async () => {
  const { assertNonChatScopeCase } = await loadModule();
  const root = makeTempRoot();
  try {
    const base = {
      id: 'terminal-vibespace',
      route: 'terminal',
      themeId: 'vibespace',
      readiness: { selector: '[data-terminal-route-cache]' },
    };
    const unsafeOutputs = [
      '../escape.png',
      '.artifacts/other-slice/terminal.png',
      '.artifacts/origami-nonchat-scope/terminal.jpg',
      'app/src/terminal.png',
    ];
    for (const outputPath of unsafeOutputs) {
      assert.throws(
        () => assertNonChatScopeCase({ ...base, outputPath }, { rootDirectory: root }),
        (error) => error.code === 'OUTPUT_PATH_UNSAFE',
        outputPath,
      );
    }
    assert.throws(
      () =>
        assertNonChatScopeCase(
          {
            ...base,
            outputPath: '.artifacts/origami-nonchat-scope/terminal.png',
            baseUrl: 'https://example.com',
          },
          { rootDirectory: root },
        ),
      (error) => error.code === 'BASE_URL_NOT_LOCAL',
    );
    assert.throws(
      () =>
        assertNonChatScopeCase(
          {
            ...base,
            outputPath: '.artifacts/origami-nonchat-scope/terminal.png',
            baseUrl: 'http://10.0.0.5:4173',
          },
          { rootDirectory: root },
        ),
      (error) => error.code === 'BASE_URL_NOT_LOCAL',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('matrix validation rejects empty matrices and duplicate cases', async () => {
  const { assertNonChatScopeMatrix } = await loadModule();
  const root = makeTempRoot();
  try {
    assert.throws(
      () => assertNonChatScopeMatrix([], { rootDirectory: root }),
      (error) => error.code === 'MATRIX_EMPTY',
    );
    const validCase = {
      id: 'schedule-vibespace',
      route: 'schedule',
      themeId: 'vibespace',
      readiness: { selector: '[aria-label="Previous month"]' },
      outputPath: '.artifacts/origami-nonchat-scope/schedule-vibespace.png',
    };
    assert.throws(
      () => assertNonChatScopeMatrix([validCase, { ...validCase }], { rootDirectory: root }),
      (error) => error.code === 'DUPLICATE_CASE_ID',
    );
    assert.throws(
      () =>
        assertNonChatScopeMatrix(
          [
            validCase,
            {
              ...validCase,
              id: 'schedule-vibespace-copy',
              outputPath: '.artifacts/origami-nonchat-scope/schedule-copy.png',
            },
          ],
          { rootDirectory: root },
        ),
      (error) => error.code === 'DUPLICATE_CASE',
    );
    assert.throws(
      () =>
        assertNonChatScopeMatrix(
          [
            validCase,
            {
              ...validCase,
              id: 'terminal-vibespace',
              route: 'terminal',
              readiness: { selector: '[data-terminal-route-cache]' },
              outputPath: '.artifacts/origami-nonchat-scope/schedule-vibespace.png',
            },
          ],
          { rootDirectory: root },
        ),
      (error) => error.code === 'DUPLICATE_OUTPUT',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('matrix validation refuses to overwrite stale output files', async () => {
  const { buildNonChatScopeMatrix, assertNonChatScopeMatrix } = await loadModule();
  const root = makeTempRoot();
  try {
    const staleDir = resolve(root, '.artifacts', 'origami-nonchat-scope');
    mkdirSync(staleDir, { recursive: true });
    writeFileSync(resolve(staleDir, 'schedule-vibespace.png'), 'stale');
    const cases = buildNonChatScopeMatrix({ rootDirectory: root });
    assert.throws(
      () => assertNonChatScopeMatrix(cases, { rootDirectory: root }),
      (error) => error.code === 'OUTPUT_EXISTS',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('matrix validation refuses stale per-case receipts before capture', async () => {
  const { buildNonChatScopeMatrix, assertNonChatScopeMatrix } = await loadModule();
  const root = makeTempRoot();
  try {
    const staleDir = resolve(root, '.artifacts', 'origami-nonchat-scope');
    mkdirSync(staleDir, { recursive: true });
    writeFileSync(resolve(staleDir, 'schedule-vibespace.receipt.json'), 'stale');
    assert.throws(
      () =>
        assertNonChatScopeMatrix(buildNonChatScopeMatrix({ rootDirectory: root }), {
          rootDirectory: root,
        }),
      (error) => error.code === 'RECEIPT_EXISTS',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('planning rejects artifact roots outside the repository root', async () => {
  const { planNonChatScopeCapture } = await loadModule();
  const root = makeTempRoot();
  try {
    const plan = planNonChatScopeCapture({
      rootDirectory: root,
      artifactRoot: resolve(root, '..', 'escaped-evidence'),
    });
    assert.equal(plan.ok, false);
    assert.equal(plan.code, 'ARTIFACT_ROOT_UNSAFE');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('execution captures every case through injected dependencies without a browser', async () => {
  const { runNonChatScopeCapture, NONCHAT_VIEWPORT } = await loadModule();
  const root = makeTempRoot();
  try {
    const acquired = [];
    const navigated = [];
    const dependencies = {
      acquirePage: async (scopeCase, context) => {
        const page = makeFakePage({
          gate: {
            documentTheme: scopeCase.documentTheme,
            chatPagePresent: scopeCase.route === 'chat',
            gateActive: false,
          },
        });
        acquired.push({ id: scopeCase.id, context });
        return { page, dispose: () => page.close() };
      },
      navigate: async (page, scopeCase, context) => {
        navigated.push({ id: scopeCase.id, baseUrl: context.baseUrl });
      },
    };
    const receipt = await runNonChatScopeCapture(
      { rootDirectory: root, baseUrl: 'http://127.0.0.1:4173' },
      dependencies,
    );
    assert.equal(receipt.caseCount, 6);
    assert.deepEqual(
      receipt.cases.map((entry) => entry.caseId),
      [
        'schedule-vibespace',
        'terminal-vibespace',
        'settings-appearance-vibespace',
        'chat-default',
        'chat-jarvis',
        'chat-monochrome',
      ],
    );
    for (const entry of receipt.cases) {
      assert.equal(entry.captured, true);
      assert.equal(entry.gateActive, false);
      const receiptPath = resolve(root, entry.receiptRelativePath);
      assert.equal(existsSync(receiptPath), true, entry.caseId);
      const perCase = JSON.parse(readFileSync(receiptPath, 'utf8'));
      assert.equal(perCase.caseId, entry.caseId);
      assert.equal(perCase.gate.gateActive, false);
      assert.deepEqual(perCase.viewport, NONCHAT_VIEWPORT);
    }
    assert.equal(acquired.length, 6);
    assert.equal(navigated.length, 6);
    assert.ok(navigated.every((entry) => entry.baseUrl === 'http://127.0.0.1:4173'));
    for (const { context } of acquired) {
      assert.deepEqual(context.viewport, NONCHAT_VIEWPORT);
      assert.equal(context.contextOptions.reducedMotion, 'reduce');
      assert.equal(context.contextOptions.timezoneId, 'UTC');
    }
    assert.equal(receipt.determinism.fixedSleeps, false);
    assert.equal(receipt.determinism.remoteNavigation, false);
    assert.equal(receipt.determinism.browserLaunchInModule, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('execution disposes each case before acquiring the next case', async () => {
  const { runNonChatScopeCapture } = await loadModule();
  const root = makeTempRoot();
  const events = [];
  let previousDisposed = true;
  try {
    const receipt = await runNonChatScopeCapture(
      { rootDirectory: root, baseUrl: 'http://127.0.0.1:4173' },
      {
        acquirePage: async (scopeCase) => {
          assert.equal(previousDisposed, true, `previous case leaked before ${scopeCase.id}`);
          previousDisposed = false;
          events.push(`acquire:${scopeCase.id}`);
          const page = makeFakePage({
            gate: {
              documentTheme: scopeCase.documentTheme,
              chatPagePresent: scopeCase.route === 'chat',
              gateActive: false,
            },
          });
          return {
            page,
            dispose: async () => {
              events.push(`dispose:${scopeCase.id}`);
              previousDisposed = true;
            },
          };
        },
        navigate: async () => {},
      },
    );
    assert.equal(receipt.caseCount, 6);
    assert.deepEqual(events.slice(0, 4), [
      'acquire:schedule-vibespace',
      'dispose:schedule-vibespace',
      'acquire:terminal-vibespace',
      'dispose:terminal-vibespace',
    ]);
    assert.equal(previousDisposed, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('execution stops after a per-case dispose failure', async () => {
  const { runNonChatScopeCapture } = await loadModule();
  const root = makeTempRoot();
  let acquired = 0;
  try {
    await assert.rejects(
      () =>
        runNonChatScopeCapture(
          { rootDirectory: root, baseUrl: 'http://127.0.0.1:4173' },
          {
            acquirePage: async (scopeCase) => {
              acquired += 1;
              const page = makeFakePage({
                gate: {
                  documentTheme: scopeCase.documentTheme,
                  chatPagePresent: false,
                  gateActive: false,
                },
              });
              return {
                page,
                dispose: async () => {
                  throw new Error('case dispose failed');
                },
              };
            },
            navigate: async () => {},
          },
        ),
      (error) => {
        assert.ok(error instanceof AggregateError);
        assert.deepEqual(
          error.errors.map((entry) => entry.message),
          ['case dispose failed'],
        );
        return true;
      },
    );
    assert.equal(acquired, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('receipts bind every screenshot to its lowercase SHA-256', async () => {
  const { runNonChatScopeCapture } = await loadModule();
  const root = makeTempRoot();
  const expectedSha256 = 'b64fc4974ea6b1adde7e067f446281709fb1677b7bcd1e70b2e580ac7dcc7cf9';
  try {
    const receipt = await runNonChatScopeCapture(
      { rootDirectory: root, baseUrl: 'http://127.0.0.1:4173' },
      {
        acquirePage: async (scopeCase) => {
          const page = makeFakePage({
            gate: {
              documentTheme: scopeCase.documentTheme,
              chatPagePresent: scopeCase.route === 'chat',
              gateActive: false,
            },
          });
          return { page, dispose: () => page.close() };
        },
        navigate: async () => {},
      },
    );
    for (const summaryCase of receipt.cases) {
      assert.equal(summaryCase.sha256, expectedSha256);
      assert.match(summaryCase.sha256, /^[a-f0-9]{64}$/u);
      const perCase = JSON.parse(
        readFileSync(resolve(root, summaryCase.receiptRelativePath), 'utf8'),
      );
      assert.equal(perCase.sha256, expectedSha256);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('execution rejects malformed or theme-mismatched gate probes before screenshot', async () => {
  const { runNonChatScopeCapture } = await loadModule();
  const probes = [
    undefined,
    { documentTheme: 'dark', chatPagePresent: false, gateActive: false },
    { documentTheme: 'vibespace', chatPagePresent: true, gateActive: false },
  ];
  for (const gate of probes) {
    const root = makeTempRoot();
    let page;
    try {
      await assert.rejects(
        () =>
          runNonChatScopeCapture(
            { rootDirectory: root, baseUrl: 'http://127.0.0.1:4173' },
            {
              acquirePage: async (scopeCase) => {
                page = makeFakePage({ gate });
                return { page, dispose: () => page.close() };
              },
              navigate: async () => {},
            },
          ),
        (error) =>
          error instanceof AggregateError &&
          ['GATE_PROBE_INVALID', 'THEME_RUNTIME_MISMATCH', 'GATE_PROBE_MISMATCH'].includes(
            error.errors[0]?.code,
          ),
      );
      assert.equal(page.calls.screenshot.length, 0);
      assert.equal(page.calls.closed, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('execution rejects a screenshot dependency that produces no evidence file', async () => {
  const { runNonChatScopeCapture } = await loadModule();
  const root = makeTempRoot();
  try {
    await assert.rejects(
      () =>
        runNonChatScopeCapture(
          { rootDirectory: root, baseUrl: 'http://127.0.0.1:4173' },
          {
            acquirePage: async (scopeCase) => {
              const page = makeFakePage({
                gate: {
                  documentTheme: scopeCase.documentTheme,
                  chatPagePresent: scopeCase.route === 'chat',
                  gateActive: false,
                },
                writeScreenshot: false,
              });
              return { page, dispose: () => page.close() };
            },
            navigate: async () => {},
          },
        ),
      (error) => error instanceof AggregateError && error.errors[0]?.code === 'SCREENSHOT_MISSING',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('execution refuses an acquired page without an explicit disposer', async () => {
  const { runNonChatScopeCapture } = await loadModule();
  const root = makeTempRoot();
  let page;
  try {
    await assert.rejects(
      () =>
        runNonChatScopeCapture(
          { rootDirectory: root, baseUrl: 'http://127.0.0.1:4173' },
          {
            acquirePage: async (scopeCase) => {
              page = makeFakePage({
                gate: {
                  documentTheme: scopeCase.documentTheme,
                  chatPagePresent: false,
                  gateActive: false,
                },
              });
              return { page };
            },
            navigate: async () => {},
          },
        ),
      (error) => error instanceof AggregateError && error.errors[0]?.code === 'DEPENDENCY_MISSING',
    );
    assert.equal(page.calls.screenshot.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('execution rejects unsafe run ids and stale summary receipts before acquiring a page', async () => {
  const { runNonChatScopeCapture } = await loadModule();
  const root = makeTempRoot();
  let acquired = 0;
  const dependencies = {
    acquirePage: async () => {
      acquired += 1;
      throw new Error('must not acquire');
    },
    navigate: async () => {},
  };
  try {
    await assert.rejects(
      () =>
        runNonChatScopeCapture(
          {
            rootDirectory: root,
            baseUrl: 'http://127.0.0.1:4173',
            runId: '../../escape',
          },
          dependencies,
        ),
      (error) => error.code === 'RUN_ID',
    );
    const artifactRoot = resolve(root, '.artifacts', 'origami-nonchat-scope');
    mkdirSync(artifactRoot, { recursive: true });
    writeFileSync(resolve(artifactRoot, 'existing.receipt.json'), 'stale');
    await assert.rejects(
      () =>
        runNonChatScopeCapture(
          {
            rootDirectory: root,
            baseUrl: 'http://127.0.0.1:4173',
            runId: 'existing',
          },
          dependencies,
        ),
      (error) => error.code === 'SUMMARY_EXISTS',
    );
    assert.equal(acquired, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('execution refuses capture when a case activates the Chat gate at runtime', async () => {
  const { runNonChatScopeCapture } = await loadModule();
  const root = makeTempRoot();
  try {
    let disposed = 0;
    const dependencies = {
      acquirePage: async () => {
        const page = makeFakePage({
          gate: { documentTheme: 'vibespace', chatPagePresent: true, gateActive: true },
        });
        return {
          page,
          dispose: async () => {
            disposed += 1;
          },
        };
      },
      navigate: async () => {},
    };
    await assert.rejects(
      () =>
        runNonChatScopeCapture(
          { rootDirectory: root, baseUrl: 'http://127.0.0.1:4173' },
          dependencies,
        ),
      (error) => {
        assert.ok(error instanceof AggregateError);
        assert.match(error.errors[0].message, /Chat gate/iu);
        assert.equal(error.errors[0].code, 'CASE_ACTIVATES_CHAT_GATE');
        return true;
      },
    );
    assert.equal(disposed, 1, 'acquired resources are still cleaned up after refusal');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('cleanup preserves the primary error and disposer order in an AggregateError', async () => {
  const { closeNonChatResources } = await loadModule();
  const calls = [];
  const disposers = ['page', 'context', 'browser', 'server'].map((name) => ({
    name,
    close: async () => {
      calls.push(name);
      throw new Error(`${name} close failed`);
    },
  }));
  await assert.rejects(
    () => closeNonChatResources(disposers, new Error('capture failed')),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, /capture and cleanup failed/iu);
      assert.deepEqual(
        error.errors.map((entry) => entry.message),
        [
          'capture failed',
          'page close failed',
          'context close failed',
          'browser close failed',
          'server close failed',
        ],
      );
      return true;
    },
  );
  assert.deepEqual(calls, ['page', 'context', 'browser', 'server']);
});

test('the implementation source is deterministic and never launches a browser', async () => {
  await loadModule();
  const source = readFileSync(MODULE_PATH, 'utf8');
  assert.doesNotMatch(source, /setTimeout\s*\(/u);
  assert.doesNotMatch(source, /waitForTimeout/u);
  assert.doesNotMatch(source, /https?:\/\/(?!127\.0\.0\.1|localhost|\[::1\]|::1)/u);
  assert.doesNotMatch(
    source,
    /playwright-core|browser-launch|chromium\.launch|launchResolvedBrowser/u,
  );
  assert.match(source, /\[data-vibespace-page="chat"\]/u);
  assert.match(source, /\[data-terminal-route-cache\]/u);
  assert.match(source, /Events, timed tasks, and AI plans/u);
  assert.match(source, /data-theme/u);
});

test('the browser-free plan helper returns the validated matrix', async () => {
  const { planNonChatScopeCapture } = await loadModule();
  const root = makeTempRoot();
  try {
    const plan = planNonChatScopeCapture({ rootDirectory: root });
    assert.equal(plan.ok, true);
    assert.equal(plan.caseCount, 6);
    assert.deepEqual(
      plan.cases.map((entry) => entry.id),
      [
        'schedule-vibespace',
        'terminal-vibespace',
        'settings-appearance-vibespace',
        'chat-default',
        'chat-jarvis',
        'chat-monochrome',
      ],
    );
    assert.match(plan.chatGateScope, /data-vibespace-page='chat'/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
