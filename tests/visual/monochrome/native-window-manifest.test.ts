import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import * as nativeAuthority from './native-window-manifest.ts';

const SOURCE_COMMIT = '7eb708e184ee4f054a49d3e70d73e80fd4eb97ae';
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const EXPECTED_CAPABILITIES = [
  [
    'default.json',
    'default',
    ['main', 'dictation', 'pet-overlay', 'pet-mini-panel', 'preview-surface'],
    '8247E7FCCE49ADD5774DB00BB44E64BAFEBEB3CB043B6952831809AFA9C03DFA',
  ],
  [
    'pet-mini-panel.json',
    'pet-mini-panel',
    ['pet-mini-panel'],
    'EE7E8C9FD6847D0182BD1A7D573BF6D23C243E7F641D73D7C8EDFB2230B65057',
  ],
  [
    'pet-overlay.json',
    'pet-overlay',
    ['pet-overlay'],
    'E46798752A90E976F01000D48AE6570FC4B2CF9CC5FB6BF5E3C6E3580662D0AC',
  ],
  [
    'workbench.json',
    'workbench-window',
    ['workbench-*'],
    'B5FBAAB55EFC551568004A0A98A9F4DA33AC55887B97CE8F11EE3F4B7BA5A64C',
  ],
] as const;

const EXPECTED_SURFACES = [
  ['dictation', 'declared', 'app/src-tauri/tauri.conf.json', ['default']],
  ['main', 'declared', 'app/src-tauri/tauri.conf.json', ['default']],
  ['pet-mini-panel', 'dynamic-rust', 'app/src-tauri/src/pets.rs', ['default', 'pet-mini-panel']],
  ['pet-overlay', 'dynamic-rust', 'app/src-tauri/src/pets.rs', ['default', 'pet-overlay']],
  ['preview-surface', 'dynamic-rust', 'app/src-tauri/src/preview.rs', ['default']],
  [
    'workbench-main',
    'dynamic-webview',
    'app/src/features/workbench/window.ts',
    ['workbench-window'],
  ],
] as const;

function sourceAtCommit(relativePath: string): string {
  return execFileSync('git', ['show', `${SOURCE_COMMIT}:${relativePath}`], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

function capabilityFilesAtCommit(): string[] {
  return execFileSync(
    'git',
    ['ls-tree', '-r', '--name-only', SOURCE_COMMIT, 'app/src-tauri/capabilities'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  )
    .split(/\r?\n/u)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => entry.replace('app/src-tauri/capabilities/', ''))
    .sort();
}

interface CapabilitySnapshot {
  readonly file: string;
  readonly identifier: string;
  readonly windows: readonly string[];
  readonly sha256: string;
}

interface NativeSurfaceSnapshot {
  readonly label: string;
  readonly creation: 'declared' | 'dynamic-rust' | 'dynamic-webview';
  readonly sourcePath: string;
  readonly capabilityIds: readonly string[];
}

function canonicalHash(raw: string): string {
  return createHash('sha256').update(raw.replace(/\r\n/gu, '\n')).digest('hex').toUpperCase();
}

function capabilitySnapshotsAtCommit(): CapabilitySnapshot[] {
  return capabilityFilesAtCommit().map((file) => {
    const raw = sourceAtCommit(`app/src-tauri/capabilities/${file}`);
    const parsed = JSON.parse(raw) as { identifier: string; windows: string[] };
    return {
      file,
      identifier: parsed.identifier,
      windows: parsed.windows,
      sha256: canonicalHash(raw),
    };
  });
}

function currentCapabilitySnapshots(): CapabilitySnapshot[] {
  const directory = path.join(REPO_ROOT, 'app/src-tauri/capabilities');
  return readdirSync(directory)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => {
      const raw = readFileSync(path.join(directory, file), 'utf8');
      const parsed = JSON.parse(raw) as { identifier: string; windows: string[] };
      return {
        file,
        identifier: parsed.identifier,
        windows: parsed.windows,
        sha256: canonicalHash(raw),
      };
    });
}

function capabilityIdsForLabel(
  label: string,
  capabilities: readonly CapabilitySnapshot[],
): string[] {
  return capabilities
    .filter((entry) =>
      entry.windows.some((pattern) => {
        const expression = new RegExp(
          `^${pattern.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&').replaceAll('\\*', '.*')}$`,
          'u',
        );
        return expression.test(label);
      }),
    )
    .map((entry) => entry.identifier)
    .sort();
}

function discoverNativeSurfaces(
  readSource: (relativePath: string) => string,
  capabilities: readonly CapabilitySnapshot[],
): NativeSurfaceSnapshot[] {
  const declared = JSON.parse(readSource('app/src-tauri/tauri.conf.json')) as {
    app: { windows: Array<{ label: string }> };
  };
  const surfaces: NativeSurfaceSnapshot[] = declared.app.windows.map(({ label }) => ({
    label,
    creation: 'declared',
    sourcePath: 'app/src-tauri/tauri.conf.json',
    capabilityIds: capabilityIdsForLabel(label, capabilities),
  }));
  const dynamicRules = [
    {
      creation: 'dynamic-rust' as const,
      sourcePath: 'app/src-tauri/src/pets.rs',
      predicate: /pub const PET_[A-Z_]+_LABEL: &str = "([^"]+)"/gu,
    },
    {
      creation: 'dynamic-rust' as const,
      sourcePath: 'app/src-tauri/src/preview.rs',
      predicate: /const PREVIEW_LABEL: &str = "([^"]+)"/gu,
    },
    {
      creation: 'dynamic-webview' as const,
      sourcePath: 'app/src/features/workbench/window.ts',
      predicate: /WORKBENCH_WINDOW_LABEL = '([^']+)'/gu,
    },
  ];
  for (const rule of dynamicRules) {
    const source = readSource(rule.sourcePath);
    for (const match of source.matchAll(rule.predicate)) {
      const label = match[1];
      surfaces.push({
        label,
        creation: rule.creation,
        sourcePath: rule.sourcePath,
        capabilityIds: capabilityIdsForLabel(label, capabilities),
      });
    }
  }
  return surfaces.sort((left, right) => left.label.localeCompare(right.label));
}

