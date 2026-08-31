import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT = resolve(HERE, process.env.RUN_LABEL ?? 'chat-current');
const HEAD = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const EXPECTED_HEAD = process.env.EXPECTED_HEAD ?? '';
const FIXTURE = 'chat_pr31_current_visual_0828';
const TITLE = 'PR31 Current Chat Visual';
const WIDTH = Number(process.env.VIEWPORT_WIDTH ?? 1586);
const HEIGHT = Number(process.env.VIEWPORT_HEIGHT ?? 992);
const report = { status: 'running', head: HEAD, startedAt: new Date().toISOString(), assertions: [], artifacts: [], console: [], pageErrors: [], safety: [] };
let browser;
let page;
let priorChatId = null;

function ps(script) {
  return execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).trim();
}
function safety(label) {
  const value = JSON.parse(ps("$o=@(Get-CimInstance Win32_Process|? Name -eq 'ollama.exe');$p=@(Get-NetTCPConnection -State Listen -LocalPort 11434 -ErrorAction SilentlyContinue);$j=@(Get-CimInstance Win32_Process|? Name -eq 'jarvis.exe'|select ProcessId,ParentProcessId,ExecutablePath);[pscustomobject]@{ollama=$o.Count;port11434=$p.Count;jarvis=$j}|ConvertTo-Json -Depth 5 -Compress"));
  report.safety.push({ label, ...value });
  if (value.ollama || value.port11434) throw new Error(`forbidden_ollama:${label}`);
  return value;
}
function check(name, passed, details = {}) {
  report.assertions.push({ name, passed: Boolean(passed), ...details });
  if (!passed) throw new Error(`assertion_failed:${name}`);
}
async function shot(name, state) {
  const path = resolve(OUT, name);
  // WebView2 defers native lazy-image decode until the first capture request.
  // Warm the exact visible assets once so the acceptance screenshot itself is
  // deterministic instead of spending its entire timeout waiting on decode.
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((image) =>
        image.complete ? Promise.resolve() : new Promise((resolveImage) => {
          image.addEventListener('load', resolveImage, { once: true });
          image.addEventListener('error', resolveImage, { once: true });
        }),
      ),
    );
  });
  await page.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}',
  });
  await page.screenshot({ animations: 'allow', timeout: 1_000 }).catch(() => undefined);
  await page.screenshot({ path, animations: 'allow' });
  const meta = await sharp(path).metadata();
  check(`${name} direct ${WIDTH}x${HEIGHT}`, meta.width === WIDTH && meta.height === HEIGHT, { width: meta.width, height: meta.height });
  report.artifacts.push({ path, width: meta.width, height: meta.height, state });
}

