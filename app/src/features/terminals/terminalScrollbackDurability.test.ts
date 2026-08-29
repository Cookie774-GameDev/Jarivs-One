import { beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  append: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));

vi.mock('@/lib/db/repositories', () => ({
  terminalScrollbackRepo: repository,
}));

import {
  appendTerminalScrollbackDurably,
  decodeTerminalScrollbackChunk,
  encodeTerminalScrollbackChunks,
} from './terminalScrollbackDurability';

describe('terminal scrollback durability', () => {
  beforeEach(() => {
    repository.append.mockReset();
    repository.append.mockResolvedValue({});
  });

  it('round-trips Unicode PTY output through independently decodable bounded chunks', () => {
    const raw = `ready λ 🚀\n${'x'.repeat(24_000)}\ndone`;
    const encoded = encodeTerminalScrollbackChunks(raw, 10 * 1024);

    expect(encoded.length).toBeGreaterThan(2);
    expect(encoded.map(decodeTerminalScrollbackChunk).join('')).toBe(raw);
    expect(
      encoded.every(
        (chunk) =>
          Uint8Array.from(atob(chunk), (character) => character.charCodeAt(0)).length <= 10 * 1024,
      ),
    ).toBe(true);
  });

  it('serializes durable appends for one terminal session without blocking another session', async () => {
    let releaseFirst!: () => void;
    repository.append.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        }),
    );
    const first = appendTerminalScrollbackDurably('session-a', 'first');
    const second = appendTerminalScrollbackDurably('session-a', 'second');
    const independent = appendTerminalScrollbackDurably('session-b', 'parallel');

    await vi.waitFor(() => expect(repository.append).toHaveBeenCalledTimes(2));
    expect(repository.append.mock.calls.map((call) => call.slice(0, 2))).toEqual([
      ['session-a', 'Zmlyc3Q='],
      ['session-b', 'cGFyYWxsZWw='],
    ]);

    releaseFirst();
    await Promise.all([first, second, independent]);
    expect(repository.append.mock.calls.map((call) => call.slice(0, 2))).toEqual([
      ['session-a', 'Zmlyc3Q='],
      ['session-b', 'cGFyYWxsZWw='],
      ['session-a', 'c2Vjb25k'],
    ]);
  });

  it('continues the session queue after one IndexedDB append fails', async () => {
    repository.append.mockRejectedValueOnce(new Error('indexeddb unavailable'));

    await expect(appendTerminalScrollbackDurably('session-retry', 'first')).rejects.toThrow(
      'indexeddb unavailable',
    );
    await expect(
      appendTerminalScrollbackDurably('session-retry', 'second'),
    ).resolves.toBeUndefined();
    expect(repository.append).toHaveBeenCalledTimes(2);
  });
});
