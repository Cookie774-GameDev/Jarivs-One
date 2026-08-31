import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const CDP = 'http://127.0.0.1:9223';
const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

function ps(script) {
  return execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
  }).trim();
}

function processSnapshot() {
  return JSON.parse(
    ps(
      [
        "$jarvis=@(Get-CimInstance Win32_Process|Where-Object Name -eq 'jarvis.exe'|Select-Object Name,ProcessId,ParentProcessId,ExecutablePath,CreationDate)",
        "$webviews=@(Get-CimInstance Win32_Process|Where-Object{$_.Name -eq 'msedgewebview2.exe'-and$_.CommandLine -like '*--webview-exe-name=jarvis.exe*'}|Select-Object Name,ProcessId,ParentProcessId,ExecutablePath,@{n='Cdp9223';e={$_.CommandLine -like '*--remote-debugging-port=9223*'}})",
        "$ollama=@(Get-CimInstance Win32_Process|Where-Object Name -eq 'ollama.exe'|Select-Object Name,ProcessId,ParentProcessId,ExecutablePath)",
        '$p11434=@(Get-NetTCPConnection -State Listen -LocalPort 11434 -ErrorAction SilentlyContinue|Select-Object LocalAddress,LocalPort,OwningProcess)',
        '$p9223=@(Get-NetTCPConnection -State Listen -LocalPort 9223 -ErrorAction SilentlyContinue|Select-Object LocalAddress,LocalPort,OwningProcess)',
        '[pscustomobject]@{CapturedAt=(Get-Date -Format o);Jarvis=$jarvis;WebViews=$webviews;Listeners9223=$p9223;Ollama=$ollama;Listeners11434=$p11434}|ConvertTo-Json -Depth 7 -Compress',
      ].join(';'),
    ),
  );
}

function count(value) {
  if (value == null) return 0;
  return Array.isArray(value) ? value.length : 1;
}

function git(...args) {
  return execFileSync('git', ['-C', 'C:\\Users\\viper\\VibeSpace-UnifiedChungus-Final', ...args], {
    encoding: 'utf8',
  }).trim();
}

const before = processSnapshot();
if (count(before.Ollama) || count(before.Listeners11434)) {
  throw new Error('Safety guard failed before baseline: Ollama/11434 present.');
}
if (count(before.Jarvis) !== 1 || count(before.Listeners9223) !== 1) {
  throw new Error('Official jarvis/CDP authority is not singular.');
}

const browser = await chromium.connectOverCDP(CDP);
const page = browser
  .contexts()
  .flatMap((context) => context.pages())
  .find((candidate) => candidate.url().includes('localhost:5173'));
if (!page) throw new Error('Official jarvis WebView page was not found on CDP 9223.');

const ambient = page.getByRole('dialog', { name: 'Ambient mode. Press any key to wake.' });
if (await ambient.isVisible()) {
  await page.keyboard.press('Shift');
  await ambient.waitFor({ state: 'hidden', timeout: 10_000 });
}

const trigger = page.getByRole('button', { name: 'Choose model' });
await trigger.waitFor({ state: 'visible', timeout: 15_000 });
await trigger.click();
const picker = page.getByRole('dialog', { name: 'Choose AI model' });
await picker.waitFor({ state: 'visible', timeout: 10_000 });
const search = picker.getByRole('searchbox', { name: 'Search providers and models' });
await search.fill('opencode');
await picker
  .locator('[role="option"][data-value^="opencode-cli:"]')
  .first()
  .waitFor({ state: 'visible', timeout: 15_000 });

const publicRoutes = await picker
  .locator('[role="option"][data-value^="opencode-cli:"]')
  .evaluateAll((options) =>
    options.map((option) => ({
      qualifiedId: option.getAttribute('data-value') ?? '',
      disabled: option.getAttribute('aria-disabled') === 'true',
      selected: option.getAttribute('aria-selected') === 'true',
      label: option.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
    })),
  );
const orderedQualifiedIds = publicRoutes.map((route) => route.qualifiedId);

