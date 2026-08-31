import { chromium } from 'file:///C:/Users/viper/ChatGPT-Browser-Connections/chatgpt-setup-automation/node_modules/playwright/index.mjs';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = browser
  .contexts()
  .flatMap((context) => context.pages())
  .find((candidate) => candidate.url().includes('localhost:5173'));
if (!page) throw new Error('vibespace_page_missing');
await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
await page.waitForTimeout(2_000);
process.stdout.write(
  JSON.stringify(
    {
      url: page.url(),
      buttons: (await page.getByRole('button').allTextContents()).filter((line) =>
        /active maps|Context Map|Create Map|summary model/i.test(line),
      ),
      inputs: await page.locator('input[type="text"]').evaluateAll((nodes) =>
        nodes.slice(0, 3).map((node) => ({ value: node.value, placeholder: node.placeholder })),
      ),
    },
    null,
    2,
  ),
);
process.exit(0);