function currentSource(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

test('the source-derived native-window authority exists before MC9 runs', () => {
  const manifestPath = fileURLToPath(new URL('./native-window-manifest.ts', import.meta.url));
  assert.equal(existsSync(manifestPath), true, 'missing native-window manifest');
});

test('native authority freezes every production capability file and content hash', () => {
  const manifest = nativeAuthority.MONOCHROME_NATIVE_WINDOW_MANIFEST as Record<string, unknown>;
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.sourceCommit, SOURCE_COMMIT);
  assert.equal(manifest.captureMode, 'retroactive-source-freeze');
  assert.equal(manifest.hashMode, 'sha256-canonical-lf-bytes');
  assert.deepEqual(
    (
      manifest.capabilities as Array<{
        file: string;
        identifier: string;
        windows: string[];
        sha256: string;
      }>
    ).map(({ file, identifier, windows, sha256 }) => [file, identifier, windows, sha256]),
    EXPECTED_CAPABILITIES,
  );
  assert.deepEqual(manifest.consumerTasks, ['MC9']);
  assert.equal(
    manifest.validatorCommand,
    'node --test tests/visual/monochrome/native-window-manifest.test.ts',
  );
});

test('capability inventory is closed over JSON files and parsed identifiers at the frozen commit', () => {
  assert.equal(
    Array.isArray(nativeAuthority.MONOCHROME_NATIVE_WINDOW_MANIFEST.capabilities),
    true,
    'missing capability entries',
  );
  if (!Array.isArray(nativeAuthority.MONOCHROME_NATIVE_WINDOW_MANIFEST.capabilities)) return;

  assert.deepEqual(
    nativeAuthority.MONOCHROME_NATIVE_WINDOW_MANIFEST.capabilities.map((entry) => entry.file),
    capabilityFilesAtCommit(),
  );
  for (const entry of nativeAuthority.MONOCHROME_NATIVE_WINDOW_MANIFEST.capabilities) {
    const raw = sourceAtCommit(`app/src-tauri/capabilities/${entry.file}`);
    const parsed = JSON.parse(raw) as { identifier: string; windows: string[] };
    assert.equal(entry.identifier, parsed.identifier);
    assert.deepEqual(entry.windows, parsed.windows);
    assert.equal(canonicalHash(raw), entry.sha256);
  }
});

test('native surface inventory freezes declared and dynamic creation seams', () => {
  assert.equal(
    Array.isArray(nativeAuthority.MONOCHROME_NATIVE_WINDOW_MANIFEST.surfaces),
    true,
    'missing native surface entries',
  );
  if (!Array.isArray(nativeAuthority.MONOCHROME_NATIVE_WINDOW_MANIFEST.surfaces)) return;

  assert.deepEqual(
    nativeAuthority.MONOCHROME_NATIVE_WINDOW_MANIFEST.surfaces.map(
      ({ label, creation, sourcePath, capabilityIds }) => [
        label,
        creation,
        sourcePath,
        capabilityIds,
      ],
    ),
    EXPECTED_SURFACES,
  );
  for (const surface of nativeAuthority.MONOCHROME_NATIVE_WINDOW_MANIFEST.surfaces) {
    const source = sourceAtCommit(surface.sourcePath);
    assert.ok(source.includes(surface.label), `surface label missing: ${surface.label}`);
  }
});

