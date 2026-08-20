import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  SiyuanManifestValidationError,
  validateElectronTauriLedger,
  validateFeatureParityLedger,
  validateMigrationNoLossLedger,
  validateProvenance,
  validateRuntimeClosure,
  validateRuntimeManifest,
  verifySiyuanRuntimeArtifacts,
} from './verify-siyuan-runtime-manifest.mjs';

const load = async (path) =>
  JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const clone = (value) => structuredClone(value);
const rejectsCode = (operation, code) => {
  assert.throws(operation, (error) => {
    assert.ok(error instanceof SiyuanManifestValidationError);
    assert.equal(error.code, code);
    return true;
  });
};

test('accepts the checked-in disabled manifest and truthful blocked ledgers', async () => {
  const result = await verifySiyuanRuntimeArtifacts();
  assert.deepEqual(result, {
    tag: 'v3.8.1',
    commitSha: 'afa823b6b4e4f183511e0bc0a3be93caa94c7c97',
    featureEnabled: false,
    payloadIncluded: true,
    runtimeBundled: true,
    closureBytes: 445983251,
    compressedAnalysisBytes: 87304479,
    featureBlockedCount: 21,
    bridgeBlockedCount: 8,
    migrationBlockedCount: 1,
  });
});

test('fails closed if the feature is enabled before integration', async () => {
  const manifest = await load('app/src-tauri/resources/siyuan-runtime-manifest.json');
  manifest.featureEnabled = true;
  rejectsCode(() => validateRuntimeManifest(manifest), 'manifest_feature_must_be_disabled');
});

test('rejects unpinned, relocated, or mutated installer authority', async () => {
  const source = await load('app/src-tauri/resources/siyuan-runtime-manifest.json');
  for (const [field, value, code] of [
    ['url', 'https://attacker.example/siyuan.exe', 'manifest_installer_url_invalid'],
    ['sizeBytes', source.windowsX64Installer.sizeBytes + 1, 'manifest_installer_size_invalid'],
    ['sha256', '0'.repeat(64), 'manifest_installer_sha_invalid'],
  ]) {
    const manifest = clone(source);
    manifest.windowsX64Installer[field] = value;
    rejectsCode(() => validateRuntimeManifest(manifest), code);
  }
});

test('rejects runtime closure drift and missing build materialization', async () => {
  const source = await load('app/src-tauri/resources/siyuan-runtime-manifest.json');
  const derived = clone(source);
  derived.runtimeClosure.status = 'derived-not-bundled';
  rejectsCode(() => validateRuntimeManifest(derived), 'manifest_closure_status_invalid');

  const absent = clone(source);
  absent.runtimeClosure.payloadIncluded = false;
  rejectsCode(() => validateRuntimeManifest(absent), 'manifest_payload_must_be_materialized');

  const unbundled = clone(source);
  unbundled.packaging.runtimeBundled = false;
  rejectsCode(() => validateRuntimeManifest(unbundled), 'manifest_runtime_must_be_bundled');

  const measured = clone(source);
  measured.runtimeClosure.measuredBytes += 1;
  rejectsCode(() => validateRuntimeManifest(measured), 'manifest_closure_bytes_invalid');
});

test('rejects relaxed security boundaries and unknown manifest fields', async () => {
  const source = await load('app/src-tauri/resources/siyuan-runtime-manifest.json');
  const publicHost = clone(source);
  publicHost.security.bindHost = '0.0.0.0';
  rejectsCode(() => validateRuntimeManifest(publicHost), 'manifest_bind_host_invalid');

  const rawSql = clone(source);
  rawSql.security.modelRawSqlAccess = true;
  rejectsCode(() => validateRuntimeManifest(rawSql), 'manifest_raw_sql_forbidden');

  const extra = clone(source);
  extra.runtime.extra = 'not allowed';
  rejectsCode(() => validateRuntimeManifest(extra), 'manifest_runtime_keys_invalid');
});

