import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import {
  attachOfficialNative,
  sanitizeEvidence,
} from '../../scripts/pr31-native-acceptance-harness.mjs';

const expectedHead = process.env.EXPECTED_HEAD;
if (!expectedHead) throw new Error('expected_head_required');
const actualHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (actualHead !== expectedHead) {
  throw new Error(`immutable_head_mismatch:${expectedHead}:${actualHead}`);
}
const evidenceDir = path.resolve(
  `.codex-evidence/pr31-siyuan-rlm-native-acceptance-20260828/workbench-${expectedHead.slice(0, 8)}-${process.env.RUN_LABEL ?? 'latest'}`,
);
await fs.mkdir(evidenceDir, { recursive: true });
const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const EMBED = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';
const REFUSED = 'http://127.0.0.1:65534/';
const consoleMessages = [];
const pageErrors = [];
const assertions = [];

function assert(name, passed, details = {}) {
  const record = { name, passed: Boolean(passed), ...details };
  assertions.push(record);
  if (!record.passed) throw new Error(`Assertion failed: ${name}`);
}

async function capture(locator, name) {
  const file = path.join(evidenceDir, name);
  await locator.screenshot({ path: file, animations: 'disabled' });
  return file;
}

const attachment = await attachOfficialNative({
  chromium,
  jarvisPid: Number(process.env.JARVIS_PID ?? '9084'),
  cdpPort: 9223,
});

