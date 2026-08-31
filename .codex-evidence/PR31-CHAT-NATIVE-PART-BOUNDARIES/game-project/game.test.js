import { test, expect, chromium } from '@playwright/test';

const URL = 'http://127.0.0.1:8137/index.html';

test('Vibe Runner: loads, starts, moves, collects, verifies HUD', async () => {
  const browser = await chromium.launch({
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(URL, { waitUntil: 'load' });

  await expect(page.locator('#game')).toBeVisible();

  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 10000 });

  await page.locator('#btnstart').click();
  await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 5000 });

  const before = await page.evaluate(() => window.__game.playerPos);
  await page.keyboard.down('w');
  await page.waitForTimeout(900);
  await page.keyboard.up('w');
  const after = await page.evaluate(() => window.__game.playerPos);
  const moved = Math.hypot(after.x - before.x, after.z - before.z) > 0.5;
  expect(moved).toBe(true);

  // Deterministically hunt crystals repeatedly to collect at least one
  for (let i = 0; i < 80; i++) {
    const r = await page.evaluate(() => window.__game.seekCrystal());
    if (await page.evaluate(() => window.__game.score) > 0) break;
    await page.waitForTimeout(80);
  }
  const scoreVal = await page.evaluate(() => window.__game.score);
  expect(scoreVal).toBeGreaterThan(0);

  await page.screenshot({ path: 'game-screenshot.png' });

  const hudText = await page.locator('#score').innerText();
  const hudNum = parseInt(hudText.replace(/\D/g, ''), 10);
  expect(hudNum).toBe(scoreVal);

  expect(errors).toEqual([]);
  await browser.close();
});
