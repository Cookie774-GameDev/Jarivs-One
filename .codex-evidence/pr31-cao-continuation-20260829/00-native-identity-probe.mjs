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

if (!Number.isInteger(jarvisPid) || jarvisPid < 1) {
  throw new Error('VS_NATIVE_JARVIS_PID must pin the official worktree process');
}

const before = await readWindowsNativeState();
const beforeSafety = assertZeroOllama(captureSafetySnapshot(before, 'identity:before'));
const attachment = await attachOfficialNative({ chromium, cdpPort: 9223, jarvisPid });
const page = attachment.page;
const events = [];
page.on('pageerror', (error) => events.push({ type: 'pageerror', message: String(error).slice(0, 500) }));
page.on('console', (message) => {
  if (message.type() === 'error') {
    events.push({ type: 'console.error', message: message.text().slice(0, 500) });
  }
});

const publicState = await page.evaluate(() => ({
  title: document.title,
  url: window.location.href,
  readyState: document.readyState,
  hasRoot: Boolean(document.querySelector('#root')),
  hasTauri: typeof window.__TAURI_INTERNALS__ === 'object' && window.__TAURI_INTERNALS__ !== null,
  viewport: { width: window.innerWidth, height: window.innerHeight },
  selectors: {
    buttons: document.querySelectorAll('button').length,
    textareas: document.querySelectorAll('textarea').length,
    navigation: document.querySelectorAll('nav,[role="navigation"]').length,
    main: document.querySelectorAll('main,[role="main"]').length,
    dialogs: document.querySelectorAll('[role="dialog"]').length,
    testIds: Array.from(document.querySelectorAll('[data-testid]'))
      .map((node) => node.getAttribute('data-testid'))
      .filter(Boolean)
      .slice(0, 200),
  },
}));

await page.screenshot({
  path: path.join(evidenceDirectory, '00-native-official-baseline.png'),
  fullPage: false,
});
const after = await readWindowsNativeState();
const afterSafety = assertZeroOllama(captureSafetySnapshot(after, 'identity:after'));
const report = sanitizeEvidence({
  capturedAt: new Date().toISOString(),
  identity: attachment.identity,
  readiness: attachment.readiness.proof,
  publicState,
  safety: [beforeSafety, afterSafety],
  events,
});
await writeFile(
  path.join(evidenceDirectory, '00-native-identity.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
process.stdout.write(`${JSON.stringify({ ok: true, identity: report.identity, publicState })}\n`);
setTimeout(() => process.exit(0), 50);
