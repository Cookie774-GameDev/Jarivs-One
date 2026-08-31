import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const CDP = 'http://127.0.0.1:9223';
const TARGET = '96959d56';
const YOUTUBE_WATCH = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const YOUTUBE_EMBED = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';
const REFUSED = 'http://127.0.0.1:65534/';
const WORKBENCH_PATHS = [
  'app/src/features/workbench/BrowserPanel.tsx',
  'app/src/features/workbench/BrowserPanel.test.tsx',
  'app/src/features/workbench/browserSecurity.ts',
  'app/src/features/workbench/browserSecurity.test.ts',
];

let browser;
let page;
const report = {
  schemaVersion: 1,
  task: 'PR31-WORKBENCH-REFERRER-NATIVE-RETEST',
  startedAt: new Date().toISOString(),
  status: 'running',
  target: TARGET,
  safety: [],
  assertions: [],
  console: [],
  pageErrors: [],
  artifacts: [],
  prohibitions: {
    productFilesEdited: false,
    modelDispatch: false,
    credentialsEntered: false,
    productionMutation: false,
    externalAccountActionCompleted: false,
    nativeExternalBrowserControlled: false,
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

async function shot(locator, name) {
  const path = resolve(HERE, name);
  await guarded(`screenshot:${name}`, () =>
    locator.screenshot({ path, animations: 'disabled' }),
  );
  const metadata = await sharp(path).metadata();
  report.artifacts.push({ name, width: metadata.width, height: metadata.height });
  return path;
}

async function pixels(path) {
  return pixelBuffer(await sharp(path).toBuffer());
}

async function pixelBuffer(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let visible = 0;
  let nearBlack = 0;
  let youtubeRed = 0;
  let light = 0;
  let lumaTotal = 0;
  let lumaSquared = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const [r, g, b, a = 255] = data.subarray(offset, offset + info.channels);
    if (a === 0) continue;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    visible += 1;
    lumaTotal += luma;
    lumaSquared += luma * luma;
    if (r < 16 && g < 16 && b < 16) nearBlack += 1;
    if (r > 220 && g < 90 && b < 110) youtubeRed += 1;
    if (r > 210 && g > 210 && b > 210) light += 1;
  }
  const meanLuma = visible ? lumaTotal / visible : 0;
  return {
    width: info.width,
    height: info.height,
    nearBlackRatio: visible ? nearBlack / visible : 1,
    youtubeRedRatio: visible ? youtubeRed / visible : 0,
    lightPixelRatio: visible ? light / visible : 0,
    meanLuma,
    lumaStdDev: Math.sqrt(
      visible ? Math.max(0, lumaSquared / visible - meanLuma ** 2) : 0,
    ),
  };
}

async function frameMatching(pattern, excluded = null) {
  const current = page.frames().find((frame) => frame !== excluded && pattern.test(frame.url()));
  if (current) return current;
  return page.waitForEvent('framenavigated', {
    predicate: (frame) => frame !== excluded && pattern.test(frame.url()),
    timeout: 30_000,
  });
}

async function playerState(iframe, frame) {
  await frame.locator('#movie_player').waitFor({ state: 'visible', timeout: 30_000 });
  let observed = null;
  await expect
    .poll(
      async () => {
        const dom = await frame.evaluate(() => {
          const player = document.querySelector('#movie_player')?.getBoundingClientRect();
          return {
            title: document.title,
            player: player ? { width: player.width, height: player.height } : null,
            errorText: (document.querySelector('.ytp-error')?.textContent ?? '')
              .replace(/\s+/gu, ' ')
              .trim(),
          };
        });
        const visiblePixels = await pixelBuffer(
          await iframe.screenshot({ animations: 'disabled' }),
        );
        observed = { ...dom, visiblePixels };
        return Boolean(
          /Rick Astley.*Never Gonna Give You Up/iu.test(dom.title) &&
            dom.player?.width >= 300 &&
            dom.player?.height >= 150 &&
            !/Video player configuration error|Error\s*153/iu.test(dom.errorText) &&
            visiblePixels.nearBlackRatio < 0.85 &&
            visiblePixels.lumaStdDev > 15 &&
            visiblePixels.youtubeRedRatio > 0.001 &&
            visiblePixels.lightPixelRatio > 0.005,
        );
      },
      { timeout: 30_000, message: 'waiting for visible titled thumbnail and red play control' },
    )
    .toBe(true);
  return observed;
}

const startHead = git('rev-parse', 'HEAD');
const targetIsAncestor = gitOk('merge-base', '--is-ancestor', TARGET, startHead);
const sourceMatches = gitOk('diff', '--quiet', `${TARGET}..${startHead}`, '--', ...WORKBENCH_PATHS);
assert('repair target is an ancestor and exact Workbench files have zero descendant diff', targetIsAncestor && sourceMatches, {
  target: TARGET,
  startHead,
  targetIsAncestor,
  sourceMatches,
  paths: WORKBENCH_PATHS,
});

const before = guard('driver:start');
try {
  assert('exactly one official jarvis process is running', before.Jarvis.length === 1, {
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
    report.console.push({ type: message.type(), text: message.text().slice(0, 4_000) }),
  );
  page.on('pageerror', (error) => report.pageErrors.push({ message: String(error).slice(0, 2_000) }));

  await guarded('open-workbench-public-navigation', async () => {
    if ((await page.getByTestId('workbench-browser-panel').count()) === 0) {
      await page.getByRole('button', { name: 'Workbench', exact: true }).click();
    }
    await page.getByTestId('workbench-browser-panel').waitFor({ state: 'visible' });
  });
  const panel = page.getByTestId('workbench-browser-panel');
  let address = panel.getByRole('textbox', { name: 'Browser address' });

  const ordinaryPolicies = await guarded('ordinary-remote-policy', () =>
    page.evaluate(async () => {
      const { browserFramePolicy } = await import('/src/features/workbench/browserSecurity.ts');
      return ['https://example.com/', 'https://www.wikipedia.org/'].map((url) => ({
        url,
        ...browserFramePolicy(url),
      }));
    }),
  );
  assert(
    'ordinary remote pages remain no-referrer system-browser handoffs with no approved embed',
    ordinaryPolicies.every(
      (policy) =>
        policy.delivery === 'system-browser' &&
        policy.frameBlocked === true &&
        policy.usedEmbed === false &&
        policy.referrerPolicy === 'no-referrer' &&
        !policy.sandbox.includes('allow-same-origin'),
    ),
    { ordinaryPolicies },
  );

  await guarded('seed-visible-external-handoff-without-native-launch', async () => {
    await page.evaluate(async () => {
      const { useWorkbenchStore } = await import('/src/features/workbench/store.ts');
      const state = useWorkbenchStore.getState();
      const browserPanel = state.panels.find((candidate) => candidate.kind === 'browser');
      if (!browserPanel) throw new Error('Browser panel missing');
      state.updatePanel(browserPanel.id, {
        settings: { ...browserPanel.settings, url: 'https://example.com/' },
        status: 'ready',
      });
      await state.flushPersistence();
    });
    await page.evaluate(() => {
      const url = new URL(location.href);
      url.searchParams.set('route', 'chat');
      history.pushState(null, '', url);
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.getByRole('textbox', { name: 'Message' }).waitFor({ state: 'visible' });
    await wake();
    await page.getByRole('button', { name: 'Workbench', exact: true }).click();
    await page.getByTestId('workbench-browser-external').waitFor({ state: 'visible' });
  });
  address = panel.getByRole('textbox', { name: 'Browser address' });
  const external = {
    address: await address.inputValue(),
    status: await page.getByTestId('workbench-browser-external').innerText(),
    iframeCount: await panel.locator('iframe').count(),
  };
  assert(
    'visible ordinary-site state is a normal-browser handoff with zero iframe',
    external.address === 'https://example.com/' &&
      /Ready in your normal browser/u.test(external.status) &&
      external.iframeCount === 0,
    external,
  );
  await shot(panel, '01-ordinary-external-handoff-no-launch.png');

  async function navigate(label, url) {
    await guarded(`address:${label}`, async () => {
      await address.fill(url);
      await address.press('Enter');
      await panel.locator('iframe').waitFor({ state: 'visible', timeout: 30_000 });
    });
  }

  async function activateBrowserControl(name) {
    const control = panel.getByRole('button', { name });
    await control.focus();
    await page.keyboard.press('Enter');
  }

  const youtubeConsoleStart = report.console.length;
  await navigate('youtube-watch', YOUTUBE_WATCH);
  let iframe = panel.locator('iframe');
  let frame = await frameMatching(/youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/u);
  let state = await playerState(iframe, frame);
  const youtube = {
    address: await address.inputValue(),
    iframeSrc: await iframe.getAttribute('src'),
    sandbox: await iframe.getAttribute('sandbox'),
    referrerPolicy: await iframe.getAttribute('referrerpolicy'),
    frameUrl: frame.url(),
    state,
  };
  assert(
    'YouTube watch uses privacy embed, trusted-media sandbox, and strict-origin referrer',
    youtube.address === YOUTUBE_WATCH &&
      youtube.iframeSrc === YOUTUBE_EMBED &&
      youtube.frameUrl === YOUTUBE_EMBED &&
      youtube.sandbox === 'allow-forms allow-modals allow-popups allow-scripts allow-same-origin' &&
      youtube.referrerPolicy === 'strict-origin-when-cross-origin',
    youtube,
  );
  assert(
    'approved media renders player controls and thumbnail with no Error 153',
    state.player?.width >= 300 &&
      state.player?.height >= 150 &&
      state.visiblePixels.youtubeRedRatio > 0.001 &&
      !/Error\s*153/iu.test(state.errorText),
    state,
  );
  const framePath = await shot(iframe, '02-youtube-player-rendered.png');
  const firstPixels = await pixels(framePath);
  assert(
    'approved media has substantial non-black high-variance pixels',
    firstPixels.nearBlackRatio < 0.85 && firstPixels.meanLuma > 20 && firstPixels.lumaStdDev > 15,
    firstPixels,
  );

  const oldFrame = frame;
  await guarded('reload-youtube', () =>
    activateBrowserControl('Reload browser'),
  );
  frame = await frameMatching(/youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/u, oldFrame);
  iframe = panel.locator('iframe');
  state = await playerState(iframe, frame);
  const reloadPath = await shot(iframe, '03-youtube-reload-rendered.png');
  const reloadPixels = await pixels(reloadPath);
  assert(
    'reload restores playable YouTube content without Error 153',
    !/Error\s*153/iu.test(state.errorText) &&
      reloadPixels.nearBlackRatio < 0.85 &&
      reloadPixels.lumaStdDev > 15,
    { state, reloadPixels },
  );

  await navigate('loopback-refused', REFUSED);
  let refusedFrame = await frameMatching(/chrome-error:\/\/chromewebdata\//u);
  const refusal = {
    address: await address.inputValue(),
    iframeSrc: await panel.locator('iframe').getAttribute('src'),
    frameUrl: refusedFrame.url(),
    classification: 'loopback transport refusal, not remote iframe policy',
  };
  assert(
    'loopback refusal reaches the WebView transport error document',
    refusal.address === REFUSED &&
      refusal.iframeSrc === REFUSED &&
      refusal.frameUrl === 'chrome-error://chromewebdata/',
    refusal,
  );
  await shot(panel, '04-loopback-refused.png');

  await guarded('back-to-youtube', () => activateBrowserControl('Back'));
  await page.waitForFunction(
    (expected) => document.querySelector('[aria-label="Browser address"]')?.value === expected,
    YOUTUBE_WATCH,
  );
  frame = await frameMatching(/youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/u);
  state = await playerState(panel.locator('iframe'), frame);
  assert('back recovers playable approved media', !/Error\s*153/iu.test(state.errorText), state);
  await shot(panel, '05-back-youtube-recovery.png');

  await guarded('forward-to-refusal', () => activateBrowserControl('Forward'));
  await page.waitForFunction(
    (expected) => document.querySelector('[aria-label="Browser address"]')?.value === expected,
    REFUSED,
  );
  refusedFrame = await frameMatching(/chrome-error:\/\/chromewebdata\//u);
  assert('forward restores exact refused loopback state', refusedFrame.url() === 'chrome-error://chromewebdata/');

  await guarded('final-back-to-youtube', () => activateBrowserControl('Back'));
  await page.waitForFunction(
    (expected) => document.querySelector('[aria-label="Browser address"]')?.value === expected,
    YOUTUBE_WATCH,
  );
  frame = await frameMatching(/youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/u);
  state = await playerState(panel.locator('iframe'), frame);
  assert('final recovery remains playable and Error-153-free', !/Error\s*153/iu.test(state.errorText), state);
  await shot(panel, '06-final-youtube-recovery.png');

  const relevantConsole = report.console.slice(youtubeConsoleStart);
  const referrerFailures = relevantConsole.filter((entry) =>
    /Error\s*153|embedder\.identity\.missing\.referrer/iu.test(entry.text),
  );
  const sandboxFailures = relevantConsole.filter((entry) =>
    /cache storage.*(?:disabled|sandbox)|lacks allow-same-origin|writeEmbed|SecurityError.*cache/iu.test(entry.text),
  );
  assert('console has zero Error 153 or missing-referrer evidence', referrerFailures.length === 0, {
    referrerFailures,
  });
  assert('console has zero legacy Cache Storage/writeEmbed sandbox errors', sandboxFailures.length === 0, {
    sandboxFailures,
  });

  const endHead = git('rev-parse', 'HEAD');
  const endTargetIsAncestor = gitOk('merge-base', '--is-ancestor', TARGET, endHead);
  const endSourceMatches = gitOk('diff', '--quiet', `${TARGET}..${endHead}`, '--', ...WORKBENCH_PATHS);
  assert('Workbench source remains zero-diff from repair target at completion', endTargetIsAncestor && endSourceMatches, {
    endHead,
    endTargetIsAncestor,
    endSourceMatches,
  });

  report.status = 'passed';
  report.workbench = {
    ordinaryPolicies,
    external,
    youtube: { ...youtube, firstPixels, reloadPixels },
    refusal,
    history: { back: YOUTUBE_WATCH, forward: REFUSED, final: await address.inputValue() },
    referrerFailures,
    sandboxFailures,
  };
} catch (error) {
  report.status = 'failed';
  report.failure = String(error?.stack ?? error);
  if (page) {
    try {
      await shot(page, 'FAIL-workbench-referrer-retest.png');
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
    resolve(HERE, 'workbench-referrer-native-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
  if (browser) await browser.close();
}

if (report.status !== 'passed') process.exitCode = 1;
