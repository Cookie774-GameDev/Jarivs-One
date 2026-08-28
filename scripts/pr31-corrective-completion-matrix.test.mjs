import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  PR31_COMPLETION_STATES,
  readPr31CompletionMatrix,
  validatePr31CompletionMatrix,
} from './pr31-corrective-completion-matrix.mjs';

const verifiedRow = {
  id: 'verified',
  requirement: 'A completed requirement',
  status: 'Implemented and verified',
  evidence: [
    { kind: 'commit', ref: 'abc123' },
    { kind: 'test', ref: 'node --test' },
  ],
};

test('accepts only the four corrective completion states', () => {
  assert.deepEqual(PR31_COMPLETION_STATES, [
    'Implemented and verified',
    'Implemented but verification failed',
    'Not implemented',
    'Externally blocked',
  ]);
  const result = validatePr31CompletionMatrix({
    schemaVersion: 1,
    requirements: [{ ...verifiedRow, status: 'mostly complete' }],
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /invalid status/);
});

test('fails closed while safe work is not implemented or verification failed', () => {
  for (const status of ['Not implemented', 'Implemented but verification failed']) {
    const result = validatePr31CompletionMatrix({
      schemaVersion: 1,
      requirements: [verifiedRow, { ...verifiedRow, id: status, status }],
    });
    assert.equal(result.ok, true);
    assert.equal(result.complete, false);
  }
});

test('requires narrow actionable evidence for external blockers', () => {
  const invalid = validatePr31CompletionMatrix({
    schemaVersion: 1,
    requirements: [{ ...verifiedRow, id: 'blocked', status: 'Externally blocked' }],
  });
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join('\n'), /external blocker requires prerequisite/);

  const valid = validatePr31CompletionMatrix({
    schemaVersion: 1,
    requirements: [
      {
        ...verifiedRow,
        id: 'blocked',
        status: 'Externally blocked',
        externalBlocker: {
          prerequisite: 'Registered provider client',
          localBoundary: 'Local callback and error paths pass',
          unblockAction: 'Register the client and rerun provider consent acceptance',
        },
      },
    ],
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.complete, true);
});

test('requires native and visual evidence when a verified row declares those gates', () => {
  const result = validatePr31CompletionMatrix({
    schemaVersion: 1,
    requirements: [{ ...verifiedRow, nativeRequired: true, visualRequired: true }],
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /lacks native evidence/);
  assert.match(result.errors.join('\n'), /lacks screenshot or image-diff evidence/);
});

test('the checked-in live matrix is valid but cannot yet claim PR31 completion', () => {
  const matrix = readPr31CompletionMatrix(fileURLToPath(new URL('..', import.meta.url)));
  const result = validatePr31CompletionMatrix(matrix);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.complete, false);
  assert.ok(result.counts['Not implemented'] > 0);
});
