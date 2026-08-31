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

await mkdir(HERE, { recursive: true });

const report = {
  schemaVersion: 1,
  task: 'PR31-WORKBENCH-TRUSTED-MEDIA-NATIVE-RETEST',
  agent: 'VS-CODEX-NATIVE-ACCEPTANCE-CORRECTIVE-20260828',
  startedAt: new Date().toISOString(),
  expectedHead: EXPECTED_HEAD,
  cdpUrl: CDP_URL,
  status: 'running',
  safety: [],
  console: [],
  pageErrors: [],
  artifacts: [],
  assertions: [],
  externalOpenIntercepts: [],
};

function powershell(script) {
  return execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
  }).trim();
}

function git(...args) {
  return execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim();
}

function processSnapshot() {
  const script = [
    "$jarvis = @(Get-CimInstance Win32_Process | Where-Object Name -eq 'jarvis.exe' | Select-Object Name,ProcessId,ParentProcessId,ExecutablePath,CommandLine)",
    "$webviews = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedgewebview2.exe' -and $_.CommandLine -like '*--webview-exe-name=jarvis.exe*' } | Select-Object Name,ProcessId,ParentProcessId,ExecutablePath,@{n='Cdp9223';e={$_.CommandLine -like '*--remote-debugging-port=9223*'}})",
    "$ollama = @(Get-CimInstance Win32_Process | Where-Object Name -eq 'ollama.exe' | Select-Object Name,ProcessId,ParentProcessId,ExecutablePath,CommandLine)",
    '$listeners11434 = @(Get-NetTCPConnection -State Listen -LocalPort 11434 -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess,State)',
    '$listeners9223 = @(Get-NetTCPConnection -State Listen -LocalPort 9223 -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess,State)',
    '$listeners5173 = @(Get-NetTCPConnection -State Listen -LocalPort 5173 -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess,State)',
    '[pscustomobject]@{ CapturedAt=(Get-Date -Format o); Jarvis=$jarvis; WebViews=$webviews; Listeners9223=$listeners9223; Listeners5173=$listeners5173; Ollama=$ollama; Listeners11434=$listeners11434 } | ConvertTo-Json -Depth 7 -Compress',
  ].join('; ');
  return JSON.parse(powershell(script));
}

