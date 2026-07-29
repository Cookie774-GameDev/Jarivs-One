import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ORIGAMI_REFERENCE_ROOT = resolve(
  MODULE_DIRECTORY,
  '../../tests/visual/chat/reference',
);

function readJson(path, label) {
  let value;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid ${label} JSON at ${path}: ${error.message}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value;
}

function requirePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function requireFiniteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }
  return value;
}

function pathEscapesRoot(root, candidate) {
  const offset = relative(root, candidate);
  return (
    offset === '..' || offset.startsWith(`..\\`) || offset.startsWith('../') || isAbsolute(offset)
  );
}

function resolveTargetPath(referenceRoot, targetFile) {
  if (typeof targetFile !== 'string' || targetFile.trim().length === 0) {
    throw new Error('reference-spec target_file must be a non-empty string.');
  }
  const normalized = targetFile.trim();
  if (
    normalized !== targetFile ||
    normalized.includes('\\') ||
    isAbsolute(normalized) ||
    /^[a-z]:/iu.test(normalized)
  ) {
    throw new Error(`Unsafe reference target path: ${targetFile}`);
  }
  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`Unsafe reference target path: ${targetFile}`);
  }
  const canonicalSegments = segments[0] === 'references' ? segments.slice(1) : segments;
  if (canonicalSegments.length === 0) {
    throw new Error(`Unsafe reference target path: ${targetFile}`);
  }
  const candidate = resolve(referenceRoot, ...canonicalSegments);
  if (pathEscapesRoot(referenceRoot, candidate)) {
    throw new Error(`Unsafe reference target path: ${targetFile}`);
  }
  if (!existsSync(candidate)) {
    throw new Error(`Reference target does not exist: ${targetFile}`);
  }
  const realRoot = realpathSync(referenceRoot);
  const realTarget = realpathSync(candidate);
  if (pathEscapesRoot(realRoot, realTarget)) {
    throw new Error(`Unsafe reference target path: ${targetFile}`);
  }
  return candidate;
}

function validateRegion(name, value, viewport) {
  if (!/^[a-z0-9_-]+$/.test(name)) {
    throw new Error(`Unsafe region name: ${name}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Region ${name} must be an object.`);
  }
  const region = {
    name,
    x: requireFiniteNumber(value.x, `${name}.x`),
    y: requireFiniteNumber(value.y, `${name}.y`),
    width: requirePositiveInteger(value.width, `${name}.width`),
    height: requirePositiveInteger(value.height, `${name}.height`),
    weight: requireFiniteNumber(value.weight, `${name}.weight`),
  };
  if (
    !Number.isInteger(region.x) ||
    !Number.isInteger(region.y) ||
    region.x < 0 ||
    region.y < 0 ||
    region.x + region.width > viewport.width ||
    region.y + region.height > viewport.height
  ) {
    throw new Error(`Region ${name} is outside the reference viewport.`);
  }
  if (region.weight <= 0) {
    throw new Error(`Region ${name} weight must be positive.`);
  }
  return region;
}

export function loadOrigamiReferenceContract(referenceRoot = DEFAULT_ORIGAMI_REFERENCE_ROOT) {
  const resolvedRoot = resolve(referenceRoot);
  const spec = readJson(resolve(resolvedRoot, 'reference-spec.json'), 'reference specification');
  const designTokens = readJson(
    resolve(resolvedRoot, 'design-tokens.json'),
    'design token contract',
  );
  const assetManifest = readJson(resolve(resolvedRoot, 'asset-manifest.json'), 'asset manifest');
  if (spec.schema_version !== '1.0') {
    throw new Error(`Unsupported reference schema version: ${String(spec.schema_version)}`);
  }
  const viewport = {
    width: requirePositiveInteger(spec.viewport?.width, 'viewport.width'),
    height: requirePositiveInteger(spec.viewport?.height, 'viewport.height'),
    deviceScaleFactor: requireFiniteNumber(
      spec.viewport?.device_scale_factor,
      'viewport.device_scale_factor',
    ),
    browserZoomPercent: requireFiniteNumber(
      spec.viewport?.browser_zoom_percent,
      'viewport.browser_zoom_percent',
    ),
  };
  if (viewport.deviceScaleFactor <= 0 || viewport.browserZoomPercent <= 0) {
    throw new Error('Viewport scale and browser zoom must be positive.');
  }
  if (!spec.regions || typeof spec.regions !== 'object' || Array.isArray(spec.regions)) {
    throw new Error('Reference specification regions must be an object.');
  }
  const fullPage = validateRegion('full_page', spec.regions.full_page, viewport);
  if (
    fullPage.x !== 0 ||
    fullPage.y !== 0 ||
    fullPage.width !== viewport.width ||
    fullPage.height !== viewport.height
  ) {
    throw new Error('full_page must exactly match the reference viewport.');
  }
  const regions = Object.entries(spec.regions)
    .filter(([name]) => name !== 'full_page')
    .map(([name, value]) => validateRegion(name, value, viewport))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (regions.length === 0) {
    throw new Error('At least one diagnostic region is required.');
  }
  const diagnosticWeight = regions.reduce((sum, region) => sum + region.weight, 0);
  if (Math.abs(diagnosticWeight - 1) > 1e-9) {
    throw new Error(`Diagnostic region weights must total 1; received ${diagnosticWeight}.`);
  }
  if (assetManifest.source_policy?.full_target_as_page_background !== false) {
    throw new Error('Asset manifest must prohibit the full target as a page background.');
  }
  if (assetManifest.source_policy?.preserve_live_text_and_controls_as_dom !== true) {
    throw new Error('Asset manifest must preserve live text and controls as DOM.');
  }

  return {
    referenceRoot: resolvedRoot,
    targetPath: resolveTargetPath(resolvedRoot, spec.target_file),
    pageId: spec.page_id,
    viewport,
    fullPage,
    regions,
    acceptance: spec.acceptance?.minimum_required ?? {},
    spec,
    designTokens,
    assetManifest,
  };
}