async function installFixture() {
  return page.evaluate(async ({ fixture, title }) => {
    const { db } = await import('/src/lib/db/index.ts');
    const { useAuthStore } = await import('/src/stores/auth.ts');
    const { useUIStore } = await import('/src/stores/ui.ts');
    const auth = useAuthStore.getState();
    const prior = useUIStore.getState().activeChatId;
    if (!auth.workspaceId) throw new Error('workspace_missing');
    const now = Date.now();
    const usage = { input_tokens: 2048, output_tokens: 640, provider: 'opencode', model: 'opencode-go/deepseek-v4-flash-vision-exp' };
    const source = (id) => ({
      kind: 'jarvis_source_ref',
      source: { id, kind: 'context_node', label: 'Project context map', trust: 'app_verified', sensitivity: 'private' },
    });
    const turns = [
      { verb: 'Read', tool: 'files.read', call: 'read-1', file: 'brief.md', prompt: 'Read the scoped brief and summarize it.', working: 'I read the scoped brief and verified its current contents.', final: 'The approved read completed successfully.' },
      { verb: 'Edited', tool: 'files.edit', call: 'edit-1', file: 'brief.md', prompt: 'Refine the scoped brief.', working: 'I refined the brief and preserved its requested structure.', final: 'The approved refinement completed successfully.' },
      { verb: 'Edited', tool: 'files.edit', call: 'edit-2', file: 'brief.md', prompt: 'Upgrade the scoped brief.', working: 'I upgraded the brief and checked the revised content.', final: 'The approved upgrade completed successfully.' },
      { verb: 'Verified', tool: 'verify.check', call: 'verify-1', file: 'brief.md', prompt: 'Verify the completed brief.', working: 'I verified the completed brief and found no remaining blocker.', final: 'Verification completed successfully; no further action is recorded.' },
    ];
    await db.transaction('rw', db.chats, db.messages, async () => {
      await db.messages.where('chat_id').equals(fixture).delete();
      await db.chats.delete(fixture);
      await db.chats.add({ id: fixture, workspace_id: auth.workspaceId, ...(auth.projectId ? { project_id: auth.projectId } : {}), title, mode: 'chat', active_agent_ids: [], created_at: now - 100000, updated_at: now });
      const messages = turns.flatMap((turn, index) => {
        const stamp = now - 120000 + index * 26000;
        const toolParts = [
          { kind: 'tool_call', call_id: turn.call, tool: turn.tool, args: { path: turn.file } },
          { kind: 'tool_result', call_id: turn.call, result: { ok: true } },
        ];
        return [
          { id: `${fixture}_user_${index}`, chat_id: fixture, role: 'user', parts: [{ kind: 'text', text: turn.prompt }], created_at: stamp, updated_at: stamp },
          { id: `${fixture}_tool_${index}`, chat_id: fixture, role: 'assistant', parts: [
            { kind: 'text', text: turn.working },
            ...toolParts,
          ], usage, created_at: stamp + 2000, updated_at: stamp + 5000 },
          { id: `${fixture}_final_${index}`, chat_id: fixture, role: 'assistant', parts: [{ kind: 'text', text: turn.final }, source(`context-${index}`)], usage, created_at: stamp + 7000, updated_at: stamp + 9000 },
        ];
      });
      await db.messages.bulkPut(messages);
    });
    useUIStore.getState().setActiveChat(fixture);
    useUIStore.getState().setRoute('chat');
    return { prior, workspaceId: auth.workspaceId };
  }, { fixture: FIXTURE, title: TITLE });
}

async function recordActivity() {
  return page.evaluate(async ({ fixture }) => {
    const { useChatActivityStore } = await import('/src/features/chat/activity/activityStore.ts');
    const activity = useChatActivityStore.getState();
    activity.clearChat(fixture);
    const now = Date.now();
    const events = [
      ['read', 'file', 'file', 'done', 'Read ChatThread.tsx', 'app/src/features/chat/ChatThread.tsx'],
      ['search', 'url', 'context', 'done', 'Searched activity ledger', undefined],
      ['command', 'tool', 'coordination', 'done', 'Ran focused tests', undefined],
      ['edit', 'diff', 'writing', 'done', 'Edited PluginUsageCard.tsx', 'app/src/features/chat/PluginUsageCard.tsx'],
      ['verify', 'tool', 'response', 'done', 'Verified native Chat state', undefined],
      ['stream', 'agent', 'response', 'running', 'Compiling final evidence bundle', undefined],
    ];
    events.forEach(([id, kind, category, status, title, filePath], index) => activity.record({ id: `${fixture}_${id}`, chatId: fixture, kind, category, status, title, ...(filePath ? { filePath } : {}), ts: now - 70000 + index * 8000, startedAt: now - 70000 + index * 8000, ...(status === 'done' ? { endedAt: now - 68000 + index * 8000 } : {}) }));
    return events.length;
  }, { fixture: FIXTURE });
}

async function cleanup() {
  await page.evaluate(async ({ fixture, prior }) => {
    const { db } = await import('/src/lib/db/index.ts');
    const { useUIStore } = await import('/src/stores/ui.ts');
    const { useChatActivityStore } = await import('/src/features/chat/activity/activityStore.ts');
    useChatActivityStore.getState().clearChat(fixture);
    await db.transaction('rw', db.chats, db.messages, async () => { await db.messages.where('chat_id').equals(fixture).delete(); await db.chats.delete(fixture); });
    useUIStore.getState().setActiveChat(prior || null);
    useUIStore.getState().setRoute('chat');
  }, { fixture: FIXTURE, prior: priorChatId });
}

