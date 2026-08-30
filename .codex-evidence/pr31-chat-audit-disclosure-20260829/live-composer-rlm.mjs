import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const playwrightCoreUrl =
  process.env.PLAYWRIGHT_CORE_URL ??
  'file:///C:/Users/viper/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs';
const { chromium } = await import(playwrightCoreUrl);
const evidenceDirectory = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.connectOverCDP(
  process.env.CDP_ENDPOINT ?? 'http://127.0.0.1:9223',
  { timeout: 10_000 },
);
const page = browser
  .contexts()
  .flatMap((context) => context.pages())
  .find((candidate) => /localhost:5173|127\.0\.0\.1:5173/u.test(candidate.url()));

if (!page) throw new Error('Official VibeSpace Tauri WebView was not found.');

const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`));

async function openOptionPicker(command) {
  const composer = page.locator('[data-composer-input="true"]');
  await page.keyboard.press('Escape');
  await composer.fill(`/${command}`);
  await page.waitForSelector('[role="listbox"][aria-label="Slash commands"]', {
    state: 'visible',
    timeout: 10_000,
  });
  await composer.press('Enter');
  await page.waitForSelector('.jarvis-slash-dropdown [data-value]', {
    state: 'visible',
    timeout: 10_000,
  });
}

try {
  await page.setViewportSize({ width: 1720, height: 1000 });
  const composer = page.locator('[data-composer-input="true"]');
  await composer.waitFor({ state: 'visible', timeout: 30_000 });
  await page.keyboard.press('Escape');
  await composer.fill('');

  for (const existing of await page
    .locator('[data-composer-token-kind="skill"] button[aria-label^="Remove "]')
    .all()) {
    await existing.click();
  }

  await openOptionPicker('skills');
  await page.locator('.jarvis-slash-dropdown [data-value]').first().click();
  const skillToken = page.locator('[data-composer-token-kind="skill"]').first();
  await skillToken.waitFor({ state: 'visible', timeout: 10_000 });
  const skillEvidence = await skillToken.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const composerNode = document.querySelector('[data-composer-drop-zone="true"]');
    const composerRect = composerNode?.getBoundingClientRect();
    return {
      text: node.textContent?.trim() ?? '',
      title: node.getAttribute('title'),
      kind: node.getAttribute('data-composer-token-kind'),
      hasOkBadge: /\bok\b/iu.test(node.textContent ?? ''),
      borderRadius: style.borderRadius,
      backgroundColor: style.backgroundColor,
      rect: { width: rect.width, height: rect.height },
      composerRect: composerRect
        ? { width: composerRect.width, height: composerRect.height }
        : null,
    };
  });
  await page.screenshot({
    path: path.join(evidenceDirectory, '04-skill-token-native.png'),
    animations: 'disabled',
  });
  await skillToken.locator('button[aria-label^="Remove "]').click();
  await skillToken.waitFor({ state: 'detached', timeout: 10_000 });

  await openOptionPicker('rlm');
  await page.locator('.jarvis-slash-dropdown [data-value="on"]').click();
  await page.waitForFunction(
    () => {
      const raw = localStorage.getItem('vibespace.rlm-preference.v1');
      return raw !== null && raw.includes('true');
    },
    undefined,
    { timeout: 10_000 },
  );

  await openOptionPicker('rlm');
  await page.locator('.jarvis-slash-dropdown [data-value="status"]').click();
  await page.waitForTimeout(750);

  const rlmEvidence = await page.evaluate(() => {
    const raw = localStorage.getItem('vibespace.rlm-preference.v1');
    const bodyText = document.body.innerText ?? '';
    const marker = bodyText.lastIndexOf('RLM ON');
    return {
      storage: raw ? JSON.parse(raw) : null,
      statusVisible: marker >= 0,
      statusExcerpt: marker >= 0 ? bodyText.slice(marker, marker + 800) : null,
      composerValue:
        document.querySelector('[data-composer-input="true"]')?.value ?? null,
      remainingSkillTokens: document.querySelectorAll(
        '[data-composer-token-kind="skill"]',
      ).length,
    };
  });
  await page.screenshot({
    path: path.join(evidenceDirectory, '05-rlm-on-native.png'),
    animations: 'disabled',
  });

  const report = {
    capturedAt: new Date().toISOString(),
    url: page.url(),
    skillEvidence,
    rlmEvidence,
    errors,
  };
  await writeFile(
    path.join(evidenceDirectory, '01-composer-rlm.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await page.keyboard.press('Escape').catch(() => {});
  await page.locator('[data-composer-input="true"]').fill('').catch(() => {});
  await browser.close();
}
