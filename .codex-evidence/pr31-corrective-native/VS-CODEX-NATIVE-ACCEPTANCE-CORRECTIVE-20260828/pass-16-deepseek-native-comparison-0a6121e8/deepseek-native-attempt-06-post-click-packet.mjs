import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const CARD_SOURCE = resolve(ROOT, 'app/src/features/chat/ActionApprovalCard.tsx');
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

function safety(label) {
  const command = [
    "$jarvis=@(Get-CimInstance Win32_Process|Where-Object Name -eq 'jarvis.exe'|Select-Object Name,ProcessId,ParentProcessId,ExecutablePath)",
    "$cdp=@(Get-CimInstance Win32_Process|Where-Object{$_.Name -eq 'msedgewebview2.exe'-and$_.CommandLine -like '*--remote-debugging-port=9223*'}|Select-Object Name,ProcessId,ParentProcessId)",
    "$ollama=@(Get-CimInstance Win32_Process|Where-Object Name -eq 'ollama.exe'|Select-Object ProcessId)",
    '$port=@(Get-NetTCPConnection -State Listen -LocalPort 11434 -ErrorAction SilentlyContinue|Select-Object OwningProcess)',
    '[pscustomobject]@{capturedAt=(Get-Date -Format o);jarvis=$jarvis;cdp=$cdp;ollama=$ollama;port=$port}|ConvertTo-Json -Depth 5 -Compress',
  ].join(';');
  const raw = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', command],
    { encoding: 'utf8', windowsHide: true },
  );
  const parsed = JSON.parse(raw);
  const result = {
    label,
    capturedAt: parsed.capturedAt,
    jarvis: parsed.jarvis,
    cdp: parsed.cdp,
    ollamaProcessCount: parsed.ollama.length,
    listener11434Count: parsed.port.length,
  };
  if (result.ollamaProcessCount || result.listener11434Count) {
    throw new Error('forbidden_ollama_or_11434');
  }
  return result;
}

const before = safety('attempt06-post-click:before');
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = browser
  .contexts()
  .flatMap((context) => context.pages())
  .find((candidate) => candidate.url().includes('localhost:5173'));
if (!page) throw new Error('official_page_missing');

const observed = await page.evaluate(
  async ({ wrongPath }) => {
    const { db } = await import('/src/lib/db/index.ts');
    const rows = await db.messages.toArray();
    const candidates = [];
    for (const row of rows) {
      for (const part of row.parts) {
        if (
          part.kind !== 'action_proposal' ||
          part.action_id !== 'files.create' ||
          part.params?.path !== wrongPath
        ) {
          continue;
        }
        const callId = String(part.call_id);
        const approvalId = callId.startsWith('jarvisapproval:')
          ? callId.slice('jarvisapproval:'.length)
          : '';
        const card = approvalId
          ? document.querySelector(`[data-approval-id="${approvalId}"]`)
          : null;
        const alert = card?.querySelector('[role="alert"]');
        const buttons = card
          ? [...card.querySelectorAll('button')].map((button) => ({
              name: button.textContent?.trim() ?? '',
              disabled: button.disabled,
              submitState: button.getAttribute('data-approval-submit-state'),
            }))
          : [];
        candidates.push({
          chatId: String(row.chat_id),
          messageId: String(row.id),
          callId,
          actionId: String(part.action_id),
          persistedStatus: String(part.status),
          params: {
            wrongPathMatches: part.params?.path === wrongPath,
            contentCharCount: String(part.params?.content ?? '').length,
            rootPresent: typeof part.params?.root === 'string',
          },
          card: {
            visible: Boolean(card),
            actionId: card?.getAttribute('data-action-id') ?? null,
            approvalKind: card?.getAttribute('data-approval-kind') ?? null,
            status: card?.getAttribute('data-status') ?? null,
            buttons,
            alertText: alert?.textContent?.trim() ?? null,
          },
        });
      }
    }
    const moduleResponse = await fetch('/src/features/chat/ActionApprovalCard.tsx?raw', {
      cache: 'no-store',
    });
    const moduleText = await moduleResponse.text();
    const latest = candidates.at(-1) ?? null;
    let kernelStatus = null;
    if (latest) {
      const approvalId = latest.callId.startsWith('jarvisapproval:')
        ? latest.callId.slice('jarvisapproval:'.length)
        : '';
      const [{ getActiveAccountIdentity }, { createJarvisKernelClient }] = await Promise.all([
        import('/src/lib/accountIdentity.ts'),
        import('/src/lib/jarvis/kernelClient.ts'),
      ]);
      const identity = getActiveAccountIdentity();
      if (identity && approvalId) {
        const client = createJarvisKernelClient();
        try {
          const response = await client.getApprovalStatus({
            accountId: identity.accountId,
            approvalId,
          });
          kernelStatus = {
            kind: response.kind,
            status: response.kind === 'approval_state' ? response.status : null,
            accountMatches:
              response.kind === 'approval_state' ? response.accountId === identity.accountId : null,
            approvalMatches:
              response.kind === 'approval_state' ? response.approvalId === approvalId : null,
            unavailableReason: response.kind === 'unavailable' ? response.reason : null,
            unavailableRequestKind: response.kind === 'unavailable' ? response.requestKind : null,
          };
        } finally {
          client.dispose();
        }
      }
    }
    return {
      candidate: latest,
      kernelStatus,
      loadedModule: {
        status: moduleResponse.status,
        charCount: moduleText.length,
        containsPersistVerifiedDenial: moduleText.includes('persistVerifiedDenial'),
        containsApprovalStatusFallback: moduleText.includes('client.getApprovalStatus'),
        containsDeniedStatusRequirement: moduleText.includes("status.status !== 'denied'"),
        containsPersistBeforeRelease:
          moduleText.indexOf('await persistVerifiedDenial') >= 0 &&
          moduleText.indexOf('await persistVerifiedDenial') <
            moduleText.indexOf("setDisplayStatus('cancelled')"),
        sha256Input: moduleText,
      },
    };
  },
  { wrongPath: WRONG_PATH },
);