test('native validator rejects duplicate identifiers, drift, unrepresented files, and test windows', () => {
  const validate = nativeAuthority.validateMonochromeNativeWindowManifest;
  assert.equal(typeof validate, 'function', 'missing native-window manifest validator');
  if (typeof validate !== 'function') return;

  const manifest = nativeAuthority.MONOCHROME_NATIVE_WINDOW_MANIFEST;
  assert.equal(Array.isArray(manifest.capabilities), true, 'missing capability entries');
  assert.equal(Array.isArray(manifest.surfaces), true, 'missing surface entries');
  if (!Array.isArray(manifest.capabilities) || !Array.isArray(manifest.surfaces)) return;

  const historicalCapabilities = capabilitySnapshotsAtCommit();
  const currentCapabilities = currentCapabilitySnapshots();
  const historicalSurfaces = discoverNativeSurfaces(sourceAtCommit, historicalCapabilities);
  const currentSurfaces = discoverNativeSurfaces(currentSource, currentCapabilities);
  assert.deepEqual(
    validate(
      manifest,
      historicalCapabilities,
      currentCapabilities,
      historicalSurfaces,
      currentSurfaces,
    ),
    [],
  );
  assert.match(
    validate(
      { ...manifest, capabilities: [...manifest.capabilities, manifest.capabilities[0]] },
      historicalCapabilities,
      currentCapabilities,
      historicalSurfaces,
      currentSurfaces,
    ).join('\n'),
    /duplicate|stable order/iu,
  );
  assert.match(
    validate(
      manifest,
      historicalCapabilities,
      [
        ...currentCapabilities.slice(0, 1),
        { ...currentCapabilities[1], identifier: 'current-drift' },
        ...currentCapabilities.slice(2),
      ],
      historicalSurfaces,
      currentSurfaces,
    ).join('\n'),
    /current.*drift|identifier/iu,
  );
  assert.match(
    validate(
      manifest,
      historicalCapabilities,
      [
        ...currentCapabilities.slice(0, 1),
        { ...currentCapabilities[1], windows: ['current-window-pattern-drift'] },
        ...currentCapabilities.slice(2),
      ],
      historicalSurfaces,
      currentSurfaces,
    ).join('\n'),
    /current.*drift|windows/iu,
  );
  assert.match(
    validate(
      manifest,
      historicalCapabilities,
      [
        ...currentCapabilities.slice(0, 1),
        { ...currentCapabilities[1], sha256: '0'.repeat(64) },
        ...currentCapabilities.slice(2),
      ],
      historicalSurfaces,
      currentSurfaces,
    ).join('\n'),
    /current.*drift|sha256/iu,
  );
  assert.match(
    validate(
      { ...manifest, sourceCommit: '0'.repeat(40) },
      historicalCapabilities,
      currentCapabilities,
      historicalSurfaces,
      currentSurfaces,
    ).join('\n'),
    /source commit|provenance/iu,
  );
  assert.match(
    validate(
      manifest,
      [...historicalCapabilities, { ...historicalCapabilities[0], file: 'unrepresented.json' }],
      currentCapabilities,
      historicalSurfaces,
      currentSurfaces,
    ).join('\n'),
    /historical.*closure|unrepresented/iu,
  );
  assert.match(
    validate(manifest, historicalCapabilities, currentCapabilities, historicalSurfaces, [
      { ...currentSurfaces[0], label: 'current-window-drift' },
      ...currentSurfaces.slice(1),
    ]).join('\n'),
    /current.*surface|creation seam/iu,
  );
  assert.match(
    validate(
      {
        ...manifest,
        surfaces: [
          ...manifest.surfaces,
          {
            label: 'monochrome-test',
            creation: 'dynamic-webview',
            sourcePath: 'tests/visual/monochrome/native-window-manifest.test.ts',
            capabilityIds: [],
          },
        ],
      },
      historicalCapabilities,
      currentCapabilities,
      historicalSurfaces,
      currentSurfaces,
    ).join('\n'),
    /test window/iu,
  );
});
