import { validatePassLedger } from './pass-ledger.mjs';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PASS_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const REGION_NAME_PATTERN = /^[a-z0-9_-]+$/;
const EVIDENCE_HASHES = ['screenshotSha256', 'reportSha256', 'diffSha256', 'overlaySha256'];
const SCORE_EPSILON = 1e-12;

/**
 * A neighboring region may worsen by at most one percentage point. The
 * threshold is inclusive and can be tightened by the caller.
 */
export const DEFAULT_MATERIAL_REGION_REGRESSION_THRESHOLD = 0.01;

function rejected(reasons, options = {}) {
  return {
    decision: 'rejected',
    reasons,
    reassessmentRequired: options.reassessmentRequired ?? false,
    materialRegionRegressionThreshold:
      options.materialRegionRegressionThreshold ?? DEFAULT_MATERIAL_REGION_REGRESSION_THRESHOLD,
    pass: options.pass ?? null,
  };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isScore(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isRevision(value) {
  return (
    isObject(value) &&
    (value.kind === 'commit' || value.kind === 'working-tree') &&
    isText(value.value)
  );
}

function formatNumber(value) {
  return Number(value.toFixed(12)).toString();
}

function validatePolicy(options) {
  if (options === undefined) {
    return DEFAULT_MATERIAL_REGION_REGRESSION_THRESHOLD;
  }
  if (!isObject(options)) {
    return null;
  }
  const threshold =
    options.materialRegionRegressionThreshold ?? DEFAULT_MATERIAL_REGION_REGRESSION_THRESHOLD;
  return isScore(threshold) ? threshold : null;
}

function validateEvidence(value) {
  if (!isObject(value)) {
    return 'evidence';
  }
  for (const name of EVIDENCE_HASHES) {
    if (!SHA256_PATTERN.test(value[name] ?? '')) {
      return `evidence.${name}`;
    }
  }
  return null;
}

function validateCandidateShape(candidate) {
  if (!isObject(candidate)) {
    return null;
  }
  if (!isText(candidate.id) || !PASS_ID_PATTERN.test(candidate.id)) {
    return 'id';
  }
  if (!isText(candidate.parentId)) {
    return 'parentId';
  }
  if (!isRevision(candidate.revision)) {
    return 'revision';
  }
  if (!isText(candidate.focusedChange)) {
    return 'focusedChange';
  }
  if (
    !Array.isArray(candidate.focusedRegions) ||
    candidate.focusedRegions.length === 0 ||
    candidate.focusedRegions.some(
      (name) => typeof name !== 'string' || !REGION_NAME_PATTERN.test(name),
    ) ||
    new Set(candidate.focusedRegions).size !== candidate.focusedRegions.length
  ) {
    return 'focusedRegions';
  }
  if (
    !Array.isArray(candidate.functionalRegressions) ||
    candidate.functionalRegressions.some((value) => !isText(value))
  ) {
    return 'functionalRegressions';
  }
  const evidenceError = validateEvidence(candidate.evidence);
  if (evidenceError) {
    return evidenceError;
  }
  if (!isObject(candidate.comparison)) {
    return 'comparison';
  }
  return '';
}

function currentAnchor(ledger) {
  for (let index = ledger.passes.length - 1; index >= 0; index -= 1) {
    if (ledger.passes[index].decision === 'kept') {
      return ledger.passes[index];
    }
  }
  return ledger.baseline;
}

function currentAnchorId(ledger) {
  const anchor = currentAnchor(ledger);
  return anchor === ledger.baseline ? 'baseline' : anchor.id;
}

function passesSinceLastReassessment(ledger) {
  if (ledger.reassessments.length === 0) {
    return ledger.passes.length;
  }
  const passIndexes = new Map(ledger.passes.map(({ id }, index) => [id, index]));
  const latestIndex = Math.max(
    ...ledger.reassessments.map(({ afterPassId }) => passIndexes.get(afterPassId)),
  );
  return ledger.passes.length - latestIndex - 1;
}

function comparisonReasons(comparison, candidate, anchor) {
  const reasons = [];
  if (comparison.schemaVersion !== 1) {
    reasons.push('invalid-comparison:schemaVersion');
  }
  if (comparison.passId !== candidate.id) {
    reasons.push(
      `comparison-pass-id-mismatch:${String(comparison.passId)}:expected:${candidate.id}`,
    );
  }
  if (comparison.revision !== candidate.revision.value) {
    reasons.push(
      `comparison-revision-mismatch:${String(comparison.revision)}:expected:${candidate.revision.value}`,
    );
  }
  if (!isObject(comparison.full) || !isScore(comparison.full.diffRatio)) {
    reasons.push('invalid-comparison:full.diffRatio');
  }
  if (!isScore(comparison.weightedRegionDiffRatio)) {
    reasons.push('invalid-comparison:weightedRegionDiffRatio');
  }

  if (!isObject(comparison.regions)) {
    reasons.push('invalid-comparison:regions');
    return reasons;
  }
  for (const name of Object.keys(comparison.regions).sort()) {
    const region = comparison.regions[name];
    if (!REGION_NAME_PATTERN.test(name) || !isObject(region) || !isScore(region.diffRatio)) {
      reasons.push(`invalid-comparison:regions.${name}.diffRatio`);
    }
  }
  const actualRegions = Object.keys(comparison.regions).sort();
  const expectedRegions = Object.keys(anchor.regions).sort();
  if (
    actualRegions.length !== expectedRegions.length ||
    actualRegions.some((name, index) => name !== expectedRegions[index])
  ) {
    reasons.push('comparison-region-set-mismatch');
  }
  for (const name of candidate.focusedRegions) {
    if (!Object.hasOwn(anchor.regions, name)) {
      reasons.push(`unknown-focused-region:${name}`);
    }
  }
  return reasons;
}

function normalizedRegions(comparison) {
  return Object.fromEntries(
    Object.entries(comparison.regions).map(([name, region]) => [name, region.diffRatio]),
  );
}

function worstRegion(regions) {
  return Object.entries(regions)
    .sort(([leftName, leftScore], [rightName, rightScore]) => {
      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }
      return leftName.localeCompare(rightName);
    })
    .map(([name, diffRatio]) => ({ name, diffRatio }))[0];
}

function decisionReasons(anchor, candidate, comparison, threshold) {
  const reasons = [];
  const fullDiff = comparison.full.diffRatio;
  const weightedDiff = comparison.weightedRegionDiffRatio;
  if (!(fullDiff < anchor.fullDiff)) {
    reasons.push(
      `full-diff-not-improved:${formatNumber(fullDiff)}>=${formatNumber(anchor.fullDiff)}`,
    );
  }
  if (!(weightedDiff < anchor.weightedDiff)) {
    reasons.push(
      `weighted-diff-not-improved:${formatNumber(weightedDiff)}>=${formatNumber(anchor.weightedDiff)}`,
    );
  }

  const focused = new Set(candidate.focusedRegions);
  for (const name of Object.keys(anchor.regions).sort()) {
    if (focused.has(name)) {
      continue;
    }
    const delta = comparison.regions[name].diffRatio - anchor.regions[name];
    if (delta - threshold > SCORE_EPSILON) {
      reasons.push(
        `material-region-regression:${name}:+${formatNumber(delta)}>${formatNumber(threshold)}`,
      );
    }
  }
  for (const regression of candidate.functionalRegressions) {
    reasons.push(`functional-regression:${regression.trim()}`);
  }
  return reasons;
}

/**
 * Decide whether one measured comparison may extend the current accepted
 * ledger lineage. The function clones both inputs before inspection and never
 * mutates the ledger, candidate, report, or evidence objects.
 */
export function decideMeasuredPass(ledgerInput, candidateInput, options) {
  const threshold = validatePolicy(options);
  if (threshold === null) {
    return rejected(['invalid-policy:materialRegionRegressionThreshold']);
  }

  let ledger;
  try {
    ledger = structuredClone(ledgerInput);
    validatePassLedger(ledger);
  } catch {
    return rejected(['invalid-ledger'], {
      materialRegionRegressionThreshold: threshold,
    });
  }

  let candidate;
  try {
    candidate = structuredClone(candidateInput);
  } catch {
    return rejected(['invalid-candidate'], {
      materialRegionRegressionThreshold: threshold,
    });
  }

  const candidateError = validateCandidateShape(candidate);
  if (candidateError === null) {
    return rejected(['invalid-candidate'], {
      materialRegionRegressionThreshold: threshold,
    });
  }
  if (candidateError) {
    return rejected([`invalid-candidate:${candidateError}`], {
      materialRegionRegressionThreshold: threshold,
    });
  }

  if (ledger.passes.some(({ id }) => id === candidate.id)) {
    return rejected([`duplicate-pass-id:${candidate.id}`], {
      materialRegionRegressionThreshold: threshold,
    });
  }

  const parent =
    candidate.parentId === 'baseline'
      ? ledger.baseline
      : ledger.passes.find(({ id }) => id === candidate.parentId);
  if (!parent) {
    return rejected([`missing-parent:${candidate.parentId}`], {
      materialRegionRegressionThreshold: threshold,
    });
  }
  if (parent !== ledger.baseline && parent.decision === 'rejected') {
    return rejected([`rejected-parent:${candidate.parentId}`], {
      materialRegionRegressionThreshold: threshold,
    });
  }

  const expectedParentId = currentAnchorId(ledger);
  if (candidate.parentId !== expectedParentId) {
    return rejected([`stale-parent:${candidate.parentId}:expected:${expectedParentId}`], {
      materialRegionRegressionThreshold: threshold,
    });
  }

  if (passesSinceLastReassessment(ledger) >= ledger.maximumPassesBeforeReassessment) {
    return rejected([`reassessment-required-after:${ledger.passes.at(-1).id}`], {
      reassessmentRequired: true,
      materialRegionRegressionThreshold: threshold,
    });
  }

  const comparisonErrors = comparisonReasons(candidate.comparison, candidate, parent);
  if (comparisonErrors.length > 0) {
    return rejected(comparisonErrors, {
      materialRegionRegressionThreshold: threshold,
    });
  }

  const regions = normalizedRegions(candidate.comparison);
  const reasons = decisionReasons(parent, candidate, candidate.comparison, threshold);
  const decision = reasons.length === 0 ? 'kept' : 'rejected';
  const pass = {
    id: candidate.id,
    parentId: candidate.parentId,
    revision: candidate.revision,
    focusedChange: candidate.focusedChange.trim(),
    fullDiff: candidate.comparison.full.diffRatio,
    weightedDiff: candidate.comparison.weightedRegionDiffRatio,
    regions,
    worstRegion: worstRegion(regions),
    decision,
    regressions: [...reasons],
    evidence: candidate.evidence,
  };

  return {
    decision,
    reasons,
    reassessmentRequired: false,
    materialRegionRegressionThreshold: threshold,
    pass,
  };
}
