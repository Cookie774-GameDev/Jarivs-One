import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  HARD_RELEASE_ARTIFACT_LIMIT_BYTES,
  PREFERRED_RELEASE_ARTIFACT_LIMIT_BYTES,
  verifyReleaseArtifactSizes,
} from './verify-release-artifact-size.mjs';

async function withAssets(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibespace-release-size-'));
  try {
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('ships the exact PR31 hard and preferred byte ceilings', () => {
  assert.equal(HARD_RELEASE_ARTIFACT_LIMIT_BYTES, 300_000_000);
  assert.equal(PREFERRED_RELEASE_ARTIFACT_LIMIT_BYTES, 285_000_000);
});

test('accepts the hard boundary and reports preferred-ceiling pressure', async () => {
  await withAssets(async (assetsDir) => {
    await writeFile(path.join(assetsDir, 'VibeSpace_x64-setup.exe'), Buffer.alloc(10));
    await writeFile(path.join(assetsDir, 'VibeSpace_x64_en-US.msi'), Buffer.alloc(9));
    await writeFile(path.join(assetsDir, 'latest.json'), '{}');
    const result = await verifyReleaseArtifactSizes({
      assetsDir,
      hardLimitBytes: 10,
      preferredLimitBytes: 8,
    });

    assert.deepEqual(result.artifacts, [
      { name: 'VibeSpace_x64_en-US.msi', sizeBytes: 9, preferredLimitExceeded: true },
      { name: 'VibeSpace_x64-setup.exe', sizeBytes: 10, preferredLimitExceeded: true },
    ]);
  });
});

test('rejects any installer or updater artifact above the hard ceiling', async () => {
  await withAssets(async (assetsDir) => {
    await writeFile(path.join(assetsDir, 'VibeSpace_x64-setup.exe'), Buffer.alloc(11));
    await assert.rejects(
      verifyReleaseArtifactSizes({
        assetsDir,
        hardLimitBytes: 10,
        preferredLimitBytes: 8,
      }),
      /exceeds 10 bytes: VibeSpace_x64-setup\.exe is 11 bytes/u,
    );
  });
});

test('recognizes cross-platform updater archives and ignores metadata sidecars', async () => {
  await withAssets(async (assetsDir) => {
    await writeFile(path.join(assetsDir, 'VibeSpace_x64.app.tar.gz'), 'mac');
    await writeFile(path.join(assetsDir, 'VibeSpace_amd64.AppImage'), 'linux');
    await writeFile(path.join(assetsDir, 'VibeSpace_x64-setup.exe.sig'), 'signature');
    await writeFile(path.join(assetsDir, 'SHA256SUMS.txt'), 'hashes');
    const result = await verifyReleaseArtifactSizes({
      assetsDir,
      hardLimitBytes: 100,
      preferredLimitBytes: 90,
    });
    assert.deepEqual(
      result.artifacts.map((artifact) => artifact.name),
      ['VibeSpace_amd64.AppImage', 'VibeSpace_x64.app.tar.gz'],
    );
  });
});

test('rejects an artifact-shaped directory instead of following it', async () => {
  await withAssets(async (assetsDir) => {
    await mkdir(path.join(assetsDir, 'VibeSpace_x64-setup.exe'));
    await assert.rejects(
      verifyReleaseArtifactSizes({ assetsDir }),
      /must be a regular non-symlink file/u,
    );
  });
});

test('fails closed when the downloaded release has no installer artifacts', async () => {
  await withAssets(async (assetsDir) => {
    await writeFile(path.join(assetsDir, 'latest.json'), '{}');
    await writeFile(path.join(assetsDir, 'SHA256SUMS.txt'), 'hashes');
    await assert.rejects(
      verifyReleaseArtifactSizes({ assetsDir }),
      /No release installer or updater artifacts found/u,
    );
  });
});

test('rejects invalid threshold configuration', async () => {
  await withAssets(async (assetsDir) => {
    await writeFile(path.join(assetsDir, 'VibeSpace_x64-setup.exe'), 'artifact');
    await assert.rejects(
      verifyReleaseArtifactSizes({
        assetsDir,
        hardLimitBytes: 10,
        preferredLimitBytes: 11,
      }),
      /Preferred release artifact limit cannot exceed the hard limit/u,
    );
  });
});
