import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT = resolve(HERE, process.env.RUN_LABEL ?? 'plugin-hosted-latest');
const HEAD = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const EXPECTED_HEAD = process.env.EXPECTED_HEAD ?? '';
const report = { status: 'running', head: HEAD, startedAt: new Date().toISOString(), providers: [], assertions: [], artifacts: [], console: [], pageErrors: [], safety: [] };
let browser;
let page;

function ps(script) { return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 20000 }).trim(); }
function safe(label) { const value = JSON.parse(ps("$o=@(Get-CimInstance Win32_Process|? Name -eq 'ollama.exe');$p=@(Get-NetTCPConnection -State Listen -LocalPort 11434 -ErrorAction SilentlyContinue);[pscustomobject]@{ollama=$o.Count;port11434=$p.Count}|ConvertTo-Json -Compress")); report.safety.push({ label, ...value }); if (value.ollama || value.port11434) throw new Error(`forbidden_ollama:${label}`); }
function check(name, passed, details = {}) { report.assertions.push({ name, passed: Boolean(passed), ...details }); if (!passed) throw new Error(`assertion_failed:${name}`); }
async function shot(name, locator) { const target = resolve(OUT, name); await page.screenshot({ timeout: 1000 }).catch(() => undefined); await (locator ?? page).screenshot({ path: target, animations: 'disabled' }); const meta = await sharp(target).metadata(); report.artifacts.push({ name, width: meta.width, height: meta.height }); }
function sanitizedLinks(locator) { return locator.locator('a[href]').evaluateAll((links) => links.map((link) => { try { const url = new URL(link.href); return { origin: url.origin, path: url.pathname, text: link.textContent?.trim() }; } catch { return { origin: 'invalid', path: '', text: link.textContent?.trim() }; } })); }

await mkdir(OUT, { recursive: true });
try {
  if (!EXPECTED_HEAD || HEAD !== EXPECTED_HEAD) throw new Error(`immutable_head_mismatch:${EXPECTED_HEAD}:${HEAD}`);
  safe('start');
  browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
  page = browser.contexts().flatMap((context) => context.pages()).find((candidate) => candidate.url().includes('localhost:5173'));
  check('official VibeSpace page attached', Boolean(page), { url: page?.url() });
  page.on('console', (message) => report.console.push({ type: message.type(), text: message.text().slice(0, 2000) }));
  page.on('pageerror', (error) => report.pageErrors.push(String(error).slice(0, 2000)));
  if (new URL(page.url()).searchParams.get('route') !== 'chat') {
    await page.getByRole('button', { name: 'Chat', exact: true }).click();
    await page.waitForURL((url) => url.searchParams.get('route') === 'chat');
  }
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog').filter({ hasText: 'Configure providers' });
  await settings.waitFor({ state: 'visible' });
  await settings.getByRole('tab', { name: 'Plugins', exact: true }).click();
  const search = settings.getByRole('textbox', { name: 'Search plugins' });
  await search.waitFor({ state: 'visible' });

  for (const provider of [{ id: 'github', name: 'GitHub' }, { id: 'supabase', name: 'Supabase' }, { id: 'gmail', name: 'Gmail' }]) {
    await search.fill(provider.name);
    const card = settings.getByTestId(`plugin-card-${provider.id}`);
    await card.waitFor({ state: 'visible', timeout: 30000 });
    const text = await card.innerText();
    const buttons = await card.getByRole('button').allTextContents();
    const links = await sanitizedLinks(card);
    const status = /Not connected/iu.test(text) ? 'not-connected' : /Connected/iu.test(text) ? 'connected' : /Error/iu.test(text) ? 'error' : 'unknown';
    const entry = { ...provider, status, cardText: text.slice(0, 8000), buttons, links, authorizationClicked: false, credentialsEntered: false };
    await card.scrollIntoViewIfNeeded();
    await page.evaluate(async () => { await document.fonts.ready; await new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))); });
    await shot(`01-${provider.id}-catalog.png`, page);

    const providerHostedClaim = /(OAuth|provider-hosted|sign[ -]?in|authorize with)/iu.test(text);
    const connect = card.getByRole('button', { name: /^(Connect|Authorize|Sign in)/iu }).first();
    const connectVisible = await connect.isVisible().catch(() => false);
    const connectEnabled = connectVisible && await connect.isEnabled().catch(() => false);
    const connectAriaDisabled = connectVisible ? await connect.getAttribute('aria-disabled') : null;
    const eligible = status === 'not-connected' && providerHostedClaim && connectVisible && connectEnabled;
    entry.providerHostedClaim = providerHostedClaim;
    entry.eligibleForClick = eligible;
    entry.connectDom = { visible: connectVisible, enabled: connectEnabled, ariaDisabled: connectAriaDisabled };
    if (eligible) {
      const beforeDialogs = await page.getByRole('dialog').count();
      await connect.click();
      entry.authorizationClicked = true;
      await page.waitForFunction((count) => document.querySelectorAll('[role="dialog"]').length > count, beforeDialogs, { timeout: 5000 }).catch(() => undefined);
      const dialogCount = await page.getByRole('dialog').count();
      if (dialogCount > beforeDialogs) {
        const detail = page.getByRole('dialog').last();
        const detailText = await detail.innerText();
        const fields = await detail.locator('input').evaluateAll((inputs) => inputs.map((input) => ({ type: input.type, valueLength: input.value.length, aria: input.getAttribute('aria-label'), placeholder: input.getAttribute('placeholder') })));
        entry.detailText = detailText.slice(0, 8000);
        entry.detailLinks = await sanitizedLinks(detail);
        entry.fields = fields;
        entry.credentialsEntered = fields.some((field) => field.valueLength > 0);
        check(`${provider.name} boundary contains no entered credentials`, !entry.credentialsEntered, { fields });
        await shot(`02-${provider.id}-hosted-boundary.png`, detail);
        await page.keyboard.press('Escape');
      } else {
        entry.boundary = 'No in-app fallback dialog appeared; provider navigation cannot be certified through official WebView CDP.';
      }
    } else {
      entry.boundary = status === 'connected'
        ? 'Existing connection present; no provider mutation performed.'
        : status === 'error'
          ? 'Catalog reports an external authorization-registration error; no click performed.'
          : providerHostedClaim
            ? 'Provider-hosted action unavailable or disabled.'
            : 'Catalog does not truthfully claim a provider-hosted flow; no click performed.';
    }
    report.providers.push(entry);
  }
  check('no credentials entered for representative providers', report.providers.every((provider) => !provider.credentialsEntered));
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = String(error?.stack ?? error);
} finally {
  if (page) { try { const settings = page.getByRole('dialog').filter({ hasText: 'Configure providers' }); if (await settings.isVisible().catch(() => false)) await page.keyboard.press('Escape'); } catch {} }
  safe('final'); report.completedAt = new Date().toISOString(); await writeFile(resolve(OUT, 'plugin-hosted-boundary.json'), `${JSON.stringify(report, null, 2)}\n`); if (browser) await browser.close();
}
if (report.status !== 'passed') process.exitCode = 1;
