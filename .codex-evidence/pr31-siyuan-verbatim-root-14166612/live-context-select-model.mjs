import { chromium } from 'file:///C:/Users/viper/ChatGPT-Browser-Connections/chatgpt-setup-automation/node_modules/playwright/index.mjs';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = browser
  .contexts()
  .flatMap((context) => context.pages())
  .find((candidate) => candidate.url().includes('localhost:5173'));
if (!page) throw new Error('vibespace_page_missing');
page.setDefaultTimeout(10_000);
const root = page.locator('input[type="text"]').first();
await root.fill('\\\\?\\C:\\Users\\viper\\projects');
await page.getByRole('button', { name: 'Choose summary model' }).click();
const search = page.getByPlaceholder('Search providers or models…');
await search.fill('opencode-go/deepseek-v4-flash-vision-exp');
await page.waitForTimeout(400);
const options = await page
  .locator('[role="option"], [data-model-picker-option], button')
  .allTextContents();
process.stdout.write(
  JSON.stringify(
    {
      root: await root.inputValue(),
      options: options.filter((value) => /deepseek|opencode|effort/i.test(value)).slice(0, 100),
    },
    null,
    2,
  ),
);
process.exit(0);
