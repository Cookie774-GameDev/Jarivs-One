import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const CDP = 'http://127.0.0.1:9223';
const SCHEDULE_COMMIT = 'f72d97469a9daca77714bace8ea0bd281d228d88';
const EVENT_TITLE = 'Native custom event 0828';
const ACTION_INITIAL = 'Native recovery exact-route action 0828';
const ACTION_EDITED = 'Native recovery exact-route action edited 0828';
const EXACT_PROVIDER = 'opencode';
const EXACT_CONNECTION = 'opencode-cli';
const EXACT_MODEL = 'opencode-go/deepseek-v4-flash-vision-exp';
const EVENT_REPORT = 'schedule-event-supplement-f72d9746.json';
const ACTION_REPORT = 'schedule-action-supplement-f72d9746.json';
const AGGREGATE_REPORT = 'schedule-lifecycle-aggregate.json';

let browser;
let page;
const safety = [];
const artifacts = [];
const consoleMessages = [];
const pageErrors = [];

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
  if (!passed) throw new Error(`Assertion failed: ${name}`);
  return { name, passed: true, ...details };
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

async function nativeRows() {
  return page.evaluate(async (titles) => {
    const { db } = await import('/src/lib/db/index.ts');
    const { parseJarvisScheduleMetadata } = await import(
      '/src/features/schedule/jarvisSchedules.ts'
    );
    const rows = await db.events
      .filter((event) => titles.includes(event.title))
      .toArray();
    return rows.map((row) => ({
      ...row,
      jarvisMetadata: parseJarvisScheduleMetadata(row),
    }));
  }, [
    EVENT_TITLE,
    `Jarvis Scheduled — ${ACTION_INITIAL}`,
    `Jarvis Scheduled — ${ACTION_EDITED}`,
  ]);
}

async function cleanup() {
  await page.evaluate(async (prefixes) => {
    const { db } = await import('/src/lib/db/index.ts');
    const rows = await db.events
      .filter((event) => prefixes.some((prefix) => event.title.startsWith(prefix)))
      .toArray();
    await db.events.bulkDelete(rows.map((row) => row.id));
  }, ['Native custom event', 'Jarvis Scheduled — Native recovery exact-route action']);
}

const startedAt = new Date().toISOString();
const startHead = git('rev-parse', 'HEAD');
const sourcePaths = [
  'app/src/features/schedule/SchedulePage.tsx',
  'app/src/features/schedule/SchedulePage.jarvisLifecycle.test.tsx',
  'app/src/features/schedule/jarvisSchedules.ts',
  'app/src/features/schedule/jarvisSchedules.test.ts',
];
let eventSupplement;
let actionSupplement;
let failure;

