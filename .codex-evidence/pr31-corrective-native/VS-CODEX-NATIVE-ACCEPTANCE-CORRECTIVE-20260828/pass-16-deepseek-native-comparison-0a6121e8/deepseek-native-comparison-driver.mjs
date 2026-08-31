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
const EXPECTED_MODEL_ID = EXPECTED_NATIVE_ROUTE.modelId;
const PROJECT_ROOT = '\\\\?\\C:\\Users\\viper\\Documents\\Codex\\2026-08-21';
const INPUT_PATH = `${PROJECT_ROOT}\\input.txt`;
const OUTPUT_PATH = `${PROJECT_ROOT}\\output.txt`;
const REPORT_NAME = 'deepseek-native-report-attempt-04.json';
const COMPARISON_NAME = 'deepseek-native-terminal-comparison-attempt-04.json';
const DRIVER_REPORT_NAME = 'deepseek-native-driver-evidence-attempt-04.json';
const CHAT_PREFIX = 'chat_pr31_deepseek_native_';
const OUTPUT_EXPECTED = new Map([
  ['bounded-reasoning', 'ANSWER: 42\nCHECK: 19+23=42'],
  ['disposable-read', 'READ_SUM: 42\nSOURCE: input.txt'],
  ['disposable-write', 'WRITE: output.txt'],
]);

let browser;
let page;
let previousChatId = null;
let failure;
let fixtureRemoved = false;
let tempFilesRemoved = false;
const safety = [];
const assertions = [];
const artifacts = [];
const consoleMessages = [];
const pageErrors = [];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function ps(script) {
  return execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
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
        "$jarvis=@(Get-CimInstance Win32_Process|Where-Object Name -eq 'jarvis.exe'|Select-Object Name,ProcessId,ParentProcessId,ExecutablePath,CommandLine)",
        "$webviews=@(Get-CimInstance Win32_Process|Where-Object{$_.Name -eq 'msedgewebview2.exe'-and$_.CommandLine -like '*--webview-exe-name=jarvis.exe*'}|Select-Object Name,ProcessId,ParentProcessId,ExecutablePath,@{n='Cdp9223';e={$_.CommandLine -like '*--remote-debugging-port=9223*'}})",
        "$ollama=@(Get-CimInstance Win32_Process|Where-Object Name -eq 'ollama.exe'|Select-Object Name,ProcessId,ParentProcessId,ExecutablePath)",
        '$p11434=@(Get-NetTCPConnection -State Listen -LocalPort 11434 -ErrorAction SilentlyContinue|Select-Object LocalAddress,LocalPort,OwningProcess)',
        '$p9223=@(Get-NetTCPConnection -State Listen -LocalPort 9223 -ErrorAction SilentlyContinue|Select-Object LocalAddress,LocalPort,OwningProcess)',
        '[pscustomobject]@{CapturedAt=(Get-Date -Format o);Jarvis=$jarvis;WebViews=$webviews;Listeners9223=$p9223;Ollama=$ollama;Listeners11434=$p11434}|ConvertTo-Json -Depth 7 -Compress',
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
  if (entry.ollamaProcessCount || entry.listener11434Count) {
    throw new Error(`Forbidden Ollama/11434 at ${label}`);
  }
  return snapshot;
}

async function wake() {
  const ambient = page.getByRole('dialog', { name: /Ambient mode/u });
  if (await ambient.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await ambient.waitFor({ state: 'hidden' });
  }
}

async function guarded(label, action) {
  guard(`${label}:before`);
  try {
    await wake();
    return await action();
  } finally {
    guard(`${label}:after`);
  }
}

function assert(name, passed, details = {}) {
  const entry = { name, passed: Boolean(passed), ...details };
  assertions.push(entry);
  if (!entry.passed) throw new Error(`Assertion failed: ${name}`);
  return entry;
}

async function screenshot(name) {
  const path = resolve(HERE, name);
  await guarded(`screenshot:${name}`, () =>
    page.screenshot({ path, animations: 'disabled', fullPage: false }),
  );
  const metadata = await sharp(path).metadata();
  const artifact = { name, width: metadata.width, height: metadata.height };
  artifacts.push(artifact);
  return artifact;
}