if (!observed.candidate) throw new Error('stale_wrong_proposal_missing');
const candidate = observed.candidate;
const publicAlert = candidate.card.alertText;
const safeCandidate = {
  chatIdSha256: sha256(candidate.chatId),
  messageIdSha256: sha256(candidate.messageId),
  callIdSha256: sha256(candidate.callId),
  actionId: candidate.actionId,
  persistedStatus: candidate.persistedStatus,
  params: candidate.params,
  card: {
    ...candidate.card,
    alertText: publicAlert,
    alertTextSha256: publicAlert ? sha256(publicAlert) : null,
  },
};
const loadedModule = {
  ...observed.loadedModule,
  sha256: sha256(observed.loadedModule.sha256Input),
};
delete loadedModule.sha256Input;
const localSource = await readFile(CARD_SOURCE, 'utf8');

const screenshotName = '12-stale-wrong-approval-post-click-packet-attempt-06.png';
const screenshotPath = resolve(HERE, screenshotName);
await page.screenshot({ path: screenshotPath, animations: 'disabled', fullPage: false });
const metadata = await sharp(screenshotPath).metadata();
await browser.close();
const after = safety('attempt06-post-click:after');

const report = {
  schemaVersion: 1,
  task: 'PR31-DEEPSEEK-NATIVE-ATTEMPT-06-POST-CLICK-PACKET',
  capturedAt: new Date().toISOString(),
  captureHead: execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  classification: 'product_failure_stale_denial_not_reconciled_after_226cd09e',
  observed: safeCandidate,
  observability: {
    kernelStatus: observed.kernelStatus,
    loadedModule,
    localSourceSha256: sha256(localSource),
    localSourceContainsPersistVerifiedDenial: localSource.includes('persistVerifiedDenial'),
    repositoryUpdateError:
      'No raw repository exception is exposed by the card. The public fail-closed alert is the only observable persistence error.',
    consoleErrorObservedByAttempt06: false,
  },
  files: {
    requestedOutput: await fileState(OUTPUT_PATH),
    wrongTarget: await fileState(WRONG_PATH),
  },
  artifact: { name: screenshotName, width: metadata.width, height: metadata.height },
  safety: { before, after },
  interactionBoundary:
    'Read-only post-click capture. Attempt-06 issued one Deny action; this packet issued no click, approval, model dispatch, restart, or developer-state mutation.',
  counts: { modelDispatch: 0, approvalClick: 0, postClickPacketClicks: 0 },
  rawBodyStored: false,
  credentialsStored: false,
};

await writeFile(
  resolve(HERE, 'deepseek-native-post-click-packet-attempt-06.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
