import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const sourcePath = new URL(
  '../../app/src/features/appearance/themeContract.source.json',
  import.meta.url,
);
const generatedPath = new URL(
  '../../app/src/features/appearance/themeContract.generated.ts',
  import.meta.url,
);
const prepaintPath = new URL('../../app/public/theme-prepaint.js', import.meta.url);
const generatorPath = fileURLToPath(new URL('./generate-theme-contract.mjs', import.meta.url));

test('source contract carries the complete accepted theme policy', () => {
  const source = JSON.parse(readFileSync(sourcePath, 'utf8'));

  assert.equal(source.storageKey, 'jarvis-ui');
  assert.equal(source.storeVersion, 5);
  assert.equal(source.fallbackTheme, 'default');
  assert.deepEqual(
    source.selectableThemes.map(({ id }) => id),
    ['jarvis', 'vibespace', 'default', 'monochrome'],
  );
  assert.deepEqual(source.documentThemes, {
    jarvis: 'jarvis',
    vibespace: 'vibespace',
    default: 'dark',
    monochrome: 'monochrome',
  });
  assert.deepEqual(source.persistedLegacyThemes, {
    light: 'monochrome',
    dark: 'default',
    system: 'default',
  });
  assert.deepEqual(source.syncLegacyThemes, { light: 'monochrome' });
});

test('generated TypeScript and prepaint assets are current', () => {
  assert.doesNotThrow(() => {
    execFileSync(process.execPath, [generatorPath, '--check'], {
      cwd: repoRoot,
      stdio: 'pipe',
    });
  });

  const generated = readFileSync(generatedPath, 'utf8');
  const prepaint = readFileSync(prepaintPath, 'utf8');

  assert.match(generated, /monochrome/);
  assert.match(prepaint, /data-theme-preference/);
  assert.doesNotMatch(prepaint, /prefers-color-scheme/);
  assert.doesNotMatch(prepaint, /matchMedia/);
});

test('generated prepaint normalizes storage without system media authority', () => {
  const prepaint = readFileSync(prepaintPath, 'utf8');
  const cases = [
    ['light', 'monochrome', 'monochrome'],
    ['dark', 'default', 'dark'],
    ['system', 'default', 'dark'],
    ['monochrome', 'monochrome', 'monochrome'],
    ['unknown', 'default', 'dark'],
  ];

  for (const [stored, preference, documentTheme] of cases) {
    const attributes = new Map();
    runInNewContext(prepaint, {
      localStorage: {
        getItem: () => JSON.stringify({ state: { theme: stored }, version: 5 }),
      },
      document: {
        documentElement: {
          setAttribute: (name, value) => attributes.set(name, value),
        },
      },
      Set,
      JSON,
    });

    assert.equal(attributes.get('data-theme-preference'), preference);
    assert.equal(attributes.get('data-theme'), documentTheme);
  }
});
