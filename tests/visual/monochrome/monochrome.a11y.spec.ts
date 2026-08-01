import { chromium, test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import {
  BROWSER_CASES,
  NATIVE_CASE_IDS,
  assessFocusIndicatorEvidence,
  assessRenderedFocusPixels,
  assertMeaningfulSurface,
  assertProductReducedMotion,
  disableCaptureMotion,
  prepareDeterministicPage,
  withAuthenticatedBrowserScale,
  type FocusIndicatorEvidence,
  type MonochromeFixtureId,
} from './styleMetrics.ts';
import { MONOCHROME_ZOOM_ROWS } from './route-manifest.ts';

const ROUTE_CASES = BROWSER_CASES.filter(
  (entry): entry is (typeof BROWSER_CASES)[number] & { routeId: string } =>
    entry.kind === 'route' && entry.routeId !== null,
);
const BROWSER_ZOOM_EXTENSION = path.resolve('tests/visual/monochrome/browser-zoom-extension');
const browserZoomTest = test.extend<{ zoomPage: Page }>({
  zoomPage: async ({ baseURL }, use) => {
    if (!baseURL) throw new Error('browser zoom test requires the configured loopback baseURL');
    const context = await chromium.launchPersistentContext('', {
      args: [
        '--force-color-profile=srgb',
        '--disable-features=PaintHolding',
        '--mute-audio',
        `--disable-extensions-except=${BROWSER_ZOOM_EXTENSION}`,
        `--load-extension=${BROWSER_ZOOM_EXTENSION}`,
      ],
      baseURL,
      channel: 'msedge',
      colorScheme: 'light',
      deviceScaleFactor: 1,
      headless: true,
      locale: 'en-US',
      reducedMotion: 'reduce',
      serviceWorkers: 'allow',
      timezoneId: 'UTC',
      viewport: { height: 900, width: 1440 },
    });
    const zoomPage = context.pages()[0] ?? (await context.newPage());
    try {
      await use(zoomPage);
    } finally {
      await context.close();
    }
  },
});

function fixtureForRoute(routeId: string): MonochromeFixtureId {
  if (['terminal', 'workbench', 'context'].includes(routeId)) return 'terminal-workbench';
  if (routeId === 'account') return 'settings-appearance';
  return 'chat';
}

interface FocusScreenshotClip {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

async function waitForTwoPaints(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

async function captureRenderedFocusPixels(
  page: Page,
  selector: string,
  clip: FocusScreenshotClip,
): Promise<ReturnType<typeof assessRenderedFocusPixels>> {
  const target = page.locator(selector);
  await target.evaluate((element) => (element as HTMLElement).blur());
  await waitForTwoPaints(page);
  const before = await page.screenshot({
    animations: 'disabled',
    caret: 'hide',
    clip,
    scale: 'css',
  });

  await target.evaluate((element) => (element as HTMLElement).focus({ preventScroll: true }));
  await waitForTwoPaints(page);
  const focused = await page.screenshot({
    animations: 'disabled',
    caret: 'hide',
    clip,
    scale: 'css',
  });
  return assessRenderedFocusPixels(before, focused);
}

async function assertNonRenderedFocusIndicatorsRejected(page: Page): Promise<void> {
  const fixtures = await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'monochrome-focus-oracle-fixtures';
    host.innerHTML = `
      <style>
        #monochrome-focus-oracle-fixtures {
          inset: 12px auto auto 12px;
          position: fixed;
          z-index: 2147483647;
        }
        #monochrome-focus-oracle-fixtures button {
          all: unset !important;
          background: rgb(16, 16, 16) !important;
          border: 0 !important;
          box-shadow: none !important;
          box-sizing: border-box !important;
          color: transparent !important;
          display: block !important;
          height: 24px !important;
          outline: none !important;
          padding: 0 !important;
          width: 40px !important;
        }
        #monochrome-focus-oracle-fixtures #monochrome-focus-oracle-opacity {
          opacity: 0 !important;
        }
        #monochrome-focus-oracle-opacity:focus,
        #monochrome-focus-oracle-clipped:focus {
          outline: 4px solid rgb(255, 255, 255) !important;
          outline-offset: 2px !important;
        }
        #monochrome-focus-oracle-clip {
          background: rgb(16, 16, 16);
          height: 24px;
          margin-top: 12px;
          overflow: hidden;
          width: 40px;
        }
      </style>
      <button id="monochrome-focus-oracle-opacity" type="button">opacity fixture</button>
      <div id="monochrome-focus-oracle-clip">
        <button id="monochrome-focus-oracle-clipped" type="button">clipped fixture</button>
      </div>
    `;
    document.body.append(host);

    const clipFor = (element: HTMLElement): FocusScreenshotClip => {
      const rect = element.getBoundingClientRect();
      const padding = 8;
      return {
        height: Math.ceil(rect.height + padding * 2),
        width: Math.ceil(rect.width + padding * 2),
        x: Math.max(0, Math.floor(rect.left + scrollX - padding)),
        y: Math.max(0, Math.floor(rect.top + scrollY - padding)),
      };
    };
    return [
      {
        clip: clipFor(document.querySelector<HTMLElement>('#monochrome-focus-oracle-opacity')!),
        label: 'fully transparent focus indicator',
        selector: '#monochrome-focus-oracle-opacity',
      },
      {
        clip: clipFor(document.querySelector<HTMLElement>('#monochrome-focus-oracle-clipped')!),
        label: 'overflow-clipped focus indicator',
        selector: '#monochrome-focus-oracle-clipped',
      },
    ];
  });

  try {
    for (const fixture of fixtures) {
      const rendered = await captureRenderedFocusPixels(page, fixture.selector, fixture.clip);
      expect(rendered.changedPixelCount, `${fixture.label} has no rendered pixel delta`).toBe(0);
      expect(rendered.contrastPixelCount, `${fixture.label} has no rendered 3:1 pixels`).toBe(0);
      expect(rendered.passesContrast, `${fixture.label} cannot satisfy the focus oracle`).toBe(
        false,
      );
    }
  } finally {
    await page.locator('#monochrome-focus-oracle-fixtures').evaluate((element) => element.remove());
  }
}

async function keyboardAndFocusEvidence(page: Page): Promise<void> {
  const focusableCount = await page
    .locator('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
    .count();
  expect(focusableCount, 'non-vacuous keyboard target set').toBeGreaterThan(0);

  const evidence: Array<
    FocusIndicatorEvidence & {
      readonly focusPresentationRestored: boolean;
      readonly signature: string;
      readonly visible: boolean;
    }
  > = [];
  for (let index = 0; index < Math.min(focusableCount, 6); index += 1) {
    await page.keyboard.press('Tab');
    const probeId = `focus-${index}`;
    const item = await page.evaluate((focusProbeId) => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement) || element === document.body) {
        return null;
      }
      element.setAttribute('data-monochrome-focus-probe', focusProbeId);
      const snapshot = (target: HTMLElement) => {
        const style = getComputedStyle(target);
        return {
          backgroundColor: style.backgroundColor,
          borderTopColor: style.borderTopColor,
          borderTopStyle: style.borderTopStyle,
          borderTopWidth: style.borderTopWidth,
          boxShadow: style.boxShadow,
          outlineColor: style.outlineColor,
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
        };
      };
      const keyboardFocused = snapshot(element);
      element.blur();
      const before = snapshot(element);
      element.focus({ preventScroll: true });
      const focused = snapshot(element);
      const focusPresentationRestored = JSON.stringify(keyboardFocused) === JSON.stringify(focused);

      const outlineChanged =
        (before.outlineColor !== focused.outlineColor ||
          before.outlineStyle !== focused.outlineStyle ||
          before.outlineWidth !== focused.outlineWidth) &&
        focused.outlineStyle !== 'none' &&
        Number.parseFloat(focused.outlineWidth) > 0;
      const boxShadowChanged =
        before.boxShadow !== focused.boxShadow && focused.boxShadow !== 'none';
      const borderChanged =
        (before.borderTopColor !== focused.borderTopColor ||
          before.borderTopStyle !== focused.borderTopStyle ||
          before.borderTopWidth !== focused.borderTopWidth) &&
        focused.borderTopStyle !== 'none' &&
        Number.parseFloat(focused.borderTopWidth) > 0;
      const backgroundChanged = before.backgroundColor !== focused.backgroundColor;
      const indicator = outlineChanged
        ? 'outline'
        : boxShadowChanged
          ? 'boxShadow'
          : borderChanged
            ? 'border'
            : backgroundChanged
              ? 'background'
              : null;
      const rect = element.getBoundingClientRect();
      const padding = 8;
      const pageWidth = Math.max(document.documentElement.scrollWidth, innerWidth);
      const pageHeight = Math.max(document.documentElement.scrollHeight, innerHeight);
      const left = Math.max(0, Math.floor(rect.left + scrollX - padding));
      const top = Math.max(0, Math.floor(rect.top + scrollY - padding));
      const right = Math.min(pageWidth, Math.ceil(rect.right + scrollX + padding));
      const bottom = Math.min(pageHeight, Math.ceil(rect.bottom + scrollY + padding));
      const visible = rect.width > 0 && rect.height > 0 && right > left && bottom > top;
      return {
        before,
        clip: visible
          ? {
              height: bottom - top,
              width: right - left,
              x: left,
              y: top,
            }
          : null,
        focused,
        focusPresentationRestored,
        indicator,
        signature: [
          element.tagName,
          element.id,
          element.getAttribute('name'),
          element.getAttribute('aria-label'),
          element.textContent?.trim().slice(0, 40),
        ].join(':'),
        visible,
      };
    }, probeId);
    if (!item) continue;

    const selector = `[data-monochrome-focus-probe="${probeId}"]`;
    try {
      const rendered = item.clip
        ? await captureRenderedFocusPixels(page, selector, item.clip)
        : {
            changedPixelCount: 0,
            contrastPixelCount: 0,
            maxContrast: null,
          };
      evidence.push({
        ...item,
        beforeFocusedContrast: rendered.maxContrast,
        renderedChangedPixelCount: rendered.changedPixelCount,
        renderedContrastPixelCount: rendered.contrastPixelCount,
      });
    } finally {
      await page
        .locator(selector)
        .evaluate((element) => element.removeAttribute('data-monochrome-focus-probe'));
    }
  }

  const unique = new Set(
    evidence.filter(({ visible }) => visible).map(({ signature }) => signature),
  );
  expect(unique.size, 'keyboard traversal visits distinct visible controls').toBeGreaterThanOrEqual(
    Math.min(2, focusableCount),
  );
  for (const item of evidence.filter(({ visible }) => visible)) {
    expect(
      item.focusPresentationRestored,
      `${item.signature} keyboard focus presentation survives same-element state sampling`,
    ).toBe(true);
    const assessment = assessFocusIndicatorEvidence(item);
    expect(assessment.hasVisibleDelta, `${item.signature} focus-state presentation delta`).toBe(
      true,
    );
    expect(assessment.passesContrast, `${item.signature} changed focus indicator contrast`).toBe(
      true,
    );
  }
}

