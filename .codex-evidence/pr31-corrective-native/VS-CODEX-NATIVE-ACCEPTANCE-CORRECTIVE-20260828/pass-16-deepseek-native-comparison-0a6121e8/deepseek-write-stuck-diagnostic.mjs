import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const CDP = 'http://127.0.0.1:9223';
const ATTEMPT_STARTED_AT = Date.parse('2026-08-28T17:09:55.304Z');
const ATTEMPT_FAILED_AT = Date.parse('2026-08-28T17:13:08.894Z');
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

function redact(value, key = '') {
  if (key === 'cancellationKey') return '[redacted]';
  if (/^(?:chatId|messageId|projectId|workspaceId|accountId|userId|rowId)$/u.test(key)) {
    return value == null ? null : `[sha256:${sha256(value)}]`;
  }
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redact(child, childKey)]));
  }
  if (typeof value !== 'string') return value;
  return value
    .replace(/([?&](?:access_token|refresh_token|apikey|api_key|key|token|user_id|row_id)=)[^&\s]+/giu, '$1[redacted]')
    .replace(/(?:bearer\s+)?[A-Za-z0-9_-]{32,}/gi, (match) => `[redacted:${sha256(match).slice(0, 12)}]`);
}

const before = processSnapshot();
if (count(before.Ollama) || count(before.Listeners11434)) {
  throw new Error('Safety guard failed before diagnostic: Ollama/11434 present.');
}

const browser = await chromium.connectOverCDP(CDP);
const contexts = browser.contexts();
const pages = contexts.flatMap((context) => context.pages());
const page = pages.find((candidate) => candidate.url().includes('localhost:5173'));
if (!page) throw new Error('Official jarvis WebView page was not found on CDP 9223.');

const snapshot = await page.evaluate(
  async ({ prefix, startedAt, failedAt }) => {
    const { db } = await import('/src/lib/db/index.ts');
    const { useDevConsoleStore } = await import('/src/features/dev-console/store.ts');
    const chats = await db.chats.toArray();
    const fixtureChats = chats.filter((chat) => String(chat.id).startsWith(prefix));
    const fixtureMessages = [];
    for (const chat of fixtureChats) {
      const messages = await db.messages.where('chat_id').equals(chat.id).toArray();
      fixtureMessages.push(
        ...messages.map((message) => ({
          chatId: String(chat.id),
          messageId: String(message.id),
          role: message.role,
          createdAt: message.created_at,
          updatedAt: message.updated_at,
          status: message.status ?? null,
          partKinds: message.parts.map((part) => part.kind),
          text: message.parts
            .filter((part) => part.kind === 'text')
            .map((part) => part.text)
            .join(''),
          metadata: message.metadata ?? null,
          usage: message.usage ?? null,
        })),
      );
    }
    const entries = useDevConsoleStore
      .getState()
      .entries.filter((entry) => entry.ts >= startedAt - 5_000 && entry.ts <= failedAt + 120_000)
      .filter(
        (entry) =>
          entry.channel === 'ai' ||
          (entry.channel === 'event' &&
            /dispatch jarvis:(?:send|run-state|task-notification)/u.test(entry.message)) ||
          (entry.channel === 'fetch' && /opencode_server_(?:request|event_stream|event_cancel)/u.test(entry.message)),
      )
      .map((entry) => ({
        id: entry.id,
        ts: entry.ts,
        channel: entry.channel,
        level: entry.level,
        message: entry.message,
        detail: entry.detail ?? null,
        durationMs: entry.durationMs ?? null,
      }));
    const systemLog = (() => {
      try {
        return JSON.parse(localStorage.getItem('vibespace.opencode-system-log.v1') ?? 'null');
      } catch {
        return null;
      }
    })();
    const buttons = [...document.querySelectorAll('button')]
      .map((button) => ({
        name: button.getAttribute('aria-label') || button.textContent?.trim() || '',
        disabled: button.hasAttribute('disabled'),
        pressed: button.getAttribute('aria-pressed'),
      }))
      .filter((item) =>
        /^(?:Approve fixed action|Deny action|Stop current request|Send message)$/u.test(item.name),
      );
    const bodyText = document.body.innerText;
    return {
      capturedAt: new Date().toISOString(),
      url: location.href,
      title: document.title,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      semanticState: {
        blockedAwaitingApproval:
          bodyText.includes('BLOCKED') && bodyText.includes('awaiting approval'),
        wrongTargetJarvisNote: bodyText.includes('ai.jarvis.desktop\\Projects\\jarvis-note.txt'),
        requestedOutputPathVisible: bodyText.includes('WRITE: output.txt'),
        approvalActionVisible: bodyText.includes('Approve fixed action'),
        denyActionVisible: bodyText.includes('Deny action'),
        stopControlVisible: bodyText.includes('Stop current request'),
        readDeniedVerifiedSource:
          bodyText.includes('zero matching items') && bodyText.includes('no verified value'),
      },
      buttons,
      systemLog,
      devConsoleEntries: entries,
      fixtureChats,
      fixtureMessages,
    };
  },
  { prefix: CHAT_PREFIX, startedAt: ATTEMPT_STARTED_AT, failedAt: ATTEMPT_FAILED_AT },
);

