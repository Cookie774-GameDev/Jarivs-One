import { chromium } from 'file:///C:/Users/viper/ChatGPT-Browser-Connections/chatgpt-setup-automation/node_modules/playwright/index.mjs';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = browser
  .contexts()
  .flatMap((context) => context.pages())
  .find((candidate) => candidate.url().includes('localhost:5173'));
if (!page) throw new Error('vibespace_page_missing');
page.setDefaultTimeout(10_000);
await page.getByRole('button', { name: 'Context', exact: true }).click();
await page.waitForFunction(() => new URL(window.location.href).searchParams.get('route') === 'context');
await page.waitForTimeout(1_500);
await page.screenshot({
  path: 'C:/Users/viper/VibeSpace-UnifiedChungus-Final/.codex-evidence/pr31-siyuan-verbatim-root-14166612/06-context-home-before-retry.png',
  fullPage: false,
});
process.stdout.write(
  JSON.stringify(
    {
      url: page.url(),
      buttons: await page.getByRole('button').allTextContents(),
      body: (await page.locator('body').innerText()).slice(0, 18_000),
    },
    null,
    2,
  ),
);
process.exit(0);