await mkdir(OUT, { recursive: true });
try {
  if (EXPECTED_HEAD && HEAD !== EXPECTED_HEAD) throw new Error(`immutable_head_mismatch:${EXPECTED_HEAD}:${HEAD}`);
  const start = safety('start');
  check('one official jarvis process', start.jarvis.length === 1, { jarvis: start.jarvis });
  browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
  page = browser.contexts().flatMap((context) => context.pages()).find((candidate) => candidate.url().includes('localhost:5173'));
  check('official native page attached', Boolean(page), { url: page?.url() });
  page.on('console', (message) => report.console.push({ type: message.type(), text: message.text().slice(0, 2000) }));
  page.on('pageerror', (error) => report.pageErrors.push(String(error).slice(0, 2000)));
  await page.setViewportSize({ width: WIDTH, height: HEIGHT });
  const fixture = await installFixture();
  priorChatId = fixture.prior;
  await page.getByText(TITLE, { exact: true }).first().click();
  await page.getByText('Verify the completed brief.', { exact: true }).waitFor({ state: 'visible' });
  const eventCount = 0;
  const disclosures = page.getByRole('button', { name: /Show activity details/u });
  await disclosures.last().waitFor({ state: 'visible', timeout: 30000 });
  const disclosureCount = await disclosures.count();
  const ownership = await page.locator('[data-assistant-activity-ledger="true"]').evaluateAll((nodes) => nodes.map((node) => {
    const precedingMessages = [...document.querySelectorAll('[data-message-id]')].filter((candidate) =>
      Boolean(candidate.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING),
    );
    const cursor = precedingMessages.at(-1);
    const disclosure = node.querySelector('button[aria-expanded]');
    return {
      sourceMessageId: cursor?.getAttribute('data-message-id') ?? null,
      summary: node.querySelector('.assistant-activity-ledger__phase-summary')?.textContent?.trim() ?? '',
      disclosureText: disclosure?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      active: node.getAttribute('data-ledger-active'),
    };
  }));
  report.ledgerOwnership = ownership;
  check('exactly one durable activity disclosure per user turn', disclosureCount === 4, { disclosureCount, ownership });
  check('all four ledgers map to tool-bearing assistant messages', ownership.length === 4 && ownership.every((item) => item.sourceMessageId?.includes('_tool_')), { ownership });
  await shot('01-chat-collapsed-four-turn.png', { ledger: 'collapsed', eventCount, ownership });
  const stableDisclosures = page.locator('[data-assistant-activity-ledger="true"] button[aria-expanded="false"]');
  for (let index = disclosureCount - 1; index >= 0; index -= 1) await stableDisclosures.nth(index).click({ force: WIDTH < 800 });
  const inspectors = page.getByRole('region', { name: 'Assistant activity details' });
  await inspectors.last().waitFor({ state: 'visible' });
  const details = (await inspectors.allInnerTexts()).join('\n');
  const order = ['Read file', 'Edited file', 'Verified check'];
  for (const text of order) check(`expanded activity contains ${text}`, details.includes(text), { details });
  check('activity dropdown shows safe basenames rather than absolute paths', details.includes('brief.md') && !details.includes('C:\\Users\\'), { details });
  await shot('02-chat-expanded-ordered-activity.png', { ledger: 'expanded', order, details: details.slice(0, 5000) });
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = String(error?.stack ?? error);
  if (page) { try { await shot('FAIL-chat-current-visual.png', { failure: report.failure }); } catch {} }
} finally {
  if (page) { try { await cleanup(); } catch (error) { report.cleanupFailure = String(error); report.status = 'failed'; } }
  safety('final');
  report.completedAt = new Date().toISOString();
  await writeFile(resolve(OUT, 'chat-current-visual.json'), `${JSON.stringify(report, null, 2)}\n`);
  if (browser) await browser.close();
}
if (report.status !== 'passed') process.exitCode = 1;
