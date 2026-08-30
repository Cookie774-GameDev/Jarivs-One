import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(
  process.env.PLAYWRIGHT_CORE_URL ??
    'file:///C:/Users/viper/AppData/Local/Temp/vibespace-playwright-tauri-20260829/playwright-core/index.mjs'
);
const evidenceDirectory = path.dirname(fileURLToPath(import.meta.url));
const framesDirectory = path.join(evidenceDirectory, 'file-read-frames');
await rm(framesDirectory, { recursive: true, force: true });
await mkdir(framesDirectory, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223', { timeout: 10_000 });
const page = browser
  .contexts()
  .flatMap((context) => context.pages())
  .find((candidate) => /localhost:5173|127\.0\.0\.1:5173/u.test(candidate.url()));
if (!page) throw new Error('Official VibeSpace Tauri WebView was not found.');
const cdp = await page.context().newCDPSession(page);

async function capture(target) {
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const file = path.join(evidenceDirectory, target);
  await writeFile(file, Buffer.from(data, 'base64'));
  return file;
}

async function frame(index) {
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(
    path.join(framesDirectory, `frame-${String(index).padStart(4, '0')}.png`),
    Buffer.from(data, 'base64'),
  );
}

async function snapshot() {
  return page.evaluate(() => {
    const live = document.querySelector('[data-live-turn-status]');
    const audit = document.querySelector('.agentic-turn-audit');
    const prompt = [...document.querySelectorAll('.agentic-prompt-band')].at(-1);
    const checkpoint = document.querySelector('[data-native-assistant-checkpoint]');
    return {
      status: document.querySelector('[aria-label="Session status"]')?.textContent?.trim() ?? null,
      liveText: live?.textContent?.trim() ?? null,
      liveMotion:
        live?.querySelector('[data-agent-motion]')?.getAttribute('data-agent-motion') ?? null,
      liveCategory: live?.getAttribute('data-live-turn-category') ?? null,
      ledgers: document.querySelectorAll('[data-assistant-activity-ledger="true"]').length,
      auditText: audit?.textContent?.trim() ?? null,
      auditExpanded:
        audit?.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded') ?? null,
      finalText:
        document.querySelector('[data-native-final-answer="true"]')?.textContent?.trim() ?? null,
      order:
        prompt && audit && checkpoint
          ? {
              promptBeforeAudit: Boolean(
                prompt.compareDocumentPosition(audit) & Node.DOCUMENT_POSITION_FOLLOWING,
              ),
              auditBeforeCheckpoint: Boolean(
                audit.compareDocumentPosition(checkpoint) & Node.DOCUMENT_POSITION_FOLLOWING,
              ),
            }
          : null,
      pendingApprovals: document.querySelectorAll('[data-approval-id][data-status="pending"]')
        .length,
    };
  });
}

const prompt =
  'Read C:\\Users\\viper\\VibeSpace-UnifiedChungus-Final\\package.json and C:\\Users\\viper\\VibeSpace-UnifiedChungus-Final\\app\\package.json with the file tools. Do not use Context Map retrieval for this narrow request. Compare the package names and test scripts in two concise sentences. Do not change any files and do not expose private reasoning.';
const report = {
  capturedAt: new Date().toISOString(),
  jarvisPid: process.env.JARVIS_PID ?? null,
  prompt,
  rlmStorage: await page.evaluate(() => localStorage.getItem('vibespace.rlm-preference.v1')),
  model: null,
  timingsMs: {},
  motions: [],
  completed: null,
  collapsed: null,
  sidebarDot: null,
  reloaded: null,
  screenshots: [],
  errors: [],
};
page.on('pageerror', (error) => report.errors.push(`pageerror:${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') report.errors.push(`console:${message.text()}`);
});

try {
  await page.setViewportSize({ width: 1720, height: 1000 });
  const composer = page.locator('[data-composer-input="true"]');
  await composer.waitFor({ state: 'visible', timeout: 30_000 });
  report.model = await page.getByRole('button', { name: 'Choose model' }).textContent();
  await composer.fill(prompt);
  const startedAt = Date.now();
  await page.getByRole('button', { name: 'Send message' }).click();
  await page.waitForFunction(
    (prefix) =>
      [...document.querySelectorAll('.agentic-prompt-band')].at(-1)?.textContent?.includes(prefix),
    'Read C:\\Users\\viper\\VibeSpace-UnifiedChungus-Final\\package.json',
    { timeout: 15_000 },
  );
  process.stdout.write('sent\n');

  const seen = new Set();
  let capturedLive = false;
  let capturedLedger = false;
  let frameIndex = 0;
  const deadline = startedAt + 120_000;
  while (Date.now() < deadline) {
    const current = await snapshot();
    const elapsed = Date.now() - startedAt;
    if (frameIndex < 12) {
      await page.locator('.agentic-prompt-band').last().scrollIntoViewIfNeeded();
      await frame(frameIndex);
      frameIndex += 1;
    }
    if (current.liveMotion && !seen.has(current.liveMotion)) {
      seen.add(current.liveMotion);
      report.motions.push({
        elapsed,
        motion: current.liveMotion,
        category: current.liveCategory,
        text: current.liveText,
      });
    }
    if (current.liveText && !capturedLive) {
      capturedLive = true;
      report.timingsMs.firstLive = elapsed;
      await page.locator('[data-live-turn-status]').scrollIntoViewIfNeeded();
      report.screenshots.push(await capture('12-file-read-live-motion.png'));
      process.stdout.write(`live:${elapsed}:${current.liveText}\n`);
    }
    if (current.ledgers > 0 && !capturedLedger) {
      capturedLedger = true;
      report.timingsMs.firstLedger = elapsed;
      process.stdout.write(`ledger:${elapsed}\n`);
    }
    if (current.auditText) {
      report.timingsMs.completed = elapsed;
      report.completed = current;
      break;
    }
    if (current.pendingApprovals > 0) throw new Error('Unexpected approval card.');
    await page.waitForTimeout(300);
  }
  if (!report.completed) throw new Error('File-read turn did not produce a completion audit.');
  await page.locator('.agentic-turn-audit').scrollIntoViewIfNeeded();
  report.screenshots.push(await capture('13-file-read-completed.png'));

  await page.getByRole('button', { name: 'Collapse completed work details' }).click();
  await page.getByRole('button', { name: 'Expand completed work details' }).waitFor({
    state: 'visible',
    timeout: 10_000,
  });
  report.collapsed = await snapshot();
  report.screenshots.push(await capture('14-file-read-collapsed.png'));
  await page.getByRole('button', { name: 'Expand completed work details' }).click();

  await page.getByRole('button', { name: 'Create chat' }).click();
  await page.waitForTimeout(250);
  const completionDot = page.locator('[data-chat-activity-completion-dot]').first();
  report.sidebarDot = {
    count: await page.locator('[data-chat-activity-completion-dot]').count(),
    visible: await completionDot.isVisible().catch(() => false),
    rowText: await completionDot
      .evaluate((node) => node.closest('.group')?.textContent?.trim() ?? null)
      .catch(() => null),
  };
  report.screenshots.push(await capture('15-file-read-sidebar-dot.png'));
  if (!report.sidebarDot.visible)
    throw new Error('Completion dot was not visible on the inactive chat.');

  await completionDot.evaluate((node) => {
    const button = node.closest('.group')?.querySelector('button');
    if (!(button instanceof HTMLButtonElement)) throw new Error('Completed chat button missing.');
    button.click();
  });
  await page.getByRole('button', { name: 'Collapse completed work details' }).waitFor({
    state: 'visible',
    timeout: 30_000,
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Collapse completed work details' }).waitFor({
    state: 'visible',
    timeout: 30_000,
  });
  report.reloaded = await snapshot();
  report.screenshots.push(await capture('16-file-read-reloaded.png'));

  await writeFile(
    path.join(evidenceDirectory, '03-live-file-read-acceptance.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await browser.close();
}
