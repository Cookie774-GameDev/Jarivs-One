#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const CATALOG_REFRESH_INTERVAL_MS = 300_000;
export const EMPTY_CATALOG_RETRY_MS = 15_000;

export const REQUIRED_CAPABILITY_IDS = Object.freeze([
  'current-session-auth-gate',
  'immediate-auto-detection',
  'incremental-detection-publish',
  'post-login-forced-invalidation',
  'immediate-connected-provider-refresh',
  'five-minute-connected-provider-refresh',
  'five-minute-authenticated-opencode-refresh',
  'fifteen-second-empty-catalog-retry',
  'same-account-transient-failure-retention',
  'stale-inflight-result-rejected',
  'account-generation-isolation',
  'managed-runtime-generation-recovery',
  'unavailable-static-fallback-non-executable',
]);

export const REQUIRED_NATIVE_TRANSITION_IDS = Object.freeze([
  'official-cold-auto-connect',
  'scheduled-five-minute-refresh',
  'honest-managed-disconnect',
  'automatic-reconnect',
  'exact-route-restoration',
]);

const REQUIRED_TEST_FILES = Object.freeze([
  'src/lib/ai/useAccessibleChatModels.test.ts',
  'src/lib/ai/useAccessibleChatModels.smoke.test.ts',
  'src/lib/ai/adapters/autoDetectConnections.test.ts',
  'src/lib/ai/connectionCatalog.test.ts',
  'src/lib/ai/adapters/opencodePersistent.test.ts',
  'src/lib/harness/runtimeManager.test.ts',
]);

const REQUIRED_AUDITED_FILES = Object.freeze([
  'app/src/lib/ai/useAccessibleChatModels.ts',
  'app/src/lib/ai/useAccessibleChatModels.test.ts',
  'app/src/lib/ai/useAccessibleChatModels.smoke.test.ts',
  'app/src/lib/ai/adapters/autoDetectConnections.ts',
  'app/src/lib/ai/adapters/autoDetectConnections.test.ts',
  'app/src/lib/ai/connectionCatalog.ts',
  'app/src/lib/ai/connectionCatalog.test.ts',
  'app/src/lib/ai/adapters/opencodePersistent.ts',
  'app/src/lib/ai/adapters/opencodePersistent.test.ts',
  'app/src/lib/harness/runtimeManager.ts',
  'app/src/lib/harness/runtimeManager.test.ts',
]);

const FORBIDDEN_REPORT_KEYS = new Set([
  'apikey',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'authorizationheader',
  'cookie',
  'secret',
  'credentialvalue',
  'rawoutput',
  'rawlog',
]);

const DEFAULT_REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url));

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function collectForbiddenKeys(value, path = '$', findings = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectForbiddenKeys(entry, `${path}[${index}]`, findings));
    return findings;
  }
  if (!isRecord(value)) return findings;
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = key.replace(/[^a-z0-9]/giu, '').toLowerCase();
    if (FORBIDDEN_REPORT_KEYS.has(normalizedKey)) findings.push(`${path}.${key}`);
    collectForbiddenKeys(entry, `${path}.${key}`, findings);
  }
  return findings;
}

function exactStringSet(actual, expected) {
  if (!Array.isArray(actual) || actual.some((entry) => typeof entry !== 'string')) return false;
  if (new Set(actual).size !== actual.length || actual.length !== expected.length) return false;
  const actualSet = new Set(actual);
  return expected.every((entry) => actualSet.has(entry));
}

function exactIds(entries, expected) {
  return (
    Array.isArray(entries) &&
    exactStringSet(
      entries.map((entry) => entry?.id),
      expected,
    )
  );
}

function hasStringArray(value) {
  return (
    Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === 'string')
  );
}

