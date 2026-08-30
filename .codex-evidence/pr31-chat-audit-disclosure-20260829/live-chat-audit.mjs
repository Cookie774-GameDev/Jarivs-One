import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const playwrightCoreUrl =
  process.env.PLAYWRIGHT_CORE_URL ??
  'file:///C:/Users/viper/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs';
const { chromium } = await import(playwrightCoreUrl);

const evidenceDirectory = path.dirname(fileURLToPath(import.meta.url));
await mkdir(evidenceDirectory, { recursive: true });

const cdpEndpoint = process.env.CDP_ENDPOINT ?? 'http://127.0.0.1:9223';
const browser = await chromium.connectOverCDP(cdpEndpoint, { timeout: 10_000 });
const page = browser
  .contexts()
  .flatMap((context) => context.pages())
  .find(
    (candidate) =>
      /localhost:5173|127\.0\.0\.1:5173|chrome-error:\/\/chromewebdata/u.test(candidate.url()) ||
      candidate.title().catch(() => '') === 'localhost',
  );

if (!page) throw new Error('Official VibeSpace Tauri WebView was not found on CDP 9223.');
const cdp = await page.context().newCDPSession(page);
const captureViewport = async (name) => {
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const screenshotPath = path.join(evidenceDirectory, name);
  await writeFile(screenshotPath, Buffer.from(result.data, 'base64'));
  return screenshotPath;
};

const errors = [];
const failedResponses = [];
page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console:${message.text()}`);
});
page.on('response', (response) => {
  if (response.status() >= 400) {
    failedResponses.push({ status: response.status(), url: response.url() });
  }
});

try {
  await page.setViewportSize({ width: 1720, height: 1000 });
  if (page.url().startsWith('chrome-error://')) {
    await page.goto('http://localhost:5173/?route=context', { waitUntil: 'domcontentloaded' });
  }
  await page.waitForSelector('[data-monochrome-surface="app-shell"]', {
    state: 'attached',
    timeout: 30_000,
  });
  await page.waitForFunction(() => (document.body.innerText ?? '').trim().length > 0, undefined, {
    timeout: 30_000,
  });
  const chatNavigation = page.getByText('Chat', { exact: true }).first();
  if (await chatNavigation.isVisible().catch(() => false)) await chatNavigation.click();
  await page.waitForTimeout(2_000);

  const workState = () =>
    page.evaluate(() => ({
      auditExpanded: document
        .querySelector('.agentic-turn-audit__disclosure')
        ?.getAttribute('aria-expanded'),
      ledgers: document.querySelectorAll('[data-assistant-activity-ledger="true"]').length,
      intermediateCheckpoints: document.querySelectorAll(
        '[data-native-assistant-checkpoint="true"]',
      ).length,
      finalAnswers: document.querySelectorAll('[data-native-final-answer="true"]').length,
      finalAnswerText:
        document.querySelector('[data-native-final-answer="true"]')?.textContent?.trim() ?? null,
      auditText: document.querySelector('.agentic-turn-audit')?.textContent?.trim() ?? null,
    }));

  const interaction = { expanded: null, collapsed: null, reloaded: null };
  const expandedAudit = page.getByRole('button', {
    name: 'Collapse completed work details',
  });
  if (await expandedAudit.isVisible().catch(() => false)) {
    await expandedAudit.scrollIntoViewIfNeeded();
    interaction.expanded = await workState();
    await captureViewport('01-completed-work-expanded.png');

    await expandedAudit.click();
    await page.getByRole('button', { name: 'Expand completed work details' }).waitFor({
      state: 'visible',
      timeout: 10_000,
    });
    interaction.collapsed = await workState();
    await captureViewport('02-completed-work-collapsed.png');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-monochrome-surface="app-shell"]', {
      state: 'attached',
      timeout: 30_000,
    });
    const reloadedAudit = page.getByRole('button', {
      name: 'Collapse completed work details',
    });
    await reloadedAudit.waitFor({ state: 'visible', timeout: 30_000 });
    const expandedAuditText = interaction.expanded?.auditText;
    if (expandedAuditText) {
      await page.waitForFunction(
        (expectedText) =>
          document.querySelector('.agentic-turn-audit')?.textContent?.trim() === expectedText,
        expandedAuditText,
        { timeout: 30_000 },
      );
    }
    await reloadedAudit.scrollIntoViewIfNeeded();
    interaction.reloaded = await workState();
    await captureViewport('03-completed-work-reloaded.png');
  }

  const snapshot = await page.evaluate(() => ({
    title: document.title,
    url: location.href,
    bodyText: (document.body.innerText ?? '').slice(0, 8_000),
    visibleButtons: [...document.querySelectorAll('button')]
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((button) => ({
        label: button.getAttribute('aria-label') || button.innerText.trim(),
        expanded: button.getAttribute('aria-expanded'),
      }))
      .filter((entry) => entry.label),
    auditCount: document.querySelectorAll('.agentic-turn-audit').length,
    ledgers: document.querySelectorAll('[data-assistant-activity-ledger="true"]').length,
    nativeCheckpoints: document.querySelectorAll('[data-native-assistant-checkpoint]').length,
    finalAnswers: document.querySelectorAll('[data-native-final-answer="true"]').length,
    pluginCards: document.querySelectorAll('[data-plugin-usage-card]').length,
    skillTokens: document.querySelectorAll('[data-composer-token-kind="skill"]').length,
    hasFourStateStrip: /Doing now|Awaiting your next request|Blockers/u.test(
      document.querySelector('[data-agentic-console]')?.textContent ?? '',
    ),
  }));

  const screenshotPath = await captureViewport('00-chat-current.png');
  const report = {
    capturedAt: new Date().toISOString(),
    cdp: cdpEndpoint,
    jarvisPid: process.env.JARVIS_PID ?? null,
    snapshot,
    interaction,
    errors,
    failedResponses,
    screenshotPath,
  };
  await writeFile(
    path.join(evidenceDirectory, '00-chat-current.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await browser.close();
}
