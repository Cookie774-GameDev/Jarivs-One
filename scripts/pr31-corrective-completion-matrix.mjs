import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PR31_COMPLETION_STATES = Object.freeze([
  'Implemented and verified',
  'Implemented but verification failed',
  'Not implemented',
  'Externally blocked',
]);

const STATE_SET = new Set(PR31_COMPLETION_STATES);
const REQUIRED_VERIFIED_EVIDENCE = new Set(['commit', 'test']);

function isText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validatePr31CompletionMatrix(matrix) {
  const errors = [];
  if (!matrix || matrix.schemaVersion !== 1 || !Array.isArray(matrix.requirements)) {
    return { ok: false, complete: false, counts: {}, errors: ['invalid matrix envelope'] };
  }

  const ids = new Set();
  const counts = Object.fromEntries(PR31_COMPLETION_STATES.map((state) => [state, 0]));
  for (const [index, row] of matrix.requirements.entries()) {
    const label = isText(row?.id) ? row.id : `row ${index}`;
    if (!isText(row?.id) || ids.has(row.id)) errors.push(`${label}: id must be unique`);
    else ids.add(row.id);
    if (!isText(row?.requirement)) errors.push(`${label}: requirement is required`);
    if (!STATE_SET.has(row?.status)) {
      errors.push(`${label}: invalid status`);
      continue;
    }
    counts[row.status] += 1;

    if (!Array.isArray(row.evidence) || row.evidence.length === 0) {
      errors.push(`${label}: objective evidence is required`);
    } else {
      for (const evidence of row.evidence) {
        if (!isText(evidence?.kind) || !isText(evidence?.ref)) {
          errors.push(`${label}: each evidence item needs kind and ref`);
        }
      }
    }

    if (row.status === 'Implemented and verified') {
      const kinds = new Set((row.evidence ?? []).map(({ kind }) => kind));
      for (const required of REQUIRED_VERIFIED_EVIDENCE) {
        if (!kinds.has(required))
          errors.push(`${label}: verified rows require ${required} evidence`);
      }
      if (row.nativeRequired === true && !kinds.has('native')) {
        errors.push(`${label}: native-required row lacks native evidence`);
      }
      if (row.visualRequired === true && !kinds.has('screenshot') && !kinds.has('image-diff')) {
        errors.push(`${label}: visual-required row lacks screenshot or image-diff evidence`);
      }
    }

    if (row.status === 'Externally blocked') {
      const blocker = row.externalBlocker;
      for (const key of ['prerequisite', 'localBoundary', 'unblockAction']) {
        if (!isText(blocker?.[key])) errors.push(`${label}: external blocker requires ${key}`);
      }
    }
  }

  const complete =
    errors.length === 0 &&
    counts['Not implemented'] === 0 &&
    counts['Implemented but verification failed'] === 0;
  return { ok: errors.length === 0, complete, counts, errors };
}

export function readPr31CompletionMatrix(root) {
  const path = resolve(root, 'docs/operations/PR31_CORRECTIVE_COMPLETION_MATRIX.json');
  return JSON.parse(readFileSync(path, 'utf8'));
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const result = validatePr31CompletionMatrix(readPr31CompletionMatrix(root));
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.complete ? 0 : 1;
}
