import { expect, type Page, type TestInfo } from '@playwright/test';

export const SAKURA_REFERENCE = {
  source:
    'C:\\Users\\viper\\Downloads\\VibeSpace-Sakura-UI-Preview (1)\\VibeSpace-Sakura-UI-Preview\\index.html',
  sha256: '76611A6BBFF4E0744F30EB95F254FAFE036DC035D6E9E5957066F0780B342FA3',
  palette: ['Night Ink', 'Deep Indigo', 'Warm Ivory', 'Sakura Pink', 'Lantern Gold', 'Quiet Mint'],
  composition: ['scenic backdrop', 'petals', 'glass application shell'],
} as const;

const FIXED_TIME = '2026-07-31T18:00:00.000Z';
const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

type Theme = 'sakura' | 'default';

export async function prepareRealApp(
  page: Page,
  testInfo: TestInfo,
  options: {
    theme?: Theme;
    reducedMotion?: 'reduce' | 'no-preference';
    forcedColors?: 'active' | 'none';
  } = {},
): Promise<void> {
  const theme = options.theme ?? 'sakura';
  const blockedRequests: string[] = [];

  await page.emulateMedia({
    reducedMotion: options.reducedMotion ?? 'no-preference',
    forcedColors: options.forcedColors ?? 'none',
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === 'http:' && ALLOWED_HOSTS.has(url.hostname)) {
      await route.continue();
      return;
    }
    blockedRequests.push(`${route.request().method()} ${url.origin}${url.pathname}`);
    await route.abort('blockedbyclient');
  });

  await page.clock.setFixedTime(FIXED_TIME);
  await page.addInitScript(
    ({ selectedTheme, fixedTime }) => {
      const uiState = {
        navOpen: true,
        inspectorOpen: false,
        activeChatId: null,
        activeAgentId: null,
        navSectionsCollapsed: {},
        chatMode: 'chat',
        theme: selectedTheme,
        density: 'cozy',
        onboardingComplete: true,
        productTutorialStatus: 'completed',
        ambient: false,
        ambientThresholdMs: 300_000,
        ambientDrone: false,
        ambientTrack: 'music-1',
        ambientVolume: 0,
        ambientAlwaysPlay: false,
        composerStt: false,
        defaultTerminalFontSize: 13,
        notificationMaster: false,
        doneNotifications: { jarvis: false, codex: false, claude: false, gemini: false },
        aiCompletionCue: false,
        lastSeenWhatsNewVersion: '1.5.0',
      };
      const authState = {
        localUserId: null,
        displayName: 'Sakura Visual Harness',
        defaultProvider: 'mock',
        offlineMode: true,
        defaultLocalModel: 'llama3.2',
        telemetryOptIn: false,
      };

      localStorage.setItem('jarvis-ui', JSON.stringify({ state: uiState, version: 5 }));
      localStorage.setItem('jarvis-auth', JSON.stringify({ state: authState, version: 14 }));

      let seed = 0x5a4b_8a21;
      Math.random = () => {
        seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
        return seed / 0x1_0000_0000;
      };
      Object.defineProperty(window, '__SAKURA_VISUAL_EVIDENCE__', {
        configurable: false,
        value: { fixedTime, accountFree: true, externalNetworkBlocked: true },
      });
    },
    { selectedTheme: theme, fixedTime: FIXED_TIME },
  );

  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  try {
    await page.bringToFront();
    const response = await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 12_000 });
    if (!response || !response.ok()) {
      throw new Error(`document response was ${response?.status() ?? 'missing'}`);
    }
  } catch (error) {
    throw new Error(
      `Sakura app unavailable at ${testInfo.project.use.baseURL ?? 'the configured loopback URL'}. ` +
        `Start the real Vite app externally, then rerun this harness. ${String(error)}`,
    );
  }

  await assertNoViteOverlay(page);
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme',
    theme === 'default' ? 'dark' : theme,
  );
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference', theme);
  await expect(page.getByRole('main', { name: 'Workspace' })).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images, (image) =>
        image.complete ? Promise.resolve() : image.decode().catch(() => undefined),
      ),
    );
  });
  await page.waitForTimeout(100);

  expect(pageErrors, `uncaught page errors:\n${pageErrors.join('\n')}`).toEqual([]);
  expect(blockedRequests, `unexpected external requests:\n${blockedRequests.join('\n')}`).toEqual(
    [],
  );
}

export async function assertNoViteOverlay(page: Page): Promise<void> {
  const overlay = await page.evaluate(() => {
    const element = document.querySelector('vite-error-overlay');
    if (!element) return '';
    return element.shadowRoot?.textContent?.trim() || element.textContent?.trim() || 'present';
  });
  expect(overlay, `Vite compile overlay detected:\n${overlay}`).toBe('');
}

export async function captureEvidence(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    animations: 'disabled',
    caret: 'hide',
    fullPage: false,
  });
}
