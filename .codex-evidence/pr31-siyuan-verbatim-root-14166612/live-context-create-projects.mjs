import { chromium } from 'file:///C:/Users/viper/ChatGPT-Browser-Connections/chatgpt-setup-automation/node_modules/playwright/index.mjs';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = browser
  .contexts()
  .flatMap((context) => context.pages())
  .find((candidate) => candidate.url().includes('localhost:5173'));
if (!page) throw new Error('vibespace_page_missing');
page.setDefaultTimeout(12_000);
if (new URL(page.url()).searchParams.get('route') !== 'context') {
  await page.goto('http://localhost:5173/?route=context');
  await page.waitForLoadState('domcontentloaded');
}
const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console:${message.text()}`);
});

const backToMaps = page.getByRole('button', { name: /Back to Context Maps/i });
if (await backToMaps.isVisible().catch(() => false)) {
  await backToMaps.click();
  await page.locator('[data-siyuan-create-summary-model-picker]').waitFor();
}

const sourceRoot = '\\\\?\\C:\\Users\\viper\\projects';
const rootInput = page.locator('input[type="text"]').first();
await rootInput.fill(sourceRoot);

const modelButton = page
  .locator('[data-siyuan-create-summary-model-picker]')
  .getByRole('button', { name: 'Choose summary model' });
if (!/deepseek-v4-flash-vision-exp/i.test(await modelButton.innerText())) {
  if (!(await page.getByPlaceholder('Search providers or models…').isVisible().catch(() => false))) {
    await modelButton.click();
  }
  const search = page.getByPlaceholder('Search providers or models…');
  await search.fill('opencode-go/deepseek-v4-flash-vision-exp');
  await page
    .locator(
      '[role="option"][data-value="opencode-cli:opencode-go/deepseek-v4-flash-vision-exp"]',
    )
    .click();
  await page.locator('[data-effort-level="high"]').click();
}

const summaryPath = page.getByPlaceholder('Paste one or more file paths (one per line)');
if ((await page.locator('body').innerText()).includes('0 selected summary paths')) {
  await summaryPath.fill(sourceRoot);
  await page.getByRole('button', { name: 'Add pasted path' }).click();
}
await page.getByText('1 selected summary path', { exact: false }).waitFor();
await page.screenshot({
  path: 'C:/Users/viper/VibeSpace-UnifiedChungus-Final/.codex-evidence/pr31-siyuan-verbatim-root-14166612/07-projects-deepseek-before-create.png',
  fullPage: false,
});

await page.getByRole('button', { name: 'Create Map', exact: true }).click();
await page.waitForFunction(
  () => {
    const text = document.body.innerText;
    return (
      text.includes('Cloud summaries paused safely') ||
      text.includes('Review the exact cloud summary scope') ||
      text.includes('Context Map complete') ||
      text.includes('Context map creation failed')
    );
  },
  undefined,
  { timeout: 180_000 },
);
await page.waitForTimeout(1_000);
await page.screenshot({
  path: 'C:/Users/viper/VibeSpace-UnifiedChungus-Final/.codex-evidence/pr31-siyuan-verbatim-root-14166612/08-projects-map-preflight.png',
  fullPage: false,
});
const body = await page.locator('body').innerText();
process.stdout.write(
  JSON.stringify(
    {
      url: page.url(),
      sourceRoot: await rootInput.inputValue(),
      model: await modelButton.innerText(),
      errors,
      relevant: body
        .split(/\r?\n/u)
        .filter((line) =>
          /Context Map|indexed|excluded|unreadable|SiYuan nodes|Summarized|Skipped|Failed|Summary scope|Summary model|approval|Approve|FILES|NODES|MODEL|active maps|selected summary path/i.test(
            line,
          ),
        )
        .slice(0, 200),
    },
    null,
    2,
  ),
);
process.exit(0);
