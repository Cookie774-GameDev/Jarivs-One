import { chromium } from '../../node_modules/playwright/index.mjs';

const output = process.argv[2];
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
try {
  const page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((candidate) => candidate.url().startsWith('http://127.0.0.1:5174'));
  if (!page) throw new Error('official VibeSpace WebView was not found');
  const snapshot = await page.evaluate(async () => {
    const chatId = document.querySelector('[data-agentic-console]')?.getAttribute('data-chat-id');
    const persistedMessages = await new Promise((resolve) => {
      const open = indexedDB.open('jarvis-v1');
      open.onerror = () => resolve([]);
      open.onsuccess = () => {
        const database = open.result;
        const request = database.transaction('messages', 'readonly').objectStore('messages').getAll();
        request.onerror = () => {
          database.close();
          resolve([]);
        };
        request.onsuccess = () => {
          const rows = (Array.isArray(request.result) ? request.result : [])
            .filter((message) => !chatId || String(message?.chat_id) === chatId)
            .map((message) => ({
              role: message?.role ?? null,
              createdAt: message?.created_at ?? null,
              updatedAt: message?.updated_at ?? null,
              parts: Array.isArray(message?.parts)
                ? message.parts.map((part) => ({
                    kind: part?.kind ?? null,
                    textLength: typeof part?.text === 'string' ? part.text.length : null,
                    tool: part?.kind === 'tool_call' ? part?.tool_name ?? null : null,
                    status:
                      part?.kind === 'tool_result'
                        ? part?.ok === true
                          ? 'completed'
                          : 'failed'
                        : null,
                  }))
                : [],
            }));
          database.close();
          resolve(rows);
        };
      };
    });
    return {
    title: document.title,
    url: location.href,
    theme: document.documentElement.dataset.theme ?? null,
    themePreference: document.documentElement.dataset.themePreference ?? null,
    bodyText: (document.body.innerText ?? '').slice(0, 2_500),
    selectors: {
      answers: document.querySelectorAll('.agentic-answer').length,
      ledgers: document.querySelectorAll('[data-assistant-activity-ledger="true"]').length,
      checkpoints: document.querySelectorAll('.agentic-phase-checkpoint').length,
      messages: document.querySelectorAll('[data-message-id]').length,
      textareas: document.querySelectorAll('textarea').length,
      buttons: document.querySelectorAll('button').length,
    },
    visibleButtons: [...document.querySelectorAll('button')]
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((button) => button.getAttribute('aria-label') || button.innerText.trim())
      .filter(Boolean),
    transcript: [...document.querySelectorAll('.agentic-transcript > *')].map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        tag: node.tagName,
        className: node.className,
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        height: Math.round(rect.height),
        textLength: (node.textContent ?? '').length,
      };
    }),
    matchingTextAncestors: (() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const matches = [];
      while (walker.nextNode()) {
        const text = walker.currentNode.textContent ?? '';
        if (!text.includes('Understood')) continue;
        const element = walker.currentNode.parentElement;
        const rect = element?.getBoundingClientRect();
        matches.push({
          tag: element?.tagName ?? null,
          className: element?.className ?? null,
          hidden: element ? getComputedStyle(element).display === 'none' : null,
          top: rect ? Math.round(rect.top) : null,
          height: rect ? Math.round(rect.height) : null,
        });
      }
      return matches;
    })(),
    databases: await Promise.all(
      (await indexedDB.databases()).map(
        (database) =>
          new Promise((resolve) => {
            if (!database.name) return resolve({ name: null, stores: [] });
            const open = indexedDB.open(database.name);
            open.onerror = () => resolve({ name: database.name, stores: ['<open-error>'] });
            open.onsuccess = () => {
              const stores = [...open.result.objectStoreNames];
              open.result.close();
              resolve({ name: database.name, stores });
            };
          }),
      ),
    ),
    persistedMessages,
  };
  });
  if (output) await page.screenshot({ path: output, type: 'png' });
  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
} finally {
  await browser.close();
}