await page.screenshot({ path: '04-disposable-write-post-failure-state.png' });

const after = processSnapshot();
if (count(after.Ollama) || count(after.Listeners11434)) {
  throw new Error('Safety guard failed after diagnostic: Ollama/11434 present.');
}

const safeFixtureChats = snapshot.fixtureChats.map((chat) => ({
  idSha256: sha256(chat.id),
  titleSha256: sha256(chat.title ?? ''),
  projectIdSha256: sha256(chat.project_id ?? ''),
  connection: chat.connection ?? null,
  createdAt: chat.created_at,
  updatedAt: chat.updated_at,
}));
const safeFixtureMessages = snapshot.fixtureMessages.map((message) => ({
  chatIdSha256: sha256(message.chatId),
  messageIdSha256: sha256(message.messageId),
  role: message.role,
  createdAt: message.createdAt,
  updatedAt: message.updatedAt,
  status: message.status,
  partKinds: message.partKinds,
  textSha256: sha256(message.text),
  textCharCount: message.text.length,
  exactOutputMarker: message.text.trim() === 'WRITE: output.txt',
  metadata: redact(message.metadata),
  usage: message.usage,
}));
const safeDispatchIdentifiers = snapshot.devConsoleEntries
  .filter((entry) => entry.message === 'dispatch jarvis:send')
  .map((entry) => ({
    ts: entry.ts,
    chatIdSha256: sha256(entry.detail?.detail?.chatId ?? ''),
    turnHandleSha256: sha256(entry.detail?.detail?.cancellationKey ?? ''),
  }));

await writeFile(
  'deepseek-write-stuck-diagnostic.json',
  `${JSON.stringify(
    {
      schemaVersion: 1,
      task: 'PR31-DEEPSEEK-NATIVE-DISPOSABLE-WRITE-STUCK-DIAGNOSTIC',
      captureBoundary: 'post-failure read-only; fixture cleanup already completed in attempt-04 finally block',
      attemptWindow: {
        startedAt: new Date(ATTEMPT_STARTED_AT).toISOString(),
        failedAt: new Date(ATTEMPT_FAILED_AT).toISOString(),
      },
      processBefore: before,
      processAfter: after,
      officialPage: {
        capturedAt: snapshot.capturedAt,
        url: snapshot.url,
        title: snapshot.title,
        viewport: snapshot.viewport,
        buttons: snapshot.buttons,
        semanticState: snapshot.semanticState,
      },
      openCodeSystemLog: redact({
        version: snapshot.systemLog?.version ?? null,
        updatedAt: snapshot.systemLog?.updatedAt ?? null,
        steps: (snapshot.systemLog?.steps ?? [])
          .filter((step) => step.ts >= ATTEMPT_STARTED_AT - 5_000)
          .map(({ ts, kind, title, summary, status, durationMs, repeatCount }) => ({
            ts,
            kind,
            title,
            summary,
            status,
            durationMs: durationMs ?? null,
            repeatCount: repeatCount ?? null,
          })),
      }),
      devConsoleEntries: redact(snapshot.devConsoleEntries),
      dispatchIdentifierHashes: safeDispatchIdentifiers,
      fixtureCleanupEvidence: {
        remainingFixtureChatCount: safeFixtureChats.length,
        remainingFixtureMessageCount: safeFixtureMessages.length,
        chats: safeFixtureChats,
        messages: safeFixtureMessages,
      },
      artifact: '04-disposable-write-post-failure-state.png',
    },
    null,
    2,
  )}\n`,
  'utf8',
);

await browser.close();