function assertNoOllama(label) {
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

function recordAssertion(name, passed, details = {}) {
  const row = { name, passed: Boolean(passed), ...details };
  report.assertions.push(row);
  if (!row.passed) throw new Error(`Assertion failed: ${name}`);
  return row;
}

async function writeJson(name, value) {
  await writeFile(resolve(HERE, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  report.artifacts.push({ name, kind: 'json' });
}

async function guarded(label, action) {
  assertNoOllama(`${label}:before`);
  try {
    return await action();
  } finally {
    assertNoOllama(`${label}:after`);
  }
}

async function screenshot(locator, name) {
  const path = resolve(HERE, name);
  await guarded(`screenshot:${name}`, () => locator.screenshot({ path, animations: 'disabled' }));
  const metadata = await sharp(path).metadata();
  report.artifacts.push({ name, kind: 'png', width: metadata.width, height: metadata.height });
  return path;
}

async function imageRenderMetrics(path) {
  const image = sharp(path).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  let nearBlack = 0;
  let visible = 0;
  let lumaTotal = 0;
  let lumaSquaredTotal = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const red = data[offset] ?? 0;
    const green = data[offset + 1] ?? 0;
    const blue = data[offset + 2] ?? 0;
    const alpha = data[offset + 3] ?? 255;
    if (alpha === 0) continue;
    const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    visible += 1;
    lumaTotal += luma;
    lumaSquaredTotal += luma * luma;
    if (red < 16 && green < 16 && blue < 16) nearBlack += 1;
  }
  const meanLuma = visible ? lumaTotal / visible : 0;
  const variance = visible ? Math.max(0, lumaSquaredTotal / visible - meanLuma ** 2) : 0;
  return {
    width: info.width,
    height: info.height,
    visiblePixels: visible,
    nearBlackRatio: visible ? nearBlack / visible : 1,
    meanLuma,
    lumaStdDev: Math.sqrt(variance),
  };
}

function sanitizeConsole(message) {
  return String(message).replace(/([?&](?:token|key|secret|password)=)[^&\s]+/giu, '$1[redacted]').slice(0, 2_000);
}

const startHead = git('rev-parse', 'HEAD');
recordAssertion('requested HEAD is checked out before retest', startHead === EXPECTED_HEAD, {
  actual: startHead,
  expected: EXPECTED_HEAD,
});

const initialProcess = assertNoOllama('driver:start');
const jarvis = initialProcess.Jarvis[0];
const jarvisBinarySha256 = jarvis?.ExecutablePath
  ? createHash('sha256').update(readFileSync(jarvis.ExecutablePath)).digest('hex').toUpperCase()
  : null;
const cdpRoot = initialProcess.WebViews.find(
  (row) => row.ParentProcessId === jarvis?.ProcessId && row.Cdp9223 === true,
);
recordAssertion('one official jarvis.exe process is running', initialProcess.Jarvis.length === 1, {
  jarvisProcesses: initialProcess.Jarvis,
});
recordAssertion('CDP root WebView is a direct jarvis.exe child', Boolean(cdpRoot), {
  cdpRoot,
});
recordAssertion(
  '127.0.0.1:9223 listener belongs to the jarvis-owned WebView root',
  initialProcess.Listeners9223.some(
    (listener) => listener.LocalAddress === '127.0.0.1' && listener.OwningProcess === cdpRoot?.ProcessId,
  ),
  { listeners: initialProcess.Listeners9223 },
);

await writeJson('official-native-identity-before.json', {
  worktree: git('rev-parse', '--show-toplevel'),
  branch: git('branch', '--show-current'),
  head: startHead,
  upstream: git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'),
  jarvisBinarySha256,
  process: initialProcess,
});

let browser;
let page;
let context;
let originalViewport;
let openerInstalled = false;

try {
  browser = await chromium.connectOverCDP(CDP_URL);
  context = browser.contexts()[0];
  page = context
    ?.pages()
    .find((candidate) => candidate.url().startsWith('http://localhost:5173/'));
  if (!page || !context) throw new Error('Official VibeSpace WebView target was not found on CDP 9223.');

  page.on('console', (message) => {
    report.console.push({
      capturedAt: new Date().toISOString(),
      type: message.type(),
      text: sanitizeConsole(message.text()),
      url: message.location().url || null,
    });
  });
  page.on('pageerror', (error) => {
    report.pageErrors.push({ capturedAt: new Date().toISOString(), message: sanitizeConsole(error) });
  });

  await page.waitForLoadState('domcontentloaded');
  await page.locator('body').waitFor({ state: 'visible', timeout: 30_000 });
  originalViewport = page.viewportSize();

  const viteGuard = await guarded('verify-vite-ollama-disable-guard', async () => {
    return page.evaluate(async () => {
      const response = await fetch('/src/lib/ai/ollamaBootstrap.ts', { cache: 'no-store' });
      const source = await response.text();
      const marker = source.indexOf('VITE_DISABLE_OLLAMA_BOOTSTRAP');
      const excerpt = marker >= 0 ? source.slice(Math.max(0, marker - 180), marker + 360) : '';
      return {
        ok: response.ok,
        markerPresent: marker >= 0,
        compiledTrueNearMarker: /(?:"true"|'true'|`true`)/u.test(excerpt),
        excerpt: excerpt.replace(/\s+/g, ' ').slice(0, 520),
      };
    });
  });
  recordAssertion(
    'Vite runtime has VITE_DISABLE_OLLAMA_BOOTSTRAP=true compiled into the official WebView module',
    viteGuard.ok && viteGuard.markerPresent && viteGuard.compiledTrueNearMarker,
    viteGuard,
  );
  await writeJson('vite-ollama-disable-guard.json', viteGuard);

  await guarded('official-webview-reload-at-exact-head', async () => {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.locator('body').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForFunction(() => document.body.innerText.trim() !== 'Loading…', null, {
      timeout: 30_000,
    });
  });

  await guarded('set-deterministic-viewport', () => page.setViewportSize({ width: 1280, height: 900 }));
  await guarded('open-workbench-route', async () => {
    const panelCount = await page.getByTestId('workbench-browser-panel').count();
    if (
      new URL(page.url()).searchParams.get('route') !== 'workbench' ||
      panelCount === 0
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
  await panel.waitFor({ state: 'visible', timeout: 30_000 });
  const address = panel.getByRole('textbox', { name: 'Browser address' });
  const originalWorkbenchUrl = await address.inputValue();

  await guarded('install-native-shell-open-intercept', async () => {
    await page.evaluate(() => {
      const internals = window.__TAURI_INTERNALS__;
      if (!internals || typeof internals.invoke !== 'function') {
        throw new Error('Official Tauri invoke bridge is unavailable.');
      }
      const original = internals.invoke.bind(internals);
      const calls = [];
      const wrapped = async (command, args, options) => {
        if (command === 'plugin:shell|open') {
          calls.push({ command, path: String(args?.path ?? ''), capturedAt: new Date().toISOString() });
          return null;
        }
        return original(command, args, options);
      };
      Object.defineProperty(window, '__pr31WorkbenchOpenSpy', {
        configurable: true,
        value: { calls, original, wrapped },
      });
      internals.invoke = wrapped;
    });
    openerInstalled = true;
  });

  async function navigate(label, url, expectation) {
    await guarded(`navigate:${label}`, async () => {
      await address.fill(url);
      await address.press('Enter');
      if (expectation === 'external') {
        await panel.getByTestId('workbench-browser-external').waitFor({ state: 'visible' });
        recordAssertion(`${label} has no credentialless iframe`, (await panel.locator('iframe').count()) === 0, {
          url,
        });
      } else if (expectation === 'embed') {
        await panel.locator('iframe').waitFor({ state: 'visible', timeout: 30_000 });
        await panel.getByText(/Loading(?: embed)?…/u).waitFor({ state: 'hidden', timeout: 30_000 });
      }
    });
  }

  await navigate('ordinary-example', 'https://example.com/', 'external');
  const exampleState = {
    address: await address.inputValue(),
    status: await panel.getByTestId('workbench-browser-external').innerText(),
    iframeCount: await panel.locator('iframe').count(),
  };
  await screenshot(panel, '01-ordinary-example-system-handoff.png');

  await navigate('ordinary-wikipedia', 'https://www.wikipedia.org/', 'external');
  const wikipediaState = {
    address: await address.inputValue(),
    status: await panel.getByTestId('workbench-browser-external').innerText(),
    iframeCount: await panel.locator('iframe').count(),
  };
  await screenshot(panel, '02-ordinary-wikipedia-system-handoff.png');

  report.externalOpenIntercepts = await page.evaluate(() =>
    Array.from(window.__pr31WorkbenchOpenSpy?.calls ?? []),
  );
  recordAssertion(
    'ordinary remote navigation requested exactly two native system-browser opens without launching them',
    report.externalOpenIntercepts.length === 2 &&
      report.externalOpenIntercepts[0]?.path === 'https://example.com/' &&
      report.externalOpenIntercepts[1]?.path === 'https://www.wikipedia.org/',
    { calls: report.externalOpenIntercepts },
  );

  await guarded('history-back', async () => {
    await panel.getByRole('button', { name: 'Back' }).click();
    await page.waitForFunction(
      () => document.querySelector('[aria-label="Browser address"]')?.value === 'https://example.com/',
      null,
      { timeout: 20_000 },
    );
  });
  const backAddress = await address.inputValue();
  await guarded('history-forward', async () => {
    await panel.getByRole('button', { name: 'Forward' }).click();
    await page.waitForFunction(
      () =>
        document.querySelector('[aria-label="Browser address"]')?.value ===
        'https://www.wikipedia.org/',
      null,
      { timeout: 20_000 },
    );
  });
  const forwardAddress = await address.inputValue();
  await screenshot(panel, '03-history-back-forward.png');
  recordAssertion('Workbench back and forward preserve normalized address history',
    backAddress === 'https://example.com/' && forwardAddress === 'https://www.wikipedia.org/',
    { backAddress, forwardAddress });

  const youtubeConsoleStart = report.console.length;
  await navigate('youtube-watch-privacy-embed', YOUTUBE_WATCH_URL, 'embed');
  let youtubeIframe = panel.locator('iframe');
  let youtubeFrame = await youtubeIframe.contentFrame();
  if (!youtubeFrame) throw new Error('YouTube child frame was not attached.');
  await youtubeFrame.waitForURL(/youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/u, { timeout: 30_000 });
  await youtubeFrame.locator('#movie_player').waitFor({ state: 'visible', timeout: 30_000 });
  await youtubeFrame.locator('.ytp-large-play-button').waitFor({ state: 'visible', timeout: 30_000 });
  await youtubeFrame.waitForFunction(() => {
    const thumbnail = document.querySelector('.ytp-cued-thumbnail-overlay-image');
    return thumbnail && getComputedStyle(thumbnail).backgroundImage !== 'none';
  }, null, { timeout: 30_000 });

  const youtubeDom = await youtubeFrame.evaluate(() => {
    const player = document.querySelector('#movie_player');
    const playerBox = player?.getBoundingClientRect();
    const play = document.querySelector('.ytp-large-play-button');
    const playBox = play?.getBoundingClientRect();
    const thumbnail = document.querySelector('.ytp-cued-thumbnail-overlay-image');
    const title = document.querySelector('.ytp-title-link, .ytp-title-text')?.textContent ?? '';
    const errorText = document.querySelector('.ytp-error')?.textContent ?? '';
    return {
      title: document.title,
      playerBox: playerBox
        ? { width: playerBox.width, height: playerBox.height, x: playerBox.x, y: playerBox.y }
        : null,
      playButtonBox: playBox
        ? { width: playBox.width, height: playBox.height, x: playBox.x, y: playBox.y }
        : null,
      thumbnailBackground: thumbnail ? getComputedStyle(thumbnail).backgroundImage : null,
      visibleTitle: title.replace(/\s+/g, ' ').trim(),
      errorText: errorText.replace(/\s+/g, ' ').trim(),
    };
  });
  const youtubeAttributes = {
    address: await address.inputValue(),
    iframeSrc: await youtubeIframe.getAttribute('src'),
    sandbox: await youtubeIframe.getAttribute('sandbox'),
    allow: await youtubeIframe.getAttribute('allow'),
    childFrameUrl: youtubeFrame.url(),
    dom: youtubeDom,
  };
  recordAssertion(
    'YouTube watch URL is rewritten to the privacy-enhanced embed with trusted-media sandbox only',
    youtubeAttributes.iframeSrc === YOUTUBE_EMBED_URL &&
      youtubeAttributes.sandbox ===
        'allow-forms allow-modals allow-popups allow-scripts allow-same-origin' &&
      youtubeAttributes.sandbox.includes('allow-same-origin'),
    youtubeAttributes,
  );
  recordAssertion(
    'YouTube player DOM is visibly rendered rather than only titled or navigated',
    youtubeDom.playerBox?.width >= 300 &&
      youtubeDom.playerBox?.height >= 150 &&
      youtubeDom.playButtonBox?.width > 0 &&
      youtubeDom.playButtonBox?.height > 0 &&
      /ytimg\.com/iu.test(youtubeDom.thumbnailBackground ?? '') &&
      youtubeDom.errorText.length === 0,
    youtubeDom,
  );

  const youtubePanelPath = await screenshot(panel, '04-youtube-player-rendered.png');
  const youtubeFramePath = await screenshot(youtubeIframe, '05-youtube-frame-rendered.png');
  const youtubePixels = await imageRenderMetrics(youtubeFramePath);
  recordAssertion(
    'YouTube frame pixels contain substantial non-black, high-variance player content',
    youtubePixels.nearBlackRatio < 0.85 && youtubePixels.meanLuma > 20 && youtubePixels.lumaStdDev > 15,
    youtubePixels,
  );

  const youtubeConsole = report.console.slice(youtubeConsoleStart);
  const targetedSandboxErrors = youtubeConsole.filter((entry) =>
    /cache storage.*(?:disabled|sandbox)|lacks allow-same-origin|writeEmbed|SecurityError.*cache/iu.test(
      entry.text,
    ),
  );
  recordAssertion(
    'YouTube trusted-media render has zero prior Cache Storage/writeEmbed sandbox failures',
    targetedSandboxErrors.length === 0,
    { targetedSandboxErrors },
  );

  const oldFrame = youtubeFrame;
  await guarded('youtube-reload', async () => {
    await panel.getByRole('button', { name: 'Reload browser' }).click();
    await oldFrame.waitForURL(/.*/u).catch(() => undefined);
    await panel.locator('iframe').waitFor({ state: 'visible', timeout: 30_000 });
    await panel.getByText(/Loading embed…/u).waitFor({ state: 'hidden', timeout: 30_000 });
    const nextFrame = await panel.locator('iframe').contentFrame();
    if (!nextFrame) throw new Error('Reloaded YouTube child frame was not attached.');
    await nextFrame.waitForURL(/youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/u, { timeout: 30_000 });
    await nextFrame.locator('#movie_player').waitFor({ state: 'visible', timeout: 30_000 });
    await nextFrame.locator('.ytp-large-play-button').waitFor({ state: 'visible', timeout: 30_000 });
  });
  youtubeIframe = panel.locator('iframe');
  youtubeFrame = await youtubeIframe.contentFrame();
  const reloadedFramePath = await screenshot(youtubeIframe, '06-youtube-reload-rendered.png');
  const reloadPixels = await imageRenderMetrics(reloadedFramePath);
  recordAssertion(
    'Reload produces a second visible non-black YouTube player',
    youtubeFrame?.url() === YOUTUBE_EMBED_URL &&
      reloadPixels.nearBlackRatio < 0.85 &&
      reloadPixels.meanLuma > 20 &&
      reloadPixels.lumaStdDev > 15,
    { frameUrl: youtubeFrame?.url() ?? null, pixels: reloadPixels },
  );

  const refusalConsoleStart = report.console.length;
  await navigate('loopback-refused', REFUSED_URL, 'embed');
  const refusedIframe = panel.locator('iframe');
  const refusedFrame = await refusedIframe.contentFrame();
  if (!refusedFrame) throw new Error('Loopback refusal child frame was not attached.');
  await refusedFrame.waitForURL(/chrome-error:\/\/chromewebdata\//u, { timeout: 30_000 });
  const refusedState = {
    address: await address.inputValue(),
    iframeSrc: await refusedIframe.getAttribute('src'),
    childFrameUrl: refusedFrame.url(),
    console: report.console.slice(refusalConsoleStart),
    classification:
      'The loopback page is intentionally embedded. chrome-error://chromewebdata/ is a transport refusal, not a remote iframe-policy failure.',
  };
  recordAssertion(
    'loopback refusal reaches the browser transport-error document',
    refusedState.address === REFUSED_URL &&
      refusedState.iframeSrc === REFUSED_URL &&
      refusedState.childFrameUrl === 'chrome-error://chromewebdata/',
    refusedState,
  );
  await screenshot(panel, '07-loopback-refused-to-connect.png');

  await navigate('loopback-recovery', 'https://example.com/', 'external');
  const recoveryState = {
    address: await address.inputValue(),
    status: await panel.getByTestId('workbench-browser-external').innerText(),
    iframeCount: await panel.locator('iframe').count(),
  };
  recordAssertion(
    'Workbench recovers from loopback refusal to the ordinary remote handoff state',
    recoveryState.address === 'https://example.com/' &&
      recoveryState.iframeCount === 0 &&
      /Ready in your normal browser/u.test(recoveryState.status),
    recoveryState,
  );
  await screenshot(panel, '08-loopback-refusal-recovery.png');

  await navigate('final-youtube', YOUTUBE_WATCH_URL, 'embed');
  const finalYoutubeFrame = await panel.locator('iframe').contentFrame();
  if (!finalYoutubeFrame) throw new Error('Final YouTube child frame was not attached.');
  await finalYoutubeFrame.locator('#movie_player').waitFor({ state: 'visible', timeout: 30_000 });
  await finalYoutubeFrame.locator('.ytp-large-play-button').waitFor({ state: 'visible', timeout: 30_000 });
  await screenshot(panel, '09-final-workbench-youtube-running.png');

  const finalTargetedSandboxErrors = report.console.filter((entry) =>
    /cache storage.*(?:disabled|sandbox)|lacks allow-same-origin|writeEmbed|SecurityError.*cache/iu.test(
      entry.text,
    ),
  );
  recordAssertion(
    'complete retest has zero Cache Storage/writeEmbed sandbox failures',
    finalTargetedSandboxErrors.length === 0,
    { targetedSandboxErrors: finalTargetedSandboxErrors },
  );

  const endHead = git('rev-parse', 'HEAD');
  recordAssertion('HEAD remained stable for the complete retest', endHead === EXPECTED_HEAD, {
    startHead,
    endHead,
  });

  report.workbench = {
    originalWorkbenchUrl,
    ordinaryRemoteHandoff: [exampleState, wikipediaState],
    history: { backAddress, forwardAddress },
    youtube: {
      attributes: youtubeAttributes,
      renderMetrics: youtubePixels,
      reloadRenderMetrics: reloadPixels,
      targetedSandboxErrors,
    },
    loopbackRefusal: refusedState,
    recovery: recoveryState,
    finalAddress: await address.inputValue(),
  };
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = sanitizeConsole(error?.stack || error);
  if (page) {
    try {
      await screenshot(page, 'FAIL-workbench-retest.png');
    } catch {
      // Preserve the primary failure.
    }
  }
} finally {
  if (page && openerInstalled) {
    try {
      await guarded('restore-native-shell-open-bridge', async () => {
        await page.evaluate(() => {
          const spy = window.__pr31WorkbenchOpenSpy;
          if (spy && window.__TAURI_INTERNALS__) {
            window.__TAURI_INTERNALS__.invoke = spy.original;
            delete window.__pr31WorkbenchOpenSpy;
          }
        });
      });
    } catch (error) {
      report.status = 'failed';
      report.cleanupFailure = sanitizeConsole(error?.stack || error);
    }
  }
  if (page && originalViewport) {
    try {
      await guarded('restore-original-viewport', () => page.setViewportSize(originalViewport));
    } catch (error) {
      report.status = 'failed';
      report.viewportCleanupFailure = sanitizeConsole(error?.stack || error);
    }
  }
  if (browser) await browser.close().catch(() => undefined);
}

const finalProcess = assertNoOllama('driver:final');
report.completedAt = new Date().toISOString();
report.finalProcess = finalProcess;
report.finalHead = git('rev-parse', 'HEAD');
report.safetySummary = {
  checks: report.safety.length,
  maxOllamaProcesses: Math.max(...report.safety.map((row) => row.ollamaProcessCount), 0),
  maxListeners11434: Math.max(...report.safety.map((row) => row.listener11434Count), 0),
};

await writeJson('console-and-page-errors.json', {
  console: report.console,
  pageErrors: report.pageErrors,
});
await writeJson('official-native-identity-after.json', {
  head: report.finalHead,
  jarvisBinarySha256,
  process: finalProcess,
});
await writeFile(resolve(HERE, 'workbench-retest-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

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
        safetyChecks: report.safety.length,
        youtube: report.workbench.youtube,
        finalAddress: report.workbench.finalAddress,
        finalJarvisPid: report.finalProcess.Jarvis[0]?.ProcessId ?? null,
      },
      null,
      2,
    ),
  );
}
