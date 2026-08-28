import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign as signEd25519 } from 'node:crypto';
import {
  access,
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  diagnoseAcceptanceRuntime,
  installAcceptanceRuntime,
  repairAcceptanceRuntime,
  rollbackAcceptanceRuntime,
  uninstallAcceptanceRuntime,
  verifyAcceptanceRuntimeArtifact,
} from './pr31-playwright-acceptance-runtime.mjs';

const TARGET_PLATFORM = `${process.platform}-${process.arch}`;
const PLAYWRIGHT_VERSION = '1.61.1';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function rawPublicKey(publicKey) {
  const jwk = publicKey.export({ format: 'jwk' });
  return Buffer.from(jwk.x, 'base64url');
}

function encodePublicKey(publicKey, keyId) {
  const record = Buffer.concat([Buffer.from('Ed'), keyId, rawPublicKey(publicKey)]);
  const text = [
    `untrusted comment: minisign public key: ${Buffer.from(keyId).reverse().toString('hex').toUpperCase()}`,
    record.toString('base64'),
    '',
  ].join('\n');
  return Buffer.from(text, 'utf8').toString('base64');
}

function encodeSignature({ artifact, keyId, privateKey }) {
  const digest = createHash('blake2b512').update(artifact).digest();
  const messageSignature = signEd25519(null, digest, privateKey);
  const signatureRecord = Buffer.concat([Buffer.from('ED'), keyId, messageSignature]);
  const trustedComment = 'timestamp:1785585600\tfile:feature-pack.json\thashed';
  const globalSignature = signEd25519(
    null,
    Buffer.concat([messageSignature, Buffer.from(trustedComment, 'utf8')]),
    privateKey,
  );
  const text = [
    'untrusted comment: signature from minisign secret key',
    signatureRecord.toString('base64'),
    `trusted comment: ${trustedComment}`,
    globalSignature.toString('base64'),
    '',
  ].join('\n');
  return Buffer.from(text, 'utf8').toString('base64');
}

async function makeEnvironment() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibespace-playwright-runtime-'));
  const keyPair = generateKeyPairSync('ed25519');
  const keyId = Buffer.from('d3da96b5b101c53b', 'hex');
  return {
    installRoot: path.join(root, 'installed'),
    keyId,
    keyPair,
    publicKey: encodePublicKey(keyPair.publicKey, keyId),
    root,
  };
}

async function writeArtifact(
  environment,
  name,
  {
    artifactVersion = '1.0.0',
    browserBytes = Buffer.from(`browser-${artifactVersion}`),
    browserRevision = artifactVersion.replaceAll('.', ''),
    manifestTransform,
  } = {},
) {
  const artifactRoot = path.join(environment.root, name);
  const payloadRoot = path.join(artifactRoot, 'payload');
  const files = [
    {
      path: 'playwright-core/package.json',
      bytes: Buffer.from(`{"version":"${PLAYWRIGHT_VERSION}"}\n`),
    },
    { path: 'browser/browser.bin', bytes: Buffer.from(browserBytes) },
    { path: 'licenses/NOTICE.txt', bytes: Buffer.from('Playwright Apache-2.0 fixture\n') },
  ];
  for (const file of files) {
    const destination = path.join(payloadRoot, ...file.path.split('/'));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.bytes);
  }
  let manifest = {
    schemaVersion: 1,
    id: 'vibespace-playwright-acceptance-runtime',
    artifactVersion,
    playwrightVersion: PLAYWRIGHT_VERSION,
    targetPlatform: TARGET_PLATFORM,
    browser: {
      name: 'chromium',
      revision: browserRevision,
      executablePath: 'browser/browser.bin',
    },
    files: files.map((file) => ({
      path: file.path,
      bytes: file.bytes.length,
      sha256: sha256(file.bytes),
    })),
    totalBytes: files.reduce((total, file) => total + file.bytes.length, 0),
  };
  if (manifestTransform) manifest = manifestTransform(structuredClone(manifest));
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  await mkdir(artifactRoot, { recursive: true });
  await writeFile(path.join(artifactRoot, 'feature-pack.json'), manifestBytes);
  await writeFile(
    path.join(artifactRoot, 'feature-pack.json.sig'),
    encodeSignature({
      artifact: manifestBytes,
      keyId: environment.keyId,
      privateKey: environment.keyPair.privateKey,
    }),
  );
  return { artifactRoot, manifest, manifestBytes, payloadRoot };
}

