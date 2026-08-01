import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { format, resolveConfig } from 'prettier';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIRECTORY, '..', '..');
const MONOCHROME_MANIFEST_PATH = path.join(
  REPO_ROOT,
  'tests',
  'visual',
  'monochrome',
  'route-manifest.ts',
);
const OUTPUT_DIRECTORY = path.join(SCRIPT_DIRECTORY, 'manifests');

const OWNER_MAP = Object.freeze({
  MC4: 'SK4',
  MC5: 'SK5',
  MC7A: 'SK7A',
  MC7B: 'SK7B',
  MC7C: 'SK7C',
  MC7D: 'SK7D',
  MC7E: 'SK7E',
  MC7F: 'SK7F',
  MC7G: 'SK7G',
  MC9: 'SK9',
});

const ENTRY_OWNER_OVERRIDES = Object.freeze({
  'route:history': 'SK7C',
});

const OWNER_REQUIREMENTS = Object.freeze({
  SK4: ['SAK-027', 'SAK-031'],
  SK5: ['SAK-026'],
  SK7A: ['SAK-028', 'SAK-029'],
  SK7B: ['SAK-019'],
  SK7C: ['SAK-027', 'SAK-049'],
  SK7D: ['SAK-019'],
  SK7E: ['SAK-019', 'SAK-049'],
  SK7F: ['SAK-033', 'SAK-038'],
  SK7G: ['SAK-030'],
  SK9: ['SAK-030', 'SAK-036'],
});

const BASE_REQUIREMENTS = Object.freeze(['SAK-010', 'SAK-030', 'SAK-033', 'SAK-040', 'SAK-048']);

const ROUTE_KINDS = new Set(['route', 'settings', 'access', 'embedded', 'development', 'future']);
const WINDOW_OVERLAY_KINDS = new Set(['overlay', 'detached', 'native']);

function getPredecessorCommit() {
  const index = process.argv.indexOf('--predecessor');
  const value = index >= 0 ? process.argv[index + 1] : process.env.SAKURA_PREDECESSOR_COMMIT;
  if (!value || !/^[0-9a-f]{7,40}$/i.test(value)) {
    throw new Error(
      'A hexadecimal Sakura predecessor commit is required via --predecessor <sha> or SAKURA_PREDECESSOR_COMMIT.',
    );
  }
  return value.toLowerCase();
}

function mapEntry(entry) {
  const owner = ENTRY_OWNER_OVERRIDES[entry.id] ?? OWNER_MAP[entry.owner];
  if (!owner) {
    throw new Error(`No Sakura owner mapping exists for ${entry.owner} (${entry.id}).`);
  }

  return {
    id: entry.id,
    kind: entry.kind,
    routeId: entry.routeId,
    auditStatus: entry.auditStatus,
    availability: entry.availability,
    owner,
    requirements: [...new Set([...BASE_REQUIREMENTS, ...(OWNER_REQUIREMENTS[owner] ?? [])])],
    sourcePaths: [...entry.sourcePaths],
    writerPaths: [...entry.writerPaths],
    testPaths: [...entry.testPaths],
    behaviorCommands: [...entry.behaviorCommands],
    viewports: [...entry.viewports],
    zoom: [...entry.zoom],
    motion: [...entry.motion],
    baselineCaptureIds: [...entry.preservedBaselineIds],
    logicalLock: entry.logicalLock.replace(/^monochrome:/, 'sakura:'),
    fileLockPaths: [...entry.fileLockPaths],
    sharedReadOnlyPaths: [...entry.sharedReadOnlyPaths],
    exclusions: [
      'business behavior',
      'user or remote content',
      'non-Sakura themes',
      'backend, schema, auth, and billing changes',
    ],
    unavailableReason: entry.unavailableReason,
  };
}

function createManifest({ predecessorCommit, sourceManifest, kinds, manifestKind }) {
  const entries = sourceManifest.entries
    .filter((entry) => kinds.has(entry.kind))
    .map(mapEntry)
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    schemaVersion: 1,
    manifestKind,
    predecessorCommit,
    sourceAuthority: 'tests/visual/monochrome/route-manifest.ts',
    sourceCommit: sourceManifest.sourceCommit,
    finalRouteIds: [...sourceManifest.finalRouteIds],
    settingsTabIds: [...sourceManifest.settingsTabIds],
    entries,
  };
}

async function main() {
  const predecessorCommit = getPredecessorCommit();
  const imported = await import(pathToFileURL(MONOCHROME_MANIFEST_PATH).href);
  const sourceManifest = imported.MONOCHROME_ROUTE_COVERAGE_MANIFEST;
  if (!sourceManifest || !Array.isArray(sourceManifest.entries)) {
    throw new Error('MonoChrome route authority did not export a valid coverage manifest.');
  }

  const routes = createManifest({
    predecessorCommit,
    sourceManifest,
    kinds: ROUTE_KINDS,
    manifestKind: 'routes',
  });
  const windowsOverlays = createManifest({
    predecessorCommit,
    sourceManifest,
    kinds: WINDOW_OVERLAY_KINDS,
    manifestKind: 'windows-overlays',
  });

  const covered = new Set([
    ...routes.entries.map((entry) => entry.id),
    ...windowsOverlays.entries.map((entry) => entry.id),
  ]);
  if (covered.size !== sourceManifest.entries.length) {
    throw new Error(
      `Sakura manifest partition covers ${covered.size} of ${sourceManifest.entries.length} source entries.`,
    );
  }

  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  const routesPath = path.join(OUTPUT_DIRECTORY, 'routes.json');
  const windowsOverlaysPath = path.join(OUTPUT_DIRECTORY, 'windows-overlays.json');
  const prettierConfig = (await resolveConfig(REPO_ROOT)) ?? {};
  const routesJson = await format(JSON.stringify(routes), {
    ...prettierConfig,
    filepath: routesPath,
  });
  const windowsOverlaysJson = await format(JSON.stringify(windowsOverlays), {
    ...prettierConfig,
    filepath: windowsOverlaysPath,
  });
  await Promise.all([
    writeFile(routesPath, routesJson),
    writeFile(windowsOverlaysPath, windowsOverlaysJson),
  ]);
}

await main();
