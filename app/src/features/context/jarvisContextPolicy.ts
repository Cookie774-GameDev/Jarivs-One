import type { DeepReadonly } from './contracts';
import type { ContextRetrievalProvenance } from './contextRetrievalService';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,199}$/u;
const MAX_TIMESTAMP = 8_640_000_000_000_000;
const MAX_CANDIDATES = 500;
const MAX_HISTORY = 2_000;
const MAX_EVIDENCE = 100;
const NOTIFICATION_COOLDOWN_MS = 6 * 60 * 60 * 1_000;
const CORRECTION_CANDIDATES = new WeakSet<object>();
const CORRECTION_AUTHORITIES = new WeakSet<object>();
const CORRECTION_GRANTS = new WeakMap<
  object,
  {
    authority: object;
    candidate: object;
    destination: 'context_note' | 'entity_property';
    targetId: string;
    operationId: string;
  }
>();
const INSIGHT_AUTHORITIES = new WeakSet<object>();
const INSIGHT_EVIDENCE_RECEIPTS = new WeakMap<
  object,
  {
    authority: object;
    accountId: string;
    projectId: string;
    mapId: string;
    evidenceId: string;
    observedAt: number;
  }
>();
const INSIGHT_ATTESTATIONS = new WeakMap<
  object,
  { authority: object; candidate: ContextProactiveInsightCandidate }
>();
const CORRECTION_PLANS = new WeakMap<object, object>();

export const CONTEXT_PROACTIVE_INSIGHT_KINDS = [
  'notes_code_conflict',
  'stale_release_plan',
  'unresolved_high_severity_finding',
  'duplicated_implementation',
  'missing_test_coverage',
  'broken_link',
  'stale_github_map',
  'terminal_context_contradiction',
] as const;

export type ContextProactiveInsightKind = (typeof CONTEXT_PROACTIVE_INSIGHT_KINDS)[number];
export type ContextProactiveInsightSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ContextProactiveInsightCandidate {
  id: string;
  accountId: string;
  projectId: string;
  mapId: string;
  kind: ContextProactiveInsightKind;
  severity: ContextProactiveInsightSeverity;
  confidence: number;
  summary: string;
  evidenceIds: string[];
  dedupeKey: string;
  observedAt: number;
}

export interface ContextInsightNotificationHistory {
  accountId: string;
  projectId: string;
  mapId: string;
  dedupeKey: string;
  shownAt: number;
}

export interface ContextInsightEvidenceReceipt {
  version: 1;
  id: string;
}

export interface ContextInsightAttestation {
  version: 1;
  id: string;
}

export interface ContextInsightEvidenceAuthority {
  recordEvidence(input: {
    accountId: string;
    projectId: string;
    mapId: string;
    evidenceId: string;
    observedAt: number;
  }): DeepReadonly<ContextInsightEvidenceReceipt>;
  attestInsight(
    input: Omit<ContextProactiveInsightCandidate, 'evidenceIds'> & {
      evidenceReceipts: Array<DeepReadonly<ContextInsightEvidenceReceipt>>;
    },
  ): DeepReadonly<ContextInsightAttestation>;
}

export interface ContextProactiveInsightSelectionInput {
  authority: ContextInsightEvidenceAuthority;
  accountId: string;
  projectId: string;
  mapId: string;
  now: number;
  maxResults: number;
  attestations: Array<DeepReadonly<ContextInsightAttestation>>;
  notificationHistory: ContextInsightNotificationHistory[];
}

export type ContextJarvisPolicyErrorCode = 'invalid_input' | 'approval_required' | 'scope_mismatch';

export class ContextJarvisPolicyError extends Error {
  constructor(
    readonly code: ContextJarvisPolicyErrorCode,
    readonly detail?: string,
  ) {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'ContextJarvisPolicyError';
  }
}

