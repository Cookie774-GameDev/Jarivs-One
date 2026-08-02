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
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:8940';
const OUT = new URL('../docs/screenshots/', import.meta.url).pathname;

const themeContract = JSON.parse(
  readFileSync(
    new URL('../app/src/features/appearance/themeContract.source.json', import.meta.url),
    'utf8',
  ),
);
const appPackage = JSON.parse(
  readFileSync(new URL('../app/package.json', import.meta.url), 'utf8'),
);
const captureTheme = themeContract.selectableThemes?.[0]?.id;

if (
  typeof captureTheme !== 'string' ||
  !Number.isInteger(themeContract.storeVersion) ||
  typeof themeContract.storageKey !== 'string' ||
  typeof appPackage.version !== 'string'
) {
  throw new Error('Theme contract or app package metadata is invalid.');
}

const SEED_UI_STATE = {
  state: {
    onboardingComplete: true,
    theme: captureTheme,
    navOpen: true,
    inspectorOpen: false,
    lastSeenWhatsNewVersion: appPackage.version,
  },
  version: themeContract.storeVersion,
};

async function waitForStableLayout(page, selector = '#root') {
  await page.locator(selector).waitFor({ state: 'visible' });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForFunction(async (targetSelector) => {
    const target = document.querySelector(targetSelector);
    if (!target) return false;

    const snapshot = () => {
      const rect = target.getBoundingClientRect();
      return [
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        document.body.scrollWidth,
        document.body.scrollHeight,
      ].join(':');
    };

    const frames = [];
    for (let index = 0; index < 3; index += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      frames.push(snapshot());
    }
    return frames.every((frame) => frame === frames[0]);
  }, selector);
}

const SHOTS = [
  {
    name: 'dictation-overlay',
    path: '/?view=dictation',
    size: { width: 420, height: 260 },
  },
  { name: 'app-chat', path: '/', size: { width: 1440, height: 900 } },
  // Route state is intentionally transient (reload returns to Chat), so
  // navigate the way a user would: click the nav entry.
  {
    name: 'app-schedule',
    path: '/',
    size: { width: 1440, height: 900 },
    navClick: 'Schedule',
  },
  {
    name: 'app-context-map',
    path: '/',
    size: { width: 1440, height: 900 },
    navClick: 'Context',
  },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const shot of SHOTS) {
    const context = await browser.newContext({ viewport: shot.size, colorScheme: 'dark' });
    const page = await context.newPage();
    await page.addInitScript(
      ([storageKey, seed]) => {
        window.localStorage.setItem(storageKey, JSON.stringify(seed));
      },
      [themeContract.storageKey, SEED_UI_STATE],
    );
    await page.goto(`${BASE}${shot.path}`, { waitUntil: 'networkidle' });
    await waitForStableLayout(page);
    if (shot.navClick) {
      await page.getByText(shot.navClick, { exact: true }).first().click();
      await waitForStableLayout(page);
    }
    await page.screenshot({ path: `${OUT}${shot.name}.png` });
    console.log(`captured ${shot.name}.png`);
    await context.close();
  }
} finally {
  await browser.close();
}
