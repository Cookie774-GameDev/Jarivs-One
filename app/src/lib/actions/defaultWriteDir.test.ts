import { afterEach, describe, expect, it } from 'vitest';
import {
  __setCachedDefaultWriteDirForTests,
  browserFallbackWriteDir,
  defaultWriteFilePath,
  getCachedDefaultWriteDir,
} from './defaultWriteDir';

describe('defaultWriteDir', () => {
  afterEach(() => {
    __setCachedDefaultWriteDirForTests(null);
  });

  it('builds a file path under the default directory', () => {
    expect(defaultWriteFilePath('story.txt', 'C:\\Users\\demo\\Downloads')).toBe(
      'C:\\Users\\demo\\Downloads\\story.txt',
    );
    expect(defaultWriteFilePath('note.txt', '/home/demo/Downloads')).toBe(
      '/home/demo/Downloads/note.txt',
    );
  });

  it('sanitizes unsafe filename characters', () => {
    const path = defaultWriteFilePath('bad:name?.txt', 'C:\\Users\\demo\\Downloads');
    expect(path).toBe('C:\\Users\\demo\\Downloads\\bad_name_.txt');
  });

  it('uses browser fallback when cache is empty', () => {
    expect(getCachedDefaultWriteDir()).toBeNull();
    const path = defaultWriteFilePath('jarvis-note.txt');
    expect(path.endsWith('jarvis-note.txt')).toBe(true);
    expect(path.startsWith(browserFallbackWriteDir()) || path.includes('VibeSpace') || path.includes('vibespace')).toBe(
      true,
    );
  });
});
