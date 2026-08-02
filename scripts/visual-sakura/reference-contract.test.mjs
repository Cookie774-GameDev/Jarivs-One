import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve();
const manifestPath = path.join(repoRoot, 'docs', 'appearance', 'sakura', 'asset-manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const referenceRoot = process.env.SAKURA_REFERENCE_ROOT || manifest.referenceRoot;

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex').toUpperCase();
}

function inventoryEntry(name) {
  const entry = manifest.files.find((candidate) => candidate.name === name);
  assert.ok(entry, `asset manifest must inventory ${name}`);
  return entry;
}

test(
  'the supplied Sakura reference package remains byte-identical to the frozen authority',
  { skip: !existsSync(referenceRoot) && 'local reference package is not present' },
  () => {
    for (const name of ['index.html', 'preview.png', 'style-board.png', 'STYLE_SPEC.md']) {
      const entry = inventoryEntry(name);
      const sourcePath = path.join(referenceRoot, name);
      assert.ok(existsSync(sourcePath), `${name} is missing from the supplied reference package`);
      assert.equal(sha256(sourcePath), entry.sha256.toUpperCase(), `${name} hash drifted`);
    }
  },
);

test(
  'the richest reference HTML contains the binding palette, materials, and atmospheric effects',
  { skip: !existsSync(referenceRoot) && 'local reference package is not present' },
  () => {
    const html = readFileSync(path.join(referenceRoot, 'index.html'), 'utf8');
    for (const color of [
      '#140e30',
      '#232051',
      '#2f2b71',
      '#4e518a',
      '#a082aa',
      '#916285',
      '#eeabb7',
      '#ef6f88',
      '#f5cec8',
      '#fff7f2',
      '#ffd978',
      '#9ed0b8',
    ]) {
      assert.ok(html.toLowerCase().includes(color), `reference HTML is missing ${color}`);
    }
    assert.match(html, /border-radius:\s*24px/);
    assert.match(html, /backdrop-filter:\s*blur\(14px\)\s+saturate\(1\.15\)/);
    assert.match(html, /@keyframes\s+petal-fall/);
    assert.match(html, /animation:\s*petal-fall/);
    assert.match(html, /linear-gradient\(180deg,\s*#f6cbc4[^;]+#140e30 100%\)/s);
  },
);
