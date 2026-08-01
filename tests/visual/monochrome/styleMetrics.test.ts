import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from '@playwright/test';

import * as styleMetrics from './styleMetrics.ts';
import {
  assertMeaningfulSurface,
  assertMonochromeInvariants,
  boxShadowHasVisiblePaint,
  collectStyleMetrics,
  installDeterministicPrimitives,
  reducedMotionViolations,
  stabilizeDeterministicCapture,
  type StyleMetrics,
} from './styleMetrics.ts';

test('real-time browser work resumes a paused capture clock and restores deterministic time', async (context) => {
  const boundary = (
    styleMetrics as typeof styleMetrics & {
      withDeterministicTimelineRunning?: <T>(
        page: import('@playwright/test').Page,
        operation: () => Promise<T>,
      ) => Promise<T>;
    }
  ).withDeterministicTimelineRunning;
  assert.equal(typeof boundary, 'function', 'the real-time boundary must be implemented');
  if (!boundary) return;

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  context.after(async () => browser.close());
  const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
  await installDeterministicPrimitives(page);
  await page.goto('data:text/html,<main data-monochrome-surface-id="boundary">ready</main>');
  await stabilizeDeterministicCapture(page, 'boundary');

  const timerResult = await boundary(page, () =>
    page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve('timer-fired'), 0);
        }),
    ),
  );

  assert.equal(timerResult, 'timer-fired');
  assert.equal(await page.evaluate(() => Date.now()), Date.parse('2026-07-16T12:00:00.000Z'));
});

test('deterministic capture timeline advances Date, performance, animation frames, and timers coherently', async (context) => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  context.after(async () => browser.close());
  const page = await browser.newPage({ viewport: { width: 320, height: 240 } });

  await installDeterministicPrimitives(page);
  await page.goto('data:text/html,<main data-monochrome-surface-id="timeline">ready</main>');
  await stabilizeDeterministicCapture(page, 'timeline');
  await page.evaluate(() => {
    const observations = {
      animationFrames: [] as number[],
      intervalTicks: [] as number[],
    };
    (globalThis as typeof globalThis & { __timeline?: typeof observations }).__timeline =
      observations;
    const animate = (timestamp: number) => {
      observations.animationFrames.push(timestamp);
      if (observations.animationFrames.length < 4) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
    const interval = setInterval(() => {
      observations.intervalTicks.push(performance.now());
      if (observations.intervalTicks.length === 4) clearInterval(interval);
    }, 16);
  });

  await stabilizeDeterministicCapture(page, 'timeline');
  const first = await page.evaluate(() => ({
    callableDate: Date(),
    dateNow: Date.now(),
    performanceNow: performance.now(),
    timeline: (globalThis as typeof globalThis & { __timeline?: unknown }).__timeline,
  }));

  assert.equal(first.dateNow, Date.parse('2026-07-16T12:00:00.000Z'));
  assert.match(first.callableDate, /2026/u);
  assert.deepEqual(first.timeline, {
    animationFrames: [1104, 1120, 1136, 1152],
    intervalTicks: [1104, 1120, 1136, 1152],
  });
  assert.equal(first.performanceNow, 1152);
});

test('deterministic capture readiness fails closed when identical layout is not product-ready', async () => {
  const runFor: number[] = [];
  const page = {
    clock: {
      runFor: async (ticks: number) => {
        runFor.push(ticks);
      },
      setSystemTime: async () => undefined,
    },
    evaluate: async () => ({
      asyncRendererReady: false,
      fontsReady: true,
      imagesReady: true,
      signature: '0:0:320:240:320:240',
    }),
  };

  await assert.rejects(
    stabilizeDeterministicCapture(
      page as unknown as Parameters<typeof stabilizeDeterministicCapture>[0],
      'never-ready',
      { maximumFrames: 4 },
    ),
    /did not reach three product-ready stable frames/u,
  );
  assert.deepEqual(runFor, [16, 16, 16, 16]);
});

