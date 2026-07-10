#!/usr/bin/env node
/**
 * Capture REAL VibeSpace screenshots from the built web-preview bundle.
 *
 * Usage:
 *   npm run build                              # produce app/dist
 *   (cd app/dist && python3 -m http.server 8940 &)
 *   npx playwright install chromium            # once
 *   node scripts/capture-screenshots.mjs
 *
 * Output lands in docs/screenshots/. Every image is a real render of the
 * actual app bundle (web preview - desktop-only surfaces like live PTYs and
 * native dictation paste need a real desktop capture; see
 * docs/MEDIA_CAPTURE.md for those).
 *
 * Desktop-only captures (Windows/macOS/Linux with a display) are documented
 * in docs/MEDIA_CAPTURE.md - do NOT fake them from the web preview.
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:8940';
const OUT = new URL('../docs/screenshots/', import.meta.url).pathname;

// Mark onboarding complete + a stable theme so captures show the workspace.
// Must match CURRENT_VERSION so the What's New modal stays closed in shots.
const CURRENT_VERSION = process.env.CAPTURE_APP_VERSION ?? '0.1.48';

const SEED_UI_STATE = {
  state: {
    onboardingComplete: true,
    theme: 'jarvis-core',
    navOpen: true,
    inspectorOpen: false,
    lastSeenWhatsNewVersion: CURRENT_VERSION,
  },
  version: 12,
};

const SHOTS = [
  { name: 'dictation-overlay', path: '/?view=dictation', size: { width: 420, height: 260 }, settle: 1200 },
  { name: 'app-chat', path: '/', size: { width: 1440, height: 900 }, settle: 3500 },
  // Route state is intentionally transient (reload returns to Chat), so
  // navigate the way a user would: click the nav entry.
  { name: 'app-schedule', path: '/', size: { width: 1440, height: 900 }, settle: 3500, navClick: 'Schedule' },
  { name: 'app-context-map', path: '/', size: { width: 1440, height: 900 }, settle: 3500, navClick: 'Context' },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const shot of SHOTS) {
    const context = await browser.newContext({ viewport: shot.size, colorScheme: 'dark' });
    const page = await context.newPage();
    await page.addInitScript(([seed]) => {
      window.localStorage.setItem('jarvis-ui', JSON.stringify(seed));
    }, [SEED_UI_STATE]);
    await page.goto(`${BASE}${shot.path}`, { waitUntil: 'networkidle' });
    if (shot.navClick) {
      await page.waitForTimeout(1500);
      await page.getByText(shot.navClick, { exact: true }).first().click();
    }
    await page.waitForTimeout(shot.settle);
    await page.screenshot({ path: `${OUT}${shot.name}.png` });
    console.log(`captured ${shot.name}.png`);
    await context.close();
  }
} finally {
  await browser.close();
}