try {
  const before = guard('bounded-recovery:start');
  const jarvis = before.Jarvis;
  if (jarvis.length !== 1) throw new Error('Expected exactly one official jarvis.exe');
  const rootWebView = before.WebViews.find(
    (candidate) =>
      candidate.ParentProcessId === jarvis[0].ProcessId && candidate.Cdp9223,
  );
  if (!rootWebView) throw new Error('CDP 9223 is not owned by the official jarvis WebView');

  browser = await chromium.connectOverCDP(CDP);
  page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((candidate) => candidate.url().includes('localhost:5173'));
  if (!page) throw new Error('Official VibeSpace WebView page not found');
  page.on('console', (message) =>
    consoleMessages.push({ type: message.type(), text: message.text().slice(0, 2_000) }),
  );
  page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 2_000)));

  if ((await page.locator('[data-monochrome-route="schedule"]').count()) === 0) {
    await guarded('public-route-to-schedule', () =>
      page.getByRole('button', { name: 'Schedule', exact: true }).click(),
    );
    await page.locator('[data-monochrome-route="schedule"]').waitFor({ state: 'visible' });
  }

  await guarded('show-surviving-event', async () => {
    const title = page.getByText(EVENT_TITLE, { exact: true }).first();
    if (!(await title.isVisible())) {
      await page.getByRole('button', { name: 'Timeline', exact: true }).click();
      await title.waitFor({ state: 'visible' });
    }
  });
  const eventRow = (await nativeRows()).find((row) => row.title === EVENT_TITLE);
  const eventAssertions = [
    assert(
      'surviving native event has the committed recurrence and both reminders',
      eventRow?.status === 'scheduled' &&
        /FREQ=WEEKLY/iu.test(eventRow?.recurrence_rule ?? '') &&
        /INTERVAL=2/iu.test(eventRow?.recurrence_rule ?? '') &&
        /UNTIL=20261231/iu.test(eventRow?.recurrence_rule ?? '') &&
        eventRow?.reminders?.some((reminder) => reminder.offset_min === 15) &&
        eventRow?.reminders?.some((reminder) => reminder.offset_min === 60),
      { eventRow },
    ),
  ];
  const eventArtifact = await screenshot('06-schedule-event-supplement.png');
  eventSupplement = {
    schemaVersion: 1,
    task: 'PR31-NATIVE-SCHEDULE-EVENT-SUPPLEMENT',
    generatedAt: new Date().toISOString(),
    status: 'passed',
    captureHead: startHead,
    scheduleCommit: SCHEDULE_COMMIT,
    commitIsAncestor: gitOk('merge-base', '--is-ancestor', SCHEDULE_COMMIT, startHead),
    sourceMatches: gitOk('diff', '--quiet', `${SCHEDULE_COMMIT}..${startHead}`, '--', ...sourcePaths),
    assertions: eventAssertions,
    event: eventRow,
    artifact: eventArtifact,
    boundary: 'Immutable snapshot only; no event edit/cancel/reopen replay was performed.',
  };
  await writeJson(EVENT_REPORT, eventSupplement);

  await guarded('open-action-editor', () =>
    page.getByRole('button', { name: 'Jarvis Action', exact: true }).click(),
  );
  await guarded('select-exact-opencode-route', async () => {
    const modelButton = page.getByLabel('Jarvis action model');
    if (!/DeepSeek V4 Flash Vision Exp/iu.test(await modelButton.innerText())) {
      await modelButton.click();
      const picker = page.getByRole('dialog');
      await picker.waitFor({ state: 'visible' });
      await picker
        .getByText('DeepSeek V4 Flash Vision Exp · Opencode Go provider connection', {
          exact: true,
        })
        .click();
    }
    await modelButton
      .getByText(/DeepSeek V4 Flash Vision Exp/iu)
      .waitFor({ state: 'visible' });
  });
  const selectedModelText = await page.getByLabel('Jarvis action model').innerText();

  await guarded('create-action-only', async () => {
    await page.getByLabel('Jarvis action title').fill(ACTION_INITIAL);
    await page.getByLabel('Run at').fill('2026-09-04T14:15');
    await page
      .getByLabel('Jarvis instruction')
      .fill('Bounded native recovery receipt; do not dispatch before the future time.');
    const every = page.getByRole('button', { name: 'Every…', exact: true });
    if ((await every.getAttribute('aria-pressed')) !== 'true') await every.click();
    await page.getByLabel('Interval amount').fill('10');
    await page.getByLabel('Interval unit').selectOption('days');
    await page.getByRole('button', { name: 'Save Jarvis Action', exact: true }).click();
  });
  await page
    .getByText(`Jarvis Scheduled — ${ACTION_INITIAL}`, { exact: true })
    .first()
    .waitFor({ state: 'visible' });

  await guarded('edit-action-only', async () => {
    await page
      .getByRole('button', { name: `Edit Jarvis Scheduled — ${ACTION_INITIAL}` })
      .first()
      .click();
    await page.getByLabel('Jarvis action title').fill(ACTION_EDITED);
    await page
      .getByLabel('Jarvis instruction')
      .fill('Edited bounded native recovery receipt on the same saved route.');
    await page.getByLabel('Run at').fill('2026-09-04T15:45');
    await page.getByRole('button', { name: 'Update Jarvis Action', exact: true }).click();
  });
  await page
    .getByText(`Jarvis Scheduled — ${ACTION_EDITED}`, { exact: true })
    .first()
    .waitFor({ state: 'visible' });
  await guarded('cancel-action-only', () =>
    page
      .getByRole('button', { name: `Cancel Jarvis Scheduled — ${ACTION_EDITED}` })
      .first()
      .click(),
  );
  await page
    .getByRole('button', { name: `Reopen Jarvis Scheduled — ${ACTION_EDITED}` })
    .first()
    .waitFor({ state: 'visible' });
  await guarded('reopen-action-only', () =>
    page
      .getByRole('button', { name: `Reopen Jarvis Scheduled — ${ACTION_EDITED}` })
      .first()
      .click(),
  );

  const actionRow = (await nativeRows()).find(
    (row) => row.title === `Jarvis Scheduled — ${ACTION_EDITED}`,
  );
  const selection = actionRow?.jarvisMetadata?.modelSelection;
  const actionAssertions = [
    assert(
      'action-only lifecycle persists exact OpenCode route and custom recurrence after reopen',
      actionRow?.status === 'scheduled' &&
        actionRow?.jarvisMetadata?.recurrence === 'custom_interval' &&
        actionRow?.jarvisMetadata?.intervalMs === 10 * 24 * 60 * 60 * 1_000 &&
        selection?.mode === 'single' &&
        selection.providerId === EXACT_PROVIDER &&
        selection.connectionId === EXACT_CONNECTION &&
        selection.modelId === EXACT_MODEL,
      { actionRow },
    ),
  ];

  await guarded('open-saved-identity-receipt', async () => {
    await page.getByRole('button', { name: /^Jarvis Actions/u }).click();
    await page.getByText(ACTION_EDITED, { exact: true }).click();
    await page.getByLabel('Saved model identity').waitFor({ state: 'visible' });
  });
  const savedIdentity = await page.getByLabel('Saved model identity').innerText();
  actionAssertions.push(
    assert(
      'visible saved identity receipt exposes exact provider connection model and effort',
      savedIdentity.includes('Provider: OpenCode') &&
        savedIdentity.includes(`Connection: ${EXACT_CONNECTION}`) &&
        savedIdentity.includes(`Model: ${EXACT_MODEL}`) &&
        savedIdentity.includes('Effort: provider default'),
      { savedIdentity },
    ),
  );
  const receiptArtifact = await screenshot('07-schedule-action-receipt-supplement.png');

  await guarded('schedule-remount', async () => {
    await page.evaluate(() => {
      const url = new URL(location.href);
      url.searchParams.set('route', 'chat');
      history.pushState(null, '', url);
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.getByRole('textbox', { name: 'Message' }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Schedule', exact: true }).click();
    await page.locator('[data-monochrome-route="schedule"]').waitFor({ state: 'visible' });
  });
  const remountedRows = await nativeRows();
  const remountedEvent = remountedRows.find((row) => row.title === EVENT_TITLE);
  const remountedAction = remountedRows.find(
    (row) => row.title === `Jarvis Scheduled — ${ACTION_EDITED}`,
  );
  actionAssertions.push(
    assert(
      'event and exact-route action remain canonical after Schedule remount',
      remountedEvent?.reminders?.some((reminder) => reminder.offset_min === 15) &&
        remountedEvent?.reminders?.some((reminder) => reminder.offset_min === 60) &&
        remountedAction?.status === 'scheduled' &&
        remountedAction?.jarvisMetadata?.modelSelection?.providerId === EXACT_PROVIDER &&
        remountedAction?.jarvisMetadata?.modelSelection?.connectionId === EXACT_CONNECTION &&
        remountedAction?.jarvisMetadata?.modelSelection?.modelId === EXACT_MODEL,
      { remountedEvent, remountedAction },
    ),
  );
  const remountArtifact = await screenshot('08-schedule-supplement-after-remount.png');

  await guarded('cleanup-both-fixture-prefixes', cleanup);
  const remaining = await page.evaluate(async (prefixes) => {
    const { db } = await import('/src/lib/db/index.ts');
    return db.events
      .filter((event) => prefixes.some((prefix) => event.title.startsWith(prefix)))
      .count();
  }, ['Native custom event', 'Jarvis Scheduled — Native recovery exact-route action']);
  actionAssertions.push(assert('both recovery fixture prefixes are removed', remaining === 0));

  const after = guard('bounded-recovery:complete');
  actionSupplement = {
    schemaVersion: 1,
    task: 'PR31-NATIVE-SCHEDULE-ACTION-SUPPLEMENT',
    startedAt,
    completedAt: new Date().toISOString(),
    status: 'passed',
    captureHead: startHead,
    scheduleCommit: SCHEDULE_COMMIT,
    expectedAuthority: {
      providerId: EXACT_PROVIDER,
      connectionId: EXACT_CONNECTION,
      modelId: EXACT_MODEL,
      effort: 'provider default',
    },
    officialProcess: {
      jarvis: before.Jarvis,
      rootWebView,
      listeners9223: before.Listeners9223,
      finalJarvis: after.Jarvis,
    },
    selectedModelText,
    savedIdentity,
    action: actionRow,
    remounted: { event: remountedEvent, action: remountedAction },
    assertions: actionAssertions,
    artifacts: [receiptArtifact, remountArtifact],
    safety,
    safetySummary: {
      checks: safety.length,
      maxOllamaProcesses: Math.max(...safety.map((entry) => entry.ollamaProcessCount)),
      maxListeners11434: Math.max(...safety.map((entry) => entry.listener11434Count)),
    },
    console: consoleMessages,
    pageErrors,
    prohibitions: {
      modelDispatch: false,
      productFilesEdited: false,
      credentialsEntered: false,
      productionMutation: false,
      standaloneBrowserControlled: false,
      computerUseUsed: false,
    },
  };
  await writeJson(ACTION_REPORT, actionSupplement);

  await writeJson(AGGREGATE_REPORT, {
    schemaVersion: 1,
    task: 'PR31-NATIVE-SCHEDULE-LIFECYCLE-AGGREGATE',
    generatedAt: new Date().toISOString(),
    status: 'passed',
    captureHead: startHead,
    stableCommit: SCHEDULE_COMMIT,
    reports: {
      immutableEventSupplement: EVENT_REPORT,
      boundedActionSupplement: ACTION_REPORT,
      preservedHistoricalDriverReport: 'schedule-lifecycle-report.json',
    },
    classification: {
      product: 'passed',
      historicalDriverRetries: 'preserved; latest overwrite failed before visible event synchronization',
    },
    coverage: [
      'custom weekly interval and end date',
      'reminders 15 and 60 retained',
      'event edit/cancel/reopen visual history preserved in prior artifacts',
      'Jarvis action create/edit/cancel/reopen',
      'custom interval',
      'exact provider/connection/model identity',
      'provider-default effort receipt',
      'Schedule remount persistence',
      'fixture cleanup',
    ],
    event: eventSupplement,
    action: actionSupplement,
    safetySummary: actionSupplement.safetySummary,
  });
} catch (error) {
  failure = String(error?.stack ?? error);
  const failureReport = {
    schemaVersion: 1,
    task: 'PR31-NATIVE-SCHEDULE-BOUNDED-RECOVERY',
    startedAt,
    failedAt: new Date().toISOString(),
    status: 'failed',
    captureHead: startHead,
    failure,
    eventSupplement: eventSupplement ?? null,
    safety,
    artifacts,
    console: consoleMessages,
    pageErrors,
  };
  await writeJson('schedule-bounded-recovery-failure.json', failureReport);
} finally {
  try {
    if (page) guard('bounded-recovery:final');
  } catch (error) {
    failure ??= String(error?.stack ?? error);
  }
  await browser?.close().catch(() => undefined);
}

if (failure) process.exitCode = 1;
