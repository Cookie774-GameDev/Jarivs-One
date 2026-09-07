import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
await cdp.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 40,
  downloadThroughput: 1250000,
  uploadThroughput: 625000,
});
await page.addInitScript(() => {
  window.vitals = { lcp: 0, cls: 0 };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.vitals.lcp = e.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (!e.hadRecentInput) window.vitals.cls += e.value;
  }).observe({ type: 'layout-shift', buffered: true });
});
const runs = [];
for (let i = 0; i < 3; i++) {
  await page.goto('http://127.0.0.1:8765/');
  await page.waitForTimeout(2500);
  runs.push(
    await page.evaluate(() => ({
      ...window.vitals,
      transfer: performance
        .getEntriesByType('resource')
        .reduce((sum, r) => sum + r.transferSize, 0),
    })),
  );
}
const smooth = await page.evaluate(
  () =>
    new Promise((resolve) => {
      let last = performance.now(),
        start = last,
        intervals = [];
      function frame(now) {
        intervals.push(now - last);
        last = now;
        if (now - start < 3000) requestAnimationFrame(frame);
        else {
          intervals.sort((a, b) => a - b);
          resolve({
            frames: intervals.length,
            medianInterval: intervals[Math.floor(intervals.length * 0.5)],
            p95Interval: intervals[Math.floor(intervals.length * 0.95)],
          });
        }
      }
      requestAnimationFrame(frame);
    }),
);
const gpu = await page.evaluate(() => {
  const c = document.querySelector('canvas.cinematic-canvas');
  const gl = c?.getContext('webgl2');
  const debug = gl?.getExtension('WEBGL_debug_renderer_info');
  return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable';
});
const result = {
  conditions:
    'Chromium headless on Windows; localhost Python static server; cold browser cache; 40 ms latency, 10 Mbps download, 5 Mbps upload; no CPU throttling. Synthetic lab results, not production field data.',
  browser: browser.version(),
  cpu: os.cpus()[0].model,
  logicalCpus: os.cpus().length,
  gpu,
  runs,
  smooth,
};
await fs.writeFile(
  'evidence/cinematic-product-world/performance.json',
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
await cdp.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1,
});
for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('http://127.0.0.1:8765/');
  for (const id of [
    'one-space',
    'many-minds',
    'agents-at-work',
    'speak-to-work',
    'memory',
    'local-design',
    'plans',
    'finale',
  ]) {
    await page.locator('#' + id).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page
      .locator('#' + id)
      .screenshot({ path: `evidence/cinematic-product-world/section-${id}-${width}.png` });
  }
}
await browser.close();
