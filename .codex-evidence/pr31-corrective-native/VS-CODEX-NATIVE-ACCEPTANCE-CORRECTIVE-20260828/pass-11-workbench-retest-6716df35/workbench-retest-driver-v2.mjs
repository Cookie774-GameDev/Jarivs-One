import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const EXPECTED_HEAD = '6716df3556fbeecea676cc41e66395bf4d974a0d';
const CDP_URL = 'http://127.0.0.1:9223';
const YOUTUBE_WATCH_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const YOUTUBE_EMBED_URL = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';
const REFUSED_URL = 'http://127.0.0.1:65534/';
const WORKBENCH_SOURCE_PATHS = [
  'app/src/features/workbench/BrowserPanel.tsx',
  'app/src/features/workbench/BrowserPanel.test.tsx',
  'app/src/features/workbench/browserSecurity.ts',
  'app/src/features/workbench/browserSecurity.test.ts',
];

await mkdir(HERE, { recursive: true });

const report = {
  schemaVersion: 2,
  task: 'PR31-WORKBENCH-TRUSTED-MEDIA-NATIVE-RETEST',
  agent: 'VS-CODEX-NATIVE-ACCEPTANCE-CORRECTIVE-20260828',
  startedAt: new Date().toISOString(),
  expectedHead: EXPECTED_HEAD,
  status: 'running',
  safety: [],
  assertions: [],
  console: [],
  pageErrors: [],
  artifacts: [],
  prohibitions: {
    standaloneBrowserControlled: false,
    computerUseUsed: false,
    credentialsEntered: false,
    externalAccountActionCompleted: false,
    productionMutation: false,
    modelDispatch: false,
    nativeShellLaunchInvokedByFinalPass: false,
  },
};

function ps(script) {
  return execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
  }).trim();
}

function git(...args) {
  return execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim();
}

function gitSucceeds(...args) {
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
        "$ollama=@(Get-CimInstance Win32_Process|Where-Object Name -eq 'ollama.exe'|Select-Object Name,ProcessId,ParentProcessId,ExecutablePath,CommandLine)",
        '$p11434=@(Get-NetTCPConnection -State Listen -LocalPort 11434 -ErrorAction SilentlyContinue|Select-Object LocalAddress,LocalPort,OwningProcess,State)',
        '$p9223=@(Get-NetTCPConnection -State Listen -LocalPort 9223 -ErrorAction SilentlyContinue|Select-Object LocalAddress,LocalPort,OwningProcess,State)',
        '$p5173=@(Get-NetTCPConnection -State Listen -LocalPort 5173 -ErrorAction SilentlyContinue|Select-Object LocalAddress,LocalPort,OwningProcess,State)',
        '[pscustomobject]@{CapturedAt=(Get-Date -Format o);Jarvis=$jarvis;WebViews=$webviews;Listeners9223=$p9223;Listeners5173=$p5173;Ollama=$ollama;Listeners11434=$p11434}|ConvertTo-Json -Depth 7 -Compress',
      ].join(';'),
    ),
  );
}

function guard(label) {
  const snapshot = processSnapshot();
  const row = {
    label,
    capturedAt: snapshot.CapturedAt,
    ollamaProcessCount: snapshot.Ollama.length,
    listener11434Count: snapshot.Listeners11434.length,
  };
  report.safety.push(row);
  if (row.ollamaProcessCount !== 0 || row.listener11434Count !== 0) {
    throw new Error(`Hard safety failure at ${label}: forbidden Ollama/11434 is present.`);
  }
  return snapshot;
}

async function guarded(label, action) {
  guard(`${label}:before`);
  try {
    return await action();
  } finally {
    guard(`${label}:after`);
  }
}

function assert(name, passed, details = {}) {
  const row = { name, passed: Boolean(passed), ...details };
  report.assertions.push(row);
  if (!row.passed) throw new Error(`Assertion failed: ${name}`);
}

function clean(value) {
  return String(value)
    .replace(/([?&](?:token|key|secret|password)=)[^&\s]+/giu, '$1[redacted]')
    .slice(0, 2_000);
}