async function withEnvironment(run) {
  const environment = await makeEnvironment();
  try {
    await run(environment);
  } finally {
    await rm(environment.root, { force: true, recursive: true });
  }
}

function options(environment, artifactRoot, extra = {}) {
  return {
    artifactRoot,
    installRoot: environment.installRoot,
    publicKey: environment.publicKey,
    targetPlatform: TARGET_PLATFORM,
    ...extra,
  };
}

test('verifies a local signed manifest and every bounded payload hash without downloading', async () => {
  await withEnvironment(async (environment) => {
    const artifact = await writeArtifact(environment, 'artifact-v1');
    const result = await verifyAcceptanceRuntimeArtifact(
      options(environment, artifact.artifactRoot),
    );

    assert.equal(result.verified, true);
    assert.equal(result.playwrightVersion, PLAYWRIGHT_VERSION);
    assert.equal(result.targetPlatform, TARGET_PLATFORM);
    assert.equal(result.fileCount, 3);
    assert.equal(result.totalBytes, artifact.manifest.totalBytes);
    assert.match(result.manifestSha256, /^[a-f0-9]{64}$/u);
  });
});

test('installs, diagnoses, and measures one signed acceptance runtime offline', async () => {
  await withEnvironment(async (environment) => {
    const artifact = await writeArtifact(environment, 'artifact-v1');
    const installed = await installAcceptanceRuntime(options(environment, artifact.artifactRoot));
    const diagnosis = await diagnoseAcceptanceRuntime(options(environment));

    assert.equal(installed.action, 'installed');
    assert.equal(diagnosis.status, 'healthy');
    assert.equal(diagnosis.installationId, installed.installationId);
    assert.equal(diagnosis.measuredBytes, artifact.manifest.totalBytes);
    assert.equal(diagnosis.playwrightVersion, PLAYWRIGHT_VERSION);
    assert.equal(diagnosis.browserRevision, artifact.manifest.browser.revision);
  });
});

test('rejects signature tampering and a copied key id signed by another key', async () => {
  await withEnvironment(async (environment) => {
    const artifact = await writeArtifact(environment, 'artifact-v1');
    await writeFile(path.join(artifact.artifactRoot, 'feature-pack.json'), 'tampered');
    await assert.rejects(
      verifyAcceptanceRuntimeArtifact(options(environment, artifact.artifactRoot)),
      (error) => error?.code === 'signature_invalid',
    );

    const restored = await writeArtifact(environment, 'artifact-v2');
    const other = generateKeyPairSync('ed25519');
    await writeFile(
      path.join(restored.artifactRoot, 'feature-pack.json.sig'),
      encodeSignature({
        artifact: restored.manifestBytes,
        keyId: environment.keyId,
        privateKey: other.privateKey,
      }),
    );
    await assert.rejects(
      verifyAcceptanceRuntimeArtifact(options(environment, restored.artifactRoot)),
      (error) => error?.code === 'signature_invalid',
    );
  });
});

test('fails closed on unsupported platform and traversal-bearing signed manifests', async () => {
  await withEnvironment(async (environment) => {
    const wrongPlatform = await writeArtifact(environment, 'wrong-platform');
    await assert.rejects(
      verifyAcceptanceRuntimeArtifact(
        options(environment, wrongPlatform.artifactRoot, { targetPlatform: 'unsupported-x64' }),
      ),
      (error) => error?.code === 'unsupported_platform',
    );

    const traversal = await writeArtifact(environment, 'traversal', {
      manifestTransform: (manifest) => {
        manifest.files[0].path = '../outside.js';
        return manifest;
      },
    });
    await assert.rejects(
      verifyAcceptanceRuntimeArtifact(options(environment, traversal.artifactRoot)),
      (error) => error?.code === 'manifest_invalid_path',
    );
  });
});

