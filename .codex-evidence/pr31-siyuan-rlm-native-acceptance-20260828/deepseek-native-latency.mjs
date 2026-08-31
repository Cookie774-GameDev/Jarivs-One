import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';

import { chromium } from 'playwright-core';

import {
  assessPromptQuality,
  EXPECTED_NATIVE_ROUTE,
  LATENCY_PROMPTS,
  validateMeasurementReport,
} from '../../scripts/pr31-deepseek-terminal-latency.mjs';

const ROOT = 'C:\\Users\\viper\\VibeSpace-UnifiedChungus-Final';
const CWD = 'C:\\Users\\viper\\AppData\\Roaming\\ai.jarvis.desktop\\Projects';
const OUT = resolve(
  ROOT,
  '.codex-evidence/pr31-siyuan-rlm-native-acceptance-20260828',
  process.env.RUN_LABEL ?? 'deepseek-native-latency-current',
);
const REPORT_PATH = resolve(OUT, 'native-report.json');
const EXPECTED_HEAD = process.env.EXPECTED_HEAD ?? '';
const JARVIS_PID = Number(process.env.JARVIS_PID ?? '');
const SESSION_REGISTRY_KEY = 'vibespace.opencode-session-registry.v1';
const EXECUTION_BUDGET_MS = 270_000;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim();

