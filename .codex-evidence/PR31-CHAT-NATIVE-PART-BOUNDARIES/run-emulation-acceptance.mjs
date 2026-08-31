import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '../../node_modules/playwright/index.mjs';
import {
  selectStableOfficialPage,
  waitForSemantic,
} from '../../scripts/pr31-native-acceptance-harness.mjs';

const evidenceDirectory = path.resolve('.codex-evidence/PR31-CHAT-NATIVE-PART-BOUNDARIES');
const projectDirectory = path.join(evidenceDirectory, 'game-project-emulation-sse-fix');
const prompt = 'Make me a full html game no questions no approval needed maek it a full 3d game and test it okay';
const rootKey = 'jarvis-files-root-v2:prj_rbJ95nOedBf82iAQ';
const log = (stage, details = {}) => process.stdout.write(`${JSON.stringify({ stage, ...details })}\n`);

const domSnapshot = (page) =>
  page.evaluate(() => {
    const sequence = [...document.querySelectorAll(
      '.agentic-transcript > .agentic-native-checkpoint, .agentic-transcript > .agentic-answer, .agentic-transcript > .assistant-activity-ledger',
    )].map((element) => ({
      kind: element.classList.contains('agentic-native-checkpoint')
        ? 'text'
        : element.classList.contains('agentic-answer')
        ? 'text'
        : element.classList.contains('assistant-activity-ledger')
          ? 'ledger'
          : 'checkpoint',
      active: element.getAttribute('data-ledger-active'),
      label: (element.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, 160),
    }));
    return {
      sequence,
      answers: document.querySelectorAll('.agentic-native-checkpoint, .agentic-answer').length,
      nativeCheckpoints: document.querySelectorAll('[data-native-assistant-checkpoint="true"]').length,
      ledgers: document.querySelectorAll('[data-assistant-activity-ledger="true"]').length,
      activeLedgers: document.querySelectorAll('[data-ledger-active="true"]').length,
      expandedLedgers: document.querySelectorAll('.assistant-activity-ledger__inspector').length,
      receiptRows: document.querySelectorAll('.assistant-activity-ledger__receipt').length,
      contextRows: document.querySelectorAll('.agentic-context-references').length,
      contextExpanded: document.querySelectorAll('.agentic-context-references[open]').length,
      header: (document.querySelector('.agentic-session')?.textContent ?? '').replace(/\s+/gu, ' ').trim(),
      hasPrivatePath: /[A-Za-z]:\\Users\\/u.test(document.body.innerText ?? ''),
      hasProviderNativeId: /\b(?:ses|msg|part|call)_[A-Za-z0-9_-]{6,}\b/u.test(document.body.innerText ?? ''),
      hasReasoning: /PRIVATE internal|\bReasoning\b/iu.test(document.querySelector('.agentic-transcript')?.textContent ?? ''),
      hasPrivatePill: /\bPRIVATE\b/u.test(document.querySelector('.agentic-transcript')?.textContent ?? ''),
    };
  });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223', { timeout: 10_000 });
const selected = await selectStableOfficialPage(
  () => browser.contexts().flatMap((context) => context.pages()),
  { timeoutMs: 15_000, stableObservations: 2 },
);
const { page } = selected;
await page.setViewportSize({ width: 1586, height: 992 });
const screenshots = [];
const screenshot = async (name) => {
  const file = path.join(evidenceDirectory, name);
  const buffer = await page.screenshot({ path: file, animations: 'disabled' });
  screenshots.push({ name, bytes: buffer.length });
  log('screenshot', { name, bytes: buffer.length });
};

