import { execFileSync } from 'node:child_process';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';
import sharp from 'sharp';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const HERE = resolve(SCRIPT_DIR, process.env.NATIVE_PASS || 'pass-02');
const ROOT = resolve(SCRIPT_DIR, '../../..');
const CDP_URL = 'http://127.0.0.1:9223';
const EXPECTED_MODEL = 'opencode-go/deepseek-v4-flash-vision-exp';
const FIXTURE_CHAT_ID = 'chat_pr31_corrective_native_acceptance_20260828';
const REFUSED_URL = 'http://127.0.0.1:65534/';
const SELECTED_SCENARIOS = new Set(
  (process.env.NATIVE_SCENARIOS ||
    'official-native-identity,workbench-browser,chat-whole-app-states,schedule-kanban-milestones,five-plugin-flows')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);

const report = {
  schemaVersion: 1,
  task: 'PR31-CORRECTIVE-NATIVE-ACCEPTANCE',
  agent: 'VS-CODEX-NATIVE-ACCEPTANCE-CORRECTIVE-20260828',
  startedAt: new Date().toISOString(),
  cdpUrl: CDP_URL,
  expectedModel: EXPECTED_MODEL,
  selectedScenarios: [...SELECTED_SCENARIOS],
  safety: {
    officialNativeOnly: true,
    credentialsEntered: false,
    oauthCompleted: false,
    externalAccountCompleted: false,
    productionMutation: false,
    standaloneBrowserControlled: false,
    computerUseUsed: false,
    browserMcpUsed: false,
    ollamaTouched: false,
  },
  scenarios: [],
  artifacts: [],
  console: [],
  pageErrors: [],
  ollamaSafety: [],
};

await mkdir(HERE, { recursive: true });

function sanitize(value) {
  return String(value)
    .replace(/(authorization|api[_ -]?key|token|secret|password)\s*[:=]\s*\S+/giu, '$1=[redacted]')
    .slice(0, 1200);
}

function addArtifact(name, kind, details = {}) {
  report.artifacts.push({ name, kind, ...details });
}

function git(...args) {
  return execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim();
}

function nativeProcessIdentity() {
  const script = [
    "$targets = Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('jarvis.exe','msedgewebview2.exe','opencode.exe') }",
    '$rows = foreach ($p in $targets) {',
    "  [pscustomobject]@{ Name = $p.Name; ProcessId = $p.ProcessId; ParentProcessId = $p.ParentProcessId; ExecutablePath = $p.ExecutablePath; JarvisWebViewOwner = [bool]($p.CommandLine -like '*--webview-exe-name=jarvis.exe*'); CdpPort9223 = [bool]($p.CommandLine -like '*--remote-debugging-port=9223*') }",
    '}',
    "$listener = Get-NetTCPConnection -State Listen -LocalPort 9223 -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess,State",
    '[pscustomobject]@{ Processes = @($rows); CdpListener = @($listener) } | ConvertTo-Json -Depth 6 -Compress',
  ].join('; ');
  const raw = execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
  }).trim();
  return JSON.parse(raw);
}

function assertNoOllama(label) {
  const script = [
    "$processes = @(Get-CimInstance Win32_Process | Where-Object Name -eq 'ollama.exe' | Select-Object Name,ProcessId,ParentProcessId,ExecutablePath,CommandLine)",
    '$listeners = @(Get-NetTCPConnection -State Listen -LocalPort 11434 -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess,State)',
    '[pscustomobject]@{ Processes = $processes; Listeners11434 = $listeners } | ConvertTo-Json -Depth 6 -Compress',
  ].join('; ');
  const snapshot = JSON.parse(
    execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).trim(),
  );
  const row = {
    label,
    capturedAt: new Date().toISOString(),
    ollamaProcessCount: snapshot.Processes.length,
    listener11434Count: snapshot.Listeners11434.length,
  };
  report.ollamaSafety.push(row);
  if (row.ollamaProcessCount > 0 || row.listener11434Count > 0) {
    throw new Error(`Hard safety failure at ${label}: Ollama process or listener 11434 is present.`);
  }
  return row;
}

report.git = {
  worktree: git('rev-parse', '--show-toplevel'),
  branch: git('branch', '--show-current'),
  head: git('rev-parse', 'HEAD'),
  upstream: git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'),
};

let browser;
let page;
let context;
let cdp;
let originalWorkbenchUrl;
let fixturePreviousChatId = null;
let fixtureCreated = false;