function record(value: unknown): Record<string, unknown> | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    if (Reflect.ownKeys(value).some((key) => typeof key !== 'string')) return null;
    const output: Record<string, unknown> = Object.create(null);
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
      output[key] = descriptor.value;
    }
    return output;
  } catch {
    return null;
  }
}

function array(value: unknown, maximum: number): readonly unknown[] | null {
  try {
    if (!Array.isArray(value)) return null;
    const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
    if (
      !Number.isSafeInteger(length) ||
      length < 0 ||
      length > maximum ||
      Reflect.ownKeys(value).length !== length + 1
    ) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<
      string,
      PropertyDescriptor
    >;
    const output: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
      output.push(descriptor.value);
    }
    return output;
  } catch {
    return null;
  }
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function safeId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID.test(value);
}

function timestamp(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= MAX_TIMESTAMP
  );
}

function text(value: unknown, maximum: number, multiline = false): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u206f\ufeff]/u.test(
      value,
    ) &&
    (multiline || !/[\r\n\u2028\u2029]/u.test(value))
  );
}

function unit(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => deepFreeze(entry))) as DeepReadonly<T>;
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = deepFreeze(entry);
    }
    return Object.freeze(output) as DeepReadonly<T>;
  }
  return value as DeepReadonly<T>;
}

const SEVERITY_SCORE: Readonly<Record<ContextProactiveInsightSeverity, number>> = Object.freeze({
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
});

function insight(value: unknown, now: number): ContextProactiveInsightCandidate {
  const source = record(value);
  if (
    !source ||
    !exactKeys(source, [
      'id',
      'accountId',
      'projectId',
      'mapId',
      'kind',
      'severity',
      'confidence',
      'summary',
      'evidenceIds',
      'dedupeKey',
      'observedAt',
    ]) ||
    !safeId(source.id) ||
    !safeId(source.accountId) ||
    !safeId(source.projectId) ||
    !safeId(source.mapId) ||
    !CONTEXT_PROACTIVE_INSIGHT_KINDS.includes(source.kind as ContextProactiveInsightKind) ||
    !Object.hasOwn(SEVERITY_SCORE, source.severity as PropertyKey) ||
    !unit(source.confidence) ||
    !text(source.summary, 1_000) ||
    !safeId(source.dedupeKey) ||
    !timestamp(source.observedAt) ||
    source.observedAt > now
  ) {
    throw new ContextJarvisPolicyError('invalid_input', 'insight');
  }
  const evidence = array(source.evidenceIds, MAX_EVIDENCE);
  if (
    !evidence ||
    evidence.length === 0 ||
    evidence.some((evidenceId) => !safeId(evidenceId)) ||
    new Set(evidence).size !== evidence.length
  ) {
    throw new ContextJarvisPolicyError('invalid_input', 'insight_evidence');
  }
  return {
    id: source.id,
    accountId: source.accountId,
    projectId: source.projectId,
    mapId: source.mapId,
    kind: source.kind as ContextProactiveInsightKind,
    severity: source.severity as ContextProactiveInsightSeverity,
    confidence: source.confidence,
    summary: source.summary,
    evidenceIds: evidence as string[],
    dedupeKey: source.dedupeKey,
    observedAt: source.observedAt,
  };
}

/**
 * Host-owned evidence authority. Indexers/diagnostics record verified evidence,
 * then attest derived insight claims; model text never receives this authority.
 */
