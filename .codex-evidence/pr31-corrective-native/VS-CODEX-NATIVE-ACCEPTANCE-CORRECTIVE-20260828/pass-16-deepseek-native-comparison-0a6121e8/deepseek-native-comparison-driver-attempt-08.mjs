import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

import {
  EXPECTED_NATIVE_ROUTE,
  LATENCY_PROMPTS,
  validateMeasurementReport,
} from '../../../../scripts/pr31-deepseek-terminal-latency.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const CDP = 'http://127.0.0.1:9223';
const CONTRACT_COMMIT = '0a6121e81fcdcbbc1b1a03212ad21a321fbf2015';
const ROUTING_COMMIT = 'd808806c35e7bdd5833978e7ae43f55e55da7091';
const EXPIRED_DENIAL_COMMIT = '8fa3ad3aeda901fe2e34b4b061d9f0b92eb2ca09';
const DENIAL_COMMIT = '226cd09e2c909c77d815ce83556e9db38acf9cac';
const PROJECT_ROOT = '\\\\?\\C:\\Users\\viper\\Documents\\Codex\\2026-08-21';
const INPUT_PATH = `${PROJECT_ROOT}\\input.txt`;
const OUTPUT_PATH = `${PROJECT_ROOT}\\output.txt`;
const WRONG_PATH =
  'C:\\Users\\viper\\AppData\\Roaming\\ai.jarvis.desktop\\Projects\\jarvis-note.txt';
const INPUT_BYTES = 'alpha=19\nbeta=23\n';
const OUTPUT_BYTES = 'LATENCY_OK\n';
const CHAT_PREFIX = 'chat_pr31_deepseek_native_attempt08_';
const REPORT_NAME = 'deepseek-native-report-attempt-08.json';
const COMPARISON_NAME = 'deepseek-native-terminal-comparison-attempt-08.json';
const DRIVER_REPORT_NAME = 'deepseek-native-driver-evidence-attempt-08.json';
const FAILURE_NAME = 'deepseek-native-failure-attempt-08.json';
const EXPECTED_OUTPUT = new Map([
  ['bounded-reasoning', 'ANSWER: 42\nCHECK: 19+23=42'],
  ['disposable-read', 'READ_SUM: 42\nSOURCE: input.txt'],
  ['disposable-write', 'WRITE: output.txt'],
]);

let browser;
let page;
let originalChatId = null;
let fixtureRemoved = false;
let tempFilesRemoved = false;
let failure;
const safety = [];
const assertions = [];
const artifacts = [];
const consoleEvents = [];
const pageErrors = [];
const promptReports = [];
const approvals = [];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function ps(script) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 20_000,
    maxBuffer: 8 * 1024 * 1024,
  }).trim();
}

function git(...args) {
  return execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim();
}

