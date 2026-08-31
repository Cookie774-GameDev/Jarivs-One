import { chromium } from 'file:///C:/Users/viper/ChatGPT-Browser-Connections/chatgpt-setup-automation/node_modules/playwright/index.mjs';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const contexts = browser.contexts();
const pages = contexts.flatMap((context) => context.pages());
const page = pages.find((candidate) => candidate.url().includes('localhost:5173')) ?? pages[0];
if (!page) throw new Error('vibespace_page_missing');
page.setDefaultTimeout(5_000);
const buttons = await page.getByRole('button').allTextContents();
const links = await page.getByRole('link').allTextContents();
const inputs = await page.locator('input').evaluateAll((nodes) =>
  nodes.map((node) => ({
    type: node.type,
    value: node.value,
    placeholder: node.placeholder,
    ariaLabel: node.getAttribute('aria-label'),
    testId: node.getAttribute('data-testid'),
  })),
);
const body = (await page.locator('body').innerText()).slice(0, 12_000);
process.stdout.write(
  JSON.stringify(
    {
      url: page.url(),
      title: await page.title(),
      buttons,
      links,
      inputs,
      body,
    },
    null,
    2,
  ),
);
process.exit(0);
