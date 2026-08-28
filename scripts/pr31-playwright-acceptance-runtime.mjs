#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyTauriUpdaterSignature } from './verify-updater-signature.mjs';

const PLAYWRIGHT_VERSION = '1.61.1';
const MANIFEST_NAME = 'feature-pack.json';
const SIGNATURE_NAME = 'feature-pack.json.sig';
const INSTALLED_MANIFEST_NAME = '.vibespace-feature-pack.json';
const INSTALLED_SIGNATURE_NAME = '.vibespace-feature-pack.json.sig';
const RECEIPT_NAME = '.vibespace-acceptance-runtime-receipt.json';
const STATE_NAME = 'acceptance-runtime-state.json';
const VERSIONS_NAME = 'versions';
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_SIGNATURE_BYTES = 16 * 1024;
const MAX_FILE_BYTES = 768 * 1024 * 1024;
const MAX_TOTAL_BYTES = 1_500_000_000;
const MAX_FILES = 20_000;
const COPY_BUFFER_BYTES = 1024 * 1024;
const SAFE_INSTALLATION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{7,159}$/u;
const SAFE_ARTIFACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const SAFE_TARGET_PLATFORM = /^(?:win32|darwin|linux)-(?:x64|arm64)$/u;
const SAFE_PAYLOAD_PATH = /^(?:playwright-core|browser|licenses)\/[A-Za-z0-9._/-]{1,400}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

export class AcceptanceRuntimeError extends Error {
  constructor(code) {
    super(code);
    this.name = 'AcceptanceRuntimeError';
    this.code = code;
  }
}

function fail(code) {
  throw new AcceptanceRuntimeError(code);
}

