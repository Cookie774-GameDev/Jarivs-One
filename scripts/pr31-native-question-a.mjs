#!/usr/bin/env node
import { execFile as execFileCallback } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFile, lstat, mkdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execFileCallback);
const AUTH_KEY = 'jarvis-auth';
const UI_KEY = 'jarvis-ui';
const RUNTIME_KEY = 'vibespace.chat-runtime-settings.v1';
const REASONING_KEY = 'vibespace.chat-reasoning.v1';
const PROFILE_PARTS = ['ai.jarvis.desktop', 'EBWebView'];
const TERMINAL_STATES = new Set(['done', 'error', 'cancelled']);
const INTERNAL_MARKER =
  /\[(?:unverified|verified)\s+(?:output\s+location|link)\s+omitted\]|\uE000JARVIS_REGION_\d+\uE001/iu;
const SAFE_CODE = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/u;
const SAFE_ROUTE_PART = /^[A-Za-z0-9_.:-]{1,160}$/u;
const SAFE_MODEL_ID = /^[A-Za-z0-9_./:@+-]{1,320}$/u;
const EFFORTS = new Set(['auto', 'minimal', 'low', 'medium', 'high', 'ultra', 'max']);
const PERFORMANCES = new Set(['responsive', 'balanced', 'quality']);
const FAST_MODES = new Set(['auto', 'on', 'off']);

export class NativeQuestionADriverError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'NativeQuestionADriverError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new NativeQuestionADriverError(code, message);
}

function oneValue(argv, index, name) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) fail('invalid_arguments', `${name} requires a value`);
  return value;
}

export function parseArgs(argv) {
  const options = {
    mode: 'inspect',
    runs: 3,
    timeoutMs: 360_000,
    minWords: 650,
    maxWords: 750,
  };
  const seen = new Set();
  let modeFlag = '';
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!name?.startsWith('--') || seen.has(name)) fail('invalid_arguments');
    seen.add(name);
    if (name === '--inspect' || name === '--send') {
      if (modeFlag) fail('invalid_arguments');
      modeFlag = name;
      options.mode = name === '--send' ? 'send' : 'inspect';
      continue;
    }
    const value = oneValue(argv, index, name);
    index += 1;
    if (name === '--evidence-dir') options.evidenceDir = path.resolve(value);
    else if (name === '--prompt-file') options.promptFile = path.resolve(value);
    else if (name === '--runs') options.runs = Number(value);
    else if (name === '--timeout-ms') options.timeoutMs = Number(value);
    else if (name === '--min-words') options.minWords = Number(value);
    else if (name === '--max-words') options.maxWords = Number(value);
    else if (name === '--cdp-port') options.cdpPort = Number(value);
    else if (name === '--jarvis-pid') options.jarvisPid = Number(value);
    else if (name === '--expect-provider') options.expectedProvider = value;
    else if (name === '--expect-connection') options.expectedConnection = value;
    else if (name === '--expect-model') options.expectedModel = value;
    else if (name === '--reject-effort') options.rejectedEffort = value;
    else if (name === '--expect-effort') options.expectedEffort = value;
    else if (name === '--expect-performance') options.expectedPerformance = value;
    else if (name === '--expect-fast') options.expectedFast = value;
    else if (name === '--expect-rlm') options.expectedRlm = value;
    else fail('invalid_arguments', `Unknown option: ${name}`);
  }
  if (!options.evidenceDir) fail('evidence_directory_required');
  if (!Number.isInteger(options.runs) || options.runs < 1 || options.runs > 3)
    fail('invalid_run_count');
  if (
    !Number.isInteger(options.timeoutMs) ||
    options.timeoutMs < 1_000 ||
    options.timeoutMs > 1_800_000
  )
    fail('invalid_timeout');
  if (
    !Number.isInteger(options.minWords) ||
    !Number.isInteger(options.maxWords) ||
    options.minWords < 1 ||
    options.maxWords > 5_000 ||
    options.minWords > options.maxWords
  )
    fail('invalid_word_bounds');
  for (const key of ['cdpPort', 'jarvisPid']) {
    if (options[key] !== undefined && (!Number.isInteger(options[key]) || options[key] < 1))
      fail('invalid_arguments');
  }
  if (options.mode === 'send') {
    const required = [
      'promptFile',
      'expectedProvider',
      'expectedConnection',
      'expectedModel',
      'expectedEffort',
      'expectedPerformance',
      'expectedFast',
      'expectedRlm',
      'jarvisPid',
    ];
    if (required.some((key) => !options[key])) fail('send_authority_incomplete');
  } else if (options.promptFile) {
    fail('inspection_cannot_accept_prompt');
  }
  if (options.expectedFast && !['auto', 'on', 'off'].includes(options.expectedFast))
    fail('invalid_expected_fast');
  if (options.expectedRlm && !['on', 'off'].includes(options.expectedRlm))
    fail('invalid_expected_rlm');
  if (options.rejectedEffort && !EFFORTS.has(options.rejectedEffort))
    fail('invalid_rejected_effort');
  if (
    options.expectedPerformance &&
    !['responsive', 'balanced', 'quality'].includes(options.expectedPerformance)
  )
    fail('invalid_expected_performance');
  return Object.freeze(options);
}

function normalizeProcess(raw) {
  return {
    name: String(raw.Name ?? raw.name ?? ''),
    pid: Number(raw.ProcessId ?? raw.pid),
    parentPid: Number(raw.ParentProcessId ?? raw.parentPid),
    executablePath: String(raw.ExecutablePath ?? raw.executablePath ?? ''),
    commandLine: String(raw.CommandLine ?? raw.commandLine ?? ''),
  };
}

