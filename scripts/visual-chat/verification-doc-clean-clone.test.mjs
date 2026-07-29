import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const checkerPath = resolve(root, 'scripts/visual-chat/verification-doc.test.mjs');
const trackedEvidencePath = resolve(root, 'tests/visual/chat/live-verification-evidence.json');

test('verification report remains reproducible without git-ignored local browser artifacts', () => {
  assert.equal(
    existsSync(trackedEvidencePath),
    true,
    'expected a tracked live-verification evidence record',
  );
  const source = readFileSync(checkerPath, 'utf8');
  assert.match(source, /tests\/visual\/chat\/live-verification-evidence\.json/u);
  assert.match(source, /ORIGAMI_IGNORE_LOCAL_ARTIFACTS/u);
  assert.doesNotMatch(
    source,
    /const\s+(?:interactionReceipt|nonChatReceipt)\s*=\s*readJson\s*\(\s*['"]\.artifacts\//u,
    'the tracked checker must not eagerly load ignored browser receipts',
  );
});