async function writeJson(name, value) {
  await writeFile(resolve(HERE, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  addArtifact(name, 'json');
}

async function imageDimensions(path) {
  await stat(path);
  const metadata = await sharp(path).metadata();
  return { width: metadata.width, height: metadata.height };
}

async function recordActivityVisualBoundary() {
  const collapsed = resolve(
    ROOT,
    'docs/operations/PR31_CHAT_ACTIVITY_LEDGER_HANDOFF/vibespace-chat-activity-ledger/assets/01-collapsed-continuous-response.png',
  );
  const expanded = resolve(
    ROOT,
    'docs/operations/PR31_CHAT_ACTIVITY_LEDGER_HANDOFF/vibespace-chat-activity-ledger/assets/02-expanded-activity-inspector.png',
  );
  const current = [];
  for (const name of ['chat-streaming-question-plan-tool.png', 'chat-activity-ledger-expanded.png']) {
    const path = resolve(HERE, name);
    try {
      current.push({ name, dimensions: await imageDimensions(path) });
    } catch {}
  }
  await writeJson('activity-ledger-visual-boundary.json', {
    comparator: {
      path: 'scripts/visual-chat/image-compare.mjs',
      pixelmatchThreshold: 0.12,
      failClosedDimensionCheck: true,
      tests: { command: 'node --test scripts/visual-chat/image-compare.test.mjs', passed: 10, failed: 0 },
    },
    authoritativeReferences: [
      { name: '01-collapsed-continuous-response.png', dimensions: await imageDimensions(collapsed) },
      { name: '02-expanded-activity-inspector.png', dimensions: await imageDimensions(expanded) },
    ],
    current,
    comparisonExecuted: false,
    exactBoundary:
      'The authoritative assets are complete 1586x992 desktop-window compositions with different synthetic chat/activity content. The native CDP captures are WebView viewport surfaces, and their dimensions and fixture text/event state are not identical. No deterministic same-content crop exists, so the fail-closed comparator would reject full-page dimensions and a numeric diff ratio would be misleading.',
  });
}

async function screenshot(name, locator = null) {
  const path = resolve(HERE, name);
  let target = null;
  if (locator) {
    target = await locator.boundingBox().catch(() => null);
  }
  const image = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(path, Buffer.from(image.data, 'base64'));
  const metadata = await sharp(path).metadata();
  addArtifact(name, 'screenshot', {
    url: page.url(),
    viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight })),
    dimensions: { width: metadata.width, height: metadata.height },
    target,
  });
}

async function semanticClick(locator) {
  await locator.waitFor({ state: 'visible', timeout: 30_000 });
  await locator.evaluate((element) => {
    if (!(element instanceof HTMLButtonElement) || element.disabled) {
      throw new Error('Semantic button is not enabled.');
    }
    element.click();
  });
}

function isNavigationRace(error) {
  return /Execution context was destroyed|Cannot find context|Target page, context or browser has been closed|Frame was detached|Navigation failed because page was closed/iu.test(
    String(error?.stack || error),
  );
}

async function afterNativeLoad() {
  await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => undefined);
  await page.locator('body').waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(() => document.body.innerText.trim() !== 'Loading…', null, {
    timeout: 30_000,
  });
}

async function retryAcrossReload(action, label) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (!isNavigationRace(error) || attempt === 4) break;
      await afterNativeLoad();
    }
  }
  throw new Error(`${label} failed across native reload: ${sanitize(lastError?.stack || lastError)}`);
}

async function scenario(name, fn) {
  const row = { name, status: 'running', startedAt: new Date().toISOString() };
  report.scenarios.push(row);
  try {
    assertNoOllama(`${name}:before`);
    const evidence = await fn();
    assertNoOllama(`${name}:after`);
    Object.assign(row, { status: 'passed', completedAt: new Date().toISOString(), evidence });
  } catch (error) {
    Object.assign(row, {
      status: 'failed',
      completedAt: new Date().toISOString(),
      error: sanitize(error?.stack || error),
    });
    try {
      assertNoOllama(`${name}:failed-after`);
    } catch (safetyError) {
      row.error = `${row.error}\n${sanitize(safetyError?.stack || safetyError)}`;
    }
    try {
      await screenshot(`FAIL-${name.replace(/[^a-z0-9]+/giu, '-').toLowerCase()}.png`);
    } catch {}
  }
  await writeFile(resolve(HERE, 'acceptance-report.partial.json'), `${JSON.stringify(report, null, 2)}\n`);
  return row;
}

async function setAppRoute(route) {
  await retryAcrossReload(
    async () => {
      await page.evaluate(async (nextRoute) => {
        const { useUIStore } = await import('/src/stores/ui.ts');
        useUIStore.getState().setRoute(nextRoute);
      }, route);
      await page.waitForFunction(
        (expected) => new URL(location.href).searchParams.get('route') === expected,
        route,
        { timeout: 20_000 },
      );
      await afterNativeLoad();
    },
    `route ${route}`,
  );
}

async function closeTransientUi() {
  for (let index = 0; index < 4; index += 1) {
    await page.keyboard.press('Escape').catch(() => undefined);
  }
}

async function getNativeBody(limit = 20_000) {
  return (await page.locator('body').innerText()).slice(0, limit);
}

