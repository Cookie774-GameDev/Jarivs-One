#!/usr/bin/env node
/**
 * Capture REAL screenshots of the built app under the VibeSpace (origami) theme.
 * Self-contained: serves app/dist over http, seeds the persisted UI store with
 * theme='vibespace', then screenshots the major pages.
 *
 *   node scripts/capture-vibespace.mjs
 *
 * Output: docs/screenshots/vibespace/*.png
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'app', 'dist');
const OUT = join(ROOT, 'docs', 'screenshots', 'vibespace');
const PORT = 8941;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
};

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let filePath = join(DIST, urlPath);
    if (urlPath === '/' || !existsSync(filePath) || urlPath.endsWith('/')) {
      // SPA fallback for asset-less routes
      if (!extname(urlPath) || !existsSync(filePath)) filePath = join(DIST, 'index.html');
    }
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

await new Promise((r) => server.listen(PORT, r));
const BASE = `http://127.0.0.1:${PORT}`;

const SEED = {
  state: {
    onboardingComplete: true,
    theme: 'vibespace',
    density: 'cozy',
    navOpen: true,
    inspectorOpen: false,
    route: 'chat',
    lastSeenWhatsNewVersion: '99.99.99',
    productTutorialStatus: 'done',
  },
  version: 4,
};

const SHOTS = [
  { name: 'chat', inspector: false, settle: 4000 },
  { name: 'chat-inspector', inspector: true, settle: 4000 },
  { name: 'agents', inspector: false, navClick: 'Agents', settle: 4000 },
  { name: 'schedule', inspector: false, navClick: 'Schedule', settle: 4000 },
  { name: 'terminals', inspector: false, navClick: 'Terminals', settle: 4500 },
  { name: 'kanban', inspector: false, navClick: 'Kanban', settle: 4000 },
  { name: 'benchmarks', inspector: false, navClick: 'Benchmarks', settle: 4000 },
  { name: 'skills', inspector: false, navClick: 'Skills', settle: 4000 },
  { name: 'tools', inspector: false, navClick: 'Tools', settle: 4000 },
  { name: 'history', inspector: false, navClick: 'History', settle: 4000 },
  { name: 'files', inspector: false, navClick: 'Files', settle: 4000 },
  { name: 'settings-appearance', inspector: false, openSettings: true, settle: 4000 },
  { name: 'isolation-default', inspector: false, theme: 'default', settle: 4000 },
];

await mkdir(OUT, { recursive: true });
const CHROME = process.env.CHROME_PATH
  ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME });
try {
  for (const shot of SHOTS) {
    const seed = { ...SEED, state: { ...SEED.state, inspectorOpen: !!shot.inspector, theme: shot.theme ?? 'vibespace' } };
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: 'light',
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.addInitScript((s) => {
      window.localStorage.setItem('jarvis-ui', JSON.stringify(s));
    }, seed);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    // Dismiss the "What's New" modal if it appears (blocks the workspace view).
    try {
      const gotIt = page.getByRole('button', { name: /got it/i }).first();
      if (await gotIt.isVisible({ timeout: 2500 })) await gotIt.click({ force: true });
    } catch {}
    await page.waitForTimeout(500);
    // Confirm theme applied
    const themeAttr = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    if (shot.navClick) {
      try {
        const nav = page.locator("[data-nav-pane='true']");
        // dispatchEvent bypasses pointer hit-testing so the pet sprite (which
        // can overlap left-nav rows) cannot intercept the routing click.
        await nav.getByText(shot.navClick, { exact: true }).first().dispatchEvent('click');
        await page.waitForTimeout(700);
      } catch (e) {
        console.log(`  nav click '${shot.navClick}' failed: ${e.message}`);
      }
    }
    if (shot.openSettings) {
      try {
        const gear = page.getByRole('button', { name: /settings/i }).first();
        await gear.click({ timeout: 5000, force: true });
        await page.waitForTimeout(900);
        const appearance = page.getByText('Appearance', { exact: true }).first();
        if (await appearance.isVisible({ timeout: 2500 })) await appearance.click({ force: true });
      } catch (e) {
        console.log(`  open settings failed: ${e.message}`);
      }
    }
    await page.waitForTimeout(shot.settle);
    await page.screenshot({ path: join(OUT, `${shot.name}.png`) });
    console.log(`captured ${shot.name}.png  [data-theme=${themeAttr}] consoleErrors=${errors.length}`);
    if (errors.length) console.log('   first error:', errors[0]?.slice(0, 200));
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
