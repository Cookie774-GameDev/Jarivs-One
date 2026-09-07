import { chromium } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base = process.env.CINEMATIC_URL || 'http://127.0.0.1:8765';
const out = new URL('../../evidence/cinematic-product-world/', import.meta.url);
const browser = await chromium.launch();
const results = [];
async function check(name, run) {
  try {
    await run();
    results.push({ name, pass: true });
    console.log('PASS', name);
  } catch (e) {
    results.push({ name, pass: false, error: e.message });
    console.log('FAIL', name, e.message.slice(0, 400));
  }
}
const mainContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await mainContext.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.goto(base);
await page.waitForFunction(() => document.documentElement.dataset.interactive === 'ready');
await check('hero is immediate on a small laptop', async () => {
  const box = await page
    .getByRole('link', { name: 'Explore VibeSpace', exact: false })
    .first()
    .boundingBox();
  assert(box.y + box.height <= 720);
  assert(await page.locator('h1').isVisible());
});
await check('route changes preserve attached conversation and reveal Hive sequence', async () => {
  const before = await page.locator('#route-context').textContent();
  for (const route of ['anthropic', 'google', 'ollama', 'hive', 'openai']) {
    await page.locator(`[data-route=${route}]`).click();
    assert.equal(await page.locator('#route-context').textContent(), before);
    assert.equal(await page.locator('#hive-stages').isVisible(), route === 'hive');
  }
});
await check('approval cannot be skipped; decline and reset work', async () => {
  for (let i = 0; i < 4; i++) await page.locator('#workflow-next').click();
  assert(await page.locator('#workflow-approval').isVisible());
  assert(!(await page.locator('#workflow-next').isVisible()));
  await page.locator('#workflow-decline').click();
  assert.match(await page.locator('#workflow-title').textContent(), /Declined/);
  await page.locator('#workflow-reset').click();
  for (let i = 0; i < 4; i++) await page.locator('#workflow-next').click();
  await page.locator('#workflow-approve').click();
  assert.match(await page.locator('#workflow-title').textContent(), /result returns/);
});
await check('map, layers and all five prices respond', async () => {
  await page.locator('[data-node=criteria]').click();
  assert.match(await page.locator('#context-description').textContent(), /Reviewer/);
  await page.locator('[data-map=in]').click();
  assert.equal(await page.locator('#map-zoom').textContent(), '110%');
  await page.locator('[data-map=reset]').click();
  for (let i = 0; i < 4; i++) await page.locator(`[data-layer="${i}"]`).click();
  for (const [plan, total] of Object.entries({
    spark: 20,
    orbit: 30,
    nova: 70,
    singularity: 120,
    supernova: 220,
  })) {
    await page.locator(`[data-plan=${plan}]`).click();
    assert.match(
      await page.locator('#plan-summary-title').textContent(),
      new RegExp('\\$' + total + ' monthly'),
    );
  }
});
await check('sample needs no microphone, pause cancels, clear restores', async () => {
  await page.locator('#voice-sample').click();
  assert.match(await page.locator('#voice-transcript').textContent(), /project brief/);
  if (await page.locator('#voice-pause').isEnabled()) await page.locator('#voice-pause').click();
  await page.locator('#voice-clear').click();
  assert.match(await page.locator('#voice-state').textContent(), /Ready/);
});
await check('actual app image dialog closes with Escape and restores focus', async () => {
  const button = page.locator('[data-lightbox]').first();
  await button.click();
  assert(await page.locator('#media-dialog').isVisible());
  await page.keyboard.press('Escape');
  assert.equal(
    await page.evaluate(() => document.activeElement?.hasAttribute('data-lightbox')),
    true,
  );
});
await check('all public chapter anchors are preserved', async () => {
  for (const id of [
    'cover',
    'one-space',
    'many-minds',
    'agents-at-work',
    'ten-terminals',
    'speak-to-work',
    'memory',
    'local-design',
    'built-open',
    'operating-loop',
    'plans',
    'finale',
  ])
    assert.equal(await page.locator(`[id="${id}"]`).count(), 1);
});
await check('chapter jump and browser back', async () => {
  await page.goto(base + '/#one-space');
  await page.locator('.composer-look a').click();
  assert.equal(new URL(page.url()).hash, '#many-minds');
  await page.goBack();
  assert.equal(new URL(page.url()).hash, '#one-space');
});
await check('reduced motion and keyboard keep content usable', async () => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(base);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link');
  await page.keyboard.press('Enter');
  assert.match(await page.locator('#motion-toggle').textContent(), /paused/);
  await page.locator('#assembly-range').focus();
  await page.keyboard.press('Home');
  assert.equal(await page.locator('#assembly-range').inputValue(), '0');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
});
for (const width of [360, 390, 768, 1280, 1440])
  await check(`layout, forward/reverse scrolling and accessibility at ${width}`, async () => {
    await page.setViewportSize({ width, height: width === 1280 ? 720 : 900 });
    await page.goto(base);
    await page.waitForTimeout(800);
    await page.screenshot({
      path: new URL(`copper-${width}-hero.png`, out).pathname.replace(/^\/(.:)/, '$1'),
    });
    for (const id of [
      'one-space',
      'many-minds',
      'agents-at-work',
      'speak-to-work',
      'memory',
      'local-design',
      'plans',
      'finale',
      'cover',
    ]) {
      await page.locator('#' + id).scrollIntoViewIfNeeded();
      await page.waitForTimeout(80);
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        `overflow near ${id}`,
      );
    }
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    await fs.writeFile(new URL(`axe-${width}.json`, out), JSON.stringify(axe.violations, null, 2));
    assert.equal(
      axe.violations.length,
      0,
      JSON.stringify(
        axe.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      ),
    );
  });