function normalizedWindowsPath(value) {
  return path.win32
    .normalize(value)
    .replace(/[\\/]+$/u, '')
    .toLowerCase();
}

function commandLineValue(commandLine, option) {
  const escaped = option.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = commandLine.match(
    new RegExp(`(?:^|\\s)--${escaped}(?:=|\\s+)(?:"([^"]+)"|'([^']+)'|([^\\s]+))`, 'iu'),
  );
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function isDescendant(process, ancestorPid, byPid) {
  const visited = new Set();
  let cursor = process;
  while (cursor && cursor.parentPid > 0 && !visited.has(cursor.pid)) {
    if (cursor.parentPid === ancestorPid) return true;
    visited.add(cursor.pid);
    cursor = byPid.get(cursor.parentPid);
  }
  return false;
}

export function resolveOfficialNativeTarget(rawProcesses, options = {}) {
  const localAppData = options.localAppData;
  if (!localAppData) fail('local_app_data_unavailable');
  const officialProfile = normalizedWindowsPath(path.win32.join(localAppData, ...PROFILE_PARTS));
  const processes = rawProcesses
    .map(normalizeProcess)
    .filter((item) => Number.isInteger(item.pid) && item.pid > 0);
  const byPid = new Map(processes.map((item) => [item.pid, item]));
  const jarvis = processes.filter(
    (item) =>
      item.name.toLowerCase() === 'jarvis.exe' &&
      path.win32.basename(item.executablePath).toLowerCase() === 'jarvis.exe' &&
      (!options.jarvisPid || item.pid === options.jarvisPid),
  );
  const candidates = [];
  for (const owner of jarvis) {
    for (const child of processes) {
      if (
        child.name.toLowerCase() !== 'msedgewebview2.exe' ||
        !isDescendant(child, owner.pid, byPid)
      )
        continue;
      const profile = commandLineValue(child.commandLine, 'user-data-dir');
      const port = Number(commandLineValue(child.commandLine, 'remote-debugging-port'));
      if (
        !profile ||
        normalizedWindowsPath(profile) !== officialProfile ||
        !Number.isInteger(port) ||
        port < 1 ||
        port > 65_535
      )
        continue;
      if (options.cdpPort && port !== options.cdpPort) continue;
      candidates.push({ owner, child, port, profile: path.win32.normalize(profile) });
    }
  }
  const unique = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.owner.pid}:${candidate.port}`;
    const previous = unique.get(key);
    if (!previous || candidate.child.pid < previous.child.pid) unique.set(key, candidate);
  }
  if (unique.size !== 1)
    fail(
      unique.size === 0 ? 'official_native_target_not_found' : 'official_native_target_ambiguous',
    );
  const [{ owner, child, port, profile }] = unique.values();
  return Object.freeze({
    jarvisPid: owner.pid,
    webViewPid: child.pid,
    executablePath: owner.executablePath,
    profile,
    cdpPort: port,
    ownership: 'jarvis_descendant_exact_official_profile',
  });
}

export async function readWindowsProcesses() {
  if (process.platform !== 'win32') fail('windows_required');
  const command =
    'Get-CimInstance Win32_Process | Select-Object Name,ProcessId,ParentProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress -Depth 3';
  let stdout;
  try {
    ({ stdout } = await execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { encoding: 'utf8', windowsHide: true, timeout: 15_000, maxBuffer: 8 * 1024 * 1024 },
    ));
  } catch {
    fail('process_inspection_unavailable');
  }
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    fail('process_inspection_invalid');
  }
  return Array.isArray(parsed) ? parsed : [parsed];
}

export function safeDispatchReceipt(detail) {
  const selection = detail?.modelSelectionOverride;
  const runtime = detail?.runtimeSettings;
  const reasoning = detail?.reasoningPreference;
  return Object.freeze({
    chatId: safeValue(detail?.chatId, SAFE_ROUTE_PART),
    providerId:
      selection?.mode === 'single' ? safeValue(selection.providerId, SAFE_ROUTE_PART) : '',
    connectionId:
      selection?.mode === 'single' ? safeValue(selection.connectionId, SAFE_ROUTE_PART) : '',
    modelId: selection?.mode === 'single' ? safeValue(selection.modelId, SAFE_MODEL_ID) : '',
    effort: safeEnum(reasoning?.effortOverride ?? runtime?.effort, EFFORTS),
    runtimeEffort: safeEnum(runtime?.effort, EFFORTS),
    performance: safeEnum(runtime?.performance, PERFORMANCES),
    fastMode: safeEnum(runtime?.fastMode, FAST_MODES),
    rlmEnabled: runtime?.rlmEnabled === true,
  });
}

function safeValue(value, pattern) {
  const text = String(value ?? '');
  return pattern.test(text) ? text : '';
}

function safeEnum(value, allowed) {
  const text = String(value ?? '');
  return allowed.has(text) ? text : '';
}

export function assertExactRoute(receipt, expected) {
  const pairs = [
    ['providerId', expected.expectedProvider],
    ['connectionId', expected.expectedConnection],
    ['modelId', expected.expectedModel],
    ['effort', expected.expectedEffort],
    ['runtimeEffort', expected.expectedEffort],
    ['performance', expected.expectedPerformance],
    ['fastMode', expected.expectedFast],
  ];
  const mismatch = pairs.find(([key, value]) => value !== undefined && receipt[key] !== value);
  if (mismatch) fail('exact_route_mismatch', `Exact route mismatch: ${mismatch[0]}`);
  if (expected.expectedRlm !== undefined && receipt.rlmEnabled !== (expected.expectedRlm === 'on'))
    fail('exact_route_mismatch', 'Exact route mismatch: rlmEnabled');
  return true;
}

export function assertLiveEffortAuthority(authority, expectedEffort) {
  if (!authority || authority.registered !== true) fail('expected_model_not_live_registered');
  if (expectedEffort !== 'auto' && !authority.variants.includes(expectedEffort))
    fail('expected_effort_not_live_supported');
  return true;
}

function assertPreflightRoute(inspection, expected) {
  const receipt = {
    providerId: inspection.selection?.providerId ?? '',
    connectionId: inspection.selection?.connectionId ?? '',
    modelId: inspection.selection?.modelId ?? '',
    effort: inspection.runtime.effort,
    runtimeEffort: inspection.runtime.runtimeEffort,
    performance: inspection.runtime.performance,
    fastMode: inspection.runtime.fastMode,
    rlmEnabled: inspection.runtime.rlmEnabled,
  };
  assertExactRoute(receipt, expected);
}

export function assessVisibleResponse(text, bounds = { minWords: 650, maxWords: 750 }) {
  const words = text.trim().match(/\S+/gu) ?? [];
  const normalized = words
    .map((word) => word.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''))
    .filter(Boolean);
  let duplicateTail = false;
  const size = 24;
  const positions = new Map();
  for (let index = 0; index <= normalized.length - size && !duplicateTail; index += 1) {
    const key = normalized.slice(index, index + size).join('\u0001');
    const earlier = positions.get(key) ?? [];
    for (const start of earlier) {
      if (index - start < 50) continue;
      let length = size;
      while (
        start + length < index &&
        index + length < normalized.length &&
        normalized[start + length] === normalized[index + length]
      )
        length += 1;
      if (length >= 50 && length / normalized.length >= 0.25) duplicateTail = true;
    }
    if (earlier.length < 4) earlier.push(index);
    positions.set(key, earlier);
  }
  const wordCount = words.length;
  return Object.freeze({
    wordCount,
    withinWordBounds: wordCount >= bounds.minWords && wordCount <= bounds.maxWords,
    duplicateTail,
    internalMarker: INTERNAL_MARKER.test(text),
  });
}

export function classifyConsoleError(text) {
  const value = String(text);
  if (/unauthori[sz]ed|\b401\b|\b403\b/iu.test(value)) return 'auth_error';
  if (/ERR_CONNECTION_REFUSED|failed to fetch|networkerror/iu.test(value)) return 'network_error';
  if (/opencode protected turn failed/iu.test(value)) return 'opencode_turn_error';
  if (/tauri|__TAURI/iu.test(value)) return 'native_bridge_error';
  if (/react|render|hydration/iu.test(value)) return 'renderer_error';
  return 'console_error';
}

async function inspectPageState(page) {
  return page.evaluate(
    ({ authKey, uiKey, runtimeKey, reasoningKey }) => {
      const parse = (key) => {
        try {
          const value = JSON.parse(localStorage.getItem(key) ?? 'null');
          return value && typeof value === 'object' ? (value.state ?? value) : {};
        } catch {
          return {};
        }
      };
      const auth = parse(authKey);
      const ui = parse(uiKey);
      const runtime = parse(runtimeKey);
      const reasoning = parse(reasoningKey);
      const chatId = typeof ui.activeChatId === 'string' ? ui.activeChatId : '';
      const selection = auth.chatModelSelection ?? {};
      const runtimeSettings = runtime.chats?.[chatId]?.settings ?? {};
      const reasoningPreference = reasoning.chats?.[chatId] ?? {};
      const safe = (value, pattern) => {
        const text = String(value ?? '');
        return pattern.test(text) ? text : '';
      };
      const safeEnum = (value, allowed) => {
        const text = String(value ?? '');
        return allowed.includes(text) ? text : '';
      };
      const main = document.querySelector('[data-vibespace-page="chat"]');
      return {
        activeChatId: safe(chatId, /^[A-Za-z0-9_.:-]{1,160}$/u),
        selection:
          selection.mode === 'single'
            ? {
                providerId: safe(selection.providerId, /^[A-Za-z0-9_.:-]{1,160}$/u),
                connectionId: safe(selection.connectionId, /^[A-Za-z0-9_.:-]{1,160}$/u),
                modelId: safe(selection.modelId, /^[A-Za-z0-9_./:@+-]{1,320}$/u),
              }
            : null,
        runtime: {
          effort: safeEnum(reasoningPreference.effortOverride ?? runtimeSettings.effort, [
            'auto',
            'minimal',
            'low',
            'medium',
            'high',
            'ultra',
            'max',
          ]),
          runtimeEffort: safeEnum(runtimeSettings.effort, [
            'auto',
            'minimal',
            'low',
            'medium',
            'high',
            'ultra',
            'max',
          ]),
          performance: safeEnum(runtimeSettings.performance, ['responsive', 'balanced', 'quality']),
          fastMode: safeEnum(runtimeSettings.fastMode, ['auto', 'on', 'off']),
          rlmEnabled: runtimeSettings.rlmEnabled === true,
        },
        selectors: {
          main: document.querySelectorAll('[data-vibespace-page="chat"]').length,
          composer: main?.querySelectorAll('textarea[data-composer-input="true"]').length ?? 0,
          send: main?.querySelectorAll('button[aria-label="Send message"]').length ?? 0,
          newChat: document.querySelectorAll(
            '[data-monochrome-surface="tab-strip"] button[aria-label="New chat"]',
          ).length,
          model: main?.querySelectorAll('button[aria-label="Choose model"]').length ?? 0,
          chatLog: main?.querySelectorAll('[role="log"][data-tour="chat-thread"]').length ?? 0,
        },
      };
    },
    { authKey: AUTH_KEY, uiKey: UI_KEY, runtimeKey: RUNTIME_KEY, reasoningKey: REASONING_KEY },
  );
}

async function inspectLiveOpenCodeAuthority(page, expected) {
  if (expected.expectedConnection !== 'opencode-cli') return null;
  return page.evaluate(
    async ({ modelId }) => {
      const safeModel = /^[A-Za-z0-9_./:@+-]{1,320}$/u;
      const safeVariant = /^[A-Za-z0-9_.:-]{1,80}$/u;
      try {
        const module = await import('/src/lib/ai/adapters/opencodePersistent.ts');
        const models = await module.openCodePersistentAdapter.listModels();
        const model = models.find((candidate) => candidate.id === modelId);
        if (!model) return { registered: false, modelId, variants: [] };
        return {
          registered: true,
          modelId: safeModel.test(String(model.id)) ? String(model.id) : '',
          variants: Array.isArray(model.variants)
            ? model.variants
                .map(String)
                .filter((variant) => safeVariant.test(variant))
                .slice(0, 32)
            : [],
        };
      } catch {
        return { registered: false, modelId, variants: [] };
      }
    },
    { modelId: expected.expectedModel },
  );
}

async function installProbe(page) {
  await page.evaluate(() => {
    if (window.__PR31_NATIVE_QA_V1__) return;
    const state = { sends: [], runs: [] };
    Object.defineProperty(window, '__PR31_NATIVE_QA_V1__', { value: state, configurable: true });
    window.addEventListener('jarvis:send', (event) => {
      const detail = event.detail ?? {};
      const selection = detail.modelSelectionOverride ?? {};
      const runtime = detail.runtimeSettings ?? {};
      const reasoning = detail.reasoningPreference ?? {};
      state.sends.push({
        at: Date.now(),
        chatId: typeof detail.chatId === 'string' ? detail.chatId : '',
        modelSelectionOverride:
          selection.mode === 'single'
            ? {
                mode: 'single',
                providerId: String(selection.providerId ?? ''),
                connectionId: String(selection.connectionId ?? ''),
                modelId: String(selection.modelId ?? ''),
              }
            : { mode: String(selection.mode ?? '') },
        reasoningPreference: { effortOverride: reasoning.effortOverride ?? null },
        runtimeSettings: {
          effort: String(runtime.effort ?? ''),
          performance: String(runtime.performance ?? ''),
          fastMode: String(runtime.fastMode ?? ''),
          rlmEnabled: runtime.rlmEnabled === true,
        },
      });
    });
    window.addEventListener('jarvis:run-state', (event) => {
      const detail = event.detail ?? {};
      state.runs.push({
        at: Date.now(),
        chatId: typeof detail.chatId === 'string' ? detail.chatId : '',
        status: String(detail.status ?? ''),
        errorCode:
          typeof detail.errorCode === 'string' &&
          /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(detail.errorCode)
            ? detail.errorCode
            : undefined,
      });
    });
  });
}

async function probeSnapshot(page) {
  return page.evaluate(() =>
    structuredClone(window.__PR31_NATIVE_QA_V1__ ?? { sends: [], runs: [] }),
  );
}

async function activeChatId(page) {
  return page.evaluate((key) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? 'null');
      return String((value?.state ?? value)?.activeChatId ?? '');
    } catch {
      return '';
    }
  }, UI_KEY);
}

async function createChat(page) {
  const before = await activeChatId(page);
  const buttons = page.locator(
    '[data-monochrome-surface="tab-strip"] button[aria-label="New chat"]:visible',
  );
  if ((await buttons.count()) === 0) fail('new_chat_control_unavailable');
  await page.keyboard.press('Control+T');
  await page.waitForFunction(
    ({ key, beforeId }) => {
      try {
        const value = JSON.parse(localStorage.getItem(key) ?? 'null');
        const id = String((value?.state ?? value)?.activeChatId ?? '');
        return id && id !== beforeId;
      } catch {
        return false;
      }
    },
    { key: UI_KEY, beforeId: before },
    { timeout: 10_000 },
  );
  return activeChatId(page);
}

async function applyRuntimeCommand(page, command) {
  const main = page.locator('[data-vibespace-page="chat"]:visible');
  const composer = main.locator('textarea[data-composer-input="true"]:visible');
  if (
    (await composer.count()) !== 1 ||
    (await main.locator('button[aria-label="Send message"]:visible').count()) !== 1
  )
    fail('canonical_chat_surface_unavailable');
  await composer.fill(command);
  await composer.press('Control+Enter');
  await page.waitForFunction(
    () => {
      const input = document.querySelector(
        '[data-vibespace-page="chat"] textarea[data-composer-input="true"]',
      );
      return input instanceof HTMLTextAreaElement && input.value === '';
    },
    undefined,
    { timeout: 5_000 },
  );
}

async function waitForRuntimeControl(page, field, expected) {
  const value = field === 'rlmEnabled' ? expected === 'on' : expected;
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const state = await inspectPageState(page);
    if (state.runtime[field] === value) return;
    await page.waitForTimeout(50);
  }
  fail(`runtime_control_${field}_not_applied`);
}

async function configureExactModelViaUi(page, expected) {
  const main = page.locator('[data-vibespace-page="chat"]:visible');
  const trigger = main.locator('button[aria-label="Choose model"]:visible');
  if ((await trigger.count()) !== 1) fail('model_control_unavailable');
  await trigger.click();
  const dropdown = page.locator('.jarvis-slash-dropdown:visible');
  await dropdown.waitFor({ state: 'visible', timeout: 10_000 });
  const search = dropdown.locator('input[aria-label="Search providers and models"]:visible');
  if ((await search.count()) !== 1) fail('model_search_unavailable');
  await search.fill(expected.expectedModel);
  const exactOptionId = `${expected.expectedConnection}:${expected.expectedModel}`;
  let exactOption = dropdown.locator(`[data-value="${exactOptionId}"]:visible`);
  if ((await exactOption.count()) === 0) {
    const logicalMatches = dropdown.locator('[data-value]:visible');
    if ((await logicalMatches.count()) !== 1) fail('exact_model_option_ambiguous');
    await logicalMatches.click();
    const routeGroup = dropdown.locator('[role="group"][aria-label$=" routes"]:visible');
    await routeGroup.waitFor({ state: 'visible', timeout: 5_000 });
    exactOption = routeGroup.locator(`[data-value="${exactOptionId}"]:visible`);
  } else {
    if ((await exactOption.count()) !== 1) fail('exact_model_option_ambiguous');
    await exactOption.click();
    const routeGroup = dropdown.locator('[role="group"][aria-label$=" routes"]:visible');
    if ((await routeGroup.count()) === 1) {
      exactOption = routeGroup.locator(`[data-value="${exactOptionId}"]:visible`);
    } else {
      exactOption = dropdown.locator('[data-effort-level]:visible').first();
    }
  }
  if ((await exactOption.count()) !== 1) fail('exact_model_route_ambiguous');
  if ((await dropdown.locator('[data-effort-level]:visible').count()) === 0) {
    await exactOption.click();
  }
  const effort = dropdown.locator(`[data-effort-level="${expected.expectedEffort}"]`);
  await effort.waitFor({ state: 'visible', timeout: 5_000 });
  if ((await effort.count()) !== 1) fail('expected_effort_option_ambiguous');
  await effort.click();
  await dropdown.waitFor({ state: 'hidden', timeout: 5_000 });
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const state = await inspectPageState(page);
    if (
      state.selection.providerId === expected.expectedProvider &&
      state.selection.connectionId === expected.expectedConnection &&
      state.selection.modelId === expected.expectedModel
    )
      return;
    await page.waitForTimeout(50);
  }
  fail('exact_model_selection_not_applied');
}

async function configureExactRuntimeViaUi(page, expected) {
  const chatId = await activeChatId(page);
  const before = await probeSnapshot(page);
  await applyRuntimeCommand(page, `/effort ${expected.expectedEffort}`);
  await waitForRuntimeControl(page, 'effort', expected.expectedEffort);
  await waitForRuntimeControl(page, 'runtimeEffort', expected.expectedEffort);
  await applyRuntimeCommand(page, `/performance ${expected.expectedPerformance}`);
  await waitForRuntimeControl(page, 'performance', expected.expectedPerformance);
  await applyRuntimeCommand(page, `/fast ${expected.expectedFast}`);
  await waitForRuntimeControl(page, 'fastMode', expected.expectedFast);
  await applyRuntimeCommand(page, `/rlm ${expected.expectedRlm}`);
  await waitForRuntimeControl(page, 'rlmEnabled', expected.expectedRlm);
  const after = await probeSnapshot(page);
  if (after.sends.slice(before.sends.length).some((entry) => entry.chatId === chatId))
    fail('local_control_dispatched_provider');
}

async function verifyRejectedEffortViaUi(page, rejectedEffort, liveAuthority) {
  const main = page.locator('[data-vibespace-page="chat"]:visible');
  const composer = main.locator('textarea[data-composer-input="true"]:visible');
  if ((await composer.count()) !== 1) fail('canonical_chat_surface_unavailable');
  const order = ['auto', 'minimal', 'low', 'medium', 'high', 'ultra', 'max'];
  const live = new Set((liveAuthority?.variants ?? []).filter((variant) => EFFORTS.has(variant)));
  const expectedOptions = order.filter((effort) => effort === 'auto' || live.has(effort));
  await applyRuntimeCommand(page, '/effort');
  await page.waitForFunction(
    ({ options }) => {
      const dropdowns = [...document.querySelectorAll('.jarvis-slash-dropdown')].filter(
        (node) => node instanceof HTMLElement && node.offsetParent !== null,
      );
      if (dropdowns.length !== 1) return false;
      const [dropdown] = dropdowns;
      if (!(dropdown instanceof HTMLElement) || dropdown.offsetParent === null) return false;
      const actual = [...dropdown.querySelectorAll('[data-value]')]
        .map((node) => node.getAttribute('data-value'))
        .filter(Boolean);
      return JSON.stringify(actual) === JSON.stringify(options);
    },
    { options: expectedOptions },
    { timeout: 15_000 },
  );
  const optionIds = await page
    .locator('.jarvis-slash-dropdown:visible [data-value]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-value')).filter(Boolean));
  if (optionIds.includes(rejectedEffort)) fail('rejected_effort_still_visible');
  await composer.press('Escape');
  await page.locator('.jarvis-slash-dropdown:visible').waitFor({ state: 'hidden', timeout: 5_000 });
  await composer.fill('');

  const beforeState = await inspectPageState(page);
  const beforeProbe = await probeSnapshot(page);
  await applyRuntimeCommand(page, `/effort ${rejectedEffort}`);
  await page.waitForFunction(
    ({ effort }) => {
      const mainSurface = document.querySelector('[data-vibespace-page="chat"]');
      return mainSurface?.innerText.includes(`Effort “${effort}” is not available`) === true;
    },
    { effort: rejectedEffort },
    { timeout: 5_000 },
  );
  const afterState = await inspectPageState(page);
  const afterProbe = await probeSnapshot(page);
  if (
    afterState.runtime.effort !== beforeState.runtime.effort ||
    afterState.runtime.runtimeEffort !== beforeState.runtime.runtimeEffort
  )
    fail('rejected_effort_mutated_state');
  if (afterProbe.sends.length !== beforeProbe.sends.length)
    fail('rejected_effort_dispatched_provider');
  if ((await main.locator(`[data-composer-effort="${rejectedEffort}"]`).count()) !== 0)
    fail('rejected_effort_badge_visible');
  return Object.freeze({
    rejected: true,
    optionIds,
    stateUnchanged: true,
    providerDispatchCount: 0,
  });
}

async function activateChat(page, chatId) {
  const groups = [
    page.getByRole('group', { name: 'Open chats' }).locator('button[aria-pressed]'),
    page.locator('section[aria-label="Chats"] button'),
  ];
  for (const group of groups) {
    const handles = await group.elementHandles();
    for (const handle of handles) {
      await handle.click({ timeout: 5_000 });
      try {
        await page.waitForFunction(
          ({ key, expected }) => {
            try {
              const value = JSON.parse(localStorage.getItem(key) ?? 'null');
              return String((value?.state ?? value)?.activeChatId ?? '') === expected;
            } catch {
              return false;
            }
          },
          { key: UI_KEY, expected: chatId },
          { timeout: 1_000 },
        );
        return;
      } catch {
        // Continue across immutable UI-button snapshots until the exact chat activates.
      }
    }
  }
  fail('target_chat_not_visible');
}

async function visibleAssistantText(page) {
  return page.evaluate(() => {
    const main = document.querySelector('[data-vibespace-page="chat"]');
    if (!(main instanceof HTMLElement)) return '';
    const agentic = main.querySelector('.agentic-answer.is-final .agentic-answer__text');
    if (agentic instanceof HTMLElement && agentic.offsetParent !== null) return agentic.innerText;
    const log = main.querySelector('[role="log"][data-tour="chat-thread"]');
    if (!(log instanceof HTMLElement)) return '';
    const copies = [...log.querySelectorAll('button[aria-label="Copy message"]')];
    for (const copy of copies.reverse()) {
      const row = copy.closest('.justify-start');
      const actions = copy.closest('[data-message-actions="true"]');
      const group = actions?.parentElement;
      const content = group?.children?.[1];
      if (row && content instanceof HTMLElement) return content.innerText;
    }
    return '';
  });
}

async function screenshotModelControl(page, evidenceDir, runIndex) {
  const locator = page
    .locator('[data-vibespace-page="chat"]:visible')
    .locator('button[aria-label="Choose model"]:visible');
  if ((await locator.count()) === 0) fail('model_control_unavailable');
  const screenshotPath = path.join(
    evidenceDir,
    `question-a-route-${String(runIndex).padStart(2, '0')}-${randomUUID()}.png`,
  );
  await locator.screenshot({ path: screenshotPath, animations: 'disabled' });
  return screenshotPath;
}

async function inspectVisibleModelControl(page, expected) {
  const locator = page
    .locator('[data-vibespace-page="chat"]:visible')
    .locator('button[aria-label="Choose model"]:visible');
  if ((await locator.count()) !== 1) fail('model_control_unavailable');
  const visibleText = await locator.innerText();
  const normalized = visibleText.toLowerCase().replace(/[^a-z0-9]+/gu, '');
  const provider = expected.expectedProvider.toLowerCase().replace(/[^a-z0-9]+/gu, '');
  const modelLeaf = expected.expectedModel
    .split('/')
    .at(-1)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '');
  const effortBadges = locator.locator('[data-composer-effort]');
  const effortBadgeCount = await effortBadges.count();
  const effortAttribute =
    effortBadgeCount === 1 ? await effortBadges.first().getAttribute('data-composer-effort') : null;
  return Object.freeze({
    providerMatches: Boolean(provider && normalized.includes(provider)),
    modelMatches: Boolean(modelLeaf && normalized.includes(modelLeaf)),
    effortMatches:
      expected.expectedEffort === 'auto'
        ? effortBadgeCount === 0
        : effortBadgeCount === 1 && effortAttribute === expected.expectedEffort,
  });
}

async function ensureEvidenceDir(directory) {
  assertOutsideOfficialAppData(directory, 'unsafe_evidence_directory');
  await mkdir(directory, { recursive: true });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) fail('unsafe_evidence_directory');
  const resolved = await realpath(directory);
  assertOutsideOfficialAppData(resolved, 'unsafe_evidence_directory');
}

function assertOutsideOfficialAppData(candidate, code) {
  const normalized = normalizedWindowsPath(candidate);
  for (const root of [process.env.LOCALAPPDATA, process.env.APPDATA]) {
    if (!root) continue;
    const appData = normalizedWindowsPath(path.win32.join(root, 'ai.jarvis.desktop'));
    if (normalized === appData || normalized.startsWith(`${appData}\\`)) fail(code);
  }
}

async function appendEvidence(directory, evidence) {
  const ledger = path.join(directory, 'pr31-native-question-a.jsonl');
  try {
    const info = await lstat(ledger);
    if (!info.isFile() || info.isSymbolicLink()) fail('unsafe_evidence_ledger');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await appendFile(ledger, `${JSON.stringify(evidence)}\n`, { encoding: 'utf8', flag: 'a' });
  return ledger;
}

async function attachOfficialPage(target) {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${target.cdpPort}`, {
    timeout: 10_000,
  });
  const pages = browser.contexts().flatMap((context) => context.pages());
  const candidates = [];
  for (const page of pages) {
    const proof = await page.evaluate(() => ({
      title: document.title,
      root: Boolean(document.querySelector('#root')),
      tauri: typeof window.__TAURI_INTERNALS__ === 'object' && window.__TAURI_INTERNALS__ !== null,
    }));
    if (proof.title === 'VibeSpace' && proof.root && proof.tauri) candidates.push(page);
  }
  if (candidates.length !== 1)
    fail(
      candidates.length === 0
        ? 'official_main_webview_not_found'
        : 'official_main_webview_ambiguous',
    );
  return candidates[0];
}