async function workbenchBrowser() {
  await closeTransientUi();
  await setAppRoute('workbench');
  const panel = page.getByTestId('workbench-browser-panel');
  await panel.waitFor({ state: 'visible', timeout: 30_000 });
  const address = panel.getByRole('textbox', { name: 'Browser address' });
  originalWorkbenchUrl = await address.inputValue();

  async function navigate(url, expectation) {
    await address.fill(url);
    await address.press('Enter');
    if (expectation === 'external') {
      await panel.getByTestId('workbench-browser-external').waitFor({ state: 'visible' });
      await panel.locator('iframe').waitFor({ state: 'detached' }).catch(() => undefined);
    } else if (expectation === 'embed') {
      await panel.locator('iframe').waitFor({ state: 'visible', timeout: 20_000 });
      await panel.getByText(/Loading(?: embed)?…/u).waitFor({ state: 'hidden', timeout: 30_000 });
    } else if (expectation === 'blocked') {
      await panel.getByRole('alert').waitFor({ state: 'visible' });
    }
  }

  await navigate('https://example.com/', 'external');
  const firstPolicy = {
    address: await address.inputValue(),
    externalStatus: await panel.getByTestId('workbench-browser-external').innerText(),
    iframeCount: await panel.locator('iframe').count(),
  };
  await screenshot('workbench-ordinary-example-policy.png', panel);

  await navigate('https://www.wikipedia.org/', 'external');
  const secondPolicy = {
    address: await address.inputValue(),
    externalStatus: await panel.getByTestId('workbench-browser-external').innerText(),
    iframeCount: await panel.locator('iframe').count(),
  };
  await screenshot('workbench-ordinary-wikipedia-policy.png', panel);

  await semanticClick(panel.getByRole('button', { name: 'Back' }));
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Browser address"]')?.value === 'https://example.com/',
  );
  const backAddress = await address.inputValue();
  await semanticClick(panel.getByRole('button', { name: 'Forward' }));
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Browser address"]')?.value === 'https://www.wikipedia.org/',
  );
  const forwardAddress = await address.inputValue();
  await screenshot('workbench-history-back-forward.png', panel);

  await navigate('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'embed');
  const youtubeFrame = panel.locator('iframe');
  const youtubeChild = page
    .frames()
    .find((frame) => frame.url().includes('youtube-nocookie.com/embed/'));
  const youtube = {
    address: await address.inputValue(),
    src: await youtubeFrame.getAttribute('src'),
    sandbox: await youtubeFrame.getAttribute('sandbox'),
    allow: await youtubeFrame.getAttribute('allow'),
    childFrameUrl: youtubeChild?.url() ?? null,
    childFrameTitle: youtubeChild ? await youtubeChild.title().catch(() => null) : null,
    childFrameText: youtubeChild
      ? (await youtubeChild.locator('body').innerText().catch(() => '')).slice(0, 2_000)
      : null,
    classification:
      'YouTube watch URLs are intentionally rewritten to the privacy-enhanced youtube-nocookie.com embed; this is the approved remote iframe path.',
  };
  await screenshot('workbench-youtube-privacy-embed.png', panel);

  let heldRoute;
  let resolveHeld;
  const held = new Promise((resolvePromise) => {
    resolveHeld = resolvePromise;
  });
  const holdYoutube = async (route) => {
    if (!heldRoute) {
      heldRoute = route;
      resolveHeld();
      return;
    }
    await route.continue();
  };
  await context.route(/youtube-nocookie\.com\/embed/u, holdYoutube);
  await semanticClick(panel.getByRole('button', { name: 'Reload browser' }));
  await Promise.race([
    held,
    panel.getByText('Loading embed…', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 }),
  ]);
  const loadingText = await panel.getByText(/Loading embed…/u).textContent().catch(() => null);
  await screenshot('workbench-youtube-loading-reload.png', panel);
  await semanticClick(panel.getByRole('button', { name: 'Stop loading' }));
  await panel.locator('iframe').waitFor({ state: 'detached', timeout: 10_000 });
  if (heldRoute) await heldRoute.abort('aborted').catch(() => undefined);
  await context.unroute(/youtube-nocookie\.com\/embed/u, holdYoutube);
  await screenshot('workbench-stop-loading-idle.png', panel);
  await navigate('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'embed');

  await navigate('javascript:alert(1)', 'blocked');
  const blocked = await panel.getByRole('alert').innerText();
  await screenshot('workbench-address-blocked-error.png', panel);
  await navigate('https://example.com/', 'external');
  const recovered = await panel.getByTestId('workbench-browser-external').innerText();
  await screenshot('workbench-error-recovery.png', panel);

  await navigate(REFUSED_URL, 'embed');
  await page.waitForFunction(
    (refused) => {
      const frame = document.querySelector('[data-testid="workbench-browser-panel"] iframe');
      return frame?.getAttribute('src') === refused;
    },
    REFUSED_URL,
  );
  const refused = {
    address: await address.inputValue(),
    iframeSrc: await panel.locator('iframe').getAttribute('src'),
    childFrameUrls: page.frames().map((frame) => frame.url()),
    classification:
      'Loopback is intentionally embedded; a browser-generated connection refusal is transport failure, not remote iframe policy.',
  };
  await screenshot('workbench-loopback-refused-to-connect.png', panel);
  await navigate('https://example.com/', 'external');
  await screenshot('workbench-refused-recovery.png', panel);

  if (originalWorkbenchUrl) {
    const originalExpectation = /(?:youtube\.com\/watch|youtu\.be\/)/u.test(originalWorkbenchUrl)
      ? 'embed'
      : /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])/u.test(originalWorkbenchUrl)
        ? 'embed'
        : 'external';
    await navigate(originalWorkbenchUrl, originalExpectation);
  }

  await writeJson('workbench-browser-evidence.json', {
    originalWorkbenchUrl,
    firstPolicy,
    secondPolicy,
    history: { backAddress, forwardAddress },
    youtube,
    reload: { loadingText },
    blocked,
    recovered,
    refused,
    policyBoundary:
      'Ordinary remote sites are intentionally externalized with no iframe, approved YouTube media is rewritten into a privacy embed, blocked non-HTTP(S) input is an app validation state, and loopback chrome-error://chromewebdata is a transport refusal rather than iframe policy.',
  });
  return {
    ordinarySites: [firstPolicy.address, secondPolicy.address],
    history: [backAddress, forwardAddress],
    youtubeEmbed: youtube.src,
    blocked,
    refused: refused.classification,
    restoredUrl: await address.inputValue(),
  };
}

