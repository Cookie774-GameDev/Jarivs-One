import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  measureTree,
  prepareSiyuanRuntime,
  validateExtractedClosure,
  validatePackagedClosure,
} from './prepare-siyuan-runtime.mjs';

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibespace-siyuan-prepare-'));
  try {
    const extracted = path.join(root, 'extracted');
    const outputParent = path.join(root, 'output');
    await mkdir(path.join(extracted, 'resources', 'kernel'), { recursive: true });
    await mkdir(path.join(extracted, 'resources', 'stage'), { recursive: true });
    await mkdir(outputParent);
    await writeFile(path.join(extracted, 'resources', 'kernel', 'kernel.exe'), 'kernel');
    await writeFile(path.join(extracted, 'resources', 'stage', 'index.html'), '<main>stage</main>');
    await writeFile(path.join(extracted, 'LICENSE'), 'AGPL fixture');
    const componentInputs = [
      ['kernel', 'resources/kernel'],
      ['stage', 'resources/stage'],
      ['license', 'LICENSE'],
    ];
    const components = [];
    for (const [id, componentPath] of componentInputs) {
      components.push({
        id,
        path: componentPath,
        ...(await measureTree(extracted, componentPath)),
      });
    }
    const closure = {
      schemaVersion: 1,
      source: {
        tag: 'v-fixture',
        commitSha: 'a'.repeat(40),
        installerName: 'fixture.exe',
        installerBytes: 1,
        installerSha256: 'b'.repeat(64),
      },
      closure: {
        status: 'derived-not-bundled',
        uncompressedBytes: components.reduce((sum, component) => sum + component.bytes, 0),
        fileCount: components.reduce((sum, component) => sum + component.files, 0),
        components,
        criticalBinaries: [],
      },
    };
    const closurePath = path.join(root, 'closure.json');
    const manifestPath = path.join(root, 'manifest.json');
    const sourceOfferPath = path.join(root, 'source-offer.md');
    await writeFile(closurePath, JSON.stringify(closure));
    await writeFile(
      manifestPath,
      JSON.stringify({ runtime: { tag: 'v-fixture', commitSha: 'a'.repeat(40) } }),
    );
    await writeFile(sourceOfferPath, 'Fixture source offer');
    return await run({
      root,
      extracted,
      outputParent,
      outputDir: path.join(outputParent, 'runtime'),
      closure,
      closurePath,
      manifestPath,
      sourceOfferPath,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('measures a deterministic path-bound tree digest', async () => {
  await withFixture(async ({ extracted }) => {
    const measured = await measureTree(extracted, 'resources/kernel');
    const fileSha = createHash('sha256').update('kernel').digest('hex');
    const expected = createHash('sha256')
      .update(`resources/kernel/kernel.exe\0${Buffer.byteLength('kernel')}\0${fileSha}\n`)
      .digest('hex');
    assert.equal(measured.treeSha256, expected);
  });
});

test('validates and atomically materializes only the measured closure', async () => {
  await withFixture(async (fixture) => {
    await validateExtractedClosure(fixture.extracted, fixture.closure);
    const result = await prepareSiyuanRuntime({
      sourceDir: fixture.extracted,
      outputDir: fixture.outputDir,
      allowedOutputParent: fixture.outputParent,
      closureManifestPath: fixture.closurePath,
      runtimeManifestPath: fixture.manifestPath,
      sourceOfferPath: fixture.sourceOfferPath,
    });
    assert.equal(result.reused, false);
    await validatePackagedClosure(fixture.outputDir, fixture.closure);
    assert.equal(
      await readFile(path.join(fixture.outputDir, 'kernel', 'kernel.exe'), 'utf8'),
      'kernel',
    );
    assert.equal(
      await readFile(path.join(fixture.outputDir, 'VIBESPACE_SIYUAN_SOURCE_OFFER.md'), 'utf8'),
      'Fixture source offer',
    );

    const reused = await prepareSiyuanRuntime({
      sourceDir: path.join(fixture.root, 'does-not-exist'),
      outputDir: fixture.outputDir,
      allowedOutputParent: fixture.outputParent,
      closureManifestPath: fixture.closurePath,
      runtimeManifestPath: fixture.manifestPath,
      sourceOfferPath: fixture.sourceOfferPath,
    });
    assert.equal(reused.reused, true);
  });
});

test('refreshes copied metadata only after the prepared closure and ready authority verify', async () => {
  await withFixture(async (fixture) => {
    await prepareSiyuanRuntime({
      sourceDir: fixture.extracted,
      outputDir: fixture.outputDir,
      allowedOutputParent: fixture.outputParent,
      closureManifestPath: fixture.closurePath,
      runtimeManifestPath: fixture.manifestPath,
      sourceOfferPath: fixture.sourceOfferPath,
    });
    const updatedManifest = JSON.stringify({
      runtime: { tag: 'v-fixture', commitSha: 'a'.repeat(40) },
      packaging: { runtimeBundled: true },
    });
    await writeFile(fixture.manifestPath, updatedManifest);
    await writeFile(fixture.sourceOfferPath, 'Updated fixture source offer');

    const result = await prepareSiyuanRuntime({
      sourceDir: path.join(fixture.root, 'must-not-be-read'),
      outputDir: fixture.outputDir,
      allowedOutputParent: fixture.outputParent,
      closureManifestPath: fixture.closurePath,
      runtimeManifestPath: fixture.manifestPath,
      sourceOfferPath: fixture.sourceOfferPath,
    });

    assert.equal(result.reused, true);
    assert.equal(
      await readFile(path.join(fixture.outputDir, 'siyuan-runtime-manifest.json'), 'utf8'),
      updatedManifest,
    );
    assert.equal(
      await readFile(path.join(fixture.outputDir, 'VIBESPACE_SIYUAN_SOURCE_OFFER.md'), 'utf8'),
      'Updated fixture source offer',
    );
    await validatePackagedClosure(fixture.outputDir, fixture.closure);
  });
});

test('rejects ready-marker drift without refreshing or rebuilding the existing output', async () => {
  await withFixture(async (fixture) => {
    await prepareSiyuanRuntime({
      sourceDir: fixture.extracted,
      outputDir: fixture.outputDir,
      allowedOutputParent: fixture.outputParent,
      closureManifestPath: fixture.closurePath,
      runtimeManifestPath: fixture.manifestPath,
      sourceOfferPath: fixture.sourceOfferPath,
    });
    const readyPath = path.join(fixture.outputDir, 'VIBESPACE_SIYUAN_READY.json');
    const ready = JSON.parse(await readFile(readyPath, 'utf8'));
    await writeFile(readyPath, JSON.stringify({ ...ready, fingerprint: '0'.repeat(64) }));

    await assert.rejects(
      prepareSiyuanRuntime({
        sourceDir: path.join(fixture.root, 'must-not-be-read'),
        outputDir: fixture.outputDir,
        allowedOutputParent: fixture.outputParent,
        closureManifestPath: fixture.closurePath,
        runtimeManifestPath: fixture.manifestPath,
        sourceOfferPath: fixture.sourceOfferPath,
      }),
      /exists but is not the verified closure/u,
    );
    assert.equal(JSON.parse(await readFile(readyPath, 'utf8')).fingerprint, '0'.repeat(64));
  });
});

test('rejects a mutated upstream component before materialization', async () => {
  await withFixture(async (fixture) => {
    await writeFile(path.join(fixture.extracted, 'resources', 'kernel', 'kernel.exe'), 'mutated');
    await assert.rejects(
      validateExtractedClosure(fixture.extracted, fixture.closure),
      /component verification failed: kernel/u,
    );
  });
});

test('refuses an output path outside the exact allowed parent', async () => {
  await withFixture(async (fixture) => {
    await assert.rejects(
      prepareSiyuanRuntime({
        sourceDir: fixture.extracted,
        outputDir: path.join(fixture.outputParent, 'nested', 'runtime'),
        allowedOutputParent: fixture.outputParent,
        closureManifestPath: fixture.closurePath,
        runtimeManifestPath: fixture.manifestPath,
        sourceOfferPath: fixture.sourceOfferPath,
      }),
      /must be one exact direct child/u,
    );
  });
});

test('fails instead of overwriting an unverified existing output', async () => {
  await withFixture(async (fixture) => {
    await mkdir(fixture.outputDir);
    await writeFile(path.join(fixture.outputDir, 'unexpected.txt'), 'preserve me');
    await assert.rejects(
      prepareSiyuanRuntime({
        sourceDir: fixture.extracted,
        outputDir: fixture.outputDir,
        allowedOutputParent: fixture.outputParent,
        closureManifestPath: fixture.closurePath,
        runtimeManifestPath: fixture.manifestPath,
        sourceOfferPath: fixture.sourceOfferPath,
      }),
      /exists but is not the verified closure/u,
    );
    assert.equal(
      await readFile(path.join(fixture.outputDir, 'unexpected.txt'), 'utf8'),
      'preserve me',
    );
  });
});
