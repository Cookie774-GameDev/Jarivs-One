import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const TAG = 'v3.8.1';
const COMMIT_SHA = 'afa823b6b4e4f183511e0bc0a3be93caa94c7c97';
const INSTALLER_SHA256 = '50df27aa899491323035aee59b2b9b55df174e13b8dc3694f7c46d7f82770787';
const INSTALLER_BYTES = 204_769_168;
const OFFICIAL_REPOSITORY = 'https://github.com/siyuan-note/siyuan';
const STATUS_VALUES = new Set([
  'PASS_NATIVE',
  'PASS_BRIDGED',
  'PASS_VIBESPACE_ROUTE',
  'ENTITLEMENT_EXTERNAL',
  'BLOCKED',
]);

export class SiyuanManifestValidationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SiyuanManifestValidationError';
    this.code = code;
  }
}

function fail(code) {
  throw new SiyuanManifestValidationError(code);
}

function record(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(code);
  return value;
}

function exactKeys(value, keys, code) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(code);
  }
}

function exactString(value, expected, code) {
  if (value !== expected) fail(code);
}

function boolean(value, expected, code) {
  if (value !== expected) fail(code);
}

function positiveInteger(value, expected, code) {
  if (!Number.isSafeInteger(value) || value < 1 || (expected !== undefined && value !== expected)) {
    fail(code);
  }
}

function stringArray(value, code) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry)) {
    fail(code);
  }
  if (new Set(value).size !== value.length) fail(code);
  return value;
}

function officialGithubUrl(value, expected, code) {
  exactString(value, expected, code);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(code);
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'github.com' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    fail(code);
  }
}

function validateUpstream(value, codePrefix) {
  const upstream = record(value, `${codePrefix}_invalid`);
  exactKeys(upstream, ['tag', 'commitSha'], `${codePrefix}_keys_invalid`);
  exactString(upstream.tag, TAG, `${codePrefix}_tag_invalid`);
  exactString(upstream.commitSha, COMMIT_SHA, `${codePrefix}_commit_invalid`);
}

