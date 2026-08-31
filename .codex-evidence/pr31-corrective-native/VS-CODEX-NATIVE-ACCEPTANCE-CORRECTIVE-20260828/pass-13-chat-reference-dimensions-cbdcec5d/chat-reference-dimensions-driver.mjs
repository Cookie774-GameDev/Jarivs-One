import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const CDP = 'http://127.0.0.1:9223';
const FIXTURE_ID = 'chat_pr31_reference_dimensions_0828';
const FIXTURE_TITLE = 'PR31 Activity Ledger Reference Fixture';
const WIDTH = 1586;
const HEIGHT = 992;
const EXACT_MODEL = 'opencode-go/deepseek-v4-flash-vision-exp';

let browser;
let page;
let previousChatId = null;
let originalViewport = null;
const report = {
  schemaVersion: 1,
  task: 'PR31-CHAT-AUTHORITATIVE-REFERENCE-DIMENSIONS',
  startedAt: new Date().toISOString(),
  status: 'running',
  head: execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  requestedDimensions: { width: WIDTH, height: HEIGHT },
  safety: [],
  assertions: [],
  artifacts: [],
  console: [],
  pageErrors: [],
  prohibitions: {
    productFilesEdited: false,
    screenshotResizedAfterCapture: false,
    modelDispatch: false,
    credentialsEntered: false,
    productionMutation: false,
    standaloneBrowserControlled: false,
    computerUseUsed: false,
  },
};

function ps(script) {
  return execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
  }).trim();
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
  report.safety.push(entry);
  if (entry.ollamaProcessCount || entry.listener11434Count) {
    throw new Error(`Forbidden Ollama/11434 at ${label}`);
  }
  return snapshot;
}

async function wake() {
  if (!page) return;
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
  report.assertions.push(entry);
  if (!entry.passed) throw new Error(`Assertion failed: ${name}`);
}

async function capture(name, semanticState) {
  const path = resolve(HERE, name);
  const beforeDimensions = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    outerWidth: window.outerWidth,
    outerHeight: window.outerHeight,
    devicePixelRatio: window.devicePixelRatio,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
  }));
  await guarded(`screenshot:${name}`, () =>
    page.screenshot({ path, animations: 'disabled', fullPage: false }),
  );
  const metadata = await sharp(path).metadata();
  const artifact = {
    name,
    width: metadata.width,
    height: metadata.height,
    viewport: page.viewportSize(),
    window: beforeDimensions,
    semanticState,
  };
  report.artifacts.push(artifact);
  assert(
    `${name} is a direct unresized ${WIDTH}x${HEIGHT} official-native capture`,
    metadata.width === WIDTH &&
      metadata.height === HEIGHT &&
      artifact.viewport?.width === WIDTH &&
      artifact.viewport?.height === HEIGHT &&
      beforeDimensions.innerWidth === WIDTH &&
      beforeDimensions.innerHeight === HEIGHT,
    artifact,
  );
}