test('pet-host capture waits for its asynchronous renderer to exist and report ready', async (context) => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  context.after(async () => browser.close());
  const page = await browser.newPage({ viewport: { width: 320, height: 240 } });

  await installDeterministicPrimitives(page);
  await page.goto(
    `data:text/html,
      <main data-monochrome-surface-id="overlay:pet-host">pet host</main>
      <script>
        setTimeout(() => {
          const renderer = document.createElement('img');
          renderer.setAttribute('data-pet-render-ready', 'true');
          document.querySelector('main').append(renderer);
        }, 32);
      </script>`,
  );
  await stabilizeDeterministicCapture(page, 'overlay:pet-host');

  assert.equal(await page.locator('[data-pet-render-ready="true"]').count(), 1);
});

test('deterministic capture resets nested scroll only after product readiness is stable', async () => {
  let evaluateCalls = 0;
  const page = {
    clock: {
      runFor: async () => undefined,
      setSystemTime: async () => undefined,
    },
    evaluate: async () => {
      evaluateCalls += 1;
      if (evaluateCalls <= 4) {
        return {
          asyncRendererReady: true,
          fontsReady: true,
          imagesReady: true,
          signature: '0:0:320:240:320:240',
        };
      }
      return 0;
    },
  };

  await stabilizeDeterministicCapture(
    page as unknown as Parameters<typeof stabilizeDeterministicCapture>[0],
    'ready',
  );
  assert.equal(evaluateCalls, 5);
});

test('box-shadow paint detection ignores only fully transparent computed shadows', () => {
  assert.equal(boxShadowHasVisiblePaint('none'), false);
  assert.equal(boxShadowHasVisiblePaint('rgba(0, 0, 0, 0) 0px 0px 0px 0px'), false);
  assert.equal(
    boxShadowHasVisiblePaint(
      'rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px',
    ),
    false,
  );
  assert.equal(boxShadowHasVisiblePaint('rgba(0 0 0 / 0) 0px 0px 0px 0px'), false);
  assert.equal(boxShadowHasVisiblePaint('rgb(0 0 0 / 0) 0px 0px 0px 0px'), false);
  assert.equal(boxShadowHasVisiblePaint('rgb(51, 193, 182) 0px 0px 0px 1px'), true);
  assert.equal(
    boxShadowHasVisiblePaint(
      'rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(51, 193, 182, 0.5) 0px 0px 12px -2px',
    ),
    true,
  );
  assert.equal(boxShadowHasVisiblePaint('var(--unparsed-shadow)'), true);
  assert.equal(
    boxShadowHasVisiblePaint(
      'rgba(0, 0, 0, 0) 0px 0px 0px 0px, color(display-p3 1 0 0) 0px 0px 1px 0px',
    ),
    true,
  );
  assert.equal(
    boxShadowHasVisiblePaint('rgba(0, 0, 0, 0) 0px 0px 0px 0px, var(--unparsed-shadow)'),
    true,
  );
  assert.equal(boxShadowHasVisiblePaint('rgba(0, 0, 0, 0) 0 0'), false);
  assert.equal(boxShadowHasVisiblePaint('inset rgba(0, 0, 0, 0) 0 0 1px'), false);
  assert.equal(boxShadowHasVisiblePaint('rgba(0, 0, 0, 0) 0'), true);
  assert.equal(boxShadowHasVisiblePaint('rgba(0, 0, 0, 0) 0 0 0 0 0'), true);
  assert.equal(boxShadowHasVisiblePaint('inset inset rgba(0, 0, 0, 0) 0 0'), true);
  assert.equal(boxShadowHasVisiblePaint('rgba(0, 0, 0, 0) 10% 0'), true);
  assert.equal(boxShadowHasVisiblePaint('rgba(0, 0, 0, 0) 1 0'), true);
  assert.equal(boxShadowHasVisiblePaint('rgba(0, 0, 0 / 0) 0 0'), true);
  assert.equal(boxShadowHasVisiblePaint('rgba(0 0 0 0) 0 0'), true);
  assert.equal(boxShadowHasVisiblePaint('rgb(0, 0, 0, 0) 0 0'), false);
  assert.equal(boxShadowHasVisiblePaint('rgba(0, 0, 0, 0) 0 0 -1px'), true);
  assert.equal(boxShadowHasVisiblePaint('rgba(59, 130, 246, 0.5) 0 0 0 0'), false);
  assert.equal(
    boxShadowHasVisiblePaint(
      'rgb(255, 255, 255) 0px 0px 0px 0px, rgba(59, 130, 246, 0.5) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px',
    ),
    false,
  );
});

