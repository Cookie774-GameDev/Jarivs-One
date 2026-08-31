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
const targetChatId = process.env.VS_PHASE0_CHAT_ID?.trim() ?? '';
const outputPrefix = process.env.VS_PHASE0_RESULT_PREFIX?.trim() || '02-phase0-result';
const attachment = await attachOfficialNative({ chromium, cdpPort: 9223, jarvisPid });
const page = attachment.page;
const events = [];
page.on('pageerror', (error) =>
  events.push({ type: 'pageerror', message: String(error).slice(0, 500) }),
);
page.on('console', (message) => {
  if (message.type() === 'error') {
    events.push({ type: 'console.error', message: message.text().slice(0, 500) });
  }
});

if (targetChatId) {
  await page.evaluate(async (chatId) => {
    const { useUIStore } = await import('/src/stores/ui.ts');
    const ui = useUIStore.getState();
    ui.setActiveChat(chatId);
    ui.setRoute('chat');
  }, targetChatId);
  const ambient = page.locator('[data-monochrome-surface="ambient-home"]');
  if (await ambient.isVisible().catch(() => false)) await page.keyboard.press('Escape');
  await page.locator('[data-vibespace-page="chat"]').waitFor({ state: 'attached' });
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const done = await page.evaluate(() => {
      const main = document.querySelector('[data-vibespace-page="chat"]');
      return Boolean(
        main?.querySelector('[data-native-final-answer="true"]') &&
          !main.querySelector('button[aria-label="Stop current request"]'),
      );
    });
    if (done) break;
    await page.waitForTimeout(750);
  }
} else {
  await page.waitForTimeout(2_000);
}
const state = await page.evaluate(() => {
  const text = (node, limit = 8_000) =>
    node instanceof HTMLElement ? node.innerText.replace(/\s+/gu, ' ').trim().slice(0, limit) : '';
  const parse = (key) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? 'null');
      return value && typeof value === 'object' ? (value.state ?? value) : {};
    } catch {
      return {};
    }
  };
  const ui = parse('jarvis-ui');
  const runtime = parse('vibespace.chat-runtime-settings.v1');
  const auth = parse('jarvis-auth');
  const chatId = typeof ui.activeChatId === 'string' ? ui.activeChatId : '';
  const main = document.querySelector('[data-vibespace-page="chat"]');
  const finalAnswers = Array.from(
    main?.querySelectorAll('[data-native-final-answer="true"]') ?? [],
  ).map((node) => text(node));
  const finalAnswerMetrics = finalAnswers.map((answer) => ({
    length: answer.length,
    containsFixtureName: answer.includes('official-native-acceptance.md'),
    containsContextGateway: answer.includes('Context Gateway'),
    containsJarvisExecutable: answer.includes('jarvis.exe'),
    containsOllamaInvariant: answer.includes('11434'),
    ending: answer.slice(-800),
  }));
  const finalAnswerLinks = Array.from(
    main?.querySelectorAll('[data-native-final-answer="true"] a[href]') ?? [],
  ).map((node) => ({
    text: text(node, 300),
    href: node instanceof HTMLAnchorElement ? node.href : '',
  }));
  const checkpoints = Array.from(
    main?.querySelectorAll('[data-native-assistant-checkpoint]') ?? [],
  ).map((node) => ({
    kind: node.getAttribute('data-native-assistant-checkpoint'),
    text: text(node, 2_000),
  }));
  const activity = Array.from(
    main?.querySelectorAll('[data-assistant-activity-ledger="true"]') ?? [],
  ).map((node) => text(node, 4_000));
  const context = Array.from(main?.querySelectorAll('[data-testid="context-response-inspector"]') ?? [])
    .map((node) => text(node, 4_000));
  const approvals = Array.from(main?.querySelectorAll('[data-approval-id]') ?? []).map((node) => ({
    id: node.getAttribute('data-approval-id'),
    actionId: node.getAttribute('data-action-id'),
    status: node.getAttribute('data-status'),
    text: text(node, 2_000),
  }));
  const visibleControls = Array.from(main?.querySelectorAll('button') ?? [])
    .filter((node) => node instanceof HTMLElement && node.offsetParent !== null)
    .map((node) => node.getAttribute('aria-label') || text(node, 200))
    .filter(Boolean)
    .slice(0, 200);
  const selection = auth.chatModelSelection ?? {};
  return {
    activeChatId: chatId,
    selection:
      selection.mode === 'single'
        ? {
            providerId: selection.providerId,
            connectionId: selection.connectionId,
            modelId: selection.modelId,
          }
        : { mode: selection.mode },
    runtime: runtime.chats?.[chatId] ?? null,
    probe: structuredClone(window.__PR31_NATIVE_QA_V1__ ?? null),
    finalAnswers,
    finalAnswerMetrics,
    finalAnswerLinks,
    checkpoints,
    activity,
    context,
    approvals,
    visibleControls,
    counts: {
      finalAnswers: finalAnswers.length,
      checkpoints: checkpoints.length,
      activity: activity.length,
      context: context.length,
      approvals: approvals.length,
      send: main?.querySelectorAll('button[aria-label="Send message"]').length ?? 0,
      stop: main?.querySelectorAll('button[aria-label="Stop current request"]').length ?? 0,
    },
  };
});

await page.screenshot({
  path: path.join(evidenceDirectory, `${outputPrefix}.png`),
  fullPage: false,
});
const safety = assertZeroOllama(
  captureSafetySnapshot(await readWindowsNativeState(), 'phase0:result'),
);
const report = sanitizeEvidence({
  capturedAt: new Date().toISOString(),
  identity: attachment.identity,
  state,
  safety,
  events,
});
await writeFile(
  path.join(evidenceDirectory, `${outputPrefix}.json`),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
process.stdout.write(`${JSON.stringify({ ok: true, counts: state.counts, probe: state.probe })}\n`);
setTimeout(() => process.exit(0), 50);