test('binds real runtime evidence while release claims remain false', async () => {
  const source = await load('docs/oss/siyuan-runtime-provenance.json');
  assert.equal(validateProvenance(source), true);
  assert.equal(source.integrationStatus.runtimeClosureDerived, true);
  assert.equal(source.integrationStatus.runtimeBuildMaterialized, true);
  assert.equal(source.integrationStatus.runtimeExecuted, true);
  for (const field of [
    'runtimePayloadCommitted',
    'licenseReviewComplete',
    'installerMeasured',
    'releaseReady',
  ]) {
    const provenance = clone(source);
    provenance.integrationStatus[field] = true;
    rejectsCode(() => validateProvenance(provenance), `provenance_${field}_must_be_false`);
  }

  const noShutdown = clone(source);
  noShutdown.executionEvidence.gracefulShutdown = false;
  rejectsCode(
    () => validateProvenance(noShutdown),
    'provenance_execution_gracefulShutdown_invalid',
  );

  const leaked = clone(source);
  leaked.executionEvidence.secretLogged = true;
  rejectsCode(() => validateProvenance(leaked), 'provenance_execution_secret_log_invalid');
});

test('binds the measured closure to exact component totals without claiming a final bundle', async () => {
  const source = await load('docs/oss/siyuan-runtime-closure.json');
  assert.equal(validateRuntimeClosure(source), true);

  const changedBytes = clone(source);
  changedBytes.closure.components[0].bytes += 1;
  rejectsCode(() => validateRuntimeClosure(changedBytes), 'closure_component_bytes_invalid');

  const changedDigest = clone(source);
  changedDigest.closure.components[0].treeSha256 = '0'.repeat(64);
  rejectsCode(() => validateRuntimeClosure(changedDigest), 'closure_component_sha_invalid');

  const finalClaim = clone(source);
  finalClaim.compressionEvidence.finalReleaseArtifact = true;
  rejectsCode(() => validateRuntimeClosure(finalClaim), 'closure_final_artifact_claim_forbidden');
});

test('requires evidence for feature-parity passes and rejects summary inflation', async () => {
  const source = await load('docs/oss/siyuan-feature-parity.json');
  assert.equal(validateFeatureParityLedger(source), true);

  const unevidencedPass = clone(source);
  unevidencedPass.entries[0].status = 'PASS_NATIVE';
  unevidencedPass.summary.passNative += 1;
  unevidencedPass.summary.blocked -= 1;
  rejectsCode(
    () => validateFeatureParityLedger(unevidencedPass),
    'feature_ledger_pass_evidence_required',
  );

  const inflated = clone(source);
  inflated.summary.blocked += 1;
  rejectsCode(() => validateFeatureParityLedger(inflated), 'feature_ledger_summary_invalid');
});

test('rejects unevidenced Electron-to-Tauri bridge claims', async () => {
  const source = await load('docs/oss/siyuan-electron-tauri-parity.json');
  assert.equal(validateElectronTauriLedger(source), true);

  const pass = clone(source);
  pass.entries[0].status = 'PASS_BRIDGED';
  rejectsCode(() => validateElectronTauriLedger(pass), 'bridge_ledger_pass_evidence_required');

  const inventedEvidence = clone(source);
  inventedEvidence.entries[0].testEvidence.push('app/src/not-a-real-test.ts');
  rejectsCode(
    () => validateElectronTauriLedger(inventedEvidence),
    'bridge_ledger_entry_evidence_invalid',
  );
});

test('binds staged migration truth and forbids production or historical-cutover claims', async () => {
  const source = await load('docs/oss/siyuan-migration-no-loss.json');
  assert.equal(validateMigrationNoLossLedger(source), true);

  const production = clone(source);
  production.execution.productionUserDataMigrated = true;
  rejectsCode(
    () => validateMigrationNoLossLedger(production),
    'migration_ledger_production_claim_forbidden',
  );

  const historical = clone(source);
  historical.stages.at(-1).status = 'PASS_TESTED';
  historical.stages.at(-1).evidence = ['app/src/features/context/siyuanShadowMigration.test.ts'];
  rejectsCode(
    () => validateMigrationNoLossLedger(historical),
    'migration_ledger_historical_claim_forbidden',
  );

  const missingEvidence = clone(source);
  missingEvidence.stages[2].evidence = [];
  rejectsCode(
    () => validateMigrationNoLossLedger(missingEvidence),
    'migration_ledger_stage_evidence_status_invalid',
  );
});