test('meaningful-surface validation accepts visible solid geometry but rejects transparent emptiness', async (context) => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  context.after(async () => browser.close());
  const page = await browser.newPage({ viewport: { width: 240, height: 180 } });
  await page.setContent(`
    <div data-monochrome-surface-id="solid" style="width: 100px; height: 100px">
      <div style="width: 40px; height: 40px; border: 2px solid rgb(255, 255, 255); background: rgb(20, 20, 20)"></div>
    </div>
    <div data-monochrome-surface-id="empty" style="width: 100px; height: 100px">
      <div style="width: 40px; height: 40px; background: transparent"></div>
    </div>
    <div data-monochrome-surface-id="opacity-hidden" style="width: 100px; height: 100px; opacity: 0">
      <button style="width: 40px; height: 40px; background: red">Hidden action</button>
    </div>
    <div data-monochrome-surface-id="content-hidden" style="width: 100px; height: 100px; content-visibility: hidden">
      <div style="width: 40px; height: 40px; background: red"></div>
    </div>
    <div data-monochrome-surface-id="clipped" style="position: relative; width: 100px; height: 100px; overflow: hidden">
      <div style="position: absolute; left: 150px; width: 40px; height: 40px; border: 2px solid red"></div>
    </div>
    <div data-monochrome-surface-id="hidden-semantics" style="width: 100px; height: 100px">
      <div style="visibility: hidden"><button>Hidden</button><svg width="20" height="20"></svg>Hidden text</div>
    </div>
    <div data-monochrome-surface-id="zero-shadow" style="width: 100px; height: 100px">
      <div style="width: 40px; height: 40px; box-shadow: rgb(255, 0, 0) 0 0 0 0"></div>
    </div>
  `);

  await assertMeaningfulSurface(page, 'solid');
  for (const surfaceId of [
    'empty',
    'opacity-hidden',
    'content-hidden',
    'clipped',
    'hidden-semantics',
    'zero-shadow',
  ]) {
    await assert.rejects(
      assertMeaningfulSurface(page, surfaceId),
      /meaningful rendered behavior|surface visibility/u,
      surfaceId,
    );
  }
});

test('meaningful-surface validation permits fixed evidence outside an overflow-visible ancestor', async (context) => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  context.after(async () => browser.close());
  const page = await browser.newPage({ viewport: { width: 240, height: 180 } });
  await page.setContent(`
    <div style="position: relative; width: 10px; height: 10px; overflow: visible">
      <section
        data-monochrome-surface-id="portal"
        style="position: fixed; left: 40px; top: 40px; width: 100px; height: 50px"
      >
        Visible portal content
      </section>
    </div>
  `);

  await assertMeaningfulSurface(page, 'portal');
});

test('opaque zero-geometry inset shadow is pixel-empty and not counted as paint', async (context) => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  context.after(async () => browser.close());
  const page = await browser.newPage({ viewport: { width: 80, height: 80 } });
  await page.setContent(`
    <style>html, body { margin: 0; background: rgb(255, 255, 255); }</style>
    <div id="target" style="width: 40px; height: 40px"></div>
  `);
  const target = page.locator('#target');
  const before = await target.screenshot();
  await target.evaluate((element) => {
    (element as HTMLElement).style.boxShadow = 'inset rgb(255, 0, 0) 0 0 0 0';
  });
  const computed = await target.evaluate((element) => getComputedStyle(element).boxShadow);
  const after = await target.screenshot();

  assert.deepEqual(after, before);
  assert.equal(boxShadowHasVisiblePaint(computed), false);
});