function exactKeys(value, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function normalizeRoot(root, code) {
  if (typeof root !== 'string' || !isAbsolute(root)) fail(code);
  const normalized = resolve(root);
  if (dirname(normalized) === normalized) fail(code);
  return normalized;
}

function assertContained(root, candidate, code) {
  const delta = relative(root, candidate);
  if (delta === '' || (!delta.startsWith(`..${sep}`) && delta !== '..' && !isAbsolute(delta))) {
    return;
  }
  fail(code);
}

async function pathStat(pathname) {
  try {
    return await lstat(pathname, { bigint: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function assertNoLinkComponents(pathname, code) {
  const normalized = resolve(pathname);
  const parsed = parse(normalized);
  const segments = relative(parsed.root, normalized).split(sep).filter(Boolean);
  let current = parsed.root;
  for (const segment of segments) {
    current = join(current, segment);
    const stat = await pathStat(current);
    if (!stat) break;
    if (stat.isSymbolicLink()) fail(code);
  }
}

async function requireDirectory(pathname, code) {
  await assertNoLinkComponents(pathname, code);
  const stat = await pathStat(pathname);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) fail(code);
}

async function ensureDirectory(pathname, code) {
  await assertNoLinkComponents(dirname(pathname), code);
  await mkdir(pathname, { recursive: true });
  await requireDirectory(pathname, code);
}

function fileIdentity(stat) {
  return [stat.dev, stat.ino, stat.mode, stat.nlink, stat.size, stat.mtimeNs, stat.ctimeNs].join(
    ':',
  );
}

async function openRegularFile(pathname, maximumBytes, unsafeCode) {
  let stat;
  try {
    stat = await lstat(pathname, { bigint: true });
  } catch {
    fail(unsafeCode);
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n) fail(unsafeCode);
  if (maximumBytes !== null && stat.size > BigInt(maximumBytes)) fail(unsafeCode);
  let handle;
  try {
    handle = await open(pathname, 'r');
    const opened = await handle.stat({ bigint: true });
    if (fileIdentity(stat) !== fileIdentity(opened)) fail(unsafeCode);
    return { handle, identity: fileIdentity(opened), mode: opened.mode, size: opened.size };
  } catch (error) {
    await handle?.close().catch(() => {});
    if (error instanceof AcceptanceRuntimeError) throw error;
    fail(unsafeCode);
  }
}

async function revalidateOpenFile(binding, pathname, unsafeCode) {
  const opened = await binding.handle.stat({ bigint: true });
  const current = await pathStat(pathname);
  if (
    !current ||
    binding.identity !== fileIdentity(opened) ||
    binding.identity !== fileIdentity(current)
  ) {
    fail(unsafeCode);
  }
}

async function readBoundedRegularFile(pathname, maximumBytes, unsafeCode) {
  const binding = await openRegularFile(pathname, maximumBytes, unsafeCode);
  try {
    const bytes = await binding.handle.readFile();
    await revalidateOpenFile(binding, pathname, unsafeCode);
    return bytes;
  } finally {
    await binding.handle.close();
  }
}

async function hashOrCopyRegularFile({
  destination,
  expectedBytes,
  expectedSha256,
  source,
  unsafeCode,
}) {
  const binding = await openRegularFile(source, MAX_FILE_BYTES, unsafeCode);
  if (binding.size !== BigInt(expectedBytes)) {
    await binding.handle.close();
    fail(unsafeCode);
  }
  let destinationHandle;
  try {
    if (destination) {
      await ensureDirectory(dirname(destination), unsafeCode);
      destinationHandle = await open(destination, 'wx', Number(binding.mode & 0o777n));
    }
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
    let position = 0;
    while (position < expectedBytes) {
      const request = Math.min(buffer.length, expectedBytes - position);
      const { bytesRead } = await binding.handle.read(buffer, 0, request, position);
      if (bytesRead <= 0) fail(unsafeCode);
      hash.update(buffer.subarray(0, bytesRead));
      if (destinationHandle) await destinationHandle.write(buffer, 0, bytesRead, position);
      position += bytesRead;
    }
    const eof = await binding.handle.read(buffer, 0, 1, position);
    if (eof.bytesRead !== 0) fail(unsafeCode);
    await destinationHandle?.sync();
    await revalidateOpenFile(binding, source, unsafeCode);
    if (hash.digest('hex') !== expectedSha256) fail(unsafeCode);
  } catch (error) {
    if (error instanceof AcceptanceRuntimeError) throw error;
    fail(unsafeCode);
  } finally {
    await destinationHandle?.close().catch(() => {});
    await binding.handle.close().catch(() => {});
  }
}

function validatePayloadPath(value) {
  if (
    typeof value !== 'string' ||
    !SAFE_PAYLOAD_PATH.test(value) ||
    value.includes('//') ||
    value.includes('\\') ||
    value.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    fail('manifest_invalid_path');
  }
  return value;
}

function validateManifest(manifest, targetPlatform) {
  if (
    !exactKeys(manifest, [
      'schemaVersion',
      'id',
      'artifactVersion',
      'playwrightVersion',
      'targetPlatform',
      'browser',
      'files',
      'totalBytes',
    ]) ||
    manifest.schemaVersion !== 1 ||
    manifest.id !== 'vibespace-playwright-acceptance-runtime' ||
    !SAFE_ARTIFACT_VERSION.test(manifest.artifactVersion ?? '') ||
    manifest.playwrightVersion !== PLAYWRIGHT_VERSION
  ) {
    fail('manifest_invalid');
  }
  if (
    !SAFE_TARGET_PLATFORM.test(targetPlatform ?? '') ||
    manifest.targetPlatform !== targetPlatform
  ) {
    fail('unsupported_platform');
  }
  if (
    !exactKeys(manifest.browser, ['name', 'revision', 'executablePath']) ||
    manifest.browser.name !== 'chromium' ||
    !/^[A-Za-z0-9._-]{1,64}$/u.test(manifest.browser.revision ?? '')
  ) {
    fail('manifest_invalid');
  }
  const executablePath = validatePayloadPath(manifest.browser.executablePath);
  if (!executablePath.startsWith('browser/')) fail('manifest_invalid_path');
  if (
    !Array.isArray(manifest.files) ||
    manifest.files.length === 0 ||
    manifest.files.length > MAX_FILES
  ) {
    fail('manifest_invalid');
  }
  const names = new Set();
  let totalBytes = 0;
  for (const file of manifest.files) {
    if (
      !exactKeys(file, ['path', 'bytes', 'sha256']) ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 0 ||
      file.bytes > MAX_FILE_BYTES ||
      !SHA256.test(file.sha256 ?? '')
    ) {
      fail('manifest_invalid');
    }
    const filePath = validatePayloadPath(file.path);
    if (names.has(filePath)) fail('manifest_invalid');
    names.add(filePath);
    totalBytes += file.bytes;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_TOTAL_BYTES) fail('manifest_invalid');
  }
  if (
    manifest.totalBytes !== totalBytes ||
    !names.has(executablePath) ||
    !names.has('playwright-core/package.json')
  ) {
    fail('manifest_invalid');
  }
  return manifest;
}

async function readSignedManifestPair({ manifestPath, publicKey, signaturePath, targetPlatform }) {
  if (typeof publicKey !== 'string' || publicKey.length === 0 || publicKey.length > 16 * 1024) {
    fail('trusted_public_key_required');
  }
  const manifestBytes = await readBoundedRegularFile(
    manifestPath,
    MAX_MANIFEST_BYTES,
    'signature_invalid',
  );
  const signatureBytes = await readBoundedRegularFile(
    signaturePath,
    MAX_SIGNATURE_BYTES,
    'signature_invalid',
  );
  const verificationRoot = await mkdtemp(
    join(os.tmpdir(), 'vibespace-playwright-manifest-verification-'),
  );
  try {
    const boundManifest = join(verificationRoot, MANIFEST_NAME);
    const boundSignature = join(verificationRoot, SIGNATURE_NAME);
    await writeFile(boundManifest, manifestBytes, { flag: 'wx' });
    await writeFile(boundSignature, signatureBytes, { flag: 'wx' });
    let signature;
    try {
      signature = await verifyTauriUpdaterSignature({
        artifactPath: boundManifest,
        publicKey,
        signaturePath: boundSignature,
      });
    } catch {
      fail('signature_invalid');
    }
    let manifest;
    try {
      manifest = JSON.parse(manifestBytes.toString('utf8'));
    } catch {
      fail('manifest_invalid');
    }
    validateManifest(manifest, targetPlatform);
    return {
      keyId: signature.keyId,
      manifest,
      manifestBytes,
      manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
      signatureBytes,
    };
  } finally {
    await rm(verificationRoot, { recursive: true, force: true });
  }
}

async function listRegularTree(root, unsafeCode) {
  const files = [];
  async function walk(directory, prefix) {
    await requireDirectory(directory, unsafeCode);
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const pathname = join(directory, entry.name);
      if (entry.isSymbolicLink()) fail(unsafeCode);
      if (entry.isDirectory()) {
        await walk(pathname, relativePath);
      } else if (entry.isFile()) {
        files.push(relativePath);
      } else {
        fail(unsafeCode);
      }
    }
  }
  await walk(root, '');
  return files.sort();
}

async function inspectPayload({ copyRoot = null, manifest, payloadRoot, unsafeCode }) {
  await requireDirectory(payloadRoot, unsafeCode);
  const observed = await listRegularTree(payloadRoot, unsafeCode);
  const expected = manifest.files.map((file) => file.path).sort();
  if (
    observed.length !== expected.length ||
    observed.some((value, index) => value !== expected[index])
  ) {
    fail(unsafeCode);
  }
  for (const file of manifest.files) {
    const source = resolve(payloadRoot, ...file.path.split('/'));
    assertContained(payloadRoot, source, unsafeCode);
    await assertNoLinkComponents(source, unsafeCode);
    let destination = null;
    if (copyRoot) {
      destination = resolve(copyRoot, ...file.path.split('/'));
      assertContained(copyRoot, destination, unsafeCode);
      await assertNoLinkComponents(dirname(destination), unsafeCode);
    }
    await hashOrCopyRegularFile({
      destination,
      expectedBytes: file.bytes,
      expectedSha256: file.sha256,
      source,
      unsafeCode,
    });
  }
  return manifest.totalBytes;
}

async function prepareArtifact(options) {
  const artifactRoot = normalizeRoot(options.artifactRoot, 'artifact_root_invalid');
  await requireDirectory(artifactRoot, 'artifact_unsafe_link');
  const signed = await readSignedManifestPair({
    manifestPath: join(artifactRoot, MANIFEST_NAME),
    publicKey: options.publicKey,
    signaturePath: join(artifactRoot, SIGNATURE_NAME),
    targetPlatform: options.targetPlatform ?? `${process.platform}-${process.arch}`,
  });
  const payloadRoot = join(artifactRoot, 'payload');
  await inspectPayload({
    manifest: signed.manifest,
    payloadRoot,
    unsafeCode: 'artifact_unsafe_link',
  });
  return { ...signed, artifactRoot, payloadRoot };
}

function summary(prepared) {
  return Object.freeze({
    browserRevision: prepared.manifest.browser.revision,
    fileCount: prepared.manifest.files.length,
    keyId: prepared.keyId,
    manifestSha256: prepared.manifestSha256,
    playwrightVersion: prepared.manifest.playwrightVersion,
    targetPlatform: prepared.manifest.targetPlatform,
    totalBytes: prepared.manifest.totalBytes,
    verified: true,
  });
}

export async function verifyAcceptanceRuntimeArtifact(options) {
  return summary(await prepareArtifact(options));
}

function validateInstallationRecord(record) {
  if (
    !exactKeys(record, ['installationId', 'keyId', 'manifestSha256']) ||
    !SAFE_INSTALLATION_ID.test(record.installationId ?? '') ||
    !/^[A-F0-9]{16}$/u.test(record.keyId ?? '') ||
    !SHA256.test(record.manifestSha256 ?? '')
  ) {
    fail('state_invalid');
  }
  return record;
}

function emptyState() {
  return { schemaVersion: 1, active: null, rollback: null };
}

async function readState(installRoot) {
  const statePath = join(installRoot, STATE_NAME);
  const stat = await pathStat(statePath);
  if (!stat) return emptyState();
  let state;
  try {
    state = JSON.parse(
      (await readBoundedRegularFile(statePath, 64 * 1024, 'state_invalid')).toString('utf8'),
    );
  } catch (error) {
    if (error instanceof AcceptanceRuntimeError) throw error;
    fail('state_invalid');
  }
  if (!exactKeys(state, ['schemaVersion', 'active', 'rollback']) || state.schemaVersion !== 1) {
    fail('state_invalid');
  }
  if (state.active !== null) validateInstallationRecord(state.active);
  if (state.rollback !== null) validateInstallationRecord(state.rollback);
  if (
    state.active &&
    state.rollback &&
    state.active.installationId === state.rollback.installationId
  ) {
    fail('state_invalid');
  }
  return state;
}

async function writeState(installRoot, state, hooks = {}) {
  const temporary = join(installRoot, `.acceptance-runtime-state-${randomUUID()}.tmp`);
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await hooks.beforeStateCommit?.();
    await rename(temporary, join(installRoot, STATE_NAME));
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

function makeInstallationRecord(prepared) {
  const safeVersion = prepared.manifest.artifactVersion.replaceAll(/[^A-Za-z0-9.-]/gu, '-');
  const nonce = randomUUID().replaceAll('-', '').slice(0, 12);
  return {
    installationId: `${safeVersion}-${prepared.manifest.targetPlatform}-${prepared.manifestSha256.slice(0, 12)}-${nonce}`,
    keyId: prepared.keyId,
    manifestSha256: prepared.manifestSha256,
  };
}

async function materializeInstallation(installRoot, prepared) {
  const versionsRoot = join(installRoot, VERSIONS_NAME);
  await ensureDirectory(versionsRoot, 'install_root_unsafe');
  const stagingRoot = await mkdtemp(join(versionsRoot, '.staging-'));
  const record = makeInstallationRecord(prepared);
  const target = join(versionsRoot, record.installationId);
  try {
    await inspectPayload({
      copyRoot: stagingRoot,
      manifest: prepared.manifest,
      payloadRoot: prepared.payloadRoot,
      unsafeCode: 'artifact_changed_during_copy',
    });
    await writeFile(join(stagingRoot, INSTALLED_MANIFEST_NAME), prepared.manifestBytes, {
      flag: 'wx',
      mode: 0o600,
    });
    await writeFile(join(stagingRoot, INSTALLED_SIGNATURE_NAME), prepared.signatureBytes, {
      flag: 'wx',
      mode: 0o600,
    });
    await writeFile(
      join(stagingRoot, RECEIPT_NAME),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          installationId: record.installationId,
          manifestSha256: record.manifestSha256,
          keyId: record.keyId,
        },
        null,
        2,
      )}\n`,
      { flag: 'wx', mode: 0o600 },
    );
    await rename(stagingRoot, target);
    return record;
  } catch (error) {
    await rm(stagingRoot, { force: true, recursive: true }).catch(() => {});
    if (error instanceof AcceptanceRuntimeError) throw error;
    fail('installation_staging_failed');
  }
}

async function readInstalledIdentity({ installRoot, publicKey, record, targetPlatform }) {
  validateInstallationRecord(record);
  const versionsRoot = join(installRoot, VERSIONS_NAME);
  const versionRoot = resolve(versionsRoot, record.installationId);
  assertContained(versionsRoot, versionRoot, 'state_invalid');
  await requireDirectory(versionRoot, 'installed_runtime_corrupt');
  let receipt;
  try {
    receipt = JSON.parse(
      (
        await readBoundedRegularFile(
          join(versionRoot, RECEIPT_NAME),
          64 * 1024,
          'installed_runtime_corrupt',
        )
      ).toString('utf8'),
    );
  } catch (error) {
    if (error instanceof AcceptanceRuntimeError) throw error;
    fail('installed_runtime_corrupt');
  }
  if (
    !exactKeys(receipt, ['schemaVersion', 'installationId', 'manifestSha256', 'keyId']) ||
    receipt.schemaVersion !== 1 ||
    receipt.installationId !== record.installationId ||
    receipt.manifestSha256 !== record.manifestSha256 ||
    receipt.keyId !== record.keyId
  ) {
    fail('installed_runtime_corrupt');
  }
  let signed;
  try {
    signed = await readSignedManifestPair({
      manifestPath: join(versionRoot, INSTALLED_MANIFEST_NAME),
      publicKey,
      signaturePath: join(versionRoot, INSTALLED_SIGNATURE_NAME),
      targetPlatform,
    });
  } catch (error) {
    if (error?.code === 'unsupported_platform') throw error;
    fail('installed_runtime_corrupt');
  }
  if (signed.manifestSha256 !== record.manifestSha256 || signed.keyId !== record.keyId) {
    fail('installed_runtime_corrupt');
  }
  const observed = await listRegularTree(versionRoot, 'installed_runtime_corrupt');
  return { observed, signed, versionRoot };
}

async function inspectInstalledRecord({ installRoot, publicKey, record, targetPlatform }) {
  const { observed, signed, versionRoot } = await readInstalledIdentity({
    installRoot,
    publicKey,
    record,
    targetPlatform,
  });
  const expected = [
    ...signed.manifest.files.map((file) => file.path),
    INSTALLED_MANIFEST_NAME,
    INSTALLED_SIGNATURE_NAME,
    RECEIPT_NAME,
  ].sort();
  if (
    observed.length !== expected.length ||
    observed.some((value, index) => value !== expected[index])
  ) {
    fail('installed_runtime_corrupt');
  }
  for (const file of signed.manifest.files) {
    await hashOrCopyRegularFile({
      destination: null,
      expectedBytes: file.bytes,
      expectedSha256: file.sha256,
      source: join(versionRoot, ...file.path.split('/')),
      unsafeCode: 'installed_runtime_corrupt',
    });
  }
  return {
    browserRevision: signed.manifest.browser.revision,
    installationId: record.installationId,
    manifestSha256: record.manifestSha256,
    measuredBytes: signed.manifest.totalBytes,
    playwrightVersion: signed.manifest.playwrightVersion,
    targetPlatform: signed.manifest.targetPlatform,
  };
}

function normalizeInstallOptions(options) {
  return {
    ...options,
    installRoot: normalizeRoot(options.installRoot, 'install_root_invalid'),
    targetPlatform: options.targetPlatform ?? `${process.platform}-${process.arch}`,
  };
}

async function prepareInstallRoot(installRoot) {
  await ensureDirectory(installRoot, 'install_root_unsafe');
  await ensureDirectory(join(installRoot, VERSIONS_NAME), 'install_root_unsafe');
}

export async function diagnoseAcceptanceRuntime(options) {
  const normalized = normalizeInstallOptions(options);
  const rootStat = await pathStat(normalized.installRoot);
  if (!rootStat) return Object.freeze({ status: 'absent' });
  try {
    await requireDirectory(normalized.installRoot, 'install_root_unsafe');
    const state = await readState(normalized.installRoot);
    if (!state.active) return Object.freeze({ status: 'absent' });
    const diagnosis = await inspectInstalledRecord({
      installRoot: normalized.installRoot,
      publicKey: normalized.publicKey,
      record: state.active,
      targetPlatform: normalized.targetPlatform,
    });
    return Object.freeze({ status: 'healthy', ...diagnosis });
  } catch (error) {
    if (error?.code === 'unsupported_platform') {
      return Object.freeze({ status: 'unsupported', reason: error.code });
    }
    const reason = error instanceof AcceptanceRuntimeError ? error.code : 'diagnosis_failed';
    return Object.freeze({ status: 'corrupt', reason });
  }
}

async function removeOwnedVersion(installRoot, record) {
  if (!record) return false;
  validateInstallationRecord(record);
  const versionsRoot = join(installRoot, VERSIONS_NAME);
  const target = resolve(versionsRoot, record.installationId);
  assertContained(versionsRoot, target, 'state_invalid');
  const stat = await pathStat(target);
  if (!stat) return false;
  await requireDirectory(target, 'installed_runtime_corrupt');
  await listRegularTree(target, 'installed_runtime_corrupt');
  await rm(target, { force: false, recursive: true });
  return true;
}

export async function installAcceptanceRuntime(options) {
  const normalized = normalizeInstallOptions(options);
  const prepared = await prepareArtifact(normalized);
  await prepareInstallRoot(normalized.installRoot);
  const state = await readState(normalized.installRoot);
  if (state.active) {
    try {
      await inspectInstalledRecord({
        installRoot: normalized.installRoot,
        publicKey: normalized.publicKey,
        record: state.active,
        targetPlatform: normalized.targetPlatform,
      });
    } catch {
      fail('existing_runtime_requires_repair');
    }
    if (state.active.manifestSha256 === prepared.manifestSha256) {
      return Object.freeze({
        action: 'already-installed',
        installationId: state.active.installationId,
      });
    }
  }
  const record = await materializeInstallation(normalized.installRoot, prepared);
  const nextState = { schemaVersion: 1, active: record, rollback: state.active };
  try {
    await writeState(normalized.installRoot, nextState, normalized.hooks);
  } catch {
    await removeOwnedVersion(normalized.installRoot, record).catch(() => {});
    fail('activation_failed');
  }
  if (state.rollback)
    await removeOwnedVersion(normalized.installRoot, state.rollback).catch(() => {});
  return Object.freeze({
    action: state.active ? 'updated' : 'installed',
    installationId: record.installationId,
    manifestSha256: record.manifestSha256,
    measuredBytes: prepared.manifest.totalBytes,
  });
}

export async function repairAcceptanceRuntime(options) {
  const normalized = normalizeInstallOptions(options);
  const prepared = await prepareArtifact(normalized);
  await prepareInstallRoot(normalized.installRoot);
  const state = await readState(normalized.installRoot);
  if (!state.active) fail('repair_requires_installed_runtime');
  if (state.active.manifestSha256 !== prepared.manifestSha256) {
    fail('repair_unsupported_manifest_change');
  }
  const diagnosis = await diagnoseAcceptanceRuntime(normalized);
  if (diagnosis.status === 'healthy') {
    return Object.freeze({
      action: 'already-healthy',
      installationId: state.active.installationId,
    });
  }
  if (diagnosis.status === 'unsupported') fail('repair_unsupported_platform');
  const record = await materializeInstallation(normalized.installRoot, prepared);
  const nextState = { schemaVersion: 1, active: record, rollback: state.rollback };
  try {
    await writeState(normalized.installRoot, nextState, normalized.hooks);
  } catch {
    await removeOwnedVersion(normalized.installRoot, record).catch(() => {});
    fail('activation_failed');
  }
  const cleanupPending = !(await removeOwnedVersion(normalized.installRoot, state.active).catch(
    () => false,
  ));
  return Object.freeze({
    action: 'repaired',
    cleanupPending,
    installationId: record.installationId,
    manifestSha256: record.manifestSha256,
  });
}

export async function rollbackAcceptanceRuntime(options) {
  const normalized = normalizeInstallOptions(options);
  const state = await readState(normalized.installRoot);
  if (!state.active || !state.rollback) fail('rollback_unavailable');
  try {
    await inspectInstalledRecord({
      installRoot: normalized.installRoot,
      publicKey: normalized.publicKey,
      record: state.rollback,
      targetPlatform: normalized.targetPlatform,
    });
  } catch {
    fail('rollback_target_invalid');
  }
  await writeState(
    normalized.installRoot,
    { schemaVersion: 1, active: state.rollback, rollback: state.active },
    normalized.hooks,
  ).catch(() => fail('activation_failed'));
  return Object.freeze({
    action: 'rolled-back',
    installationId: state.rollback.installationId,
  });
}

export async function uninstallAcceptanceRuntime(options) {
  const normalized = normalizeInstallOptions(options);
  const rootStat = await pathStat(normalized.installRoot);
  if (!rootStat) return Object.freeze({ action: 'already-absent', removedInstallations: 0 });
  await requireDirectory(normalized.installRoot, 'install_root_unsafe');
  const state = await readState(normalized.installRoot);
  const records = [state.active, state.rollback].filter(Boolean);
  for (const record of records) {
    try {
      await readInstalledIdentity({
        installRoot: normalized.installRoot,
        publicKey: normalized.publicKey,
        record,
        targetPlatform: normalized.targetPlatform,
      });
    } catch {
      fail('uninstall_target_invalid');
    }
  }
  await writeState(normalized.installRoot, emptyState(), normalized.hooks).catch(() =>
    fail('activation_failed'),
  );
  let removedInstallations = 0;
  for (const record of records) {
    if (await removeOwnedVersion(normalized.installRoot, record)) removedInstallations += 1;
  }
  return Object.freeze({ action: 'uninstalled', removedInstallations });
}

function parseCliArguments(argv) {
  const [command, ...pairs] = argv;
  if (!['diagnose', 'install', 'repair', 'rollback', 'uninstall'].includes(command)) {
    fail('cli_usage');
  }
  const values = {};
  for (let index = 0; index < pairs.length; index += 2) {
    const key = pairs[index];
    const value = pairs[index + 1];
    if (!key?.startsWith('--') || !value || values[key]) fail('cli_usage');
    values[key] = value;
  }
  const allowed = new Set(['--root', '--artifact', '--public-key', '--platform']);
  if (Object.keys(values).some((key) => !allowed.has(key)) || !values['--root']) {
    fail('cli_usage');
  }
  if (!values['--public-key']) fail('cli_usage');
  if (['install', 'repair'].includes(command) && !values['--artifact']) fail('cli_usage');
  if (!['install', 'repair'].includes(command) && values['--artifact']) fail('cli_usage');
  return {
    command,
    options: {
      artifactRoot: values['--artifact'],
      installRoot: values['--root'],
      publicKey: values['--public-key'],
      targetPlatform: values['--platform'] ?? `${process.platform}-${process.arch}`,
    },
  };
}

async function runCli() {
  try {
    const parsed = parseCliArguments(process.argv.slice(2));
    const handlers = {
      diagnose: diagnoseAcceptanceRuntime,
      install: installAcceptanceRuntime,
      repair: repairAcceptanceRuntime,
      rollback: rollbackAcceptanceRuntime,
      uninstall: uninstallAcceptanceRuntime,
    };
    const result = await handlers[parsed.command](parsed.options);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = error instanceof AcceptanceRuntimeError ? error.code : 'unexpected_failure';
    process.stderr.write(`Playwright acceptance runtime: ${code}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await runCli();
}