await check('touch menu closes after selection', async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const p = await context.newPage();
  await p.goto(base);
  await p.locator('.menu-toggle').tap();
  await p.locator('#mobile-menu a[href="#one-space"]').tap();
  assert(!(await p.locator('#mobile-menu').isVisible()));
  await context.close();
});
await check('WebGL and vendor failures retain functional demos', async () => {
  const context = await browser.newContext();
  await context.route('**/vendor/**', (route) => route.abort());
  const p = await context.newPage();
  await p.goto(base);
  await p.locator('[data-route=hive]').click();
  assert(await p.locator('#hive-stages').isVisible());
  assert.equal(await p.locator('.scene-ready').count(), 0);
  await context.close();
});
await check('microphone denial and unsupported recognition explain the fallback', async () => {
  for (const unsupported of [false, true]) {
    const context = await browser.newContext();
    await context.addInitScript(
      ({ unsupported }) => {
        if (unsupported) {
          window.SpeechRecognition = undefined;
          window.webkitSpeechRecognition = undefined;
        } else {
          window.SpeechRecognition = function () {};
          navigator.mediaDevices.getUserMedia = () =>
            Promise.reject(new DOMException('Denied', 'NotAllowedError'));
        }
      },
      { unsupported },
    );
    const p = await context.newPage();
    await p.goto(base);
    await p.locator('#voice-start').click();
    await p.waitForTimeout(100);
    assert.match(
      await p.locator('#voice-state').textContent(),
      unsupported ? /unsupported/ : /denied/,
    );
    await context.close();
  }
});
await check('late microphone permission is stopped after pause', async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.SpeechRecognition = function () {};
    window.tracksStopped = 0;
    navigator.mediaDevices.getUserMedia = () =>
      new Promise((resolve) => {
        window.resolveMic = () =>
          resolve({
            getTracks: () => [
              {
                stop() {
                  window.tracksStopped++;
                },
              },
            ],
          });
      });
  });
  const p = await context.newPage();
  await p.goto(base);
  await p.locator('#voice-start').click();
  await p.locator('#voice-pause').click();
  await p.evaluate(() => window.resolveMic());
  await p.waitForTimeout(100);
  assert.equal(await p.evaluate(() => window.tracksStopped), 1);
  await context.close();
});
await check('failed app screenshot has a readable fallback', async () => {
  await page.route('**/images/cinematic/*', (route) => route.abort());
  await page.locator('[data-lightbox]').first().click();
  await page.waitForTimeout(100);
  assert.match(await page.locator('#media-caption').textContent(), /could not load/);
  await page.keyboard.press('Escape');
  await page.unroute('**/images/cinematic/*');
});
await check('decorative rendering pauses away from spatial chapters', async () => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator('#many-minds').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  const a = await page.evaluate(() => window.__cinematic.frames);
  await page.waitForTimeout(500);
  const b = await page.evaluate(() => window.__cinematic.frames);
  assert(b - a <= 2, `${b - a} offscreen frames`);
});
for (const theme of ['copper', 'ivory', 'signal'])
  await check(`${theme} preserved desktop and mobile study`, async () => {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}/concepts/${theme}/`);
      await page.waitForTimeout(1000);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({
        path: new URL(`study-${theme}-${width}.png`, out).pathname.replace(/^\/(.:)/, '$1'),
      });
      await page.locator('#assembly-range').fill('0');
      assert.match(await page.locator('#assembly-status').textContent(), /0%/);
      await page.locator('#assembly-range').fill('100');
      await page
        .locator('#one-space')
        .screenshot({
          path: new URL(`study-${theme}-${width}-reveal.png`, out).pathname.replace(
            /^\/(.:)/,
            '$1',
          ),
        });
    }
  });
await check('actual WebGL refusal keeps the sculptural fallback', async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return /webgl/.test(type) ? null : original.call(this, type, ...args);
    };
  });
  const p = await context.newPage();
  await p.goto(base);
  await p.waitForFunction(() => window.__cinematic?.webgl === 'fallback');
  assert(await p.locator('.fallback-v').first().isVisible());
  await p.locator('[data-route=ollama]').click();
  assert.match(await p.locator('#route-mode').textContent(), /machine/);
  await context.close();
});
await check('no JavaScript retains product, prices and chapter navigation', async () => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const p = await context.newPage();
  await p.goto(base);
  assert(await p.locator('h1').isVisible());
  await p.locator('.chapter-menu summary').click();
  await p.locator('.chapter-menu a[href="#plans"]').click();
  assert.equal(new URL(p.url()).hash, '#plans');
  assert.equal(await p.locator('.plan-card').count(), 5);
  await context.close();
});
await check('motion and sound toggles have explicit off states', async () => {
  await page.goto(base);
  assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'false');
  await page.locator('#sound-toggle').click();
  await page.locator('#sound-toggle').click();
  assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'false');
  await page.locator('#motion-toggle').click();
  if ((await page.locator('#motion-toggle').getAttribute('aria-pressed')) === 'false')
    await page.locator('#motion-toggle').click();
  assert.equal(await page.locator('#motion-toggle').getAttribute('aria-pressed'), 'true');
  await page.waitForFunction(() => window.__cinematic.webgl !== 'loading');
  await page.waitForTimeout(300);
  const a = await page.evaluate(() => window.__cinematic.frames);
  await page.waitForTimeout(300);
  assert((await page.evaluate(() => window.__cinematic.frames)) - a <= 2);
});
await check('no uncaught browser errors', async () => assert.deepEqual(errors, []));
await fs.writeFile(new URL('browser-results.json', out), JSON.stringify(results, null, 2));
await browser.close();
if (results.some((r) => !r.pass)) process.exitCode = 1;