async function createFixture() {
  return page.evaluate(
    async ({ fixtureId, fixtureTitle, exactModel }) => {
      const { db } = await import('/src/lib/db/index.ts');
      const { useAuthStore } = await import('/src/stores/auth.ts');
      const { useUIStore } = await import('/src/stores/ui.ts');
      const { useChatActivityStore } = await import(
        '/src/features/chat/activity/activityStore.ts'
      );
      const auth = useAuthStore.getState();
      const ui = useUIStore.getState();
      if (!auth.workspaceId) throw new Error('No active native workspace');
      const priorChatId = ui.activeChatId;
      const now = Date.now();
      const messages = [
        {
          id: 'msg_pr31_reference_user',
          chat_id: fixtureId,
          role: 'user',
          parts: [
            {
              kind: 'text',
              text: 'Audit the local project read-only and keep the work visible as one continuous response.',
            },
          ],
          created_at: now - 90_000,
          updated_at: now - 90_000,
        },
        {
          id: 'msg_pr31_reference_assistant_intro',
          chat_id: fixtureId,
          role: 'assistant',
          parts: [
            {
              kind: 'text',
              text: 'I’ll map the project, read the relevant files, search for risks, and keep the full audit in one continuous response.',
            },
          ],
          usage: {
            input_tokens: 512,
            output_tokens: 128,
            provider: 'opencode',
            model: exactModel,
          },
          created_at: now - 88_000,
          updated_at: now - 86_000,
        },
        {
          id: 'msg_pr31_reference_assistant_current',
          chat_id: fixtureId,
          role: 'assistant',
          parts: [
            {
              kind: 'tool_call',
              call_id: 'reference_read',
              tool: 'read_file',
              args: { path: 'app/src/features/chat/ChatThread.tsx' },
            },
            {
              kind: 'tool_result',
              call_id: 'reference_read',
              result: { exitCode: 0 },
            },
            {
              kind: 'text',
              text: 'The project map is complete. I’m validating the remaining risks and compiling the final evidence bundle.',
            },
          ],
          usage: {
            input_tokens: 2_048,
            output_tokens: 640,
            provider: 'opencode',
            model: exactModel,
          },
          created_at: now - 70_000,
          updated_at: now - 2_000,
        },
      ];
      await db.transaction('rw', db.chats, db.messages, async () => {
        await db.messages.where('chat_id').equals(fixtureId).delete();
        await db.chats.delete(fixtureId);
        await db.chats.add({
          id: fixtureId,
          workspace_id: auth.workspaceId,
          ...(auth.projectId ? { project_id: auth.projectId } : {}),
          title: fixtureTitle,
          mode: 'chat',
          active_agent_ids: [],
          created_at: now - 100_000,
          updated_at: now,
        });
        await db.messages.bulkPut(messages);
      });
      const activity = useChatActivityStore.getState();
      activity.clearChat(fixtureId);
      const events = [
        ['read-1', 'file', 'file', 'done', 'Read ChatThread.tsx', 'app/src/features/chat/ChatThread.tsx'],
        ['read-2', 'file', 'file', 'done', 'Read activity ledger', 'app/src/features/chat/activity-ledger/AssistantActivityLedger.tsx'],
        ['search', 'url', 'context', 'done', 'Searched project evidence', undefined],
        ['command', 'tool', 'coordination', 'done', 'Ran verification command', undefined],
        ['edit', 'diff', 'writing', 'done', 'Reviewed local diff', 'app/src/features/chat/ChatThread.tsx'],
        ['verify', 'tool', 'response', 'done', 'Verified acceptance state', undefined],
        ['stream', 'agent', 'response', 'running', 'Compiling final evidence bundle', undefined],
      ];
      events.forEach(([id, kind, category, status, title, filePath], index) =>
        activity.record({
          id: `pr31_reference_${id}`,
          chatId: fixtureId,
          kind,
          category,
          status,
          title,
          ...(filePath ? { filePath } : {}),
          ts: now - 80_000 + index * 5_000,
          startedAt: now - 80_000 + index * 5_000,
          ...(status === 'done' ? { endedAt: now - 78_000 + index * 5_000 } : {}),
        }),
      );
      ui.setActiveChat(fixtureId);
      ui.setRoute('chat');
      return { priorChatId, workspaceId: String(auth.workspaceId), eventCount: events.length };
    },
    { fixtureId: FIXTURE_ID, fixtureTitle: FIXTURE_TITLE, exactModel: EXACT_MODEL },
  );
}

async function cleanupFixture() {
  await page.evaluate(
    async ({ fixtureId, priorChatId }) => {
      const { db } = await import('/src/lib/db/index.ts');
      const { useUIStore } = await import('/src/stores/ui.ts');
      const { useChatActivityStore } = await import(
        '/src/features/chat/activity/activityStore.ts'
      );
      useChatActivityStore.getState().clearChat(fixtureId);
      await db.transaction('rw', db.chats, db.messages, async () => {
        await db.messages.where('chat_id').equals(fixtureId).delete();
        await db.chats.delete(fixtureId);
      });
      const ui = useUIStore.getState();
      ui.setActiveChat(priorChatId || null);
      ui.setRoute('chat');
    },
    { fixtureId: FIXTURE_ID, priorChatId: previousChatId },
  );
}

