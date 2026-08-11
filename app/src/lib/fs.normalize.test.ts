import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compareAndSwapTextFile, normalizeFsEntry } from './fs';

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

describe('normalizeFsEntry', () => {
  beforeEach(() => invokeMock.mockReset());
  it('accepts camelCase IPC entries', () => {
    const entry = normalizeFsEntry({
      name: 'src',
      path: 'C:\\proj\\src',
      isDir: true,
      size: undefined,
    });
    expect(entry).toEqual({
      name: 'src',
      path: 'C:\\proj\\src',
      isDir: true,
      size: undefined,
      createdMs: undefined,
      modifiedMs: undefined,
    });
  });

  it('accepts snake_case IPC entries', () => {
    const entry = normalizeFsEntry({
      name: 'readme.md',
      path: '/home/u/readme.md',
      is_dir: false,
      size: 120,
      created_ms: 1,
      modified_ms: 2,
    });
    expect(entry).toMatchObject({
      name: 'readme.md',
      path: '/home/u/readme.md',
      isDir: false,
      size: 120,
      createdMs: 1,
      modifiedMs: 2,
    });
  });

  it('coerces numeric string timestamps and sizes from native IPC', () => {
    const entry = normalizeFsEntry({
      name: 'shot.png',
      path: 'C:\\Users\\viper\\Pictures\\shot.png',
      is_dir: false,
      size: '2048',
      modified_ms: '1783784948363',
      created_ms: '1783784948000',
    });
    expect(entry).toMatchObject({
      name: 'shot.png',
      isDir: false,
      size: 2048,
      modifiedMs: 1783784948363,
      createdMs: 1783784948000,
    });
  });

  it('returns null for incomplete payloads', () => {
    expect(normalizeFsEntry({})).toBeNull();
    expect(normalizeFsEntry(null)).toBeNull();
  });
});

describe('compareAndSwapTextFile', () => {
  beforeEach(() => invokeMock.mockReset());

  it('passes exact-base mutations to native authority and validates its receipt', async () => {
    invokeMock.mockResolvedValue({
      beforeSha256: `sha256:${'a'.repeat(64)}`,
      afterSha256: `sha256:${'b'.repeat(64)}`,
      beforeBytes: 6,
      afterBytes: 5,
    });

    await expect(
      compareAndSwapTextFile('C:\\repo\\notes.md', `sha256:${'a'.repeat(64)}`, 'after', {
        root: 'C:\\repo',
      }),
    ).resolves.toEqual({
      ok: true,
      path: 'C:\\repo\\notes.md',
      beforeSha256: `sha256:${'a'.repeat(64)}`,
      afterSha256: `sha256:${'b'.repeat(64)}`,
      beforeBytes: 6,
      afterBytes: 5,
    });
    expect(invokeMock).toHaveBeenCalledWith('fs_compare_and_swap_text', {
      path: 'C:\\repo\\notes.md',
      expectedSha256: `sha256:${'a'.repeat(64)}`,
      nextContent: 'after',
      root: 'C:\\repo',
    });
  });

  it('normalizes stale-base and malformed native responses', async () => {
    invokeMock.mockRejectedValueOnce('stale_base');
    await expect(
      compareAndSwapTextFile('C:\\repo\\notes.md', `sha256:${'a'.repeat(64)}`, 'after', {
        root: 'C:\\repo',
      }),
    ).resolves.toEqual({
      ok: false,
      path: 'C:\\repo\\notes.md',
      error: { code: 'stale_base', raw: 'stale_base' },
    });

    invokeMock.mockResolvedValueOnce({
      beforeSha256: 'C:\\private\\secret',
      afterSha256: null,
      beforeBytes: -1,
      afterBytes: 0,
    });
    await expect(
      compareAndSwapTextFile('C:\\repo\\notes.md', null, 'after', { root: 'C:\\repo' }),
    ).resolves.toMatchObject({
      ok: false,
      path: 'C:\\repo\\notes.md',
      error: { code: 'unknown' },
    });
  });
});
