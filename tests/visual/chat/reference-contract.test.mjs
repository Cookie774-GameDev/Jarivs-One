import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '../../..');
const referenceRoot = path.join(testDirectory, 'reference');
const expectedViewport = {
  width: 1672,
  height: 941,
  device_scale_factor: 1,
  browser_zoom_percent: 100,
};
const lockedTargetSha256 = '1f61e223d6db54d9f32de4c3de8c98ff3028556b579b1f6a69b5317d35e8fe27';
const expectedOraclePaths = [
  'DESIGN.md',
  'asset-manifest.json',
  'crops/assistant_message.png',
  'crops/composer.png',
  'crops/header_full.png',
  'crops/jarvis_module.png',
  'crops/lower_right_flower.png',
  'crops/paper_closeup.png',
  'crops/session_panel.png',
  'crops/sidebar_full.png',
  'crops/top_ribbon.png',
  'crops/upper_left_crane.png',
  'crops/user_bubble.png',
  'design-tokens.json',
  'reference-spec.json',
  'target-chat.png',
];

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function readPngDimensions(filePath) {
  const buffer = await readFile(filePath);
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  assert.ok(
    buffer.length >= 24 && buffer.subarray(0, 8).equals(pngSignature),
    `${filePath} must be a valid PNG with an IHDR header`,
  );
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR');

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function destinationPathFromPackPath(packPath) {
  return packPath.replace(/^references\//, '');
}

test('the reference specification locks the authoritative viewport and crop geometry', async () => {
  const specification = await readJson(path.join(referenceRoot, 'reference-spec.json'));

  assert.equal(specification.schema_version, '1.0');
  assert.equal(specification.page_id, 'vibespace-chat-origami');
  assert.deepEqual(specification.viewport, expectedViewport);
  assert.equal(specification.target_is_visual_source_of_truth, true);
  assert.equal(specification.full_page_policy.authoritative, true);
  assert.equal(specification.full_page_policy.must_capture_after_every_kept_change, true);
  assert.equal(specification.full_page_policy.must_not_use_target_as_full_page_background, true);
  assert.equal(specification.crop_policy.role, 'diagnostic_only');
  assert.equal(specification.crop_policy.independent_layout_targets, false);
  assert.equal(specification.crop_policy.coordinates_are_anchored_to_full_page, true);
  assert.equal(specification.crop_policy.must_recheck_full_page_after_each_crop_fix, true);
  assert.equal(specification.dynamic_regions.playwright_screenshot_css_required, true);

  const regionEntries = Object.entries(specification.regions);
  assert.deepEqual(specification.regions.full_page, {
    x: 0,
    y: 0,
    width: expectedViewport.width,
    height: expectedViewport.height,
    weight: 1,
  });

  for (const [name, region] of regionEntries) {
    assert.ok(Number.isInteger(region.x) && region.x >= 0, `${name}.x`);
    assert.ok(Number.isInteger(region.y) && region.y >= 0, `${name}.y`);
    assert.ok(Number.isInteger(region.width) && region.width > 0, `${name}.width`);
    assert.ok(Number.isInteger(region.height) && region.height > 0, `${name}.height`);
    assert.ok(typeof region.weight === 'number' && region.weight > 0, `${name}.weight`);
    assert.ok(
      region.x + region.width <= expectedViewport.width,
      `${name} exceeds the viewport horizontally`,
    );
    assert.ok(
      region.y + region.height <= expectedViewport.height,
      `${name} exceeds the viewport vertically`,
    );
  }

  const diagnosticWeight = regionEntries
    .filter(([name]) => name !== 'full_page')
    .reduce((sum, [, region]) => sum + region.weight, 0);
  assert.equal(diagnosticWeight, 1);
});

test('the locked target and every coordinate-anchored crop have the specified dimensions', async () => {
  const specification = await readJson(path.join(referenceRoot, 'reference-spec.json'));
  const targetPath = path.join(
    referenceRoot,
    destinationPathFromPackPath(specification.target_file),
  );
  const targetBytes = await readFile(targetPath);

  assert.equal(sha256(targetBytes), lockedTargetSha256);
  assert.deepEqual(await readPngDimensions(targetPath), {
    width: expectedViewport.width,
    height: expectedViewport.height,
  });

  const diagnosticRegions = Object.entries(specification.regions).filter(
    ([name]) => name !== 'full_page',
  );
  assert.deepEqual(
    diagnosticRegions.map(([name]) => name).sort(),
    expectedOraclePaths
      .filter((filePath) => filePath.startsWith('crops/'))
      .map((filePath) => path.posix.basename(filePath, '.png'))
      .sort(),
  );

  for (const [name, region] of diagnosticRegions) {
    assert.deepEqual(
      await readPngDimensions(path.join(referenceRoot, 'crops', `${name}.png`)),
      { width: region.width, height: region.height },
      `${name} crop dimensions`,
    );
  }
});

test('the stable integrity manifest covers every imported oracle byte', async () => {
  const manifest = await readJson(path.join(referenceRoot, 'reference-integrity.json'));

  assert.equal(manifest.schema_version, '1.0');
  assert.equal(manifest.algorithm, 'sha256');
  assert.ok(Array.isArray(manifest.entries));
  assert.deepEqual(
    manifest.entries.map((entry) => entry.path),
    expectedOraclePaths,
    'manifest entries must be complete and sorted',
  );
  assert.equal(
    new Set(manifest.entries.map((entry) => entry.path)).size,
    manifest.entries.length,
    'manifest paths must be unique',
  );

  for (const entry of manifest.entries) {
    assert.equal(typeof entry.path, 'string');
    assert.equal(entry.path, entry.path.replaceAll('\\', '/'));
    assert.equal(path.posix.normalize(entry.path), entry.path);
    assert.equal(path.posix.isAbsolute(entry.path), false);
    assert.equal(entry.path.startsWith('../'), false);
    assert.ok(Number.isInteger(entry.bytes) && entry.bytes > 0);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);

    const filePath = path.join(referenceRoot, ...entry.path.split('/'));
    const [fileBytes, fileStat] = await Promise.all([readFile(filePath), stat(filePath)]);
    assert.equal(fileStat.isFile(), true, `${entry.path} must be a file`);
    assert.equal(entry.bytes, fileBytes.length, `${entry.path} byte count`);
    assert.equal(entry.sha256, sha256(fileBytes), `${entry.path} sha256`);
  }
});

test('design tokens and asset policy preserve live UI semantics', async () => {
  const [tokens, assetManifest] = await Promise.all([
    readJson(path.join(referenceRoot, 'design-tokens.json')),
    readJson(path.join(referenceRoot, 'asset-manifest.json')),
  ]);

  assert.equal(tokens.schema_version, '1.0');
  assert.equal(assetManifest.schema_version, '1.0');
  assert.equal(assetManifest.page_scope, 'chat-only');
  assert.equal(assetManifest.source_policy.full_target_as_page_background, false);
  assert.equal(assetManifest.source_policy.preserve_live_text_and_controls_as_dom, true);

  const suggestedPaths = Object.values(assetManifest.assets).map((asset) => asset.suggested_file);
  assert.ok(suggestedPaths.length > 0);
  assert.equal(new Set(suggestedPaths).size, suggestedPaths.length);
  assert.ok(
    suggestedPaths.every(
      (suggestedPath) =>
        typeof suggestedPath === 'string' &&
        suggestedPath.startsWith('public/assets/origami-chat/'),
    ),
  );
});

test('only the exact image-analysis and later-authorized visual harness dependencies are added', async () => {
  const packageJson = await readJson(path.join(repositoryRoot, 'package.json'));

  assert.equal(packageJson.devDependencies['playwright-core'], '^1.61.1');
  assert.equal(packageJson.devDependencies.sharp, '0.34.5');
  assert.equal(packageJson.devDependencies.pixelmatch, '7.2.0');
  assert.equal(packageJson.devDependencies.pngjs, '7.0.0');
  assert.equal(packageJson.devDependencies['@playwright/test'], '1.61.1');
  assert.equal(packageJson.devDependencies['@axe-core/playwright'], '4.12.1');
  assert.equal(packageJson.devDependencies.playwright, undefined);

  await Promise.all([import('sharp'), import('pixelmatch'), import('pngjs')]);
});
