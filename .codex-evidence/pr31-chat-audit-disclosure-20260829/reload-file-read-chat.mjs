import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(
  process.env.PLAYWRIGHT_CORE_URL ??
    'file:///C:/Users/viper/AppData/Local/Temp/vibespace-playwright-tauri-20260829/playwright-core/index.mjs'
);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223', { timeout: 10_000 });
const page = browser
  .contexts()
  .flatMap((context) => context.pages())
  .find((candidate) => /localhost:5173|127\.0\.0\.1:5173/u.test(candidate.url()));
if (!page) throw new Error('Official VibeSpace Tauri WebView was not found.');
const cdp = await page.context().newCDPSession(page);
const directory = path.dirname(fileURLToPath(import.meta.url));

try {
  const chatButton = page
    .getByRole('button', { name: /Read C:\\Users\\viper\\VibeSpace-UnifiedChungus-Fi/u })
    .first();
  await chatButton.click();
  await page.getByRole('button', { name: 'Collapse completed work details' }).waitFor({
    state: 'visible',
    timeout: 30_000,
  });
  const state = await page.evaluate(() => {
    const prompt = [...document.querySelectorAll('.agentic-prompt-band')].at(-1);
    const audit = document.querySelector('.agentic-turn-audit');
    const checkpoint = document.querySelector('[data-native-assistant-checkpoint]');
    return {
      chatId:
        document.querySelector('[data-agentic-console]')?.getAttribute('data-chat-id') ?? null,
      auditText: audit?.textContent?.trim() ?? null,
      auditExpanded:
        audit?.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded') ?? null,
      ledgers: document.querySelectorAll('[data-assistant-activity-ledger="true"]').length,
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
    };
  });
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const screenshot = path.join(directory, '16-file-read-reloaded-reselected.png');
  await writeFile(screenshot, Buffer.from(data, 'base64'));
  const report = { capturedAt: new Date().toISOString(), state, screenshot };
  await writeFile(
    path.join(directory, '03-live-file-read-reload.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await browser.close();
}
