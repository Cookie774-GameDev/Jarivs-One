import { chromium } from 'file:///C:/Users/viper/ChatGPT-Browser-Connections/chatgpt-setup-automation/node_modules/playwright/index.mjs';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = browser
  .contexts()
  .flatMap((context) => context.pages())
  .find((candidate) => candidate.url().includes('localhost:5173'));
if (!page) throw new Error('vibespace_page_missing');
page.setDefaultTimeout(15_000);
const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console:${message.text()}`);
});

await page.getByRole('button', { name: /Approve exact route and resume/i }).click();
await page.waitForTimeout(800);
await page.screenshot({
  path: 'C:/Users/viper/VibeSpace-UnifiedChungus-Final/.codex-evidence/pr31-siyuan-verbatim-root-14166612/10-projects-summary-running.png',
  fullPage: false,
});
await page.waitForFunction(
  () => {
    const text = document.body.innerText;
    return (
      text.includes('Context Map complete') ||
      text.includes('Context map creation failed') ||
      text.includes('Cloud approval was saved safely, but resume needs review') ||
      text.includes('Cloud summary approval needs review') ||
      text.includes('SiYuan could not read this Context Map')
    );
  },
  undefined,
  { timeout: 300_000 },
);
await page.waitForTimeout(1_000);
await page.screenshot({
  path: 'C:/Users/viper/VibeSpace-UnifiedChungus-Final/.codex-evidence/pr31-siyuan-verbatim-root-14166612/11-projects-summary-terminal.png',
  fullPage: false,
});
const body = await page.locator('body').innerText();
process.stdout.write(
  JSON.stringify(
    {
      errors,
      relevant: body
        .split(/\r?\n/u)
        .filter((line) =>
          /Context Map|indexed|excluded|unreadable|SiYuan nodes|Summarized|Skipped|Failed|Summary scope|Summary model|approval|Approve|token|complete|error|repair/i.test(
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
