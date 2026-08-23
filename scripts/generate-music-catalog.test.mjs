import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  buildMusicManifest,
  musicDisplayName,
  musicSlug,
  renderMusicCatalogModule,
} from './generate-music-catalog.mjs';

test('sanitizes display names and stable object slugs', () => {
  assert.equal(
    musicDisplayName("ES_Deja Vu (Instrumental Version) - I'MIN.mp3"),
    "Deja Vu (Instrumental Version) - I'MIN",
  );
  assert.equal(
    musicSlug("ES_Deja Vu (Instrumental Version) - I'MIN.mp3"),
    'deja-vu-instrumental-version-i-min',
  );
});

test('uses content hashes to keep duplicate-looking names unique', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vibespace-music-'));
  writeFileSync(join(dir, 'ES_Same.mp3'), 'one');
  writeFileSync(join(dir, 'ES_Same (1).mp3'), 'two');
  const manifest = await buildMusicManifest(dir, '2026-08-23T00:00:00.000Z');
  assert.equal(manifest.count, 2);
  assert.equal(new Set(manifest.tracks.map((track) => track.id)).size, 2);
  assert.equal(new Set(manifest.tracks.map((track) => track.objectKey)).size, 2);
  assert.equal(manifest.totalBytes, 6);
  const module = renderMusicCatalogModule(manifest);
  assert.match(module, /MUSIC_LIBRARY_TRACKS/);
  assert.doesNotMatch(module, /sourceName/);
});
