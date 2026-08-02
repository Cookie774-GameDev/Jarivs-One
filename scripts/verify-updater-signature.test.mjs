import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, generateKeyPairSync, sign as signEd25519 } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { verifyTauriUpdaterSignature } from './verify-updater-signature.mjs';

const execFileAsync = promisify(execFile);
const verifierScript = path.resolve('scripts/verify-updater-signature.mjs');
const utf8 = new TextEncoder();

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

function encodeSignature({
  algorithm = 'ED',
  artifact,
  keyId,
  privateKey,
  trustedComment = 'timestamp:1785585600\tfile:VibeSpace_2.3.4_x64-setup.exe\thashed',
}) {
  const signedMessage =
    algorithm === 'ED' ? createHash('blake2b512').update(artifact).digest() : artifact;
  const messageSignature = signEd25519(null, signedMessage, privateKey);
  const signatureRecord = Buffer.concat([Buffer.from(algorithm, 'ascii'), keyId, messageSignature]);
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

function decodeOuterRecord(encoded) {
  return Buffer.from(encoded, 'base64').toString('utf8');
}

function encodeOuterRecord(decoded) {
  return Buffer.from(decoded, 'utf8').toString('base64');
}

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibespace-updater-signature-'));
  const artifactPath = path.join(root, 'VibeSpace_2.3.4_x64-setup.exe');
  const signaturePath = `${artifactPath}.sig`;
  const artifact = utf8.encode('exact updater artifact bytes');
  const keyId = Buffer.from('d3da96b5b101c53b', 'hex');
  const keyPair = generateKeyPairSync('ed25519');
  const publicKey = encodePublicKey(keyPair.publicKey, keyId);
  const signature = encodeSignature({
    artifact,
    keyId,
    privateKey: keyPair.privateKey,
  });
  await writeFile(artifactPath, artifact);
  await writeFile(signaturePath, signature);
  try {
    await run({
      artifact: Buffer.from(artifact),
      artifactPath,
      keyId,
      keyPair,
      publicKey,
      root,
      signature,
      signaturePath,
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

test('verifies a Tauri-wrapped hashed Minisign signature and its trusted comment', async () => {
  await withFixture(async ({ artifactPath, publicKey, signaturePath }) => {
    const result = await verifyTauriUpdaterSignature({
      artifactPath,
      publicKey,
      signaturePath,
    });

    assert.deepEqual(result, {
      algorithm: 'ED',
      keyId: '3BC501B1B596DAD3',
      trustedComment: 'timestamp:1785585600\tfile:VibeSpace_2.3.4_x64-setup.exe\thashed',
      verified: true,
    });
  });
});

test('rejects a valid signature made by a different key even when the key id is copied', async () => {
  await withFixture(async ({ artifact, artifactPath, keyId, publicKey, signaturePath }) => {
    const other = generateKeyPairSync('ed25519');
    await writeFile(
      signaturePath,
      encodeSignature({
        artifact,
        keyId,
        privateKey: other.privateKey,
      }),
    );

    await assert.rejects(
      verifyTauriUpdaterSignature({ artifactPath, publicKey, signaturePath }),
      /artifact signature verification failed/iu,
    );
  });
});

test('rejects tampered artifact bytes', async () => {
  await withFixture(async ({ artifactPath, publicKey, signaturePath }) => {
    await writeFile(artifactPath, 'tampered updater artifact bytes');

    await assert.rejects(
      verifyTauriUpdaterSignature({ artifactPath, publicKey, signaturePath }),
      /artifact signature verification failed/iu,
    );
  });
});

test('rejects a tampered trusted comment and global comment signature', async () => {
  await withFixture(async ({ artifactPath, publicKey, signature, signaturePath }) => {
    const decoded = decodeOuterRecord(signature);
    await writeFile(
      signaturePath,
      encodeOuterRecord(decoded.replace('file:VibeSpace_', 'file:OtherSpace_')),
    );
    await assert.rejects(
      verifyTauriUpdaterSignature({ artifactPath, publicKey, signaturePath }),
      /trusted comment signature verification failed/iu,
    );

    const lines = decoded.trimEnd().split('\n');
    const globalSignature = Buffer.from(lines[3], 'base64');
    globalSignature[0] ^= 0x80;
    lines[3] = globalSignature.toString('base64');
    await writeFile(signaturePath, encodeOuterRecord(`${lines.join('\n')}\n`));
    await assert.rejects(
      verifyTauriUpdaterSignature({ artifactPath, publicKey, signaturePath }),
      /trusted comment signature verification failed/iu,
    );
  });
});

test('rejects a mismatched key id before accepting signature bytes', async () => {
  await withFixture(async ({ artifactPath, publicKey, signature, signaturePath }) => {
    const lines = decodeOuterRecord(signature).trimEnd().split('\n');
    const signatureRecord = Buffer.from(lines[1], 'base64');
    signatureRecord[2] ^= 0x01;
    lines[1] = signatureRecord.toString('base64');
    await writeFile(signaturePath, encodeOuterRecord(`${lines.join('\n')}\n`));

    await assert.rejects(
      verifyTauriUpdaterSignature({ artifactPath, publicKey, signaturePath }),
      /key id does not match/iu,
    );
  });
});

test('rejects legacy non-prehashed signatures even when cryptographically valid', async () => {
  await withFixture(
    async ({ artifact, artifactPath, keyId, keyPair, publicKey, signaturePath }) => {
      await writeFile(
        signaturePath,
        encodeSignature({
          algorithm: 'Ed',
          artifact,
          keyId,
          privateKey: keyPair.privateKey,
        }),
      );

      await assert.rejects(
        verifyTauriUpdaterSignature({ artifactPath, publicKey, signaturePath }),
        /legacy|hashed ED/iu,
      );
    },
  );
});

test('rejects malformed outer/base64 records and unprintable trusted comments', async () => {
  await withFixture(async ({ artifactPath, publicKey, signature, signaturePath }) => {
    const malformed = [
      'not base64!',
      Buffer.from('not a minisign signature', 'utf8').toString('base64'),
      encodeOuterRecord(`${decodeOuterRecord(signature).trimEnd()}\nextra line\n`),
      encodeOuterRecord(decodeOuterRecord(signature).replace('timestamp:', 'timestamp:\u0000')),
    ];
    for (const candidate of malformed) {
      await writeFile(signaturePath, candidate);
      await assert.rejects(
        verifyTauriUpdaterSignature({ artifactPath, publicKey, signaturePath }),
        /signature|base64|record|printable/iu,
      );
    }

    await writeFile(signaturePath, signature);
    await assert.rejects(
      verifyTauriUpdaterSignature({
        artifactPath,
        publicKey: `${publicKey}=`,
        signaturePath,
      }),
      /public key|base64/iu,
    );
  });
});

test('CLI exits zero only for a matching signature and prints no signing material', async () => {
  await withFixture(async ({ artifactPath, publicKey, signature, signaturePath }) => {
    const valid = await execFileAsync(process.execPath, [
      verifierScript,
      '--artifact',
      artifactPath,
      '--signature',
      signaturePath,
      '--public-key',
      publicKey,
    ]);
    assert.match(valid.stdout, /updater signature verified/iu);
    assert.equal(valid.stderr, '');
    assert.equal(valid.stdout.includes(signature), false);

    await writeFile(artifactPath, 'tampered');
    await assert.rejects(
      execFileAsync(process.execPath, [
        verifierScript,
        '--artifact',
        artifactPath,
        '--signature',
        signaturePath,
        '--public-key',
        publicKey,
      ]),
      (error) => {
        assert.equal(error.stdout.includes(signature), false);
        assert.equal(error.stderr.includes(signature), false);
        assert.match(error.stderr, /artifact signature verification failed/iu);
        return true;
      },
    );
  });
});

test('configured updater public key decodes to the supported Minisign public-key record', async () => {
  const config = JSON.parse(await readFile('app/src-tauri/tauri.conf.json', 'utf8'));
  const decoded = Buffer.from(config.plugins.updater.pubkey, 'base64')
    .toString('utf8')
    .trimEnd()
    .split(/\r?\n/u);

  assert.equal(decoded.length, 2);
  assert.equal(Buffer.from(decoded[1], 'base64').subarray(0, 2).toString('ascii'), 'Ed');
  assert.equal(Buffer.from(decoded[1], 'base64').length, 42);
});