const runtime = await page.evaluate(async () => {
  const [connectionState, runtimeManager, connectionCatalog, devConsole] = await Promise.all([
    import('/src/lib/ai/connectionState.ts'),
    import('/src/lib/harness/runtimeManager.ts'),
    import('/src/lib/ai/connectionCatalog.ts'),
    import('/src/features/dev-console/store.ts'),
  ]);
  const session = connectionState.readConnectionSessionPickerStates()['opencode-cli'] ?? null;
  const metadata = connectionState.readConnectionMetadata()['opencode-cli'] ?? null;
  const connection = runtimeManager.harnessRuntimeManager.getConnection() ?? null;
  const discovered = connectionCatalog.getDiscoveredConnectionModels('opencode-cli');
  const transport = devConsole.useDevConsoleStore
    .getState()
    .entries.filter(
      (entry) =>
        entry.channel === 'fetch' && entry.message.includes('opencode_server_request'),
    );
  return {
    sessionChecked: connectionState.isConnectionSessionChecked('opencode-cli'),
    session,
    metadata,
    runtimeSnapshot: runtimeManager.harnessRuntimeManager.getSnapshot(),
    runtimeConnection: connection,
    discovered: discovered.map(({ id, source, lastVerifiedAt, unverified }) => ({
      id,
      source,
      lastVerifiedAt,
      unverified: unverified === true,
    })),
    nonSpecificTransportCounter: {
      count: transport.length,
      firstObservedAt: transport[0]?.ts ?? null,
      lastObservedAt: transport.at(-1)?.ts ?? null,
    },
  };
});

await page.screenshot({
  path: '00-opencode-refresh-baseline.png',
  animations: 'disabled',
  fullPage: false,
});
await page.keyboard.press('Escape');
await picker.waitFor({ state: 'hidden', timeout: 10_000 });

const after = processSnapshot();
if (count(after.Ollama) || count(after.Listeners11434)) {
  throw new Error('Safety guard failed after baseline: Ollama/11434 present.');
}

const baseline = {
  schemaVersion: 1,
  suiteId: 'pr31-opencode-refresh-reconnect-native-baseline-v1',
  capturedAt: new Date().toISOString(),
  sourceHead: git('rev-parse', 'HEAD'),
  contractCommit: 'f03dd4bd079c7fb42241f4e16982decb2b744123',
  authority: {
    executable: 'jarvis.exe',
    officialProfileVerified: true,
    cdpEndpoint: CDP,
    processBefore: before,
    processAfter: after,
    pageUrl: page.url(),
  },
  authentication: {
    sessionChecked: runtime.sessionChecked,
    available: runtime.session?.available === true,
    state: runtime.session?.auth ?? 'unknown',
    executableAuthority: runtime.session?.available === true && runtime.session?.auth === 'authenticated',
    metadata: runtime.metadata,
    runtimeSnapshot: runtime.runtimeSnapshot,
    runtimeConnection: runtime.runtimeConnection
      ? {
          version: runtime.runtimeConnection.version,
          source: runtime.runtimeConnection.source,
          generationSha256: sha256(runtime.runtimeConnection.generation),
        }
      : null,
  },
  publicPickerRoutes: {
    searchBoundary: 'Public Choose model dialog filtered with `opencode`; no refresh control used.',
    count: orderedQualifiedIds.length,
    orderedQualifiedIds,
    orderSha256: sha256(orderedQualifiedIds.join('\n')),
    allEnabled: publicRoutes.every((route) => !route.disabled),
    rows: publicRoutes,
  },
  observableRefreshState: {
    discoveredConnectionRows: runtime.discovered,
    nonSpecificTransportCounter: runtime.nonSpecificTransportCounter,
    truthfulUnforcedRefreshTimestampAvailable: false,
    truthfulUnforcedRefreshCounterAvailable: false,
    blocker:
      'The five-minute OpenCode cache `loadedAt` value is module-private; the public picker does not expose lastVerifiedAt; and DevConsole records catalog, status, and session calls under the same `opencode_server_request` label without the native route kind. The non-specific transport count/timestamps cannot prove a catalog refresh. A five-minute wait would therefore be unprovable without new product telemetry or request-body interception that is not part of the public evidence contract.',
  },
  safety: {
    ollamaProcessCountBefore: count(before.Ollama),
    ollamaProcessCountAfter: count(after.Ollama),
    port11434ListenerCountBefore: count(before.Listeners11434),
    port11434ListenerCountAfter: count(after.Listeners11434),
    credentialsMutated: false,
    productionMutated: false,
    manualRefreshUsed: false,
    modelDispatched: false,
    appRestarted: false,
  },
  artifact: '00-opencode-refresh-baseline.png',
};

await writeFile('opencode-refresh-baseline.json', `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
await browser.close();
