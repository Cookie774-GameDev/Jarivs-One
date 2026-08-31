import { chromium } from 'playwright-core';
import { attachOfficialNative } from '../../scripts/pr31-native-acceptance-harness.mjs';

const attachment = await attachOfficialNative({ chromium, jarvisPid: Number(process.env.JARVIS_PID), cdpPort: 9223 });
try {
  const result = await attachment.page.evaluate(async () => {
    const eventModuleUrl = performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((name) => name.includes('@tauri-apps_api_event'))
      ?? '/node_modules/.vite/deps/@tauri-apps_api_event.js';
    const { listen } = await import(eventModuleUrl);
    const startedAt = performance.now();
    let timer;
    try {
      const unlisten = await Promise.race([
        listen('workbench-browser://state', () => undefined).then((value) => ({ kind: 'resolved', value })),
        new Promise((resolve) => { timer = setTimeout(() => resolve({ kind: 'timeout' }), 5000); }),
      ]);
      if (unlisten.kind === 'resolved') unlisten.value();
      return { kind: unlisten.kind, elapsedMs: Math.round(performance.now() - startedAt), href: location.href };
    } catch (error) {
      return { kind: 'rejected', elapsedMs: Math.round(performance.now() - startedAt), error: String(error), href: location.href };
    } finally {
      clearTimeout(timer);
    }
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await attachment.browser.close();
}