async function writeJson(name, value) {
  await writeFile(resolve(HERE, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  report.artifacts.push({ name, kind: 'json' });
}

async function shot(locator, name) {
  const path = resolve(HERE, name);
  await guarded(`screenshot:${name}`, () => locator.screenshot({ path, animations: 'disabled' }));
  const metadata = await sharp(path).metadata();
  report.artifacts.push({ name, kind: 'png', width: metadata.width, height: metadata.height });
  return path;
}

async function pixels(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let visible = 0;
  let black = 0;
  let total = 0;
  let squared = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const red = data[offset] ?? 0;
    const green = data[offset + 1] ?? 0;
    const blue = data[offset + 2] ?? 0;
    const alpha = data[offset + 3] ?? 255;
    if (alpha === 0) continue;
    const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    visible += 1;
    total += luma;
    squared += luma * luma;
    if (red < 16 && green < 16 && blue < 16) black += 1;
  }
  const mean = visible ? total / visible : 0;
  return {
    width: info.width,
    height: info.height,
    visiblePixels: visible,
    nearBlackRatio: visible ? black / visible : 1,
    meanLuma: mean,
    lumaStdDev: Math.sqrt(visible ? Math.max(0, squared / visible - mean ** 2) : 0),
  };
}

async function frameMatching(pattern, excludedFrame = null) {
  const current = page
    .frames()
    .find((candidate) => candidate !== excludedFrame && pattern.test(candidate.url()));
  if (current) return current;
  return page.waitForEvent('framenavigated', {
    predicate: (candidate) => candidate !== excludedFrame && pattern.test(candidate.url()),
    timeout: 30_000,
  });
}

async function waitPlayer(frame) {
  await frame.locator('#movie_player').waitFor({ state: 'visible', timeout: 30_000 });
  await frame.locator('.ytp-large-play-button').waitFor({ state: 'visible', timeout: 30_000 });
  await frame.waitForFunction(() => {
    const thumbnail = document.querySelector('.ytp-cued-thumbnail-overlay-image');
    return thumbnail && /url\(/u.test(getComputedStyle(thumbnail).backgroundImage);
  }, null, { timeout: 30_000 });
}

const startHead = git('rev-parse', 'HEAD');
const targetIsAncestor = gitSucceeds('merge-base', '--is-ancestor', EXPECTED_HEAD, startHead);
const workbenchSourceMatchesTarget = gitSucceeds(
  'diff',
  '--quiet',
  `${EXPECTED_HEAD}..${startHead}`,
  '--',
  ...WORKBENCH_SOURCE_PATHS,
);
assert(
  'requested Workbench commit is an ancestor and its exact repaired files remain unchanged',
  targetIsAncestor && workbenchSourceMatchesTarget,
  {
    targetWorkbenchCommit: EXPECTED_HEAD,
    currentHead: startHead,
    targetIsAncestor,
    workbenchSourceMatchesTarget,
    paths: WORKBENCH_SOURCE_PATHS,
  },
);
report.sourceIdentity = {
  targetWorkbenchCommit: EXPECTED_HEAD,
  currentHeadAtStart: startHead,
  targetIsAncestor,
  workbenchSourceMatchesTarget,
  paths: WORKBENCH_SOURCE_PATHS,
};
const before = guard('driver:start');
const jarvis = before.Jarvis[0];
const cdpRoot = before.WebViews.find(
  (row) => row.ParentProcessId === jarvis?.ProcessId && row.Cdp9223 === true,
);
assert('exactly one jarvis.exe is running', before.Jarvis.length === 1, {
  processes: before.Jarvis,
});
assert('CDP root is a direct jarvis.exe WebView child', Boolean(cdpRoot), { cdpRoot });
assert(
  'CDP 9223 listener is owned by the direct jarvis WebView child',
  before.Listeners9223.some(
    (listener) => listener.LocalAddress === '127.0.0.1' && listener.OwningProcess === cdpRoot?.ProcessId,
  ),
  { listeners: before.Listeners9223 },
);
const jarvisBinarySha256 = jarvis?.ExecutablePath
  ? createHash('sha256').update(readFileSync(jarvis.ExecutablePath)).digest('hex').toUpperCase()
  : null;
await writeJson('official-native-v2-before.json', {
  worktree: git('rev-parse', '--show-toplevel'),
  branch: git('branch', '--show-current'),
  head: startHead,
  upstream: git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'),
  jarvisBinarySha256,
  process: before,
});

let browser;
let page;
let originalViewport;

try {
  browser = await chromium.connectOverCDP(CDP_URL);
  page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((candidate) => candidate.url().startsWith('http://localhost:5173/'));
  if (!page) throw new Error('Official VibeSpace page missing from jarvis CDP target.');

  page.on('console', (message) =>
    report.console.push({
      capturedAt: new Date().toISOString(),
      type: message.type(),
      text: clean(message.text()),
      url: message.location().url || null,
    }),
  );
  page.on('pageerror', (error) =>
    report.pageErrors.push({ capturedAt: new Date().toISOString(), message: clean(error) }),
  );

  await page.waitForLoadState('domcontentloaded');
  await page.locator('body').waitFor({ state: 'visible', timeout: 30_000 });
  originalViewport = page.viewportSize();

  const guardValue = await guarded('read-compiled-ollama-disable-value', () =>
    page.evaluate(async () => {
      const response = await fetch('/src/lib/ai/ollamaBootstrap.ts', { cache: 'no-store' });
      const source = await response.text();
      const match = source.match(/"VITE_DISABLE_OLLAMA_BOOTSTRAP"\s*:\s*"([^"]+)"/u);
      return { ok: response.ok, compiledValue: match?.[1] ?? null };
    }),
  );
  assert(
    'official WebView module has VITE_DISABLE_OLLAMA_BOOTSTRAP=true',
    guardValue.ok && guardValue.compiledValue === 'true',
    guardValue,
  );
  await writeJson('vite-ollama-disable-guard.json', guardValue);

  await guarded('deterministic-viewport', () => page.setViewportSize({ width: 1280, height: 900 }));
  await guarded('semantic-workbench-navigation', async () => {
    if (
      new URL(page.url()).searchParams.get('route') !== 'workbench' ||
      (await page.getByTestId('workbench-browser-panel').count()) === 0
    ) {
      await page.getByRole('button', { name: 'Workbench', exact: true }).click();
    }
    await page.waitForFunction(
      () =>
        new URL(location.href).searchParams.get('route') === 'workbench' &&
        document.querySelector('[data-testid="workbench-browser-panel"]'),
      null,
      { timeout: 20_000 },
    );
  });

  const panel = page.getByTestId('workbench-browser-panel');
  const address = panel.getByRole('textbox', { name: 'Browser address' });
  await panel.waitFor({ state: 'visible', timeout: 20_000 });

  const ordinaryPolicies = await guarded('ordinary-remote-delivery-policy', () =>
    page.evaluate(async () => {
      const { browserFramePolicy } = await import('/src/features/workbench/browserSecurity.ts');
      return ['https://example.com/', 'https://www.wikipedia.org/'].map((url) => ({
        url,
        ...browserFramePolicy(url),
      }));
    }),
  );
  assert(
    'ordinary remote sites are system-browser-only with generic sandbox and no embed',
    ordinaryPolicies.every(
      (policy) =>
        policy.delivery === 'system-browser' &&
        policy.frameBlocked === true &&
        policy.usedEmbed === false &&
        !policy.sandbox.includes('allow-same-origin'),
    ),
    { ordinaryPolicies },
  );

  if (!(await panel.getByTestId('workbench-browser-external').isVisible().catch(() => false))) {
    await guarded('seed-ordinary-remote-state-without-native-shell-launch', async () => {
      await page.evaluate(async () => {
        const { useWorkbenchStore } = await import('/src/features/workbench/store.ts');
        const state = useWorkbenchStore.getState();
        const browserPanel = state.panels.find((candidate) => candidate.kind === 'browser');
        if (!browserPanel) throw new Error('Workbench browser panel is missing.');
        state.updatePanel(browserPanel.id, {
          settings: { ...browserPanel.settings, url: 'https://example.com/' },
          status: 'ready',
        });
      });
    });
    await guarded('semantic-workbench-remount-for-fresh-history', async () => {
      await page.evaluate(() => {
        const url = new URL(location.href);
        url.searchParams.set('route', 'chat');
        history.pushState(null, '', url);
        dispatchEvent(new PopStateEvent('popstate'));
      });
      await page.waitForFunction(
        () => new URL(location.href).searchParams.get('route') === 'chat',
        null,
        { timeout: 20_000 },
      );
      await page.evaluate(() => {
        const url = new URL(location.href);
        url.searchParams.set('route', 'workbench');
        history.pushState(null, '', url);
        dispatchEvent(new PopStateEvent('popstate'));
      });
      await page.waitForFunction(
        () =>
          new URL(location.href).searchParams.get('route') === 'workbench' &&
          document.querySelector('[data-testid="workbench-browser-external"]'),
        null,
        { timeout: 20_000 },
      );
    });
  }

  const externalUi = {
    address: await address.inputValue(),
    status: await panel.getByTestId('workbench-browser-external').innerText(),
    iframeCount: await panel.locator('iframe').count(),
  };
  assert(
    'visible ordinary-remote handoff uses the normal browser state with zero iframe',
    /^https:\/\//u.test(externalUi.address) &&
      /Ready in your normal browser/u.test(externalUi.status) &&
      externalUi.iframeCount === 0,
    externalUi,
  );
  await shot(panel, '10-ordinary-remote-system-handoff-no-launch.png');

  async function navigate(label, url, expectation) {
    await guarded(`address-entry:${label}`, async () => {
      await address.fill(url);
      await address.press('Enter');
      if (expectation === 'embed') {
        await panel.locator('iframe').waitFor({ state: 'visible', timeout: 30_000 });
        await panel.getByText(/Loading(?: embed)?…/u).waitFor({ state: 'hidden', timeout: 30_000 });
      }
    });
  }

  const youtubeConsoleStart = report.console.length;
  await navigate('youtube-watch', YOUTUBE_WATCH_URL, 'embed');
  let ytIframe = panel.locator('iframe');
  let ytFrame = await frameMatching(/youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/u);
  await waitPlayer(ytFrame);

  const youtubeDom = await ytFrame.evaluate(() => {
    const player = document.querySelector('#movie_player')?.getBoundingClientRect();
    const play = document.querySelector('.ytp-large-play-button')?.getBoundingClientRect();
    const thumbnail = document.querySelector('.ytp-cued-thumbnail-overlay-image');
    return {
      documentTitle: document.title,
      player: player ? { width: player.width, height: player.height } : null,
      playButton: play ? { width: play.width, height: play.height } : null,
      thumbnailBackground: thumbnail ? getComputedStyle(thumbnail).backgroundImage : null,
      visibleTitle: (
        document.querySelector('.ytp-title-link, .ytp-title-text')?.textContent ?? ''
      )
        .replace(/\s+/g, ' ')
        .trim(),
      errorText: (document.querySelector('.ytp-error')?.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim(),
    };
  });
  const youtube = {
    address: await address.inputValue(),
    iframeSrc: await ytIframe.getAttribute('src'),
    sandbox: await ytIframe.getAttribute('sandbox'),
    allow: await ytIframe.getAttribute('allow'),
    frameUrl: ytFrame.url(),
    dom: youtubeDom,
  };
  assert(
    'YouTube watch URL uses the privacy embed and dedicated trusted-media sandbox',
    youtube.address === YOUTUBE_WATCH_URL &&
      youtube.iframeSrc === YOUTUBE_EMBED_URL &&
      youtube.frameUrl === YOUTUBE_EMBED_URL &&
      youtube.sandbox ===
        'allow-forms allow-modals allow-popups allow-scripts allow-same-origin',
    youtube,
  );
  assert(
    'YouTube player has visible player/play-button/thumbnail content with no error overlay',
    youtubeDom.player?.width >= 300 &&
      youtubeDom.player?.height >= 150 &&
      youtubeDom.playButton?.width > 0 &&
      youtubeDom.playButton?.height > 0 &&
      /ytimg\.com/iu.test(youtubeDom.thumbnailBackground ?? '') &&
      youtubeDom.errorText === '',
    youtubeDom,
  );
  await shot(panel, '11-youtube-player-rendered.png');
  const framePath = await shot(ytIframe, '12-youtube-frame-rendered.png');
  const firstPixels = await pixels(framePath);
  assert(
    'YouTube frame has substantial non-black, high-variance rendered pixels',
    firstPixels.nearBlackRatio < 0.85 &&
      firstPixels.meanLuma > 20 &&
      firstPixels.lumaStdDev > 15,
    firstPixels,
  );

  const oldFrame = ytFrame;
  await guarded('youtube-reload', async () => {
    await panel.getByRole('button', { name: 'Reload browser' }).click();
    await panel.locator('iframe').waitFor({ state: 'visible', timeout: 30_000 });
    await panel.getByText(/Loading embed…/u).waitFor({ state: 'hidden', timeout: 30_000 });
  });
  ytIframe = panel.locator('iframe');
  ytFrame = await frameMatching(/youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/u, oldFrame);
  await waitPlayer(ytFrame);
  const reloadPath = await shot(ytIframe, '13-youtube-reload-rendered.png');
  const reloadPixels = await pixels(reloadPath);
  assert(
    'reload restores a visible non-black YouTube player',
    reloadPixels.nearBlackRatio < 0.85 &&
      reloadPixels.meanLuma > 20 &&
      reloadPixels.lumaStdDev > 15,
    reloadPixels,
  );

  await navigate('loopback-refused', REFUSED_URL, 'embed');
  let refusedFrame = await frameMatching(/chrome-error:\/\/chromewebdata\//u);
  const refusal = {
    address: await address.inputValue(),
    iframeSrc: await panel.locator('iframe').getAttribute('src'),
    frameUrl: refusedFrame.url(),
    classification:
      'Loopback remains intentionally embedded; chrome-error://chromewebdata/ is a connection-refused transport error, not iframe policy.',
  };
  assert(
    'loopback refusal reaches the WebView transport-error document',
    refusal.address === REFUSED_URL &&
      refusal.iframeSrc === REFUSED_URL &&
      refusal.frameUrl === 'chrome-error://chromewebdata/',
    refusal,
  );
  await shot(panel, '14-loopback-refused.png');

  await guarded('history-back-to-youtube', async () => {
    await panel.getByRole('button', { name: 'Back' }).click();
    await page.waitForFunction(
      (expected) => document.querySelector('[aria-label="Browser address"]')?.value === expected,
      YOUTUBE_WATCH_URL,
      { timeout: 20_000 },
    );
  });
  let recoveryFrame = await frameMatching(/youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/u);
  await waitPlayer(recoveryFrame);
  const backAddress = await address.inputValue();
  await shot(panel, '15-back-recovery-youtube.png');

  await guarded('history-forward-to-refusal', async () => {
    await panel.getByRole('button', { name: 'Forward' }).click();
    await page.waitForFunction(
      (expected) => document.querySelector('[aria-label="Browser address"]')?.value === expected,
      REFUSED_URL,
      { timeout: 20_000 },
    );
  });
  refusedFrame = await frameMatching(/chrome-error:\/\/chromewebdata\//u);
  const forwardAddress = await address.inputValue();

  await guarded('final-back-recovery', async () => {
    await panel.getByRole('button', { name: 'Back' }).click();
    await page.waitForFunction(
      (expected) => document.querySelector('[aria-label="Browser address"]')?.value === expected,
      YOUTUBE_WATCH_URL,
      { timeout: 20_000 },
    );
  });
  const finalFrame = await frameMatching(/youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/u);
  await waitPlayer(finalFrame);
  await shot(panel, '16-final-youtube-recovery-running.png');
  assert(
    'back/forward/recovery history preserves exact normalized addresses',
    backAddress === YOUTUBE_WATCH_URL && forwardAddress === REFUSED_URL,
    { backAddress, forwardAddress, finalAddress: await address.inputValue() },
  );

  const relevantConsole = report.console.slice(youtubeConsoleStart);
  const sandboxFailures = relevantConsole.filter((entry) =>
    /cache storage.*(?:disabled|sandbox)|lacks allow-same-origin|writeEmbed|SecurityError.*cache/iu.test(
      entry.text,
    ),
  );
  assert(
    'trusted-media retest has zero Cache Storage/writeEmbed sandbox failures',
    sandboxFailures.length === 0,
    { sandboxFailures },
  );

  const endHead = git('rev-parse', 'HEAD');
  const endTargetIsAncestor = gitSucceeds('merge-base', '--is-ancestor', EXPECTED_HEAD, endHead);
  const endWorkbenchSourceMatchesTarget = gitSucceeds(
    'diff',
    '--quiet',
    `${EXPECTED_HEAD}..${endHead}`,
    '--',
    ...WORKBENCH_SOURCE_PATHS,
  );
  assert(
    'exact repaired Workbench source remained anchored to 6716df35 throughout the retest',
    endTargetIsAncestor && endWorkbenchSourceMatchesTarget,
    {
      startHead,
      endHead,
      targetWorkbenchCommit: EXPECTED_HEAD,
      targetIsAncestor: endTargetIsAncestor,
      workbenchSourceMatchesTarget: endWorkbenchSourceMatchesTarget,
    },
  );

  report.workbench = {
    ordinaryPolicies,
    externalUi,
    youtube: { ...youtube, firstPixels, reloadPixels, sandboxFailures },
    refusal,
    history: { backAddress, forwardAddress },
    finalAddress: await address.inputValue(),
  };
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = clean(error?.stack || error);
  if (page) {
    try {
      await shot(page, 'FAIL-workbench-retest-v2.png');
    } catch {
      // Preserve primary failure.
    }
  }
} finally {
  if (page && originalViewport) {
    try {
      await guarded('restore-viewport', () => page.setViewportSize(originalViewport));
    } catch (error) {
      report.status = 'failed';
      report.cleanupFailure = clean(error?.stack || error);
    }
  }
  if (browser) await browser.close().catch(() => undefined);
}

const after = guard('driver:final');
report.completedAt = new Date().toISOString();
report.finalHead = git('rev-parse', 'HEAD');
report.finalProcess = after;
report.safetySummary = {
  checks: report.safety.length,
  maxOllamaProcesses: Math.max(0, ...report.safety.map((row) => row.ollamaProcessCount)),
  maxListeners11434: Math.max(0, ...report.safety.map((row) => row.listener11434Count)),
};
await writeJson('console-and-page-errors-v2.json', {
  console: report.console,
  pageErrors: report.pageErrors,
});
await writeJson('official-native-v2-after.json', {
  head: report.finalHead,
  jarvisBinarySha256,
  process: after,
});
await writeFile(
  resolve(HERE, 'workbench-retest-report-v2.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);

if (report.status !== 'passed') {
  console.error(JSON.stringify({ status: report.status, failure: report.failure }, null, 2));
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      {
        status: report.status,
        head: report.finalHead,
        assertions: report.assertions.length,
        safety: report.safetySummary,
        youtubePixels: report.workbench.youtube.firstPixels,
        reloadPixels: report.workbench.youtube.reloadPixels,
        sandboxFailures: report.workbench.youtube.sandboxFailures.length,
        finalAddress: report.workbench.finalAddress,
        jarvisPid: report.finalProcess.Jarvis[0]?.ProcessId ?? null,
      },
      null,
      2,
    ),
  );
}
