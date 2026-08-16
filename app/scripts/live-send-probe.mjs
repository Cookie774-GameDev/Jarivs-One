import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const pages = browser.contexts().flatMap((c) => c.pages());
const page = pages.find((p) => p.url().includes('5173')) ?? pages[0];
if (!page) process.exit(1);

const unique = `Spark ping ${Date.now()}`;

// Wait until composer is enabled / not mid-run
const waitStart = Date.now();
while (Date.now() - waitStart < 90_000) {
  const ready = await page.evaluate(() => {
    const ta = document.querySelector('textarea[data-composer-input="true"]');
    const text = document.body?.innerText ?? '';
    const busy = /Checking OpenCode|is reasoning|is thinking|preparing the final response/i.test(
      text,
    );
    return { disabled: Boolean(ta?.disabled), busy };
  });
  if (!ready.disabled && !ready.busy) break;
  await page.waitForTimeout(500);
}

const box = page.locator('textarea[data-composer-input="true"]').first();
await box.click({ force: true, timeout: 8000 });
await box.evaluate((el) => {
  el.removeAttribute('disabled');
  el.disabled = false;
});
await box.fill(unique);
const started = Date.now();
await box.press('Control+Enter');

const deadline = Date.now() + 90_000;
let last = '';
let posted = 0;
while (Date.now() < deadline) {
  last = await page.evaluate(() => document.body?.innerText ?? '');
  if (!posted && last.includes(unique)) posted = Date.now() - started;
  const slice = last.slice(last.lastIndexOf(unique));
  const failed = /@jarvis failed|Protected context exceeds|_Error:/i.test(slice);
  const thinking = /is reasoning|is thinking|preparing the final response|Checking OpenCode/i.test(
    last,
  );
  const assistant =
    /@jarvis(?! failed)/i.test(slice) &&
    !/_Error:|Protected context exceeds|@jarvis failed/i.test(slice);
  if ((posted && failed) || assistant) {
    console.log(
      JSON.stringify(
        {
          phase: 'result',
          unique,
          ms: Date.now() - started,
          postedMs: posted,
          failed,
          thinking,
          assistant,
          tail: last.slice(-2200),
        },
        null,
        2,
      ),
    );
    await browser.close();
    process.exit(failed ? 2 : 0);
  }
  await page.waitForTimeout(400);
}

console.log(
  JSON.stringify(
    { phase: 'timeout', unique, ms: Date.now() - started, postedMs: posted, tail: last.slice(-2200) },
    null,
    2,
  ),
);
await browser.close();
process.exit(3);