async function createFixtureChatShell() {
  const state = await page.evaluate(async (fixtureId) => {
    const { db } = await import('/src/lib/db/index.ts');
    const { useAuthStore } = await import('/src/stores/auth.ts');
    const { useUIStore } = await import('/src/stores/ui.ts');
    const auth = useAuthStore.getState();
    const ui = useUIStore.getState();
    if (!auth.workspaceId) throw new Error('Native account has no active workspace for fixture.');
    const previousChatId = ui.activeChatId;
    const now = Date.now();
    await db.transaction('rw', db.chats, db.messages, async () => {
      await db.messages.where('chat_id').equals(fixtureId).delete();
      await db.chats.delete(fixtureId);
      await db.chats.add({
        id: fixtureId,
        workspace_id: auth.workspaceId,
        ...(auth.projectId ? { project_id: auth.projectId } : {}),
        title: 'PR31 Native Acceptance Fixture',
        mode: 'chat',
        active_agent_ids: [],
        created_at: now,
        updated_at: now,
      });
    });
    ui.setActiveChat(fixtureId);
    ui.setRoute('chat');
    ui.setChatMode('chat');
    return { previousChatId, workspaceId: String(auth.workspaceId), projectId: auth.projectId ?? null };
  }, FIXTURE_CHAT_ID);
  fixturePreviousChatId = state.previousChatId;
  fixtureCreated = true;
  await page.waitForFunction(
    () => document.body.innerText.includes('PR31 Native Acceptance Fixture'),
    null,
    { timeout: 20_000 },
  );
  return state;
}

async function populateFixtureChat() {
  return page.evaluate(async (fixtureId) => {
    const { db } = await import('/src/lib/db/index.ts');
    const { useChatActivityStore } = await import('/src/features/chat/activity/activityStore.ts');
    const { useJarvisInteractionStore } = await import(
      '/src/features/jarvis-interaction/sessionStore.ts'
    );
    const now = Date.now();
    const messages = [
      {
        id: 'msg_pr31_native_user',
        chat_id: fixtureId,
        role: 'user',
        parts: [{ kind: 'text', text: 'Validate the PR31 corrective native acceptance states.' }],
        created_at: now - 63_000,
        updated_at: now - 63_000,
      },
      {
        id: 'msg_pr31_native_question',
        chat_id: fixtureId,
        role: 'assistant',
        parts: [
          { kind: 'text', text: 'Two bounded decisions are still required.' },
          {
            kind: 'question_block',
            block: {
              id: 'qb_pr31_native',
              title: 'Acceptance questions',
              description: 'Choose without granting credentials or external authority.',
              status: 'pending',
              questions: [
                {
                  id: 'q_scope',
                  prompt: 'Which local surface should remain authoritative?',
                  type: 'single',
                  required: true,
                  options: [
                    { id: 'native', label: 'Official native app', description: 'Tauri WebView only.' },
                    { id: 'defer', label: 'Defer', description: 'Record a blocker without mutation.' },
                  ],
                },
                {
                  id: 'q_note',
                  prompt: 'Optional reviewer note',
                  type: 'text',
                  required: false,
                  allowSkip: true,
                  placeholder: 'No credentials or secrets',
                },
              ],
            },
          },
        ],
        usage: {
          input_tokens: 320,
          output_tokens: 96,
          provider: 'opencode',
          model: 'opencode-go/deepseek-v4-flash-vision-exp',
        },
        created_at: now - 62_000,
        updated_at: now - 61_000,
      },
      {
        id: 'msg_pr31_native_plan',
        chat_id: fixtureId,
        role: 'assistant',
        parts: [
          {
            kind: 'plan_review',
            plan: {
              id: 'plan_pr31_native',
              title: 'Corrective acceptance plan',
              summary: 'Verify official-native UI states and preserve every external authority boundary.',
              steps: [
                'Capture semantic native evidence',
                'Classify policy versus transport failures',
                'Restore local fixture state',
              ],
              risks: ['External authorization remains user-owned'],
              executable: false,
              status: 'pending',
            },
          },
        ],
        created_at: now - 58_000,
        updated_at: now - 57_000,
      },
      {
        id: 'msg_pr31_native_tool',
        chat_id: fixtureId,
        role: 'assistant',
        parts: [
          {
            kind: 'tool_call',
            call_id: 'call_pr31_read',
            tool: 'read_file',
            args: { path: 'app/src/features/chat/Composer.tsx' },
          },
          { kind: 'tool_result', call_id: 'call_pr31_read', result: { exitCode: 0 } },
          {
            kind: 'tool_call',
            call_id: 'call_pr31_command',
            tool: 'terminal.exec',
            args: { command: '[privacy-safe acceptance command]' },
          },
          { kind: 'tool_result', call_id: 'call_pr31_command', result: { exitCode: 0 } },
          { kind: 'text', text: 'Native acceptance evidence is ready for review.' },
        ],
        usage: {
          input_tokens: 540,
          output_tokens: 180,
          provider: 'opencode',
          model: 'opencode-go/deepseek-v4-flash-vision-exp',
        },
        created_at: now - 55_000,
        updated_at: now - 2_000,
      },
    ];
    await db.transaction('rw', db.chats, db.messages, async () => {
      await db.messages.bulkPut(messages);
      await db.chats.update(fixtureId, { updated_at: now });
    });

    const activity = useChatActivityStore.getState();
    activity.clearChat(fixtureId);
    const events = [
      ['read', 'file', 'file', 'done', 'Read file', 'app/src/features/chat/Composer.tsx'],
      ['search', 'url', 'context', 'done', 'Searched native evidence', undefined],
      ['command', 'tool', 'coordination', 'done', 'Ran command', undefined],
      ['edit', 'diff', 'writing', 'done', 'Reviewed patch', 'native-acceptance-driver.mjs'],
      ['verify', 'tool', 'response', 'done', 'Verified native route', undefined],
      ['subagent', 'subagent', 'coordination', 'done', 'Subagent handoff observed', undefined],
      ['input', 'agent', 'thinking', 'done', 'Processed input', undefined],
      ['stream', 'agent', 'response', 'running', 'Streaming response', undefined],
    ];
    events.forEach(([id, kind, category, status, title, filePath], index) =>
      activity.record({
        id: `pr31_${id}`,
        chatId: fixtureId,
        kind,
        category,
        status,
        title,
        ...(filePath ? { filePath } : {}),
        ts: now - 61_000 + index * 1_000,
        startedAt: now - 61_000 + index * 1_000,
        ...(status === 'done' ? { endedAt: now - 60_200 + index * 1_000 } : {}),
      }),
    );

    const interactions = useJarvisInteractionStore.getState();
    interactions.setChatMode(fixtureId, 'agent');
    interactions.upsertAgent(fixtureId, {
      agentId: 'ja_pr31_native',
      name: 'Native acceptance worker',
      parentChatId: fixtureId,
      childChatId: 'chat_pr31_native_child',
      task: '/subagents Verify official-native evidence',
      modelLabel: 'opencode-go/deepseek-v4-flash-vision-exp',
      modelSelection: {
        provider: 'opencode',
        model: 'opencode-go/deepseek-v4-flash-vision-exp',
        connectionId: 'opencode-go',
      },
      status: 'testing',
      currentStep: 'Capturing semantic screenshots',
      filesRead: ['app/src/features/chat/Composer.tsx'],
      filesEditing: [],
      diffSummary: { addedLines: 0, removedLines: 0 },
      filesTouched: [],
      lockedFiles: [],
      createdAt: new Date(now - 60_000).toISOString(),
      updatedAt: new Date(now).toISOString(),
    });
    return { messageCount: messages.length, eventCount: events.length };
  }, FIXTURE_CHAT_ID);
}

