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
const outputPrefix = process.env.VS_PHASE0_STORAGE_PREFIX?.trim() || '12-grounded-chat-storage';
if (!chatId) throw new Error('phase0_chat_id_missing');
const attachment = await attachOfficialNative({ chromium, cdpPort: 9223, jarvisPid });
const state = await attachment.page.evaluate(async (expectedChatId) => {
  const { db } = await import('/src/lib/db/index.ts');
  const messages = await db.messages.where('chat_id').equals(expectedChatId).sortBy('created_at');
  return {
    chatId: expectedChatId,
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      createdAt: message.created_at,
      usage: message.usage ?? null,
      parts: message.parts.map((part) => {
        if (part.kind === 'text') {
          return { kind: part.kind, length: part.text.length, ending: part.text.slice(-1_200) };
        }
        if (part.kind === 'reasoning') {
          return { kind: part.kind, length: part.text.length };
        }
        if (part.kind === 'tool_call') {
          return { kind: part.kind, tool: part.tool, callId: part.call_id, args: part.args };
        }
        if (part.kind === 'tool_result') {
          return {
            kind: part.kind,
            callId: part.call_id,
            error: part.error ?? null,
            result: part.result ?? null,
          };
        }
        if (part.kind === 'jarvis_source_ref') return { kind: part.kind, source: part.source };
        if (part.kind === 'context_inspector') return { kind: part.kind, inspector: part.inspector };
        return { kind: part.kind };
      }),
    })),
  };
}, chatId);
const report = sanitizeEvidence({
  status: 'captured',
  capturedAt: new Date().toISOString(),
  identity: attachment.identity,
  state,
  safety: assertZeroOllama(
    captureSafetySnapshot(await readWindowsNativeState(), 'phase0:chat-storage'),
  ),
});
await writeFile(
  path.join(evidenceDirectory, `${outputPrefix}.json`),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
setTimeout(() => process.exit(0), 50);
