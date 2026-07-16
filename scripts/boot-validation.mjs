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

const BASE = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:8943';
const CURRENT_VERSION = '1.5.0';

const seed = {
  state: {
    onboardingComplete: true,
    theme: 'jarvis-core',
    navOpen: true,
    lastSeenWhatsNewVersion: CURRENT_VERSION,
  },
  version: 12,
};

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

await page.addInitScript(([s]) => {
  window.localStorage.setItem('jarvis-ui', JSON.stringify(s));
}, [seed]);

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Blank-screen check: the workspace shell must render.
const bodyText = await page.evaluate(() => document.body.innerText.length);
if (bodyText < 100) errors.push(`blank screen suspected: body text length ${bodyText}`);
console.log('boot: shell rendered, body text length', bodyText);

// Route walk via nav clicks.
for (const label of ['Schedule', 'Terminals', 'Kanban', 'Benchmarks', 'Agents', 'Skills', 'Chat']) {
  try {
    await page.getByText(label, { exact: true }).first().click({ timeout: 5000 });
    await page.waitForTimeout(1200);
    console.log(`route: ${label} OK`);
  } catch {
    errors.push(`route ${label}: nav item not clickable`);
  }
}

// Settings via hotkey (Mod+, => Control+Comma on Linux).
await page.keyboard.press('Control+Comma');
await page.waitForTimeout(1200);
const settingsVisible = await page.getByText('Appearance', { exact: true }).first().isVisible().catch(() => false);
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