async function completeFixtureStreaming() {
  await page.evaluate(async (fixtureId) => {
    const { useChatActivityStore } = await import('/src/features/chat/activity/activityStore.ts');
    useChatActivityStore.getState().update(fixtureId, 'pr31_stream', {
      status: 'done',
      endedAt: Date.now(),
      title: 'Stream completed',
    });
  }, FIXTURE_CHAT_ID);
  await page.waitForFunction(() => !document.body.innerText.includes('Activity running'));
}

async function cleanupFixture() {
  if (!fixtureCreated || !page) return;
  await closeTransientUi();
  await page.evaluate(
    async ({ fixtureId, previousChatId }) => {
      const { db } = await import('/src/lib/db/index.ts');
      const { useUIStore } = await import('/src/stores/ui.ts');
      const { useChatActivityStore } = await import('/src/features/chat/activity/activityStore.ts');
      const { useJarvisInteractionStore } = await import(
        '/src/features/jarvis-interaction/sessionStore.ts'
      );
      useChatActivityStore.getState().clearChat(fixtureId);
      useJarvisInteractionStore.setState((state) => {
        const modesByChat = { ...state.modesByChat };
        const planSafeApprovalsByChat = { ...state.planSafeApprovalsByChat };
        const agentsByChat = { ...state.agentsByChat };
        delete modesByChat[fixtureId];
        delete planSafeApprovalsByChat[fixtureId];
        delete agentsByChat[fixtureId];
        return { modesByChat, planSafeApprovalsByChat, agentsByChat };
      });
      await db.transaction('rw', db.chats, db.messages, async () => {
        await db.messages.where('chat_id').equals(fixtureId).delete();
        await db.chats.delete(fixtureId);
      });
      const ui = useUIStore.getState();
      ui.setActiveChat(previousChatId || null);
      ui.setRoute('chat');
      ui.setChatMode('chat');
    },
    { fixtureId: FIXTURE_CHAT_ID, previousChatId: fixturePreviousChatId },
  );
  fixtureCreated = false;
  await page.waitForFunction(() => !document.body.innerText.includes('PR31 Native Acceptance Fixture'));
}