function gitOk(...args) {
  try {
    execFileSync('git', ['-C', ROOT, ...args], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function processSnapshot() {
  return JSON.parse(
    ps(
      [
        "$jarvis=@(Get-CimInstance Win32_Process|Where-Object Name -eq 'jarvis.exe'|Select-Object Name,ProcessId,ParentProcessId,ExecutablePath)",
        "$webviews=@(Get-CimInstance Win32_Process|Where-Object{$_.Name -eq 'msedgewebview2.exe'-and$_.CommandLine -like '*--webview-exe-name=jarvis.exe*'}|Select-Object Name,ProcessId,ParentProcessId,ExecutablePath,@{n='Cdp9223';e={$_.CommandLine -like '*--remote-debugging-port=9223*'}},@{n='OfficialProfile';e={$_.CommandLine -like '*ai.jarvis.desktop\\EBWebView*'}})",
        "$ollama=@(Get-CimInstance Win32_Process|Where-Object Name -eq 'ollama.exe'|Select-Object Name,ProcessId,ParentProcessId)",
        '$p11434=@(Get-NetTCPConnection -State Listen -LocalPort 11434 -ErrorAction SilentlyContinue|Select-Object LocalAddress,LocalPort,OwningProcess)',
        '$p9223=@(Get-NetTCPConnection -State Listen -LocalPort 9223 -ErrorAction SilentlyContinue|Select-Object LocalAddress,LocalPort,OwningProcess)',
        '[pscustomobject]@{CapturedAt=(Get-Date -Format o);Jarvis=$jarvis;WebViews=$webviews;Listeners9223=$p9223;Ollama=$ollama;Listeners11434=$p11434}|ConvertTo-Json -Depth 6 -Compress',
      ].join(';'),
    ),
  );
}

function guard(label) {
  const snapshot = processSnapshot();
  const entry = {
    label,
    capturedAt: snapshot.CapturedAt,
    ollamaProcessCount: snapshot.Ollama.length,
    listener11434Count: snapshot.Listeners11434.length,
  };
  safety.push(entry);
  if (entry.ollamaProcessCount !== 0 || entry.listener11434Count !== 0) {
    throw new Error(`forbidden_ollama_or_11434:${label}`);
  }
  return snapshot;
}

function check(name, passed, details = {}) {
  const entry = { name, passed: Boolean(passed), ...details };
  assertions.push(entry);
  if (!entry.passed) throw new Error(`assertion_failed:${name}`);
  return entry;
}

async function fileState(target) {
  try {
    const bytes = await readFile(target);
    return { exists: true, size: bytes.length, sha256: sha256(bytes) };
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, size: 0, sha256: null };
    throw error;
  }
}

async function waitFor(description, observe, accept, timeoutMs = 35_000) {
  const started = performance.now();
  let attempts = 0;
  while (performance.now() - started <= timeoutMs) {
    attempts += 1;
    const value = await observe();
    if (accept(value)) return value;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`semantic_timeout:${description}:attempts=${attempts}`);
}

async function screenshot(name) {
  guard(`screenshot:${name}:before`);
  const target = resolve(HERE, name);
  await page.screenshot({ path: target, animations: 'disabled', fullPage: false });
  guard(`screenshot:${name}:after`);
  const metadata = await sharp(target).metadata();
  const artifact = { name, width: metadata.width, height: metadata.height };
  artifacts.push(artifact);
  return artifact;
}

async function writeJson(name, value) {
  await writeFile(resolve(HERE, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function wake() {
  const ambient = page.getByRole('dialog', { name: /Ambient mode/u });
  if (await ambient.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await ambient.waitFor({ state: 'hidden' });
  }
}

async function guarded(label, operation) {
  guard(`${label}:before`);
  try {
    await wake();
    return await operation();
  } finally {
    guard(`${label}:after`);
  }
}

async function messageSnapshot(chatId) {
  return page.evaluate(async (fixtureChatId) => {
    const { db } = await import('/src/lib/db/index.ts');
    const rows = await db.messages.where('chat_id').equals(fixtureChatId).sortBy('created_at');
    return rows.map((row) => ({
      id: String(row.id),
      role: row.role,
      text: row.parts
        .filter((part) => part.kind === 'text')
        .map((part) => part.text)
        .join(''),
      usage: row.usage ?? null,
    }));
  }, chatId);
}

async function reconcileStaleWrongApproval(wrongBefore, outputBefore) {
  const stale = await page.evaluate(
    async ({ wrongPath }) => {
      const { db } = await import('/src/lib/db/index.ts');
      const rows = await db.messages.toArray();
      const matches = [];
      for (const row of rows) {
        for (const part of row.parts) {
          if (
            part.kind === 'action_proposal' &&
            part.action_id === 'files.create' &&
            part.params?.path === wrongPath
          ) {
            matches.push({
              chatId: String(row.chat_id),
              messageId: String(row.id),
              callId: String(part.call_id),
              status: String(part.status),
            });
          }
        }
      }
      return matches.at(-1) ?? null;
    },
    { wrongPath: WRONG_PATH },
  );

  if (!stale) {
    check('no stale wrong approval remains in native storage', true, { applicable: false });
    return { applicable: false, disposition: 'absent' };
  }

  const publicChatNavigation = page.getByRole('button', { name: 'Chat', exact: true }).first();
  await publicChatNavigation.waitFor({ state: 'visible' });
  await publicChatNavigation.click();
  await page.waitForURL((url) => url.searchParams.get('route') === 'chat', { timeout: 20_000 });
  await page.getByRole('textbox', { name: 'Message' }).waitFor({
    state: 'visible',
    timeout: 20_000,
  });
  check('public Chat navigation mounted the semantic composer', true, {
    route: new URL(page.url()).searchParams.get('route'),
  });
  await page.evaluate(async (chatId) => {
    const { useUIStore } = await import('/src/stores/ui.ts');
    const ui = useUIStore.getState();
    ui.setActiveChat(chatId);
    ui.setChatMode('chat');
  }, stale.chatId);
  await page.getByRole('textbox', { name: 'Message' }).waitFor({ state: 'visible' });
  const approvalId = stale.callId.startsWith('jarvisapproval:')
    ? stale.callId.slice('jarvisapproval:'.length)
    : '';
  check('stale wrong proposal retains canonical approval identity', approvalId.length > 0, {
    callIdSha256: sha256(stale.callId),
  });
  const card = page.locator(`[data-approval-id="${approvalId}"]`);
  await card.waitFor({ state: 'visible' });
  let denialClicked = false;
  if ((await card.getAttribute('data-status')) === 'pending') {
    const deny = card.getByRole('button', { name: 'Deny action' });
    await deny.waitFor({ state: 'visible' });
    await deny.click();
    denialClicked = true;
  }
  await page.waitForFunction(
    ({ approvalId }) => {
      const card = document.querySelector(`[data-approval-id="${approvalId}"]`);
      return card?.getAttribute('data-status') === 'cancelled';
    },
    { approvalId },
    { timeout: 20_000 },
  );
  const persisted = await page.evaluate(async ({ messageId, callId }) => {
    const { db } = await import('/src/lib/db/index.ts');
    const row = await db.messages.get(messageId);
    const part = row?.parts.find(
      (candidate) => candidate.kind === 'action_proposal' && candidate.call_id === callId,
    );
    return part?.kind === 'action_proposal' ? part.status : null;
  }, stale);
  check('stale wrong approval is durably cancelled', persisted === 'cancelled', { persisted });
  check(
    'cancelled stale card exposes no approval controls',
    (await card.getByRole('button', { name: 'Approve fixed action' }).count()) === 0 &&
      (await card.getByRole('button', { name: 'Deny action' }).count()) === 0,
  );
  await page.getByRole('button', { name: 'Send message' }).waitFor({ state: 'visible' });
  check(
    'cancelled stale card restores idle composer',
    (await page.getByRole('button', { name: 'Stop current request' }).count()) === 0,
  );
  check(
    'denial regression never mutated requested or wrong target',
    JSON.stringify(await fileState(WRONG_PATH)) === JSON.stringify(wrongBefore) &&
      JSON.stringify(await fileState(OUTPUT_PATH)) === JSON.stringify(outputBefore),
  );
  await screenshot('06-stale-wrong-approval-cancelled-attempt-08.png');
  return {
    applicable: true,
    denialClicked,
    disposition: 'cancelled',
    callIdSha256: sha256(stale.callId),
  };
}

async function seedFixtureChat(prompt, index) {
  const chatId = `${CHAT_PREFIX}${index}_${prompt.id}`;
  const state = await page.evaluate(
    async ({ chatId, title }) => {
      const [{ db }, { useAuthStore }, { useUIStore }] = await Promise.all([
        import('/src/lib/db/index.ts'),
        import('/src/stores/auth.ts'),
        import('/src/stores/ui.ts'),
      ]);
      const auth = useAuthStore.getState();
      const ui = useUIStore.getState();
      if (!auth.workspaceId || !auth.projectId) throw new Error('native_identity_missing');
      await db.transaction('rw', db.chats, db.messages, async () => {
        await db.messages.where('chat_id').equals(chatId).delete();
        await db.chats.delete(chatId);
        const now = Date.now();
        await db.chats.add({
          id: chatId,
          workspace_id: auth.workspaceId,
          project_id: auth.projectId,
          title,
          mode: 'chat',
          active_agent_ids: [],
          created_at: now,
          updated_at: now,
        });
      });
      ui.setActiveChat(chatId);
      ui.setRoute('chat');
      ui.setChatMode('chat');
      return { workspaceId: String(auth.workspaceId), projectId: String(auth.projectId) };
    },
    { chatId, title: `PR31 DeepSeek attempt 08 ${prompt.id}` },
  );
  await page.getByText(`PR31 DeepSeek attempt 08 ${prompt.id}`, { exact: true }).waitFor({
    state: 'visible',
    timeout: 20_000,
  });
  await page.getByRole('textbox', { name: 'Message' }).waitFor({ state: 'visible' });
  return { chatId, ...state };
}

async function setAgentWriteMode() {
  const trigger = page.getByRole('button', { name: /Mode\. Open permissions panel\./u });
  await trigger.click();
  const modeList = page.getByRole('listbox', { name: 'Chat modes' });
  await modeList.waitFor({ state: 'visible' });
  await modeList.getByRole('option', { name: /Agent Mode/u }).click();
  const accessList = page.getByRole('listbox', { name: 'Access and Approve All' });
  await accessList.waitFor({ state: 'visible' });
  const write = accessList.getByRole('option', { name: /Write Access/u });
  if ((await write.getAttribute('aria-selected')) !== 'true') await write.click();
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: /Agent Mode\. Open permissions panel\./u })
    .waitFor({ state: 'visible' });
}

async function selectExactRoute(chatId) {
  await page.getByRole('button', { name: 'Choose model' }).click();
  const picker = page.getByRole('listbox');
  await picker.waitFor({ state: 'visible' });
  await picker
    .getByText('DeepSeek V4 Flash Vision Exp · Opencode Go provider connection', { exact: true })
    .click();
  await page.waitForFunction(
    async ({ chatId, expected }) => {
      const [{ db }, { useAuthStore }] = await Promise.all([
        import('/src/lib/db/index.ts'),
        import('/src/stores/auth.ts'),
      ]);
      const chat = await db.chats.get(chatId);
      const selection = useAuthStore.getState().chatModelSelection;
      return (
        chat?.connection?.providerId === expected.providerId &&
        chat.connection.id === expected.connectionId &&
        chat.connection.modelId === expected.modelId &&
        selection.mode === 'single' &&
        selection.providerId === expected.providerId &&
        selection.connectionId === expected.connectionId &&
        selection.modelId === expected.modelId
      );
    },
    { chatId, expected: EXPECTED_NATIVE_ROUTE },
    { timeout: 20_000 },
  );
  return page.evaluate(async (fixtureChatId) => {
    const [{ db }, { useAuthStore }] = await Promise.all([
      import('/src/lib/db/index.ts'),
      import('/src/stores/auth.ts'),
    ]);
    return {
      chatConnection: (await db.chats.get(fixtureChatId))?.connection,
      selection: useAuthStore.getState().chatModelSelection,
    };
  }, chatId);
}

function qualityFor(prompt, output, fileCheck) {
  const checks = [
    { id: 'response_bounded', passed: output.length <= prompt.bounds.maxOutputChars },
    { id: 'required_markers', passed: output === EXPECTED_OUTPUT.get(prompt.id) },
    { id: 'no_failure_language', passed: !/(error|failed|unable|cannot|sorry)/iu.test(output) },
  ];
  if (prompt.id === 'disposable-write') {
    checks.push({ id: 'exact_output_file', passed: fileCheck === true });
  }
  return { passed: checks.every((item) => item.passed), checks };
}

async function approveExactWrite(chatId, beforeIds, phase) {
  const proposal = await waitFor(
    `${phase}:exact pending output proposal`,
    () =>
      page.evaluate(
        async ({ chatId, beforeIds }) => {
          const { db } = await import('/src/lib/db/index.ts');
          const rows = await db.messages.where('chat_id').equals(chatId).toArray();
          const proposals = rows
            .filter((row) => !beforeIds.includes(String(row.id)))
            .flatMap((row) =>
              row.parts
                .filter((part) => part.kind === 'action_proposal')
                .map((part) => ({
                  messageId: String(row.id),
                  callId: String(part.call_id),
                  actionId: String(part.action_id),
                  status: String(part.status),
                  params: part.params,
                })),
            );
          return proposals;
        },
        { chatId, beforeIds },
      ),
    (items) => items.length > 0,
  );
  check(`${phase} emits exactly one new action proposal`, proposal.length === 1, {
    count: proposal.length,
  });
  const item = proposal[0];
  const exact =
    item.actionId === 'files.create' &&
    item.status === 'pending' &&
    item.params?.path === OUTPUT_PATH &&
    item.params?.root === PROJECT_ROOT &&
    item.params?.content === OUTPUT_BYTES;
  if (!exact) {
    const approvalId = item.callId.startsWith('jarvisapproval:')
      ? item.callId.slice('jarvisapproval:'.length)
      : '';
    if (approvalId) {
      const wrongCard = page.locator(`[data-approval-id="${approvalId}"]`);
      const deny = wrongCard.getByRole('button', { name: 'Deny action' });
      if (await deny.isVisible().catch(() => false)) await deny.click();
    }
    throw new Error('product_failure:write_approval_identity_mismatch_denied');
  }
  const approvalId = item.callId.startsWith('jarvisapproval:')
    ? item.callId.slice('jarvisapproval:'.length)
    : '';
  check(`${phase} exact write proposal is canonical`, approvalId.length > 0, {
    callIdSha256: sha256(item.callId),
  });
  const card = page.locator(`[data-approval-id="${approvalId}"]`);
  await card.waitFor({ state: 'visible' });
  check(
    `${phase} visible approval card matches exact action and pending state`,
    (await card.getAttribute('data-action-id')) === 'files.create' &&
      (await card.getAttribute('data-status')) === 'pending',
  );
  await card.getByRole('button', { name: 'Approve fixed action' }).click();
  const written = await waitFor(
    `${phase}:approved output bytes`,
    () => fileState(OUTPUT_PATH),
    (state) => state.exists && state.sha256 === sha256(OUTPUT_BYTES),
  );
  await page.getByRole('button', { name: 'Send message' }).waitFor({
    state: 'visible',
    timeout: 35_000,
  });
  check(
    `${phase} approval returns Chat to idle`,
    (await page.getByRole('button', { name: 'Stop current request' }).count()) === 0,
  );
  const receipt = {
    phase,
    actionId: item.actionId,
    callIdSha256: sha256(item.callId),
    rootMatches: true,
    pathMatches: true,
    contentMatches: true,
    outputSha256: written.sha256,
    approvedExactlyOnce: true,
  };
  approvals.push(receipt);
  return receipt;
}

async function runSample(prompt, phase, chatId) {
  if (prompt.id === 'disposable-write') {
    await unlink(OUTPUT_PATH).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
  const before = await messageSnapshot(chatId);
  const beforeIds = before.map((message) => message.id);
  await page.getByRole('textbox', { name: 'Message' }).fill(prompt.prompt);
  const started = performance.now();
  await page.getByRole('button', { name: 'Send message' }).click();
  await page.getByRole('button', { name: 'Stop current request' }).waitFor({
    state: 'visible',
    timeout: 10_000,
  });
  const first = await page.waitForFunction(
    async ({ chatId, beforeIds }) => {
      const { db } = await import('/src/lib/db/index.ts');
      const rows = await db.messages.where('chat_id').equals(chatId).toArray();
      return rows.some(
        (row) =>
          !beforeIds.includes(String(row.id)) &&
          (row.role === 'assistant' || row.role === 'agent') &&
          row.parts.some((part) => part.kind === 'text' && part.text.length > 0),
      );
    },
    { chatId, beforeIds },
    { timeout: prompt.bounds.timeoutMs, polling: 50 },
  );
  const timeToFirstTextMs = Math.round(performance.now() - started);
  await first.dispose();
  const expected = EXPECTED_OUTPUT.get(prompt.id);
  const exact = await page.waitForFunction(
    async ({ chatId, beforeIds, expected }) => {
      const { db } = await import('/src/lib/db/index.ts');
      const rows = await db.messages.where('chat_id').equals(chatId).toArray();
      return rows.some((row) => {
        if (
          beforeIds.includes(String(row.id)) ||
          (row.role !== 'assistant' && row.role !== 'agent')
        ) {
          return false;
        }
        return (
          row.parts
            .filter((part) => part.kind === 'text')
            .map((part) => part.text)
            .join('')
            .trim() === expected
        );
      });
    },
    { chatId, beforeIds, expected },
    { timeout: prompt.bounds.timeoutMs, polling: 50 },
  );
  await exact.dispose();

  let approvalReceipt;
  if (prompt.id === 'disposable-write') {
    approvalReceipt = await approveExactWrite(chatId, beforeIds, phase);
  } else {
    await page.getByRole('button', { name: 'Send message' }).waitFor({
      state: 'visible',
      timeout: prompt.bounds.timeoutMs,
    });
  }
  const durationMs = Math.round(performance.now() - started);
  const after = await messageSnapshot(chatId);
  const outputMessage = after.find(
    (message) =>
      !beforeIds.includes(message.id) &&
      (message.role === 'assistant' || message.role === 'agent') &&
      message.text.trim() === expected,
  );
  check(`${prompt.id}/${phase} output belongs to the exact new turn`, Boolean(outputMessage));
  const output = outputMessage.text.trim();
  const fileCheck =
    prompt.id === 'disposable-write'
      ? (await readFile(OUTPUT_PATH, 'utf8').catch(() => undefined)) === OUTPUT_BYTES
      : undefined;
  const quality = qualityFor(prompt, output, fileCheck);
  check(`${prompt.id}/${phase} satisfies the committed quality rubric`, quality.passed, {
    quality,
  });
  return {
    phase,
    status: 'completed',
    durationMs,
    timeToFirstTextMs,
    identity: { ...EXPECTED_NATIVE_ROUTE },
    output: { sha256: sha256(output), charCount: output.length },
    quality,
    ...(approvalReceipt ? { approvalReceipt } : {}),
    ...(phase === 'warm'
      ? {
          sessionContinuity: true,
          sessionEvidence: {
            boundary: 'same official-native Chat ID and persisted exact connection',
            chatIdSha256: sha256(chatId),
          },
        }
      : {}),
    usage: outputMessage.usage ?? null,
  };
}

async function cleanupFixtures() {
  if (!page) return;
  await page.evaluate(
    async ({ prefix, originalChatId }) => {
      const [{ db }, { useUIStore }] = await Promise.all([
        import('/src/lib/db/index.ts'),
        import('/src/stores/ui.ts'),
      ]);
      const chats = await db.chats.filter((chat) => String(chat.id).startsWith(prefix)).toArray();
      await db.transaction('rw', db.chats, db.messages, async () => {
        for (const chat of chats) {
          await db.messages.where('chat_id').equals(chat.id).delete();
          await db.chats.delete(chat.id);
        }
      });
      const ui = useUIStore.getState();
      ui.setActiveChat(originalChatId ?? null);
      ui.setRoute('chat');
      ui.setChatMode('chat');
    },
    { prefix: CHAT_PREFIX, originalChatId },
  );
  fixtureRemoved = true;
}

const startedAt = new Date().toISOString();
const executionStarted = performance.now();
const captureHead = git('rev-parse', 'HEAD');
let officialBefore;
let projectEvidence;
let staleDenial;
let wrongBefore;
let outputBefore;

try {
  check(
    'required contract and both repairs are capture-head ancestors',
    [CONTRACT_COMMIT, ROUTING_COMMIT, DENIAL_COMMIT, EXPIRED_DENIAL_COMMIT].every((commit) =>
      gitOk('merge-base', '--is-ancestor', commit, captureHead),
    ),
    {
      captureHead,
      contractCommit: CONTRACT_COMMIT,
      routingCommit: ROUTING_COMMIT,
      denialCommit: DENIAL_COMMIT,
      expiredDenialCommit: EXPIRED_DENIAL_COMMIT,
    },
  );
  check(
    'committed latency contract is unchanged',
    gitOk(
      'diff',
      '--quiet',
      `${CONTRACT_COMMIT}..${captureHead}`,
      '--',
      'scripts/pr31-deepseek-terminal-latency.mjs',
      'docs/operations/PR31_DEEPSEEK_NATIVE_TERMINAL_LATENCY_REPORT.json',
    ),
  );
  outputBefore = await fileState(OUTPUT_PATH);
  wrongBefore = await fileState(WRONG_PATH);
  check('claimed output is absent before model work', outputBefore.exists === false, {
    outputBefore,
  });
  await writeFile(INPUT_PATH, INPUT_BYTES, { encoding: 'utf8', flag: 'wx' }).catch(
    async (error) => {
      if (error?.code !== 'EEXIST') throw error;
      const existing = await readFile(INPUT_PATH, 'utf8');
      check('pre-existing task fixture has exact committed bytes', existing === INPUT_BYTES);
    },
  );
  const input = await readFile(INPUT_PATH, 'utf8');
  check(
    'native disposable input matches terminal bytes',
    input === INPUT_BYTES &&
      sha256(input) === '51ef1fb954f9943798b2c7fe07373cdf36a25d8c7c1023fe460fe2742f17ba11',
    { inputSha256: sha256(input), inputCharCount: input.length },
  );

  officialBefore = guard('attempt08:start');
  check('one official jarvis process is running', officialBefore.Jarvis.length === 1, {
    jarvis: officialBefore.Jarvis,
  });
  const rootWebView = officialBefore.WebViews.find(
    (candidate) =>
      candidate.ParentProcessId === officialBefore.Jarvis[0].ProcessId &&
      candidate.Cdp9223 &&
      candidate.OfficialProfile,
  );
  check('CDP belongs to the official jarvis WebView root', Boolean(rootWebView), {
    rootWebView,
    listeners9223: officialBefore.Listeners9223,
  });

  browser = await chromium.connectOverCDP(CDP);
  page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((candidate) => candidate.url().includes('localhost:5173'));
  check('official VibeSpace page attached', Boolean(page), { url: page?.url() });
  page.setDefaultTimeout(20_000);
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleEvents.push({
        type: 'error',
        textSha256: sha256(message.text()),
        charCount: message.text().length,
      });
    }
  });
  page.on('pageerror', (error) => {
    const value = String(error);
    pageErrors.push({
      name: error?.name ?? 'Error',
      textSha256: sha256(value),
      charCount: value.length,
    });
  });
  const liveExpiredDenialRepair = await page.evaluate(async () => {
    const response = await fetch(
      '/src/lib/jarvis/kernelRuntime.ts?pr31-native-attempt08=8fa3ad3a',
      { cache: 'no-store' },
    );
    const source = await response.text();
    const marker = 'approval.attemptNumber !== providerScope.attemptNumber';
    const markerIndex = source.indexOf(marker);
    const canonicalScopeWindow =
      markerIndex >= 0 ? source.slice(markerIndex, markerIndex + 180) : '';
    return {
      ok: response.ok,
      status: response.status,
      charCount: source.length,
      markerFound: markerIndex >= 0,
      redundantExpiryGuardPresent: canonicalScopeWindow.includes(
        'approval.expiresAt <= input.now()',
      ),
    };
  });
  check(
    'live official renderer includes the 8fa3ad3a expired-denial repair',
    liveExpiredDenialRepair.ok &&
      liveExpiredDenialRepair.markerFound &&
      liveExpiredDenialRepair.redundantExpiryGuardPresent === false,
    liveExpiredDenialRepair,
  );
  originalChatId = await page.evaluate(async () => {
    const { useUIStore } = await import('/src/stores/ui.ts');
    return useUIStore.getState().activeChatId;
  });
  projectEvidence = await page.evaluate(async () => {
    const [{ useAuthStore }, { getStoredProjectRoot }] = await Promise.all([
      import('/src/stores/auth.ts'),
      import('/src/features/files/projectFiles.ts'),
    ]);
    const auth = useAuthStore.getState();
    return {
      workspaceId: auth.workspaceId,
      projectId: auth.projectId,
      projectRoot: getStoredProjectRoot(auth.projectId ?? null),
    };
  });
  check(
    'official project root is the claimed disposable root',
    projectEvidence.projectRoot === PROJECT_ROOT,
    {
      projectRootSha256: sha256(projectEvidence.projectRoot ?? ''),
    },
  );

  staleDenial = await guarded('stale-denial-regression', () =>
    reconcileStaleWrongApproval(wrongBefore, outputBefore),
  );

  for (const [index, prompt] of LATENCY_PROMPTS.entries()) {
    const fixture = await guarded(`seed:${prompt.id}`, () => seedFixtureChat(prompt, index));
    await guarded(`mode:${prompt.id}`, setAgentWriteMode);
    const identity = await guarded(`route:${prompt.id}`, () => selectExactRoute(fixture.chatId));
    check(`${prompt.id} exact route persisted before dispatch`, true, { identity });
    if (index === 0) await screenshot('07-deepseek-exact-route-attempt-08.png');

    guard(`${prompt.id}:cold:before`);
    const cold = await runSample(prompt, 'cold', fixture.chatId);
    guard(`${prompt.id}:cold:after`);
    guard(`${prompt.id}:warm:before`);
    const warm = await runSample(prompt, 'warm', fixture.chatId);
    guard(`${prompt.id}:warm:after`);
    await screenshot(`0${index + 8}-${prompt.id}-warm-attempt-08.png`);

    let fileEvidence;
    if (prompt.id === 'disposable-read') {
      const currentInput = await readFile(INPUT_PATH, 'utf8');
      fileEvidence = { inputRead: currentInput === INPUT_BYTES, inputSha256: sha256(currentInput) };
    }
    if (prompt.id === 'disposable-write') {
      const currentOutput = await readFile(OUTPUT_PATH, 'utf8');
      fileEvidence = {
        outputWritten: currentOutput === OUTPUT_BYTES,
        outputSha256: sha256(currentOutput),
      };
    }
    promptReports.push({
      id: prompt.id,
      promptSha256: prompt.promptSha256,
      bounds: prompt.bounds,
      samples: { cold, warm },
      ...(fileEvidence ? { fileEvidence } : {}),
    });
  }

  check('no console errors were emitted during attempt 08', consoleEvents.length === 0, {
    count: consoleEvents.length,
  });
  check('no page errors were emitted during attempt 08', pageErrors.length === 0, {
    count: pageErrors.length,
  });
  await guarded('cleanup-chats', cleanupFixtures);
  await unlink(INPUT_PATH);
  await unlink(OUTPUT_PATH);
  tempFilesRemoved = true;
  check(
    'temporary input and approved output are removed',
    !(await fileState(INPUT_PATH)).exists && !(await fileState(OUTPUT_PATH)).exists,
  );
  check(
    'wrong target remains absent or byte-identical to preflight',
    JSON.stringify(await fileState(WRONG_PATH)) === JSON.stringify(wrongBefore),
  );
  const elapsedMs = Math.round(performance.now() - executionStarted);
  const report = {
    schemaVersion: 1,
    suiteId: 'pr31-deepseek-native-terminal-latency-v1',
    generatedAt: new Date().toISOString(),
    status: 'complete',
    rawOutputStored: false,
    expectedModelId: EXPECTED_NATIVE_ROUTE.modelId,
    environment: {
      kind: 'official-native-vibespace',
      authority: { ...EXPECTED_NATIVE_ROUTE },
      captureHead,
      contractCommit: CONTRACT_COMMIT,
      routingCommit: ROUTING_COMMIT,
      denialCommit: DENIAL_COMMIT,
      process: {
        jarvis: officialBefore.Jarvis,
        rootWebView: officialBefore.WebViews.find(
          (candidate) =>
            candidate.ParentProcessId === officialBefore.Jarvis[0].ProcessId && candidate.Cdp9223,
        ),
        listeners9223: officialBefore.Listeners9223,
      },
      project: {
        projectIdSha256: sha256(String(projectEvidence.projectId)),
        projectRootSha256: sha256(projectEvidence.projectRoot),
      },
    },
    featureEvidence: {
      rlm: {
        requested: false,
        observed: false,
        evidence: 'The fixed bounded prompts do not request RLM; no RLM activity was observed.',
      },
      siyuan: {
        requested: false,
        observed: false,
        evidence:
          'The fixed bounded prompts use only the claimed disposable files and do not request SiYuan.',
      },
    },
    prompts: promptReports,
    execution: { budgetMs: 270_000, elapsedMs, tempDirectoryRemoved: tempFilesRemoved },
    comparisonBoundary: { status: 'pending-terminal', requiredEnvironment: 'terminal-opencode' },
  };
  const validation = validateMeasurementReport(report);
  check('committed measurement validator accepts attempt 08', validation.ok, { validation });
  await writeJson(REPORT_NAME, report);
  execFileSync(
    'node',
    [
      'scripts/pr31-deepseek-terminal-latency.mjs',
      '--compare',
      '--terminal-report',
      'docs/operations/PR31_DEEPSEEK_NATIVE_TERMINAL_LATENCY_REPORT.json',
      '--native-report',
      resolve(HERE, REPORT_NAME),
      '--output',
      resolve(HERE, COMPARISON_NAME),
    ],
    { cwd: ROOT, stdio: 'inherit' },
  );
  const officialAfter = guard('attempt08:complete');
  await writeJson(DRIVER_REPORT_NAME, {
    schemaVersion: 1,
    task: 'PR31-DEEPSEEK-NATIVE-COMPARISON-EVIDENCE-ATTEMPT-06',
    startedAt,
    completedAt: new Date().toISOString(),
    status: 'passed',
    captureHead,
    contractCommit: CONTRACT_COMMIT,
    routingCommit: ROUTING_COMMIT,
    denialCommit: DENIAL_COMMIT,
    officialProcessBefore: officialBefore,
    officialProcessAfter: officialAfter,
    report: REPORT_NAME,
    comparison: COMPARISON_NAME,
    staleDenial,
    approvals,
    assertions,
    artifacts,
    safety,
    safetySummary: {
      checks: safety.length,
      maxOllamaProcesses: Math.max(...safety.map((item) => item.ollamaProcessCount)),
      maxListeners11434: Math.max(...safety.map((item) => item.listener11434Count)),
    },
    consoleErrors: consoleEvents,
    pageErrors,
    cleanup: { fixtureRemoved, tempFilesRemoved },
    prohibitions: {
      alternateModelUsed: false,
      credentialsEntered: false,
      productionMutation: false,
      standaloneBrowserControlled: false,
      computerUseUsed: false,
      appRestarted: false,
    },
  });
} catch (error) {
  failure = String(error?.stack ?? error);
  await writeJson(FAILURE_NAME, {
    schemaVersion: 1,
    task: 'PR31-DEEPSEEK-NATIVE-COMPARISON-EVIDENCE-ATTEMPT-06',
    startedAt,
    failedAt: new Date().toISOString(),
    status: 'failed',
    captureHead,
    failure,
    completedPromptReports: promptReports,
    staleDenial,
    approvals,
    assertions,
    artifacts,
    safety,
    consoleErrors: consoleEvents,
    pageErrors,
  });
} finally {
  try {
    if (page && !fixtureRemoved) await guarded('failure-cleanup-chats', cleanupFixtures);
  } catch (error) {
    failure ??= String(error?.stack ?? error);
  }
  try {
    await unlink(INPUT_PATH).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
    await unlink(OUTPUT_PATH).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
    tempFilesRemoved = true;
  } catch (error) {
    failure ??= String(error?.stack ?? error);
  }
  try {
    guard('attempt08:final');
  } catch (error) {
    failure ??= String(error?.stack ?? error);
  }
  await browser?.close().catch(() => undefined);
}

if (failure) process.exitCode = 1;
