import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const CDP = 'http://127.0.0.1:9223';
const SCHEDULE_COMMIT = 'f72d9746';
const EVENT_INITIAL = 'Native custom event 0828';
const EVENT_EDITED = 'Native custom event edited 0828';
const ACTION_INITIAL = 'Native exact-route action 0828';
const ACTION_EDITED = 'Native exact-route action edited 0828';
const EXACT_PROVIDER = 'opencode';
const EXACT_CONNECTION = 'opencode-cli';
const EXACT_MODEL = 'opencode-go/deepseek-v4-flash-vision-exp';
const SCHEDULE_PATHS = [
  'app/src/features/schedule/SchedulePage.tsx',
  'app/src/features/schedule/SchedulePage.jarvisLifecycle.test.tsx',
  'app/src/features/schedule/jarvisSchedules.ts',
  'app/src/features/schedule/jarvisSchedules.test.ts',
];

let browser;
let page;
const report = {
  schemaVersion: 1,
  task: 'PR31-NATIVE-SCHEDULE-COMPLETE-LIFECYCLE',
  startedAt: new Date().toISOString(),
  status: 'running',
  expectedAuthority: {
    providerId: EXACT_PROVIDER,
    connectionId: EXACT_CONNECTION,
    modelId: EXACT_MODEL,
    effort: 'provider default',
  },
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

async function shot(name) {
  const path = resolve(HERE, name);
  await guarded(`screenshot:${name}`, () =>
    page.screenshot({ path, animations: 'disabled', fullPage: false }),
  );
  const metadata = await sharp(path).metadata();
  report.artifacts.push({ name, width: metadata.width, height: metadata.height });
}

async function routeFromWorkbenchToSchedule() {
  await guarded('public-route-to-schedule', async () => {
    if ((await page.locator('[data-monochrome-route="schedule"]').count()) > 0) return;
    if ((await page.getByRole('button', { name: 'Schedule', exact: true }).count()) === 0) {
      await page.evaluate(() => {
        const url = new URL(location.href);
        url.searchParams.set('route', 'chat');
        history.pushState(null, '', url);
        dispatchEvent(new PopStateEvent('popstate'));
      });
      await page.getByRole('textbox', { name: 'Message' }).waitFor({ state: 'visible' });
      await wake();
    }
    await page.getByRole('button', { name: 'Schedule', exact: true }).click();
    await page.locator('[data-monochrome-route="schedule"]').waitFor({ state: 'visible' });
  });
}

async function fixtureRows() {
  return page.evaluate(async (titles) => {
    const { db } = await import('/src/lib/db/index.ts');
    const { parseJarvisScheduleMetadata } = await import(
      '/src/features/schedule/jarvisSchedules.ts'
    );
    const rows = await db.events.filter((event) => titles.includes(event.title)).toArray();
    return rows.map((row) => ({
      ...row,
      jarvisMetadata: parseJarvisScheduleMetadata(row),
    }));
  }, [EVENT_INITIAL, EVENT_EDITED, `Jarvis Scheduled — ${ACTION_INITIAL}`, `Jarvis Scheduled — ${ACTION_EDITED}`]);
}

async function cleanupFixtureRows() {
  await page.evaluate(async (titles) => {
    const { db } = await import('/src/lib/db/index.ts');
    const rows = await db.events.filter((event) => titles.includes(event.title)).toArray();
    await db.events.bulkDelete(rows.map((row) => row.id));
  }, [EVENT_INITIAL, EVENT_EDITED, `Jarvis Scheduled — ${ACTION_INITIAL}`, `Jarvis Scheduled — ${ACTION_EDITED}`]);
}

const startHead = git('rev-parse', 'HEAD');
const commitIsAncestor = gitOk('merge-base', '--is-ancestor', SCHEDULE_COMMIT, startHead);
const sourceMatches = gitOk(
  'diff',
  '--quiet',
  `${SCHEDULE_COMMIT}..${startHead}`,
  '--',
  ...SCHEDULE_PATHS,
);
assert('stable Schedule lifecycle commit is present with zero descendant source diff', commitIsAncestor && sourceMatches, {
  scheduleCommit: SCHEDULE_COMMIT,
  startHead,
  commitIsAncestor,
  sourceMatches,
  paths: SCHEDULE_PATHS,
});

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

  await routeFromWorkbenchToSchedule();
  await guarded('remove-stale-fixtures', cleanupFixtureRows);
  await guarded('select-event-editor', async () => {
    const title = page.getByLabel('Title', { exact: true });
    if (!(await title.isVisible())) {
      await page.getByRole('button', { name: 'Event', exact: true }).click();
      await title.waitFor({ state: 'visible' });
    }
  });

  await guarded('create-custom-event', async () => {
    await page.getByLabel('Title', { exact: true }).fill(EVENT_INITIAL);
    await page.getByLabel('Start', { exact: true }).fill('2026-09-03T09:00');
    await page.getByLabel('End', { exact: true }).fill('2026-09-03T10:30');
    await page.getByLabel('Notes', { exact: true }).fill('Native custom recurrence and reminder proof.');
    await page.getByRole('button', { name: 'Custom', exact: true }).click();
    await page.getByLabel('Repeat frequency').selectOption('weekly');
    await page.getByLabel('Repeat interval').fill('2');
    const monday = page.getByRole('button', { name: 'Monday', exact: true });
    const wednesday = page.getByRole('button', { name: 'Wednesday', exact: true });
    if ((await monday.getAttribute('aria-pressed')) !== 'true') await monday.click();
    if ((await wednesday.getAttribute('aria-pressed')) !== 'true') await wednesday.click();
    await page.getByLabel('Repeat end date').fill('2026-12-31');
    const oneHourReminder = page.getByRole('button', {
      name: '1 hour before',
      exact: true,
    });
    if ((await oneHourReminder.getAttribute('aria-pressed')) !== 'true') {
      await oneHourReminder.click();
    }
    await page.waitForFunction(
      (element) => element?.getAttribute('aria-pressed') === 'true',
      await oneHourReminder.elementHandle(),
    );
    await page.getByRole('button', { name: 'Save event', exact: true }).click();
  });
  await page.getByText(EVENT_INITIAL, { exact: true }).first().waitFor({ state: 'visible' });
  await shot('01-schedule-custom-event-created.png');

  await guarded('edit-custom-event', async () => {
    await page.getByRole('button', { name: `Edit ${EVENT_INITIAL}` }).first().click();
    await page.getByLabel('Title', { exact: true }).fill(EVENT_EDITED);
    await page.getByLabel('Notes', { exact: true }).fill('Edited native custom recurrence and reminder proof.');
    await page.getByRole('button', { name: 'Update event', exact: true }).click();
  });
  await page.getByText(EVENT_EDITED, { exact: true }).first().waitFor({ state: 'visible' });
  await guarded('cancel-custom-event', () =>
    page.getByRole('button', { name: `Cancel ${EVENT_EDITED}` }).first().click(),
  );
  await page.getByRole('button', { name: `Reopen ${EVENT_EDITED}` }).first().waitFor();
  await shot('02-schedule-event-cancelled.png');
  await guarded('reopen-custom-event', () =>
    page.getByRole('button', { name: `Reopen ${EVENT_EDITED}` }).first().click(),
  );
  await page.getByRole('button', { name: `Cancel ${EVENT_EDITED}` }).first().waitFor();
  const eventRows = await fixtureRows();
  const customEvent = eventRows.find((row) => row.title === EVENT_EDITED);
  assert(
    'custom event retains weekly interval, weekday/end-date rule, reminders, edit, and reopened status',
    customEvent?.status === 'scheduled' &&
      /FREQ=WEEKLY/iu.test(customEvent?.recurrence_rule ?? '') &&
      /INTERVAL=2/iu.test(customEvent?.recurrence_rule ?? '') &&
      /UNTIL=20261231/iu.test(customEvent?.recurrence_rule ?? '') &&
      customEvent?.reminders?.some((reminder) => reminder.offset_min === 15) &&
      customEvent?.reminders?.some((reminder) => reminder.offset_min === 60) &&
      /Edited native custom/iu.test(customEvent?.description ?? ''),
    { customEvent },
  );

  await guarded('open-jarvis-action-editor', () =>
    page.getByRole('button', { name: 'Jarvis Action', exact: true }).click(),
  );
  await guarded('select-exact-opencode-route', async () => {
    await page.getByLabel('Jarvis action model').click();
    const picker = page.getByRole('dialog');
    await picker.waitFor({ state: 'visible' });
    await picker
      .getByText('DeepSeek V4 Flash Vision Exp · Opencode Go provider connection', {
        exact: true,
      })
      .click();
    await page
      .getByLabel('Jarvis action model')
      .getByText(/DeepSeek V4 Flash Vision Exp/iu)
      .waitFor({ state: 'visible' });
  });
  const selectedModelText = await page.getByLabel('Jarvis action model').innerText();
  assert(
    'Jarvis Action editor exposes the configured DeepSeek OpenCode route',
    /OpenCode/iu.test(selectedModelText) && /DeepSeek V4 Flash Vision Exp/iu.test(selectedModelText),
    { selectedModelText },
  );
  await guarded('create-exact-route-jarvis-action', async () => {
    await page.getByLabel('Jarvis action title').fill(ACTION_INITIAL);
    await page.getByLabel('Run at').fill('2026-09-04T11:15');
    await page
      .getByLabel('Jarvis instruction')
      .fill('Prepare a local bounded acceptance receipt without dispatching now.');
    await page.getByRole('button', { name: 'Every…', exact: true }).click();
    await page.getByLabel('Interval amount').fill('10');
    await page.getByLabel('Interval unit').selectOption('days');
    await page.getByRole('button', { name: 'Save Jarvis Action', exact: true }).click();
  });
  await page
    .getByText(`Jarvis Scheduled — ${ACTION_INITIAL}`, { exact: true })
    .first()
    .waitFor({ state: 'visible' });
  await shot('03-schedule-jarvis-action-created.png');

  await guarded('edit-exact-route-jarvis-action', async () => {
    await page
      .getByRole('button', { name: `Edit Jarvis Scheduled — ${ACTION_INITIAL}` })
      .first()
      .click();
    await page.getByLabel('Jarvis action title').fill(ACTION_EDITED);
    await page
      .getByLabel('Jarvis instruction')
      .fill('Edited prompt retained on the same exact route without dispatch.');
    await page.getByLabel('Run at').fill('2026-09-04T12:45');
    await page.getByRole('button', { name: 'Update Jarvis Action', exact: true }).click();
  });
  await page
    .getByText(`Jarvis Scheduled — ${ACTION_EDITED}`, { exact: true })
    .first()
    .waitFor({ state: 'visible' });
  await guarded('cancel-exact-route-jarvis-action', () =>
    page
      .getByRole('button', { name: `Cancel Jarvis Scheduled — ${ACTION_EDITED}` })
      .first()
      .click(),
  );
  await page
    .getByRole('button', { name: `Reopen Jarvis Scheduled — ${ACTION_EDITED}` })
    .first()
    .waitFor();
  await guarded('reopen-exact-route-jarvis-action', () =>
    page
      .getByRole('button', { name: `Reopen Jarvis Scheduled — ${ACTION_EDITED}` })
      .first()
      .click(),
  );
  await page
    .getByRole('button', { name: `Cancel Jarvis Scheduled — ${ACTION_EDITED}` })
    .first()
    .waitFor();

  const jarvisRows = await fixtureRows();
  const jarvisAction = jarvisRows.find(
    (row) => row.title === `Jarvis Scheduled — ${ACTION_EDITED}`,
  );
  const selection = jarvisAction?.jarvisMetadata?.modelSelection;
  assert(
    'saved edited Jarvis Action retains exact provider/connection/model route and custom interval after reopen',
    jarvisAction?.status === 'scheduled' &&
      jarvisAction?.jarvisMetadata?.recurrence === 'custom_interval' &&
      jarvisAction?.jarvisMetadata?.intervalMs === 10 * 24 * 60 * 60 * 1_000 &&
      selection?.mode === 'single' &&
      selection.providerId === EXACT_PROVIDER &&
      selection.connectionId === EXACT_CONNECTION &&
      selection.modelId === EXACT_MODEL,
    { jarvisAction },
  );

  await guarded('open-jarvis-saved-route-receipt', async () => {
    await page.getByRole('button', { name: /^Jarvis Actions/u }).click();
    await page.getByText(ACTION_EDITED, { exact: true }).click();
    await page.getByLabel('Saved model identity').waitFor({ state: 'visible' });
  });
  const savedIdentity = await page.getByLabel('Saved model identity').innerText();
  assert(
    'visible saved model receipt shows exact OpenCode connection and raw DeepSeek route',
    savedIdentity.includes('Provider: OpenCode') &&
      savedIdentity.includes(`Connection: ${EXACT_CONNECTION}`) &&
      savedIdentity.includes(`Model: ${EXACT_MODEL}`) &&
      savedIdentity.includes('Effort: provider default'),
    { savedIdentity },
  );
  await shot('04-schedule-exact-route-receipt.png');

  await guarded('schedule-route-remount', async () => {
    await page.evaluate(() => {
      const url = new URL(location.href);
      url.searchParams.set('route', 'chat');
      history.pushState(null, '', url);
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.getByRole('textbox', { name: 'Message' }).waitFor({ state: 'visible' });
    await wake();
    await page.getByRole('button', { name: 'Schedule', exact: true }).click();
    await page.locator('[data-monochrome-route="schedule"]').waitFor({ state: 'visible' });
  });
  const persisted = await fixtureRows();
  const persistedEvent = persisted.find((row) => row.title === EVENT_EDITED);
  const persistedAction = persisted.find(
    (row) => row.title === `Jarvis Scheduled — ${ACTION_EDITED}`,
  );
  assert(
    'event and exact-route Jarvis Action persist after Schedule remount',
    persistedEvent?.status === 'scheduled' &&
      persistedAction?.status === 'scheduled' &&
      persistedAction?.jarvisMetadata?.modelSelection?.modelId === EXACT_MODEL,
    { persistedEvent, persistedAction },
  );
  await shot('05-schedule-persisted-after-remount.png');

  await guarded('cleanup-schedule-fixtures', cleanupFixtureRows);
  assert('Schedule acceptance fixtures removed after proof', (await fixtureRows()).length === 0);

  report.status = 'passed';
  report.lifecycle = {
    customEvent,
    jarvisAction,
    savedIdentity,
    persisted: { event: persistedEvent, action: persistedAction },
    fixtureRemoved: true,
  };
} catch (error) {
  report.status = 'failed';
  report.failure = String(error?.stack ?? error);
  if (page) {
    try {
      await shot('FAIL-schedule-lifecycle.png');
    } catch {
      // Preserve primary failure.
    }
  }
} finally {
  const finalProcess = guard('driver:final');
  report.finalProcess = finalProcess;
  report.finalHead = git('rev-parse', 'HEAD');
  report.safetySummary = {
    checks: report.safety.length,
    maxOllamaProcesses: Math.max(...report.safety.map((entry) => entry.ollamaProcessCount)),
    maxListeners11434: Math.max(...report.safety.map((entry) => entry.listener11434Count)),
  };
  report.completedAt = new Date().toISOString();
  await writeFile(
    resolve(HERE, 'schedule-lifecycle-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
  if (browser) await browser.close();
}

if (report.status !== 'passed') process.exitCode = 1;
