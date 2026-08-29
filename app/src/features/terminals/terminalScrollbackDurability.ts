import type { TerminalSessionId } from '@/types';

const DEFAULT_SCROLLBACK_CHUNK_BYTES = 10 * 1024;
const MAX_SCROLLBACK_CHUNK_BYTES = 64 * 1024;
const sessionWrites = new Map<string, Promise<void>>();
let repositoryPromise: Promise<typeof import('@/lib/db/repositories')> | null = null;

function loadRepositories(): Promise<typeof import('@/lib/db/repositories')> {
  repositoryPromise ??= import('@/lib/db/repositories');
  return repositoryPromise;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export function encodeTerminalScrollbackChunks(
  raw: string,
  maxBytes = DEFAULT_SCROLLBACK_CHUNK_BYTES,
): string[] {
  if (!raw) return [];
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 4 || maxBytes > MAX_SCROLLBACK_CHUNK_BYTES) {
    throw new Error('Invalid terminal scrollback chunk size.');
  }
  const bytes = new TextEncoder().encode(raw);
  const chunks: string[] = [];
  for (let start = 0; start < bytes.length;) {
    let end = Math.min(bytes.length, start + maxBytes);
    if (end < bytes.length) {
      while (end > start && (bytes[end]! & 0xc0) === 0x80) end -= 1;
    }
    if (end <= start) end = Math.min(bytes.length, start + maxBytes);
    chunks.push(bytesToBase64(bytes.subarray(start, end)));
    start = end;
  }
  return chunks;
}

export function decodeTerminalScrollbackChunk(encoded: string): string {
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function appendTerminalScrollbackDurably(sessionId: string, raw: string): Promise<void> {
  if (!sessionId || !raw) return Promise.resolve();
  const previous = sessionWrites.get(sessionId) ?? Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(async () => {
      const { terminalScrollbackRepo } = await loadRepositories();
      for (const chunk of encodeTerminalScrollbackChunks(raw)) {
        await terminalScrollbackRepo.append(sessionId as TerminalSessionId, chunk);
      }
    });
  sessionWrites.set(sessionId, current);
  void current
    .finally(() => {
      if (sessionWrites.get(sessionId) === current) sessionWrites.delete(sessionId);
    })
    .catch(() => undefined);
  return current;
}
