import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const pages = browser.contexts().flatMap((c) => c.pages());
const page = pages.find((p) => p.url().includes('5173')) ?? pages[0];
const started = Date.now();
let last = '';
while (Date.now() - started < 90_000) {
  last = await page.evaluate(() => document.body?.innerText ?? '');
  const slice = last.slice(last.lastIndexOf('Spark ping 1786755743948'));
  const failed = /@jarvis failed|Protected context exceeds|_Error:/i.test(slice);
  const done =
    /COMPLETE|Complete|FINAL RESPONSE/i.test(last) &&
    slice.includes('Spark ping') &&
    !/@jarvis is reasoning/i.test(last);
  const hasReply =
    slice.length > 80 &&
    !/@jarvis is reasoning/i.test(slice) &&
    /jarvis|hello|hi|spark|here/i.test(slice.split('\n').slice(2).join('\n'));
  if (failed || done || hasReply) {
    console.log(
      JSON.stringify(
        { ms: Date.now() - started, failed, done, hasReply, tail: last.slice(-2500) },
        null,
        2,
      ),
    );
    await browser.close();
    process.exit(failed ? 2 : 0);
  }
  await page.waitForTimeout(500);
}
console.log(JSON.stringify({ ms: Date.now() - started, timeout: true, tail: last.slice(-2500) }, null, 2));
await browser.close();
process.exit(3);