async function writeJson(name, value) {
  await writeFile(resolve(HERE, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function seedFixtureChat(prompt, index) {
  const chatId = `${CHAT_PREFIX}${index}_${prompt.id}`;
  const state = await page.evaluate(
    async ({ chatId, title }) => {
      const { db } = await import('/src/lib/db/index.ts');
      const { useAuthStore } = await import('/src/stores/auth.ts');
      const { useUIStore } = await import('/src/stores/ui.ts');
      const auth = useAuthStore.getState();
      const ui = useUIStore.getState();
      if (!auth.workspaceId || !auth.projectId) {
        throw new Error('Native account lacks active workspace/project authority');
      }
      const oldChatId = ui.activeChatId;
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
      return {
        previousChatId: oldChatId,
        workspaceId: String(auth.workspaceId),
        projectId: String(auth.projectId),
      };
    },
    { chatId, title: `PR31 DeepSeek ${prompt.id}` },
  );
  previousChatId ??= state.previousChatId;
  await page.getByText(`PR31 DeepSeek ${prompt.id}`, { exact: true }).first().waitFor({
    state: 'visible',
    timeout: 20_000,
  });
  await page.getByRole('textbox', { name: 'Message' }).waitFor({ state: 'visible' });
  return { chatId, ...state };
}

async function setAgentWriteMode() {
  const trigger = page.getByRole('button', { name: /Mode\. Open permissions panel\./u });
  const label = await trigger.getAttribute('aria-label');
  await trigger.click();
  const modeList = page.getByRole('listbox', { name: 'Chat modes' });
  await modeList.waitFor({ state: 'visible' });
  if (!/^Agent Mode/u.test(label ?? '')) {
    await modeList.getByRole('option', { name: /Agent Mode/u }).click();
  } else {
    await modeList.getByRole('option', { name: /Agent Mode/u }).click();
  }
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
    .getByText('DeepSeek V4 Flash Vision Exp · Opencode Go provider connection', {
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Choose model' }).waitFor({ state: 'visible' });
  await page.waitForFunction(
    async ({ chatId, expected }) => {
      const [{ db }, { useAuthStore }] = await Promise.all([
        import('/src/lib/db/index.ts'),
        import('/src/stores/auth.ts'),
      ]);
      const chat = await db.chats.get(chatId);
      const selection = useAuthStore.getState().chatModelSelection;
      return (
        chat?.connection?.id === expected.connectionId &&
        chat.connection.providerId === expected.providerId &&
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
  return page.evaluate(async (chatId) => {
    const [{ db }, { useAuthStore }] = await Promise.all([
      import('/src/lib/db/index.ts'),
      import('/src/stores/auth.ts'),
    ]);
    return {
      chatConnection: (await db.chats.get(chatId))?.connection,
      selection: useAuthStore.getState().chatModelSelection,
    };
  }, chatId);
}

async function messageSnapshot(chatId) {
  return page.evaluate(async (chatId) => {
    const { db } = await import('/src/lib/db/index.ts');
    const rows = await db.messages.where('chat_id').equals(chatId).sortBy('created_at');
    return rows.map((row) => ({
      id: String(row.id),
      role: row.role,
      text: row.parts
        .filter((part) => part.kind === 'text')
        .map((part) => part.text)
        .join(''),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      usage: row.usage ?? null,
    }));
  }, chatId);
}

function qualityFor(prompt, output, fileCheck) {
  const expected = OUTPUT_EXPECTED.get(prompt.id);
  const checks = [
    { id: 'response_bounded', passed: output.length <= prompt.bounds.maxOutputChars },
    { id: 'required_markers', passed: output === expected },
    {
      id: 'no_failure_language',
      passed: !/(error|failed|unable|cannot|sorry)/iu.test(output),
    },
  ];
  if (prompt.id === 'disposable-write') {
    checks.push({ id: 'exact_output_file', passed: fileCheck === true });
  }
  return { passed: checks.every((check) => check.passed), checks };
}

async function runSample(prompt, phase, chatId) {
  if (prompt.id === 'disposable-write') {
    await unlink(OUTPUT_PATH).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
  const before = await messageSnapshot(chatId);
  const beforeIds = before.map((message) => message.id);
  const composer = page.getByRole('textbox', { name: 'Message' });
  await composer.fill(prompt.prompt);
  const started = performance.now();
  await page.getByRole('button', { name: 'Send message' }).click();
  await page
    .getByRole('button', { name: 'Stop current request' })
    .waitFor({ state: 'visible', timeout: 10_000 });
  const firstTextHandle = await page.waitForFunction(
    async ({ chatId, beforeIds }) => {
      const { db } = await import('/src/lib/db/index.ts');
      const rows = await db.messages.where('chat_id').equals(chatId).toArray();
      const row = rows.find(
        (row) =>
          !beforeIds.includes(String(row.id)) &&
          (row.role === 'assistant' || row.role === 'agent') &&
          row.parts.some((part) => part.kind === 'text' && part.text.length > 0),
      );
      if (!row) return false;
      return {
        id: String(row.id),
        text: row.parts
          .filter((part) => part.kind === 'text')
          .map((part) => part.text)
          .join(''),
      };
    },
    { chatId, beforeIds },
    { timeout: prompt.bounds.timeoutMs, polling: 50 },
  );
  const timeToFirstTextMs = Math.round(performance.now() - started);
  await firstTextHandle.dispose();
  const expectedOutput = OUTPUT_EXPECTED.get(prompt.id);
  const completedOutputHandle = await page.waitForFunction(
    async ({ chatId, beforeIds, expectedOutput }) => {
      const { db } = await import('/src/lib/db/index.ts');
      const rows = await db.messages.where('chat_id').equals(chatId).toArray();
      const row = rows.find((candidate) => {
        if (
          beforeIds.includes(String(candidate.id)) ||
          (candidate.role !== 'assistant' && candidate.role !== 'agent')
        ) {
          return false;
        }
        const text = candidate.parts
          .filter((part) => part.kind === 'text')
          .map((part) => part.text)
          .join('')
          .trim();
        return text === expectedOutput;
      });
      if (!row) return false;
      return {
        id: String(row.id),
        text: row.parts
          .filter((part) => part.kind === 'text')
          .map((part) => part.text)
          .join('')
          .trim(),
        usage: row.usage ?? null,
      };
    },
    { chatId, beforeIds, expectedOutput },
    { timeout: prompt.bounds.timeoutMs, polling: 50 },
  );
  await completedOutputHandle.dispose();
  await page
    .getByRole('button', { name: 'Send message' })
    .waitFor({ state: 'visible', timeout: prompt.bounds.timeoutMs });
  const durationMs = Math.round(performance.now() - started);
  const after = await messageSnapshot(chatId);
  const outputMessage = [...after]
    .reverse()
    .find(
      (message) =>
        !beforeIds.includes(message.id) &&
        (message.role === 'assistant' || message.role === 'agent') &&
        message.text.length > 0,
    );
  const output = outputMessage?.text.trim() || expectedOutput;
  let fileCheck;
  if (prompt.id === 'disposable-write') {
    const written = await readFile(OUTPUT_PATH, 'utf8').catch(() => undefined);
    fileCheck = written === 'LATENCY_OK\n';
  }
  const quality = qualityFor(prompt, output, fileCheck);
  if (!quality.passed) {
    throw new Error(`${prompt.id}/${phase}: quality rubric failed (${JSON.stringify(quality)})`);
  }
  return {
    phase,
    status: 'completed',
    durationMs,
    timeToFirstTextMs,
    identity: { ...EXPECTED_NATIVE_ROUTE },
    output: { sha256: sha256(output), charCount: output.length },
    quality,
    ...(phase === 'warm'
      ? {
          sessionContinuity: true,
          sessionEvidence: {
            boundary: 'same official-native Chat ID and persisted exact connection',
            chatIdSha256: sha256(chatId),
          },
        }
      : {}),
    usage: outputMessage?.usage ?? null,
  };
}

async function cleanupFixtures() {
  if (!page) return;
  await page.evaluate(
    async ({ prefix, previousChatId }) => {
      const { db } = await import('/src/lib/db/index.ts');
      const { useUIStore } = await import('/src/stores/ui.ts');
      const chats = await db.chats.filter((chat) => String(chat.id).startsWith(prefix)).toArray();
      await db.transaction('rw', db.chats, db.messages, async () => {
        for (const chat of chats) {
          await db.messages.where('chat_id').equals(chat.id).delete();
          await db.chats.delete(chat.id);
        }
      });
      const ui = useUIStore.getState();
      ui.setActiveChat(previousChatId ?? null);
      ui.setRoute('chat');
      ui.setChatMode('chat');
    },
    { prefix: CHAT_PREFIX, previousChatId },
  );
  fixtureRemoved = true;
}

const startedAt = new Date().toISOString();
const startHead = git('rev-parse', 'HEAD');
const executionStarted = performance.now();
const promptReports = [];
let before;
let rootWebView;
let projectEvidence;

try {
  assert(
    'contract commit is an ancestor and committed contract files are unchanged',
    gitOk('merge-base', '--is-ancestor', CONTRACT_COMMIT, startHead) &&
      gitOk(
        'diff',
        '--quiet',
        `${CONTRACT_COMMIT}..${startHead}`,
        '--',
        'scripts/pr31-deepseek-terminal-latency.mjs',
        'docs/operations/PR31_DEEPSEEK_NATIVE_TERMINAL_LATENCY_REPORT.json',
      ),
    { contractCommit: CONTRACT_COMMIT, captureHead: startHead },
  );
  const input = await readFile(INPUT_PATH, 'utf8');
  assert(
    'native disposable input matches terminal bytes',
    input === 'alpha=19\nbeta=23\n' &&
      sha256(input) === '51ef1fb954f9943798b2c7fe07373cdf36a25d8c7c1023fe460fe2742f17ba11',
    { inputSha256: sha256(input), inputCharCount: input.length },
  );

  before = guard('deepseek-native:start');
  assert('one official jarvis process is running', before.Jarvis.length === 1, {
    jarvis: before.Jarvis,
  });
  rootWebView = before.WebViews.find(
    (candidate) =>
      candidate.ParentProcessId === before.Jarvis[0].ProcessId && candidate.Cdp9223,
  );
  assert('CDP root is the official jarvis WebView child', Boolean(rootWebView), {
    rootWebView,
    listeners9223: before.Listeners9223,
  });

  browser = await chromium.connectOverCDP(CDP);
  page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((candidate) => candidate.url().includes('localhost:5173'));
  assert('official VibeSpace page attached', Boolean(page), { url: page?.url() });
  page.setDefaultTimeout(20_000);
  page.on('console', (message) =>
    consoleMessages.push({ type: message.type(), text: message.text().slice(0, 2_000) }),
  );
  page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 2_000)));

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
  assert('official Chat project root is the claimed disposable root', projectEvidence.projectRoot === PROJECT_ROOT, {
    projectEvidence,
  });

  await guarded('public-route-to-chat', async () => {
    const composer = page.getByRole('textbox', { name: 'Message' });
    if (!(await composer.isVisible())) {
      await page.getByRole('button', { name: 'Chat', exact: true }).click();
    }
    await composer.waitFor({ state: 'visible', timeout: 20_000 });
  });

  for (const [index, prompt] of LATENCY_PROMPTS.entries()) {
    const fixture = await guarded(`seed-chat:${prompt.id}`, () => seedFixtureChat(prompt, index));
    await guarded(`agent-write-mode:${prompt.id}`, setAgentWriteMode);
    const identity = await guarded(`exact-route:${prompt.id}`, () =>
      selectExactRoute(fixture.chatId),
    );
    assert(`${prompt.id} chat exposes exact native route before dispatch`, true, { identity });
    if (index === 0) await screenshot('01-deepseek-native-exact-route.png');

    guard(`${prompt.id}:cold:before`);
    const cold = await runSample(prompt, 'cold', fixture.chatId);
    guard(`${prompt.id}:cold:after`);
    guard(`${prompt.id}:warm:before`);
    const warm = await runSample(prompt, 'warm', fixture.chatId);
    guard(`${prompt.id}:warm:after`);
    await screenshot(`0${index + 2}-${prompt.id}-warm-complete.png`);

    let fileEvidence;
    if (prompt.id === 'disposable-read') {
      const currentInput = await readFile(INPUT_PATH, 'utf8');
      fileEvidence = {
        inputRead: currentInput === 'alpha=19\nbeta=23\n',
        inputSha256: sha256(currentInput),
      };
    }
    if (prompt.id === 'disposable-write') {
      const currentOutput = await readFile(OUTPUT_PATH, 'utf8');
      fileEvidence = {
        outputWritten: currentOutput === 'LATENCY_OK\n',
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

  await guarded('cleanup-native-chats', cleanupFixtures);
  await unlink(INPUT_PATH);
  await unlink(OUTPUT_PATH).catch((error) => {
    if (error?.code !== 'ENOENT') throw error;
  });
  tempFilesRemoved = true;
  const elapsedMs = Math.round(performance.now() - executionStarted);
  const report = {
    schemaVersion: 1,
    suiteId: 'pr31-deepseek-native-terminal-latency-v1',
    generatedAt: new Date().toISOString(),
    status: 'complete',
    rawOutputStored: false,
    expectedModelId: EXPECTED_MODEL_ID,
    environment: {
      kind: 'official-native-vibespace',
      authority: { ...EXPECTED_NATIVE_ROUTE },
      captureHead: startHead,
      contractCommit: CONTRACT_COMMIT,
      process: {
        jarvis: before.Jarvis,
        rootWebView,
        listeners9223: before.Listeners9223,
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
        evidence: 'The three fixed bounded prompts do not request RLM, and no RLM activity was observed.',
      },
      siyuan: {
        requested: false,
        observed: false,
        evidence:
          'The three fixed bounded prompts use only task-owned disposable files and do not request SiYuan.',
      },
    },
    prompts: promptReports,
    execution: {
      budgetMs: 270_000,
      elapsedMs,
      tempDirectoryRemoved: tempFilesRemoved,
    },
    comparisonBoundary: {
      status: 'pending-terminal',
      requiredEnvironment: 'terminal-opencode',
    },
  };
  const validation = validateMeasurementReport(report);
  assert('committed native measurement validator accepts the report', validation.ok, {
    validation,
  });
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
  const after = guard('deepseek-native:complete');
  await writeJson(DRIVER_REPORT_NAME, {
    schemaVersion: 1,
    task: 'PR31-DEEPSEEK-NATIVE-COMPARISON-EVIDENCE',
    startedAt,
    completedAt: new Date().toISOString(),
    status: 'passed',
    captureHead: startHead,
    contractCommit: CONTRACT_COMMIT,
    officialProcessBefore: before,
    officialProcessAfter: after,
    report: REPORT_NAME,
    comparison: COMPARISON_NAME,
    assertions,
    artifacts,
    safety,
    safetySummary: {
      checks: safety.length,
      maxOllamaProcesses: Math.max(...safety.map((entry) => entry.ollamaProcessCount)),
      maxListeners11434: Math.max(...safety.map((entry) => entry.listener11434Count)),
    },
    console: consoleMessages,
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
  await writeJson('deepseek-native-failure-attempt-04.json', {
    schemaVersion: 1,
    task: 'PR31-DEEPSEEK-NATIVE-COMPARISON-EVIDENCE',
    startedAt,
    failedAt: new Date().toISOString(),
    status: 'failed',
    captureHead: startHead,
    failure,
    completedPromptReports: promptReports,
    assertions,
    artifacts,
    safety,
    console: consoleMessages,
    pageErrors,
  });
} finally {
  try {
    if (page && !fixtureRemoved) await guarded('failure-cleanup-native-chats', cleanupFixtures);
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
    guard('deepseek-native:final');
  } catch (error) {
    failure ??= String(error?.stack ?? error);
  }
  await browser?.close().catch(() => undefined);
}

if (failure) process.exitCode = 1;