export function validateRuntimeManifest(value) {
  const manifest = record(value, 'manifest_invalid');
  exactKeys(
    manifest,
    [
      'schemaVersion',
      'featureEnabled',
      'runtime',
      'windowsX64Installer',
      'runtimeClosure',
      'security',
      'packaging',
    ],
    'manifest_keys_invalid',
  );
  positiveInteger(manifest.schemaVersion, 1, 'manifest_schema_invalid');
  boolean(manifest.featureEnabled, false, 'manifest_feature_must_be_disabled');

  const runtime = record(manifest.runtime, 'manifest_runtime_invalid');
  exactKeys(
    runtime,
    ['id', 'upstreamRepository', 'tag', 'commitSha', 'license', 'publishedAt'],
    'manifest_runtime_keys_invalid',
  );
  exactString(runtime.id, 'siyuan', 'manifest_runtime_id_invalid');
  officialGithubUrl(runtime.upstreamRepository, OFFICIAL_REPOSITORY, 'manifest_repository_invalid');
  exactString(runtime.tag, TAG, 'manifest_tag_invalid');
  exactString(runtime.commitSha, COMMIT_SHA, 'manifest_commit_invalid');
  exactString(runtime.license, 'AGPL-3.0', 'manifest_license_invalid');
  exactString(runtime.publishedAt, '2026-08-18T11:15:08Z', 'manifest_published_at_invalid');

  const installer = record(manifest.windowsX64Installer, 'manifest_installer_invalid');
  exactKeys(installer, ['name', 'url', 'sizeBytes', 'sha256'], 'manifest_installer_keys_invalid');
  exactString(installer.name, 'siyuan-3.8.1-win.exe', 'manifest_installer_name_invalid');
  officialGithubUrl(
    installer.url,
    `${OFFICIAL_REPOSITORY}/releases/download/${TAG}/siyuan-3.8.1-win.exe`,
    'manifest_installer_url_invalid',
  );
  positiveInteger(installer.sizeBytes, INSTALLER_BYTES, 'manifest_installer_size_invalid');
  exactString(installer.sha256, INSTALLER_SHA256, 'manifest_installer_sha_invalid');

  const closure = record(manifest.runtimeClosure, 'manifest_closure_invalid');
  exactKeys(
    closure,
    ['status', 'payloadIncluded', 'measuredBytes', 'requiredFamilies'],
    'manifest_closure_keys_invalid',
  );
  exactString(closure.status, 'not-derived', 'manifest_closure_status_invalid');
  boolean(closure.payloadIncluded, false, 'manifest_payload_must_be_absent');
  if (closure.measuredBytes !== null) fail('manifest_closure_bytes_must_be_null');
  const families = stringArray(closure.requiredFamilies, 'manifest_families_invalid');
  const expectedFamilies = ['kernel', 'stage', 'appearance', 'guide-help', 'rich-rendering-assets'];
  if (
    families.length !== expectedFamilies.length ||
    families.some((item, index) => item !== expectedFamilies[index])
  ) {
    fail('manifest_families_invalid');
  }

  const security = record(manifest.security, 'manifest_security_invalid');
  exactKeys(
    security,
    [
      'bindHost',
      'randomPortRequired',
      'runtimeTokenRequired',
      'publishModeEnabled',
      'rendererDirectApiAccess',
      'modelRawSqlAccess',
    ],
    'manifest_security_keys_invalid',
  );
  exactString(security.bindHost, '127.0.0.1', 'manifest_bind_host_invalid');
  boolean(security.randomPortRequired, true, 'manifest_random_port_required');
  boolean(security.runtimeTokenRequired, true, 'manifest_runtime_token_required');
  boolean(security.publishModeEnabled, false, 'manifest_publish_mode_forbidden');
  boolean(security.rendererDirectApiAccess, false, 'manifest_renderer_access_forbidden');
  boolean(security.modelRawSqlAccess, false, 'manifest_raw_sql_forbidden');

  const packaging = record(manifest.packaging, 'manifest_packaging_invalid');
  exactKeys(
    packaging,
    ['runtimeBundled', 'hardInstallerLimitBytes', 'preferredInstallerLimitBytes'],
    'manifest_packaging_keys_invalid',
  );
  boolean(packaging.runtimeBundled, false, 'manifest_runtime_must_not_be_bundled');
  positiveInteger(packaging.hardInstallerLimitBytes, 300_000_000, 'manifest_hard_limit_invalid');
  positiveInteger(
    packaging.preferredInstallerLimitBytes,
    285_000_000,
    'manifest_preferred_limit_invalid',
  );
  return true;
}

