import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CATALOG_REFRESH_INTERVAL_MS,
  EMPTY_CATALOG_RETRY_MS,
  REQUIRED_CAPABILITY_IDS,
  REQUIRED_NATIVE_TRANSITION_IDS,
  validateAuditedFileDigests,
  validateOpenCodeRefreshReconnectReport,
} from './pr31-opencode-refresh-reconnect-evidence.mjs';

const reportUrl = new URL(
  '../docs/operations/PR31_OPENCODE_REFRESH_RECONNECT_REPORT.json',
  import.meta.url,
);

async function readReport() {
  return JSON.parse(await readFile(reportUrl, 'utf8'));
}

function clone(value) {
  return structuredClone(value);
}

function makeVerifiedNativeReport(report) {
  const verified = clone(report);
  verified.status = 'verified';
  verified.matrixStatus = 'Implemented and verified';
  verified.completionClaimed = true;
  verified.nativeHandoff.status = 'verified';
  verified.nativeHandoff.remainingBoundary = null;
  verified.nativeHandoff.observed = {
    authority: {
      executable: 'jarvis.exe',
      officialProfileVerified: true,
      productHead: '0123456789abcdef0123456789abcdef01234567',
    },
    safety: {
      ollamaProcessCountBefore: 0,
      ollamaProcessCountAfter: 0,
      port11434ListenerCountBefore: 0,
      port11434ListenerCountAfter: 0,
      credentialsMutated: false,
      productionMutated: false,
      manualRefreshUsedForScheduledProof: false,
    },
    modelContinuity: {
      qualifiedModelIdsBefore: ['opencode-go/deepseek-v4-flash-vision-exp'],
      qualifiedModelIdsAfter: ['opencode-go/deepseek-v4-flash-vision-exp'],
      substitutionObserved: false,
    },
    lifecycle: {
      autoConnectedWithoutManualAction: true,
      scheduledRefreshElapsedMs: CATALOG_REFRESH_INTERVAL_MS,
      documentedManagedLifecycleControl: true,
      currentSessionDisconnectObserved: true,
      liveAuthorityHiddenDuringDisconnect: true,
      automaticReconnectSameAppSession: true,
      manualReconnectActionUsed: false,
      appRestartUsedAsReconnectProof: false,
    },
  };
  for (const transition of verified.nativeHandoff.requiredTransitions) {
    transition.status = 'passed';
    transition.proof = [`evidence/${transition.id}.json`];
  }
  return verified;
}

test('accepts the checked-in automated-complete report while preserving the native boundary', async () => {
  const report = await readReport();
  const result = validateOpenCodeRefreshReconnectReport(report);
  const digestResult = await validateAuditedFileDigests(report);

  assert.equal(result.ok, true, result.issues.join('\n'));
  assert.equal(digestResult.ok, true, digestResult.issues.join('\n'));
  assert.equal(report.policy.catalogRefreshIntervalMs, CATALOG_REFRESH_INTERVAL_MS);
  assert.equal(report.policy.emptyCatalogRetryMs, EMPTY_CATALOG_RETRY_MS);
  assert.deepEqual(
    report.automatedEvidence.capabilities.map(({ id }) => id).sort(),
    [...REQUIRED_CAPABILITY_IDS].sort(),
  );
  assert.deepEqual(
    report.nativeHandoff.requiredTransitions.map(({ id }) => id).sort(),
    [...REQUIRED_NATIVE_TRANSITION_IDS].sort(),
  );
});

test('fails closed when native verification is required but still pending', async () => {
  const report = await readReport();
  const result = validateOpenCodeRefreshReconnectReport(report, { requireNative: true });

  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /official-native evidence is still pending/u);
});

test('rejects an altered five-minute or empty-catalog retry policy', async () => {
  const report = await readReport();
  report.policy.catalogRefreshIntervalMs = 299_999;
  report.policy.emptyCatalogRetryMs = 300_000;

  const result = validateOpenCodeRefreshReconnectReport(report);

  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /catalog refresh interval/u);
  assert.match(result.issues.join('\n'), /empty-catalog retry/u);
});

test('rejects missing automated recovery capability evidence', async () => {
  const report = await readReport();
  report.automatedEvidence.capabilities = report.automatedEvidence.capabilities.filter(
    ({ id }) => id !== 'stale-inflight-result-rejected',
  );

  const result = validateOpenCodeRefreshReconnectReport(report);

  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /stale-inflight-result-rejected/u);
});

test('rejects a completion claim while the native lifecycle is pending', async () => {
  const report = await readReport();
  report.status = 'verified';
  report.matrixStatus = 'Implemented and verified';
  report.completionClaimed = true;

  const result = validateOpenCodeRefreshReconnectReport(report);

  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /cannot claim completion/u);
});

test('accepts a complete native report only with every required transition and stable exact routes', async () => {
  const report = makeVerifiedNativeReport(await readReport());
  const result = validateOpenCodeRefreshReconnectReport(report, { requireNative: true });

  assert.equal(result.ok, true, result.issues.join('\n'));
});

test('rejects native substitution, manual scheduled refresh, and unsafe local-provider evidence', async () => {
  const report = makeVerifiedNativeReport(await readReport());
  report.nativeHandoff.observed.modelContinuity.qualifiedModelIdsAfter = ['openai/gpt-5.6-luna'];
  report.nativeHandoff.observed.modelContinuity.substitutionObserved = true;
  report.nativeHandoff.observed.safety.manualRefreshUsedForScheduledProof = true;
  report.nativeHandoff.observed.safety.ollamaProcessCountAfter = 1;
  report.nativeHandoff.observed.safety.port11434ListenerCountAfter = 1;

  const result = validateOpenCodeRefreshReconnectReport(report, { requireNative: true });

  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /manual refresh/u);
  assert.match(result.issues.join('\n'), /Ollama/u);
  assert.match(result.issues.join('\n'), /11434/u);
  assert.match(result.issues.join('\n'), /substitution/u);
  assert.match(result.issues.join('\n'), /exact qualified model routes changed/u);
});

test('rejects an early timer, app-restart proxy, or non-session reconnect claim', async () => {
  const report = makeVerifiedNativeReport(await readReport());
  report.nativeHandoff.observed.lifecycle.scheduledRefreshElapsedMs =
    CATALOG_REFRESH_INTERVAL_MS - 1;
  report.nativeHandoff.observed.lifecycle.documentedManagedLifecycleControl = false;
  report.nativeHandoff.observed.lifecycle.liveAuthorityHiddenDuringDisconnect = false;
  report.nativeHandoff.observed.lifecycle.automaticReconnectSameAppSession = false;
  report.nativeHandoff.observed.lifecycle.appRestartUsedAsReconnectProof = true;

  const result = validateOpenCodeRefreshReconnectReport(report, { requireNative: true });

  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /at least 300000ms/u);
  assert.match(result.issues.join('\n'), /documented managed lifecycle control/u);
  assert.match(result.issues.join('\n'), /hide live executable authority/u);
  assert.match(result.issues.join('\n'), /same app session/u);
  assert.match(result.issues.join('\n'), /app restart cannot substitute/u);
});

test('recomputes audited file digests instead of trusting report-shaped hashes', async () => {
  const report = await readReport();
  report.automatedEvidence.auditedFiles[0].sha256 = '0'.repeat(64);

  const result = await validateAuditedFileDigests(report);

  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /digest mismatch/u);
});

test('rejects secret-bearing report fields', async () => {
  const report = await readReport();
  report.nativeHandoff.apiKey = 'must-never-be-recorded';

  const result = validateOpenCodeRefreshReconnectReport(report);

  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /forbidden sensitive field/u);
});
