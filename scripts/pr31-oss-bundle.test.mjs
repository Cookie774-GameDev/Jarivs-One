import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { verifyPr31OssBundle } from './pr31-oss-bundle.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relative) {
  return JSON.parse(readFileSync(resolve(ROOT, relative), 'utf8'));
}

function createFixture() {
  const fixture = mkdtempSync(resolve(tmpdir(), 'vibespace-pr31-oss-'));
  mkdirSync(resolve(fixture, 'app/src-tauri'), { recursive: true });
  mkdirSync(resolve(fixture, 'app/src/features/doctor'), { recursive: true });
  mkdirSync(resolve(fixture, 'docs'), { recursive: true });
  mkdirSync(resolve(fixture, 'scripts'), { recursive: true });
  cpSync(resolve(ROOT, 'docs/oss'), resolve(fixture, 'docs/oss'), { recursive: true });
  cpSync(
    resolve(ROOT, 'app/src-tauri/tauri.conf.json'),
    resolve(fixture, 'app/src-tauri/tauri.conf.json'),
  );
  cpSync(
    resolve(ROOT, 'app/src/features/doctor/vibeSpaceDoctor.ts'),
    resolve(fixture, 'app/src/features/doctor/vibeSpaceDoctor.ts'),
  );
  cpSync(resolve(ROOT, 'app/package.json'), resolve(fixture, 'app/package.json'));
  cpSync(resolve(ROOT, 'package.json'), resolve(fixture, 'package.json'));
  cpSync(resolve(ROOT, 'package-lock.json'), resolve(fixture, 'package-lock.json'));
  return fixture;
}

test('PR31 OSS bundle metadata is deterministically cross-checked', () => {
  assert.deepEqual(verifyPr31OssBundle(ROOT), { ok: true, errors: [] });
});

test('Playwright remains an exact development pin without a fabricated shipping or Doctor claim', () => {
  const featurePack = readJson('docs/oss/browser-agent-feature-pack.json');
  assert.equal(featurePack.shippingStatus, 'not-implemented');
  assert.equal(featurePack.defaultInstallerIncluded, false);
  assert.equal(featurePack.optionalInstallerImplemented, false);
  assert.equal(featurePack.separatelyRemovable, false);
  assert.equal(featurePack.separatelyMeasurable, false);
  assert.equal(featurePack.measurementStatus, 'not-applicable-unshipped');
  assert.deepEqual(featurePack.updates, {
    defaultAppUpdaterIncludesFeaturePack: false,
    separateSignedManifestImplemented: false,
  });
  assert.deepEqual(featurePack.doctor, {
    supportStatus: 'unavailable',
    canDiagnoseInstalledRuntime: false,
    canInstall: false,
    canRepair: false,
    implicitBrowserDownloadAllowed: false,
  });
  assert.deepEqual(
    featurePack.prerequisites.map(({ id, status }) => ({ id, status })),
    [
      { id: 'signed-feature-pack-artifact', status: 'missing' },
      { id: 'pinned-browser-revisions-and-hashes', status: 'missing' },
      { id: 'native-atomic-installer', status: 'missing' },
      { id: 'doctor-verification-and-repair', status: 'missing' },
      { id: 'uninstall-rollback-measurement', status: 'missing' },
    ],
  );
});

test('PR31 OSS checker rejects a package-lock integrity drift without network access', () => {
  const fixture = createFixture();
  try {
    const lockPath = resolve(fixture, 'package-lock.json');
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    lock.packages['node_modules/gpt-tokenizer'].integrity = 'sha512-drift';
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

    const result = verifyPr31OssBundle(fixture);
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes('package-lock integrity mismatch: gpt-tokenizer'));
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('PR31 OSS checker rejects a fabricated Playwright installer, updater, or Doctor claim', () => {
  const fixture = createFixture();
  try {
    const featurePackPath = resolve(fixture, 'docs/oss/browser-agent-feature-pack.json');
    const featurePack = JSON.parse(readFileSync(featurePackPath, 'utf8'));
    featurePack.shippingStatus = 'available';
    featurePack.optionalInstallerImplemented = true;
    featurePack.updates.defaultAppUpdaterIncludesFeaturePack = true;
    featurePack.doctor.canRepair = true;
    writeFileSync(featurePackPath, `${JSON.stringify(featurePack, null, 2)}\n`);

    const result = verifyPr31OssBundle(fixture);
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes('Browser Agent shipping status must remain not-implemented'));
    assert.ok(
      result.errors.includes(
        'Browser Agent optional installer must not be claimed before implementation',
      ),
    );
    assert.ok(
      result.errors.includes('feature pack updater delivery must remain explicitly unavailable'),
    );
    assert.ok(
      result.errors.includes('Doctor must not claim Playwright install or repair authority'),
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('PR31 OSS checker rejects an implicit browser download command or Doctor overclaim', () => {
  const fixture = createFixture();
  try {
    const packagePath = resolve(fixture, 'package.json');
    const rootPackage = JSON.parse(readFileSync(packagePath, 'utf8'));
    rootPackage.scripts['install:browser'] = 'playwright install chromium';
    writeFileSync(packagePath, `${JSON.stringify(rootPackage, null, 2)}\n`);
    writeFileSync(
      resolve(fixture, 'app/src/features/doctor/vibeSpaceDoctor.ts'),
      "export const unsupportedClaim = 'Repair Playwright Chromium browser binaries';\n",
    );

    const result = verifyPr31OssBundle(fixture);
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.includes('package scripts must not download Playwright browser binaries'),
    );
    assert.ok(
      result.errors.includes(
        'Doctor source must not claim unavailable Playwright or browser support',
      ),
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