test.describe('Every production route — explicit accessibility matrix', () => {
  for (const entry of ROUTE_CASES) {
    test(`${entry.routeId}: Axe, tree, names, keyboard, focus and reduced motion`, async ({
      page,
    }) => {
      const surfaceId = `a11y:route:${entry.routeId}`;
      await prepareDeterministicPage(page, `/${entry.routeId}`, {
        fixtureId: entry.fixtureId,
        surfaceId,
        theme: 'monochrome',
      });
      const surface = await assertMeaningfulSurface(page, surfaceId);

      const audit = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
        .analyze();
      expect(audit.violations, `${entry.routeId} all Axe impact levels`).toEqual([]);

      const ariaTree = await surface.ariaSnapshot();
      expect(ariaTree.trim().length, `${entry.routeId} non-empty ARIA tree`).toBeGreaterThan(0);

      const nameless = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea')]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          })
          .filter((element) => {
            const labelledBy = element.getAttribute('aria-labelledby');
            const label = element.getAttribute('aria-label');
            const text = element.textContent?.trim();
            const title = element.getAttribute('title');
            const inputLabel =
              element instanceof HTMLInputElement && (element.labels?.length ?? 0) > 0;
            return !labelledBy && !label && !text && !title && !inputLabel;
          })
          .map((element) => element.outerHTML.slice(0, 160)),
      );
      expect(nameless, `${entry.routeId} interactive accessible names`).toEqual([]);

      await keyboardAndFocusEvidence(page);
      await assertProductReducedMotion(page);
      await disableCaptureMotion(page);
      await expect(page).toHaveScreenshot(`a11y-route--${entry.routeId}--1440x900.png`, {
        animations: 'disabled',
        caret: 'hide',
        fullPage: false,
      });
    });
  }
});

