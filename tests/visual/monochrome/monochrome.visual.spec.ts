import { test, expect } from '@playwright/test';
import {
  BROWSER_CASES,
  NATIVE_CASE_IDS,
  STYLE_METRIC_ORACLE,
  UNAVAILABLE_CASE_ID,
  assertMeaningfulSurface,
  assertMonochromeInvariants,
  assertProductReducedMotion,
  browserPathForEntry,
  collectStyleMetrics,
  disableCaptureMotion,
  prepareDeterministicPage,
} from './styleMetrics.ts';

const REQUIRED_STATE_VARIANTS = [
  {
    id: 'usage',
    path: '/account?tab=usage&monochrome-state=usage',
    fixtureId: 'settings-appearance',
  },
  {
    id: 'billing-plans',
    path: '/settings/plans?monochrome-state=billing',
    fixtureId: 'settings-appearance',
  },
  { id: 'dropdown-open', path: '/chat?monochrome-state=dropdown-open', fixtureId: 'chat' },
  { id: 'tooltip-visible', path: '/chat?monochrome-state=tooltip-visible', fixtureId: 'chat' },
  { id: 'empty-state', path: '/chat?monochrome-state=empty', fixtureId: 'chat' },
  { id: 'modal-open', path: '/chat?monochrome-state=modal-open', fixtureId: 'chat' },
  { id: 'toast-visible', path: '/chat?monochrome-state=toast-visible', fixtureId: 'chat' },
  {
    id: 'locked-access',
    path: '/account?monochrome-state=locked',
    fixtureId: 'settings-appearance',
  },
] as const;

const VIEWPORTS = [
  { name: '1672x941', width: 1672, height: 941 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: 'narrow-desktop-960x600', width: 960, height: 600 },
] as const;

function snapshotName(caseId: string): string {
  return `${caseId.replaceAll(':', '--').replaceAll('/', '-')}.png`;
}

test.describe('MonoChrome visual authority closure', () => {
  test('frozen matrix is 79 browser/DOM plus six native-only plus one unavailable', () => {
    expect(BROWSER_CASES).toHaveLength(79);
    expect(NATIVE_CASE_IDS).toHaveLength(6);
    expect(UNAVAILABLE_CASE_ID).toBe('future:messaging-channels');
  });

  test('native rows are recorded but never assigned a Chromium capture', () => {
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

test.describe('MonoChrome visual — complete browser/DOM matrix', () => {
  for (const coverageCase of BROWSER_CASES) {
    test(`${coverageCase.id} — product evidence, capture, computed metrics`, async ({ page }) => {
      await prepareDeterministicPage(page, browserPathForEntry(coverageCase), {
        fixtureId: coverageCase.fixtureId,
        surfaceId: coverageCase.id,
        theme: 'monochrome',
      });
      await assertMeaningfulSurface(page, coverageCase.id);
      await assertProductReducedMotion(page);
      const metrics = await collectStyleMetrics(page, coverageCase.id, 'monochrome');
      expect(assertMonochromeInvariants(metrics), coverageCase.id).toEqual([]);
      await disableCaptureMotion(page);

      await expect(page).toHaveScreenshot(snapshotName(coverageCase.id), {
        animations: 'disabled',
        caret: 'hide',
        fullPage: false,
      });

      for (const metric of STYLE_METRIC_ORACLE.blockedPendingMc8b) {
        test.info().annotations.push({
          type: 'blocked-pending-mc8b',
          description: `${coverageCase.id}:${metric}`,
        });
      }
    });
  }
});

test.describe('MonoChrome visual — named required states', () => {
  for (const state of REQUIRED_STATE_VARIANTS) {
    test(`${state.id} variant`, async ({ page }) => {
      const surfaceId = `state:${state.id}`;
      await prepareDeterministicPage(page, state.path, {
        fixtureId: state.fixtureId,
        surfaceId,
        theme: 'monochrome',
      });
      await assertMeaningfulSurface(page, surfaceId);
      await assertProductReducedMotion(page);
      const metrics = await collectStyleMetrics(page, surfaceId, 'monochrome');
      expect(assertMonochromeInvariants(metrics), surfaceId).toEqual([]);
      await disableCaptureMotion(page);
      await expect(page).toHaveScreenshot(`named-state--${state.id}.png`, {
        animations: 'disabled',
        caret: 'hide',
        fullPage: false,
      });
    });
  }
});

test.describe('MonoChrome visual — measured viewport matrix', () => {
  for (const viewport of VIEWPORTS) {
    test(`route:chat at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await prepareDeterministicPage(page, '/chat', {
        fixtureId: 'chat',
        surfaceId: 'route:chat',
        theme: 'monochrome',
      });
      await assertMeaningfulSurface(page, 'route:chat');
      await assertProductReducedMotion(page);
      const metrics = await collectStyleMetrics(page, 'route:chat', 'monochrome');
      expect(assertMonochromeInvariants(metrics), `route:chat@${viewport.name}`).toEqual([]);
      await disableCaptureMotion(page);
      await expect(page).toHaveScreenshot(`viewport--${viewport.name}.png`, {
        animations: 'disabled',
        caret: 'hide',
        fullPage: false,
      });
    });
  }
});