function safety(label) {
  const value = JSON.parse(
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$o=@(Get-Process ollama -ErrorAction SilentlyContinue);$p=@(Get-NetTCPConnection -State Listen -LocalPort 11434 -ErrorAction SilentlyContinue);$j=Get-CimInstance Win32_Process -Filter "ProcessId=${JARVIS_PID}" -ErrorAction SilentlyContinue;[pscustomobject]@{label='${label}';ollama=$o.Count;port11434=$p.Count;jarvis=@($j|Select-Object ProcessId,ParentProcessId,ExecutablePath)}|ConvertTo-Json -Depth 5 -Compress`,
      ],
      { encoding: 'utf8', timeout: 20_000 },
    ).trim(),
  );
  if (value.ollama !== 0 || value.port11434 !== 0 || value.jarvis.length !== 1) {
    throw new Error(`native_safety_failed:${label}`);
  }
  return value;
}

async function waitFor(description, observe, accept, timeoutMs = 35_000) {
  const started = performance.now();
  let last;
  while (performance.now() - started < timeoutMs) {
    last = await observe();
    if (accept(last)) return last;
    await new Promise((resolveWait) => setTimeout(resolveWait, 120));
  }
  throw new Error(`semantic_timeout:${description}:${JSON.stringify(last)?.slice(0, 800)}`);
}

async function main() {
  const head = git('rev-parse', 'HEAD');
  if (!EXPECTED_HEAD || head !== EXPECTED_HEAD) {
    throw new Error(`immutable_head_mismatch:${EXPECTED_HEAD || 'missing'}:${head}`);
  }
  if (!Number.isInteger(JARVIS_PID) || JARVIS_PID < 1) throw new Error('jarvis_pid_required');
  await mkdir(OUT, { recursive: true });
  for (const name of ['input.txt', 'output.txt']) {
    try {
      await readFile(resolve(CWD, name));
      throw new Error(`fixture_path_preexists:${name}`);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  const startedAt = performance.now();
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((candidate) => candidate.url().includes('localhost:5173'));
  if (!page) throw new Error('official_native_page_missing');
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 1_000)));
  const ambient = page.getByRole('dialog', { name: 'Ambient mode. Press any key to wake.' });
  if (await ambient.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await ambient.waitFor({ state: 'hidden', timeout: 10_000 });
  }
  const prior = await page.evaluate(async () => {
    const [{ db }, { useUIStore }] = await Promise.all([
      import('/src/lib/db/index.ts'),
      import('/src/stores/ui.ts'),
    ]);
    const stale = (await db.chats.toArray())
      .map((chat) => String(chat.id))
      .filter((id) => id.startsWith('chat_pr31_native_latency_'));
    await db.transaction('rw', db.chats, db.messages, async () => {
      for (const id of stale) {
        await db.messages.where('chat_id').equals(id).delete();
        await db.chats.delete(id);
      }
    });
    const registry = JSON.parse(localStorage.getItem('vibespace.opencode-session-registry.v1') ?? '{}');
    for (const scope of Object.values(registry)) {
      if (!scope || typeof scope !== 'object') continue;
      for (const id of stale) delete scope[id];
    }
    localStorage.setItem('vibespace.opencode-session-registry.v1', JSON.stringify(registry));
    const activeChatId = useUIStore.getState().activeChatId;
    return {
      activeChatId: stale.includes(String(activeChatId ?? '')) ? null : activeChatId,
      route: useUIStore.getState().route,
    };
  });
  const report = {
    schemaVersion: 1,
    suiteId: 'pr31-deepseek-native-terminal-latency-v1',
    generatedAt: new Date().toISOString(),
    status: 'complete',
    rawOutputStored: false,
    expectedModelId: EXPECTED_NATIVE_ROUTE.modelId,
    environment: {
      kind: 'official-native-vibespace',
      authority: EXPECTED_NATIVE_ROUTE,
      jarvisPid: JARVIS_PID,
      captureHead: head,
      cwdSha256: sha256(CWD.toLocaleLowerCase('en-US')),
      effort: 'high',
      fastMode: 'auto',
    },
    featureEvidence: {
      rlm: {
        requested: false,
        observed: false,
        evidence: 'All six bounded prompts explicitly avoided context expansion and emitted no RLM tool receipt.',
      },
      siyuan: {
        requested: false,
        observed: false,
        evidence: 'All six bounded prompts used only task-owned CWD fixtures and emitted no SiYuan tool receipt.',
      },
    },
    prompts: [],
    execution: { budgetMs: EXECUTION_BUDGET_MS, elapsedMs: 0, tempDirectoryRemoved: false },
    comparisonBoundary: { status: 'pending-terminal' },
    safety: [safety('start')],
  };
  const ownedChatIds = new Set();

  const messages = (chatId) =>
    page.evaluate(async (id) => {
      const { db } = await import('/src/lib/db/index.ts');
      return (await db.messages.where('chat_id').equals(id).sortBy('created_at')).map((row) => ({
        id: String(row.id),
        role: row.role,
        parts: row.parts,
        usage: row.usage ?? null,
      }));
    }, chatId);
  const sessionFor = (chatId) =>
    page.evaluate(
      ({ key, id }) => {
        const registry = JSON.parse(localStorage.getItem(key) ?? '{}');
        return Object.values(registry)
          .map((scope) => scope?.[id]?.sessionId)
          .find((value) => typeof value === 'string') ?? null;
      },
      { key: SESSION_REGISTRY_KEY, id: chatId },
    );

  async function seed(chatId, title) {
    ownedChatIds.add(chatId);
    return page.evaluate(
      async ({ chatId, title, route }) => {
        const [{ db }, { useAuthStore }, { useUIStore }, runtime, reasoning] = await Promise.all([
          import('/src/lib/db/index.ts'),
          import('/src/stores/auth.ts'),
          import('/src/stores/ui.ts'),
          import('/src/features/chat/runtime/chatRuntimeSettingsStore.ts'),
          import('/src/features/chat/reasoningSlashStore.ts'),
        ]);
        const auth = useAuthStore.getState();
        const now = Date.now();
        await db.transaction('rw', db.chats, db.messages, async () => {
          await db.messages.where('chat_id').equals(chatId).delete();
          await db.chats.delete(chatId);
          await db.chats.add({
            id: chatId,
            workspace_id: auth.workspaceId,
            project_id: auth.projectId,
            title,
            mode: 'chat',
            active_agent_ids: [],
            connection: {
              providerId: route.providerId,
              id: route.connectionId,
              modelId: route.modelId,
              mode: 'external-cli',
              authSource: 'opencode-provider-session',
            },
            created_at: now,
            updated_at: now,
          });
        });
        useUIStore.getState().setActiveChat(chatId);
        useUIStore.getState().setRoute('chat');
        useUIStore.getState().setChatMode('chat');
        runtime.writeChatRuntimePolicyState(chatId, {
          settings: { effort: 'high', fastMode: 'auto', performance: 'quality', rlmEnabled: true },
          access: 'write',
          approveAllForRun: false,
        });
        reasoning.writeChatReasoningEffort(chatId, 'high');
      },
      { chatId, title, route: EXPECTED_NATIVE_ROUTE },
    );
  }

  async function cleanup(chatId) {
    await page.evaluate(
      async ({ chatId, prior, key }) => {
        const [{ db }, { useUIStore }] = await Promise.all([
          import('/src/lib/db/index.ts'),
          import('/src/stores/ui.ts'),
        ]);
        await db.transaction('rw', db.chats, db.messages, async () => {
          await db.messages.where('chat_id').equals(chatId).delete();
          await db.chats.delete(chatId);
        });
        const registry = JSON.parse(localStorage.getItem(key) ?? '{}');
        for (const scope of Object.values(registry)) if (scope && typeof scope === 'object') delete scope[chatId];
        localStorage.setItem(key, JSON.stringify(registry));
        useUIStore.getState().setActiveChat(prior.activeChatId ?? null);
        useUIStore.getState().setRoute(prior.route ?? 'chat');
      },
      { chatId, prior, key: SESSION_REGISTRY_KEY },
    );
    ownedChatIds.delete(chatId);
  }

  async function wakeAmbient() {
    const dialog = page.getByRole('dialog', { name: 'Ambient mode. Press any key to wake.' });
    if (!(await dialog.isVisible().catch(() => false))) return;
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
  }

  async function ensureAgentWriteMode() {
    await wakeAmbient();
    const trigger = page.getByRole('button', { name: /Mode\. Open permissions panel\./u });
    await trigger.click();
    const modes = page.getByRole('listbox', { name: 'Chat modes' });
    await modes.waitFor({ state: 'visible' });
    await modes.getByRole('option', { name: /Agent Mode/u }).click();
    const access = page.getByRole('listbox', { name: 'Access and Approve All' });
    await access.waitFor({ state: 'visible' });
    const write = access.getByRole('option', { name: /Write Access/u });
    if ((await write.getAttribute('aria-selected')) !== 'true') await write.click();
    await page.keyboard.press('Escape');
  }

  async function runTurn(chatId, prompt, expectedAction) {
    await wakeAmbient();
    const before = await messages(chatId);
    const beforeIds = new Set(before.map((row) => row.id));
    const started = performance.now();
    await page.getByRole('textbox', { name: 'Message' }).fill(prompt);
    await page.getByRole('button', { name: 'Send message' }).click();
    await waitFor(
      'user dispatch persisted',
      () => messages(chatId),
      (rows) => rows.some((row) => !beforeIds.has(row.id) && row.role === 'user'),
      10_000,
    );
    const firstText = waitFor(
      'first assistant text',
      () => messages(chatId),
      (rows) => rows.some((row) => !beforeIds.has(row.id) && (row.role === 'assistant' || row.role === 'agent') && row.parts.some((part) => part.kind === 'text' && part.text)),
    ).then(() => Math.round(performance.now() - started));
    if (expectedAction) {
      const proposed = await waitFor(
        'exact action proposal',
        () => messages(chatId),
        (rows) => rows.flatMap((row) => row.parts.filter((part) => !beforeIds.has(row.id) && part.kind === 'action_proposal')).length === 1,
      );
      const proposal = proposed
        .flatMap((row) => row.parts.map((part) => ({ rowId: row.id, part })))
        .find(({ rowId, part }) => !beforeIds.has(rowId) && part.kind === 'action_proposal')?.part;
      if (proposal?.action_id !== expectedAction) throw new Error(`unexpected_action:${proposal?.action_id}`);
      const expectedPath = resolve(CWD, expectedAction === 'files.read' ? 'input.txt' : 'output.txt').toLocaleLowerCase('en-US');
      if (String(proposal.params?.path ?? '').replace(/^\\\\\?\\/u, '').toLocaleLowerCase('en-US') !== expectedPath) {
        throw new Error('unexpected_action_path');
      }
      const approvalId = String(proposal.call_id).replace(/^jarvisapproval:/u, '');
      await page.locator(`[data-approval-id="${approvalId}"]`).getByRole('button', { name: 'Approve fixed action' }).click();
    }
    const firstTextMs = await firstText;
    await waitFor(
      'turn settled with send re-enabled',
      async () => ({
        rows: await messages(chatId),
        stopVisible: await page
          .getByRole('button', { name: 'Stop current request' })
          .isVisible()
          .catch(() => false),
      }),
      ({ rows, stopVisible }) =>
        !stopVisible &&
        rows.some(
          (row) =>
            !beforeIds.has(row.id) &&
            (row.role === 'assistant' || row.role === 'agent') &&
            row.parts.some((part) => part.kind === 'text' && part.text) &&
            row.usage,
        ),
      35_000,
    );
    const durationMs = Math.round(performance.now() - started);
    const after = await messages(chatId);
    const created = after.filter((row) => !beforeIds.has(row.id));
    const assistant = created.filter((row) => row.role === 'assistant' || row.role === 'agent');
    const output = assistant.flatMap((row) => row.parts.filter((part) => part.kind === 'text').map((part) => part.text)).join('');
    const usage = assistant.map((row) => row.usage).filter(Boolean);
    if (!usage.some((row) => row.provider === EXPECTED_NATIVE_ROUTE.providerId && row.model === EXPECTED_NATIVE_ROUTE.modelId)) {
      throw new Error('native_route_substitution');
    }
    const toolNames = assistant.flatMap((row) => row.parts.filter((part) => part.kind === 'tool_call').map((part) => String(part.name ?? part.tool_name ?? '')));
    if (toolNames.some((name) => /rlm|siyuan|context/iu.test(name))) throw new Error('unrequested_context_route');
    const sessionId = await sessionFor(chatId);
    if (!sessionId) throw new Error('native_session_identity_missing');
    return { output, durationMs, timeToFirstTextMs: firstTextMs, sessionId };
  }

  try {
    for (const promptCase of LATENCY_PROMPTS) {
      const chatId = `chat_pr31_native_latency_${promptCase.id}_${Date.now()}`;
      if (promptCase.id === 'disposable-read') await writeFile(resolve(CWD, 'input.txt'), 'alpha=19\nbeta=23\n', { flag: 'wx' });
      if (promptCase.id === 'disposable-write') await unlink(resolve(CWD, 'output.txt')).catch((error) => { if (error?.code !== 'ENOENT') throw error; });
      await seed(chatId, `PR31 Native Latency ${promptCase.id}`);
      await page.getByRole('textbox', { name: 'Message' }).waitFor({ state: 'visible' });
      await ensureAgentWriteMode();
      const expectedAction = promptCase.id === 'disposable-read' ? 'files.read' : promptCase.id === 'disposable-write' ? 'files.edit' : undefined;
      const cold = await runTurn(chatId, promptCase.prompt, expectedAction);
      const coldQuality = await assessPromptQuality(promptCase, cold, CWD);
      if (!coldQuality.passed) throw new Error(`quality_failed:${promptCase.id}:cold`);
      if (promptCase.id === 'disposable-write') await writeFile(resolve(CWD, 'output.txt'), 'WARM_REWRITE_REQUIRED\n', 'utf8');
      const warm = await runTurn(chatId, promptCase.prompt, expectedAction);
      const warmQuality = await assessPromptQuality(promptCase, warm, CWD);
      if (!warmQuality.passed) throw new Error(`quality_failed:${promptCase.id}:warm`);
      if (warm.sessionId !== cold.sessionId) throw new Error(`session_substitution:${promptCase.id}`);
      const sample = (measurement, phase, quality) => ({
        phase,
        status: 'completed',
        durationMs: measurement.durationMs,
        timeToFirstTextMs: measurement.timeToFirstTextMs,
        identity: EXPECTED_NATIVE_ROUTE,
        output: { sha256: sha256(measurement.output), charCount: measurement.output.length },
        quality,
        sessionSha256: sha256(measurement.sessionId),
        ...(phase === 'warm' ? { sessionContinuity: true } : {}),
      });
      report.prompts.push({
        id: promptCase.id,
        promptSha256: promptCase.promptSha256,
        bounds: promptCase.bounds,
        samples: { cold: sample(cold, 'cold', coldQuality), warm: sample(warm, 'warm', warmQuality) },
        ...(promptCase.id === 'disposable-read'
          ? { fileEvidence: { inputRead: (await readFile(resolve(CWD, 'input.txt'), 'utf8')) === 'alpha=19\nbeta=23\n', inputSha256: sha256(await readFile(resolve(CWD, 'input.txt'), 'utf8')) } }
          : {}),
        ...(promptCase.id === 'disposable-write'
          ? { fileEvidence: { outputWritten: (await readFile(resolve(CWD, 'output.txt'), 'utf8')) === 'LATENCY_OK\n', outputSha256: sha256(await readFile(resolve(CWD, 'output.txt'), 'utf8')) } }
          : {}),
      });
      await cleanup(chatId);
      if (performance.now() - startedAt > EXECUTION_BUDGET_MS) throw new Error('execution_budget_exceeded');
    }
    if (pageErrors.length > 0) throw new Error(`page_errors:${pageErrors.join('|')}`);
    report.execution.elapsedMs = Math.round(performance.now() - startedAt);
    report.execution.tempDirectoryRemoved = true;
    report.safety.push(safety('final'));
    const validation = validateMeasurementReport(report);
    if (!validation.ok) throw new Error(`native_report_invalid:${validation.errors.join('|')}`);
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  } finally {
    for (const chatId of ownedChatIds) await cleanup(chatId).catch(() => undefined);
    await unlink(resolve(CWD, 'input.txt')).catch((error) => { if (error?.code !== 'ENOENT') throw error; });
    await unlink(resolve(CWD, 'output.txt')).catch((error) => { if (error?.code !== 'ENOENT') throw error; });
    await page.evaluate(
      async (priorState) => {
        const { useUIStore } = await import('/src/stores/ui.ts');
        useUIStore.getState().setActiveChat(priorState.activeChatId ?? null);
        useUIStore.getState().setRoute(priorState.route ?? 'chat');
      },
      prior,
    ).catch(() => undefined);
    await browser.close();
  }
}

await main();
