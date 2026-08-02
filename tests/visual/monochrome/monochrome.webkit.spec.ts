import { expect, test } from '@playwright/test';

const FIXED_CLOCK = '2026-07-16T12:00:00.000Z';
const FIXED_EPOCH = Date.parse(FIXED_CLOCK);
const FIXTURE_HASH = 'fd8950bf1a41f18797c3e4ea97ad25f1eac86ffda0862cc61e361bdea2a158c9';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const EXTERNAL_HTTP_URL = /^https?:\/\/(?!(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/|$))/iu;
const ACCEPTABLE_FALLBACK_FAMILIES = [
  'system-ui',
  '-apple-system',
  'blinkmacsystemfont',
  'segoe ui',
  'sans-serif',
];

test.setTimeout(180_000);

test('WebKit preview verifies only deterministic layout, theme tokens, and font fallback', async ({
  browser,
  context,
  page,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'proof-boundary',
    description:
      'Preview-only WebKit layout/token/font evidence; not Windows-native, WebView2, macOS, or Linux proof.',
  });

  const pageErrors: string[] = [];
  const externalRequests: string[] = [];
  const externalNavigations: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(`console: ${message.text()}`);
  });
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    const url = new URL(frame.url());
    if (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !LOOPBACK_HOSTS.has(url.hostname)
    ) {
      externalNavigations.push(url.href);
    }
  });
  await context.route(EXTERNAL_HTTP_URL, async (route) => {
    externalRequests.push(route.request().url());
    await route.abort('blockedbyclient');
  });
  await page.addInitScript(
    ({ fixedEpoch }) => {
      const NativeDate = Date;
      const FixedDate = new Proxy(NativeDate, {
        apply() {
          return new NativeDate(fixedEpoch).toString();
        },
        construct(target, argumentsList, newTarget) {
          return Reflect.construct(
            target,
            argumentsList.length === 0 ? [fixedEpoch] : argumentsList,
            newTarget,
          );
        },
      });
      Object.defineProperty(FixedDate, 'now', {
        configurable: false,
        value: () => fixedEpoch,
        writable: false,
      });
      Object.defineProperty(globalThis, 'Date', {
        configurable: false,
        value: FixedDate,
        writable: false,
      });

      let randomState = 42;
      Object.defineProperty(Math, 'random', {
        configurable: false,
        value: () => {
          randomState = (randomState * 16807) % 2147483647;
          return (randomState - 1) / 2147483646;
        },
        writable: false,
      });
    },
    { fixedEpoch: FIXED_EPOCH },
  );

  const query = new URLSearchParams({
    'monochrome-fixture': 'chat',
    'monochrome-fixture-hash': FIXTURE_HASH,
    'monochrome-surface': 'route:chat',
    'monochrome-theme': 'monochrome',
    'monochrome-origami-gate': 'false',
  });
  await page.goto(`/chat?${query}`, { waitUntil: 'domcontentloaded' });

  const readiness = page.locator('output[data-monochrome-fixture-ready="true"]');
  await expect(readiness).toHaveCount(1, { timeout: 150_000 });
  await expect(readiness).toHaveAttribute('data-runtime-profile', 'monochrome-visual-test');
  await expect(readiness).toHaveAttribute('data-fixture-hash', FIXTURE_HASH);
  await expect(readiness).toHaveAttribute('data-resolved-theme', 'monochrome');
  await expect(readiness).toHaveAttribute('data-document-theme', 'monochrome');
  await expect(readiness).toHaveAttribute('data-font-ready', 'true');
  await expect(readiness).toHaveAttribute('data-fallback', 'false');
  await expect(readiness).toHaveAttribute('data-origami-gate', 'false');

  const receipt = await page.evaluate(
    async ({ acceptableFallbackFamilies, fixedEpoch }) => {
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );

      const root = document.documentElement;
      const body = document.body;
      const appRoot = document.querySelector<HTMLElement>('#root');
      const surface = document.querySelector<HTMLElement>(
        '[data-monochrome-surface-id="route:chat"]',
      );
      if (!appRoot || !surface) throw new Error('Synthetic WebKit preview surface is absent.');

      const rootStyle = getComputedStyle(root);
      const bodyStyle = getComputedStyle(body);
      const fontFamily = bodyStyle.fontFamily.trim();
      const primaryFamily = fontFamily.split(',')[0]?.trim() ?? '';
      const primaryLoaded =
        primaryFamily.length > 0 && document.fonts.check(`16px ${primaryFamily}`);
      const hasDeclaredFallback = acceptableFallbackFamilies.some((family) =>
        fontFamily.toLowerCase().includes(family),
      );
      const fontRole = primaryLoaded
        ? 'primary-loaded'
        : hasDeclaredFallback
          ? 'declared-system-fallback'
          : 'unacceptable';
      const tokenNames = ['--background', '--foreground', '--border'] as const;
      const tokens = Object.fromEntries(
        tokenNames.map((name) => [name, rootStyle.getPropertyValue(name).trim()]),
      );
      const dimensions = [root, body, appRoot].map((element) => ({
        clientHeight: element.clientHeight,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        scrollWidth: element.scrollWidth,
      }));
      const surfaceRect = surface.getBoundingClientRect();

      return {
        clock: Date.now(),
        dimensions,
        documentTheme: root.dataset.theme,
        fontFamily,
        fontRole,
        fontStatus: document.fonts.status,
        surfaceRect: {
          bottom: surfaceRect.bottom,
          height: surfaceRect.height,
          left: surfaceRect.left,
          right: surfaceRect.right,
          top: surfaceRect.top,
          width: surfaceRect.width,
        },
        tokens,
        viewport: { height: innerHeight, width: innerWidth },
        fixedEpoch,
      };
    },
    { acceptableFallbackFamilies: ACCEPTABLE_FALLBACK_FAMILIES, fixedEpoch: FIXED_EPOCH },
  );

  expect(receipt.clock).toBe(FIXED_EPOCH);
  expect(receipt.documentTheme).toBe('monochrome');
  expect(receipt.fontStatus).toBe('loaded');
  expect(['primary-loaded', 'declared-system-fallback']).toContain(receipt.fontRole);
  expect(receipt.fontFamily).not.toBe('');
  for (const value of Object.values(receipt.tokens)) expect(value).not.toBe('');
  expect(receipt.viewport).toEqual({ width: 1672, height: 941 });
  for (const dimension of receipt.dimensions) {
    expect(dimension.scrollWidth).toBeLessThanOrEqual(dimension.clientWidth + 1);
    expect(dimension.scrollHeight).toBeLessThanOrEqual(dimension.clientHeight + 1);
  }
  expect(receipt.surfaceRect.width).toBeGreaterThan(0);
  expect(receipt.surfaceRect.height).toBeGreaterThan(0);
  expect(receipt.surfaceRect.left).toBeGreaterThanOrEqual(0);
  expect(receipt.surfaceRect.top).toBeGreaterThanOrEqual(0);
  expect(receipt.surfaceRect.right).toBeLessThanOrEqual(receipt.viewport.width + 1);
  expect(receipt.surfaceRect.bottom).toBeLessThanOrEqual(receipt.viewport.height + 1);
  expect(pageErrors).toEqual([]);
  expect(externalRequests).toEqual([]);
  expect(externalNavigations).toEqual([]);

  console.log(
    `WEBKIT_PREVIEW_RECEIPT ${JSON.stringify({
      browserName: 'webkit',
      browserVersion: browser.version(),
      fixedClock: FIXED_CLOCK,
      fontRole: receipt.fontRole,
      fontStatus: receipt.fontStatus,
      proofBoundary: 'layout-token-font-preview-only',
      viewport: receipt.viewport,
    })}`,
  );
});
