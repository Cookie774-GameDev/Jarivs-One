import type {
  JarvisContextConflict,
  JarvisContextConflictResolutionBasis,
  JarvisContextFreshness,
  JarvisContextItem,
  JarvisContextPack,
  JarvisSourceRef,
} from '@/lib/jarvis/contracts';
import { validateJarvisContextPack } from '@/lib/jarvis/contracts';
import { deepFreezeJarvisCopy } from '@/lib/jarvis/requestEnvelope';
import { classifyJarvisSource } from '@/lib/jarvis/sourcePolicy';

export interface JarvisContextCandidate {
  source: JarvisSourceRef;
  purpose: JarvisContextItem['purpose'];
  excerpt?: string;
  score?: number;
  freshness?: JarvisContextFreshness;
  conflict?: {
    groupId: string;
    resolution?: {
      winnerSourceId: string;
      basis: JarvisContextConflictResolutionBasis;
    };
  };
  explicitlyAttached: boolean;
  authorizedBody: boolean;
}

export interface JarvisContextPackInput {
  accountId: string;
  candidates: readonly JarvisContextCandidate[];
  maxChars: number;
}

export class JarvisContextPackError extends Error {
  readonly code = 'invalid_context_pack' as const;

  constructor(readonly reason: string) {
    super(`Invalid JARVIS context pack: ${reason}`);
    this.name = 'JarvisContextPackError';
  }
}

function copySource(source: JarvisSourceRef): JarvisSourceRef {
  return {
    id: source.id,
    kind: source.kind,
    label: source.label,
    ...(source.uri === undefined ? {} : { uri: source.uri }),
    accountId: source.accountId,
    ...(source.projectId === undefined ? {} : { projectId: source.projectId }),
    trust: source.trust,
    ...(source.origin === undefined ? {} : { origin: source.origin }),
    sensitivity: source.sensitivity,
    ...(source.observedAt === undefined ? {} : { observedAt: source.observedAt }),
    ...(source.contentHash === undefined ? {} : { contentHash: source.contentHash }),
  };
}

