import { chromium } from 'playwright-core';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9224');
const page = browser.contexts().flatMap((context) => context.pages())[0];
await page.goto('http://127.0.0.1:5175/?route=context', { waitUntil: 'domcontentloaded' });
await page.locator('[data-monochrome-route="context"]').waitFor({ timeout: 60_000 });
const cancel = page.getByRole('button', { name: 'Cancel', exact: true });
if (await cancel.isVisible()) await cancel.click();
await page.getByRole('button', { name: 'Choose summary model', exact: true }).click();
await page.waitForTimeout(1_000);
const text = await page.locator('body').innerText();
process.stdout.write(text.split('\n').filter((line) => /deepseek|flash|summary model/iu.test(line)).join('\n'));
browser._connection?.close?.();
