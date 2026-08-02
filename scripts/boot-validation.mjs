#!/usr/bin/env node
/**
 * Headless boot validation of the built VibeSpace bundle (web preview).
 * Loads the app, walks core routes, opens Settings, and fails on console
 * errors (React hook/update-depth errors, route crashes, blank screens).
 *
 * Not a substitute for desktop GUI validation - native-only surfaces
 * (PTY terminals, dictation paste) must show honest fallbacks, not crash.
 */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const BASE = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:8943';
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

const seed = {
  state: {
    onboardingComplete: true,
    theme: captureTheme,
    navOpen: true,
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

const errors = [];
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  const text = msg.text();
  // Web preview legitimately lacks the Tauri bridge; ignore its absence.
  if (/tauri|ipc|__TAURI/i.test(text)) return;
  if (/Failed to load resource/i.test(text)) return;
  errors.push(text.slice(0, 300));
});
page.on('pageerror', (err) => errors.push(`pageerror: ${String(err).slice(0, 300)}`));

await page.addInitScript(
  ([storageKey, state]) => {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  },
  [themeContract.storageKey, seed],
);

await page.goto(BASE, { waitUntil: 'networkidle' });
await waitForStableLayout(page);
await page.waitForFunction(() => document.body.innerText.length >= 100);

// Blank-screen check: the workspace shell must render.
const bodyText = await page.evaluate(() => document.body.innerText.length);
if (bodyText < 100) errors.push(`blank screen suspected: body text length ${bodyText}`);
console.log('boot: shell rendered, body text length', bodyText);

// Route walk via nav clicks.
for (const label of ['Schedule', 'Terminals', 'Kanban', 'Benchmarks', 'Agents', 'Skills', 'Chat']) {
  try {
    await page.getByText(label, { exact: true }).first().click({ timeout: 5000 });
    await waitForStableLayout(page);
    console.log(`route: ${label} OK`);
  } catch {
    errors.push(`route ${label}: nav item not clickable`);
  }
}

// Settings via hotkey (Mod+, => Control+Comma on Linux).
await page.keyboard.press('Control+Comma');
const appearanceHeading = page.getByText('Appearance', { exact: true }).first();
const settingsVisible = await appearanceHeading
  .waitFor({ state: 'visible' })
  .then(async () => {
    await waitForStableLayout(page);
    return true;
  })
  .catch(() => false);
console.log('settings modal visible:', settingsVisible);
if (!settingsVisible) errors.push('Settings modal did not open via Mod+,');
await page.keyboard.press('Escape');

// Hook/update-depth error check happens implicitly through console capture.
await browser.close();

if (errors.length > 0) {
  console.error(`\nBOOT VALIDATION FAILED (${errors.length} issues):`);
  for (const err of errors) console.error(' -', err);
  process.exit(1);
}
console.log('\nBOOT VALIDATION PASSED: no console errors, all routes render, settings opens.');
