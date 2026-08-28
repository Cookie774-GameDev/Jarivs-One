#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

function ratio(value, name, fallback) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${name} must be a number between 0 and 1`);
  }
  return parsed;
}

function hash(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function writeArtifact(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
}

export async function comparePngFiles({
  referencePath,
  actualPath,
  diffPath,
  reportPath,
  pixelThreshold,
  maxMismatchRatio,
}) {
  if (!referencePath || !actualPath) {
    throw new Error('referencePath and actualPath are required');
  }

  const effectivePixelThreshold = ratio(pixelThreshold, 'pixelThreshold', 0.1);
  const effectiveMaxMismatchRatio = ratio(maxMismatchRatio, 'maxMismatchRatio', 0);
  const [referenceBuffer, actualBuffer] = await Promise.all([
    readFile(referencePath),
    readFile(actualPath),
  ]);
  const reference = PNG.sync.read(referenceBuffer);
  const actual = PNG.sync.read(actualBuffer);

  if (reference.width !== actual.width || reference.height !== actual.height) {
    throw new Error(
      `dimensions differ: reference=${reference.width}x${reference.height} actual=${actual.width}x${actual.height}`,
    );
  }

  const diff = new PNG({ width: reference.width, height: reference.height });
  const mismatchedPixels = pixelmatch(
    reference.data,
    actual.data,
    diff.data,
    reference.width,
    reference.height,
    {
      threshold: effectivePixelThreshold,
      includeAA: false,
      diffColor: [255, 0, 255],
      aaColor: [255, 255, 0],
    },
  );
  const totalPixels = reference.width * reference.height;
  const mismatchRatio = totalPixels === 0 ? 0 : mismatchedPixels / totalPixels;
  const report = {
    status: mismatchRatio <= effectiveMaxMismatchRatio ? 'passed' : 'failed',
    referencePath: path.resolve(referencePath),
    actualPath: path.resolve(actualPath),
    diffPath: diffPath ? path.resolve(diffPath) : null,
    width: reference.width,
    height: reference.height,
    totalPixels,
    mismatchedPixels,
    mismatchRatio,
    pixelThreshold: effectivePixelThreshold,
    maxMismatchRatio: effectiveMaxMismatchRatio,
    referenceSha256: hash(referenceBuffer),
    actualSha256: hash(actualBuffer),
  };

  if (diffPath) {
    await writeArtifact(diffPath, PNG.sync.write(diff));
  }
  if (reportPath) {
    await writeArtifact(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name.startsWith('--') || value === undefined || value.startsWith('--')) {
      throw new Error(`expected --name value, received ${name}`);
    }
    options[name.slice(2)] = value;
    index += 1;
  }
  return {
    referencePath: options.reference,
    actualPath: options.actual,
    diffPath: options.diff,
    reportPath: options.report,
    pixelThreshold: options['pixel-threshold'],
    maxMismatchRatio: options['max-mismatch-ratio'],
  };
}

async function main() {
  try {
    const report = await comparePngFiles(parseArguments(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = report.status === 'passed' ? 0 : 1;
  } catch (error) {
    process.stderr.write(`PR31 image comparison failed closed: ${error.message}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
