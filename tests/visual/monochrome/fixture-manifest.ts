import { createHash } from 'node:crypto';

export const MONOCHROME_SOURCE_COMMIT = '7eb708e184ee4f054a49d3e70d73e80fd4eb97ae';
const MONOCHROME_FIXTURE_IDS = Object.freeze(['chat', 'settings-appearance', 'terminal-workbench']);
const MONOCHROME_FIXTURE_HASHES = Object.freeze({
  chat: 'fd8950bf1a41f18797c3e4ea97ad25f1eac86ffda0862cc61e361bdea2a158c9',
  'settings-appearance': '1531421802e9d827e011047c410dd29c6d7c459c03f2bdb9ad91154f8c5ab875',
  'terminal-workbench': 'd27d7b59bed7386b11335a93d8827deb13d251d6de216c3b5bb84bee9ba8bc2b',
});

export interface MonochromeFixtureManifest {
  readonly schemaVersion: 1;
  readonly sourceCommit: string;
  readonly captureMode: 'retroactive-source-freeze';
  readonly ownedPaths: readonly string[];
  readonly fixtureIds: readonly string[];
  readonly fixtureHashes: Readonly<Record<string, string>>;
  readonly consumerTasks: readonly string[];
  readonly validatorCommand: string;
}

export interface MonochromeManifestMetadata {
  readonly schemaVersion: number;
  readonly sourceCommit: string;
  readonly captureMode: string;
  readonly ownedPaths: readonly string[];
  readonly fixtureIds: readonly string[];
  readonly fixtureHashes: Readonly<Record<string, string>>;
  readonly consumerTasks: readonly string[];
  readonly validatorCommand: string;
}

export interface NamedMonochromeManifest {
  readonly name: string;
  readonly manifest: MonochromeManifestMetadata;
}

export const MONOCHROME_FIXTURE_MANIFEST: MonochromeFixtureManifest = Object.freeze({
  schemaVersion: 1,
  sourceCommit: MONOCHROME_SOURCE_COMMIT,
  captureMode: 'retroactive-source-freeze',
  ownedPaths: Object.freeze([
    'tests/visual/monochrome/fixture-manifest.test.ts',
    'tests/visual/monochrome/fixture-manifest.ts',
    'tests/visual/monochrome/fixtures.ts',
  ]),
  fixtureIds: MONOCHROME_FIXTURE_IDS,
  fixtureHashes: MONOCHROME_FIXTURE_HASHES,
  consumerTasks: Object.freeze(['MC4', 'MC5', 'MC6']),
  validatorCommand: 'node --test tests/visual/monochrome/fixture-manifest.test.ts',
});

function stableUnique(values: readonly string[]): boolean {
  return (
    new Set(values).size === values.length &&
    values.every((value, index) => index === 0 || values[index - 1].localeCompare(value) < 0)
  );
}

export function validateMonochromeManifestSet(
  authorities: readonly NamedMonochromeManifest[],
): string[] {
  const errors: string[] = [];
  const ownedPathAuthorities = new Map<string, string>();

  for (const { name, manifest } of authorities) {
    if (manifest.schemaVersion !== 1) errors.push(`schema metadata drift: ${name}`);
    if (manifest.sourceCommit !== MONOCHROME_SOURCE_COMMIT) {
      errors.push(`source commit metadata drift: ${name}`);
    }
    if (manifest.captureMode !== 'retroactive-source-freeze') {
      errors.push(`capture metadata drift: ${name}`);
    }
    if (!stableUnique(manifest.ownedPaths)) {
      errors.push(`owned path metadata is not unique and stable: ${name}`);
    }
    if (JSON.stringify(manifest.fixtureIds) !== JSON.stringify(MONOCHROME_FIXTURE_IDS)) {
      errors.push(`fixture id metadata drift: ${name}`);
    }
    if (JSON.stringify(manifest.fixtureHashes) !== JSON.stringify(MONOCHROME_FIXTURE_HASHES)) {
      errors.push(`fixture hash metadata drift: ${name}`);
    }
    for (const ownedPath of manifest.ownedPaths) {
      const priorAuthority = ownedPathAuthorities.get(ownedPath);
      if (priorAuthority) {
        errors.push(`owned path overlap: ${ownedPath} (${priorAuthority}, ${name})`);
      } else {
        ownedPathAuthorities.set(ownedPath, name);
      }
    }
  }

  return errors;
}

export function validateMonochromeFixtureManifest(
  manifest: MonochromeFixtureManifest,
  fixtures: Readonly<Record<string, unknown>>,
): string[] {
  const errors: string[] = [];
  if (manifest.schemaVersion !== 1) errors.push('unsupported schema version');
  if (manifest.sourceCommit !== MONOCHROME_SOURCE_COMMIT) errors.push('source commit drift');
  if (!stableUnique(manifest.fixtureIds))
    errors.push('fixture ids must be unique and in stable order');

  const fixtureKeys = Object.keys(fixtures).sort();
  if (JSON.stringify(fixtureKeys) !== JSON.stringify([...manifest.fixtureIds])) {
    errors.push('fixture id closure mismatch');
  }
  const fixtureHashKeys = Object.keys(manifest.fixtureHashes).sort();
  if (JSON.stringify(fixtureHashKeys) !== JSON.stringify([...manifest.fixtureIds])) {
    errors.push('fixture hash closure mismatch');
  }

  for (const fixtureId of manifest.fixtureIds) {
    const value = fixtures[fixtureId];
    const expectedHash = createHash('sha256').update(JSON.stringify(value)).digest('hex');
    if (manifest.fixtureHashes[fixtureId] !== expectedHash) {
      errors.push(`fixture hash drift: ${fixtureId}`);
    }
  }

  return errors;
}
