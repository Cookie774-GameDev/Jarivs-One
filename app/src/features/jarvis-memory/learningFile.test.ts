import { describe, expect, it, vi } from 'vitest';

import { loadLearningFile, saveLearningFile, type LearningFileIo } from './learningFile';

describe('learning.md persistence', () => {
  it('writes a backup before the primary account-scoped file', async () => {
    const writes: Array<[string, string]> = [];
    const values = new Map<string, string>();
    const io: LearningFileIo = {
      resolveRoot: async () => 'C:\\app-data',
      createDirectory: async () => undefined,
      readText: async (path) =>
        values.get(path) ?? (path.endsWith('learning.md') ? '# Jarvis Learning\n\nold' : null),
      writeText: async (path, value) => {
        writes.push([path, value]);
        values.set(path, value);
      },
    };

    const saved = await saveLearningFile('account-a', '# Jarvis Learning\n\nnew', io);

    expect(saved.path).toMatch(/^C:\\app-data\\Jarvis Memory\\account-[a-f0-9]{64}\\learning\.md$/);
    expect(saved.path).not.toContain('account-a');
    expect(saved.path).toMatch(/account-[a-f0-9]{64}[\\/]learning\.md$/);
    expect(writes.map(([path]) => path.split(/[\\/]/).pop())).toEqual([
      'learning.md.bak',
      'learning.md.tmp',
      'learning.md',
    ]);
  });

  it('uses distinct cryptographic account directories', async () => {
    const values = new Map<string, string>();
    const io: LearningFileIo = {
      resolveRoot: async () => 'C:\\app-data',
      createDirectory: async () => undefined,
      readText: async (path) => values.get(path) ?? null,
      writeText: async (path, value) => {
        values.set(path, value);
      },
    };
    const [first, second] = await Promise.all([
      saveLearningFile('account-a', '# Jarvis Learning\n\nA', io),
      saveLearningFile('account-b', '# Jarvis Learning\n\nB', io),
    ]);
    expect(first.path).not.toBe(second.path);
  });

  it('recovers a corrupt primary from its valid backup', async () => {
    let primary = 'not a learning file';
    const writeText = vi.fn(async (_path: string, _value: string) => undefined);
    const io: LearningFileIo = {
      resolveRoot: async () => 'C:\\app-data',
      createDirectory: async () => undefined,
      readText: async (path) =>
        path.endsWith('.bak') ? '# Jarvis Learning\n\n- valid backup' : primary,
      writeText: async (path, value) => {
        writeText(path, value);
        if (path.endsWith('learning.md')) primary = value;
      },
    };

    const loaded = await loadLearningFile('account-a', io);

    expect(loaded).toMatchObject({
      recovered: true,
      markdown: '# Jarvis Learning\n\n- valid backup',
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/learning\.md$/), loaded.markdown);
  });

  it('recovers a valid temporary write when primary and backup are corrupt', async () => {
    let primary = 'corrupt';
    const writeText = vi.fn(async (_path: string, _value: string) => undefined);
    const io: LearningFileIo = {
      resolveRoot: async () => 'C:\\app-data',
      createDirectory: async () => undefined,
      readText: async (path) =>
        path.endsWith('.tmp') ? '# Jarvis Learning\n\n- recovered' : primary,
      writeText: async (path, value) => {
        writeText(path, value);
        if (path.endsWith('learning.md')) primary = value;
      },
    };
    const loaded = await loadLearningFile('account-a', io);
    expect(loaded).toMatchObject({
      recovered: true,
      recoverySource: 'temporary',
      markdown: '# Jarvis Learning\n\n- recovered',
    });
  });

  it('fails closed when persisted candidates exist but all are corrupt', async () => {
    const io: LearningFileIo = {
      resolveRoot: async () => 'C:\\app-data',
      createDirectory: async () => undefined,
      readText: async () => 'corrupt durable memory',
      writeText: async () => undefined,
    };

    await expect(loadLearningFile('account-a', io)).rejects.toThrow(/recovery failed/i);
  });

  it('verifies the primary read-back before reporting a save as durable', async () => {
    let primaryWrites = 0;
    const io: LearningFileIo = {
      resolveRoot: async () => 'C:\\app-data',
      createDirectory: async () => undefined,
      readText: async (path) => {
        if (path.endsWith('learning.md') && primaryWrites > 0) return 'truncated';
        return null;
      },
      writeText: async (path) => {
        if (path.endsWith('learning.md')) primaryWrites += 1;
      },
    };

    await expect(
      saveLearningFile('account-a', '# Jarvis Learning\n\nverified', io),
    ).rejects.toThrow(/could not be verified/i);
  });

  it('verifies a recovered primary before reporting recovery success', async () => {
    let repaired = false;
    const io: LearningFileIo = {
      resolveRoot: async () => 'C:\\app-data',
      createDirectory: async () => undefined,
      readText: async (path) => {
        if (path.endsWith('.bak')) return '# Jarvis Learning\n\nbackup';
        if (path.endsWith('learning.md')) return repaired ? 'still corrupt' : 'corrupt';
        return null;
      },
      writeText: async (path) => {
        if (path.endsWith('learning.md')) repaired = true;
      },
    };

    await expect(loadLearningFile('account-a', io)).rejects.toThrow(
      /repair could not be verified/i,
    );
  });
});