browserZoomTest.describe('Zoom/reflow — authenticated browser-owned tab zoom', () => {
  for (const zoom of MONOCHROME_ZOOM_ROWS) {
    browserZoomTest(
      `${zoom.label} browser tab zoom avoids app-chrome two-axis scroll`,
      async ({ zoomPage }) => {
        await prepareDeterministicPage(zoomPage, '/chat', {
          fixtureId: 'chat',
          surfaceId: zoom.surfaceId,
          theme: 'monochrome',
        });
        await withAuthenticatedBrowserScale(zoomPage, zoom, async () => {
          const result = await zoomPage.evaluate(() => {
            const root = document.documentElement;
            const isScrollableOverflow = (value: string) =>
              value === 'auto' || value === 'scroll' || value === 'overlay';
            const hasReachableScrollableAncestor = (
              element: HTMLElement,
              axis: 'horizontal' | 'vertical',
            ) => {
              for (
                let ancestor = element.parentElement;
                ancestor && ancestor !== document.body && ancestor !== root;
                ancestor = ancestor.parentElement
              ) {
                const style = getComputedStyle(ancestor);
                const rect = ancestor.getBoundingClientRect();
                const intersectsViewport =
                  rect.right > 0 &&
                  rect.bottom > 0 &&
                  rect.left < root.clientWidth &&
                  rect.top < root.clientHeight;
                const scrollable =
                  axis === 'horizontal'
                    ? isScrollableOverflow(style.overflowX) &&
                      ancestor.scrollWidth > ancestor.clientWidth + 1
                    : isScrollableOverflow(style.overflowY) &&
                      ancestor.scrollHeight > ancestor.clientHeight + 1;
                if (intersectsViewport && scrollable) return true;
              }
              return false;
            };
            const clippedControls = [
              ...document.querySelectorAll<HTMLElement>(
                'header button, nav button, nav a[href], [data-app-chrome] button',
              ),
            ]
              .filter((element) => {
                const rect = element.getBoundingClientRect();
                if (rect.width <= 0 || rect.height <= 0) return false;
                const outsideHorizontal = rect.left < 0 || rect.right > root.clientWidth;
                const outsideVertical = rect.top < 0 || rect.bottom > root.clientHeight;
                return (
                  (outsideHorizontal && !hasReachableScrollableAncestor(element, 'horizontal')) ||
                  (outsideVertical && !hasReachableScrollableAncestor(element, 'vertical'))
                );
              })
              .map((element) => {
                const rect = element.getBoundingClientRect();
                return {
                  control:
                    element.getAttribute('aria-label') ??
                    element.textContent?.trim().slice(0, 80) ??
                    element.tagName,
                  rect: {
                    bottom: Math.round(rect.bottom),
                    left: Math.round(rect.left),
                    right: Math.round(rect.right),
                    top: Math.round(rect.top),
                  },
                };
              });
            return {
              clippedControls,
              horizontal: root.scrollWidth > root.clientWidth,
              vertical: root.scrollHeight > root.clientHeight,
            };
          });
          expect(result.horizontal && result.vertical, zoom.label).toBe(false);
          expect(result.clippedControls, zoom.label).toEqual([]);
        });
      },
    );
  }

  for (const routeId of ['canvas', 'context'] as const) {
    test(`${routeId} permits two-axis scrolling only inside its spatial viewport`, async ({
      page,
    }) => {
      await prepareDeterministicPage(page, `/${routeId}`, {
        fixtureId: fixtureForRoute(routeId),
        surfaceId: `spatial:${routeId}`,
        theme: 'monochrome',
      });
      const documentOverflow = await page.evaluate(() => {
        const root = document.documentElement;
        return root.scrollWidth > root.clientWidth && root.scrollHeight > root.clientHeight;
      });
      expect(documentOverflow, `${routeId} document/app chrome`).toBe(false);
    });
  }
});