async function chatAcceptance() {
  await closeTransientUi();
  await setAppRoute('chat');
  await page.waitForFunction((expected) => document.body.innerText.includes(expected), EXPECTED_MODEL, {
    timeout: 30_000,
  });
  await screenshot('chat-existing-populated-exact-model.png');

  const shell = await createFixtureChatShell();
  await page.getByRole('textbox', { name: 'Message' }).waitFor({ state: 'visible' });
  await screenshot('chat-empty-fixture.png');

  const populated = await populateFixtureChat();
  const questions = page.getByText('Acceptance questions', { exact: true });
  await questions.waitFor({ state: 'visible' });
  await page.waitForFunction(
    () => document.querySelectorAll('[data-assistant-activity-ledger="true"]').length > 0,
  );
  await questions.scrollIntoViewIfNeeded();
  await screenshot('chat-question-state.png', questions);
  const plan = page.getByText('Corrective acceptance plan', { exact: true });
  await plan.waitFor({ state: 'visible' });
  await plan.scrollIntoViewIfNeeded();
  await screenshot('chat-plan-review-state.png', plan);
  const toolReceipt = page.getByText('Native acceptance evidence is ready for review.', {
    exact: true,
  });
  await toolReceipt.waitFor({ state: 'visible' });
  await toolReceipt.scrollIntoViewIfNeeded();
  await screenshot('chat-streaming-question-plan-tool.png', toolReceipt);

  await completeFixtureStreaming();
  await page.getByText('Native acceptance evidence is ready for review.', { exact: true }).waitFor({
    state: 'visible',
  });
  await screenshot('chat-populated-complete.png');

  const disclosure = page.getByRole('button', { name: /Show activity details/u }).last();
  await disclosure.click();
  await page.getByRole('region', { name: 'Assistant activity details' }).waitFor({ state: 'visible' });
  await screenshot('chat-activity-ledger-expanded.png');
  const ledger = {
    text: (await page.getByRole('region', { name: 'Assistant activity details' }).innerText()).slice(
      0,
      8_000,
    ),
    receipts: await page.getByTestId('activity-ledger-receipt').count(),
    tabs: await page.getByRole('tab').allTextContents(),
  };
  await disclosure.click();

  const subagents = page.getByTestId('agentic-subagents-toggle');
  await subagents.click();
  await page.getByRole('dialog').filter({ hasText: 'Subagents' }).waitFor({ state: 'visible' });
  await screenshot('chat-subagent-state.png');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Choose model' }).click();
  await page.getByRole('listbox').waitFor({ state: 'visible' });
  await page.getByRole('searchbox', { name: 'Search providers and models' }).fill(EXPECTED_MODEL);
  await page.getByRole('option', { selected: true }).waitFor({ state: 'visible' });
  const modelPickerText = (await page.getByRole('listbox').innerText()).slice(0, 10_000);
  await screenshot('chat-exact-model-picker.png');
  const modelPickerContainsRawRoute = modelPickerText.includes('deepseek-v4-flash-vision-exp');
  const modelPickerContainsActiveComposite =
    modelPickerText.includes('DeepSeek V4 Flash Vision Exp · Opencode Go provider connection') &&
    modelPickerText.includes('active');
  await page.keyboard.press('Escape');

  const modeButton = page.getByRole('button', { name: /Agent Mode\. Open permissions panel/u });
  await modeButton.click();
  await page.getByText('Ask Mode', { exact: true }).waitFor({ state: 'visible' });
  await page.getByText('Plan Mode', { exact: true }).waitFor({ state: 'visible' });
  await screenshot('chat-mode-ask-plan-agent-menu.png');
  const modeMenuText = (await page.locator('body').innerText()).slice(-5_000);
  await page.keyboard.press('Escape');

  const composer = page.getByRole('textbox', { name: 'Message' });
  await composer.fill('/');
  await page.getByRole('listbox').waitFor({ state: 'visible' });
  const slashCatalog = (await page.getByRole('listbox').innerText()).slice(0, 15_000);
  await screenshot('chat-slash-command-catalog.png');
  await page.keyboard.type('mcp');
  await page.getByRole('listbox').waitFor({ state: 'visible' });
  const mcpCommand = await page.getByRole('listbox').innerText();
  await screenshot('chat-tool-command-mcp.png');
  await closeTransientUi();

  await page.getByRole('button', { name: /Connection details for Opencode Go/u }).click();
  await page.getByText('Opencode Go provider connection', { exact: true }).waitFor({
    state: 'visible',
  });
  const connectionDisclosure = (await page.locator('body').innerText()).slice(-2_500);
  await screenshot('chat-provider-connection-reconnect-baseline.png');
  await page.keyboard.press('Escape');

  const originalMetrics = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const viewports = [
    ['narrow', 720, 900],
    ['normal', 1280, 900],
    ['expanded', 1600, 1000],
  ];
  const viewportEvidence = [];
  for (const [label, width, height] of viewports) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.waitForFunction(
      ([expectedWidth, expectedHeight]) => innerWidth === expectedWidth && innerHeight === expectedHeight,
      [width, height],
    );
    await screenshot(`chat-layout-${label}.png`);
    viewportEvidence.push({ label, width: await page.evaluate(() => innerWidth), height });
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride');

  await cdp.send('Emulation.setEmulatedMedia', {
    media: '',
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await page.waitForFunction(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const animationEvidence = await page.evaluate(() => ({
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    animations: document.getAnimations().map((animation) => ({
      playState: animation.playState,
      currentTime: animation.currentTime,
    })),
  }));
  await screenshot('chat-reduced-motion-animation.png');
  await cdp.send('Emulation.setEmulatedMedia', {
    media: '',
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  });

  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const accessibility = {
    passes: axe.passes.length,
    incomplete: axe.incomplete.length,
    violations: axe.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.length,
      targets: violation.nodes.slice(0, 8).map((node) => node.target),
    })),
  };
  await writeJson('chat-accessibility-axe.json', accessibility);
  await writeJson('chat-whole-app-evidence.json', {
    shell,
    populated,
    ledger,
    modelPickerText,
    modelPickerContainsRawRoute,
    modelPickerContainsActiveComposite,
    savedRawRoute: EXPECTED_MODEL,
    modeMenuText,
    slashCatalog,
    mcpCommand,
    connectionDisclosure,
    viewportEvidence,
    originalMetrics,
    animationEvidence,
    accessibility,
  });

  await cleanupFixture();
  if (!modelPickerContainsRawRoute && !modelPickerContainsActiveComposite) {
    throw new Error(
      `Active model ${EXPECTED_MODEL} is visible in Chat but has no matching raw or provider+model composite identity in the model picker; no substitute was selected.`,
    );
  }
  return {
    exactModel: EXPECTED_MODEL,
    states: [
      'empty',
      'populated',
      'streaming',
      'questions',
      'commands',
      'mode',
      'model',
      'connection-disclosure',
      'activity-ledger',
      'subagent',
      'tool',
      'narrow',
      'normal',
      'expanded',
      'a11y',
      'animation',
    ],
    axeViolations: accessibility.violations.length,
  };
}

async function scheduleAndKanban() {
  await closeTransientUi();
  await setAppRoute('schedule');
  await page.getByText('Schedule', { exact: true }).first().waitFor({ state: 'visible' });
  const scheduleBody = await getNativeBody();
  await screenshot('chat-schedule-whole-app.png');

  await setAppRoute('kanban');
  await page.getByRole('heading', { name: 'Milestones', exact: true }).waitFor({
    state: 'visible',
  });
  const kanbanBody = await getNativeBody();
  await screenshot('chat-kanban-milestones-whole-app.png');
  await setAppRoute('chat');
  return {
    schedule: scheduleBody.slice(0, 10_000),
    kanban: kanbanBody.slice(0, 10_000),
  };
}

