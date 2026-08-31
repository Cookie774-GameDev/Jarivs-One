import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const CDP = 'http://127.0.0.1:9223';
const OUTPUT_PATH = 'C:\\Users\\viper\\Documents\\Codex\\2026-08-21\\output.txt';
const WRONG_TARGET_PATH =
  'C:\\Users\\viper\\AppData\\Roaming\\ai.jarvis.desktop\\Projects\\jarvis-note.txt';
const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

function processSnapshot() {
  return JSON.parse(
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        [
          "$jarvis=@(Get-CimInstance Win32_Process|Where-Object Name -eq 'jarvis.exe'|Select-Object Name,ProcessId,ParentProcessId,ExecutablePath,CommandLine)",
          "$webviews=@(Get-CimInstance Win32_Process|Where-Object{$_.Name -eq 'msedgewebview2.exe'-and$_.CommandLine -like '*--webview-exe-name=jarvis.exe*'}|Select-Object Name,ProcessId,ParentProcessId,ExecutablePath,@{n='Cdp9223';e={$_.CommandLine -like '*--remote-debugging-port=9223*'}})",
          "$ollama=@(Get-CimInstance Win32_Process|Where-Object Name -eq 'ollama.exe'|Select-Object Name,ProcessId,ParentProcessId,ExecutablePath)",
          '$p11434=@(Get-NetTCPConnection -State Listen -LocalPort 11434 -ErrorAction SilentlyContinue|Select-Object LocalAddress,LocalPort,OwningProcess)',
          '$p9223=@(Get-NetTCPConnection -State Listen -LocalPort 9223 -ErrorAction SilentlyContinue|Select-Object LocalAddress,LocalPort,OwningProcess)',
          '[pscustomobject]@{CapturedAt=(Get-Date -Format o);Jarvis=$jarvis;WebViews=$webviews;Listeners9223=$p9223;Ollama=$ollama;Listeners11434=$p11434}|ConvertTo-Json -Depth 7 -Compress',
        ].join(';'),
      ],
      { encoding: 'utf8' },
    ).trim(),
  );
}

function count(value) {
  if (value == null) return 0;
  return Array.isArray(value) ? value.length : 1;
}

async function fileState(path) {
  try {
    const [metadata, bytes] = await Promise.all([stat(path), readFile(path)]);
    return { exists: true, bytes: metadata.size, sha256: sha256(bytes), modifiedAt: metadata.mtime.toISOString() };
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false };
    throw error;
  }
}

const process = processSnapshot();
if (count(process.Ollama) || count(process.Listeners11434)) {
  throw new Error('Safety guard failed: Ollama/11434 present.');
}
const browser = await chromium.connectOverCDP(CDP);
const page = browser
  .contexts()
  .flatMap((context) => context.pages())
  .find((candidate) => candidate.url().includes('localhost:5173'));
if (!page) throw new Error('Official jarvis WebView page was not found on CDP 9223.');

const state = await page.evaluate(async () => {
  const [{ useUIStore }, { useDevConsoleStore }] = await Promise.all([
    import('/src/stores/ui.ts'),
    import('/src/features/dev-console/store.ts'),
  ]);
  const body = document.body.innerText;
  const recent = useDevConsoleStore
    .getState()
    .entries.filter((entry) => entry.ts >= Date.parse('2026-08-28T17:22:30Z'))
    .filter(
      (entry) =>
        entry.channel === 'ai' ||
        (entry.channel === 'event' && /jarvis:(?:run-state|task-notification)/u.test(entry.message)),
    )
    .map((entry) => ({
      ts: entry.ts,
      channel: entry.channel,
      level: entry.level,
      message: entry.message,
      status: entry.detail?.detail?.status ?? null,
      chatId: entry.detail?.detail?.chatId ?? null,
    }));
  return {
    capturedAt: new Date().toISOString(),
    activeChatId: useUIStore.getState().activeChatId,
    semantic: {
      blockedAwaitingApproval: body.includes('BLOCKED') && body.includes('awaiting approval'),
      awaitingApprovalVisible: body.includes('AWAITING APPROVAL'),
      wrongTargetVisible: body.includes('ai.jarvis.desktop\\Projects\\jarvis-note.txt'),
      requestedMarkerVisible: body.includes('WRITE: output.txt'),
      denyVisible: body.includes('Deny action'),
      approveVisible: body.includes('Approve fixed action'),
      stopVisible: body.includes('Stop current request'),
      sendVisible: Boolean(
        [...document.querySelectorAll('button')].find(
          (button) => button.getAttribute('aria-label') === 'Send message',
        ),
      ),
    },
    recent,
  };
});

await page.screenshot({
  path: '05-disposable-write-denial-click-no-transition.png',
  animations: 'disabled',
  fullPage: false,
});

await writeFile(
  'deepseek-write-denial-post-click-diagnostic.json',
  `${JSON.stringify(
    {
      schemaVersion: 1,
      task: 'PR31-DEEPSEEK-NATIVE-DISPOSABLE-WRITE-DENIAL-POST-CLICK-DIAGNOSTIC',
      status: 'deny-click-did-not-transition-within-20s-no-further-interaction',
      capturedAt: state.capturedAt,
      activeChatIdSha256: sha256(state.activeChatId ?? ''),
      semantic: state.semantic,
      recentEvents: state.recent.map(({ chatId, ...entry }) => ({
        ...entry,
        ...(chatId ? { chatIdSha256: sha256(chatId) } : {}),
      })),
      fileProof: {
        requestedOutputPath: OUTPUT_PATH,
        requestedOutput: await fileState(OUTPUT_PATH),
        wrongProposedTargetPath: WRONG_TARGET_PATH,
        wrongTarget: await fileState(WRONG_TARGET_PATH),
      },
      process,
      artifact: '05-disposable-write-denial-click-no-transition.png',
      interactionBoundary:
        'One public semantic Deny action click was issued after waking Ambient mode. The approval card did not transition within 20 seconds. No approval or further action control was used.',
    },
    null,
    2,
  )}\n`,
  'utf8',
);
await browser.close();
