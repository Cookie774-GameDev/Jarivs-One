import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  deterministicDocument,
  deterministicDocumentId,
  parseApiEnvelope,
  validateFixtureRoot,
} from './generate-siyuan-500mb-fixture.mjs';

const SCRIPT_PATH = fileURLToPath(new URL('./generate-siyuan-500mb-fixture.mjs', import.meta.url));
const RESERVED_ROOT = 'D:\\VibeSpace-Testing\\SiYuan-Context-OpenCode-RLM-Feature-Testing';

test('deterministic document ids cover the exact 500-document range', () => {
  assert.equal(deterministicDocumentId(0), '20260820084600-0000000');
  assert.equal(deterministicDocumentId(499), '20260820084600-00000dv');
  assert.throws(() => deterministicDocumentId(-1), /index is invalid/u);
  assert.throws(() => deterministicDocumentId(500), /index is invalid/u);
  assert.throws(() => deterministicDocumentId(1.5), /index is invalid/u);
});

test('each deterministic document is exactly one million submitted Markdown bytes', () => {
  const document = deterministicDocument(499);
  assert.equal(Buffer.byteLength(document), 1_000_000);
  assert.match(document, /VIBESPACE_SIYUAN_500MB_SENTINEL_0499/u);
  assert.match(document, /DOCUMENT_ID=20260820084600-00000dv/u);
  assert.equal(
    createHash('sha256').update(document).digest('hex'),
    'f4b69c64c853bb8e096b8329ebe184c3857b689cd1695577fa0011bb20e5ce42',
  );
});

test('document generation rejects undersized and invalid targets', () => {
  assert.throws(() => deterministicDocument(0, 4_095), /size is invalid/u);
  assert.throws(() => deterministicDocument(0, 4_096.5), /size is invalid/u);
  assert.equal(Buffer.byteLength(deterministicDocument(0, 4_096)), 4_096);
});

test('fixture root validation accepts only the reserved external authority', () => {
  assert.equal(validateFixtureRoot(RESERVED_ROOT), path.resolve(RESERVED_ROOT));
  assert.throws(
    () => validateFixtureRoot(path.join(RESERVED_ROOT, 'child')),
    /reserved authority/u,
  );
  assert.throws(() => validateFixtureRoot('D:\\VibeSpace-Testing'), /reserved authority/u);
});

test('API envelope parsing returns successful data and rejects malformed authority', () => {
  assert.deepEqual(parseApiEnvelope({ code: 0, msg: '', data: { id: 'ok' } }, 'test'), {
    id: 'ok',
  });
  assert.throws(() => parseApiEnvelope(null, 'test'), /response is invalid/u);
  assert.throws(() => parseApiEnvelope({ code: '0', msg: '', data: null }, 'test'), /envelope/u);
  assert.throws(
    () => parseApiEnvelope({ code: -1, msg: 'do-not-surface-this-secret', data: null }, 'test'),
    (error) => error.message === 'SiYuan test failed with code -1',
  );
});

test('production generator source preserves loopback, exact-corpus, and secret-safe contracts', async () => {
  const source = await readFile(SCRIPT_PATH, 'utf8');
  assert.match(source, /const DOCUMENT_COUNT = 500;/u);
  assert.match(source, /const DOCUMENT_BYTES = 1_000_000;/u);
  assert.match(source, /server\.listen\(0, '127\.0\.0\.1'/u);
  assert.match(source, /`http:\/\/127\.0\.0\.1:\$\{port\}`/u);
  assert.match(source, /SIYUAN_ACCESS_AUTH_CODE: accessCode/u);
  assert.doesNotMatch(source, /--access-auth-code/u);
  assert.match(source, /\/api\/block\/getBlockKramdown/u);
  assert.match(source, /\/api\/search\/fullTextSearchBlock/u);
  assert.match(source, /\/api\/system\/exit/u);
});