test.describe('Numerical contrast and status semantics', () => {
  test('visible text uses alpha-composited 4.5:1 normal and 3:1 large-text oracles', async ({
    page,
  }) => {
    await prepareDeterministicPage(page, '/chat?monochrome-state=tooltip-visible', {
      fixtureId: 'chat',
      surfaceId: 'a11y:text-contrast',
      theme: 'monochrome',
    });
    const samples = await page.evaluate(() => {
      type Rgba = [number, number, number, number];
      const parse = (value: string): Rgba | null => {
        const match = value.match(
          /rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\)/u,
        );
        return match
          ? [
              Number(match[1]),
              Number(match[2]),
              Number(match[3]),
              match[4] === undefined ? 1 : Number(match[4]),
            ]
          : null;
      };
      const composite = (foreground: Rgba, background: Rgba): Rgba => {
        const alpha = foreground[3] + background[3] * (1 - foreground[3]);
        if (alpha === 0) return [0, 0, 0, 0];
        return [
          (foreground[0] * foreground[3] + background[0] * background[3] * (1 - foreground[3])) /
            alpha,
          (foreground[1] * foreground[3] + background[1] * background[3] * (1 - foreground[3])) /
            alpha,
          (foreground[2] * foreground[3] + background[2] * background[3] * (1 - foreground[3])) /
            alpha,
          alpha,
        ];
      };
      const effectiveBackground = (element: Element | null): Rgba => {
        const layers: Rgba[] = [];
        let cursor = element;
        while (cursor) {
          const parsed = parse(getComputedStyle(cursor).backgroundColor);
          if (parsed) layers.push(parsed);
          cursor = cursor.parentElement;
        }
        let result: Rgba = [255, 255, 255, 1];
        for (const layer of layers.reverse()) result = composite(layer, result);
        return result;
      };
      const luminance = ([red, green, blue]: Rgba): number =>
        [red, green, blue]
          .map((channel) => {
            const value = channel / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
          })
          .reduce(
            (sum, channel, component) => sum + channel * [0.2126, 0.7152, 0.0722][component],
            0,
          );

      return [...document.querySelectorAll<HTMLElement>('body *')]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            [...element.childNodes].some(
              (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
            )
          );
        })
        .map((element) => {
          const style = getComputedStyle(element);
          const foreground = parse(style.color);
          if (!foreground) return null;
          const background = effectiveBackground(element);
          const renderedForeground = composite(foreground, background);
          const first = luminance(renderedForeground);
          const second = luminance(background);
          const ratio = (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
          const fontSize = Number.parseFloat(style.fontSize);
          const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
          return {
            label: element.textContent?.trim().slice(0, 80) ?? element.tagName,
            minimum: fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700) ? 3 : 4.5,
            ratio,
          };
        })
        .filter(
          (sample): sample is { label: string; minimum: number; ratio: number } => sample !== null,
        );
    });
    expect(samples.length, 'non-vacuous visible text sample').toBeGreaterThan(0);
    for (const sample of samples) {
      expect.soft(sample.ratio, sample.label).toBeGreaterThanOrEqual(sample.minimum);
    }
  });

  test('focus, status and tooltip evidence is non-vacuous and uses the 3:1 oracle', async ({
    page,
  }) => {
    await prepareDeterministicPage(page, '/chat?monochrome-state=tooltip-visible', {
      fixtureId: 'chat',
      surfaceId: 'a11y:non-text-contrast',
      theme: 'monochrome',
    });
    await keyboardAndFocusEvidence(page);
    await assertNonRenderedFocusIndicatorsRejected(page);
    await page.getByRole('button', { name: 'Toggle navigation' }).focus();
    await expect(page.getByRole('tooltip')).toBeVisible();
    const audit = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
    expect(audit.violations, 'tooltip and visible text contrast').toEqual([]);

    const semantics = await page.evaluate(() => {
      const tooltipCount = [...document.querySelectorAll<HTMLElement>('[role="tooltip"]')].filter(
        (element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        },
      ).length;
      const statuses = [
        ...document.querySelectorAll<HTMLElement>(
          '[role="status"], [data-status], [aria-selected]',
        ),
      ]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map((element) => ({
          hasNonColorCue: Boolean(
            element.textContent?.trim() ||
            element.getAttribute('aria-label') ||
            element.querySelector('svg, img, [aria-hidden="true"]'),
          ),
          html: element.outerHTML.slice(0, 160),
        }));
      return { statuses, tooltipCount };
    });
    expect(semantics.tooltipCount, 'named tooltip state renders a tooltip').toBeGreaterThan(0);
    for (const status of semantics.statuses) {
      expect.soft(status.hasNonColorCue, status.html).toBe(true);
    }
  });
});