export function validateProvenance(value) {
  const provenance = record(value, 'provenance_invalid');
  exactKeys(
    provenance,
    [
      'schemaVersion',
      'verifiedAt',
      'verificationSource',
      'repository',
      'release',
      'license',
      'windowsX64Installer',
      'integrationStatus',
    ],
    'provenance_keys_invalid',
  );
  positiveInteger(provenance.schemaVersion, 1, 'provenance_schema_invalid');
  if (
    typeof provenance.verifiedAt !== 'string' ||
    Number.isNaN(Date.parse(provenance.verifiedAt))
  ) {
    fail('provenance_verified_at_invalid');
  }
  exactString(provenance.verificationSource, 'official-github-api', 'provenance_source_invalid');
  officialGithubUrl(provenance.repository, OFFICIAL_REPOSITORY, 'provenance_repository_invalid');

  const release = record(provenance.release, 'provenance_release_invalid');
  exactKeys(
    release,
    ['tag', 'commitSha', 'publishedAt', 'releaseUrl'],
    'provenance_release_keys_invalid',
  );
  exactString(release.tag, TAG, 'provenance_tag_invalid');
  exactString(release.commitSha, COMMIT_SHA, 'provenance_commit_invalid');
  exactString(release.publishedAt, '2026-08-18T11:15:08Z', 'provenance_published_at_invalid');
  officialGithubUrl(
    release.releaseUrl,
    `${OFFICIAL_REPOSITORY}/releases/tag/${TAG}`,
    'provenance_release_url_invalid',
  );

  const license = record(provenance.license, 'provenance_license_invalid');
  exactKeys(
    license,
    ['spdxId', 'sourceUrl', 'distributionReviewStatus'],
    'provenance_license_keys_invalid',
  );
  exactString(license.spdxId, 'AGPL-3.0', 'provenance_license_spdx_invalid');
  officialGithubUrl(
    license.sourceUrl,
    `${OFFICIAL_REPOSITORY}/blob/${TAG}/LICENSE`,
    'provenance_license_url_invalid',
  );
  exactString(license.distributionReviewStatus, 'required', 'provenance_license_review_invalid');

  const installer = record(provenance.windowsX64Installer, 'provenance_installer_invalid');
  exactKeys(
    installer,
    ['name', 'sizeBytes', 'sha256', 'sourceUrl'],
    'provenance_installer_keys_invalid',
  );
  exactString(installer.name, 'siyuan-3.8.1-win.exe', 'provenance_installer_name_invalid');
  positiveInteger(installer.sizeBytes, INSTALLER_BYTES, 'provenance_installer_size_invalid');
  exactString(installer.sha256, INSTALLER_SHA256, 'provenance_installer_sha_invalid');
  officialGithubUrl(
    installer.sourceUrl,
    `${OFFICIAL_REPOSITORY}/releases/download/${TAG}/siyuan-3.8.1-win.exe`,
    'provenance_installer_url_invalid',
  );

  const status = record(provenance.integrationStatus, 'provenance_status_invalid');
  exactKeys(
    status,
    [
      'runtimeClosureDerived',
      'runtimePayloadCommitted',
      'runtimeExecuted',
      'licenseReviewComplete',
      'installerMeasured',
      'releaseReady',
    ],
    'provenance_status_keys_invalid',
  );
  for (const [key, state] of Object.entries(status))
    boolean(state, false, `provenance_${key}_must_be_false`);
  return true;
}

function validateLedgerEntries(entries, entryKeys, evidenceKey, codePrefix) {
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > 500)
    fail(`${codePrefix}_entries_invalid`);
  const ids = new Set();
  const counts = new Map([...STATUS_VALUES].map((status) => [status, 0]));
  for (const raw of entries) {
    const entry = record(raw, `${codePrefix}_entry_invalid`);
    exactKeys(entry, entryKeys, `${codePrefix}_entry_keys_invalid`);
    if (
      typeof entry.id !== 'string' ||
      !/^[a-z0-9][a-z0-9-]{0,99}$/.test(entry.id) ||
      ids.has(entry.id)
    ) {
      fail(`${codePrefix}_entry_id_invalid`);
    }
    ids.add(entry.id);
    if (!STATUS_VALUES.has(entry.status)) fail(`${codePrefix}_entry_status_invalid`);
    if (entry.status !== 'BLOCKED') fail(`${codePrefix}_premature_pass_claim`);
    if (typeof entry.reason !== 'string' || entry.reason.length < 12 || entry.reason.length > 500) {
      fail(`${codePrefix}_entry_reason_invalid`);
    }
    stringArray(entry[evidenceKey], `${codePrefix}_entry_evidence_invalid`);
    if (entry[evidenceKey].length !== 0) fail(`${codePrefix}_unverified_evidence_forbidden`);
    counts.set(entry.status, counts.get(entry.status) + 1);
  }
  return counts;
}