try {
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: rootKey,
    value: projectDirectory,
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForSemantic({
    description: 'ordinary VibeSpace Chat ready',
    timeoutMs: 30_000,
    observe: () =>
      page.getByRole('button', { name: 'Create chat', exact: true }).isVisible().catch(() => false),
  });
  await page.getByRole('button', { name: 'Create chat', exact: true }).click();
  const composer = page.locator('textarea:visible').last();
  await waitForSemantic({
    description: 'new chat composer ready',
    timeoutMs: 180_000,
    observe: async () => ({
      visible: await composer.isVisible().catch(() => false),
      enabled: await composer.isEnabled().catch(() => false),
      value: await composer.inputValue().catch(() => ''),
    }),
    accept: (value) => value.visible && value.enabled && value.value === '',
  });
  await composer.fill(prompt);
  if (!(await page.locator('body').innerText()).includes('opencode-go/deepseek-v4-flash-vision-exp')) {
    throw new Error('exact acceptance model is not selected');
  }
  await waitForSemantic({
    description: 'exact prompt remains in active composer',
    timeoutMs: 10_000,
    observe: () => composer.inputValue().catch(() => ''),
    accept: (value) => value === prompt,
  });
  const persistedPromptChats = page
    .locator('.overflow-hidden button')
    .filter({ hasText: 'Make me a full html game no questions no approv' });
  const promptChatCountBeforeSend = await persistedPromptChats.count();
  await composer.press('Control+Enter');
  log('prompt-sent');
  await waitForSemantic({
    description: 'new persisted exact-prompt chat appears',
    timeoutMs: 15_000,
    observe: () => persistedPromptChats.count().catch(() => 0),
    accept: (value) => value > promptChatCountBeforeSend,
  });
  await persistedPromptChats.first().click();
  await waitForSemantic({
    description: 'submitted prompt remains in the visible persisted chat',
    timeoutMs: 15_000,
    observe: () =>
      page
        .locator('.agentic-prompt-band')
        .filter({ hasText: prompt })
        .count()
        .catch(() => 0),
    accept: (value) => value === 1,
  });

  const first = await waitForSemantic({
    description: 'first native text plus active compact activity',
    timeoutMs: 12 * 60_000,
    intervalMs: 250,
    observe: () => domSnapshot(page),
    accept: (value) => value.answers >= 1 && value.ledgers >= 1 && value.activeLedgers >= 1,
  });
  log('first-output', first.value);
  await screenshot('01-live-first-output.png');

  const continued = await waitForSemantic({
    description: 'continued ordered native output',
    timeoutMs: 12 * 60_000,
    intervalMs: 300,
    observe: () => domSnapshot(page),
    accept: (value) => value.sequence.length >= 4 && value.answers >= 2 && value.ledgers >= 1,
  });
  log('continued-output', continued.value);
  await screenshot('02-live-continued-output.png');

  const settled = await waitForSemantic({
    description: 'final response and settled ledgers',
    timeoutMs: 12 * 60_000,
    intervalMs: 500,
    observe: () => domSnapshot(page),
    accept: (value) => /COMPLETE|DONE/iu.test(value.header) && value.answers >= 1 && value.ledgers >= 1 && value.activeLedgers === 0,
  });
  log('settled', settled.value);
  await screenshot('03-final-collapsed.png');

  await page.locator('.assistant-activity-ledger__disclosure').first().click();
  const expanded = await waitForSemantic({
    description: 'expanded activity receipts',
    timeoutMs: 10_000,
    observe: () => domSnapshot(page),
    accept: (value) => value.expandedLedgers === 1 && value.receiptRows >= 1,
  });
  log('expanded', expanded.value);
  await screenshot('04-final-expanded.png');
  await page.locator('.assistant-activity-ledger__disclosure').first().click();

  const beforeReload = await domSnapshot(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const reloaded = await waitForSemantic({
    description: 'persisted ordered transcript after reload',
    timeoutMs: 30_000,
    intervalMs: 250,
    observe: () => domSnapshot(page),
    accept: (value) => JSON.stringify(value.sequence) === JSON.stringify(beforeReload.sequence),
  });
  log('reloaded', reloaded.value);
  await screenshot('05-reloaded-history.png');

  const evidence = {
    status: 'passed',
    model: 'opencode-go/deepseek-v4-flash-vision-exp',
    promptLength: prompt.length,
    first: first.value,
    continued: continued.value,
    settled: settled.value,
    expanded: expanded.value,
    reloaded: reloaded.value,
    screenshots,
  };
  for (const [stage, snapshot] of Object.entries({ first: first.value, continued: continued.value, settled: settled.value, expanded: expanded.value, reloaded: reloaded.value })) {
    if (snapshot.hasPrivatePath || snapshot.hasProviderNativeId || snapshot.hasReasoning || snapshot.hasPrivatePill) {
      throw new Error(`${stage} exposed private or provider-internal transcript data`);
    }
  }
  await writeFile(path.join(evidenceDirectory, 'native-emulation-acceptance.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  log('complete', { screenshots: screenshots.length });
} catch (error) {
  await screenshot('native-emulation-failure.png').catch(() => undefined);
  log('failed', { message: error instanceof Error ? error.message : String(error), snapshot: await domSnapshot(page).catch(() => null) });
  throw error;
} finally {
  // Let process exit disconnect the CDP client. Calling Browser.close can stop
  // the official WebView debugging endpoint and invalidate reload evidence.
}
