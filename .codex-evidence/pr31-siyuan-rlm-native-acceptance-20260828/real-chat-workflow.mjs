import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT = resolve(HERE, process.env.RUN_LABEL ?? 'real-chat-latest');
const EXPECTED_HEAD = process.env.EXPECTED_HEAD ?? '';
const HEAD = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const PROJECT_ROOT = 'C:\\Users\\viper\\AppData\\Roaming\\ai.jarvis.desktop\\Projects';
const FILE_PATH = `${PROJECT_ROOT}\\.vibespace-native-acceptance\\brief.md`;
const ROUTE = { providerId: 'opencode', connectionId: 'opencode-cli', modelId: 'opencode-go/deepseek-v4-flash-vision-exp' };
const CHAT_ID = `chat_pr31_real_workflow_${Date.now()}`;
const TITLE = 'PR31 Real Read Write Refine Upgrade';
const CONTINUE_ONLY = process.env.CONTINUE_ONLY === '1';
const UPGRADE_ONLY = process.env.UPGRADE_ONLY === '1';
const contents = {
  initial: '# Native Chat Workflow Fixture\n\nStatus: draft\nSummary: A small local note used only for official-native read, write, refine, and upgrade acceptance.\n',
  write: '# Native Chat Workflow Fixture\n\nStatus: written\nSummary: VibeSpace completed the authorized first revision through the exact native Chat route.\nEvidence: write-v1\n',
  refine: '# Native Chat Workflow Fixture\n\nStatus: refined\nSummary: VibeSpace refined the note into a concise verified acceptance artifact.\nEvidence: refine-v2\nQuality: clear, bounded, and local-only\n',
  upgrade: '# Native Chat Workflow Fixture\n\nStatus: upgraded\nSummary: VibeSpace upgraded the note with durable verification metadata.\nEvidence: upgrade-v3\nQuality: clear, bounded, local-only, and disk-verified\nNext: retain only as disposable native acceptance evidence\n',
};

let browser;
let page;
let priorChatId = null;
const report = { status: 'running', head: HEAD, route: ROUTE, chatId: CHAT_ID, startedAt: new Date().toISOString(), assertions: [], turns: [], artifacts: [], console: [], pageErrors: [], safety: [] };

