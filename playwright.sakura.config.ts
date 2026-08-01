import { defineConfig } from '@playwright/test';

const DEFAULT_SAKURA_BASE_URL = 'http://127.0.0.1:5187';
const configuredBaseUrl = process.env.VIBESPACE_SAKURA_BASE_URL ?? DEFAULT_SAKURA_BASE_URL;
const parsedBaseUrl = new URL(configuredBaseUrl);
const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);

if (
  parsedBaseUrl.protocol !== 'http:' ||
  !loopbackHosts.has(parsedBaseUrl.hostname) ||
  parsedBaseUrl.username ||
  parsedBaseUrl.password ||
  parsedBaseUrl.search ||
  parsedBaseUrl.hash
) {
  throw new Error(
    'VIBESPACE_SAKURA_BASE_URL must be an account-free loopback HTTP origin, for example http://127.0.0.1:5187.',
  );
}

export default defineConfig({
  metadata: {
    sakuraBaseUrl: parsedBaseUrl.origin,
    sakuraReferenceSource:
      'C:\\Users\\viper\\Downloads\\VibeSpace-Sakura-UI-Preview (1)\\VibeSpace-Sakura-UI-Preview\\index.html',
    sakuraReferenceSha256: '76611A6BBFF4E0744F30EB95F254FAFE036DC035D6E9E5957066F0780B342FA3',
  },
  testDir: './tests/visual/sakura',
  testMatch: /sakura\.visual\.spec\.ts/,
  outputDir: 'test-results/sakura',
  snapshotPathTemplate: 'test-results/sakura/snapshots/{projectName}/{testFilePath}/{arg}{ext}',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 45_000,
  expect: {
    timeout: 8_000,
  },
  reporter: [['list'], ['json', { outputFile: 'test-results/sakura/report.json' }]],
  use: {
    baseURL: parsedBaseUrl.origin,
    channel: 'msedge',
    headless: true,
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'dark',
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
    launchOptions: {
      args: ['--force-color-profile=srgb', '--disable-features=PaintHolding', '--mute-audio'],
    },
  },
  projects: [
    {
      name: 'sakura-desktop-1440x900',
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'sakura-compact-1024x768',
      use: { viewport: { width: 1024, height: 768 } },
    },
  ],
});
