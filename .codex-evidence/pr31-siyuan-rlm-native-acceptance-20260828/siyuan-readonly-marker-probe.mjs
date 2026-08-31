import { chromium } from 'playwright-core';
import { attachOfficialNative, sanitizeEvidence } from '../../scripts/pr31-native-acceptance-harness.mjs';

const attachment = await attachOfficialNative({ chromium, jarvisPid: Number(process.env.JARVIS_PID), cdpPort: 9223 });
try {
  const markers = process.env.MARKERS_JSON
    ? JSON.parse(process.env.MARKERS_JSON)
    : ['README.txt', 'photo.png.meta.json', 'sample.bin', 'info.md', 'src/app.ts', 'web/index.html'];
  const result = await attachment.page.evaluate(async (markers) => {
    const [{ invoke }, { useAuthStore }] = await Promise.all([
      import('/node_modules/.vite/deps/@tauri-apps_api_core.js'),
      import('/src/stores/auth.ts'),
    ]);
    const projectId = useAuthStore.getState().projectId;
    const searches = [];
    for (const marker of markers) {
      try {
        const response = await invoke('siyuan_search_blocks', { projectId, query: marker, limit: 25 });
        searches.push({ marker, response });
      } catch (error) {
        searches.push({ marker, error: String(error) });
      }
    }
    return { projectId, searches };
  }, markers);
  process.stdout.write(`${JSON.stringify(sanitizeEvidence(result), null, 2)}\n`);
} finally {
  await attachment.browser.close();
}
