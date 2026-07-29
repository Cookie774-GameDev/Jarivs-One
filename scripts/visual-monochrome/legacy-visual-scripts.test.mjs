import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const legacyVisualScripts = [
  new URL('../boot-validation.mjs', import.meta.url),
  new URL('../capture-screenshots.mjs', import.meta.url),
];

test('legacy visual scripts do not seed retired Light or system preferences', () => {
  for (const scriptPath of legacyVisualScripts) {
    const source = readFileSync(scriptPath, 'utf8');
    assert.doesNotMatch(source, /theme\s*:\s*['"](?:light|system)['"]/);
  }
});