function attachErrorCollectors(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      errors.push({ source: 'console', code: classifyConsoleError(message.text()) });
  });
  page.on('pageerror', (error) =>
    errors.push({ source: 'page', code: SAFE_CODE.test(error.name) ? error.name : 'page_error' }),
  );
  page.on('requestfailed', (request) => {
    const raw = request.failure()?.errorText ?? '';
    const match = raw.match(/(?:net::)?(ERR_[A-Z0-9_]+)/u);
    errors.push({
      source: 'network',
      code: match?.[1] ?? 'request_failed',
      resourceType: request.resourceType(),
    });
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      errors.push({
        source: 'network',
        code: `http_${response.status()}`,
        resourceType: response.request().resourceType(),
      });
  });
  return errors;
}

async function readPrompt(promptFile) {
  assertOutsideOfficialAppData(promptFile, 'unsafe_prompt_file');
  const info = await lstat(promptFile);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > 65_536)
    fail('unsafe_prompt_file');
  const resolved = await realpath(promptFile);
  assertOutsideOfficialAppData(resolved, 'unsafe_prompt_file');
  const prompt = await readFile(resolved, 'utf8');
  if (/\u0000|[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(prompt))
    fail('unsafe_prompt_text');
  return prompt;
}

export async function runDriver(options, dependencies = {}) {
  await ensureEvidenceDir(options.evidenceDir);
  const readProcesses = dependencies.readProcesses ?? readWindowsProcesses;
  const rawProcesses = await readProcesses();
  const target = resolveOfficialNativeTarget(rawProcesses, {
    localAppData: dependencies.localAppData ?? process.env.LOCALAPPDATA,
    cdpPort: options.cdpPort,
    jarvisPid: options.jarvisPid,
  });
  const page = await (dependencies.attachPage ?? attachOfficialPage)(target);
  const confirmedTarget = resolveOfficialNativeTarget(await readProcesses(), {
    localAppData: dependencies.localAppData ?? process.env.LOCALAPPDATA,
    cdpPort: target.cdpPort,
    jarvisPid: target.jarvisPid,
  });
  for (const key of [
    'jarvisPid',
    'webViewPid',
    'cdpPort',
    'executablePath',
    'profile',
    'ownership',
  ]) {
    if (confirmedTarget[key] !== target[key]) fail('official_native_target_changed');
  }
  const errors = attachErrorCollectors(page);
  await installProbe(page);
  const inspection = await inspectPageState(page);
  const capturedAt = new Date().toISOString();
  if (options.mode === 'inspect') {
    const evidence = {
      schemaVersion: 1,
      kind: 'pr31_native_question_a',
      mode: 'inspect',
      capturedAt,
      native: target,
      inspection,
      errors,
    };
    const evidencePath = await appendEvidence(options.evidenceDir, evidence);
    return { ok: true, mode: 'inspect', evidencePath, evidence };
  }
  const runs = [];
  let liveAuthority = null;
  let stage = 'live_model_authority';
  try {
    liveAuthority = await inspectLiveOpenCodeAuthority(page, options);
    if (options.expectedConnection === 'opencode-cli')
      assertLiveEffortAuthority(liveAuthority, options.expectedEffort);
    stage = 'read_prompt';
    const prompt = await readPrompt(options.promptFile);
    for (let index = 0; index < options.runs; index += 1) {
      stage = `run_${index + 1}_create_chat`;
      const chatId = await createChat(page);
      stage = `run_${index + 1}_configure_model`;
      await configureExactModelViaUi(page, options);
      stage = `run_${index + 1}_configure_runtime`;
      await configureExactRuntimeViaUi(page, options);
      let rejectedEffortProof = null;
      if (options.rejectedEffort) {
        stage = `run_${index + 1}_reject_unsupported_effort`;
        rejectedEffortProof = await verifyRejectedEffortViaUi(
          page,
          options.rejectedEffort,
          liveAuthority,
        );
      }
      stage = `run_${index + 1}_preflight`;
      const preflight = await inspectPageState(page);
      if (preflight.activeChatId !== chatId) fail('active_chat_mismatch');
      if (
        preflight.selectors.main !== 1 ||
        preflight.selectors.composer !== 1 ||
        preflight.selectors.send !== 1 ||
        preflight.selectors.model !== 1 ||
        preflight.selectors.chatLog !== 1
      )
        fail('canonical_chat_surface_unavailable');
      assertPreflightRoute(preflight, options);
      const visibleControl = await inspectVisibleModelControl(page, options);
      if (
        !visibleControl.providerMatches ||
        !visibleControl.modelMatches ||
        !visibleControl.effortMatches
      )
        fail('visible_model_control_mismatch');
      const before = await probeSnapshot(page);
      const main = page.locator('[data-vibespace-page="chat"]:visible');
      const composer = main.locator('textarea[data-composer-input="true"]:visible');
      await composer.fill(prompt);
      const startedAt = Date.now();
      const run = {
        index: index + 1,
        chatId,
        startedAt,
        visibleControl,
        ...(rejectedEffortProof ? { rejectedEffortProof } : {}),
      };
      runs.push(run);
      stage = `run_${index + 1}_dispatch`;
      await main.locator('button[aria-label="Send message"]:visible').click({ timeout: 5_000 });
      await page.waitForFunction(
        ({ count, chat }) =>
          (window.__PR31_NATIVE_QA_V1__?.sends ?? [])
            .slice(count)
            .some((entry) => entry.chatId === chat),
        { count: before.sends.length, chat: chatId },
        { timeout: 5_000 },
      );
      const after = await probeSnapshot(page);
      const dispatch = safeDispatchReceipt(
        after.sends.slice(before.sends.length).find((entry) => entry.chatId === chatId),
      );
      assertExactRoute(dispatch, options);
      run.dispatch = dispatch;
    }
    const chatIds = runs.map((run) => run.chatId);
    stage = 'wait_for_completion';
    await page.waitForFunction(
      ({ ids }) =>
        ids.every((id) =>
          (window.__PR31_NATIVE_QA_V1__?.runs ?? []).some(
            (event) => event.chatId === id && ['done', 'error', 'cancelled'].includes(event.status),
          ),
        ),
      { ids: chatIds },
      { timeout: options.timeoutMs },
    );
    const probe = await probeSnapshot(page);
    for (const run of runs) {
      stage = `run_${run.index}_collect`;
      const terminal = probe.runs.findLast(
        (event) => event.chatId === run.chatId && TERMINAL_STATES.has(event.status),
      );
      await activateChat(page, run.chatId);
      if (terminal?.status === 'done') {
        await page.waitForFunction(
          () => {
            const main = document.querySelector('[data-vibespace-page="chat"]');
            if (!(main instanceof HTMLElement)) return false;
            const agentic = main.querySelector('.agentic-answer.is-final .agentic-answer__text');
            if (agentic instanceof HTMLElement && agentic.offsetParent !== null)
              return Boolean(agentic.innerText.trim());
            const log = main.querySelector('[role="log"][data-tour="chat-thread"]');
            if (!(log instanceof HTMLElement)) return false;
            return [...log.querySelectorAll('button[aria-label="Copy message"]')].some((copy) => {
              const actions = copy.closest('[data-message-actions="true"]');
              const content = actions?.parentElement?.children?.[1];
              return content instanceof HTMLElement && Boolean(content.innerText.trim());
            });
          },
          undefined,
          { timeout: 10_000 },
        );
      }
      const savedRoute = await inspectPageState(page);
      if (savedRoute.activeChatId !== run.chatId) fail('active_chat_mismatch');
      assertPreflightRoute(savedRoute, options);
      const visibleControlAfter = await inspectVisibleModelControl(page, options);
      if (
        !visibleControlAfter.providerMatches ||
        !visibleControlAfter.modelMatches ||
        !visibleControlAfter.effortMatches
      )
        fail('visible_model_control_mismatch');
      const text = await visibleAssistantText(page);
      const assessment = assessVisibleResponse(text, options);
      const screenshotPath = await screenshotModelControl(page, options.evidenceDir, run.index);
      run.completedAt = terminal?.at ?? Date.now();
      run.elapsedMs = run.completedAt - run.startedAt;
      run.terminalStatus = terminal?.status ?? 'missing';
      run.errorCode = terminal?.errorCode;
      run.assessment = assessment;
      run.screenshotPath = screenshotPath;
      run.savedRouteMatches = true;
      run.visibleControlAfter = visibleControlAfter;
      run.ok =
        run.terminalStatus === 'done' &&
        assessment.withinWordBounds &&
        !assessment.duplicateTail &&
        !assessment.internalMarker &&
        run.visibleControl.providerMatches &&
        run.visibleControl.modelMatches &&
        run.visibleControl.effortMatches &&
        run.savedRouteMatches &&
        run.visibleControlAfter.providerMatches &&
        run.visibleControlAfter.modelMatches &&
        run.visibleControlAfter.effortMatches;
    }
    const evidence = {
      schemaVersion: 1,
      kind: 'pr31_native_question_a',
      mode: 'send',
      capturedAt,
      native: target,
      inspection,
      liveAuthority,
      bounds: { minWords: options.minWords, maxWords: options.maxWords },
      runs,
      errors,
    };
    const evidencePath = await appendEvidence(options.evidenceDir, evidence);
    return { ok: runs.every((run) => run.ok), mode: 'send', evidencePath, evidence };
  } catch (error) {
    const failureCode =
      error instanceof NativeQuestionADriverError && SAFE_CODE.test(error.code)
        ? error.code
        : `native_question_a_${stage}_failed`;
    const evidence = {
      schemaVersion: 1,
      kind: 'pr31_native_question_a',
      mode: 'send_failure',
      capturedAt,
      native: target,
      inspection,
      liveAuthority,
      bounds: { minWords: options.minWords, maxWords: options.maxWords },
      runs,
      errors,
      failureCode,
    };
    try {
      await appendEvidence(options.evidenceDir, evidence);
    } catch {
      // Preserve the original safe failure code when evidence storage itself is unavailable.
    }
    throw error;
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = await runDriver(options);
  const summary = {
    ok: result.ok,
    mode: result.mode,
    evidencePath: result.evidencePath,
    runs:
      result.evidence.runs?.map((run) => ({
        index: run.index,
        elapsedMs: run.elapsedMs,
        terminalStatus: run.terminalStatus,
        wordCount: run.assessment.wordCount,
        duplicateTail: run.assessment.duplicateTail,
        internalMarker: run.assessment.internalMarker,
      })) ?? [],
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  return result.ok ? 0 : 1;
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() ===
    path.resolve(fileURLToPath(import.meta.url)).toLowerCase();
if (invokedDirectly) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      const code =
        error instanceof NativeQuestionADriverError
          ? error.code
          : 'native_question_a_driver_failed';
      process.stderr.write(`${JSON.stringify({ ok: false, code })}\n`);
      process.exit(1);
    });
}
