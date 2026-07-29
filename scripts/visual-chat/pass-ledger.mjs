function clone(value) {
  return structuredClone(value);
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PASS_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const EVIDENCE_HASHES = ['screenshotSha256', 'reportSha256', 'diffSha256', 'overlaySha256'];
export const MAX_PASSES_BEFORE_REASSESSMENT = 12;

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function requireText(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function requireRevision(value, label) {
  requireObject(value, label);
  if (value.kind !== 'commit' && value.kind !== 'working-tree') {
    throw new Error(`${label}.kind must be commit or working-tree.`);
  }
  requireText(value.value, `${label}.value`);
}

function requireScore(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be a finite number between 0 and 1.`);
  }
  return value;
}

function requireEvidence(value, label) {
  requireObject(value, label);
  for (const name of EVIDENCE_HASHES) {
    if (!SHA256_PATTERN.test(value[name] ?? '')) {
      throw new Error(`${label}.${name} must be a lowercase 64-character SHA-256 hash.`);
    }
  }
}

function requireRegions(value, label) {
  requireObject(value, label);
  const entries = Object.entries(value);
  if (entries.length === 0) {
    throw new Error(`${label} must contain at least one measured region.`);
  }
  for (const [name, score] of entries) {
    if (!/^[a-z0-9_-]+$/.test(name)) {
      throw new Error(`${label} contains an unsafe region name: ${name}.`);
    }
    requireScore(score, `${label}.${name}`);
  }
}

function validateBaseline(value) {
  requireObject(value, 'baseline');
  requireRevision(value.revision, 'baseline.revision');
  requireScore(value.fullDiff, 'baseline.fullDiff');
  requireScore(value.weightedDiff, 'baseline.weightedDiff');
  requireRegions(value.regions, 'baseline.regions');
  requireEvidence(value.evidence, 'baseline.evidence');
}

function validatePassShape(entry) {
  requireObject(entry, 'pass');
  const id = requireText(entry.id, 'pass.id');
  if (!PASS_ID_PATTERN.test(id)) {
    throw new Error(`Unsafe pass ID: ${id}.`);
  }
  requireText(entry.parentId, `${id}.parentId`);
  requireRevision(entry.revision, `${id}.revision`);
  requireText(entry.focusedChange, `${id}.focusedChange`);
  requireScore(entry.fullDiff, `${id}.fullDiff`);
  requireScore(entry.weightedDiff, `${id}.weightedDiff`);
  requireRegions(entry.regions, `${id}.regions`);
  requireObject(entry.worstRegion, `${id}.worstRegion`);
  const worstName = requireText(entry.worstRegion.name, `${id}.worstRegion.name`);
  const worstScore = requireScore(entry.worstRegion.diffRatio, `${id}.worstRegion.diffRatio`);
  if (
    !Object.hasOwn(entry.regions, worstName) ||
    entry.regions[worstName] !== worstScore ||
    worstScore !== Math.max(...Object.values(entry.regions))
  ) {
    throw new Error(`${id}.worstRegion must identify the maximum measured region.`);
  }
  if (entry.decision !== 'kept' && entry.decision !== 'rejected') {
    throw new Error(`${id}.decision must be kept or rejected.`);
  }
  if (
    !Array.isArray(entry.regressions) ||
    entry.regressions.some(
      (regression) => typeof regression !== 'string' || regression.trim().length === 0,
    )
  ) {
    throw new Error(`${id}.regressions must be an array of non-empty strings.`);
  }
  requireEvidence(entry.evidence, `${id}.evidence`);
}

function validateReassessmentShape(entry) {
  requireObject(entry, 'reassessment');
  requireText(entry.afterPassId, 'reassessment.afterPassId');
  requireRevision(entry.revision, 'reassessment.revision');
  requireText(entry.reason, 'reassessment.reason');
  requireText(entry.nextFocus, 'reassessment.nextFocus');
}

export function validatePassLedger(ledger) {
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) {
    throw new Error('Pass ledger must be an object.');
  }
  if (ledger.schemaVersion !== 1) {
    throw new Error(`Unsupported pass ledger schema: ${String(ledger.schemaVersion)}.`);
  }
  if (!ledger.baseline || !Array.isArray(ledger.passes) || !Array.isArray(ledger.reassessments)) {
    throw new Error('Pass ledger requires baseline, passes, and reassessments.');
  }
  if (ledger.maximumPassesBeforeReassessment !== MAX_PASSES_BEFORE_REASSESSMENT) {
    throw new Error(
      `Pass ledger maximumPassesBeforeReassessment must be ${MAX_PASSES_BEFORE_REASSESSMENT}.`,
    );
  }
  validateBaseline(ledger.baseline);

  const passById = new Map();
  const passIds = new Set();
  for (const entry of ledger.passes) {
    validatePassShape(entry);
    if (passIds.has(entry.id)) {
      throw new Error(`Duplicate pass ID: ${String(entry.id)}.`);
    }
    const parent = entry.parentId === 'baseline' ? ledger.baseline : passById.get(entry.parentId);
    if (!parent) {
      throw new Error(`Parent pass ${entry.parentId} does not exist before ${entry.id}.`);
    }
    if (entry.parentId !== 'baseline' && parent.decision === 'rejected') {
      throw new Error(`Parent pass ${entry.parentId} is rejected and cannot anchor ${entry.id}.`);
    }
    if (
      entry.decision === 'kept' &&
      !(
        entry.fullDiff < parent.fullDiff &&
        entry.weightedDiff < parent.weightedDiff &&
        entry.regressions.length === 0
      )
    ) {
      throw new Error(
        `Kept pass ${entry.id} must strictly improve full and weighted scores without regressions.`,
      );
    }
    passIds.add(entry.id);
    passById.set(entry.id, entry);
  }

  const reassessmentAfter = new Set();
  for (const entry of ledger.reassessments) {
    validateReassessmentShape(entry);
    if (!passById.has(entry.afterPassId)) {
      throw new Error(`Reassessment pass does not exist: ${entry.afterPassId}.`);
    }
    if (reassessmentAfter.has(entry.afterPassId)) {
      throw new Error(`Duplicate reassessment after pass: ${entry.afterPassId}.`);
    }
    reassessmentAfter.add(entry.afterPassId);
  }

  let passesSinceReassessment = 0;
  for (const entry of ledger.passes) {
    passesSinceReassessment += 1;
    if (passesSinceReassessment > MAX_PASSES_BEFORE_REASSESSMENT) {
      throw new Error(
        `Pass ledger contains more than ${MAX_PASSES_BEFORE_REASSESSMENT} passes without reassessment.`,
      );
    }
    if (reassessmentAfter.has(entry.id)) {
      passesSinceReassessment = 0;
    }
  }
  return ledger;
}

export function createPassLedger(baseline) {
  const ledger = {
    schemaVersion: 1,
    maximumPassesBeforeReassessment: MAX_PASSES_BEFORE_REASSESSMENT,
    baseline: clone(baseline),
    passes: [],
    reassessments: [],
  };
  return validatePassLedger(ledger);
}

export function appendPass(ledger, entry) {
  const next = clone(validatePassLedger(ledger));
  next.passes.push(clone(entry));
  return validatePassLedger(next);
}

export function recordReassessment(ledger, entry) {
  const next = clone(validatePassLedger(ledger));
  next.reassessments.push(clone(entry));
  return validatePassLedger(next);
}
