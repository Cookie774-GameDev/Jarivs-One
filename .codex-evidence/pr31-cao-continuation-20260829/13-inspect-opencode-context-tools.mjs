import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import {
  assertZeroOllama,
  attachOfficialNative,
  captureSafetySnapshot,
  readWindowsNativeState,
  sanitizeEvidence,
} from '../../scripts/pr31-native-acceptance-harness.mjs';

const evidenceDirectory = path.dirname(new URL(import.meta.url).pathname.slice(1));
const jarvisPid = Number(process.env.VS_NATIVE_JARVIS_PID);
const chatId = process.env.VS_PHASE0_CHAT_ID?.trim() ?? '';
const outputPrefix = process.env.VS_PHASE0_TOOLS_PREFIX?.trim() || '13-opencode-context-tools';
if (!chatId) throw new Error('phase0_chat_id_missing');
const attachment = await attachOfficialNative({ chromium, cdpPort: 9223, jarvisPid });
const state = await attachment.page.evaluate(async (expectedChatId) => {
  const { db } = await import('/src/lib/db/index.ts');
  const persisted = await db.messages
    .where('chat_id')
    .equals(expectedChatId)
    .filter((message) => message.role === 'assistant' && String(message.id).startsWith('msg_jreq_'))
    .last();
  const requestKey = persisted ? String(persisted.id).slice(4) : '';
  if (!requestKey) throw new Error('phase0_request_key_missing');
  const registryKey = 'vibespace.opencode-session-registry.v1';
  const registry = JSON.parse(localStorage.getItem(registryKey) ?? '{}');
  const matches = [];
  const candidates = [];
  for (const [scopeKey, chats] of Object.entries(registry)) {
    const scope = JSON.parse(scopeKey);
    for (const [candidateChatId, candidate] of Object.entries(chats ?? {})) {
      candidates.push({
        chatId: candidateChatId,
        sessionId: candidate?.sessionId ?? null,
        generation: candidate?.runtimeGeneration ?? null,
        workingDirectory: scope[4] || '',
      });
    }
    const mapping = chats?.[requestKey];
    if (!mapping?.sessionId || !mapping?.runtimeGeneration) continue;
    matches.push({
      sessionId: mapping.sessionId,
      generation: mapping.runtimeGeneration,
      workingDirectory: scope[4] || '',
    });
  }
  if (matches.length !== 1) {
    return {
      chatId: expectedChatId,
      requestKey,
      mappingError: 'phase0_opencode_session_mapping_invalid',
      matchCount: matches.length,
      candidates: candidates.slice(-20),
      messageCount: 0,
      contextToolCount: 0,
      contextTools: [],
    };
  }
  const match = matches[0];
  const { nativeOpenCodeRequest } = await import(
    '/src/lib/harness/openCodeNativeTransport.ts'
  );
  const query = new URLSearchParams({ limit: '100' });
  if (match.workingDirectory) query.set('directory', match.workingDirectory);
  const response = await nativeOpenCodeRequest(
    match.generation,
    `/session/${encodeURIComponent(match.sessionId)}/message?${query}`,
    {},
    30_000,
  );
  if (!response.ok) throw new Error(`phase0_opencode_messages_${response.status}`);
  const payload = await response.json();
  const messages = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  const contextTools = [];
  for (const message of messages) {
    for (const part of Array.isArray(message?.parts) ? message.parts : []) {
      if (part?.type !== 'tool' || part?.tool !== 'vibespace_context') continue;
      const toolState = part.state ?? {};
      const outputText = typeof toolState.output === 'string' ? toolState.output : '';
      let gatewaySummary = null;
      try {
        const wire = JSON.parse(outputText);
        const promptBlock = typeof wire?.data?.promptBlock === 'string' ? wire.data.promptBlock : '';
        if (promptBlock) {
          gatewaySummary = {
            promptBlockLength: promptBlock.length,
            evidenceSections: promptBlock
              .split(/^### Evidence \d+\s*$/gmu)
              .slice(1)
              .map((section) => section.trim().slice(0, 2_000)),
            receipt: wire.data.receipt ?? null,
          };
        }
      } catch {
        gatewaySummary = null;
      }
      contextTools.push({
        messageId: message?.info?.id ?? null,
        callId: part.callID ?? part.callId ?? null,
        status: toolState.status ?? null,
        input: toolState.input ?? null,
        output: outputText ? outputText.slice(0, 16_000) : null,
        gatewaySummary,
        error: typeof toolState.error === 'string' ? toolState.error.slice(0, 2_000) : null,
        metadata: toolState.metadata ?? null,
      });
    }
  }
  return {
    chatId: expectedChatId,
    requestKey,
    sessionId: match.sessionId,
    messageCount: messages.length,
    contextToolCount: contextTools.length,
    contextTools,
  };
}, chatId);
const report = sanitizeEvidence({
  status: 'captured',
  capturedAt: new Date().toISOString(),
  identity: attachment.identity,
  state,
  safety: assertZeroOllama(
    captureSafetySnapshot(await readWindowsNativeState(), 'phase0:opencode-context-tools'),
  ),
});
await writeFile(
  path.join(evidenceDirectory, `${outputPrefix}.json`),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
setTimeout(() => process.exit(0), 50);
