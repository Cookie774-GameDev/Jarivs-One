import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { attachOfficialNative } from '../../scripts/pr31-native-acceptance-harness.mjs';

const root = 'C:\\Users\\viper\\VibeSpace-UnifiedChungus-Final';
const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (head !== process.env.EXPECTED_HEAD) throw new Error(`immutable_head_mismatch:${process.env.EXPECTED_HEAD}:${head}`);
const out = resolve(root, '.codex-evidence/pr31-siyuan-rlm-native-acceptance-20260828', process.env.RUN_LABEL ?? 'workbench-child-boundary');
await mkdir(out, { recursive: true });
const report = { status: 'running', head, startedAt: new Date().toISOString(), console: [], pageErrors: [], assertions: [] };
const psJson = (script) => JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' }));
const attachment = await attachOfficialNative({ chromium, jarvisPid: Number(process.env.JARVIS_PID), cdpPort: 9223 });
try {
  const page = attachment.page;
  page.on('console', (message) => report.console.push({ type: message.type(), text: message.text().slice(0, 2000) }));
  page.on('pageerror', (error) => report.pageErrors.push(String(error).slice(0, 2000)));
  const ambient = page.getByRole('dialog', { name: 'Ambient mode. Press any key to wake.' });
  if (await ambient.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await ambient.waitFor({ state: 'hidden', timeout: 10_000 });
  }
  if (new URL(page.url()).searchParams.get('route') !== 'workbench') {
    await page.getByRole('button', { name: 'Workbench', exact: true }).click();
    await page.waitForURL((url) => url.searchParams.get('route') === 'workbench');
  }
  const beforePanels = await page.getByTestId('workbench-browser-panel').count();
  if (beforePanels === 0) {
    await page.getByRole('button', { name: 'Add Browser', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="workbench-browser-panel"]').length >= 1);
  }
  const candidateHost = page.locator('[data-kind="browser"][data-panel-id]').last();
  const panelId = await candidateHost.getAttribute('data-panel-id');
  if (!panelId) throw new Error('workbench_browser_panel_id_missing');
  const panel = page.locator(`[data-kind="browser"][data-panel-id="${panelId}"]`).getByTestId('workbench-browser-panel');
  await panel.waitFor({ state: 'visible' });
  const address = panel.getByRole('textbox', { name: 'Browser address' });
  await address.fill('https://example.com/');
  await address.press('Enter');
  const loading = panel.getByText('Loading…', { exact: true });
  await Promise.race([
    panel.getByRole('alert').waitFor({ state: 'visible', timeout: 10_000 }),
    loading.waitFor({ state: 'visible', timeout: 10_000 }),
  ]);
  await Promise.race([
    panel.getByRole('alert').waitFor({ state: 'visible', timeout: 30_000 }),
    loading.waitFor({ state: 'hidden', timeout: 30_000 }),
  ]);
  await page.screenshot({ path: resolve(out, '01-example-native-child-boundary.png'), animations: 'disabled' });
  report.panel = { panelId, address: await address.inputValue(), text: await panel.innerText(), surfaceCount: await panel.getByTestId('workbench-browser-native-surface').count() };
  report.processes = psJson("$j=Get-CimInstance Win32_Process|?{$_.Name -in @('jarvis.exe','msedgewebview2.exe')}|?{$_.ProcessId -eq $env:WB_JARVIS -or $_.ParentProcessId -eq $env:WB_JARVIS}|select Name,ProcessId,ParentProcessId,CommandLine;$l=Get-NetTCPConnection -State Listen -LocalPort 9223 -ErrorAction SilentlyContinue|select LocalAddress,OwningProcess;[pscustomobject]@{tree=@($j);listeners=@($l);ollama=@(Get-Process ollama -ErrorAction SilentlyContinue).Count;port11434=@(Get-NetTCPConnection -State Listen -LocalPort 11434 -ErrorAction SilentlyContinue).Count}|ConvertTo-Json -Depth 5");
  report.assertions.push({ name: 'example navigation uses bounded native surface', passed: report.panel.surfaceCount === 1 });
  report.assertions.push({ name: 'example navigation is stable without app error', passed: !/Page could not open/iu.test(report.panel.text) && !/Loading/u.test(report.panel.text), details: report.panel });
  report.assertions.push({ name: 'single official CDP listener remains authoritative', passed: report.processes.listeners.length === 1, details: report.processes.listeners });
  const childBrowsers = report.processes.tree.filter((entry) => entry.Name === 'msedgewebview2.exe' && /\\workbench-browser\\/iu.test(entry.CommandLine ?? ''));
  report.assertions.push({ name: 'child browser does not inherit main CDP endpoint', passed: childBrowsers.every((entry) => !/--remote-debugging-port=9223(?:\s|$)/u.test(entry.CommandLine ?? '')), details: childBrowsers });
  report.assertions.push({ name: 'zero Ollama and 11434', passed: report.processes.ollama === 0 && report.processes.port11434 === 0 });
  report.status = report.assertions.every((entry) => entry.passed) ? 'passed' : 'failed';
} catch (error) {
  report.status = 'failed'; report.failure = String(error?.stack ?? error);
} finally {
  report.completedAt = new Date().toISOString();
  await writeFile(resolve(out, 'workbench-child-boundary.json'), `${JSON.stringify(report, null, 2)}\n`);
  await attachment.browser.close();
}
if (report.status !== 'passed') process.exitCode = 1;
