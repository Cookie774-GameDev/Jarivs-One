import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import sharp from 'sharp';

function requireText(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function containedPath(root, ...segments) {
  const resolvedRoot = resolve(root);
  const candidate = resolve(resolvedRoot, ...segments);
  const offset = relative(resolvedRoot, candidate);
  if (
    offset === '..' ||
    offset.startsWith(`..\\`) ||
    offset.startsWith('../') ||
    isAbsolute(offset)
  ) {
    throw new Error(`Visual evidence path escapes artifact root: ${candidate}`);
  }
  return candidate;
}

function portablePath(path) {
  return path.replaceAll('\\', '/');
}

function recordedInputPath(path) {
  return portablePath(relative(process.cwd(), path));
}

function outputDirectoryExistsError(path) {
  return new Error(`Output directory must not already exist: ${path}`);
}

function createFreshOutputDirectory(path) {
  mkdirSync(dirname(path), { recursive: true });
  try {
    mkdirSync(path);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw outputDirectoryExistsError(path);
    }
    throw error;
  }
}

async function readCanonicalPng(path) {
  const encoded = await sharp(path).png().toBuffer();
  return PNG.sync.read(encoded);
}

function writePng(path, png) {
  writeFileSync(path, PNG.sync.write(png));
}

function comparePng(target, current) {
  if (target.width !== current.width || target.height !== current.height) {
    throw new Error(
      `Dimension mismatch: target ${target.width}x${target.height}, current ${current.width}x${current.height}.`,
    );
  }
  const diff = new PNG({ width: target.width, height: target.height });
  const mismatchedPixels = pixelmatch(
    target.data,
    current.data,
    diff.data,
    target.width,
    target.height,
    {
      threshold: 0.12,
      includeAA: false,
      alpha: 0.6,
      diffColor: [255, 0, 80],
      aaColor: [255, 210, 0],
    },
  );
  const totalPixels = target.width * target.height;
  return {
    diff,
    result: {
      mismatchedPixels,
      totalPixels,
      diffRatio: mismatchedPixels / totalPixels,
    },
  };
}

function extractRegion(source, region) {
  const output = new PNG({ width: region.width, height: region.height });
  const rowBytes = region.width * 4;
  for (let row = 0; row < region.height; row += 1) {
    const sourceStart = ((region.y + row) * source.width + region.x) * 4;
    const outputStart = row * rowBytes;
    source.data.copy(output.data, outputStart, sourceStart, sourceStart + rowBytes);
  }
  return output;
}

function createOverlay(target, current) {
  const overlay = new PNG({ width: target.width, height: target.height });
  for (let offset = 0; offset < overlay.data.length; offset += 4) {
    overlay.data[offset] = Math.round((target.data[offset] + current.data[offset]) / 2);
    overlay.data[offset + 1] = Math.round((target.data[offset + 1] + current.data[offset + 1]) / 2);
    overlay.data[offset + 2] = Math.round((target.data[offset + 2] + current.data[offset + 2]) / 2);
    overlay.data[offset + 3] = 255;
  }
  return overlay;
}

export async function compareImages({
  targetPath,
  currentPath,
  contract,
  outputDirectory,
  passId,
  revision,
  route,
  now = () => new Date(),
}) {
  const resolvedOutput = resolve(requireText(outputDirectory, 'outputDirectory'));
  const resolvedTarget = resolve(requireText(targetPath ?? contract?.targetPath, 'targetPath'));
  const resolvedCurrent = resolve(requireText(currentPath, 'currentPath'));
  const stablePassId = requireText(passId, 'passId');
  const stableRevision = requireText(revision, 'revision');
  const stableRoute = requireText(route, 'route');
  if (!contract?.viewport || !Array.isArray(contract.regions)) {
    throw new Error('A loaded Origami reference contract is required.');
  }
  if (existsSync(resolvedOutput)) {
    throw outputDirectoryExistsError(resolvedOutput);
  }

  const [target, current] = await Promise.all([
    readCanonicalPng(resolvedTarget),
    readCanonicalPng(resolvedCurrent),
  ]);
  const expected = contract.viewport;
  if (
    target.width !== expected.width ||
    target.height !== expected.height ||
    current.width !== expected.width ||
    current.height !== expected.height
  ) {
    throw new Error(
      `Dimension mismatch: expected ${expected.width}x${expected.height}; target ${target.width}x${target.height}; current ${current.width}x${current.height}.`,
    );
  }
  createFreshOutputDirectory(resolvedOutput);

  const fullComparison = comparePng(target, current);
  const diffPath = containedPath(resolvedOutput, 'diff-full.png');
  const overlayPath = containedPath(resolvedOutput, 'overlay-50.png');
  const reportPath = containedPath(resolvedOutput, 'report.json');
  writePng(diffPath, fullComparison.diff);
  writePng(overlayPath, createOverlay(target, current));

  const regionResults = {};
  let weightedSum = 0;
  let totalWeight = 0;
  for (const region of contract.regions) {
    const targetRegion = extractRegion(target, region);
    const currentRegion = extractRegion(current, region);
    const comparison = comparePng(targetRegion, currentRegion);
    const targetRegionPath = containedPath(resolvedOutput, 'regions', `${region.name}-target.png`);
    const currentRegionPath = containedPath(
      resolvedOutput,
      'regions',
      `${region.name}-current.png`,
    );
    const diffRegionPath = containedPath(resolvedOutput, 'regions', `${region.name}-diff.png`);
    mkdirSync(containedPath(resolvedOutput, 'regions'), { recursive: true });
    writePng(targetRegionPath, targetRegion);
    writePng(currentRegionPath, currentRegion);
    writePng(diffRegionPath, comparison.diff);
    regionResults[region.name] = {
      ...comparison.result,
      weight: region.weight,
      coordinates: {
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
      },
      outputs: {
        target: `regions/${region.name}-target.png`,
        current: `regions/${region.name}-current.png`,
        diff: `regions/${region.name}-diff.png`,
      },
    };
    weightedSum += comparison.result.diffRatio * region.weight;
    totalWeight += region.weight;
  }

  const fullThreshold = contract.acceptance.full_page_diff_ratio;
  const majorRegionThreshold = contract.acceptance.major_region_diff_ratio;
  const report = {
    schemaVersion: 1,
    generatedAt: now().toISOString(),
    passId: stablePassId,
    revision: stableRevision,
    route: stableRoute,
    targetPath: recordedInputPath(resolvedTarget),
    currentPath: recordedInputPath(resolvedCurrent),
    viewport: {
      width: expected.width,
      height: expected.height,
      deviceScaleFactor: expected.deviceScaleFactor,
      browserZoomPercent: expected.browserZoomPercent,
    },
    full: fullComparison.result,
    weightedRegionDiffRatio: totalWeight === 0 ? null : weightedSum / totalWeight,
    thresholds: {
      ...contract.acceptance,
    },
    passes: {
      fullPage:
        typeof fullThreshold === 'number' ? fullComparison.result.diffRatio <= fullThreshold : null,
      majorRegions:
        typeof majorRegionThreshold === 'number'
          ? Object.values(regionResults).every((region) => region.diffRatio <= majorRegionThreshold)
          : null,
    },
    regions: regionResults,
    outputs: {
      diff: 'diff-full.png',
      overlay: 'overlay-50.png',
      report: 'report.json',
    },
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
