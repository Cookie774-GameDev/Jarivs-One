import { chromium } from 'playwright-core';
import { attachOfficialNative } from '../../scripts/pr31-native-acceptance-harness.mjs';

const attachment = await attachOfficialNative({
  chromium,
  jarvisPid: Number(process.env.JARVIS_PID),
  cdpPort: 9223,
});
try {
  const page = attachment.page;
  if (new URL(page.url()).searchParams.get('route') !== 'workbench') {
    await page.getByRole('button', { name: 'Workbench', exact: true }).click();
    await page.waitForURL((url) => url.searchParams.get('route') === 'workbench');
  }
  if ((await page.getByTestId('workbench-browser-panel').count()) === 0) {
    await page.getByRole('button', { name: 'Add Browser', exact: true }).click();
  }
  const panel = page.getByTestId('workbench-browser-panel').first();
  await panel.waitFor({ state: 'visible' });
  const address = panel.getByRole('textbox', { name: 'Browser address' });
  await address.fill(process.env.PROBE_URL ?? 'https://example.com/');
  await address.press('Enter');
  await page.waitForTimeout(3000);
  const pages = attachment.browser.contexts().flatMap((context) => context.pages());
  process.stdout.write(`${JSON.stringify({
    address: await address.inputValue(),
    panelText: await panel.innerText(),
    mainUrl: page.url(),
    pages: await Promise.all(pages.map(async (candidate) => ({ url: candidate.url(), title: await candidate.title().catch(() => '') }))),
  }, null, 2)}\n`);
} finally {
  await attachment.browser.close();
}