export function createContextInsightEvidenceAuthority(): ContextInsightEvidenceAuthority {
  let ordinal = 0;
  const authority: ContextInsightEvidenceAuthority = Object.freeze({
    recordEvidence(input: Parameters<ContextInsightEvidenceAuthority['recordEvidence']>[0]) {
      const root = record(input);
      if (
        !root ||
        !exactKeys(root, ['accountId', 'projectId', 'mapId', 'evidenceId', 'observedAt']) ||
        !safeId(root.accountId) ||
        !safeId(root.projectId) ||
        !safeId(root.mapId) ||
        !safeId(root.evidenceId) ||
        !timestamp(root.observedAt)
      ) {
        throw new ContextJarvisPolicyError('invalid_input', 'insight_evidence');
      }
      const receipt = Object.freeze({
        version: 1 as const,
        id: `context-evidence-${++ordinal}`,
      });
      INSIGHT_EVIDENCE_RECEIPTS.set(receipt, {
        authority: authority as object,
        accountId: root.accountId,
        projectId: root.projectId,
        mapId: root.mapId,
        evidenceId: root.evidenceId,
        observedAt: root.observedAt,
      });
      return receipt;
    },
    attestInsight(input: Parameters<ContextInsightEvidenceAuthority['attestInsight']>[0]) {
      const root = record(input);
      if (
        !root ||
        !exactKeys(root, [
          'id',
          'accountId',
          'projectId',
          'mapId',
          'kind',
          'severity',
          'confidence',
          'summary',
          'evidenceReceipts',
          'dedupeKey',
          'observedAt',
        ])
      ) {
        throw new ContextJarvisPolicyError('invalid_input', 'insight_attestation');
      }
      const receipts = array(root.evidenceReceipts, MAX_EVIDENCE);
      if (!receipts || receipts.length === 0) {
        throw new ContextJarvisPolicyError('invalid_input', 'insight_evidence');
      }
      const evidence = receipts.map((receipt) => {
        const proof =
          receipt && typeof receipt === 'object'
            ? INSIGHT_EVIDENCE_RECEIPTS.get(receipt as object)
            : undefined;
        if (
          !proof ||
          proof.authority !== authority ||
          proof.accountId !== root.accountId ||
          proof.projectId !== root.projectId ||
          proof.mapId !== root.mapId
        ) {
          throw new ContextJarvisPolicyError('scope_mismatch', 'insight_evidence');
        }
        return proof;
      });
      const candidate = insight(
        {
          id: root.id,
          accountId: root.accountId,
          projectId: root.projectId,
          mapId: root.mapId,
          kind: root.kind,
          severity: root.severity,
          confidence: root.confidence,
          summary: root.summary,
          evidenceIds: evidence.map(({ evidenceId }) => evidenceId),
          dedupeKey: root.dedupeKey,
          observedAt: root.observedAt,
        },
        MAX_TIMESTAMP,
      );
      if (evidence.some(({ observedAt }) => observedAt > candidate.observedAt)) {
        throw new ContextJarvisPolicyError('invalid_input', 'evidence_chronology');
      }
      const attestation = Object.freeze({
        version: 1 as const,
        id: `context-insight-${++ordinal}`,
      });
      INSIGHT_ATTESTATIONS.set(attestation, {
        authority: authority as object,
        candidate: deepFreeze(candidate) as ContextProactiveInsightCandidate,
      });
      return attestation;
    },
  });
  INSIGHT_AUTHORITIES.add(authority as object);
  return authority;
}

