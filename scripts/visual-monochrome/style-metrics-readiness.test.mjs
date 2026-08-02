import assert from 'node:assert/strict';
import { test } from 'node:test';

import { documentThemeForRequest } from '../../tests/visual/monochrome/styleMetrics.ts';

test('readiness reports the actual document theme for preserved requests', () => {
  assert.equal(documentThemeForRequest('default'), 'dark');
  assert.equal(documentThemeForRequest('origami'), 'vibespace');
  assert.equal(documentThemeForRequest('vibespace'), 'vibespace');
  assert.equal(documentThemeForRequest('jarvis'), 'jarvis');
  assert.equal(documentThemeForRequest('monochrome'), 'monochrome');
});
