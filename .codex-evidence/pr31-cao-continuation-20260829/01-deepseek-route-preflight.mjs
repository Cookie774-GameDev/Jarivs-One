import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import {
  assertZeroOllama,
  attachOfficialNative,
  captureSafetySnapshot,
  readWindowsNativeState,
  sanitizeEvidence,
} from '../../scripts/pr31-native-acceptance-harness.mjs';

const evidenceDirectory = path.dirname(new URL(import.meta.url).pathname.slice(1));
const jarvisPid = Number(process.env.VS_NATIVE_JARVIS_PID);
const events = [];
const screenshots = [];
let stage = 'attach';

function bounded(value, limit = 500) {
  return String(value ?? '').replace(/\s+/gu, ' ').trim().slice(0, limit);
}

async function capture(page, name) {
  await page.screenshot({ path: path.join(evidenceDirectory, name), fullPage: false });
  screenshots.push(name);
}

try {
  const before = await readWindowsNativeState();
  const beforeSafety = assertZeroOllama(captureSafetySnapshot(before, 'route:before'));
  const attachment = await attachOfficialNative({ chromium, cdpPort: 9223, jarvisPid });
  const page = attachment.page;
  page.on('pageerror', (error) =>
    events.push({ type: 'pageerror', stage, message: bounded(error) }),
  );
  page.on('console', (message) => {
    if (message.type() === 'error') {
      events.push({ type: 'console.error', stage, message: bounded(message.text()) });
    }
  });
  page.on('requestfailed', (request) =>
    events.push({
      type: 'requestfailed',
      stage,
      method: request.method(),
      url: bounded(request.url(), 300),
      error: bounded(request.failure()?.errorText),
    }),
  );

  stage = 'open-model-picker';
  const pickerButton = page.getByRole('button', { name: 'Choose model' });
  await pickerButton.waitFor({ state: 'visible', timeout: 15_000 });
  const beforeLabel = bounded(await pickerButton.innerText());
  const dialog = page.getByRole('dialog', { name: 'Choose AI model' });
  if (!(await dialog.isVisible().catch(() => false))) await pickerButton.click();
  await dialog.waitFor({ state: 'visible', timeout: 15_000 });
  await capture(page, '01-model-picker-open.png');

  stage = 'search-deepseek';
  const search = dialog.getByRole('searchbox', { name: 'Search providers and models' });
  await search.fill('DeepSeek V4 Flash Vision');
  const modelOptions = dialog.locator('[role="option"][data-value]');
  await modelOptions.first().waitFor({ state: 'visible', timeout: 30_000 });
  const discoveredModels = await modelOptions.evaluateAll((nodes) =>
    nodes.slice(0, 50).map((node) => ({
      value: node.getAttribute('data-value'),
      ariaDisabled: node.getAttribute('aria-disabled'),
      text: (node.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, 500),
    })),
  );
  await capture(page, '02-deepseek-live-catalog.png');
  const targetModel = modelOptions.filter({ hasText: /DeepSeek V4 Flash Vision E(?:xp|xperimental)/iu });
  if ((await targetModel.count()) < 1) throw new Error('deepseek_v4_flash_vision_exp_not_available');
  await targetModel.first().click();

  stage = 'choose-exact-route';
  let routeOptions = [];
  const routeList = dialog.getByRole('listbox', { name: /route options$/iu });
  if (await routeList.isVisible().catch(() => false)) {
    routeOptions = await routeList.getByRole('option').evaluateAll((nodes) =>
      nodes.map((node) => ({
        value: node.getAttribute('data-value'),
        ariaLabel: node.getAttribute('aria-label'),
        disabled: node.getAttribute('aria-disabled'),
        text: (node.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, 500),
      })),
    );
    const exactRoute = routeList
      .getByRole('option')
      .filter({ hasText: /opencode-go\/deepseek-v4-flash-vision-exp/iu });
    if ((await exactRoute.count()) < 1) throw new Error('exact_deepseek_opencode_route_not_available');
    await exactRoute.first().click();
  }

  stage = 'choose-high-effort';
  const effort = dialog.locator('button[data-effort-level="high"]');
  await effort.waitFor({ state: 'visible', timeout: 15_000 });
  await capture(page, '03-deepseek-high-effort.png');
  await effort.click();
  await dialog.waitFor({ state: 'hidden', timeout: 15_000 });
  const afterLabel = bounded(await pickerButton.innerText());
  const selectedEffort = await pickerButton
    .locator('[data-composer-effort]')
    .getAttribute('data-composer-effort');

  stage = 'post-selection-safety';
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  const after = await readWindowsNativeState();
  const afterSafety = assertZeroOllama(captureSafetySnapshot(after, 'route:after'));
  await capture(page, '04-deepseek-selected.png');
  const report = sanitizeEvidence({
    status: 'passed',
    capturedAt: new Date().toISOString(),
    identity: attachment.identity,
    beforeLabel,
    afterLabel,
    selectedEffort,
    discoveredModels,
    routeOptions,
    safety: [beforeSafety, afterSafety],
    events,
    screenshots,
  });
  await writeFile(
    path.join(evidenceDirectory, '01-deepseek-route-preflight.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
  process.stdout.write(`${JSON.stringify({ ok: true, afterLabel, selectedEffort })}\n`);
} catch (error) {
  const after = await readWindowsNativeState();
  const report = sanitizeEvidence({
    status: 'failed',
    stage,
    capturedAt: new Date().toISOString(),
    error: bounded(error),
    safety: [captureSafetySnapshot(after, 'route:failure')],
    events,
    screenshots,
  });
  await writeFile(
    path.join(evidenceDirectory, '01-deepseek-route-preflight-failure.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
  process.stderr.write(`${JSON.stringify({ ok: false, stage, error: bounded(error) })}\n`);
  process.exitCode = 1;
} finally {
  setTimeout(() => process.exit(process.exitCode ?? 0), 50);
}