test('style metrics include only paint inside the authenticated surface', async (context) => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  context.after(async () => browser.close());
  const page = await browser.newPage({ viewport: { width: 240, height: 180 } });
  await page.setContent(`
    <style>
      html[data-theme='monochrome'], body { margin: 0; background: rgb(0, 0, 0); }
      #surface {
        position: absolute;
        left: 20px;
        top: 20px;
        width: 100px;
        height: 100px;
        overflow: hidden;
        background: rgb(0, 0, 0);
      }
      .shadow { width: 20px; height: 20px; box-shadow: rgb(255, 255, 255) 0 0 4px; }
      #outside-root { position: absolute; left: 130px; top: 0; }
      #transparent-parent { opacity: 0; }
      #partially-clipped-text {
        position: absolute;
        left: 10px;
        top: 40px;
        width: 60px;
        height: 20px;
        color: rgb(255, 255, 255);
        clip-path: inset(0 50% 0 0);
      }
      #fully-clipped-text {
        position: absolute;
        left: 10px;
        top: 70px;
        width: 60px;
        height: 20px;
        color: rgb(255, 0, 0);
        clip-path: inset(50%);
      }
    </style>
    <html data-theme="monochrome">
      <body>
        <main id="surface" data-monochrome-surface-id="fixture:paint">
          <div id="outside-root" class="shadow"></div>
          <div id="transparent-parent"><div class="shadow"></div></div>
          <div id="partially-clipped-text">Visible sample</div>
          <div id="fully-clipped-text">Not painted</div>
        </main>
      </body>
    </html>
  `);

  const metrics = await collectStyleMetrics(page, 'fixture:paint', 'monochrome');
  assert.equal(metrics.shadowCount, 0);
  assert.equal(metrics.colors.textColor, 'rgb(255, 255, 255)');
  assert.equal(metrics.textContrastRatio, 21);

  await page.setContent(`
    <style>
      html[data-theme='monochrome'], body { margin: 0; background: rgb(0, 0, 0); }
      #surface { width: 100px; height: 100px; overflow: hidden; background: rgb(0, 0, 0); }
      #legacy-screen-reader-text {
        position: absolute;
        width: 80px;
        height: 20px;
        color: rgb(255, 0, 0);
        clip: rect(0, 0, 0, 0);
      }
    </style>
    <html data-theme="monochrome">
      <body>
        <main id="surface" data-monochrome-surface-id="fixture:legacy-clip">
          <span id="legacy-screen-reader-text">Not painted</span>
        </main>
      </body>
    </html>
  `);
  const clippedMetrics = await collectStyleMetrics(page, 'fixture:legacy-clip', 'monochrome');
  assert.equal(clippedMetrics.colors.textColor, '');
  assert.equal(clippedMetrics.textContrastRatio, null);
});

