import { chromium } from '../../node_modules/playwright/index.mjs';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
try {
  const page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((candidate) => candidate.url().startsWith('http://127.0.0.1:5174'));
  if (!page) throw new Error('official VibeSpace WebView was not found');
  const prior = await page.evaluate(() => {
    const raw = localStorage.getItem('jarvis-ui');
    const parsed = raw ? JSON.parse(raw) : { state: {}, version: 0 };
    const previousTheme = parsed?.state?.theme ?? null;
    parsed.state = { ...(parsed.state ?? {}), theme: 'default' };
    localStorage.setItem('jarvis-ui', JSON.stringify(parsed));
    return previousTheme;
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  process.stdout.write(`${JSON.stringify({ previousTheme: prior, restoredTheme: 'default' })}\n`);
} finally {
  await browser.close();
}