export function selectContextProactiveInsights(
  input: ContextProactiveInsightSelectionInput,
): readonly DeepReadonly<ContextProactiveInsightCandidate>[] {
  const root = record(input);
  if (
    !root ||
    !exactKeys(root, [
      'authority',
      'accountId',
      'projectId',
      'mapId',
      'now',
      'maxResults',
      'attestations',
      'notificationHistory',
    ]) ||
    !root.authority ||
    typeof root.authority !== 'object' ||
    !INSIGHT_AUTHORITIES.has(root.authority as object) ||
    !safeId(root.accountId) ||
    !safeId(root.projectId) ||
    !safeId(root.mapId) ||
    !timestamp(root.now) ||
    !Number.isSafeInteger(root.maxResults) ||
    (root.maxResults as number) < 1 ||
    (root.maxResults as number) > 10
  ) {
    throw new ContextJarvisPolicyError('invalid_input', 'selection');
  }
  const attestations = array(root.attestations, MAX_CANDIDATES);
  const history = array(root.notificationHistory, MAX_HISTORY);
  if (!attestations || !history) {
    throw new ContextJarvisPolicyError('invalid_input', 'collections');
  }
  const normalized = attestations.map((attestation) => {
    const evidence =
      attestation && typeof attestation === 'object'
        ? INSIGHT_ATTESTATIONS.get(attestation as object)
        : undefined;
    if (
      !evidence ||
      evidence.authority !== root.authority ||
      evidence.candidate.accountId !== root.accountId ||
      evidence.candidate.projectId !== root.projectId ||
      evidence.candidate.mapId !== root.mapId
    ) {
      throw new ContextJarvisPolicyError('scope_mismatch', 'insight_attestation');
    }
    if (evidence.candidate.observedAt > (root.now as number)) {
      throw new ContextJarvisPolicyError('invalid_input', 'insight_chronology');
    }
    return evidence.candidate;
  });
  if (new Set(normalized.map(({ id }) => id)).size !== normalized.length) {
    throw new ContextJarvisPolicyError('invalid_input', 'duplicate_insight');
  }
  const recent = new Set(
    history.map((entry) => {
      const row = record(entry);
      if (
        !row ||
        !exactKeys(row, ['accountId', 'projectId', 'mapId', 'dedupeKey', 'shownAt']) ||
        row.accountId !== root.accountId ||
        row.projectId !== root.projectId ||
        row.mapId !== root.mapId ||
        !safeId(row.dedupeKey) ||
        !timestamp(row.shownAt) ||
        row.shownAt > (root.now as number)
      ) {
        throw new ContextJarvisPolicyError('invalid_input', 'notification_history');
      }
      return (root.now as number) - row.shownAt < NOTIFICATION_COOLDOWN_MS ? row.dedupeKey : '';
    }),
  );
  const ranked = normalized
    .filter(
      (candidate) =>
        candidate.severity !== 'low' &&
        (candidate.severity !== 'medium' || candidate.confidence >= 0.8) &&
        (candidate.severity !== 'high' || candidate.confidence >= 0.6) &&
        !recent.has(candidate.dedupeKey),
    )
    .sort(
      (left, right) =>
        SEVERITY_SCORE[right.severity] - SEVERITY_SCORE[left.severity] ||
        right.confidence - left.confidence ||
        right.observedAt - left.observedAt ||
        left.id.localeCompare(right.id, 'en-US'),
    );
  const uniqueByDedupe = new Map<string, ContextProactiveInsightCandidate>();
  for (const candidate of ranked) {
    if (!uniqueByDedupe.has(candidate.dedupeKey)) {
      uniqueByDedupe.set(candidate.dedupeKey, candidate);
    }
  }
  return deepFreeze([...uniqueByDedupe.values()].slice(0, root.maxResults as number));
}

export type ContextJarvisActionRisk = 'read_only' | 'session_write' | 'durable_write';
export type ContextJarvisActionApproval = 'never' | 'depends_on_input' | 'always';

export interface ContextJarvisActionDefinition {
  id:
    | 'context.search'
    | 'context.open'
    | 'context.attach'
    | 'context.create_note'
    | 'context.update_note'
    | 'context.link_notes'
    | 'context.create_view'
    | 'context.refresh_map'
    | 'context.create_daily_note'
    | 'context.add_daily_entry'
    | 'context.suggest_links'
    | 'context.resolve_broken_link'
    | 'context.pin_entity'
    | 'context.create_from_github';
  mutates: boolean;
  risk: ContextJarvisActionRisk;
  approval: ContextJarvisActionApproval;
  expectedEffect: string;
}

const readAction = (
  id: ContextJarvisActionDefinition['id'],
  expectedEffect: string,
): ContextJarvisActionDefinition => ({
  id,
  mutates: false,
  risk: 'read_only',
  approval: 'never',
  expectedEffect,
});

