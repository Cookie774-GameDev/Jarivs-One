import type { DelegatedWorkItem, SubagentEvidenceSource, SubagentResult } from './contracts';
import { SubagentLifecycleError } from './planValidator';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/u;
const SAFE_SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_TEXT = /^[^\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]{1,4000}$/u;
const RESULT_STATUSES = new Set(['completed', 'partial', 'blocked', 'failed', 'cancelled']);

function invalid(): never {
  throw new SubagentLifecycleError('result_evidence_invalid');
}

function safeId(value: unknown): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) return invalid();
  return value;
}

function safeText(value: unknown): string {
  if (typeof value !== 'string') return invalid();
  const trimmed = value.trim();
  if (!SAFE_TEXT.test(trimmed)) return invalid();
  return trimmed;
}

function safeInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximum) {
    return invalid();
  }
  return value as number;
}

function safeMoney(value: unknown, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum) {
    return invalid();
  }
  return value;
}

function safePath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\\') ||
    value.startsWith('/') ||
    /^[A-Za-z]:/u.test(value) ||
    /(^|\/)\.{1,2}(\/|$)/u.test(value) ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    return invalid();
  }
  return value;
}

function pathsOverlap(path: string, claim: string): boolean {
  return path === claim || path.startsWith(`${claim}/`);
}

function safeSource(raw: SubagentEvidenceSource): SubagentEvidenceSource {
  if (!['file', 'test', 'artifact', 'reference'].includes(raw.kind)) return invalid();
  const locator = raw.kind === 'file' ? safePath(raw.locator) : safeText(raw.locator);
  if (raw.sha256 !== undefined && !SAFE_SHA256.test(raw.sha256)) return invalid();
  if ((raw.kind === 'file' || raw.kind === 'artifact') && raw.sha256 === undefined) {
    return invalid();
  }
  return Object.freeze({
    id: safeId(raw.id),
    kind: raw.kind,
    locator,
    ...(raw.sha256 === undefined ? {} : { sha256: raw.sha256 }),
  });
}

export function validateSubagentResult(
  input: SubagentResult,
  workItem: DelegatedWorkItem,
  attemptId: string,
): SubagentResult {
  if (
    typeof input !== 'object' ||
    input === null ||
    input.attemptId !== attemptId ||
    input.workItemId !== workItem.id ||
    input.ownerId !== workItem.ownerId ||
    input.parentRunId !== workItem.parentRunId ||
    !RESULT_STATUSES.has(input.status)
  ) {
    return invalid();
  }
  if (
    !Array.isArray(input.sources) ||
    !Array.isArray(input.findings) ||
    !Array.isArray(input.files) ||
    !Array.isArray(input.proposals) ||
    !Array.isArray(input.artifacts) ||
    !Array.isArray(input.tests) ||
    !Array.isArray(input.warnings) ||
    input.sources.length > 200 ||
    input.findings.length > 200 ||
    input.files.length > 200 ||
    input.tests.length > 100
  ) {
    return invalid();
  }
  const sources = Object.freeze(input.sources.map(safeSource));
  const sourceIds = new Set(sources.map((source) => source.id));
  if (sourceIds.size !== sources.length) return invalid();
  const findings = Object.freeze(
    input.findings.map((finding) => {
      const ids: readonly string[] = Object.freeze([
        ...new Set<string>(finding.sourceIds.map((id: string) => safeId(id))),
      ]);
      if (ids.length === 0 || ids.some((id) => !sourceIds.has(id))) return invalid();
      return Object.freeze({
        id: safeId(finding.id),
        summary: safeText(finding.summary),
        sourceIds: ids,
      });
    }),
  );
  const writeClaims = workItem.fileClaims.filter((claim) => claim.access === 'write');
  const files = Object.freeze(
    input.files.map((file) => {
      const path = safePath(file.path);
      if (
        !['created', 'modified', 'deleted'].includes(file.action) ||
        !writeClaims.some((claim) => pathsOverlap(path, claim.path)) ||
        (file.action === 'deleted'
          ? file.sha256 !== null
          : typeof file.sha256 !== 'string' || !SAFE_SHA256.test(file.sha256))
      ) {
        return invalid();
      }
      return Object.freeze({ path, action: file.action, sha256: file.sha256 });
    }),
  );
  const proposals = Object.freeze(
    input.proposals.map((proposal) => {
      const ids: readonly string[] = Object.freeze([
        ...new Set<string>(proposal.sourceIds.map((id: string) => safeId(id))),
      ]);
      if (ids.some((id) => !sourceIds.has(id))) return invalid();
      return Object.freeze({ summary: safeText(proposal.summary), sourceIds: ids });
    }),
  );
  const artifacts = Object.freeze(
    input.artifacts.map((artifact) => {
      if (!SAFE_SHA256.test(artifact.sha256)) return invalid();
      return Object.freeze({
        id: safeId(artifact.id),
        kind: safeId(artifact.kind),
        locator: safeText(artifact.locator),
        sha256: artifact.sha256,
      });
    }),
  );
  const tests = Object.freeze(
    input.tests.map((test) => {
      if (
        !['passed', 'failed', 'skipped'].includes(test.status) ||
        (test.status === 'passed' && test.exitCode !== 0) ||
        (test.status === 'failed' && (test.exitCode === null || test.exitCode === 0)) ||
        (test.status === 'skipped' && test.exitCode !== null)
      ) {
        return invalid();
      }
      return Object.freeze({
        command: safeText(test.command),
        status: test.status,
        exitCode: test.exitCode,
        durationMs: safeInteger(test.durationMs, workItem.timeoutMs),
      });
    }),
  );
  if (
    input.status === 'completed' &&
    (tests.length === 0 ||
      !tests.some((test) => test.status === 'passed') ||
      tests.some((test) => test.status !== 'passed'))
  ) {
    return invalid();
  }
  const warnings = Object.freeze(input.warnings.map(safeText));
  const usage = Object.freeze({
    tokens: safeInteger(input.usage?.tokens, workItem.maxTokens),
    costUsd: safeMoney(input.usage?.costUsd, workItem.maxCostUsd),
    durationMs: safeInteger(input.usage?.durationMs, workItem.timeoutMs),
  });
  return Object.freeze({
    attemptId,
    workItemId: workItem.id,
    ownerId: workItem.ownerId,
    parentRunId: workItem.parentRunId,
    status: input.status,
    findings,
    sources,
    files,
    proposals,
    artifacts,
    tests,
    warnings,
    usage,
  });
}