const before = guard('driver:start');
try {
  assert('one official jarvis process is running', before.Jarvis.length === 1, {
    jarvis: before.Jarvis,
  });
  const jarvis = before.Jarvis[0];
  const rootWebView = before.WebViews.find(
    (row) => row.ParentProcessId === jarvis.ProcessId && row.Cdp9223,
  );
  assert('CDP root is a direct official jarvis WebView child', Boolean(rootWebView), {
    rootWebView,
    listeners9223: before.Listeners9223,
  });

  browser = await chromium.connectOverCDP(CDP);
  page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((candidate) => candidate.url().includes('localhost:5173'));
  assert('official VibeSpace page attached', Boolean(page), { url: page?.url() });
  page.on('console', (message) =>
    report.console.push({ type: message.type(), text: message.text().slice(0, 2_000) }),
  );
  page.on('pageerror', (error) => report.pageErrors.push({ message: String(error).slice(0, 2_000) }));

  originalViewport = page.viewportSize();
  await guarded('route-chat', async () => {
    if ((await page.getByRole('textbox', { name: 'Message' }).count()) === 0) {
      await page.evaluate(() => {
        const url = new URL(location.href);
        url.searchParams.set('route', 'chat');
        history.pushState(null, '', url);
        dispatchEvent(new PopStateEvent('popstate'));
      });
    }
    await page.getByRole('textbox', { name: 'Message' }).waitFor({ state: 'visible' });
  });
  await guarded('set-authoritative-viewport', () =>
    page.setViewportSize({ width: WIDTH, height: HEIGHT }),
  );
  assert('Playwright viewport accepted exact authoritative dimensions', page.viewportSize()?.width === WIDTH && page.viewportSize()?.height === HEIGHT, {
    viewport: page.viewportSize(),
  });

  const fixture = await guarded('create-local-chat-ledger-fixture', createFixture);
  previousChatId = fixture.priorChatId;
  const fixtureNavigation = page.getByText(FIXTURE_TITLE, { exact: true }).first();
  await fixtureNavigation.waitFor({ state: 'visible' });
  await guarded('select-local-chat-ledger-fixture', () => fixtureNavigation.click());
  await page
    .getByText(
      'Audit the local project read-only and keep the work visible as one continuous response.',
      { exact: true },
    )
    .waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.body.innerText.includes('Activity running'));
  const disclosure = page.getByRole('button', { name: /Show activity details/u }).last();
  await disclosure.waitFor({ state: 'visible' });
  await disclosure.scrollIntoViewIfNeeded();
  assert(
    'collapsed continuous-response ledger is visible and inspector is closed',
    (await page.getByRole('region', { name: 'Assistant activity details' }).count()) === 0,
    { disclosureText: await disclosure.innerText(), fixture },
  );
  await capture('01-chat-collapsed-continuous-response-1586x992.png', {
    route: 'chat',
    fixtureTitle: FIXTURE_TITLE,
    ledger: 'collapsed',
    activityStatus: 'running',
    exactModel: EXACT_MODEL,
    eventCount: fixture.eventCount,
  });

  await guarded('expand-activity-inspector', () => disclosure.click());
  const inspector = page.getByRole('region', { name: 'Assistant activity details' });
  await inspector.waitFor({ state: 'visible' });
  const inspectorState = {
    text: (await inspector.innerText()).slice(0, 8_000),
    receiptCount: await page.getByTestId('activity-ledger-receipt').count(),
    tabs: await inspector.getByRole('tab').allTextContents(),
  };
  assert(
    'expanded activity inspector exposes receipts and filtering tabs',
    inspectorState.receiptCount > 0 && inspectorState.tabs.length >= 3,
    inspectorState,
  );
  await capture('02-chat-expanded-activity-inspector-1586x992.png', {
    route: 'chat',
    fixtureTitle: FIXTURE_TITLE,
    ledger: 'expanded',
    activityStatus: 'running',
    exactModel: EXACT_MODEL,
    inspector: inspectorState,
  });

  report.status = 'passed';
  report.semanticState = { fixture, inspectorState };
} catch (error) {
  report.status = 'failed';
  report.failure = String(error?.stack ?? error);
  if (page) {
    try {
      await capture('FAIL-chat-reference-dimensions.png', { failure: report.failure });
    } catch {
      // Preserve primary failure.
    }
  }
} finally {
  if (page) {
    try {
      await guarded('cleanup-local-chat-ledger-fixture', cleanupFixture);
    } catch (error) {
      report.cleanupFailure = String(error?.stack ?? error);
      report.status = 'failed';
    }
  }
  const finalProcess = guard('driver:final');
  report.finalProcess = finalProcess;
  report.finalViewport = page?.viewportSize() ?? null;
  report.originalViewport = originalViewport;
  report.safetySummary = {
    checks: report.safety.length,
    maxOllamaProcesses: Math.max(...report.safety.map((entry) => entry.ollamaProcessCount)),
    maxListeners11434: Math.max(...report.safety.map((entry) => entry.listener11434Count)),
  };
  report.completedAt = new Date().toISOString();
  await writeFile(
    resolve(HERE, 'chat-reference-dimensions-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
  if (browser) await browser.close();
}

if (report.status !== 'passed') process.exitCode = 1;
