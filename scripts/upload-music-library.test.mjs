import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { hydrateMusicUpload, uploadArgs } from './upload-music-library.mjs';

test('hydrates only safe exact-size manifest objects', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vibespace-upload-'));
  writeFileSync(join(dir, 'track.mp3'), 'abc');
  const track = {
    id: 'music-001-abcdefabcdef',
    sourceName: 'track.mp3',
    objectKey: 'tracks/music-001-abcdefabcdef-track.mp3',
    bytes: 3,
    sha256: 'a'.repeat(64),
  };
  const result = hydrateMusicUpload({ count: 1, tracks: [track] }, dir);
  assert.equal(result[0].sourcePath, join(dir, 'track.mp3'));
  assert.deepEqual(uploadArgs('bucket', result[0]).slice(0, 5), [
    'wrangler@4.125.0',
    'r2',
    'object',
    'put',
    `bucket/${track.objectKey}`,
  ]);
});

test('rejects traversal and changed files before upload', () => {
  assert.throws(
    () =>
      hydrateMusicUpload(
        {
          count: 1,
          tracks: [
            {
              id: 'x',
              sourceName: '../x.mp3',
              objectKey: 'tracks/x.mp3',
              bytes: 1,
              sha256: 'a'.repeat(64),
            },
          ],
        },
        '.',
      ),
    /unsafe/,
  );
});
