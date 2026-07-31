import { defineConfig } from '@playwright/test';
import path from 'node:path';

/**
 * MonoChrome deterministic visual/accessibility/behavior/style-metrics harness.
 *
 * Environment is locked per frozen baseline-manifest authority:
 * - locale: en-US, timezone: UTC, colorScheme: light
 * - reducedMotion: reduce, fixedClock: 2026-07-16T12:00:00.000Z
 * - fontReadiness: document.fonts.ready
 * - stableLayout: three-consecutive-animation-frames
 * - navigation: loopback-only, dataSource: isolated-synthetic-fixtures
 * - browsers: msedge for the four proof lanes; WebKit for preview-only layout/token/font smoke
 * - deviceScaleFactor: 1
 *
 * Never uses arbitrary sleeps. All waits use explicit readiness markers.
 */

const portText = process.env.MONOCHROME_PORT ?? '4173';
if (!/^\d{4,5}$/u.test(portText)) {
  throw new Error('MONOCHROME_PORT must be a four- or five-digit localhost port');
}
const port = Number(portText);
if (port < 1024 || port > 65535) {
  throw new Error('MONOCHROME_PORT is outside the allowed unprivileged port range');
}
const defaultB0Port = port === 65535 ? port - 1 : port + 1;
const b0PortText = process.env.MONOCHROME_B0_PORT ?? String(defaultB0Port);
if (!/^\d{4,5}$/u.test(b0PortText)) {
  throw new Error('MONOCHROME_B0_PORT must be a four- or five-digit localhost port');
}
const b0Port = Number(b0PortText);
if (b0Port < 1024 || b0Port > 65535) {
  throw new Error('MONOCHROME_B0_PORT is outside the allowed unprivileged port range');
}
if (b0Port === port) {
  throw new Error('MONOCHROME_PORT and MONOCHROME_B0_PORT must be distinct');
}
const BASE_URL = `http://127.0.0.1:${port}`;
const B0_BASE_URL = `http://127.0.0.1:${b0Port}`;
const DEFAULT_APP_IDENTIFIER = 'ai.vibespace.monochrome.test0000000000000001';
const DEFAULT_SESSION_NONCE_HASH =
  '58eca8fac5471caab5fc17f4a52c4971eb87a139e7f3fe4edc5eea8c1e55eaf5';
const runNamespace = process.env.MONOCHROME_RUN_NAMESPACE;
if (
  runNamespace !== undefined &&
  (!/^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/u.test(runNamespace) ||
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/u.test(runNamespace))
) {
  throw new Error(
    'MONOCHROME_RUN_NAMESPACE must be an unambiguous 1-64 character lowercase alphanumeric, hyphen, or underscore slug',
  );
}
const mutableArtifactRoot =
  runNamespace === undefined
    ? '.artifacts/monochrome'
    : `.artifacts/monochrome/runs/${runNamespace}`;

function validatedEnvironmentValue(name: string, fallback: string, pattern: RegExp): string {
  const value = process.env[name] ?? fallback;
  if (!pattern.test(value)) {
    throw new Error(`${name} does not satisfy the MonoChrome compile identity`);
  }
  return value;
}

const visualCompileEnvironment = {
  VIBESPACE_VITE_CACHE_DIR: path.resolve(`${mutableArtifactRoot}/vite-cache/visual`),
  VITE_VIBESPACE_RUNTIME_PROFILE: validatedEnvironmentValue(
    'VITE_VIBESPACE_RUNTIME_PROFILE',
    'monochrome-visual-test',
    /^monochrome-visual-test$/u,
  ),
  VITE_VIBESPACE_MONOCHROME_APP_IDENTIFIER: validatedEnvironmentValue(
    'VITE_VIBESPACE_MONOCHROME_APP_IDENTIFIER',
    DEFAULT_APP_IDENTIFIER,
    /^ai\.vibespace\.monochrome\.test[a-f0-9]+$/u,
  ),
  VITE_VIBESPACE_MONOCHROME_CAPABILITY_IDENTIFIER: validatedEnvironmentValue(
    'VITE_VIBESPACE_MONOCHROME_CAPABILITY_IDENTIFIER',
    'monochrome-test',
    /^monochrome-test$/u,
  ),
  VITE_VIBESPACE_MONOCHROME_SESSION_NONCE_HASH: validatedEnvironmentValue(
    'VITE_VIBESPACE_MONOCHROME_SESSION_NONCE_HASH',
    DEFAULT_SESSION_NONCE_HASH,
    /^[a-f0-9]{64}$/u,
  ),
};
const ordinaryCompileEnvironment = {
  VIBESPACE_VITE_CACHE_DIR: path.resolve(`${mutableArtifactRoot}/vite-cache/b0`),
  VITE_VIBESPACE_RUNTIME_PROFILE: undefined,
  VITE_VIBESPACE_MONOCHROME_APP_IDENTIFIER: undefined,
  VITE_VIBESPACE_MONOCHROME_CAPABILITY_IDENTIFIER: undefined,
  VITE_VIBESPACE_MONOCHROME_SESSION_NONCE_HASH: undefined,
} as unknown as Record<string, string>;

if (!/^[A-Za-z0-9 ._:/\\()\-]+$/u.test(process.execPath)) {
  throw new Error('Node executable path is unsafe for the Playwright webServer command');
}
const viteCommand = (serverPort: number): string =>
  `"${process.execPath}" "node_modules/vite/bin/vite.js" --host 127.0.0.1 --port ${serverPort} --strictPort`;

export default defineConfig({
  metadata: {
    monochromeB0BaseUrl: B0_BASE_URL,
  },
  testDir: './tests/visual/monochrome',
  outputDir: `${mutableArtifactRoot}/test-results`,
  snapshotPathTemplate:
    'tests/visual/monochrome/baselines/mc9/{projectName}/{testFilePath}/{arg}{ext}',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: `${mutableArtifactRoot}/report.json` }]],
  timeout: 60_000,
  webServer: [
    {
      command: viteCommand(port),
      cwd: 'app',
      env: visualCompileEnvironment,
      url: BASE_URL,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: viteCommand(b0Port),
      cwd: 'app',
      env: ordinaryCompileEnvironment,
      url: B0_BASE_URL,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixels: 0,
      threshold: 0,
    },
  },
  use: {
    baseURL: BASE_URL,
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    contextOptions: {
      reducedMotion: 'reduce',
    },
    deviceScaleFactor: 1,
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
    serviceWorkers: 'block',
    launchOptions: {
      args: ['--force-color-profile=srgb', '--disable-features=PaintHolding', '--mute-audio'],
    },
  },
  projects: [
    {
      name: 'monochrome-visual',
      testMatch: /monochrome\.visual\.spec\.ts/,
      use: { channel: 'msedge', viewport: { width: 1672, height: 941 } },
    },
    {
      name: 'monochrome-other-themes',
      testMatch: /monochrome\.other-themes\.spec\.ts/,
      use: { channel: 'msedge', viewport: { width: 1672, height: 941 } },
    },
    {
      name: 'monochrome-a11y',
      testMatch: /monochrome\.a11y\.spec\.ts/,
      use: { channel: 'msedge', viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'monochrome-behavior',
      testMatch: /monochrome\.behavior\.spec\.ts/,
      use: { channel: 'msedge', viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'monochrome-webkit-preview',
      testMatch: /monochrome\.webkit\.spec\.ts/,
      use: {
        browserName: 'webkit',
        channel: undefined,
        launchOptions: { args: [] },
        viewport: { width: 1672, height: 941 },
      },
    },
  ],
});
