import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const OUTPUT_PATH = '\\\\?\\C:\\Users\\viper\\Documents\\Codex\\2026-08-21\\output.txt';
const WRONG_PATH =
  'C:\\Users\\viper\\AppData\\Roaming\\ai.jarvis.desktop\\Projects\\jarvis-note.txt';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function fileState(target) {
  try {
    const bytes = await readFile(target);
    return { exists: true, size: bytes.length, sha256: sha256(bytes) };
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, size: 0, sha256: null };
    throw error;
  }
}

function processState(label) {
  const command = [
    "$jarvis=@(Get-CimInstance Win32_Process|Where-Object Name -eq 'jarvis.exe'|Select-Object Name,ProcessId,ParentProcessId,ExecutablePath)",
    "$cdp=@(Get-CimInstance Win32_Process|Where-Object{$_.Name -eq 'msedgewebview2.exe'-and$_.CommandLine -like '*--remote-debugging-port=9223*'}|Select-Object Name,ProcessId,ParentProcessId)",
    "$ollama=@(Get-CimInstance Win32_Process|Where-Object Name -eq 'ollama.exe'|Select-Object ProcessId)",
    '$port=@(Get-NetTCPConnection -State Listen -LocalPort 11434 -ErrorAction SilentlyContinue|Select-Object LocalAddress,LocalPort,OwningProcess)',
    '[pscustomobject]@{capturedAt=(Get-Date -Format o);jarvis=$jarvis;cdp=$cdp;ollama=$ollama;port11434=$port}|ConvertTo-Json -Depth 5 -Compress',
  ].join(';');
  const raw = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', command],
    { encoding: 'utf8', windowsHide: true },
  );
  const parsed = JSON.parse(raw);
  const safe = {
    label,
    capturedAt: parsed.capturedAt,
    jarvis: parsed.jarvis,
    cdp: parsed.cdp,
    ollamaProcessCount: parsed.ollama.length,
    listener11434Count: parsed.port11434.length,
  };
  if (safe.ollamaProcessCount || safe.listener11434Count) {
    throw new Error('forbidden_ollama_or_11434');
  }
  return safe;
}

const before = processState('first-failure-diagnostic:before');
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = browser
  .contexts()
  .flatMap((context) => context.pages())
  .find((candidate) => candidate.url().includes('localhost:5173'));
if (!page) throw new Error('official_page_missing');

const snapshot = await page.evaluate(
  async ({ wrongPath }) => {
    const { db } = await import('/src/lib/db/index.ts');
    const rows = await db.messages.toArray();
    const matches = [];
    for (const row of rows) {
      for (const part of row.parts) {
        if (
          part.kind === 'action_proposal' &&
          part.action_id === 'files.create' &&
          part.params?.path === wrongPath
        ) {
          const approvalId = String(part.call_id).startsWith('jarvisapproval:')
            ? String(part.call_id).slice('jarvisapproval:'.length)
            : '';
          const card = approvalId
            ? document.querySelector(`[data-approval-id="${approvalId}"]`)
            : null;
          matches.push({
            chatIdSha256: '',
            messageIdSha256: '',
            callIdSha256: '',
            chatIdRaw: String(row.chat_id),
            messageIdRaw: String(row.id),
            callIdRaw: String(part.call_id),
            actionId: String(part.action_id),
            persistedStatus: String(part.status),
            exactWrongPath: part.params?.path === wrongPath,
            cardVisible: Boolean(card),
            cardStatus: card?.getAttribute('data-status') ?? null,
            approvalSubmitState:
              card
                ?.querySelector('button[data-approval-submit-state]')
                ?.getAttribute('data-approval-submit-state') ?? null,
            approveControlVisible: Boolean(
              card &&
              [...card.querySelectorAll('button')].some(
                (button) => button.textContent?.trim() === 'Approve fixed action',
              ),
            ),
            denyControlVisible: Boolean(
              card &&
              [...card.querySelectorAll('button')].some(
                (button) => button.textContent?.trim() === 'Deny action',
              ),
            ),
            failureAlertVisible: Boolean(card?.querySelector('[role="alert"]')),
          });
        }
      }
    }
    return matches.at(-1) ?? null;
  },
  { wrongPath: WRONG_PATH },
);

if (!snapshot) throw new Error('stale_wrong_proposal_missing');
snapshot.chatIdSha256 = sha256(snapshot.chatIdRaw);
snapshot.messageIdSha256 = sha256(snapshot.messageIdRaw);
snapshot.callIdSha256 = sha256(snapshot.callIdRaw);
delete snapshot.chatIdRaw;
delete snapshot.messageIdRaw;
delete snapshot.callIdRaw;

const screenshotName = '11-stale-wrong-approval-denial-no-transition-attempt-05.png';
const screenshotPath = resolve(HERE, screenshotName);
await page.screenshot({ path: screenshotPath, animations: 'disabled', fullPage: false });
const metadata = await sharp(screenshotPath).metadata();
const after = processState('first-failure-diagnostic:after');
await browser.close();

const report = {
  schemaVersion: 1,
  task: 'PR31-DEEPSEEK-NATIVE-ATTEMPT-05-FIRST-FAILURE-DIAGNOSTIC',
  capturedAt: new Date().toISOString(),
  captureHead: execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  classification: 'product_failure_stale_denial_not_persisted',
  interactionBoundary:
    'The attempt-05 driver issued exactly one semantic Deny action before model dispatch. This diagnostic is read-only and performed no additional click.',
  observed: snapshot,
  files: {
    requestedOutput: await fileState(OUTPUT_PATH),
    wrongTarget: await fileState(WRONG_PATH),
  },
  artifact: { name: screenshotName, width: metadata.width, height: metadata.height },
  safety: { before, after },
  modelDispatchCount: 0,
  approvalClickCount: 0,
  denialClickCountInDiagnostic: 0,
  rawBodyStored: false,
  credentialsStored: false,
};

await writeFile(
  resolve(HERE, 'deepseek-native-first-failure-diagnostic-attempt-05.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