const writeAction = (
  id: ContextJarvisActionDefinition['id'],
  expectedEffect: string,
  risk: 'session_write' | 'durable_write' = 'durable_write',
): ContextJarvisActionDefinition => ({
  id,
  mutates: true,
  risk,
  approval: risk === 'session_write' ? 'depends_on_input' : 'always',
  expectedEffect,
});

export const CONTEXT_JARVIS_ACTIONS = deepFreeze<ContextJarvisActionDefinition[]>([
  readAction('context.search', 'Reads bounded Context search results.'),
  readAction('context.open', 'Opens or highlights one Context source.'),
  writeAction(
    'context.attach',
    'Attaches selected Context to the active request.',
    'session_write',
  ),
  writeAction('context.create_note', 'Creates one Context Note.'),
  writeAction('context.update_note', 'Appends an approved Context Note revision.'),
  writeAction('context.link_notes', 'Creates approved links between Context Notes.'),
  writeAction('context.create_view', 'Creates one saved Context View.'),
  writeAction('context.refresh_map', 'Refreshes the selected Context Map index.'),
  writeAction('context.create_daily_note', 'Creates one daily Context Note.'),
  writeAction('context.add_daily_entry', 'Appends one approved daily Context entry.'),
  readAction('context.suggest_links', 'Returns evidence-backed link suggestions without mutation.'),
  writeAction('context.resolve_broken_link', 'Repairs one approved broken Context link.'),
  writeAction('context.pin_entity', 'Pins one Context entity.'),
  writeAction('context.create_from_github', 'Creates Context from an approved GitHub source.'),
]);

export interface ContextCorrectionSource {
  sourceId: string;
  label: string;
  excerpt: string;
  provenance: ContextRetrievalProvenance;
}

export interface ContextCorrectionCandidate {
  version: 1;
  id: string;
  accountId: string;
  projectId: string;
  mapId: string;
  correction: string;
  conflictingSources: ContextCorrectionSource[];
  question: 'Where should I store this durable correction?';
  destinations: ['context_note', 'entity_property', 'do_not_store'];
  state: 'awaiting_storage_choice';
  preserveOriginalProvenance: true;
  recordedAt: number;
}

export interface ContextCorrectionApprovalGrant {
  version: 1;
  id: string;
}

export interface ContextCorrectionApprovalAuthority {
  approve(input: {
    candidate: DeepReadonly<ContextCorrectionCandidate>;
    destination: 'context_note' | 'entity_property';
    targetId: string;
  }): DeepReadonly<ContextCorrectionApprovalGrant>;
}

function provenance(value: unknown): ContextRetrievalProvenance {
  const source = record(value);
  if (
    !source ||
    Object.keys(source).some(
      (key) =>
        !['sourceRevision', 'indexedAt', 'githubRef', 'githubSha', 'terminalSessionId'].includes(
          key,
        ),
    ) ||
    !Object.hasOwn(source, 'sourceRevision') ||
    !Object.hasOwn(source, 'indexedAt') ||
    !text(source.sourceRevision, 512) ||
    !timestamp(source.indexedAt) ||
    (source.githubRef !== undefined && !text(source.githubRef, 512)) ||
    (source.githubSha !== undefined &&
      (typeof source.githubSha !== 'string' || !/^[a-f0-9]{40,64}$/u.test(source.githubSha))) ||
    (source.terminalSessionId !== undefined && !safeId(source.terminalSessionId))
  ) {
    throw new ContextJarvisPolicyError('invalid_input', 'provenance');
  }
  return {
    sourceRevision: source.sourceRevision,
    indexedAt: source.indexedAt,
    ...(source.githubRef === undefined ? {} : { githubRef: source.githubRef as string }),
    ...(source.githubSha === undefined ? {} : { githubSha: source.githubSha as string }),
    ...(source.terminalSessionId === undefined
      ? {}
      : { terminalSessionId: source.terminalSessionId }),
  };
}

