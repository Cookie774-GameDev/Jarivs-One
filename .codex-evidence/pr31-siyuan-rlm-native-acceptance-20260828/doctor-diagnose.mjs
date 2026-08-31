import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import {
  attachOfficialNative,
  sanitizeEvidence,
} from '../../scripts/pr31-native-acceptance-harness.mjs';

const evidenceDir = path.resolve(
  `.codex-evidence/pr31-siyuan-rlm-native-acceptance-20260828/${process.env.RUN_LABEL ?? 'doctor-diagnose-current'}`,
);
await fs.mkdir(evidenceDir, { recursive: true });
const attachment = await attachOfficialNative({
  chromium,
  jarvisPid: Number(process.env.JARVIS_PID ?? '9084'),
  cdpPort: 9223,
});

try {
  const page = attachment.page;
  await page.waitForLoadState('domcontentloaded');
  const result = await page.evaluate(async () => {
    const { runDefaultPlaywrightFeaturePackDoctorCheck } = await import(
      '/src/features/doctor/playwrightFeaturePackBridge.ts'
    );
    const tauri = window.__TAURI_INTERNALS__;
    if (!tauri || typeof tauri.invoke !== 'function') {
      throw new Error('official_native_tauri_invoke_unavailable');
    }
    const diagnosis = await tauri.invoke('playwright_feature_pack_diagnose');
    const doctorCheck = await runDefaultPlaywrightFeaturePackDoctorCheck();
    return { diagnosis, doctorCheck };
  });

  const screenshotPath = path.join(evidenceDir, '03-playwright-doctor-diagnose.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const report = sanitizeEvidence({
    capturedAt: new Date().toISOString(),
    commit: process.env.BINARY_COMMIT ?? 'unknown',
    scenario: 'Official-native Playwright feature-pack diagnosis only',
    mutationCommandsInvoked: [],
    diagnosis: result.diagnosis,
    doctorCheck: result.doctorCheck,
    screenshotPath,
  });
  await fs.writeFile(
    path.join(evidenceDir, '03-playwright-doctor-diagnose.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await attachment.browser.close();
}