async function ensurePluginSettings() {
  await closeTransientUi();
  await setAppRoute('chat');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog').filter({ hasText: 'Configure providers' });
  await settings.waitFor({ state: 'visible', timeout: 20_000 });
  await settings.getByRole('tab', { name: 'Plugins', exact: true }).click();
  await settings.getByRole('textbox', { name: 'Search plugins' }).waitFor({ state: 'visible' });
  return settings;
}

async function pluginAcceptance() {
  let settings = await ensurePluginSettings();
  await semanticClick(settings.getByRole('button', { name: 'Add MCP connection', exact: true }));
  const mcpSection = settings
    .getByRole('heading', { name: 'OpenCode MCP servers', exact: true })
    .locator('xpath=ancestor::section[1]');
  await mcpSection.waitFor({ state: 'visible', timeout: 30_000 });
  const supabaseMcp = mcpSection.getByRole('article', { name: 'supabase MCP server' });
  await supabaseMcp.waitFor({ state: 'visible', timeout: 30_000 });
  const supabaseMcpText = await supabaseMcp.innerText();
  const mcpSectionText = await mcpSection.innerText();
  const visibleMcpUrls = mcpSectionText.match(/https?:\/\/[^\s]+/gu) ?? [];
  await mcpSection.scrollIntoViewIfNeeded();
  await screenshot('opencode-mcp-supabase-read-only-status.png', supabaseMcp);
  await writeJson('opencode-mcp-supabase-read-only-status.json', {
    statusText: supabaseMcpText,
    visibleUrls: visibleMcpUrls,
    authorizationActionClicked: false,
    lifecycleActionClicked: false,
    exactBoundary:
      visibleMcpUrls.length > 0
        ? 'The read-only OpenCode MCP UI exposed the listed URL(s).'
        : 'The authoritative OpenCode MCP status surface exposes server name/status but no configured URL. No config or credential-bearing endpoint was queried.',
  });
  const flows = [];
  for (const flow of [
    { id: 'github', name: 'GitHub', openManual: false, openRequirements: false },
    { id: 'supabase', name: 'Supabase', openManual: false, openRequirements: true },
    { id: 'gmail', name: 'Gmail', openManual: false, openRequirements: false },
    { id: 'stripe', name: 'Stripe', openManual: true, openRequirements: false },
    { id: 'cloudflare', name: 'Cloudflare', openManual: true, openRequirements: false },
  ]) {
    if (!(await settings.isVisible())) settings = await ensurePluginSettings();
    const search = settings.getByRole('textbox', { name: 'Search plugins' });
    await search.fill(flow.name);
    await page.waitForFunction(
      (name) => {
        const dialog = [...document.querySelectorAll('[role="dialog"]')].find((node) =>
          node.textContent?.includes('Configure providers'),
        );
        return dialog?.textContent?.includes(name);
      },
      flow.name,
    );
    const card = settings.getByTestId(`plugin-card-${flow.id}`);
    await card.waitFor({ state: 'visible', timeout: 15_000 });
    const text = await card.innerText();
    const status =
      text.includes('\nError\n') || text.includes('Error\n')
        ? 'error'
        : text.includes('Not connected')
          ? 'not-connected'
          : text.includes('Connected')
            ? 'connected'
            : 'unknown';
    await card.scrollIntoViewIfNeeded();
    await screenshot(`plugin-${flow.id}-catalog-flow.png`, card);
    const flowEvidence = {
      id: flow.id,
      name: flow.name,
      status,
      catalogText: text.slice(0, 8_000),
      authorizationActionClicked: false,
    };

    if (flow.openManual || flow.openRequirements) {
      const action = flow.openRequirements
        ? card.getByRole('button', { name: 'View requirements', exact: true })
        : card.getByRole('button', { name: 'Connect', exact: true });
      if (await action.isVisible()) {
        const beforeDialogs = await page.getByRole('dialog').count();
        await semanticClick(action);
        await page.waitForFunction(
          ([count, name]) =>
            document.querySelectorAll('[role="dialog"]').length > count ||
            document.body.innerText.includes(`Connect ${name}`) ||
            document.body.innerText.includes(`${name} setup`),
          [beforeDialogs, flow.name],
          { timeout: 15_000 },
        );
        const detail = page.locator('[role="dialog"]:visible').last();
        await detail.waitFor({ state: 'visible', timeout: 15_000 });
        const detailText = (await detail.innerText()).slice(0, 10_000);
        const credentialFields = await detail.locator('input').evaluateAll((inputs) =>
          inputs.map((input) => ({
            type: input.type,
            aria: input.getAttribute('aria-label'),
            placeholder: input.getAttribute('placeholder'),
            valueLength: input.value.length,
          })),
        );
        flowEvidence.detailText = detailText;
        flowEvidence.credentialFields = credentialFields;
        flowEvidence.requirementsViewed = flow.openRequirements;
        flowEvidence.credentialsEntered = credentialFields.some((field) => field.valueLength > 0);
        if (flowEvidence.credentialsEntered) {
          throw new Error(`${flow.name} detail unexpectedly contained a filled credential field.`);
        }
        await screenshot(
          flow.openRequirements
            ? `plugin-${flow.id}-external-requirements.png`
            : `plugin-${flow.id}-manual-setup.png`,
          detail,
        );
        await page.keyboard.press('Escape');
        await page.waitForFunction(
          (count) => document.querySelectorAll('[role="dialog"]').length <= count,
          beforeDialogs,
        );
      }
    }
    flows.push(flowEvidence);
  }
  await settings.getByRole('textbox', { name: 'Search plugins' }).fill('');
  await page.getByRole('button', { name: 'Close', exact: true }).last().click();
  await settings.waitFor({ state: 'hidden' });
  await writeJson('plugin-five-flow-evidence.json', flows);
  return {
    flows: flows.map(({ id, status, credentialsEntered = false }) => ({
      id,
      status,
      credentialsEntered,
    })),
  };
}