function finiteRank(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

function compareCandidates(left: JarvisContextCandidate, right: JarvisContextCandidate): number {
  if (left.explicitlyAttached !== right.explicitlyAttached) {
    return left.explicitlyAttached ? -1 : 1;
  }

  const leftScore = finiteRank(left.score);
  const rightScore = finiteRank(right.score);
  if (leftScore !== rightScore) return rightScore - leftScore;

  const leftObservedAt = finiteRank(left.source.observedAt);
  const rightObservedAt = finiteRank(right.source.observedAt);
  if (leftObservedAt !== rightObservedAt) return rightObservedAt - leftObservedAt;

  return left.source.id < right.source.id ? -1 : left.source.id > right.source.id ? 1 : 0;
}

function admittedPurpose(candidate: JarvisContextCandidate): JarvisContextItem['purpose'] {
  if (candidate.source.trust === 'external_untrusted' && candidate.purpose === 'preference') {
    return 'answer';
  }
  return candidate.purpose;
}

function safeSliceByCodeUnitBudget(value: string, maxChars: number): string {
  if (maxChars <= 0 || value.length === 0) return '';
  let end = Math.min(value.length, maxChars);
  if (end < value.length) {
    const finalCodeUnit = value.charCodeAt(end - 1);
    if (finalCodeUnit >= 0xd800 && finalCodeUnit <= 0xdbff) end -= 1;
  }
  return value.slice(0, end);
}

function exclusion(
  source: JarvisSourceRef,
  reason: string,
): JarvisContextPack['exclusions'][number] {
  return { source: copySource(source), reason };
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function conflictEvidence(candidate: JarvisContextCandidate): string {
  return JSON.stringify([
    candidate.source.contentHash ?? '',
    candidate.authorizedBody ? (candidate.excerpt ?? '') : '',
  ]);
}

function applyContextConflicts(
  admitted: Array<{ candidate: JarvisContextCandidate; item: JarvisContextItem }>,
): void {
  const groups = new Map<
    string,
    Array<{ candidate: JarvisContextCandidate; item: JarvisContextItem }>
  >();
  for (const entry of admitted) {
    const groupId = entry.candidate.conflict?.groupId;
    if (!groupId) continue;
    const group = groups.get(groupId) ?? [];
    group.push(entry);
    groups.set(groupId, group);
  }

  for (const [groupId, group] of groups) {
    const sourceIds = Array.from(new Set(group.map((entry) => entry.item.source.id))).sort(
      stableCompare,
    );
    if (sourceIds.length < 2) continue;
    if (new Set(group.map((entry) => conflictEvidence(entry.candidate))).size < 2) continue;

    const resolutions = group.map((entry) => entry.candidate.conflict?.resolution);
    const resolutionKeys = resolutions
      .filter((resolution) => resolution !== undefined)
      .map((resolution) => `${resolution.winnerSourceId}\0${resolution.basis}`);
    const consistentResolution =
      resolutionKeys.length === group.length && new Set(resolutionKeys).size === 1
        ? resolutions[0]
        : undefined;
    const conflict: JarvisContextConflict =
      consistentResolution && sourceIds.includes(consistentResolution.winnerSourceId)
        ? {
            groupId,
            status: 'resolved',
            sourceIds,
            winnerSourceId: consistentResolution.winnerSourceId,
            basis: consistentResolution.basis,
          }
        : {
            groupId,
            status: 'unresolved',
            sourceIds,
          };
    for (const entry of group) entry.item.conflict = conflict;
  }
}

export async function buildJarvisContextPack(
  input: JarvisContextPackInput,
): Promise<Readonly<JarvisContextPack>> {
  if (typeof input.accountId !== 'string' || input.accountId.trim().length === 0) {
    throw new JarvisContextPackError('account_id_required');
  }
  if (!Number.isSafeInteger(input.maxChars) || input.maxChars < 0) {
    throw new JarvisContextPackError('max_chars_invalid');
  }

  const items: JarvisContextItem[] = [];
  const admitted: Array<{ candidate: JarvisContextCandidate; item: JarvisContextItem }> = [];
  const exclusions: JarvisContextPack['exclusions'] = [];
  let usedChars = 0;
  const candidates = [...input.candidates].sort(compareCandidates);

  for (const candidate of candidates) {
    const source = candidate.source;
    if (source.accountId !== input.accountId) {
      exclusions.push(exclusion(source, 'account_mismatch'));
      continue;
    }
    if (source.sensitivity === 'secret') {
      exclusions.push(exclusion(source, 'secret_source'));
      continue;
    }
    if (source.sensitivity === 'restricted') {
      exclusions.push(exclusion(source, 'restricted_source'));
      continue;
    }

    const pathAdmission = classifyJarvisSource({
      path: source.uri ?? source.label,
      channel: candidate.explicitlyAttached ? 'explicit_attachment' : 'automatic_scan',
      kind: 'text',
      defaultSensitivity: source.sensitivity,
    });
    if (!pathAdmission.allowed) {
      exclusions.push(exclusion(source, pathAdmission.reason));
      continue;
    }

    const excerpt = candidate.excerpt;
    if (candidate.authorizedBody && excerpt !== undefined) {
      const contentAdmission = classifyJarvisSource({
        path: source.uri ?? source.label,
        channel: candidate.explicitlyAttached ? 'explicit_attachment' : 'automatic_scan',
        kind: 'text',
        sizeBytes: new TextEncoder().encode(excerpt).byteLength,
        contentSample: excerpt,
        defaultSensitivity: source.sensitivity,
      });
      if (!contentAdmission.allowed) {
        exclusions.push(exclusion(source, contentAdmission.reason));
        continue;
      }
    }

    const body = candidate.authorizedBody ? (excerpt ?? '') : '';
    const remaining = input.maxChars - usedChars;
    const admittedBody = safeSliceByCodeUnitBudget(body, remaining);
    if (body.length > 0 && admittedBody.length === 0) {
      exclusions.push(exclusion(source, 'context_budget_exhausted'));
      continue;
    }

    const finiteScore = finiteRank(candidate.score);
    const item: JarvisContextItem = {
      source: copySource(source),
      purpose: admittedPurpose(candidate),
      excerpt: admittedBody,
      ...(Number.isFinite(finiteScore) ? { score: finiteScore } : {}),
      freshness: candidate.freshness ?? 'unknown',
      truncated: admittedBody.length < body.length,
    };
    items.push(item);
    admitted.push({ candidate, item });
    usedChars += admittedBody.length;
  }

  applyContextConflicts(admitted);
  const pack: JarvisContextPack = {
    items,
    budget: { maxChars: input.maxChars, usedChars },
    exclusions,
  };
  const validation = validateJarvisContextPack(pack);
  if (!validation.ok) {
    throw new JarvisContextPackError('contract_validation_failed');
  }
  return deepFreezeJarvisCopy(pack);
}
