import { describe, expect, it } from 'vitest';
import { normalizeFsEntry } from './fs';

describe('normalizeFsEntry', () => {
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
