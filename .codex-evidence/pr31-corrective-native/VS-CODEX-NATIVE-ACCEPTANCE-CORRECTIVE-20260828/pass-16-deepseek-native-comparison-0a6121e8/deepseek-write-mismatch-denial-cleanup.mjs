import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const CDP = 'http://127.0.0.1:9223';
const WRITE_DISPATCH_AFTER = Date.parse('2026-08-28T17:12:30.000Z');
const OUTPUT_PATH = 'C:\\Users\\viper\\Documents\\Codex\\2026-08-21\\output.txt';
const WRONG_TARGET_PATH =
  'C:\\Users\\viper\\AppData\\Roaming\\ai.jarvis.desktop\\Projects\\jarvis-note.txt';
const CHAT_PREFIX = 'chat_pr31_deepseek_native_';

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
    return {
      exists: true,
      bytes: metadata.size,
      sha256: sha256(bytes),
      modifiedAt: metadata.mtime.toISOString(),
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false };
    throw error;
  }
}

const beforeProcess = processSnapshot();
if (count(beforeProcess.Ollama) || count(beforeProcess.Listeners11434)) {
  throw new Error('Safety guard failed before denial cleanup: Ollama/11434 present.');
}
const filesBefore = {
  requestedOutput: await fileState(OUTPUT_PATH),
  wrongTarget: await fileState(WRONG_TARGET_PATH),
};

const browser = await chromium.connectOverCDP(CDP);
const page = browser
  .contexts()
  .flatMap((context) => context.pages())
  .find((candidate) => candidate.url().includes('localhost:5173'));
if (!page) throw new Error('Official jarvis WebView page was not found on CDP 9223.');

const preDenial = await page.evaluate(
  async ({ prefix, writeDispatchAfter }) => {
    const [{ db }, { useDevConsoleStore }, { useUIStore }] = await Promise.all([
      import('/src/lib/db/index.ts'),
      import('/src/features/dev-console/store.ts'),
      import('/src/stores/ui.ts'),
    ]);
    const fixtureChats = (await db.chats.toArray()).filter((chat) =>
      String(chat.id).startsWith(prefix),
    );
    const writeSend = useDevConsoleStore
      .getState()
      .entries.filter(
        (entry) => entry.ts >= writeDispatchAfter && entry.message === 'dispatch jarvis:send',
      )
      .at(0);
    const body = document.body.innerText;
    return {
      activeChatId: useUIStore.getState().activeChatId,
      writeChatId: writeSend?.detail?.detail?.chatId ?? null,
      writeTurnHandle: writeSend?.detail?.detail?.cancellationKey ?? null,
      fixtureChatCount: fixtureChats.length,
      semantic: {
        blockedAwaitingApproval: body.includes('BLOCKED') && body.includes('awaiting approval'),
        wrongTargetVisible: body.includes('ai.jarvis.desktop\\Projects\\jarvis-note.txt'),
        requestedMarkerVisible: body.includes('WRITE: output.txt'),
        denyVisible: body.includes('Deny action'),
        approveVisible: body.includes('Approve fixed action'),
        stopVisible: body.includes('Stop current request'),
      },
    };
  },
  { prefix: CHAT_PREFIX, writeDispatchAfter: WRITE_DISPATCH_AFTER },
);

if (!preDenial.semantic.blockedAwaitingApproval || !preDenial.semantic.wrongTargetVisible) {
  throw new Error('Expected mismatched blocked approval state is no longer visible.');
}

const deny = page.getByRole('button', { name: 'Deny action' });
await deny.waitFor({ state: 'visible', timeout: 10_000 });
const ambient = page.getByRole('dialog', { name: 'Ambient mode. Press any key to wake.' });
if (await ambient.isVisible()) {
  await page.keyboard.press('Shift');
  await ambient.waitFor({ state: 'hidden', timeout: 10_000 });
}
await deny.click();
await deny.waitFor({ state: 'hidden', timeout: 20_000 });
await page.getByRole('button', { name: 'Send message' }).waitFor({
  state: 'visible',
  timeout: 20_000,
});
await page.getByRole('button', { name: 'Stop current request' }).waitFor({
  state: 'hidden',
  timeout: 20_000,
});

await page.screenshot({
  path: '05-disposable-write-wrong-target-denied.png',
  animations: 'disabled',
  fullPage: false,
});

const postDenial = await page.evaluate(() => {
  const body = document.body.innerText;
  return {
    cancelledVisible: /(?:cancelled|denied)/iu.test(body),
    awaitingApprovalVisible: body.includes('AWAITING APPROVAL'),
    denyVisible: body.includes('Deny action'),
    approveVisible: body.includes('Approve fixed action'),
    stopVisible: body.includes('Stop current request'),
    sendControlPresent: Boolean(
      [...document.querySelectorAll('button')].find(
        (button) => button.getAttribute('aria-label') === 'Send message',
      ),
    ),
  };
});

const filesAfter = {
  requestedOutput: await fileState(OUTPUT_PATH),
  wrongTarget: await fileState(WRONG_TARGET_PATH),
};
const afterProcess = processSnapshot();
if (count(afterProcess.Ollama) || count(afterProcess.Listeners11434)) {
  throw new Error('Safety guard failed after denial cleanup: Ollama/11434 present.');
}

const report = {
  schemaVersion: 1,
  task: 'PR31-DEEPSEEK-NATIVE-DISPOSABLE-WRITE-MISMATCH-DENIAL-CLEANUP',
  capturedAt: new Date().toISOString(),
  status: 'wrong-target-denied-no-files-mutated',
  preDenial: {
    activeChatIdSha256: sha256(preDenial.activeChatId ?? ''),
    writeChatIdSha256: sha256(preDenial.writeChatId ?? ''),
    writeTurnHandleSha256: sha256(preDenial.writeTurnHandle ?? ''),
    sameActiveAndDispatchChat: String(preDenial.activeChatId) === String(preDenial.writeChatId),
    fixtureChatCount: preDenial.fixtureChatCount,
    semantic: preDenial.semantic,
  },
  denial: {
    action: 'Clicked public semantic `Deny action`; never clicked approval.',
    semantic: postDenial,
  },
  fileProof: {
    requestedOutputPath: OUTPUT_PATH,
    wrongProposedTargetPath: WRONG_TARGET_PATH,
    before: filesBefore,
    after: filesAfter,
    requestedOutputUnchanged:
      JSON.stringify(filesBefore.requestedOutput) === JSON.stringify(filesAfter.requestedOutput),
    wrongTargetUnchanged:
      JSON.stringify(filesBefore.wrongTarget) === JSON.stringify(filesAfter.wrongTarget),
  },
  processBefore: beforeProcess,
  processAfter: afterProcess,
  artifact: '05-disposable-write-wrong-target-denied.png',
  cleanupBoundary:
    'Task-owned fixed-action approval was denied. Deterministic fixture chats were already deleted by attempt-04 cleanup. No internal deletion was attempted against the pre-existing user chat.',
};

await writeFile(
  'deepseek-write-mismatch-denial-cleanup.json',
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
await browser.close();