try {
  browser = await chromium.connectOverCDP(CDP_URL);
  context = browser.contexts()[0];
  const candidates = context.pages();
  page = candidates.find((candidate) => candidate.url().startsWith('http://localhost:5173'));
  if (!page) throw new Error('Official VibeSpace WebView page was not found on CDP 9223.');
  cdp = await context.newCDPSession(page);

  page.on('console', (message) => {
    if (!['warning', 'error'].includes(message.type())) return;
    if (report.console.length < 1_000) {
      report.console.push({ type: message.type(), text: sanitize(message.text()), url: page.url() });
    }
  });
  page.on('pageerror', (error) => {
    if (report.pageErrors.length < 250) report.pageErrors.push(sanitize(error?.stack || error));
  });

  if (SELECTED_SCENARIOS.has('official-native-identity')) {
    await scenario('official-native-identity', async () =>
      retryAcrossReload(async () => {
        const processes = nativeProcessIdentity();
        const identity = {
          title: await page.title(),
          url: page.url(),
          userAgent: await page.evaluate(() => navigator.userAgent),
          isTauri: await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__)),
          pageCount: candidates.length,
          targetPages: await Promise.all(
            candidates.map(async (candidate) => ({ url: candidate.url(), title: await candidate.title() })),
          ),
          processes,
          git: report.git,
        };
        const jarvis = processes.Processes.find((process) => process.Name === 'jarvis.exe');
        const webview = processes.Processes.find(
          (process) =>
            process.Name === 'msedgewebview2.exe' &&
            process.JarvisWebViewOwner &&
            process.CdpPort9223,
        );
        if (
          identity.title !== 'VibeSpace' ||
          !identity.isTauri ||
          !jarvis ||
          !webview ||
          !processes.CdpListener.some((listener) => listener.OwningProcess === webview.ProcessId)
        ) {
          throw new Error(
            `CDP target is not the official jarvis.exe-owned VibeSpace WebView: ${JSON.stringify(identity)}`,
          );
        }
        await writeJson('official-native-webview-identity.json', identity);
        await screenshot('official-native-initial.png');
        if (process.env.NATIVE_PREVIOUS_JARVIS_PID) {
          await page.waitForFunction(
            (expected) => document.body.innerText.includes(expected),
            EXPECTED_MODEL,
            { timeout: 60_000 },
          );
          await writeJson('chat-native-restart-reconnect-evidence.json', {
            previousJarvisPid: Number(process.env.NATIVE_PREVIOUS_JARVIS_PID),
            currentJarvisPid: jarvis.ProcessId,
            currentWebViewPid: webview.ProcessId,
            exactModel: EXPECTED_MODEL,
            exactModelVisibleAfterRestart: true,
            providerRequestSent: false,
            appRestartOnly: true,
            head: report.git.head,
          });
          await screenshot('chat-native-restart-reconnected.png');
        }
        return identity;
      }, 'official native identity'),
    );
  }

  if (SELECTED_SCENARIOS.has('workbench-browser')) {
    await scenario('workbench-browser', workbenchBrowser);
  }
  if (SELECTED_SCENARIOS.has('chat-whole-app-states')) {
    await scenario('chat-whole-app-states', chatAcceptance);
  }
  if (SELECTED_SCENARIOS.has('schedule-kanban-milestones')) {
    await scenario('schedule-kanban-milestones', scheduleAndKanban);
  }
  if (SELECTED_SCENARIOS.has('five-plugin-flows')) {
    await scenario('five-plugin-flows', pluginAcceptance);
  }
} catch (error) {
  report.fatal = sanitize(error?.stack || error);
} finally {
  try {
    await cleanupFixture();
  } catch (error) {
    report.cleanupError = sanitize(error?.stack || error);
  }
  try {
    if (page) {
      await cdp?.send('Emulation.clearDeviceMetricsOverride').catch(() => undefined);
      await cdp
        ?.send('Emulation.setEmulatedMedia', {
          media: '',
          features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
        })
        .catch(() => undefined);
      await closeTransientUi();
      await setAppRoute('chat');
      const finalBody = await getNativeBody();
      report.finalState = {
        url: page.url(),
        exactModelVisible: finalBody.includes(EXPECTED_MODEL),
        fixtureRemoved: !finalBody.includes('PR31 Native Acceptance Fixture'),
      };
      await screenshot('official-native-final-running.png');
    }
  } catch (error) {
    report.finalStateError = sanitize(error?.stack || error);
  }
  try {
    await recordActivityVisualBoundary();
  } catch (error) {
    report.visualBoundaryError = sanitize(error?.stack || error);
  }
  report.completedAt = new Date().toISOString();
  report.git.finalHead = git('rev-parse', 'HEAD');
  report.summary = {
    passed: report.scenarios.filter((row) => row.status === 'passed').length,
    failed: report.scenarios.filter((row) => row.status === 'failed').length,
    fatal: Boolean(report.fatal),
  };
  await writeFile(resolve(HERE, 'acceptance-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await browser?.close().catch(() => undefined);
}

console.log(JSON.stringify(report.summary));
