import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, db, openDb } from '@/lib/db';
import { terminalScrollbackRepo } from '@/lib/db/repositories';
import type { TerminalSessionId } from '@/types';
import {
  appendTerminalScrollbackDurably,
  decodeTerminalScrollbackChunk,
} from './terminalScrollbackDurability';

describe('terminal scrollback IndexedDB integration', () => {
  beforeEach(async () => {
    await openDb();
    await db.terminal_scrollback.clear();
  });

  afterAll(async () => {
    await closeDb();
    await db.delete();
  });

  it('round-trips ordered Unicode output through the real durable repository', async () => {
    const sessionId = 'terminal-integration' as TerminalSessionId;
    await Promise.all([
      appendTerminalScrollbackDurably(sessionId, 'first λ\n'),
      appendTerminalScrollbackDurably(sessionId, 'second 🚀\n'),
    ]);

    const chunks = await terminalScrollbackRepo.listBySession(sessionId);

    expect(chunks.map((chunk) => chunk.chunk_seq)).toEqual([0, 1]);
    expect(chunks.map((chunk) => decodeTerminalScrollbackChunk(chunk.data)).join('')).toBe(
      'first λ\nsecond 🚀\n',
    );
  });

  it('keeps only the newest chunks when the repository retention cap is reached', async () => {
    const sessionId = 'terminal-pruned' as TerminalSessionId;
    await terminalScrollbackRepo.append(sessionId, btoa('first'), 2);
    await terminalScrollbackRepo.append(sessionId, btoa('second'), 2);
    await terminalScrollbackRepo.append(sessionId, btoa('third'), 2);

    const chunks = await terminalScrollbackRepo.listBySession(sessionId);

    expect(chunks.map((chunk) => chunk.chunk_seq)).toEqual([1, 2]);
    expect(chunks.map((chunk) => decodeTerminalScrollbackChunk(chunk.data))).toEqual([
      'second',
      'third',
    ]);
  });
});
