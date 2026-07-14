import { describe, expect, it, vi } from 'vitest';

import {
  loadAllAboutMeFile,
  saveAllAboutMeFile,
  type AllAboutMeFileIo,
} from './allAboutMeFile';

describe('all-about-me.md persistence', () => {
  it('writes an account-scoped backup and transactional temporary copy', async () => {
    const writes: string[] = [];
    const io: AllAboutMeFileIo = {
      resolveRoot: async () => 'C:\\app-data',
      createDirectory: async () => undefined,
      readText: async (path) => path.endsWith('all-about-me.md') ? '# AllAboutMe.md\n\nold' : null,
      writeText: async (path) => { writes.push(path); },
    };

    const saved = await saveAllAboutMeFile('user@example.com', '# AllAboutMe.md\n\nnew', io);

    expect(saved.path).toContain('Jarvis Memory');
    expect(saved.path).not.toContain('user@example.com');
    expect(saved.path).toMatch(/account-[a-f0-9]{64}[\\/]all-about-me\.md$/);
    expect(writes.map((path) => path.split(/[\\/]/).pop())).toEqual([
      'all-about-me.md.bak',
      'all-about-me.md.tmp',
      'all-about-me.md',
    ]);
  });

  it('recovers without mixing accounts and preserves the recovered content exactly', async () => {
    const writeText = vi.fn(async (_path: string, _value: string) => undefined);
    const io: AllAboutMeFileIo = {
      resolveRoot: async () => 'C:\\app-data',
      createDirectory: async () => undefined,
      readText: async (path) => path.endsWith('.tmp') ? '# All About Me\n\nUser-authored profile.' : 'corrupt',
      writeText,
    };

    const loaded = await loadAllAboutMeFile('account-b', io);

    expect(loaded).toMatchObject({ recovered: true, found: true, markdown: '# All About Me\n\nUser-authored profile.' });
    expect(loaded.path).not.toContain('account-b');
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/all-about-me\.md$/), loaded.markdown);
  });

  it('rejects credential-shaped content', async () => {
    const io: AllAboutMeFileIo = {
      resolveRoot: async () => 'C:\\app-data',
      createDirectory: async () => undefined,
      readText: async () => null,
      writeText: async () => undefined,
    };
    await expect(saveAllAboutMeFile('account-a', '# AllAboutMe.md\napiKey=do-not-store', io))
      .rejects.toThrow(/credential/i);
  });

  it('clears primary, backup, and temporary copies when the profile is deleted', async () => {
    const writeText = vi.fn(async (_path: string, _value: string) => undefined);
    const io: AllAboutMeFileIo = {
      resolveRoot: async () => 'C:\\app-data',
      createDirectory: async () => undefined,
      readText: async () => '# All About Me\n\nPrivate profile',
      writeText,
    };

    const cleared = await saveAllAboutMeFile('account-a', '', io);

    expect(cleared).toMatchObject({ markdown: '', found: false });
    expect(writeText.mock.calls.map(([path, value]) => [
      String(path).split(/[\\/]/).pop(),
      value,
    ])).toEqual([
      ['all-about-me.md', expect.stringMatching(/deleted/)],
      ['all-about-me.md.bak', expect.stringMatching(/deleted/)],
      ['all-about-me.md.tmp', expect.stringMatching(/deleted/)],
    ]);
  });

  it('treats a primary deletion marker as authoritative over stale backups', async () => {
    const io: AllAboutMeFileIo = {
      resolveRoot: async () => 'C:\\app-data',
      createDirectory: async () => undefined,
      readText: async (path) => path.endsWith('all-about-me.md')
        ? '<!-- vibespace-all-about-me-deleted -->\n'
        : '# All About Me\n\nStale private profile',
      writeText: async () => undefined,
    };

    await expect(loadAllAboutMeFile('account-a', io)).resolves.toMatchObject({
      markdown: '',
      found: false,
      recovered: false,
    });
  });
});
