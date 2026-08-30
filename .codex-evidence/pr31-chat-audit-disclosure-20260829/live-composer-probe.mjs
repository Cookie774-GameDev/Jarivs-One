const playwrightCoreUrl =
  process.env.PLAYWRIGHT_CORE_URL ??
  'file:///C:/Users/viper/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs';
const { chromium } = await import(playwrightCoreUrl);

const browser = await chromium.connectOverCDP(
  process.env.CDP_ENDPOINT ?? 'http://127.0.0.1:9223',
  { timeout: 10_000 },
);
const page = browser
  .contexts()
  .flatMap((context) => context.pages())
  .find((candidate) => /localhost:5173|127\.0\.0\.1:5173/u.test(candidate.url()));

if (!page) throw new Error('Official VibeSpace Tauri WebView was not found.');

try {
  const composer = page.locator('[data-composer-input="true"]');
  await composer.fill('/rlm');
  await page.waitForTimeout(750);
  await composer.press('Enter');
  await page.waitForTimeout(750);
  const snapshot = await page.evaluate(() => ({
    composerValue: document.querySelector('[data-composer-input="true"]')?.value ?? null,
    activeElement: document.activeElement?.getAttribute('data-composer-input') ?? null,
    visibleText: (document.body.innerText ?? '').slice(-5_000),
    listboxes: [...document.querySelectorAll('[role="listbox"]')].map((node) => ({
      label: node.getAttribute('aria-label'),
      text: node.textContent?.trim(),
    })),
    options: [...document.querySelectorAll('[role="option"]')].map((node) => ({
      id: node.id,
      selected: node.getAttribute('aria-selected'),
      text: node.textContent?.trim(),
    })),
  }));
  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
} finally {
  await page.locator('[data-composer-input="true"]').fill('');
  await browser.close();
}
