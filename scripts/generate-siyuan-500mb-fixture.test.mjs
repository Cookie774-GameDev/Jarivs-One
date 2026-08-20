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
  validateFixtureEvidence,
  validateFixtureRoot,
} from './generate-siyuan-500mb-fixture.mjs';

const SCRIPT_PATH = fileURLToPath(new URL('./generate-siyuan-500mb-fixture.mjs', import.meta.url));
const RESERVED_ROOT = 'D:\\VibeSpace-Testing\\SiYuan-Context-OpenCode-RLM-Feature-Testing';
const CHECKED_IN_EVIDENCE_PATH = fileURLToPath(
  new URL('../docs/oss/siyuan-500mb-fixture-evidence.json', import.meta.url),
);

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
  assert.match(document, /CORPUS_PROFILE=structured-project-records-v2/u);
  assert.match(document, /GOLD_EXACT_FACT artifact=atlas-0499/u);
  assert.match(document, /GOLD_FRESHNESS current=rev-0499-20260820 stale=rev-0499-20260819/u);
  assert.match(
    document,
    /GOLD_MULTI_HOP source=project-context-vault-0499 depends_on=project-context-vault-0000/u,
  );
  assert.match(document, /authority=current/u);
  assert.match(document, /authority=stale/u);
  assert.match(document, /relation=depends_on/u);
  assert.match(document, /provenance=source-0499-evidence-/u);
  assert.doesNotMatch(document, /fixture-0499-offline-local-first-lossless-context-evidence/u);
  const records = document.match(/^PROJECT_RECORD .+$/gmu) ?? [];
  assert.ok(records.length > 2_500);
  assert.equal(new Set(records).size, records.length);
  assert.ok((document.match(/```text/gu) ?? []).length > 30);
  assert.ok(
    document
      .split('```text\n')
      .slice(1)
      .every((block) => Buffer.byteLength(block.split('\n```', 1)[0]) <= 32_020),
  );
});

test('structured documents are deterministic, distinct, and retain exact retrieval relationships', () => {
  const first = deterministicDocument(42, 64_000);
  const repeated = deterministicDocument(42, 64_000);
  const adjacent = deterministicDocument(43, 64_000);
  assert.equal(first, repeated);
  assert.notEqual(
    createHash('sha256').update(first).digest('hex'),
    createHash('sha256').update(adjacent).digest('hex'),
  );
  assert.match(first, /SOURCE_AUTHORITY=project-context-vault-0042/u);
  assert.match(first, /NEXT_SOURCE=project-context-vault-0043/u);
  assert.match(first, /target_document=00[0-9]{2}/u);
  assert.ok((first.match(/^TAIL_RECORD .+$/gmu) ?? []).length >= 2);
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

test('checked-in fixture evidence preserves the exact measured acceptance contract', async () => {
  const evidence = JSON.parse(await readFile(CHECKED_IN_EVIDENCE_PATH, 'utf8'));
  assert.equal(validateFixtureEvidence(evidence), evidence);
  assert.throws(
    () => validateFixtureEvidence({ ...evidence, submittedMarkdownBytes: 499_999_999 }),
    /evidence contract is invalid/u,
  );
  assert.throws(
    () => validateFixtureEvidence({ ...evidence, loopbackHost: '0.0.0.0' }),
    /evidence contract is invalid/u,
  );
  assert.throws(
    () => validateFixtureEvidence({ ...evidence, processExited: false }),
    /evidence contract is invalid/u,
  );
});

test('production generator source preserves loopback, exact-corpus, and secret-safe contracts', async () => {
  const source = await readFile(SCRIPT_PATH, 'utf8');
  assert.match(source, /const DOCUMENT_COUNT = 500;/u);
  assert.match(source, /const DOCUMENT_BYTES = 1_000_000;/u);
  assert.match(source, /const CORPUS_PROFILE = 'structured-project-records-v2';/u);
  assert.match(source, /server\.listen\(0, '127\.0\.0\.1'/u);
  assert.match(source, /`http:\/\/127\.0\.0\.1:\$\{port\}`/u);
  assert.match(source, /SIYUAN_ACCESS_AUTH_CODE: accessCode/u);
  assert.match(source, /\{ authCode: accessCode, captcha: '', rememberMe: false \}/u);
  assert.doesNotMatch(source, /accessAuthCode/u);
  assert.doesNotMatch(source, /--access-auth-code/u);
  assert.match(source, /\/api\/block\/getBlockKramdown/u);
  assert.match(source, /await mkdir\(workspace, \{ recursive: true \}\)/u);
  assert.match(source, /waitForStoredDocument/u);
  assert.match(source, /progress\.pending = \{ index, id, submittedBytes, submittedSha256 \}/u);
  assert.doesNotMatch(source, /markdown,\s*id,/u);
  assert.match(source, /\/api\/search\/fullTextSearchBlock/u);
  assert.match(source, /\/api\/system\/exit/u);
});
