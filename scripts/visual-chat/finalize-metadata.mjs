import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import { validateFinalMetadata, validatePassLedger } from './pass-ledger.mjs';
import { loadOrigamiReferenceContract } from './reference-contract.mjs';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPOSITORY_ROOT = resolve(MODULE_DIRECTORY, '../..');

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const REGION_NAME_PATTERN = /^[a-z0-9_-]+$/;
const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1']);
const EVIDENCE_KEYS = Object.freeze([
  'screenshotSha256',
  'reportSha256',
  'diffSha256',
  'overlaySha256',
]);
const ARTIFACT_KINDS = Object.freeze(['screenshot', 'report', 'diff', 'overlay']);

function clone(value) {
  return structuredClone(value);
}

function isContained(parent, candidate) {
  return candidate === parent || candidate.startsWith(`${parent}${sep}`);
}

function lstatEntry(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function assertKnownOptions(options, allowed, label) {
  for (const name of Object.keys(options)) {
    if (!allowed.has(name)) {
      throw new Error(`Unknown ${label} option: ${name}`);
    }
  }
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

function requireSha256(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be a lowercase 64-character SHA-256 hash.`);
  }
  return value;
}

function requirePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function requirePositiveFinite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
  return value;
}

function requireLocalRoute(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('route must be a non-empty string.');
  }
  if (value.trim() !== value) {
    throw new Error('route must be a local HTTP URL without surrounding whitespace.');
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('route must be a local HTTP URL.');
  }
  if (url.protocol !== 'http:' || !LOCAL_HOSTNAMES.has(url.hostname)) {
    throw new Error('route must be a local HTTP URL.');
  }
  return value;
}

function orderedEvidence(evidence, label) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new Error(`${label} must be an object.`);
  }
  const unexpected = Object.keys(evidence).filter((key) => !EVIDENCE_KEYS.includes(key));
  if (unexpected.length > 0) {
    throw new Error(`${label} contains unexpected keys: ${unexpected.sort().join(', ')}.`);
  }
  const ordered = {};
  for (const key of EVIDENCE_KEYS) {
    if (!SHA256_PATTERN.test(evidence[key] ?? '')) {
      throw new Error(`${label}.${key} must be a lowercase 64-character SHA-256 hash.`);
    }
    ordered[key] = evidence[key];
  }
  return ordered;
}

function sortedRegions(regions, label) {
  if (!regions || typeof regions !== 'object' || Array.isArray(regions)) {
    throw new Error(`${label} must be an object.`);
  }
  const sorted = {};
  for (const name of Object.keys(regions).sort()) {
    sorted[name] = regions[name];
  }
  return sorted;
}

function requireContract(contract) {
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    throw new Error('contract must be an object.');
  }
  const source = contract.viewport;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('contract.viewport must be an object.');
  }
  const viewport = {
    width: requirePositiveInteger(source.width, 'contract.viewport.width'),
    height: requirePositiveInteger(source.height, 'contract.viewport.height'),
    deviceScaleFactor: requirePositiveFinite(
      source.deviceScaleFactor,
      'contract.viewport.deviceScaleFactor',
    ),
    browserZoomPercent: requirePositiveFinite(
      source.browserZoomPercent,
      'contract.viewport.browserZoomPercent',
    ),
  };
  if (!Array.isArray(contract.regions) || contract.regions.length === 0) {
    throw new Error('contract.regions must be a non-empty array.');
  }
  const seen = new Set();
  const regions = [];
  for (const region of contract.regions) {
    if (!region || typeof region !== 'object' || Array.isArray(region)) {
      throw new Error('contract.regions entries must be objects.');
    }
    const name = region.name;
    if (typeof name !== 'string' || !REGION_NAME_PATTERN.test(name)) {
      throw new Error(`contract region name is unsafe: ${String(name)}.`);
    }
    if (seen.has(name)) {
      throw new Error(`contract region name is duplicated: ${name}.`);
    }
    seen.add(name);
    regions.push({ name });
  }
  return { viewport, regions };
}

function requireRegionNamesMatchContract(regions, contract, label) {
  const actual = Object.keys(regions ?? {}).sort();
  const expected = contract.regions.map(({ name }) => name).sort();
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(`${label} regions do not match the reference contract regions.`);
  }
}

function buildBaselineMeasurement(source, contract) {
  requireRegionNamesMatchContract(source.regions, contract, 'baseline');
  return {
    revision: clone(source.revision),
    fullDiff: source.fullDiff,
    weightedDiff: source.weightedDiff,
    regions: sortedRegions(source.regions, 'baseline.regions'),
    evidence: orderedEvidence(source.evidence, 'baseline.evidence'),
  };
}

function buildFinalMeasurement(source, contract, route) {
  requireRegionNamesMatchContract(source.regions, contract, 'final');
  return {
    revision: clone(source.revision),
    route,
    viewport: clone(contract.viewport),
    fullDiff: source.fullDiff,
    weightedDiff: source.weightedDiff,
    regions: sortedRegions(source.regions, 'final.regions'),
    evidence: orderedEvidence(source.evidence, 'final.evidence'),
  };
}

function requireComputedEvidenceMatch(computedEvidence, baselineEvidence, finalEvidence) {
  if (
    !computedEvidence ||
    typeof computedEvidence !== 'object' ||
    Array.isArray(computedEvidence)
  ) {
    throw new Error('computedEvidence must be an object.');
  }
  assertKnownOptions(computedEvidence, new Set(['baseline', 'final']), 'computedEvidence');
  if (computedEvidence.baseline !== undefined) {
    const computed = orderedEvidence(computedEvidence.baseline, 'computedEvidence.baseline');
    if (!isDeepStrictEqual(computed, orderedEvidence(baselineEvidence, 'baseline.evidence'))) {
      throw new Error(
        'computedEvidence.baseline does not match the ledger baseline evidence (stale or mismatched artifact).',
      );
    }
  }
  if (computedEvidence.final !== undefined) {
    const computed = orderedEvidence(computedEvidence.final, 'computedEvidence.final');
    if (!isDeepStrictEqual(computed, orderedEvidence(finalEvidence, 'final.evidence'))) {
      throw new Error(
        'computedEvidence.final does not match the ledger final evidence (stale or mismatched artifact).',
      );
    }
  }
}

export function buildFinalMetadata(options = {}) {
  assertKnownOptions(
    options,
    new Set([
      'ledger',
      'contract',
      'route',
      'referenceTargetSha256',
      'passLedgerSha256',
      'computedEvidence',
    ]),
    'final metadata',
  );

  const ledger = validatePassLedger(options.ledger);
  const contract = requireContract(options.contract);
  const route = requireLocalRoute(options.route);
  const referenceTargetSha256 = requireSha256(
    options.referenceTargetSha256,
    'referenceTargetSha256',
  );
  const passLedgerSha256 = requireSha256(options.passLedgerSha256, 'passLedgerSha256');

  const keptPasses = ledger.passes.filter(({ decision }) => decision === 'kept');
  const rejectedPasses = ledger.passes.filter(({ decision }) => decision === 'rejected');
  const finalSource = keptPasses.at(-1) ?? ledger.baseline;

  if (options.computedEvidence !== undefined) {
    requireComputedEvidenceMatch(
      options.computedEvidence,
      ledger.baseline.evidence,
      finalSource.evidence,
    );
  }

  const metadata = {
    schemaVersion: 1,
    referenceTargetSha256,
    passLedgerSha256,
    passCount: ledger.passes.length,
    keptPassCount: keptPasses.length,
    rejectedPassCount: rejectedPasses.length,
    baseline: buildBaselineMeasurement(ledger.baseline, contract),
    final: buildFinalMeasurement(finalSource, contract, route),
  };

  validateFinalMetadata(metadata, { ledger, contract });
  return metadata;
}

export function serializeFinalMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error('final metadata must be an object.');
  }
  return `${JSON.stringify(metadata, null, 2)}\n`;
}

function parseJsonObject(bytes, label) {
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`Invalid ${label} JSON: ${error.message}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value;
}

function requireExistingDirectory(root, label) {
  const resolved = resolve(root);
  const entry = lstatEntry(resolved);
  if (!entry?.isDirectory()) {
    throw new Error(`${label} must be an existing directory: ${resolved}`);
  }
  if (entry.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link: ${resolved}`);
  }
  return resolved;
}

function assertSafePathWithinRoot(repositoryRoot, candidate, label) {
  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  const root = resolve(repositoryRoot);
  const target = resolve(candidate);
  if (!isContained(root, target)) {
    throw new Error(`${label} escapes repositoryRoot: ${target}`);
  }
  return target;
}

function requireExistingRegularFile(repositoryRoot, candidate, label) {
  const target = assertSafePathWithinRoot(repositoryRoot, candidate, label);
  const entry = lstatEntry(target);
  if (!entry) {
    throw new Error(`${label} does not exist: ${target}`);
  }
  if (entry.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link: ${target}`);
  }
  if (!entry.isFile()) {
    throw new Error(`${label} must be a regular file: ${target}`);
  }
  const realRoot = realpathSync(resolve(repositoryRoot));
  const realTarget = realpathSync(target);
  if (!isContained(realRoot, realTarget)) {
    throw new Error(`${label} resolves outside repositoryRoot: ${target}`);
  }
  return target;
}

function requireExistingDirectoryWithinRoot(repositoryRoot, candidate, label) {
  const target = assertSafePathWithinRoot(repositoryRoot, candidate, label);
  const entry = lstatEntry(target);
  if (!entry) {
    throw new Error(`${label} does not exist: ${target}`);
  }
  if (entry.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link: ${target}`);
  }
  if (!entry.isDirectory()) {
    throw new Error(`${label} must be a directory: ${target}`);
  }
  const realRoot = realpathSync(resolve(repositoryRoot));
  const realTarget = realpathSync(target);
  if (!isContained(realRoot, realTarget)) {
    throw new Error(`${label} resolves outside repositoryRoot: ${target}`);
  }
  return target;
}

function computeEvidenceGroup(repositoryRoot, group, label) {
  if (!group || typeof group !== 'object' || Array.isArray(group)) {
    throw new Error(`${label} must be an object.`);
  }
  assertKnownOptions(group, new Set(ARTIFACT_KINDS), label);
  const evidence = {};
  for (const kind of ARTIFACT_KINDS) {
    const filePath = group[kind];
    if (filePath === undefined) {
      throw new Error(`${label}.${kind} artifact path is required (missing evidence).`);
    }
    const resolved = requireExistingRegularFile(repositoryRoot, filePath, `${label}.${kind}`);
    evidence[`${kind}Sha256`] = sha256File(resolved);
  }
  return evidence;
}

function computeArtifactEvidence(repositoryRoot, artifacts) {
  if (!artifacts || typeof artifacts !== 'object' || Array.isArray(artifacts)) {
    throw new Error('artifacts must be an object.');
  }
  assertKnownOptions(artifacts, new Set(['baseline', 'final']), 'artifacts');
  const computed = {};
  if (artifacts.baseline !== undefined) {
    computed.baseline = computeEvidenceGroup(
      repositoryRoot,
      artifacts.baseline,
      'artifacts.baseline',
    );
  }
  if (artifacts.final !== undefined) {
    computed.final = computeEvidenceGroup(repositoryRoot, artifacts.final, 'artifacts.final');
  }
  return computed;
}

function writeFinalMetadataFile(repositoryRoot, destinationPath, serialized, overwrite) {
  const policy = overwrite ?? 'never';
  if (policy !== 'never' && policy !== 'replace') {
    throw new Error(`Unknown overwrite policy: ${String(overwrite)}.`);
  }
  const target = assertSafePathWithinRoot(repositoryRoot, destinationPath, 'destinationPath');
  const existing = lstatEntry(target);
  if (existing) {
    if (existing.isSymbolicLink()) {
      throw new Error(`destinationPath must not be a symbolic link: ${target}`);
    }
    if (policy !== 'replace') {
      throw new Error(`Refusing to overwrite existing final metadata destination: ${target}`);
    }
  }
  const targetDirectory = dirname(target);
  mkdirSync(targetDirectory, { recursive: true });
  const tempPath = `${target}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    writeFileSync(tempPath, serialized, { encoding: 'utf8', flag: 'wx' });
    renameSync(tempPath, target);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }
  return target;
}

export function materializeFinalMetadata(options = {}) {
  assertKnownOptions(
    options,
    new Set([
      'repositoryRoot',
      'ledgerPath',
      'contract',
      'referenceRoot',
      'referenceTargetPath',
      'route',
      'destinationPath',
      'overwrite',
      'artifacts',
    ]),
    'materialization',
  );

  const repositoryRoot = requireExistingDirectory(
    options.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT,
    'repositoryRoot',
  );

  const ledgerPath = requireExistingRegularFile(repositoryRoot, options.ledgerPath, 'ledgerPath');
  const ledgerBytes = readFileSync(ledgerPath);
  const passLedgerSha256 = sha256Bytes(ledgerBytes);
  const ledger = parseJsonObject(ledgerBytes, 'pass ledger');

  let contract;
  let defaultReferenceTargetPath;
  if (options.contract !== undefined) {
    contract = options.contract;
  } else if (options.referenceRoot !== undefined) {
    const referenceRoot = requireExistingDirectoryWithinRoot(
      repositoryRoot,
      options.referenceRoot,
      'referenceRoot',
    );
    const loaded = loadOrigamiReferenceContract(referenceRoot);
    contract = loaded;
    defaultReferenceTargetPath = loaded.targetPath;
  } else {
    throw new Error('materialization requires either contract or referenceRoot.');
  }

  const referenceTargetPath = requireExistingRegularFile(
    repositoryRoot,
    options.referenceTargetPath ?? defaultReferenceTargetPath,
    'referenceTargetPath',
  );
  const referenceTargetSha256 = sha256File(referenceTargetPath);

  const computedEvidence =
    options.artifacts !== undefined
      ? computeArtifactEvidence(repositoryRoot, options.artifacts)
      : undefined;

  const metadata = buildFinalMetadata({
    ledger,
    contract,
    route: options.route,
    referenceTargetSha256,
    passLedgerSha256,
    computedEvidence,
  });

  const serialized = serializeFinalMetadata(metadata);
  const destination = writeFinalMetadataFile(
    repositoryRoot,
    options.destinationPath,
    serialized,
    options.overwrite,
  );

  return { metadata, destinationPath: destination, referenceTargetSha256, passLedgerSha256 };
}

export { DEFAULT_REPOSITORY_ROOT };
