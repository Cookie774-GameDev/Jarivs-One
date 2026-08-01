import { expect, test } from '@playwright/test';
import { assertNoViteOverlay, captureEvidence, prepareRealApp, SAKURA_REFERENCE } from './fixtures';

const SAKURA_ROUTES = [
  { name: 'Chat', hook: "[data-sakura-surface='chat-route']" },
  { name: 'Canvas', hook: "[data-sakura-route='canvas']" },
  { name: 'Kanban', hook: "[data-sakura-route='kanban']" },
  { name: 'Schedule', hook: "[data-sakura-route='schedule']" },
  { name: 'Benchmarks', hook: "[data-sakura-route='benchmarks']" },
] as const;

async function assertNoHorizontalOverflow(page: import('@playwright/test').Page): Promise<void> {
  const geometry = await page.evaluate(() => ({
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  expect(geometry.documentScrollWidth).toBeLessThanOrEqual(geometry.documentClientWidth + 1);
  expect(geometry.bodyScrollWidth).toBeLessThanOrEqual(geometry.bodyClientWidth + 1);
}

test('Sakura shell preserves the reference composition across representative routes', async ({
  page,
}, testInfo) => {
  await prepareRealApp(page, testInfo);

  const shell = page.locator("[data-sakura-shell='true']");
  const frame = page.locator("[data-sakura-shell-frame='true']");
  const backdrop = page.locator('[data-sakura-backdrop]');
  const scene = page.locator('[data-sakura-scene]');
  const petals = page.locator('[data-sakura-petal]');

  await expect(shell).toBeVisible();
  await expect(frame).toBeVisible();
  await expect(backdrop).toBeVisible();
  await expect(scene).toBeVisible();
  const navigation = page.locator("[data-sakura-shell-region='navigation']");
  await expect(navigation).toBeVisible();
  await expect(page.locator("[data-sakura-shell-region='top-bar']")).toBeVisible();

  const materials = await navigation.evaluate((element) => {
    const regionStyle = getComputedStyle(element);
    const frameStyle = getComputedStyle(
      element.closest("[data-sakura-shell-frame='true']") as HTMLElement,
    );
    return {
      background: regionStyle.backgroundColor,
      border: frameStyle.borderTopColor,
      radius: Number.parseFloat(frameStyle.borderTopLeftRadius),
      backdrop: regionStyle.backdropFilter,
    };
  });
  expect(materials.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(materials.border).not.toBe('rgba(0, 0, 0, 0)');
  expect(materials.radius).toBeGreaterThan(0);
  expect(materials.backdrop).not.toBe('none');

  const rendering = await backdrop.getAttribute('data-sakura-rendering');
  expect(['enhanced', 'static']).toContain(rendering);
  if (rendering === 'enhanced') {
    await expect(petals).toHaveCount(8);
    const normalMotion = await petals.first().evaluate((element) => {
      const style = getComputedStyle(element);
      return { name: style.animationName, duration: style.animationDuration };
    });
    expect(normalMotion.name).toContain('sakura-petal-drift');
    expect(normalMotion.duration).not.toBe('0s');
  } else {
    await expect(petals).toHaveCount(0);
    await expect(scene).toHaveCSS('transform', 'none');
    await expect(scene).toHaveCSS('transition-duration', '0s');
  }

  for (const route of SAKURA_ROUTES) {
    const navItem = page.getByRole('button', { name: route.name, exact: true });
    await expect(navItem).toBeVisible();
    await navItem.click();
    await expect(navItem).toHaveAttribute('aria-current', 'page');
    await expect(page.locator(route.hook)).toBeVisible();
    await assertNoViteOverlay(page);
    await assertNoHorizontalOverflow(page);
    await captureEvidence(page, testInfo, `sakura-${route.name.toLowerCase()}`);
  }

  expect(SAKURA_REFERENCE.sha256).toBe(
    '76611A6BBFF4E0744F30EB95F254FAFE036DC035D6E9E5957066F0780B342FA3',
  );
  expect(SAKURA_REFERENCE.source).toBe(
    'C:\\Users\\viper\\Downloads\\VibeSpace-Sakura-UI-Preview (1)\\VibeSpace-Sakura-UI-Preview\\index.html',
  );
});

test.describe('Sakura reduced-motion evidence', () => {
  test.use({ reducedMotion: 'reduce' });

  test('retains the shell and scene while removing petal motion', async ({ page }, testInfo) => {
    await prepareRealApp(page, testInfo, { reducedMotion: 'reduce' });

    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      true,
    );
    await expect(page.locator("[data-sakura-shell='true']")).toBeVisible();
    await expect(page.locator('[data-sakura-scene]')).toBeVisible();
    await expect(page.locator('[data-sakura-petals]')).toBeHidden();
    await expect(page.locator("[data-sakura-surface='chat-route']")).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await captureEvidence(page, testInfo, 'sakura-reduced-motion');
  });
});

test.describe('Sakura forced-colors evidence', () => {
  test.use({ forcedColors: 'active' });

  test('retains non-color route and focus semantics', async ({ page }, testInfo) => {
    await prepareRealApp(page, testInfo, { forcedColors: 'active' });

    expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
    await expect(page.locator("[data-sakura-shell='true']")).toBeVisible();
    await expect(page.locator('[data-sakura-backdrop]')).toBeHidden();

    const canvas = page.getByRole('button', { name: 'Canvas', exact: true });
    await canvas.click();
    await canvas.focus();
    await expect(canvas).toHaveAttribute('aria-current', 'page');
    await expect(page.locator("[data-sakura-route='canvas']")).toBeVisible();

    const focusStyle = await canvas.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
        boxShadow: style.boxShadow,
      };
    });
    expect(
      focusStyle.outlineStyle !== 'none' ||
        focusStyle.outlineWidth > 0 ||
        focusStyle.boxShadow !== 'none',
    ).toBe(true);
    await assertNoHorizontalOverflow(page);
    await captureEvidence(page, testInfo, 'sakura-forced-colors');
  });
});

test('Sakura scenic chrome stays isolated from the default theme', async ({ page }, testInfo) => {
  await prepareRealApp(page, testInfo, { theme: 'default' });

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'default');
  await expect(page.locator("[data-sakura-shell='true']")).toHaveCount(0);
  await expect(page.locator('[data-sakura-backdrop]')).toHaveCount(0);
  await expect(page.locator('[data-sakura-scene]')).toHaveCount(0);
  await expect(page.locator('[data-sakura-petal]')).toHaveCount(0);
  await expect(page.getByRole('main', { name: 'Workspace' })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await captureEvidence(page, testInfo, 'default-theme-isolation');
});