test.describe('Pointer targets, forced colors and platform boundary', () => {
  test('targets satisfy WCAG spacing and retained product contracts remain 44x44', async ({
    page,
  }) => {
    await prepareDeterministicPage(page, '/chat', {
      fixtureId: 'chat',
      surfaceId: 'a11y:pointer-targets',
      theme: 'monochrome',
    });
    const evidence = await page.evaluate(() => {
      const targets = [
        ...document.querySelectorAll<HTMLElement>(
          'a[href], button, input, select, textarea, [role="button"], [role="link"]',
        ),
      ]
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.width > 0 && rect.height > 0);
      const failures = targets
        .filter(({ rect }, index) => {
          if (rect.width >= 24 && rect.height >= 24) return false;
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          return targets.some(({ rect: other }, otherIndex) => {
            if (index === otherIndex) return false;
            const otherX = other.left + other.width / 2;
            const otherY = other.top + other.height / 2;
            return Math.hypot(centerX - otherX, centerY - otherY) < 24;
          });
        })
        .map(
          ({ element, rect }) =>
            `${element.tagName} ${Math.round(rect.width)}x${Math.round(rect.height)} ${
              element.getAttribute('aria-label') || element.textContent?.trim() || element.outerHTML
            }`,
        );
      const retained44 = [...document.querySelectorAll<HTMLElement>('[data-min-target="44"]')].map(
        (element) => {
          const rect = element.getBoundingClientRect();
          return { height: rect.height, html: element.outerHTML.slice(0, 120), width: rect.width };
        },
      );
      return { failures, retained44, targetCount: targets.length };
    });
    expect(evidence.targetCount, 'non-vacuous pointer target set').toBeGreaterThan(0);
    expect(evidence.failures).toEqual([]);
    expect(
      evidence.retained44.filter(({ height, width }) => width < 44 || height < 44),
      'existing 44x44 contracts remain 44x44',
    ).toEqual([]);
  });

  test('forced-colors keeps multiple controls and keyboard focus visible', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await prepareDeterministicPage(page, '/chat', {
      fixtureId: 'chat',
      surfaceId: 'a11y:forced-colors',
      theme: 'monochrome',
    });
    expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
    await keyboardAndFocusEvidence(page);
    await assertProductReducedMotion(page);
    await disableCaptureMotion(page);
    await expect(page).toHaveScreenshot('forced-colors--chat.png', {
      animations: 'disabled',
      caret: 'hide',
      fullPage: false,
    });
  });

  test('six native-only rows remain explicitly outside Chromium proof', () => {
    expect(NATIVE_CASE_IDS).toEqual([
      'native:dictation',
      'native:main',
      'native:pet-mini-panel',
      'native:pet-overlay',
      'native:preview-surface',
      'native:workbench-main',
    ]);
  });
});

test.describe('MC-033 production-navigation negative', () => {
  test('production navigation does not expose the development-only workbench', async ({ page }) => {
    await prepareDeterministicPage(page, '/chat', {
      fixtureId: 'chat',
      surfaceId: 'a11y:production-navigation',
      theme: 'monochrome',
    });
    const exposed = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLAnchorElement>('nav a[href], [role="navigation"] a[href]')]
        .filter((link) =>
          /monochrome-workbench|primitive-workbench|monochrome-state=workbench/iu.test(link.href),
        )
        .map((link) => link.href),
    );
    expect(exposed).toEqual([]);
  });
});
