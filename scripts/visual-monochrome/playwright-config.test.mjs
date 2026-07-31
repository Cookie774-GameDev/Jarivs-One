import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const CONFIG_PATH = path.join(REPO_ROOT, 'playwright.monochrome.config.ts');
const WEBKIT_SPEC_PATH = path.join(REPO_ROOT, 'tests/visual/monochrome/monochrome.webkit.spec.ts');
const require = createRequire(import.meta.url);
const { transform } = require('playwright/lib/common');
const IDENTITY_ENVIRONMENT_NAMES = [
  'MONOCHROME_PORT',
  'MONOCHROME_B0_PORT',
  'MONOCHROME_RUN_NAMESPACE',
  'VITE_VIBESPACE_RUNTIME_PROFILE',
  'VITE_VIBESPACE_MONOCHROME_APP_IDENTIFIER',
  'VITE_VIBESPACE_MONOCHROME_CAPABILITY_IDENTIFIER',
  'VITE_VIBESPACE_MONOCHROME_SESSION_NONCE_HASH',
];
const DEFAULT_NONCE_HASH = '58eca8fac5471caab5fc17f4a52c4971eb87a139e7f3fe4edc5eea8c1e55eaf5';

async function loadConfig(environment = {}) {
  const previous = new Map(IDENTITY_ENVIRONMENT_NAMES.map((name) => [name, process.env[name]]));
  try {
    for (const name of IDENTITY_ENVIRONMENT_NAMES) delete process.env[name];
    Object.assign(process.env, environment);
    delete require.cache[CONFIG_PATH];
    return (await transform.requireOrImport(CONFIG_PATH)).default;
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test('MonoChrome config owns isolated visual and ordinary B0 Vite servers', async () => {
  const config = await loadConfig();
  const webServers = config.webServer;

  assert.ok(Array.isArray(webServers), 'missing dual webServer boundary');
  assert.equal(webServers.length, 2);
  const [visualServer, b0Server] = webServers;
  assert.equal(config.use.baseURL, 'http://127.0.0.1:4173');
  assert.equal(visualServer.url, config.use.baseURL);
  assert.equal(b0Server.url, 'http://127.0.0.1:4174');
  for (const webServer of webServers) {
    assert.equal(webServer.cwd, 'app');
    assert.equal(webServer.reuseExistingServer, false);
    assert.equal(webServer.timeout, 30_000);
    assert.equal(/\b(?:npx|npm|pnpm|yarn)\b/iu.test(webServer.command), false);
  }
  assert.equal(
    visualServer.command,
    `"${process.execPath}" "node_modules/vite/bin/vite.js" --host 127.0.0.1 --port 4173 --strictPort`,
  );
  assert.equal(
    b0Server.command,
    `"${process.execPath}" "node_modules/vite/bin/vite.js" --host 127.0.0.1 --port 4174 --strictPort`,
  );

  const viteEntrypoint = path.resolve(REPO_ROOT, visualServer.cwd, 'node_modules/vite/bin/vite.js');
  assert.equal(viteEntrypoint, path.join(REPO_ROOT, 'app/node_modules/vite/bin/vite.js'));
  assert.equal(existsSync(viteEntrypoint), true, 'repository-local Vite entrypoint is absent');
  assert.equal(visualServer.env.VITE_VIBESPACE_RUNTIME_PROFILE, 'monochrome-visual-test');
  assert.equal(
    visualServer.env.VITE_VIBESPACE_MONOCHROME_APP_IDENTIFIER,
    'ai.vibespace.monochrome.test0000000000000001',
  );
  assert.equal(visualServer.env.VITE_VIBESPACE_MONOCHROME_CAPABILITY_IDENTIFIER, 'monochrome-test');
  assert.equal(visualServer.env.VITE_VIBESPACE_MONOCHROME_SESSION_NONCE_HASH, DEFAULT_NONCE_HASH);
  assert.equal(
    visualServer.env.VIBESPACE_VITE_CACHE_DIR,
    path.join(REPO_ROOT, '.artifacts/monochrome/vite-cache/visual'),
  );
  for (const name of IDENTITY_ENVIRONMENT_NAMES.filter((name) => name.startsWith('VITE_'))) {
    assert.equal(Object.hasOwn(b0Server.env, name), true);
    assert.equal(b0Server.env[name], undefined);
  }
  assert.equal(
    b0Server.env.VIBESPACE_VITE_CACHE_DIR,
    path.join(REPO_ROOT, '.artifacts/monochrome/vite-cache/b0'),
  );
  assert.notEqual(visualServer.env.VIBESPACE_VITE_CACHE_DIR, b0Server.env.VIBESPACE_VITE_CACHE_DIR);
  assert.equal(config.outputDir, '.artifacts/monochrome/test-results');
  assert.deepEqual(config.reporter, [
    ['list'],
    ['json', { outputFile: '.artifacts/monochrome/report.json' }],
  ]);
  assert.equal(
    config.snapshotPathTemplate,
    'tests/visual/monochrome/baselines/mc9/{projectName}/{testFilePath}/{arg}{ext}',
  );

  assert.deepEqual(
    config.projects.map(({ name }) => name),
    [
      'monochrome-visual',
      'monochrome-other-themes',
      'monochrome-a11y',
      'monochrome-behavior',
      'monochrome-webkit-preview',
    ],
  );
  assert.equal(config.use.channel, undefined);
  for (const project of config.projects.slice(0, 4)) {
    assert.equal(project.use?.browserName, undefined);
    assert.equal(project.use?.channel, 'msedge');
  }
  const webkitProject = config.projects[4];
  assert.equal(String(webkitProject.testMatch), '/monochrome\\.webkit\\.spec\\.ts/');
  assert.equal(webkitProject.use.browserName, 'webkit');
  assert.equal(webkitProject.use.channel, undefined);
  assert.deepEqual(webkitProject.use.viewport, { width: 1672, height: 941 });
  assert.deepEqual(webkitProject.use.launchOptions, { args: [] });
  assert.equal(config.use.headless, true);
  assert.equal(config.workers, 1);
});

test('validated run namespaces isolate every mutable Playwright and Vite artifact path', async () => {
  const firstConfig = await loadConfig({ MONOCHROME_RUN_NAMESPACE: 'task346-first' });
  const secondConfig = await loadConfig({ MONOCHROME_RUN_NAMESPACE: 'task346_second' });

  const firstRelativeRoot = '.artifacts/monochrome/runs/task346-first';
  const secondRelativeRoot = '.artifacts/monochrome/runs/task346_second';
  const firstRoot = path.join(REPO_ROOT, firstRelativeRoot);
  const secondRoot = path.join(REPO_ROOT, secondRelativeRoot);
  const expectedPaths = (config, root, relativeRoot) => ({
    visualCache: config.webServer[0].env.VIBESPACE_VITE_CACHE_DIR,
    b0Cache: config.webServer[1].env.VIBESPACE_VITE_CACHE_DIR,
    outputDir: config.outputDir,
    report: config.reporter[1][1].outputFile,
    expected: {
      visualCache: path.join(root, 'vite-cache/visual'),
      b0Cache: path.join(root, 'vite-cache/b0'),
      outputDir: `${relativeRoot}/test-results`,
      report: `${relativeRoot}/report.json`,
    },
  });

  const firstPaths = expectedPaths(firstConfig, firstRoot, firstRelativeRoot);
  const secondPaths = expectedPaths(secondConfig, secondRoot, secondRelativeRoot);
  assert.deepEqual(
    {
      visualCache: firstPaths.visualCache,
      b0Cache: firstPaths.b0Cache,
      outputDir: firstPaths.outputDir,
      report: firstPaths.report,
    },
    firstPaths.expected,
  );
  assert.deepEqual(
    {
      visualCache: secondPaths.visualCache,
      b0Cache: secondPaths.b0Cache,
      outputDir: secondPaths.outputDir,
      report: secondPaths.report,
    },
    secondPaths.expected,
  );
  for (const pathName of ['visualCache', 'b0Cache', 'outputDir', 'report']) {
    assert.notEqual(firstPaths[pathName], secondPaths[pathName]);
    assert.equal(
      path.resolve(REPO_ROOT, firstPaths[pathName]).startsWith(`${firstRoot}${path.sep}`),
      true,
    );
    assert.equal(
      path.resolve(REPO_ROOT, secondPaths[pathName]).startsWith(`${secondRoot}${path.sep}`),
      true,
    );
  }
  assert.equal(firstConfig.snapshotPathTemplate, secondConfig.snapshotPathTemplate);

  const defaultConfigAfterNamespacedLoads = await loadConfig();
  assert.equal(
    defaultConfigAfterNamespacedLoads.webServer[0].env.VIBESPACE_VITE_CACHE_DIR,
    path.join(REPO_ROOT, '.artifacts/monochrome/vite-cache/visual'),
  );
  assert.equal(
    defaultConfigAfterNamespacedLoads.webServer[1].env.VIBESPACE_VITE_CACHE_DIR,
    path.join(REPO_ROOT, '.artifacts/monochrome/vite-cache/b0'),
  );
  assert.equal(defaultConfigAfterNamespacedLoads.outputDir, '.artifacts/monochrome/test-results');
  assert.equal(
    defaultConfigAfterNamespacedLoads.reporter[1][1].outputFile,
    '.artifacts/monochrome/report.json',
  );
});

test('unsafe run namespaces fail closed before deriving artifact paths', async (context) => {
  const invalidNamespaces = [
    '',
    '.',
    '..',
    '../escape',
    'nested/run',
    String.raw`nested\run`,
    '/absolute',
    String.raw`C:\absolute`,
    'space separated',
    'shell&command',
    'shell;command',
    'shell|command',
    'dollar$command',
    'dot.segment',
    'case-Ambiguous',
    'con',
    'prn',
    'aux',
    'nul',
    'com1',
    'lpt9',
    '-leading',
    'trailing-',
    'a'.repeat(65),
  ];

  for (const namespace of invalidNamespaces) {
    await context.test(JSON.stringify(namespace), async () => {
      await assert.rejects(
        loadConfig({ MONOCHROME_RUN_NAMESPACE: namespace }),
        /MONOCHROME_RUN_NAMESPACE/u,
      );
    });
  }
});

test('Playwright discovers the complete MonoChrome suite through the repository module boundary', () => {
  const cliPath = path.join(REPO_ROOT, 'node_modules/@playwright/test/cli.js');
  const jsonReportPath = path.join(REPO_ROOT, '.artifacts/monochrome/report.json');
  assert.equal(existsSync(cliPath), true, 'repository-local Playwright CLI is absent');
  assert.equal(existsSync(WEBKIT_SPEC_PATH), true, 'WebKit preview spec is absent');
  const reportBefore = existsSync(jsonReportPath)
    ? {
        exists: true,
        mtimeMs: statSync(jsonReportPath).mtimeMs,
        size: statSync(jsonReportPath).size,
      }
    : { exists: false };

  const result = spawnSync(
    process.execPath,
    [cliPath, 'test', '--config', 'playwright.monochrome.config.ts', '--list', '--reporter=list'],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      windowsHide: true,
    },
  );

  assert.equal(
    result.status,
    0,
    `Playwright discovery failed:\n${result.stdout}\n${result.stderr}`,
  );
  assert.match(result.stdout, /Total: 227 tests in 5 files/u);
  assert.equal(result.stderr, '');
  const reportAfter = existsSync(jsonReportPath)
    ? {
        exists: true,
        mtimeMs: statSync(jsonReportPath).mtimeMs,
        size: statSync(jsonReportPath).size,
      }
    : { exists: false };
  assert.deepEqual(reportAfter, reportBefore);
});

test('valid caller identity and port values override deterministic defaults without command injection', async () => {
  const nonceHash = 'a'.repeat(64);
  const config = await loadConfig({
    MONOCHROME_PORT: '43210',
    MONOCHROME_B0_PORT: '43212',
    VITE_VIBESPACE_RUNTIME_PROFILE: 'monochrome-visual-test',
    VITE_VIBESPACE_MONOCHROME_APP_IDENTIFIER: 'ai.vibespace.monochrome.testdeadbeef',
    VITE_VIBESPACE_MONOCHROME_CAPABILITY_IDENTIFIER: 'monochrome-test',
    VITE_VIBESPACE_MONOCHROME_SESSION_NONCE_HASH: nonceHash,
  });

  assert.equal(config.use.baseURL, 'http://127.0.0.1:43210');
  assert.ok(Array.isArray(config.webServer));
  const [visualServer, b0Server] = config.webServer;
  assert.equal(visualServer.url, config.use.baseURL);
  assert.equal(b0Server.url, 'http://127.0.0.1:43212');
  assert.equal(
    visualServer.command,
    `"${process.execPath}" "node_modules/vite/bin/vite.js" --host 127.0.0.1 --port 43210 --strictPort`,
  );
  assert.equal(
    b0Server.command,
    `"${process.execPath}" "node_modules/vite/bin/vite.js" --host 127.0.0.1 --port 43212 --strictPort`,
  );
  assert.equal(visualServer.env.VITE_VIBESPACE_RUNTIME_PROFILE, 'monochrome-visual-test');
  assert.equal(
    visualServer.env.VITE_VIBESPACE_MONOCHROME_APP_IDENTIFIER,
    'ai.vibespace.monochrome.testdeadbeef',
  );
  assert.equal(visualServer.env.VITE_VIBESPACE_MONOCHROME_CAPABILITY_IDENTIFIER, 'monochrome-test');
  assert.equal(visualServer.env.VITE_VIBESPACE_MONOCHROME_SESSION_NONCE_HASH, nonceHash);
  for (const value of Object.values(visualServer.env).filter(
    (value) => typeof value === 'string',
  )) {
    assert.equal(visualServer.command.includes(value), false);
  }
});

test('invalid port and visual identity environment values fail closed', async (context) => {
  const invalidCases = [
    ['port below unprivileged range', { MONOCHROME_PORT: '1023' }, /MONOCHROME_PORT/u],
    ['port above TCP range', { MONOCHROME_PORT: '65536' }, /MONOCHROME_PORT/u],
    ['port command injection', { MONOCHROME_PORT: '4173 & whoami' }, /MONOCHROME_PORT/u],
    ['B0 port below unprivileged range', { MONOCHROME_B0_PORT: '1023' }, /MONOCHROME_B0_PORT/u],
    ['B0 port above TCP range', { MONOCHROME_B0_PORT: '65536' }, /MONOCHROME_B0_PORT/u],
    ['B0 port command injection', { MONOCHROME_B0_PORT: '4174 & whoami' }, /MONOCHROME_B0_PORT/u],
    ['duplicate visual and B0 ports', { MONOCHROME_B0_PORT: '4173' }, /distinct/u],
    [
      'ordinary runtime profile',
      { VITE_VIBESPACE_RUNTIME_PROFILE: 'ordinary' },
      /VITE_VIBESPACE_RUNTIME_PROFILE/u,
    ],
    [
      'app identifier without suffix',
      { VITE_VIBESPACE_MONOCHROME_APP_IDENTIFIER: 'ai.vibespace.monochrome.test' },
      /VITE_VIBESPACE_MONOCHROME_APP_IDENTIFIER/u,
    ],
    [
      'app identifier with uppercase suffix',
      {
        VITE_VIBESPACE_MONOCHROME_APP_IDENTIFIER: 'ai.vibespace.monochrome.testDEADBEEF',
      },
      /VITE_VIBESPACE_MONOCHROME_APP_IDENTIFIER/u,
    ],
    [
      'app identifier command injection',
      {
        VITE_VIBESPACE_MONOCHROME_APP_IDENTIFIER: 'ai.vibespace.monochrome.testdeadbeef & whoami',
      },
      /VITE_VIBESPACE_MONOCHROME_APP_IDENTIFIER/u,
    ],
    [
      'wrong capability',
      { VITE_VIBESPACE_MONOCHROME_CAPABILITY_IDENTIFIER: 'default' },
      /VITE_VIBESPACE_MONOCHROME_CAPABILITY_IDENTIFIER/u,
    ],
    [
      'capability command injection',
      {
        VITE_VIBESPACE_MONOCHROME_CAPABILITY_IDENTIFIER: 'monochrome-test && whoami',
      },
      /VITE_VIBESPACE_MONOCHROME_CAPABILITY_IDENTIFIER/u,
    ],
    [
      'short nonce hash',
      { VITE_VIBESPACE_MONOCHROME_SESSION_NONCE_HASH: 'a'.repeat(63) },
      /VITE_VIBESPACE_MONOCHROME_SESSION_NONCE_HASH/u,
    ],
    [
      'uppercase nonce hash',
      { VITE_VIBESPACE_MONOCHROME_SESSION_NONCE_HASH: 'A'.repeat(64) },
      /VITE_VIBESPACE_MONOCHROME_SESSION_NONCE_HASH/u,
    ],
    [
      'nonce command injection',
      { VITE_VIBESPACE_MONOCHROME_SESSION_NONCE_HASH: `${'a'.repeat(63)};` },
      /VITE_VIBESPACE_MONOCHROME_SESSION_NONCE_HASH/u,
    ],
  ];

  for (const [name, environment, expectedError] of invalidCases) {
    await context.test(name, async () => {
      await assert.rejects(loadConfig(environment), expectedError);
    });
  }
});
