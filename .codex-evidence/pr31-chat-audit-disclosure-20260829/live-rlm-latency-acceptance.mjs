import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const playwrightCoreUrl =
  process.env.PLAYWRIGHT_CORE_URL ??
  'file:///C:/Users/viper/AppData/Local/Temp/vibespace-playwright-tauri-20260829/playwright-core/index.mjs';
const { chromium } = await import(playwrightCoreUrl);
const evidenceDirectory = path.dirname(fileURLToPath(import.meta.url));
const framesDirectory = path.join(evidenceDirectory, 'rlm-latency-frames');
await rm(framesDirectory, { recursive: true, force: true });
await mkdir(framesDirectory, { recursive: true });

const browser = await chromium.connectOverCDP(process.env.CDP_ENDPOINT ?? 'http://127.0.0.1:9223', {
  timeout: 10_000,
});
const page = browser
  .contexts()
  .flatMap((context) => context.pages())
  .find((candidate) => /localhost:5173|127\.0\.0\.1:5173/u.test(candidate.url()));
if (!page) throw new Error('Official VibeSpace Tauri WebView was not found.');

const cdp = await page.context().newCDPSession(page);
const errors = [];
const failedResponses = [];
page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console:${message.text()}`);
});
page.on('response', (response) => {
  if (response.status() >= 400)
    failedResponses.push({ status: response.status(), url: response.url() });
});

async function capture(name) {
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const target = path.join(evidenceDirectory, name);
  await writeFile(target, Buffer.from(result.data, 'base64'));
  return target;
}

async function captureFrame(index) {
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(
    path.join(framesDirectory, `frame-${String(index).padStart(4, '0')}.png`),
    Buffer.from(result.data, 'base64'),
  );
}

async function openOptionPicker(command) {
  const composer = page.locator('[data-composer-input="true"]');
  await page.keyboard.press('Escape');
  await composer.fill(`/${command}`);
  await page.waitForSelector('[role="listbox"][aria-label="Slash commands"]', {
    state: 'visible',
    timeout: 10_000,
  });
  await composer.press('Enter');
  await page.waitForSelector('.jarvis-slash-dropdown [data-value]', {
    state: 'visible',
    timeout: 10_000,
  });
}

async function state() {
  return page.evaluate(() => {
    const live = document.querySelector('[data-live-turn-status]');
    const audit = document.querySelector('.agentic-turn-audit');
    const status = document.querySelector('[aria-label="Session status"]');
    const prompt = [...document.querySelectorAll('.agentic-prompt-band')].at(-1);
    const firstCheckpoint = document.querySelector('[data-native-assistant-checkpoint]');
    const relation =
      prompt && audit && firstCheckpoint
        ? {
            promptBeforeAudit: Boolean(
              prompt.compareDocumentPosition(audit) & Node.DOCUMENT_POSITION_FOLLOWING,
            ),
            auditBeforeCheckpoint: Boolean(
              audit.compareDocumentPosition(firstCheckpoint) & Node.DOCUMENT_POSITION_FOLLOWING,
            ),
          }
        : null;
    return {
      status: status?.textContent?.trim() ?? null,
      liveText: live?.textContent?.trim() ?? null,
      liveCategory: live?.getAttribute('data-live-turn-category') ?? null,
      motion: live?.querySelector('[data-agent-motion]')?.getAttribute('data-agent-motion') ?? null,
      ledgers: document.querySelectorAll('[data-assistant-activity-ledger="true"]').length,
      checkpoints: document.querySelectorAll('[data-native-assistant-checkpoint]').length,
      finalAnswers: document.querySelectorAll('[data-native-final-answer="true"]').length,
      auditText: audit?.textContent?.trim() ?? null,
      auditExpanded:
        audit?.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded') ?? null,
      relation,
      approvals: [...document.querySelectorAll('[data-approval-id][data-status="pending"]')].map(
        (node) => node.getAttribute('data-action-id') || 'pending-action',
      ),
      bodyTail: (document.body.innerText ?? '').slice(-2_000),
    };
  });
}

const prompt = `Continue the previous request now. The prior response stopped after an empty Context Map search and did not create the requested app. If no active Context Map matches, report that in one short public checkpoint and proceed directly; do not stop. With RLM still enabled and the attached Build skill, build the polished offline project-intelligence dashboard in D:\\VibeSpace-RLM-UAT\\opencode-live-latency-20260829 now. Create HTML, CSS, and JavaScript with at least three interactive views, search and filtering, accessible keyboard navigation, a responsive layout, and local fixture data. Inspect only what is needed, implement the files, run focused checks, validate the real app with Playwright if available, fix failures, and finish with a concise public audit of files read, searches, commands, edits, and checks. Do not modify VibeSpace itself, do not ask questions, do not expose private reasoning, and do not reduce model quality.`;

const report = {
  capturedAt: new Date().toISOString(),
  jarvisPid: process.env.JARVIS_PID ?? null,
  url: page.url(),
  prompt,
  selectedModel: null,
  skillOptions: [],
  attachedSkill: null,
  rlmStorage: null,
  timingsMs: {},
  motions: [],
  completion: null,
  collapsed: null,
  sidebarCompletionDot: null,
  reloaded: null,
  screenshots: [],
  errors,
  failedResponses,
};

try {
  await page.setViewportSize({ width: 1720, height: 1000 });
  await page.getByText('Chat', { exact: true }).first().click();
  const composer = page.locator('[data-composer-input="true"]');
  await composer.waitFor({ state: 'visible', timeout: 30_000 });
  report.selectedModel = await page
    .getByRole('button', { name: 'Choose model' })
    .textContent()
    .catch(() => null);

  await openOptionPicker('rlm');
  await page.locator('.jarvis-slash-dropdown [data-value="on"]').click();
  await page.waitForFunction(
    () => localStorage.getItem('vibespace.rlm-preference.v1')?.includes('true') === true,
    undefined,
    { timeout: 10_000 },
  );
  report.rlmStorage = await page.evaluate(() =>
    localStorage.getItem('vibespace.rlm-preference.v1'),
  );

  for (const existing of await page
    .locator('[data-composer-token-kind="skill"] button[aria-label^="Remove "]')
    .all()) {
    await existing.click();
  }
  await openOptionPicker('skills');
  const options = page.locator('.jarvis-slash-dropdown [data-value]');
  report.skillOptions = await options.allTextContents();
  const buildOption = options.filter({ hasText: /◆\s*Build/iu }).first();
  if (!(await buildOption.count())) {
    throw new Error(
      `The Build skill is not available in /skills: ${JSON.stringify(report.skillOptions)}`,
    );
  }
  await buildOption.click();
  const skillToken = page.locator('[data-composer-token-kind="skill"]').first();
  await skillToken.waitFor({ state: 'visible', timeout: 10_000 });
  report.attachedSkill = await skillToken.textContent();

  await composer.fill(prompt);
  const startedAt = Date.now();
  report.timingsMs.sendAt = 0;
  await page.getByRole('button', { name: 'Send message' }).click();
  process.stdout.write('sent\n');
  await page.waitForFunction(
    (promptPrefix) => {
      const prompts = [...document.querySelectorAll('.agentic-prompt-band')];
      const latest = prompts.at(-1)?.textContent ?? '';
      return latest.includes(promptPrefix) && !document.querySelector('.agentic-turn-audit');
    },
    'Continue the previous request now.',
    { timeout: 15_000 },
  );

  let frame = 0;
  let firstLiveCaptured = false;
  let firstLedgerCaptured = false;
  let nextProgressAt = startedAt + 15_000;
  const seenMotions = new Set();
  const deadline = startedAt + 12 * 60_000;
  while (Date.now() < deadline) {
    const current = await state();
    const elapsed = Date.now() - startedAt;
    if (elapsed <= 12_000 && frame < 30) {
      await captureFrame(frame);
      frame += 1;
    }
    if (current.motion && !seenMotions.has(current.motion)) {
      seenMotions.add(current.motion);
      report.motions.push({
        elapsed,
        text: current.liveText,
        category: current.liveCategory,
        motion: current.motion,
      });
    }
    if (current.liveText && !firstLiveCaptured) {
      firstLiveCaptured = true;
      report.timingsMs.firstLiveStatus = elapsed;
      report.screenshots.push(await capture('06-live-thinking.png'));
      process.stdout.write(`live:${elapsed}:${current.liveText}\n`);
    }
    if (current.ledgers > 0 && !firstLedgerCaptured) {
      firstLedgerCaptured = true;
      report.timingsMs.firstActivityLedger = elapsed;
      report.screenshots.push(await capture('07-live-activity.png'));
      process.stdout.write(`ledger:${elapsed}\n`);
    }
    if (current.auditText) {
      report.timingsMs.completed = elapsed;
      report.completion = current;
      break;
    }
    if (current.approvals.length > 0) {
      throw new Error(`Unexpected approval UI: ${current.approvals.join(', ')}`);
    }
    if (/\b(error|failed|cancelled|blocked)\b/iu.test(current.status ?? '')) {
      throw new Error(`Run reached terminal failure before its audit: ${current.status}`);
    }
    if (Date.now() >= nextProgressAt) {
      process.stdout.write(
        `progress:${elapsed}:${current.status}:${current.liveText ?? 'no-live-text'}\n`,
      );
      nextProgressAt += 15_000;
    }
    await page.waitForTimeout(elapsed <= 12_000 ? 400 : 1_000);
  }
  if (!report.completion) throw new Error('Timed out waiting for the completed work audit.');

  report.screenshots.push(await capture('08-completed-audit-top.png'));
  const collapse = page.getByRole('button', { name: 'Collapse completed work details' });
  await collapse.click();
  await page.getByRole('button', { name: 'Expand completed work details' }).waitFor({
    state: 'visible',
    timeout: 10_000,
  });
  report.collapsed = await state();
  report.screenshots.push(await capture('09-completed-audit-collapsed.png'));

  await page.getByRole('button', { name: 'Expand completed work details' }).click();
  const currentChat = await page.evaluate(() => {
    const row = document.querySelector('.group[aria-current="page"]');
    const button = row?.querySelector('button');
    return (
      button?.getAttribute('title') ||
      button?.getAttribute('aria-label') ||
      button?.textContent?.trim() ||
      null
    );
  });
  await page.getByRole('button', { name: 'Create chat' }).click();
  await page.waitForTimeout(300);
  report.sidebarCompletionDot = await page.evaluate(() => ({
    count: document.querySelectorAll('[data-chat-activity-completion-dot]').length,
    visible: [...document.querySelectorAll('[data-chat-activity-completion-dot]')].some((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(node).display !== 'none';
    }),
  }));
  report.screenshots.push(await capture('10-sidebar-completion-dot.png'));

  if (!currentChat) throw new Error('Could not resolve the completed chat row for reload proof.');
  const priorChat = page.locator('.group button').filter({ hasText: currentChat }).first();
  await priorChat.click();
  await page.getByRole('button', { name: 'Collapse completed work details' }).waitFor({
    state: 'visible',
    timeout: 30_000,
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Collapse completed work details' }).waitFor({
    state: 'visible',
    timeout: 30_000,
  });
  report.reloaded = await state();
  report.screenshots.push(await capture('11-completed-after-reload.png'));

  await writeFile(
    path.join(evidenceDirectory, '02-live-rlm-latency-acceptance.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await browser.close();
}