test('rejects multiply linked payload files', async () => {
  await withEnvironment(async (environment) => {
    const artifact = await writeArtifact(environment, 'hardlink');
    await link(
      path.join(artifact.payloadRoot, 'browser/browser.bin'),
      path.join(artifact.payloadRoot, 'browser/browser-copy.bin'),
    );

    await assert.rejects(
      verifyAcceptanceRuntimeArtifact(options(environment, artifact.artifactRoot)),
      (error) => error?.code === 'artifact_unsafe_link',
    );
  });
});

test('rejects junction or symlink-backed payload directories when the platform permits creation', async (t) => {
  await withEnvironment(async (environment) => {
    const artifact = await writeArtifact(environment, 'junction');
    const browserRoot = path.join(artifact.payloadRoot, 'browser');
    const externalRoot = path.join(environment.root, 'external-browser');
    await rename(browserRoot, externalRoot);
    try {
      await symlink(externalRoot, browserRoot, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if (error?.code === 'EPERM' || error?.code === 'EACCES') {
        t.skip('host does not permit creating a test junction/symlink');
        return;
      }
      throw error;
    }

    await assert.rejects(
      verifyAcceptanceRuntimeArtifact(options(environment, artifact.artifactRoot)),
      (error) => error?.code === 'artifact_unsafe_link',
    );
  });
});

test('updates from a second signed local artifact and rolls back to the verified prior version', async () => {
  await withEnvironment(async (environment) => {
    const first = await writeArtifact(environment, 'artifact-v1');
    const second = await writeArtifact(environment, 'artifact-v2', {
      artifactVersion: '1.0.1',
      browserBytes: Buffer.from('browser-v2'),
      browserRevision: '2002',
    });
    const installed = await installAcceptanceRuntime(options(environment, first.artifactRoot));
    const updated = await installAcceptanceRuntime(options(environment, second.artifactRoot));
    const afterUpdate = await diagnoseAcceptanceRuntime(options(environment));
    const rolledBack = await rollbackAcceptanceRuntime(options(environment));
    const afterRollback = await diagnoseAcceptanceRuntime(options(environment));

    assert.equal(updated.action, 'updated');
    assert.equal(afterUpdate.browserRevision, '2002');
    assert.equal(rolledBack.action, 'rolled-back');
    assert.equal(afterRollback.installationId, installed.installationId);
    assert.equal(afterRollback.browserRevision, first.manifest.browser.revision);
  });
});

test('diagnoses corruption and repairs only from the exact same signed manifest', async () => {
  await withEnvironment(async (environment) => {
    const artifact = await writeArtifact(environment, 'artifact-v1');
    const installed = await installAcceptanceRuntime(options(environment, artifact.artifactRoot));
    await writeFile(
      path.join(
        environment.installRoot,
        'versions',
        installed.installationId,
        'browser/browser.bin',
      ),
      'corrupt',
    );
    const corrupt = await diagnoseAcceptanceRuntime(options(environment));
    const repaired = await repairAcceptanceRuntime(options(environment, artifact.artifactRoot));
    const healthy = await diagnoseAcceptanceRuntime(options(environment));

    assert.equal(corrupt.status, 'corrupt');
    assert.equal(repaired.action, 'repaired');
    assert.notEqual(repaired.installationId, installed.installationId);
    assert.equal(healthy.status, 'healthy');
    assert.equal(healthy.installationId, repaired.installationId);
  });
});

test('rejects repair with a different signed manifest and requires explicit update instead', async () => {
  await withEnvironment(async (environment) => {
    const first = await writeArtifact(environment, 'artifact-v1');
    const second = await writeArtifact(environment, 'artifact-v2', {
      artifactVersion: '1.0.1',
    });
    const installed = await installAcceptanceRuntime(options(environment, first.artifactRoot));
    await writeFile(
      path.join(
        environment.installRoot,
        'versions',
        installed.installationId,
        'browser/browser.bin',
      ),
      'corrupt',
    );

    await assert.rejects(
      repairAcceptanceRuntime(options(environment, second.artifactRoot)),
      (error) => error?.code === 'repair_unsupported_manifest_change',
    );
  });
});

test('uninstalls only state-bound versions and reports the runtime absent', async () => {
  await withEnvironment(async (environment) => {
    const first = await writeArtifact(environment, 'artifact-v1');
    const second = await writeArtifact(environment, 'artifact-v2', {
      artifactVersion: '1.0.1',
    });
    await installAcceptanceRuntime(options(environment, first.artifactRoot));
    await installAcceptanceRuntime(options(environment, second.artifactRoot));
    const removed = await uninstallAcceptanceRuntime(options(environment));
    const diagnosis = await diagnoseAcceptanceRuntime(options(environment));

    assert.equal(removed.action, 'uninstalled');
    assert.equal(removed.removedInstallations, 2);
    assert.equal(diagnosis.status, 'absent');
  });
});

test('refuses a tampered state record instead of deleting an unrelated versions directory', async () => {
  await withEnvironment(async (environment) => {
    const artifact = await writeArtifact(environment, 'artifact-v1');
    await installAcceptanceRuntime(options(environment, artifact.artifactRoot));
    const unrelatedId = 'unrelated-runtime-1234';
    const unrelatedRoot = path.join(environment.installRoot, 'versions', unrelatedId);
    const sentinel = path.join(unrelatedRoot, 'sentinel.txt');
    await mkdir(unrelatedRoot, { recursive: true });
    await writeFile(sentinel, 'preserve me');
    const statePath = path.join(environment.installRoot, 'acceptance-runtime-state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.active.installationId = unrelatedId;
    state.rollback = null;
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);

    await assert.rejects(
      uninstallAcceptanceRuntime(options(environment)),
      (error) => error?.code === 'uninstall_target_invalid',
    );
    assert.equal(await readFile(sentinel, 'utf8'), 'preserve me');
  });
});

test('preserves the active version and cleans a staged update when activation fails', async () => {
  await withEnvironment(async (environment) => {
    const first = await writeArtifact(environment, 'artifact-v1');
    const second = await writeArtifact(environment, 'artifact-v2', {
      artifactVersion: '1.0.1',
    });
    const installed = await installAcceptanceRuntime(options(environment, first.artifactRoot));

    await assert.rejects(
      installAcceptanceRuntime(
        options(environment, second.artifactRoot, {
          hooks: {
            beforeStateCommit: async () => {
              throw new Error('injected activation failure');
            },
          },
        }),
      ),
      (error) => error?.code === 'activation_failed',
    );
    const diagnosis = await diagnoseAcceptanceRuntime(options(environment));
    const versions = await readdir(path.join(environment.installRoot, 'versions'));

    assert.equal(diagnosis.status, 'healthy');
    assert.equal(diagnosis.installationId, installed.installationId);
    assert.deepEqual(versions, [installed.installationId]);
  });
});

test('contains no browser launch, child process, network fetch, or Playwright download authority', async () => {
  const source = await readFile(
    new URL('./pr31-playwright-acceptance-runtime.mjs', import.meta.url),
    'utf8',
  );

  assert.match(source, /verifyTauriUpdaterSignature/u);
  assert.doesNotMatch(source, /node:child_process|\b(?:exec|execFile|spawn|fork)\s*\(/u);
  assert.doesNotMatch(source, /\bfetch\s*\(|https?:\/\//u);
  assert.doesNotMatch(source, /playwright(?:-core)?\s+install(?:-deps)?/iu);
  assert.doesNotMatch(source, /\.launch\s*\(/u);
});

test('test cleanup removes only its disposable environment', async () => {
  const environment = await makeEnvironment();
  await access(environment.root);
  await rm(environment.root, { force: true, recursive: true });
  await assert.rejects(access(environment.root), (error) => error?.code === 'ENOENT');
});
