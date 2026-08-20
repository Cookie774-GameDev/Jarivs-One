#!/usr/bin/env node
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HARD_RELEASE_ARTIFACT_LIMIT_BYTES = 300_000_000;
export const PREFERRED_RELEASE_ARTIFACT_LIMIT_BYTES = 285_000_000;

const RELEASE_ARTIFACT_PATTERN =
  /(?:\.app\.tar\.gz|\.tar\.gz|\.appimage|\.deb|\.dmg|\.exe|\.msi|\.msix|\.pkg|\.rpm|\.zip)$/iu;

export async function verifyReleaseArtifactSizes({
  assetsDir,
  hardLimitBytes = HARD_RELEASE_ARTIFACT_LIMIT_BYTES,
  preferredLimitBytes = PREFERRED_RELEASE_ARTIFACT_LIMIT_BYTES,
} = {}) {
  const directory = path.resolve(required(assetsDir, '--assets-dir'));
  validateLimit(hardLimitBytes, 'hard limit');
  validateLimit(preferredLimitBytes, 'preferred limit');
  if (preferredLimitBytes > hardLimitBytes) {
    throw new Error('Preferred release artifact limit cannot exceed the hard limit');
  }

  const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name, 'en'),
  );
  const candidates = entries.filter((entry) => RELEASE_ARTIFACT_PATTERN.test(entry.name));
  if (candidates.length === 0) {
    throw new Error(`No release installer or updater artifacts found in ${directory}`);
  }

  const artifacts = [];
  for (const entry of candidates) {
    const artifactPath = path.join(directory, entry.name);
    const info = await lstat(artifactPath, { bigint: true });
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error(`Release artifact must be a regular non-symlink file: ${entry.name}`);
    }
    const sizeBytes = Number(info.size);
    if (!Number.isSafeInteger(sizeBytes)) {
      throw new Error(`Release artifact size is not a safe integer: ${entry.name}`);
    }
    if (sizeBytes > hardLimitBytes) {
      throw new Error(
        `Release artifact exceeds ${hardLimitBytes} bytes: ${entry.name} is ${sizeBytes} bytes`,
      );
    }
    artifacts.push({
      name: entry.name,
      sizeBytes,
      preferredLimitExceeded: sizeBytes > preferredLimitBytes,
    });
  }

  return {
    assetsDir: directory,
    hardLimitBytes,
    preferredLimitBytes,
    artifacts,
  };
}

async function runCli(argv) {
  const assetsDir = parseAssetsDir(argv);
  const result = await verifyReleaseArtifactSizes({ assetsDir });
  for (const artifact of result.artifacts) {
    const preferred = artifact.preferredLimitExceeded
      ? ` WARNING preferred ceiling ${result.preferredLimitBytes} exceeded`
      : '';
    console.log(`${artifact.name}: ${artifact.sizeBytes} bytes${preferred}`);
  }
  console.log(
    `Release artifact size gate passed: ${result.artifacts.length} artifact(s), hard ceiling ${result.hardLimitBytes} bytes`,
  );
}

function parseAssetsDir(argv) {
  if (argv.length !== 2 || argv[0] !== '--assets-dir') {
    throw new Error(
      'Usage: node scripts/verify-release-artifact-size.mjs --assets-dir <directory>',
    );
  }
  return argv[1];
}

function validateLimit(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Release artifact ${label} must be a positive safe integer`);
  }
}

function required(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required argument ${name}`);
  }
  return value;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  try {
    await runCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