export function createContextCorrectionCandidate(input: {
  id: string;
  accountId: string;
  projectId: string;
  mapId: string;
  correction: string;
  conflictingSources: ContextCorrectionSource[];
  recordedAt: number;
}): DeepReadonly<ContextCorrectionCandidate> {
  const root = record(input);
  if (
    !root ||
    !exactKeys(root, [
      'id',
      'accountId',
      'projectId',
      'mapId',
      'correction',
      'conflictingSources',
      'recordedAt',
    ]) ||
    !safeId(root.id) ||
    !safeId(root.accountId) ||
    !safeId(root.projectId) ||
    !safeId(root.mapId) ||
    !text(root.correction, 8_192, true) ||
    !timestamp(root.recordedAt)
  ) {
    throw new ContextJarvisPolicyError('invalid_input', 'correction');
  }
  const sources = array(root.conflictingSources, 20);
  if (!sources || sources.length < 2) {
    throw new ContextJarvisPolicyError('invalid_input', 'conflicting_sources');
  }
  const normalizedSources = sources
    .map((value) => {
      const source = record(value);
      if (
        !source ||
        !exactKeys(source, ['sourceId', 'label', 'excerpt', 'provenance']) ||
        !safeId(source.sourceId) ||
        !text(source.label, 500) ||
        !text(source.excerpt, 8_192, true)
      ) {
        throw new ContextJarvisPolicyError('invalid_input', 'conflicting_source');
      }
      return {
        sourceId: source.sourceId,
        label: source.label,
        excerpt: source.excerpt,
        provenance: provenance(source.provenance),
      };
    })
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId, 'en-US'));
  if (
    new Set(normalizedSources.map(({ sourceId }) => sourceId)).size !== normalizedSources.length
  ) {
    throw new ContextJarvisPolicyError('invalid_input', 'duplicate_source');
  }
  if (
    normalizedSources.some(
      ({ provenance: sourceProvenance }) =>
        sourceProvenance.indexedAt > (root.recordedAt as number),
    )
  ) {
    throw new ContextJarvisPolicyError('invalid_input', 'provenance_chronology');
  }
  const candidate = deepFreeze({
    version: 1 as const,
    id: root.id,
    accountId: root.accountId,
    projectId: root.projectId,
    mapId: root.mapId,
    correction: root.correction,
    conflictingSources: normalizedSources,
    question: 'Where should I store this durable correction?' as const,
    destinations: ['context_note', 'entity_property', 'do_not_store'] as [
      'context_note',
      'entity_property',
      'do_not_store',
    ],
    state: 'awaiting_storage_choice' as const,
    preserveOriginalProvenance: true as const,
    recordedAt: root.recordedAt,
  });
  CORRECTION_CANDIDATES.add(candidate as object);
  return candidate;
}

export function createContextCorrectionApprovalAuthority(): ContextCorrectionApprovalAuthority {
  let ordinal = 0;
  const authority: ContextCorrectionApprovalAuthority = Object.freeze({
    approve(
      input: Parameters<ContextCorrectionApprovalAuthority['approve']>[0],
    ): DeepReadonly<ContextCorrectionApprovalGrant> {
      const root = record(input);
      if (
        !root ||
        !exactKeys(root, ['candidate', 'destination', 'targetId']) ||
        !root.candidate ||
        typeof root.candidate !== 'object' ||
        !CORRECTION_CANDIDATES.has(root.candidate as object) ||
        !['context_note', 'entity_property'].includes(root.destination as string) ||
        !safeId(root.targetId)
      ) {
        throw new ContextJarvisPolicyError('invalid_input', 'approval');
      }
      const grant = Object.freeze({
        version: 1 as const,
        id: `context-correction-approval-${++ordinal}`,
      });
      CORRECTION_GRANTS.set(grant, {
        authority: authority as object,
        candidate: root.candidate as object,
        destination: root.destination as 'context_note' | 'entity_property',
        targetId: root.targetId,
        operationId: grant.id,
      });
      return grant;
    },
  });
  CORRECTION_AUTHORITIES.add(authority as object);
  return authority;
}

