import { test, expect } from '@playwright/test';
import { MONOCHROME_NATIVE_WINDOW_MANIFEST } from './native-window-manifest.ts';
import {
  BROWSER_CASES,
  NATIVE_CASE_IDS,
  STYLE_METRIC_ORACLE,
  UNAVAILABLE_CASE_ID,
  assertMeaningfulSurface,
  browserPathForEntry,
  prepareDeterministicPage,
} from './styleMetrics.ts';

const NATIVE_CAPABILITY_CLASSIFICATION = [
  { file: 'default.json', classification: 'production' },
  { file: 'pet-mini-panel.json', classification: 'production' },
  { file: 'pet-overlay.json', classification: 'production' },
  { file: 'workbench.json', classification: 'production' },
  { file: 'monochrome-test.json', classification: 'test-only' },
] as const;

test.describe('MC9 browser authority projection', () => {
  test('module-safe projection preserves the frozen coverage closure', () => {
    expect(BROWSER_CASES).toHaveLength(79);
    expect(NATIVE_CASE_IDS).toHaveLength(6);
    expect(UNAVAILABLE_CASE_ID).toBe('future:messaging-channels');
  });

  test('unmeasured MC8B style fields remain explicitly blocked', () => {
    expect(STYLE_METRIC_ORACLE.blockedPendingMc8b).toEqual([
      'accentPixelRatio',
      'borderWidths',
      'densityIndicator',
      'labelCasing',
      'labelFontFamily',
      'palette',
      'radiusDistribution',
      'sidebarWidthPx',
    ]);
  });

  test('classifies four production capability files and one test-only file', () => {
    const productionFiles = NATIVE_CAPABILITY_CLASSIFICATION.filter(
      ({ classification }) => classification === 'production',
    ).map(({ file }) => file);
    const testOnlyFiles = NATIVE_CAPABILITY_CLASSIFICATION.filter(
      ({ classification }) => classification === 'test-only',
    ).map(({ file }) => file);
    expect(productionFiles).toEqual(
      MONOCHROME_NATIVE_WINDOW_MANIFEST.capabilities.map(({ file }) => file),
    );
    expect(testOnlyFiles).toEqual(['monochrome-test.json']);
    expect(productionFiles.some((file) => testOnlyFiles.includes(file))).toBe(false);
  });
});

test.describe('Browser/DOM behavior matrix', () => {
  for (const coverageCase of BROWSER_CASES) {
    test(`${coverageCase.id} exposes product-owned evidence and meaningful content`, async ({
      page,
    }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await prepareDeterministicPage(page, browserPathForEntry(coverageCase), {
        fixtureId: coverageCase.fixtureId,
        surfaceId: coverageCase.id,
        theme: 'monochrome',
      });
      await assertMeaningfulSurface(page, coverageCase.id);
      expect(pageErrors, coverageCase.id).toEqual([]);
    });
  }
});

test.describe('Functional behavior — screenshots are not substitutes', () => {
  test('chat composer accepts the exact message without coercion', async ({ page }) => {
    await prepareDeterministicPage(page, '/chat', {
      fixtureId: 'chat',
      surfaceId: 'route:chat',
      theme: 'monochrome',
    });
    const surface = await assertMeaningfulSurface(page, 'route:chat');
    const composer = surface
      .locator('textarea, input[type="text"], [contenteditable="true"]')
      .filter({ visible: true })
      .first();
    await expect(composer).toBeVisible();
    await composer.fill('Deterministic test message');
    if ((await composer.getAttribute('contenteditable')) === 'true') {
      await expect(composer).toHaveText('Deterministic test message');
    } else {
      await expect(composer).toHaveValue('Deterministic test message');
    }
  });

  test('Escape dismisses the product-owned modal state', async ({ page }) => {
    await prepareDeterministicPage(page, '/chat?monochrome-state=modal-open', {
      fixtureId: 'chat',
      surfaceId: 'state:modal-open',
      theme: 'monochrome',
    });
    const surface = await assertMeaningfulSurface(page, 'state:modal-open');
    await expect(surface).toHaveAttribute('role', 'dialog');
    await expect(surface).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(surface).toBeHidden();
  });

  test('toast state carries an assertive or polite live-region behavior', async ({ page }) => {
    await prepareDeterministicPage(page, '/chat?monochrome-state=toast-visible', {
      fixtureId: 'chat',
      surfaceId: 'state:toast-visible',
      theme: 'monochrome',
    });
    const surface = await assertMeaningfulSurface(page, 'state:toast-visible');
    await expect(surface).toHaveAttribute('role', /^(status|alert)$/);
    await expect(surface).toHaveAttribute('aria-live', /^(polite|assertive)$/);
    await expect(surface).toBeVisible();
  });

  test('locked access state exposes a named gate action', async ({ page }) => {
    await prepareDeterministicPage(page, '/account?monochrome-state=locked', {
      fixtureId: 'settings-appearance',
      surfaceId: 'state:locked-access',
      theme: 'monochrome',
    });
    const surface = await assertMeaningfulSurface(page, 'state:locked-access');
    await expect(
      surface.getByRole('button', { name: /manage billing|restore.*access/iu }).first(),
    ).toBeVisible();
  });
});