let report;
try {
  const page = attachment.page;
  page.on('console', (message) =>
    consoleMessages.push({ type: message.type(), text: message.text().slice(0, 2_000) }),
  );
  page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 2_000)));

  if (new URL(page.url()).searchParams.get('route') !== 'workbench') {
    await page.getByRole('button', { name: 'Workbench', exact: true }).click();
    await page.waitForURL((url) => url.searchParams.get('route') === 'workbench');
  }
  if ((await page.getByTestId('workbench-browser-panel').count()) === 0) {
    await page.getByRole('button', { name: 'Add Browser', exact: true }).click();
  }
  const panel = page.getByTestId('workbench-browser-panel');
  await panel.waitFor({ state: 'visible' });
  const address = panel.getByRole('textbox', { name: 'Browser address' });

  const ordinarySites = [
    { label: 'vibespaceos', url: 'https://vibespaceos.com/' },
    { label: 'amazon', url: 'https://www.amazon.com/' },
    { label: 'wikipedia', url: 'https://www.wikipedia.org/' },
    { label: 'example', url: 'https://example.com/' },
  ];
  const policies = await page.evaluate(async (sites) => {
    const { browserFramePolicy } = await import('/src/features/workbench/browserSecurity.ts');
    return sites.map(({ label, url }) => ({
      label,
      url,
      ...browserFramePolicy(url),
    }));
  }, ordinarySites);
  assert(
    'ordinary sites use truthful system-browser handoff, not iframe embedding',
    policies.every(
      (policy) =>
        policy.delivery === 'system-browser' &&
        policy.frameBlocked === true &&
        policy.usedEmbed === false &&
        policy.referrerPolicy === 'no-referrer',
    ),
    { policies },
  );

  const ordinaryStates = [];
  for (const [index, site] of ordinarySites.entries()) {
    await address.fill(site.url);
    await address.press('Enter');
    const external = page.getByTestId('workbench-browser-external');
    await external.waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForFunction(
      (expected) => document.querySelector('[aria-label="Browser address"]')?.value === expected,
      site.url,
    );
    const state = {
      ...site,
      address: await address.inputValue(),
      text: await external.innerText(),
      iframeCount: await panel.locator('iframe').count(),
      classification:
        'remote site is not embedded because site-controlled CSP/X-Frame-Options cannot be bypassed safely; VibeSpace exposes a truthful normal-browser handoff without launching it during this acceptance pass',
    };
    ordinaryStates.push(state);
    assert(
      `${site.label} typed navigation reaches stable truthful handoff with zero iframe`,
      state.address === site.url &&
        /Ready in your normal browser/u.test(state.text) &&
        state.iframeCount === 0,
      state,
    );
    await capture(
      panel,
      `01-${String(index + 1).padStart(2, '0')}-${site.label}-system-browser-handoff.png`,
    );
  }

  async function navigate(url) {
    await address.fill(url);
    await address.press('Enter');
    await panel.locator('iframe').waitFor({ state: 'visible', timeout: 30_000 });
  }
  async function waitForFrame(pattern, excluded) {
    const existing = page.frames().find((frame) => frame !== excluded && pattern.test(frame.url()));
    if (existing) return existing;
    return page.waitForEvent('framenavigated', {
      predicate: (frame) => frame !== excluded && pattern.test(frame.url()),
      timeout: 30_000,
    });
  }
  async function activate(name) {
    const button = panel.getByRole('button', { name });
    await button.focus();
    await page.keyboard.press('Enter');
  }
  async function waitForYoutube(excluded) {
    const frame = await waitForFrame(/youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/u, excluded);
    await frame.locator('#movie_player').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForFunction(
      () => {
        const frameElement = document.querySelector('[data-testid="workbench-browser-panel"] iframe');
        return Boolean(frameElement?.getBoundingClientRect().width > 300);
      },
      undefined,
      { timeout: 30_000 },
    );
    return frame;
  }

  await navigate(YOUTUBE);
  let iframe = panel.locator('iframe');
  let youtubeFrame = await waitForYoutube();
  const youtubeState = {
    address: await address.inputValue(),
    src: await iframe.getAttribute('src'),
    sandbox: await iframe.getAttribute('sandbox'),
    referrerPolicy: await iframe.getAttribute('referrerpolicy'),
    frameUrl: youtubeFrame.url(),
    title: await youtubeFrame.title(),
    errorText: await youtubeFrame.locator('.ytp-error').textContent().catch(() => ''),
  };
  assert(
    'YouTube watch URL becomes approved privacy embed with required sandbox/referrer',
    youtubeState.address === YOUTUBE &&
      youtubeState.src === EMBED &&
      youtubeState.frameUrl === EMBED &&
      youtubeState.sandbox ===
        'allow-forms allow-modals allow-popups allow-scripts allow-same-origin' &&
      youtubeState.referrerPolicy === 'strict-origin-when-cross-origin',
    youtubeState,
  );
  assert('YouTube player renders without Error 153', !/Error\s*153/iu.test(youtubeState.errorText), {
    title: youtubeState.title,
    errorText: youtubeState.errorText,
  });
  await capture(panel, '02-youtube-approved-embed.png');

  const priorFrame = youtubeFrame;
  await activate('Reload browser');
  youtubeFrame = await waitForYoutube(priorFrame);
  const reloadError = await youtubeFrame.locator('.ytp-error').textContent().catch(() => '');
  assert('reload restores approved YouTube without Error 153', !/Error\s*153/iu.test(reloadError), {
    reloadError,
  });
  await capture(panel, '03-youtube-reloaded.png');

  await navigate(REFUSED);
  let refusedFrame = await waitForFrame(/chrome-error:\/\/chromewebdata\//u);
  assert(
    'loopback transport refusal renders real WebView error state',
    (await address.inputValue()) === REFUSED && refusedFrame.url() === 'chrome-error://chromewebdata/',
    { address: await address.inputValue(), frameUrl: refusedFrame.url() },
  );
  await capture(panel, '04-loopback-refused.png');

  await activate('Back');
  await page.waitForFunction(
    (expected) => document.querySelector('[aria-label="Browser address"]')?.value === expected,
    YOUTUBE,
  );
  youtubeFrame = await waitForYoutube();
  assert('back recovers the approved YouTube embed', youtubeFrame.url() === EMBED, {
    frameUrl: youtubeFrame.url(),
  });
  await capture(panel, '05-back-recovered-youtube.png');

  await activate('Forward');
  await page.waitForFunction(
    (expected) => document.querySelector('[aria-label="Browser address"]')?.value === expected,
    REFUSED,
  );
  refusedFrame = await waitForFrame(/chrome-error:\/\/chromewebdata\//u);
  assert('forward restores exact refusal state', refusedFrame.url() === 'chrome-error://chromewebdata/');

  await activate('Back');
  await page.waitForFunction(
    (expected) => document.querySelector('[aria-label="Browser address"]')?.value === expected,
    YOUTUBE,
  );
  youtubeFrame = await waitForYoutube();
  assert('final recovery returns to approved media', youtubeFrame.url() === EMBED);
  await capture(panel, '06-final-recovery.png');

  const relevantErrors = consoleMessages.filter((entry) =>
    /Error\s*153|embedder\.identity\.missing\.referrer|lacks allow-same-origin/iu.test(entry.text),
  );
  assert('console has no known YouTube/referrer/sandbox regression', relevantErrors.length === 0, {
    relevantErrors,
  });
  report = {
    status: 'passed',
    capturedAt: new Date().toISOString(),
    commit: expectedHead,
    assertions,
    ordinaryStates,
    consoleMessages,
    pageErrors,
  };
} catch (error) {
  const page = attachment.page;
  await page.screenshot({
    path: path.join(evidenceDir, 'FAIL-workbench-native-smoke.png'),
    fullPage: true,
  }).catch(() => {});
  report = {
    status: 'failed',
    capturedAt: new Date().toISOString(),
    commit: expectedHead,
    failure: String(error?.stack ?? error),
    assertions,
    consoleMessages,
    pageErrors,
  };
} finally {
  await fs.writeFile(
    path.join(evidenceDir, 'workbench-native-report.json'),
    `${JSON.stringify(sanitizeEvidence(report), null, 2)}\n`,
  );
  await attachment.browser.close();
}

process.stdout.write(`${JSON.stringify(sanitizeEvidence(report), null, 2)}\n`);
if (report.status !== 'passed') process.exitCode = 1;
