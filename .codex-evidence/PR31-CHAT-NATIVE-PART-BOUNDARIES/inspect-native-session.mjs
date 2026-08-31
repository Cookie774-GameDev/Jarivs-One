import { chromium } from '../../node_modules/playwright/index.mjs';

const generation = process.argv[2];
const sessionId = process.argv[3];
const directory = process.argv[4];

if (!generation || !sessionId || !directory) {
  throw new Error('usage: inspect-native-session.mjs <generation> <sessionId> <directory>');
}

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
try {
  const pages = browser.contexts().flatMap((context) => context.pages());
  const page = pages.find((candidate) => candidate.url().startsWith('http://127.0.0.1:5174'));
  if (!page) throw new Error('official VibeSpace WebView was not found');

  const snapshot = await page.evaluate(
    async ({ generation: nativeGeneration, sessionId: nativeSessionId, directory: nativeDirectory }) => {
      const invoke = window.__TAURI_INTERNALS__?.invoke;
      if (typeof invoke !== 'function') throw new Error('native Tauri invoke bridge is unavailable');

      const request = async (route) => {
        const response = await invoke('opencode_server_request', {
          request: {
            generation: nativeGeneration,
            directory: nativeDirectory,
            route,
            timeoutMs: 30_000,
          },
        });
        return response.body ? JSON.parse(response.body) : null;
      };

      const [status, messages] = await Promise.all([
        request({ kind: 'session_status' }),
        request({ kind: 'session_messages', sessionId: nativeSessionId, limit: 32 }),
      ]);
      const rows = Array.isArray(messages) ? messages : [];
      return {
        statusEntry: status?.[nativeSessionId] ?? null,
        messageCount: rows.length,
        messages: rows.map((message) => ({
          role: message?.info?.role ?? null,
          created: message?.info?.time?.created ?? null,
          completed: message?.info?.time?.completed ?? null,
          errorName: message?.info?.error?.name ?? null,
          partCount: Array.isArray(message?.parts) ? message.parts.length : 0,
          parts: Array.isArray(message?.parts)
            ? message.parts.map((part) => ({
                type: part?.type ?? null,
                textLength: typeof part?.text === 'string' ? part.text.length : null,
                tool: part?.type === 'tool' ? part?.tool ?? null : null,
                status: part?.type === 'tool' ? part?.state?.status ?? null : null,
                hasCallIdentity:
                  part?.type === 'tool'
                    ? Boolean(part?.callID ?? part?.callId ?? part?.id)
                    : null,
                callIdentityType:
                  part?.type === 'tool'
                    ? typeof (part?.callID ?? part?.callId ?? part?.id)
                    : null,
              }))
            : [],
        })),
        dom: {
          title: document.title,
          url: location.href,
          bodyText: (document.body.innerText ?? '').slice(0, 1_500),
          running: document.body.textContent?.includes('RUNNING') ?? false,
          answerCount: document.querySelectorAll('.agentic-answer').length,
          ledgerCount: document.querySelectorAll('[data-assistant-activity-ledger="true"]').length,
          checkpointCount: document.querySelectorAll('.agentic-phase-checkpoint').length,
        },
      };
    },
    { generation, sessionId, directory },
  );
  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
} finally {
  await browser.close();
}
