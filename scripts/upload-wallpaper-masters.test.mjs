import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildMasterManifest,
  hydrateVerifiedManifest,
  parseCatalogSeed,
  renderActivationMigration,
  slugifyWallpaperFile,
} from './upload-wallpaper-masters.mjs';

const wallpaper = {
  id: 'd2baebf7-25d9-4fe9-a482-65cfbf1decc2',
  slug: 'sample-wallpaper',
  name: "Sample's Wallpaper",
  description: 'Fixture',
  category: 'test',
  tags: ['test'],
  version: '1.0.0',
  author: 'VibeSpace',
  thumbnail_path: 'wallpapers/sample-wallpaper/thumbnail.webp',
  preview_path: 'wallpapers/sample-wallpaper/preview.mp4',
  fallback_path: 'wallpapers/sample-wallpaper/fallback.webp',
  size_bytes: 4,
  width: 1920,
  height: 1080,
  format: 'mp4',
  engine_type: 'video',
  performance_tier: 'low',
  featured: false,
  sort_order: 1,
};

test('slug and catalog parsing match the shipped generator contract', () => {
  assert.equal(slugifyWallpaperFile('Sample Wallpaper.mp4'), 'sample-wallpaper');
  const parsed = parseCatalogSeed(
    `export const CATALOG_SEED: CatalogWallpaper[] = ${JSON.stringify([wallpaper])} as unknown as CatalogWallpaper[];`,
  );
  assert.equal(parsed[0].slug, 'sample-wallpaper');
});

test('manifest hashes the complete file bytes and renders the private R2 catalog row', async () => {
  const inputDir = mkdtempSync(join(tmpdir(), 'wallpaper-manifest-'));
  writeFileSync(join(inputDir, 'Sample Wallpaper.mp4'), Buffer.from('full'));
  const manifest = await buildMasterManifest({ inputDir, catalog: [wallpaper] });
  assert.equal(manifest.count, 1);
  assert.equal(manifest.totalBytes, 4);
  assert.equal(manifest.objects[0].sha256, createHash('sha256').update('full').digest('hex'));
  assert.equal(manifest.objects[0].storagePath, 'wallpapers/sample-wallpaper/wallpaper.mp4');

  const sql = renderActivationMigration('select 1;', [wallpaper], manifest);
  assert.match(sql, /wallpapers\/sample-wallpaper\/wallpaper\.mp4/);
  assert.match(sql, /Sample''s Wallpaper/);
  assert.match(sql, new RegExp(manifest.objects[0].sha256));
});

test('manifest fails closed when catalog and source sets differ', async () => {
  const inputDir = mkdtempSync(join(tmpdir(), 'wallpaper-manifest-missing-'));
  await assert.rejects(() => buildMasterManifest({ inputDir, catalog: [wallpaper] }), {
    message: 'wallpaper_count_mismatch:catalog=1:source=0',
  });
});

test('resume manifest rejects source traversal and accepts unchanged verified files', async () => {
  const inputDir = mkdtempSync(join(tmpdir(), 'wallpaper-manifest-resume-'));
  writeFileSync(join(inputDir, 'Sample Wallpaper.mp4'), Buffer.from('full'));
  const built = await buildMasterManifest({ inputDir, catalog: [wallpaper] });
  const committed = {
    ...built,
    objects: built.objects.map(({ sourcePath: _sourcePath, ...item }) => item),
  };
  assert.equal(hydrateVerifiedManifest({ inputDir, manifest: committed }).objects.length, 1);

  committed.objects[0].sourceName = '../outside.mp4';
  assert.throws(() => hydrateVerifiedManifest({ inputDir, manifest: committed }), {
    message: 'verified_manifest_source_unsafe:sample-wallpaper',
  });
});
