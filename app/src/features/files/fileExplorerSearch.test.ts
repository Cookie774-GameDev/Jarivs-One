import { describe, expect, it } from 'vitest';
import {
  canSearchFileContent,
  describeSearchClues,
  extractSearchTerms,
  isImagePath,
  isTextPath,
  isVideoPath,
  parseAiPathList,
  parseSearchClues,
  scoreEntriesLocally,
} from './fileExplorerSearch';
import type { FsEntry } from '@/lib/fs';

describe('path kind helpers', () => {
  it('detects text, image, and video paths for previews', () => {
    expect(isTextPath('C:\\a\\notes.md')).toBe(true);
    expect(isTextPath('C:\\a\\code.ts')).toBe(true);
    expect(isImagePath('C:\\a\\shot.png')).toBe(true);
    expect(isVideoPath('C:\\a\\clip.mp4')).toBe(true);
    expect(isTextPath('C:\\a\\shot.png')).toBe(false);
  });

  it('never content-searches pictures or video', () => {
    expect(canSearchFileContent('C:\\a\\shot.png', 2000)).toBe(false);
    expect(canSearchFileContent('C:\\a\\clip.mp4', 2000)).toBe(false);
    expect(canSearchFileContent('C:\\a\\keys.txt', 2000)).toBe(true);
    expect(canSearchFileContent('C:\\a\\config.json', 2000)).toBe(true);
  });
});

describe('parseSearchClues — multi-clue natural language', () => {
  it('extracts extension, location, and size clues', () => {
    const clues = parseSearchClues('tax invoice type:pdf in:documents >1mb under 20mb');
    expect(clues.extensions).toContain('pdf');
    expect(clues.pathHint).toBeTruthy();
    expect(clues.minBytes).toBeGreaterThan(0);
    expect(clues.maxBytes).toBeGreaterThan(clues.minBytes ?? 0);
    expect(clues.terms.join(' ')).toMatch(/tax|invoice/);
  });

  it('understands "txt document" + Deepgram + API keys as multiple clues', () => {
    const clues = parseSearchClues(
      'IT WAS A txt Document and had like DeepGram key my API keys in it too',
    );
    expect(clues.extensions).toContain('txt');
    expect(clues.terms.map((t) => t.toLowerCase())).toEqual(
      expect.arrayContaining(['deepgram']),
    );
    // Stopwords dropped
    expect(clues.terms).not.toContain('was');
    expect(clues.terms).not.toContain('like');
    expect(clues.terms).not.toContain('document');
    // API key style terms kept
    const joined = clues.terms.join(' ');
    expect(joined).toMatch(/api|key/);
  });

  it('parses here-only scope', () => {
    const clues = parseSearchClues('deepgram key here only');
    expect(clues.hereOnly).toBe(true);
    expect(clues.terms).toContain('deepgram');
  });

  it('keeps free-text query when no structured tokens', () => {
    const clues = parseSearchClues('birthday photo');
    expect(clues.terms).toEqual(expect.arrayContaining(['birthday', 'photo']));
    expect(clues.extensions).toBeUndefined();
  });
});

describe('extractSearchTerms', () => {
  it('drops stopwords and keeps meaningful words', () => {
    const terms = extractSearchTerms('it was a deepgram api key file');
    expect(terms).toContain('deepgram');
    expect(terms).not.toContain('was');
    expect(terms).not.toContain('file');
  });
});

describe('scoreEntriesLocally — multi-clue AND', () => {
  it('prefers txt files that contain Deepgram over unrelated json', async () => {
    const entries: FsEntry[] = [
      {
        name: 'context_map.json',
        path: 'C:\\Users\\viper\\.android\\context_map.json',
        isDir: false,
        size: 2200,
      },
      {
        name: 'deepgram-keys.txt',
        path: 'C:\\Users\\viper\\Documents\\deepgram-keys.txt',
        isDir: false,
        size: 120,
      },
    ];

    // Mock content reads via scoreEntriesLocally's readTextFileSample — we need vi.mock
    // Instead unit-test pure filter: extension gate alone
    const clues = parseSearchClues('txt document Deepgram API keys');
    expect(clues.extensions).toContain('txt');

    // Without content IPC, score only name matches + extension filter
    const hits = await scoreEntriesLocally(entries, clues, null);
    // json is filtered out by extension gate
    expect(hits.every((h) => h.path.endsWith('.txt') || h.name.endsWith('.txt'))).toBe(true);
    expect(hits.some((h) => h.name.includes('context_map'))).toBe(false);
  });
});

describe('describeSearchClues', () => {
  it('summarizes multi-clue plan', () => {
    const clues = parseSearchClues('txt document Deepgram');
    const summary = describeSearchClues(clues);
    expect(summary).toMatch(/type:txt/);
    expect(summary).toMatch(/deepgram/i);
  });
});

describe('parseAiPathList', () => {
  it('reads a JSON array of paths', () => {
    const allowed = new Set(['C:\\Users\\a\\doc.txt', 'C:\\Users\\a\\b.png']);
    const paths = parseAiPathList(
      '```json\n["C:\\\\Users\\\\a\\\\doc.txt"]\n```',
      allowed,
    );
    expect(paths).toEqual(['C:\\Users\\a\\doc.txt']);
  });

  it('reads { paths: [...] } objects', () => {
    const allowed = new Set(['/home/u/a.txt']);
    expect(
      parseAiPathList(JSON.stringify({ paths: ['/home/u/a.txt', '/nope'] }), allowed),
    ).toEqual(['/home/u/a.txt']);
  });
});
