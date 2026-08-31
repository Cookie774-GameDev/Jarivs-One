import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const CDP = 'http://127.0.0.1:9223';
const TODO_INITIAL = 'Native acceptance todo 0828';
const TODO_EDITED = 'Native acceptance todo edited 0828';
const MILESTONE_INITIAL = 'Native acceptance milestone 0828';
const MILESTONE_EDITED = 'Native acceptance milestone edited 0828';
const TARGET_DATE = '2026-09-17';

const report = {
  schemaVersion: 1,
  task: 'PR31-NATIVE-KANBAN-MILESTONE-LIFECYCLE',
  startedAt: new Date().toISOString(),
  status: 'running',
  head: execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  safety: [],
  assertions: [],
  artifacts: [],
  console: [],
  pageErrors: [],
  prohibitions: {
    productFilesEdited: false,
    modelDispatch: false,
    credentialsEntered: false,
    productionMutation: false,
    standaloneBrowserControlled: false,
    computerUseUsed: false,
  },
};
let browser;
let page;

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

async function guarded(label, action) {
  guard(`${label}:before`);
  try {
    if (page) {
      const ambient = page.getByRole('dialog', { name: /Ambient mode/u });
      if (await ambient.isVisible().catch(() => false)) {
        await page.keyboard.press('Escape');
        await ambient.waitFor({ state: 'hidden' });
      }
    }
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

async function screenshot(page, name) {
  const path = resolve(HERE, name);
  await guarded(`screenshot:${name}`, () =>
    page.screenshot({ path, animations: 'disabled', fullPage: false }),
  );
  const metadata = await sharp(path).metadata();
  report.artifacts.push({ name, width: metadata.width, height: metadata.height });
}

async function route(page, value) {
  await guarded(`route:${value}`, () =>
    page.evaluate((nextRoute) => {
      const url = new URL(window.location.href);
      url.searchParams.set('route', nextRoute);
      window.history.pushState({}, '', url);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, value),
  );
}

async function storeItems(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('jarvis-inspector-milestones-v1');
    const persisted = raw ? JSON.parse(raw) : null;
    return persisted?.state?.items ?? [];
  });
}

async function waitPersistedReopened(page, titles) {
  await page.waitForFunction((expectedTitles) => {
    const raw = localStorage.getItem('jarvis-inspector-milestones-v1');
    const items = raw ? (JSON.parse(raw)?.state?.items ?? []) : [];
    const fixtures = items.filter((item) => expectedTitles.includes(item.title));
    return (
      fixtures.length === expectedTitles.length &&
      fixtures.every((item) => item.status === 'todo' && item.completedAt === undefined)
    );
  }, titles);
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
  assert('official VibeSpace WebView page is attached', Boolean(page), { url: page?.url() });
  page.on('console', (message) =>
    report.console.push({ type: message.type(), text: message.text().slice(0, 2_000) }),
  );
  page.on('pageerror', (error) => report.pageErrors.push({ message: String(error).slice(0, 2_000) }));

  await route(page, 'kanban');
  await page.locator('[data-monochrome-route="kanban"]').waitFor({ state: 'visible' });

  for (const title of [TODO_INITIAL, TODO_EDITED, MILESTONE_INITIAL, MILESTONE_EDITED]) {
    const stale = page.getByRole('button', { name: `Delete ${title}` });
    if (await stale.count()) await guarded(`remove-stale:${title}`, () => stale.click());
  }

  await guarded('create:todo', async () => {
    await page.getByRole('textbox', { name: "New item for Today's to-do" }).fill(TODO_INITIAL);
    await page.getByRole('button', { name: "Add item to Today's to-do" }).click();
  });
  await page.getByRole('textbox', { name: `Task title: ${TODO_INITIAL}` }).waitFor();
  await guarded('create:milestone', async () => {
    await page.getByRole('textbox', { name: 'New item for Milestones' }).fill(MILESTONE_INITIAL);
    await page.getByRole('button', { name: 'Add item to Milestones' }).click();
  });
  await page.getByRole('textbox', { name: `Task title: ${MILESTONE_INITIAL}` }).waitFor();

  await guarded('edit:todo', async () => {
    await page
      .getByRole('textbox', { name: `Task title: ${TODO_INITIAL}` })
      .fill(TODO_EDITED);
    await page
      .getByRole('textbox', { name: `Description for ${TODO_EDITED}` })
      .fill('Edited daily acceptance description');
    await page.getByLabel(`Target date for ${TODO_EDITED}`).fill(TARGET_DATE);
  });
  await guarded('edit:milestone', async () => {
    await page
      .getByRole('textbox', { name: `Task title: ${MILESTONE_INITIAL}` })
      .fill(MILESTONE_EDITED);
    await page
      .getByRole('textbox', { name: `Description for ${MILESTONE_EDITED}` })
      .fill('Edited long-running acceptance description');
    await page.getByLabel(`Target date for ${MILESTONE_EDITED}`).fill(TARGET_DATE);
  });
  await screenshot(page, '01-kanban-created-edited.png');

  await guarded('complete:todo', () =>
    page.getByRole('button', { name: `Complete ${TODO_EDITED}` }).click(),
  );
  await page.getByRole('button', { name: `Mark ${TODO_EDITED} not done` }).waitFor();
  await guarded('complete:milestone', () =>
    page.getByRole('button', { name: `Complete ${MILESTONE_EDITED}` }).click(),
  );
  await page.getByRole('button', { name: `Mark ${MILESTONE_EDITED} not done` }).waitFor();
  await screenshot(page, '02-kanban-completed.png');
  const completedItems = await storeItems(page);
  const completedFixture = completedItems.filter((item) =>
    [TODO_EDITED, MILESTONE_EDITED].includes(item.title),
  );
  assert(
    'todo and milestone persist as complete with completion timestamps',
    completedFixture.length === 2 &&
      completedFixture.every((item) => item.status === 'done' && Number.isFinite(item.completedAt)),
    { completedFixture },
  );

  await guarded('reopen:todo', () =>
    page.getByRole('button', { name: `Mark ${TODO_EDITED} not done` }).click(),
  );
  await guarded('reopen:milestone', () =>
    page.getByRole('button', { name: `Mark ${MILESTONE_EDITED} not done` }).click(),
  );
  await page.getByRole('button', { name: `Complete ${TODO_EDITED}` }).waitFor();
  await page.getByRole('button', { name: `Complete ${MILESTONE_EDITED}` }).waitFor();
  await waitPersistedReopened(page, [TODO_EDITED, MILESTONE_EDITED]);
  await screenshot(page, '03-kanban-reopened.png');
  const reopenedItems = await storeItems(page);
  const reopenedFixture = reopenedItems.filter((item) =>
    [TODO_EDITED, MILESTONE_EDITED].includes(item.title),
  );
  assert(
    'reopen clears stale completedAt while retaining edits and target dates',
    reopenedFixture.length === 2 &&
      reopenedFixture.every(
        (item) =>
          item.status === 'todo' &&
          item.completedAt === undefined &&
          item.description?.startsWith('Edited ') &&
          Number.isFinite(item.deadlineAt),
      ),
    { reopenedFixture },
  );

  await route(page, 'chat');
  await page.getByRole('textbox', { name: 'Message' }).waitFor({ state: 'visible' });
  await route(page, 'kanban');
  await page.locator('[data-monochrome-route="kanban"]').waitFor({ state: 'visible' });
  await page.getByRole('textbox', { name: `Task title: ${TODO_EDITED}` }).waitFor();
  await page.getByRole('textbox', { name: `Task title: ${MILESTONE_EDITED}` }).waitFor();
  await waitPersistedReopened(page, [TODO_EDITED, MILESTONE_EDITED]);
  const persistedItems = await storeItems(page);
  const persistedFixture = persistedItems.filter((item) =>
    [TODO_EDITED, MILESTONE_EDITED].includes(item.title),
  );
  assert('edited reopened lifecycle survives route remount', persistedFixture.length === 2, {
    persistedFixture,
  });
  await screenshot(page, '04-kanban-persisted-after-remount.png');

  await guarded('cleanup:todo', () =>
    page.getByRole('button', { name: `Delete ${TODO_EDITED}` }).click(),
  );
  await guarded('cleanup:milestone', () =>
    page.getByRole('button', { name: `Delete ${MILESTONE_EDITED}` }).click(),
  );
  await page.waitForFunction(
    ([todo, milestone]) =>
      !document.body.innerText.includes(todo) && !document.body.innerText.includes(milestone),
    [TODO_EDITED, MILESTONE_EDITED],
  );
  assert(
    'acceptance fixtures removed after persistence proof',
    !(await storeItems(page)).some((item) =>
      [TODO_EDITED, MILESTONE_EDITED].includes(item.title),
    ),
  );

  report.status = 'passed';
  report.lifecycle = {
    titles: [TODO_EDITED, MILESTONE_EDITED],
    targetDate: TARGET_DATE,
    completedFixture,
    reopenedFixture,
    persistedFixture,
    fixtureRemoved: true,
  };
} catch (error) {
  report.status = 'failed';
  report.failure = String(error?.stack ?? error);
  if (page) {
    try {
      await screenshot(page, 'FAIL-kanban-lifecycle.png');
    } catch {
      // Preserve the primary failure.
    }
  }
} finally {
  const finalProcess = guard('driver:final');
  report.finalProcess = finalProcess;
  report.safetySummary = {
    checks: report.safety.length,
    maxOllamaProcesses: Math.max(...report.safety.map((entry) => entry.ollamaProcessCount)),
    maxListeners11434: Math.max(...report.safety.map((entry) => entry.listener11434Count)),
  };
  report.completedAt = new Date().toISOString();
  await writeFile(
    resolve(HERE, 'kanban-lifecycle-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
  if (browser) await browser.close();
}

if (report.status !== 'passed') process.exitCode = 1;
