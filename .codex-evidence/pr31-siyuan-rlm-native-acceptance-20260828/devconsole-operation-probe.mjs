import { chromium } from 'playwright-core';
import { attachOfficialNative, sanitizeEvidence } from '../../scripts/pr31-native-acceptance-harness.mjs';

const attachment = await attachOfficialNative({ chromium, jarvisPid: Number(process.env.JARVIS_PID), cdpPort: 9223 });
try {
  const result = await attachment.page.evaluate(async (needle) => {
    const { useDevConsoleStore } = await import('/src/features/dev-console/store.ts');
    return useDevConsoleStore.getState().entries.filter((entry) =>
      `${entry.message} ${JSON.stringify(entry.detail ?? {})}`.includes(needle),
    );
  }, process.env.NEEDLE ?? 'fetch-323');
  process.stdout.write(`${JSON.stringify(sanitizeEvidence(result), null, 2)}\n`);
} finally {
  await attachment.browser.close();
}