export function validateFeatureParityLedger(value) {
  const ledger = record(value, 'feature_ledger_invalid');
  exactKeys(
    ledger,
    ['schemaVersion', 'upstream', 'releaseClaim', 'summary', 'entries'],
    'feature_ledger_keys_invalid',
  );
  positiveInteger(ledger.schemaVersion, 1, 'feature_ledger_schema_invalid');
  validateUpstream(ledger.upstream, 'feature_ledger_upstream');
  exactString(ledger.releaseClaim, 'blocked', 'feature_ledger_release_claim_invalid');
  const counts = validateLedgerEntries(
    ledger.entries,
    ['id', 'label', 'status', 'reason', 'evidence'],
    'evidence',
    'feature_ledger',
  );
  for (const entry of ledger.entries) {
    if (typeof entry.label !== 'string' || entry.label.length < 3 || entry.label.length > 200) {
      fail('feature_ledger_entry_label_invalid');
    }
  }
  const summary = record(ledger.summary, 'feature_ledger_summary_invalid');
  exactKeys(
    summary,
    ['passNative', 'passBridged', 'passVibeSpaceRoute', 'entitlementExternal', 'blocked'],
    'feature_ledger_summary_keys_invalid',
  );
  const expected = {
    passNative: counts.get('PASS_NATIVE'),
    passBridged: counts.get('PASS_BRIDGED'),
    passVibeSpaceRoute: counts.get('PASS_VIBESPACE_ROUTE'),
    entitlementExternal: counts.get('ENTITLEMENT_EXTERNAL'),
    blocked: counts.get('BLOCKED'),
  };
  for (const [key, count] of Object.entries(expected)) {
    if (!Number.isSafeInteger(summary[key]) || summary[key] !== count)
      fail('feature_ledger_summary_invalid');
  }
  return true;
}

export function validateElectronTauriLedger(value) {
  const ledger = record(value, 'bridge_ledger_invalid');
  exactKeys(
    ledger,
    ['schemaVersion', 'upstream', 'releaseClaim', 'entries'],
    'bridge_ledger_keys_invalid',
  );
  positiveInteger(ledger.schemaVersion, 1, 'bridge_ledger_schema_invalid');
  validateUpstream(ledger.upstream, 'bridge_ledger_upstream');
  exactString(ledger.releaseClaim, 'blocked', 'bridge_ledger_release_claim_invalid');
  validateLedgerEntries(
    ledger.entries,
    ['id', 'status', 'reason', 'testEvidence'],
    'testEvidence',
    'bridge_ledger',
  );
  return true;
}

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

export async function verifySiyuanRuntimeArtifacts() {
  const [manifest, provenance, featureParity, bridgeParity] = await Promise.all([
    readJson(new URL('../app/src-tauri/resources/siyuan-runtime-manifest.json', import.meta.url)),
    readJson(new URL('../docs/oss/siyuan-runtime-provenance.json', import.meta.url)),
    readJson(new URL('../docs/oss/siyuan-feature-parity.json', import.meta.url)),
    readJson(new URL('../docs/oss/siyuan-electron-tauri-parity.json', import.meta.url)),
  ]);
  validateRuntimeManifest(manifest);
  validateProvenance(provenance);
  validateFeatureParityLedger(featureParity);
  validateElectronTauriLedger(bridgeParity);
  return Object.freeze({
    tag: TAG,
    commitSha: COMMIT_SHA,
    featureEnabled: false,
    payloadIncluded: false,
    featureBlockedCount: featureParity.summary.blocked,
    bridgeBlockedCount: bridgeParity.entries.length,
  });
}

const entryPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (entryPath === import.meta.url) {
  verifySiyuanRuntimeArtifacts()
    .then((result) => {
      console.log(
        `SiYuan runtime manifest: PASS (${result.tag}, disabled, no payload, ${result.featureBlockedCount} feature blocks, ${result.bridgeBlockedCount} bridge blocks)`,
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : 'siyuan_manifest_verification_failed');
      process.exitCode = 1;
    });
}
