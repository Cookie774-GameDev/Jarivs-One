import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { attachOfficialNative } from '../../scripts/pr31-native-acceptance-harness.mjs';

const root = 'C:\\Users\\viper\\VibeSpace-UnifiedChungus-Final';
const out = resolve(root, '.codex-evidence/pr31-siyuan-rlm-native-acceptance-20260828', process.env.RUN_LABEL ?? 'workbench-readonly-settle');
const report = { startedAt: new Date().toISOString(), console: [], pageErrors: [] };
const attachment = await attachOfficialNative({ chromium, jarvisPid: Number(process.env.JARVIS_PID), cdpPort: 9223 });
try {
  const page = attachment.page;
  page.on('console', (message) => report.console.push({ type: message.type(), text: message.text().slice(0, 2000) }));
  page.on('pageerror', (error) => report.pageErrors.push(String(error).slice(0, 2000)));
  const panel = page.getByTestId('workbench-browser-panel').last();
  await panel.waitFor({ state: 'visible' });
  if (process.env.INSPECT_ONLY !== '1') {
    await page.waitForFunction(() => {
      const panels = [...document.querySelectorAll('[data-testid="workbench-browser-panel"]')];
      const text = panels.at(-1)?.textContent ?? '';
      return !text.includes('Loading…');
    }, { timeout: 45_000 }).catch(() => undefined);
  }
  report.panels = await page.locator('[data-testid="workbench-browser-panel"]').evaluateAll((nodes) => nodes.map((node, index) => ({
    index,
    attributes: Object.fromEntries([...node.attributes].map((attribute) => [attribute.name, attribute.value])),
    parentAttributes: node.parentElement ? Object.fromEntries([...node.parentElement.attributes].map((attribute) => [attribute.name, attribute.value])) : {},
    ancestors: Array.from({ length: 5 }, (_, offset) => {
      let ancestor = node;
      for (let step = 0; step <= offset; step += 1) ancestor = ancestor?.parentElement;
      return ancestor ? Object.fromEntries([...ancestor.attributes].map((attribute) => [attribute.name, attribute.value])) : {};
    }),
    address: node.querySelector('input[aria-label="Browser address"]')?.value ?? null,
    text: (node.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 500),
  })));
  report.buttons = await page.getByRole('button').evaluateAll((nodes) => nodes.map((node) => ({
    name: node.getAttribute('aria-label') ?? node.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    title: node.getAttribute('title'),
  })).filter((entry) => entry.name || entry.title));
  report.address = await panel.getByRole('textbox', { name: 'Browser address' }).inputValue();
  report.text = await panel.innerText();
  report.surfaceCount = await panel.getByTestId('workbench-browser-native-surface').count();
  report.completedAt = new Date().toISOString();
  await page.screenshot({ path: resolve(out, '02-example-readonly-settle.png'), animations: 'disabled' });
  await writeFile(resolve(out, 'workbench-readonly-settle.json'), `${JSON.stringify(report, null, 2)}\n`);
} finally {
  await attachment.browser.close();
}