export function planContextCorrectionPersistence(input: {
  candidate: DeepReadonly<ContextCorrectionCandidate>;
  destination: 'context_note' | 'entity_property' | 'do_not_store';
  targetId?: string;
  approvalGrant?: DeepReadonly<ContextCorrectionApprovalGrant>;
}): DeepReadonly<{
  version: 1;
  candidateId: string;
  operation: 'none' | 'append_context_note_revision' | 'update_entity_property';
  operationId: string | null;
  targetId: string | null;
  preserveOriginalProvenance: true;
  rewriteSourceCodeOrDocumentation: false;
  originalProvenance: Array<{
    sourceId: string;
    provenance: ContextRetrievalProvenance;
  }>;
}> {
  const root = record(input);
  if (
    !root ||
    Object.keys(root).some(
      (key) => !['candidate', 'destination', 'targetId', 'approvalGrant'].includes(key),
    ) ||
    !Object.hasOwn(root, 'candidate') ||
    !Object.hasOwn(root, 'destination') ||
    !['context_note', 'entity_property', 'do_not_store'].includes(root.destination as string) ||
    !root.candidate ||
    typeof root.candidate !== 'object' ||
    !CORRECTION_CANDIDATES.has(root.candidate as object)
  ) {
    throw new ContextJarvisPolicyError('invalid_input', 'persistence');
  }
  const candidate = root.candidate as DeepReadonly<ContextCorrectionCandidate>;
  const originalProvenance = candidate.conflictingSources.map((source) => ({
    sourceId: source.sourceId,
    provenance: { ...source.provenance },
  }));
  if (root.destination === 'do_not_store') {
    if (root.targetId !== undefined || root.approvalGrant !== undefined) {
      throw new ContextJarvisPolicyError('invalid_input', 'do_not_store');
    }
    return deepFreeze({
      version: 1 as const,
      candidateId: candidate.id,
      operation: 'none' as const,
      operationId: null,
      targetId: null,
      preserveOriginalProvenance: true as const,
      rewriteSourceCodeOrDocumentation: false as const,
      originalProvenance,
    });
  }
  if (!safeId(root.targetId)) {
    throw new ContextJarvisPolicyError('invalid_input', 'target');
  }
  const grant =
    root.approvalGrant && typeof root.approvalGrant === 'object'
      ? CORRECTION_GRANTS.get(root.approvalGrant as object)
      : undefined;
  if (
    !grant ||
    !CORRECTION_AUTHORITIES.has(grant.authority) ||
    grant.candidate !== candidate ||
    grant.destination !== root.destination ||
    grant.targetId !== root.targetId
  ) {
    throw new ContextJarvisPolicyError('approval_required');
  }
  const priorPlan = CORRECTION_PLANS.get(root.approvalGrant as object);
  if (priorPlan) {
    return priorPlan as DeepReadonly<{
      version: 1;
      candidateId: string;
      operation: 'none' | 'append_context_note_revision' | 'update_entity_property';
      operationId: string | null;
      targetId: string | null;
      preserveOriginalProvenance: true;
      rewriteSourceCodeOrDocumentation: false;
      originalProvenance: Array<{
        sourceId: string;
        provenance: ContextRetrievalProvenance;
      }>;
    }>;
  }
  const plan = deepFreeze({
    version: 1 as const,
    candidateId: candidate.id,
    operation:
      root.destination === 'context_note'
        ? ('append_context_note_revision' as const)
        : ('update_entity_property' as const),
    operationId: grant.operationId,
    targetId: root.targetId,
    preserveOriginalProvenance: true as const,
    rewriteSourceCodeOrDocumentation: false as const,
    originalProvenance,
  });
  CORRECTION_PLANS.set(root.approvalGrant as object, plan as object);
  return plan;
}