function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function ps(script) { return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 20000 }).trim(); }
function safe(label) {
  const snapshot = JSON.parse(ps("$o=@(Get-CimInstance Win32_Process|? Name -eq 'ollama.exe');$p=@(Get-NetTCPConnection -State Listen -LocalPort 11434 -ErrorAction SilentlyContinue);$j=@(Get-CimInstance Win32_Process|? Name -eq 'jarvis.exe'|select ProcessId,ParentProcessId,ExecutablePath);[pscustomobject]@{ollama=$o.Count;port11434=$p.Count;jarvis=$j}|ConvertTo-Json -Depth 5 -Compress"));
  report.safety.push({ label, ...snapshot });
  if (snapshot.ollama || snapshot.port11434) throw new Error(`forbidden_ollama:${label}`);
  return snapshot;
}
function check(name, passed, details = {}) { report.assertions.push({ name, passed: Boolean(passed), ...details }); if (!passed) throw new Error(`assertion_failed:${name}`); }
async function disk() { const text = await readFile(FILE_PATH, 'utf8'); return { text, bytes: Buffer.byteLength(text), sha256: hash(text) }; }
async function messages() {
  return page.evaluate(async (chatId) => {
    const { db } = await import('/src/lib/db/index.ts');
    return (await db.messages.where('chat_id').equals(chatId).sortBy('created_at')).map((row) => ({
      id: String(row.id), role: row.role, createdAt: row.created_at, updatedAt: row.updated_at,
      parts: row.parts, usage: row.usage ?? null,
    }));
  }, CHAT_ID);
}
async function waitFor(description, observe, accept, timeoutMs = 120000) {
  const started = performance.now();
  let last;
  while (performance.now() - started < timeoutMs) {
    last = await observe();
    if (accept(last)) return last;
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error(`semantic_timeout:${description}:${JSON.stringify(last)?.slice(0, 1200)}`);
}
async function capture(name, state) {
  const target = resolve(OUT, name);
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
  await page.screenshot({ animations: 'allow', timeout: 1000 }).catch(() => undefined);
  await page.screenshot({ path: target, animations: 'allow' });
  const meta = await sharp(target).metadata();
  report.artifacts.push({ name, width: meta.width, height: meta.height, state });
}

async function seedChat() {
  return page.evaluate(async ({ chatId, title, route }) => {
    const [{ db }, { useAuthStore }, { useUIStore }, { writeChatRuntimePolicyState }, { writeChatReasoningEffort }] = await Promise.all([import('/src/lib/db/index.ts'), import('/src/stores/auth.ts'), import('/src/stores/ui.ts'), import('/src/features/chat/runtime/chatRuntimeSettingsStore.ts'), import('/src/features/chat/reasoningSlashStore.ts')]);
    const auth = useAuthStore.getState();
    const ui = useUIStore.getState();
    if (!auth.workspaceId || !auth.projectId) throw new Error('native_identity_missing');
    const prior = ui.activeChatId;
    const now = Date.now();
    await db.transaction('rw', db.chats, db.messages, async () => {
      await db.messages.where('chat_id').equals(chatId).delete();
      await db.chats.delete(chatId);
      await db.chats.add({ id: chatId, workspace_id: auth.workspaceId, project_id: auth.projectId, title, mode: 'chat', active_agent_ids: [], connection: { providerId: route.providerId, id: route.connectionId, modelId: route.modelId, mode: 'external-cli', authSource: 'opencode-provider-session' }, created_at: now, updated_at: now });
    });
    ui.setActiveChat(chatId); ui.setRoute('chat'); ui.setChatMode('chat');
    writeChatRuntimePolicyState(chatId, { settings: { effort: 'high', fastMode: 'auto', performance: 'quality', rlmEnabled: true }, access: 'write', approveAllForRun: false });
    writeChatReasoningEffort(chatId, 'high');
    return { prior, workspaceId: auth.workspaceId, projectId: auth.projectId, selection: useAuthStore.getState().chatModelSelection };
  }, { chatId: CHAT_ID, title: TITLE, route: ROUTE });
}

async function selectExactRoute() {
  const retained = await page.evaluate(async ({ chatId }) => {
    const [{ db }, { readChatRuntimePolicyState }, { readChatReasoningPreference }] = await Promise.all([import('/src/lib/db/index.ts'), import('/src/features/chat/runtime/chatRuntimeSettingsStore.ts'), import('/src/features/chat/reasoningSlashStore.ts')]);
    return { connection: (await db.chats.get(chatId))?.connection, runtime: readChatRuntimePolicyState(chatId), reasoning: readChatReasoningPreference(chatId) };
  }, { chatId: CHAT_ID });
  const retainedLabel = await page.getByRole('button', { name: 'Choose model' }).innerText();
  if (retained.connection?.providerId === ROUTE.providerId && retained.connection?.id === ROUTE.connectionId && retained.connection?.modelId === ROUTE.modelId && retained.runtime?.settings?.effort === 'high' && retained.reasoning?.effortOverride === 'high' && /deepseek-v4-flash-vision-exp/iu.test(retainedLabel)) {
    check('composer uses retained exact DeepSeek route at High effort', true, { visibleLabel: retainedLabel, retained });
    return retained;
  }
  if (await page.getByRole('listbox').isVisible().catch(() => false)) await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Choose model' }).click();
  const picker = page.getByRole('listbox');
  await picker.waitFor({ state: 'visible' });
  const expand = picker.getByRole('button', { name: 'Expand Opencode Go Models' });
  if (await expand.isVisible().catch(() => false)) await expand.click();
  const option = picker.getByRole('option').filter({ hasText: 'DeepSeek V4 Flash Vision Exp' }).filter({ hasText: 'Opencode Go provider connection' });
  await option.waitFor({ state: 'visible', timeout: 30000 });
  await option.click();
  const effortPicker = page.getByRole('listbox', { name: /DeepSeek V4 Flash Vision Exp effort options/u });
  if (await effortPicker.isVisible().catch(() => false)) {
    await effortPicker.getByRole('option', { name: 'High', exact: true }).click();
  }
  const persisted = await waitFor('exact model selection persisted', () => page.evaluate(async ({ chatId }) => {
    const [{ db }, { useAuthStore }] = await Promise.all([import('/src/lib/db/index.ts'), import('/src/stores/auth.ts')]);
    return { connection: (await db.chats.get(chatId))?.connection, selection: useAuthStore.getState().chatModelSelection };
  }, { chatId: CHAT_ID }), (state) => state.connection?.providerId === ROUTE.providerId && state.connection?.id === ROUTE.connectionId && state.connection?.modelId === ROUTE.modelId, 30000);
  const visibleLabel = await page.getByRole('button', { name: 'Choose model' }).innerText();
  check('composer visibly retains exact DeepSeek selection', /deepseek-v4-flash-vision-exp/iu.test(visibleLabel), { visibleLabel });
  return persisted;
}

async function setWriteMode() {
  const trigger = page.getByRole('button', { name: /Mode\. Open permissions panel\./u });
  await trigger.click();
  const modes = page.getByRole('listbox', { name: 'Chat modes' });
  await modes.waitFor({ state: 'visible' });
  await modes.getByRole('option', { name: /Agent Mode/u }).click();
  const access = page.getByRole('listbox', { name: 'Access and Approve All' });
  await access.waitFor({ state: 'visible' });
  const write = access.getByRole('option', { name: /Write Access/u });
  if ((await write.getAttribute('aria-selected')) !== 'true') await write.click();
  await page.keyboard.press('Escape');
}

async function approveExact(beforeIds, expectedAction, expectedContent) {
  const proposal = await waitFor('one exact action proposal', messages, (rows) => rows.flatMap((row) => row.parts.filter((part) => part.kind === 'action_proposal' && !beforeIds.has(row.id))).length > 0);
  const parts = proposal.flatMap((row) => row.parts.filter((part) => part.kind === 'action_proposal' && !beforeIds.has(row.id)).map((part) => ({ row, part })));
  check(`one ${expectedAction} proposal`, parts.length === 1, { proposals: parts.map(({ part }) => ({ action: part.action_id, status: part.status, params: part.params })) });
  const { part } = parts[0];
  const pathMatches = String(part.params?.path).replace(/^\\\\\?\\/, '').toLowerCase() === FILE_PATH.replace(/^\\\\\?\\/, '').toLowerCase();
  const rootMatches = !part.params?.root || String(part.params.root).replace(/^\\\\\?\\/, '').toLowerCase() === PROJECT_ROOT.replace(/^\\\\\?\\/, '').toLowerCase();
  const contentMatches = expectedContent === undefined || part.params?.content === expectedContent;
  if (part.action_id !== expectedAction || !pathMatches || !rootMatches || !contentMatches) {
    const approvalId = String(part.call_id).replace(/^jarvisapproval:/, '');
    const deny = page.locator(`[data-approval-id="${approvalId}"]`).getByRole('button', { name: 'Deny action' });
    if (await deny.isVisible().catch(() => false)) await deny.click();
    throw new Error(`unsafe_or_wrong_proposal_denied:${part.action_id}`);
  }
  const approvalId = String(part.call_id).replace(/^jarvisapproval:/, '');
  const card = page.locator(`[data-approval-id="${approvalId}"]`);
  await card.waitFor({ state: 'visible' });
  await card.getByRole('button', { name: 'Approve fixed action' }).click();
  await waitFor('action terminal success', messages, (rows) => rows.some((row) => row.parts.some((candidate) => candidate.kind === 'action_proposal' && candidate.call_id === part.call_id && candidate.status === 'success')));
  return { actionId: part.action_id, callIdSha256: hash(String(part.call_id)), pathMatches, rootMatches, contentMatches };
}

async function runTurn({ id, prompt, action, content }) {
  safe(`${id}:before`);
  const before = await messages();
  const beforeIds = new Set(before.map((row) => row.id));
  const started = performance.now();
  await page.getByRole('textbox', { name: 'Message' }).fill(prompt);
  await page.getByRole('button', { name: 'Send message' }).click();
  await page.getByRole('button', { name: 'Stop current request' }).waitFor({ state: 'visible', timeout: 15000 });
  const firstActivityAt = await waitFor('first durable assistant activity', messages, (rows) => rows.some((row) => !beforeIds.has(row.id) && (row.role === 'assistant' || row.role === 'agent') && row.parts.some((part) => (part.kind === 'text' && part.text.length > 0) || part.kind === 'action_proposal')), 120000).then(() => Math.round(performance.now() - started));
  const receipt = action ? await approveExact(beforeIds, action, content) : null;
  const firstTextAt = await waitFor('first streamed assistant text', messages, (rows) => rows.some((row) => !beforeIds.has(row.id) && (row.role === 'assistant' || row.role === 'agent') && row.parts.some((part) => part.kind === 'text' && part.text.length > 0)), 120000).then(() => Math.round(performance.now() - started));
  await page.getByRole('button', { name: 'Send message' }).waitFor({ state: 'visible', timeout: 120000 });
  const after = await messages();
  const created = after.filter((row) => !beforeIds.has(row.id));
  const assistant = created.filter((row) => row.role === 'assistant' || row.role === 'agent');
  const toolCalls = assistant.flatMap((row) => row.parts.filter((part) => part.kind === 'tool_call'));
  const toolResults = assistant.flatMap((row) => row.parts.filter((part) => part.kind === 'tool_result'));
  const observedUsage = assistant.map((row) => row.usage).filter(Boolean);
  const callIds = toolCalls.map((part) => part.call_id);
  const toolNames = toolCalls.map((part) => String(part.name ?? part.tool_name ?? part.action_id ?? ''));
  check(`${id} streamed`, firstTextAt < 120000, { firstTextAt });
  check(`${id} no duplicate tool dispatch`, new Set(callIds).size === callIds.length, { callIds });
  check(`${id} durable tool lifecycle balanced`, toolResults.every((result) => callIds.includes(result.call_id)), { toolCalls: toolCalls.length, toolResults: toolResults.length });
  check(`${id} short turn skips RLM and SiYuan`, toolNames.every((name) => !/rlm|siyuan|context/iu.test(name)), { toolNames });
  check(`${id} observed execution identity is exact DeepSeek OpenCode route`, observedUsage.some((usage) => usage.provider === ROUTE.providerId && usage.model === ROUTE.modelId), { observedUsage });
  const state = await disk();
  if (content !== undefined) check(`${id} exact disk bytes`, state.text === content, { expectedSha256: hash(content), actualSha256: state.sha256 });
  const connection = await page.evaluate(async (chatId) => { const { db } = await import('/src/lib/db/index.ts'); return (await db.chats.get(chatId))?.connection; }, CHAT_ID);
  check(`${id} exact persisted route`, connection?.providerId === ROUTE.providerId && connection?.id === ROUTE.connectionId && connection?.modelId === ROUTE.modelId, { connection });
  const turn = { id, durationMs: Math.round(performance.now() - started), firstActivityAt, firstTextAt, receipt, disk: { bytes: state.bytes, sha256: state.sha256 }, connection, assistantMessages: assistant.length, toolCalls: toolCalls.length, toolResults: toolResults.length };
  report.turns.push(turn);
  safe(`${id}:after`);
  return turn;
}

async function cleanupChat() {
  if (!page) return;
  await page.evaluate(async ({ chatId, prior }) => { const [{ db }, { useUIStore }] = await Promise.all([import('/src/lib/db/index.ts'), import('/src/stores/ui.ts')]); await db.transaction('rw', db.chats, db.messages, async () => { await db.messages.where('chat_id').equals(chatId).delete(); await db.chats.delete(chatId); }); const ui = useUIStore.getState(); ui.setActiveChat(prior || null); ui.setRoute('chat'); }, { chatId: CHAT_ID, prior: priorChatId });
}

await mkdir(OUT, { recursive: true });
try {
  if (!EXPECTED_HEAD || HEAD !== EXPECTED_HEAD) throw new Error(`immutable_head_mismatch:${EXPECTED_HEAD}:${HEAD}`);
  await mkdir(dirname(FILE_PATH), { recursive: true });
  const startingContent = UPGRADE_ONLY ? contents.refine : CONTINUE_ONLY ? contents.write : contents.initial;
  await writeFile(FILE_PATH, startingContent, 'utf8');
  const initialDisk = await disk();
  check(`isolated fixture starts at exact ${UPGRADE_ONLY ? 'refined' : CONTINUE_ONLY ? 'written' : 'draft'} bytes`, initialDisk.text === startingContent, { sha256: initialDisk.sha256 });
  const start = safe('start'); check('one official jarvis process', start.jarvis.length === 1, { jarvis: start.jarvis });
  browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
  page = browser.contexts().flatMap((context) => context.pages()).find((candidate) => candidate.url().includes('localhost:5173'));
  check('official native page attached', Boolean(page), { url: page?.url() });
  page.on('console', (message) => report.console.push({ type: message.type(), text: message.text().slice(0, 3000) }));
  page.on('pageerror', (error) => report.pageErrors.push(String(error).slice(0, 3000)));
  const ambient = page.getByRole('dialog', { name: 'Ambient mode. Press any key to wake.' });
  if (await ambient.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await ambient.waitFor({ state: 'hidden', timeout: 10000 });
  }
  const seeded = await seedChat(); priorChatId = seeded.prior;
  await page.getByText(TITLE, { exact: true }).first().waitFor({ state: 'visible' });
  await page.getByRole('textbox', { name: 'Message' }).waitFor({ state: 'visible' });
  await setWriteMode();
  const selected = await selectExactRoute();
  check('exact DeepSeek route selected and persisted', true, selected);

  if (!CONTINUE_ONLY && !UPGRADE_ONLY) {
    await runTurn({ id: 'read', prompt: `Read the existing file ${FILE_PATH} with the registered files.read action. Do not use RLM, SiYuan, a terminal, or a substitute path. After the approved read, summarize its Status and Evidence in one short sentence.`, action: 'files.read' });
    await runTurn({ id: 'write', prompt: `Replace ${FILE_PATH} using exactly one registered files.edit action with these exact UTF-8 bytes, including the final newline:\n\n${contents.write}\nDo not use a terminal, patch, helper file, or another path.`, action: 'files.edit', content: contents.write });
  }
  if (!UPGRADE_ONLY) await runTurn({ id: 'refine', prompt: `Refine the exact existing file ${FILE_PATH} using exactly one registered files.edit action and these exact UTF-8 bytes, including the final newline:\n\n${contents.refine}\nDo not use a terminal, patch, helper file, or another path.`, action: 'files.edit', content: contents.refine });
  await runTurn({ id: 'upgrade', prompt: `Upgrade the exact existing file ${FILE_PATH} using exactly one registered files.edit action and these exact UTF-8 bytes, including the final newline:\n\n${contents.upgrade}\nDo not use a terminal, patch, helper file, or another path.`, action: 'files.edit', content: contents.upgrade });

  const finalRows = await messages();
  const finalAssistantText = finalRows
    .filter((row) => row.role === 'assistant' || row.role === 'agent')
    .flatMap((row) => row.parts.filter((part) => part.kind === 'text').map((part) => part.text))
    .join('\n');
  check('successful edit final prose does not request pending access approval or execution', !/(still|again|first).{0,80}(need|require).{0,80}(access|approval|execution)|not.{0,40}(executed|applied)|cannot.{0,80}(edit|write|complete)/iu.test(finalAssistantText), { finalAssistantText });
  const disclosures = page.getByRole('button', { name: /Show activity details/u });
  check('each response phase renders exactly one activity ledger', (await disclosures.count()) === report.turns.length, { disclosureCount: await disclosures.count(), responsePhases: report.turns.length });
  const disclosure = disclosures.last();
  await disclosure.waitFor({ state: 'visible' });
  const renderedText = await page.locator('body').innerText();
  check('upgrade ledger has no adjacent zero-action summary', !/0 recorded actions|Worked for 0s\s*[·\-]\s*0 actions/iu.test(renderedText), { zeroActionMatches: renderedText.match(/.{0,80}(?:0 recorded actions|Worked for 0s\s*[·\-]\s*0 actions).{0,80}/giu) ?? [] });
  check('collapsed upgrade ledger reports one edit', /Edited\s+1\b/iu.test(renderedText), { editedMatches: renderedText.match(/.{0,60}Edited\s+1\b.{0,60}/giu) ?? [] });
  await capture('01-real-chat-collapsed.png', { turns: report.turns });
  await disclosure.click();
  const inspector = page.getByRole('region', { name: 'Assistant activity details' });
  await inspector.waitFor({ state: 'visible' });
  const inspectorText = await inspector.innerText();
  check('expanded ledger shows truthful edited-file receipt', /Edited file/iu.test(inspectorText) && /brief\.md/iu.test(inspectorText), { inspectorText: inspectorText.slice(0, 5000) });
  await capture('02-real-chat-expanded.png', { inspector: inspectorText.slice(0, 5000) });
  check('no page errors', report.pageErrors.length === 0, { pageErrors: report.pageErrors });
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = String(error?.stack ?? error);
  if (page) { try { await capture('FAIL-real-chat-workflow.png', { failure: report.failure }); } catch {} }
} finally {
  try { await cleanupChat(); } catch (error) { report.cleanupFailure = String(error); report.status = 'failed'; }
  safe('final'); report.completedAt = new Date().toISOString();
  await writeFile(resolve(OUT, 'real-chat-workflow.json'), `${JSON.stringify(report, null, 2)}\n`);
  if (browser) await browser.close();
}
if (report.status !== 'passed') process.exitCode = 1;