export async function validateAuditedFileDigests(
  report,
  { repositoryRoot = DEFAULT_REPOSITORY_ROOT } = {},
) {
  const issues = [];
  const auditedFiles = report?.automatedEvidence?.auditedFiles;
  if (!Array.isArray(auditedFiles)) {
    return { ok: false, issues: ['auditedFiles must be present before digest verification'] };
  }
  for (const entry of auditedFiles) {
    if (typeof entry?.id !== 'string' || !/^[0-9a-f]{64}$/u.test(entry?.sha256 ?? '')) {
      issues.push(`${entry?.id ?? 'unknown file'} has no valid recorded digest`);
      continue;
    }
    try {
      const content = await readFile(resolve(repositoryRoot, entry.id));
      const observed = createHash('sha256').update(content).digest('hex');
      if (observed !== entry.sha256) issues.push(`${entry.id} digest mismatch`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      issues.push(`${entry.id} could not be audited: ${message}`);
    }
  }
  return { ok: issues.length === 0, issues };
}

export function validateOpenCodeRefreshReconnectReport(report, { requireNative = false } = {}) {
  const issues = [];
  if (!isRecord(report)) return { ok: false, issues: ['report must be an object'] };

  if (report.schemaVersion !== 1) issues.push('schemaVersion must be 1');
  if (report.suiteId !== 'pr31-opencode-refresh-reconnect-v1') {
    issues.push('suiteId must identify the PR31 OpenCode refresh/reconnect contract');
  }
  if (report.matrixRowId !== 'opencode-model-refresh-and-reconnect') {
    issues.push('matrixRowId must be opencode-model-refresh-and-reconnect');
  }
  if (!/^[0-9a-f]{40}$/u.test(report.sourceHead ?? '')) {
    issues.push('sourceHead must be an exact 40-character commit SHA');
  }
  if (report.policy?.catalogRefreshIntervalMs !== CATALOG_REFRESH_INTERVAL_MS) {
    issues.push(`catalog refresh interval must be exactly ${CATALOG_REFRESH_INTERVAL_MS}ms`);
  }
  if (report.policy?.emptyCatalogRetryMs !== EMPTY_CATALOG_RETRY_MS) {
    issues.push(`empty-catalog retry must be exactly ${EMPTY_CATALOG_RETRY_MS}ms`);
  }

  if (report.implementationAssessment?.productChangeNeeded !== false) {
    issues.push(
      'implementation assessment must record that no additional product change is needed',
    );
  }
  if (report.implementationAssessment?.nativeRequired !== true) {
    issues.push('implementation assessment must preserve the native-required boundary');
  }

  const automated = report.automatedEvidence;
  if (!isRecord(automated) || automated.status !== 'passed') {
    issues.push('automated evidence must be present and passed');
  } else {
    if (!exactStringSet(automated.testFiles, REQUIRED_TEST_FILES)) {
      issues.push('automated evidence must cover the exact six refresh/reconnect test files');
    }
    if (automated.testFileCount !== 6 || automated.testCount !== 119 || automated.failed !== 0) {
      issues.push('automated result must record the fresh 6-file, 119-test, zero-failure run');
    }
    if (!exactIds(automated.capabilities, REQUIRED_CAPABILITY_IDS)) {
      issues.push(
        `automated capabilities must contain exactly: ${REQUIRED_CAPABILITY_IDS.join(', ')}`,
      );
    } else {
      for (const capability of automated.capabilities) {
        if (capability.status !== 'passed') issues.push(`${capability.id} must be passed`);
        if (!hasStringArray(capability.sourceRefs)) {
          issues.push(`${capability.id} must cite at least one source reference`);
        }
        if (!hasStringArray(capability.testRefs)) {
          issues.push(`${capability.id} must cite at least one test reference`);
        }
      }
    }
    if (!exactIds(automated.auditedFiles, REQUIRED_AUDITED_FILES)) {
      issues.push('auditedFiles must cover the exact eleven implementation and test files');
    } else {
      for (const file of automated.auditedFiles) {
        if (!/^[0-9a-f]{64}$/u.test(file.sha256 ?? '')) {
          issues.push(`${file.id} must include a lowercase SHA-256 digest`);
        }
      }
    }
  }

  const native = report.nativeHandoff;
  if (!isRecord(native)) {
    issues.push('nativeHandoff must be present');
  } else {
    const constraints = native.constraints;
    if (
      constraints?.ollamaAllowed !== false ||
      constraints?.port11434Allowed !== false ||
      constraints?.credentialsMayChange !== false ||
      constraints?.productionMayChange !== false ||
      constraints?.substitutionAllowed !== false ||
      constraints?.manualRefreshMaySatisfyScheduledRefresh !== false
    ) {
      issues.push('native handoff must preserve every fail-closed safety constraint');
    }
    if (!exactIds(native.requiredTransitions, REQUIRED_NATIVE_TRANSITION_IDS)) {
      issues.push(
        `native transitions must contain exactly: ${REQUIRED_NATIVE_TRANSITION_IDS.join(', ')}`,
      );
    }

    if (native.status === 'pending') {
      if (requireNative) issues.push('official-native evidence is still pending');
      if (
        report.status !== 'automated-complete-native-pending' ||
        report.matrixStatus !== 'Not implemented' ||
        report.completionClaimed !== false
      ) {
        issues.push(
          'a pending native lifecycle cannot claim completion or a verified matrix status',
        );
      }
      if (typeof native.remainingBoundary !== 'string' || native.remainingBoundary.length < 40) {
        issues.push('pending native evidence must state the precise remaining boundary');
      }
      for (const transition of native.requiredTransitions ?? []) {
        if (transition.status !== 'pending' || !Array.isArray(transition.proof)) {
          issues.push(`${transition.id ?? 'unknown transition'} must remain explicitly pending`);
        }
        if (transition.proof?.length !== 0) {
          issues.push(`${transition.id} cannot contain proof before native observation`);
        }
        if (typeof transition.acceptance !== 'string' || transition.acceptance.length < 30) {
          issues.push(`${transition.id} must state a concrete native acceptance condition`);
        }
      }
    } else if (native.status === 'verified') {
      if (
        report.status !== 'verified' ||
        report.matrixStatus !== 'Implemented and verified' ||
        report.completionClaimed !== true
      ) {
        issues.push('verified native evidence must align report and matrix completion fields');
      }
      if (native.remainingBoundary !== null) {
        issues.push('verified native evidence cannot retain a remaining boundary');
      }
      for (const transition of native.requiredTransitions ?? []) {
        if (transition.status !== 'passed' || !hasStringArray(transition.proof)) {
          issues.push(`${transition.id ?? 'unknown transition'} needs passed native proof`);
        }
      }
      const observed = native.observed;
      if (
        observed?.authority?.executable !== 'jarvis.exe' ||
        observed?.authority?.officialProfileVerified !== true ||
        !/^[0-9a-f]{40}$/u.test(observed?.authority?.productHead ?? '')
      ) {
        issues.push('native authority must prove official jarvis.exe, profile, and product HEAD');
      }
      if (observed?.safety?.manualRefreshUsedForScheduledProof !== false) {
        issues.push('manual refresh cannot satisfy the scheduled five-minute proof');
      }
      if (
        observed?.safety?.ollamaProcessCountBefore !== 0 ||
        observed?.safety?.ollamaProcessCountAfter !== 0
      ) {
        issues.push('Ollama must remain absent before and after native evidence');
      }
      if (
        observed?.safety?.port11434ListenerCountBefore !== 0 ||
        observed?.safety?.port11434ListenerCountAfter !== 0
      ) {
        issues.push('port 11434 must remain unused before and after native evidence');
      }
      if (
        observed?.safety?.credentialsMutated !== false ||
        observed?.safety?.productionMutated !== false
      ) {
        issues.push('native evidence cannot mutate credentials or production state');
      }
      const continuity = observed?.modelContinuity;
      if (continuity?.substitutionObserved !== false) {
        issues.push('native evidence must fail on any model substitution');
      }
      if (
        !hasStringArray(continuity?.qualifiedModelIdsBefore) ||
        !hasStringArray(continuity?.qualifiedModelIdsAfter) ||
        JSON.stringify(continuity?.qualifiedModelIdsBefore) !==
          JSON.stringify(continuity?.qualifiedModelIdsAfter)
      ) {
        issues.push('exact qualified model routes changed across disconnect/reconnect');
      }
      const lifecycle = observed?.lifecycle;
      if (lifecycle?.autoConnectedWithoutManualAction !== true) {
        issues.push('official cold auto-connect must occur without manual action');
      }
      if (
        !Number.isFinite(lifecycle?.scheduledRefreshElapsedMs) ||
        lifecycle.scheduledRefreshElapsedMs < CATALOG_REFRESH_INTERVAL_MS
      ) {
        issues.push(
          `scheduled refresh must be observed after at least ${CATALOG_REFRESH_INTERVAL_MS}ms`,
        );
      }
      if (lifecycle?.documentedManagedLifecycleControl !== true) {
        issues.push('disconnect proof must use a documented managed lifecycle control');
      }
      if (lifecycle?.currentSessionDisconnectObserved !== true) {
        issues.push('a genuine current-session disconnect must be observed');
      }
      if (lifecycle?.liveAuthorityHiddenDuringDisconnect !== true) {
        issues.push('disconnect must hide live executable authority');
      }
      if (lifecycle?.automaticReconnectSameAppSession !== true) {
        issues.push('automatic reconnect must complete in the same app session');
      }
      if (lifecycle?.manualReconnectActionUsed !== false) {
        issues.push('manual reconnect action cannot satisfy automatic reconnect');
      }
      if (lifecycle?.appRestartUsedAsReconnectProof !== false) {
        issues.push('an app restart cannot substitute for within-session reconnect proof');
      }
    } else {
      issues.push('nativeHandoff.status must be pending or verified');
    }
  }

  for (const finding of collectForbiddenKeys(report)) {
    issues.push(`forbidden sensitive field in report: ${finding}`);
  }
  return { ok: issues.length === 0, issues };
}

async function runCli() {
  const args = process.argv.slice(2);
  const requireNative = args.includes('--require-native');
  const reportArg = args.find((arg) => !arg.startsWith('--'));
  const reportUrl = reportArg
    ? pathToFileURL(reportArg)
    : new URL('../docs/operations/PR31_OPENCODE_REFRESH_RECONNECT_REPORT.json', import.meta.url);
  const report = JSON.parse(await readFile(reportUrl, 'utf8'));
  const result = validateOpenCodeRefreshReconnectReport(report, { requireNative });
  const digestResult = await validateAuditedFileDigests(report);
  const issues = [...result.issues, ...digestResult.issues];
  if (issues.length > 0) {
    for (const issue of issues) process.stderr.write(`- ${issue}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `${report.suiteId}: ${report.status}; automated ${report.automatedEvidence.testCount}/${report.automatedEvidence.testCount}; native ${report.nativeHandoff.status}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCli();
}
