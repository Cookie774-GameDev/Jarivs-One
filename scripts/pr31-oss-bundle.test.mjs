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
  mkdirSync(resolve(fixture, 'app/src-tauri/src'), { recursive: true });
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
  cpSync(
    resolve(ROOT, 'app/src/features/doctor/playwrightFeaturePackBridge.ts'),
    resolve(fixture, 'app/src/features/doctor/playwrightFeaturePackBridge.ts'),
  );
  cpSync(resolve(ROOT, 'app/src-tauri/Cargo.toml'), resolve(fixture, 'app/src-tauri/Cargo.toml'));
  cpSync(
    resolve(ROOT, 'app/src-tauri/src/playwright_feature_pack.rs'),
    resolve(fixture, 'app/src-tauri/src/playwright_feature_pack.rs'),
  );
  cpSync(
    resolve(ROOT, 'app/src-tauri/src/playwright_feature_pack_commands.rs'),
    resolve(fixture, 'app/src-tauri/src/playwright_feature_pack_commands.rs'),
  );
  cpSync(resolve(ROOT, 'app/package.json'), resolve(fixture, 'app/package.json'));
  cpSync(resolve(ROOT, 'package.json'), resolve(fixture, 'package.json'));
  cpSync(resolve(ROOT, 'package-lock.json'), resolve(fixture, 'package-lock.json'));
  cpSync(
    resolve(ROOT, 'scripts/pr31-playwright-acceptance-runtime.mjs'),
    resolve(fixture, 'scripts/pr31-playwright-acceptance-runtime.mjs'),
  );
  return fixture;
}

test('PR31 OSS bundle metadata is deterministically cross-checked', () => {
  assert.deepEqual(verifyPr31OssBundle(ROOT), { ok: true, errors: [] });
});

test('Playwright remains default-excluded while native integration reports external prerequisites', () => {
  const featurePack = readJson('docs/oss/browser-agent-feature-pack.json');
  assert.equal(featurePack.shippingStatus, 'externally-blocked');
  assert.equal(featurePack.productionConfigurationStatus, 'external-prerequisite');
  assert.equal(featurePack.defaultInstallerIncluded, false);
  assert.equal(featurePack.optionalInstallerImplemented, true);
  assert.equal(featurePack.separatelyRemovable, true);
  assert.equal(featurePack.separatelyMeasurable, true);
  assert.equal(featurePack.measurementStatus, 'implemented-awaiting-production-artifact');
  assert.deepEqual(featurePack.updates, {
    defaultAppUpdaterIncludesFeaturePack: false,
    separateSignedManifestImplemented: false,
  });
  assert.deepEqual(featurePack.doctor, {
    supportStatus: 'implemented-external-prerequisite',
    canDiagnoseInstalledRuntime: true,
    canInstall: false,
    canRepair: true,
    configuredRepairOnly: true,
    requiresProductionTrust: true,
    implicitBrowserDownloadAllowed: false,
  });
  assert.deepEqual(featurePack.localLifecycleContract, {
    status: 'implemented-native-external-prerequisite',
    entrypoint: 'app/src-tauri/src/playwright_feature_pack_commands.rs',
    referenceEntrypoint: 'scripts/pr31-playwright-acceptance-runtime.mjs',
    artifactSource: 'caller-supplied-local-only',
    signedManifestRequired: true,
    downloadsAllowed: false,
    launchesBrowser: false,
    operations: {
      diagnose: true,
      installOrUpdate: true,
      sameManifestRepair: true,
      rollback: true,
      measure: true,
      uninstall: true,
    },
    productionTrustRootPinned: 'compile-time-required-unconfigured',
    nativeAtomicReparseSafe: true,
    productDoctorIntegrated: true,
  });
  assert.deepEqual(
    featurePack.prerequisites.map(({ id, status }) => ({ id, status })),
    [
      { id: 'production-signing-trust', status: 'missing' },
      { id: 'signed-feature-pack-artifact', status: 'missing' },
      { id: 'pinned-browser-revisions-and-hashes', status: 'missing' },
      { id: 'native-atomic-installer', status: 'implemented' },
      { id: 'doctor-verification-and-repair', status: 'implemented' },
      { id: 'uninstall-rollback-measurement', status: 'implemented' },
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

test('PR31 OSS checker rejects a fabricated default installer, updater, or Doctor install claim', () => {
  const fixture = createFixture();
  try {
    const featurePackPath = resolve(fixture, 'docs/oss/browser-agent-feature-pack.json');
    const featurePack = JSON.parse(readFileSync(featurePackPath, 'utf8'));
    featurePack.shippingStatus = 'available';
    featurePack.defaultInstallerIncluded = true;
    featurePack.updates.defaultAppUpdaterIncludesFeaturePack = true;
    featurePack.doctor.canInstall = true;
    writeFileSync(featurePackPath, `${JSON.stringify(featurePack, null, 2)}\n`);

    const result = verifyPr31OssBundle(fixture);
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.includes(
        'Browser Agent shipping status must remain externally blocked on production prerequisites',
      ),
    );
    assert.ok(result.errors.includes('Browser Agent pack must be excluded by default'));
    assert.ok(
      result.errors.includes('feature pack updater delivery must remain explicitly unavailable'),
    );
    assert.ok(
      result.errors.includes(
        'Doctor must remain diagnosis/configured-repair only with no install or download authority',
      ),
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('PR31 OSS checker rejects an implicit browser download command in the product bridge', () => {
  const fixture = createFixture();
  try {
    const packagePath = resolve(fixture, 'package.json');
    const rootPackage = JSON.parse(readFileSync(packagePath, 'utf8'));
    rootPackage.scripts['install:browser'] = 'playwright install chromium';
    writeFileSync(packagePath, `${JSON.stringify(rootPackage, null, 2)}\n`);
    writeFileSync(
      resolve(fixture, 'app/src/features/doctor/playwrightFeaturePackBridge.ts'),
      "export async function unsafe() { return fetch('https://example.test/browser.zip'); }\n",
    );

    const result = verifyPr31OssBundle(fixture);
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.includes('package scripts must not download Playwright browser binaries'),
    );
    assert.ok(
      result.errors.includes(
        'product feature-pack bridge must not contain network, process, browser launch, or download authority',
      ),
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('PR31 OSS checker rejects runtime trust lookup or missing native integration authority', () => {
  const fixture = createFixture();
  try {
    writeFileSync(
      resolve(fixture, 'app/src-tauri/src/playwright_feature_pack_commands.rs'),
      'fn unsafe_config() { std::env::var("RUNTIME_PUBLIC_KEY"); }\n',
    );

    const result = verifyPr31OssBundle(fixture);
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.includes(
        'native commands must use compile-time trust and expose the bounded lifecycle',
      ),
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