test('style metrics respect outer paint state and visible semantic matches', async (context) => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  context.after(async () => browser.close());
  const page = await browser.newPage({ viewport: { width: 320, height: 240 } });

  await page.setContent(`
    <style>
      html[data-theme='monochrome'], body { margin: 0; background: rgb(0, 0, 0); }
      #hidden-wrapper { opacity: 0; }
      #surface { width: 200px; height: 160px; background: rgb(0, 0, 0); }
      .shadow { width: 20px; height: 20px; box-shadow: rgb(255, 255, 255) 0 0 4px; }
    </style>
    <html data-theme="monochrome">
      <body>
        <div id="hidden-wrapper">
          <main id="surface" data-monochrome-surface-id="fixture:outer-opacity">
            <div class="shadow"></div>
            <span style="color: rgb(255, 255, 255)">Not painted</span>
          </main>
        </div>
      </body>
    </html>
  `);
  const hiddenMetrics = await collectStyleMetrics(page, 'fixture:outer-opacity', 'monochrome');
  assert.equal(hiddenMetrics.shadowCount, 0);
  assert.equal(hiddenMetrics.colors.textColor, '');

  await page.setContent(`
    <style>
      html[data-theme='monochrome'], body { margin: 0; background: rgb(0, 0, 0); }
      #surface { width: 240px; height: 200px; background: rgb(0, 0, 0); }
      #visibility-parent { visibility: hidden; }
      #restored-child {
        visibility: visible;
        color: rgb(255, 255, 255);
        box-shadow: rgb(255, 255, 255) 0 0 4px;
      }
      #static-legacy-clip {
        position: static;
        color: rgb(255, 255, 255);
        clip: rect(0, 0, 0, 0);
        box-shadow: rgb(255, 255, 255) 0 0 4px;
      }
      .hidden { opacity: 0; }
      #visible-panel {
        height: 10px;
        background: rgb(8, 8, 8);
        border-top: 1px solid rgb(42, 42, 42);
      }
      #visible-sidebar { width: 30px; height: 10px; }
      #visible-label { text-transform: capitalize; }
      #visible-accent {
        display: block;
        width: 10px;
        height: 10px;
        background: rgb(0, 128, 0);
      }
    </style>
    <html data-theme="monochrome">
      <body>
        <main id="surface" data-monochrome-surface-id="fixture:semantic-matches">
          <div id="visibility-parent"><span id="restored-child">Visible child</span></div>
          <span id="static-legacy-clip">Static clip is ignored</span>
          <section class="hidden" data-panel style="background: rgb(255, 0, 0)"></section>
          <section id="visible-panel" data-panel></section>
          <aside class="hidden" data-sidebar style="width: 90px"></aside>
          <aside id="visible-sidebar" data-sidebar></aside>
          <label class="hidden" style="text-transform: uppercase">Hidden label</label>
          <label id="visible-label">Visible label</label>
          <span class="hidden" data-accent style="background: rgb(255, 0, 0)"></span>
          <span id="visible-accent" data-accent></span>
        </main>
      </body>
    </html>
  `);
  const visibleMetrics = await collectStyleMetrics(page, 'fixture:semantic-matches', 'monochrome');
  assert.equal(visibleMetrics.shadowCount, 2);
  assert.equal(visibleMetrics.colors.panelBackground, 'rgb(8, 8, 8)');
  assert.equal(visibleMetrics.colors.accentColor, 'rgb(0, 128, 0)');
  assert.equal(visibleMetrics.sidebarWidthPx, 30);
  assert.equal(visibleMetrics.labelCasing, 'capitalize');
  assert.equal(visibleMetrics.colors.textColor, 'rgb(255, 255, 255)');
});

test('reduced-motion rejects every running product animation, including opacity-only springs', () => {
  const violations = reducedMotionViolations([
    {
      durationMs: 440,
      iterations: 1,
      properties: ['opacity'],
      target: 'DIV.opacity-only',
    },
    {
      durationMs: 440,
      iterations: 1,
      properties: ['opacity', 'transform'],
      target: 'DIV.spatial',
    },
    {
      durationMs: 440,
      iterations: Number.POSITIVE_INFINITY,
      properties: ['opacity'],
      target: 'DIV.repeating',
    },
    {
      durationMs: 1_001,
      iterations: 1,
      properties: ['opacity'],
      target: 'DIV.long',
    },
    {
      durationMs: null,
      iterations: null,
      properties: [],
      target: 'unknown',
    },
  ]);

  assert.equal(violations.length, 5);
  assert.match(violations[0]!, /opacity-only/u);
  assert.match(violations[0]!, /opacity/u);
  assert.match(violations[1]!, /transform/u);
  assert.match(violations[2]!, /repeating/u);
  assert.match(violations[3]!, /long/u);
  assert.match(violations[4]!, /unknown/u);
});

test('contrast invariants allow textless surfaces but fail closed for unmeasured visible text', () => {
  const base: StyleMetrics = {
    accentPixelRatio: 0,
    blurCount: 0,
    borderRadiusDistribution: {},
    borderWidths: [],
    colors: {
      accentColor: '',
      bodyBackground: 'rgba(0, 0, 0, 0)',
      borderColor: '',
      panelBackground: 'rgba(0, 0, 0, 0)',
      textColor: '',
    },
    densityIndicator: 0,
    fontCount: 1,
    fontReady: true,
    gradientCount: 0,
    labelCasing: '',
    labelFontFamily: '',
    route: 'detached:pet-overlay',
    selectorScopeLeaks: [],
    shadowCount: 0,
    sidebarWidthPx: null,
    textContrastRatio: null,
    theme: 'monochrome',
    viewport: { height: 941, width: 1672 },
  };

  assert.deepEqual(assertMonochromeInvariants(base), []);
  assert.deepEqual(
    assertMonochromeInvariants({
      ...base,
      colors: { ...base.colors, textColor: 'rgb(232, 235, 238)' },
    }),
    ['body text contrast below 4.5:1: null'],
  );
});
