import { chromium } from 'file:///C:/Users/viper/ChatGPT-Browser-Connections/chatgpt-setup-automation/node_modules/playwright/index.mjs';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = browser
  .contexts()
  .flatMap((context) => context.pages())
  .find((candidate) => candidate.url().includes('localhost:5173'));
if (!page) throw new Error('vibespace_page_missing');
await page.waitForTimeout(2_000);
await page.screenshot({
  path: 'C:/Users/viper/VibeSpace-UnifiedChungus-Final/.codex-evidence/pr31-siyuan-verbatim-root-14166612/09-projects-map-paused.png',
  fullPage: false,
});
const body = await page.locator('body').innerText();
process.stdout.write(
  JSON.stringify(
    {
      url: page.url(),
      buttons: (await page.getByRole('button').allTextContents()).filter((line) =>
        /summary|approve|resume|retry|repair|map|deepseek/i.test(line),
      ),
      relevant: body
        .split(/\r?\n/u)
        .filter((line) =>
          /Context Map|indexed|excluded|unreadable|SiYuan nodes|Summarized|Skipped|Failed|Summary scope|Summary model|approval|Approve|FILES|NODES|MODEL|active maps|selected summary path|error|unavailable|repair/i.test(
            line,
          ),
        )
        .slice(0, 240),
    },
    null,
    2,
  ),
);
process.exit(0);
