import type {
  JarvisEvent,
  JarvisExecutionJournal,
  JarvisRun,
} from '@/lib/jarvis/contracts/execution';
import type { JarvisEventRepository } from '@/lib/db/jarvisRepositories';
import type { CaoTargetKind, CaoTargetLeaseV1 } from '@/lib/jarvis/contracts/execution';
import { validateCaoTargetLease } from '@/lib/jarvis/contracts/validators';

export const CAO_TARGET_LEASE_MAX_MS = 60_000 as const;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ACQUIRE_INPUT_KEYS = new Set([
  'accountId',
  'workspaceId',
  'projectId',
  'runId',
  'selection',
  'leaseMs',
]);
const VERIFY_INPUT_KEYS = new Set(['accountId', 'workspaceId', 'projectId', 'runId', 'leaseId']);
const SELECTION_KEYS = new Set(['mode', 'targets']);
const TARGET_IDENTITY_KEYS = new Set(['kind', 'targetId']);
const APPLIED_CLAIM_KEYS = new Set(['applied', 'targets']);
const REJECTED_CLAIM_KEYS = new Set(['applied', 'reason']);
const LIVE_TARGET_KEYS = new Set([
  'kind',
  'targetId',
  'accountId',
  'workspaceId',
  'projectId',
  'revision',
  'selected',
  'locked',
  'ownerLeaseId',
]);
const REGISTRY_REJECTION_REASONS = new Set<string>([
  'missing',
  'scope_mismatch',
  'unselected',
  'locked',
  'owned',
  'revision_conflict',
]);
const EVENT_PAGE_SIZE = 500;
const MAX_EVENT_PAGES = 20;
const ACTIVE_RUN_STATUSES = new Set<JarvisRun['status']>([
  'queued',
  'compiling',
  'running',
  'awaiting_approval',
]);

export type CaoTargetIdentity = Readonly<{ kind: CaoTargetKind; targetId: string }>;

export type CaoLiveTarget = Readonly<{
  kind: CaoTargetKind;
  targetId: string;
  accountId: string;
  workspaceId: string;
  projectId: string;
  revision: number;
  selected: boolean;
  locked: boolean;
  ownerLeaseId?: string | undefined;
}>;

type RegistryRequest = Readonly<{
  accountId: string;
  workspaceId: string;
  projectId: string;
  runId: string;
  leaseId: string;
  expiresAt: number;
  targets: readonly CaoTargetIdentity[];
}>;

export interface CaoTargetRegistry {
  claimExact(input: RegistryRequest): Promise<
    | { applied: true; targets: readonly CaoLiveTarget[] }
    | {
        applied: false;
        reason:
          'missing' | 'scope_mismatch' | 'unselected' | 'locked' | 'owned' | 'revision_conflict';
      }
  >;
  readExact(input: Omit<RegistryRequest, 'expiresAt'>): Promise<readonly CaoLiveTarget[]>;
  releaseExact(input: Omit<RegistryRequest, 'expiresAt'>): Promise<void>;
}

type ExplicitSelection = Readonly<{
  mode: 'explicit_single' | 'explicit_set';
  targets: readonly CaoTargetIdentity[];
}>;

type LeaseScope = Readonly<{
  accountId: string;
  workspaceId: string;
  projectId: string;
  runId: string;
}>;

type AcquireInput = LeaseScope &
  Readonly<{
    selection: ExplicitSelection;
    leaseMs: number;
  }>;

type VerifyInput = LeaseScope & Readonly<{ leaseId: string }>;

type Dependencies = Readonly<{
  runs: Pick<JarvisExecutionJournal, 'getRun'>;
  journal: Pick<JarvisExecutionJournal, 'appendEvent'>;
  events: Pick<JarvisEventRepository, 'listByRun'>;
  registry: CaoTargetRegistry;
  now: () => number;
  newLeaseId: () => string;
}>;

function fail(code: string): never {
  throw new Error(code);
}

function validIdentifier(value: unknown): value is string {
  return typeof value === 'string' && OPAQUE_ID.test(value);
}

function hasExactKeys(value: unknown, keys: ReadonlySet<string>): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.size && actual.every((key) => keys.has(key));
}

function hasOnlyKnownKeys(value: unknown, keys: ReadonlySet<string>): boolean {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => keys.has(key))
  );
}

function assertScope(scope: LeaseScope): void {
  if (
    !validIdentifier(scope.accountId) ||
    !validIdentifier(scope.workspaceId) ||
    !validIdentifier(scope.projectId) ||
    !validIdentifier(scope.runId)
  ) {
    fail('cao_target_scope_invalid');
  }
}

function assertRunIdentity(
  run: JarvisRun | undefined,
  scope: LeaseScope,
): asserts run is JarvisRun {
  if (!run) fail('cao_run_missing');
  if (run.id !== scope.runId) fail('cao_run_not_authorized');
  if (
    run.accountId !== scope.accountId ||
    run.workspaceId !== scope.workspaceId ||
    run.projectId !== scope.projectId
  ) {
    fail('cao_run_scope_mismatch');
  }
  if (run.agentId !== 'jarvis-cao') fail('cao_run_not_authorized');
}

function assertRun(run: JarvisRun | undefined, scope: LeaseScope): asserts run is JarvisRun {
  assertRunIdentity(run, scope);
  if (!ACTIVE_RUN_STATUSES.has(run.status)) fail('cao_run_inactive');
}

function assertSelection(
  selection: ExplicitSelection | undefined,
): asserts selection is ExplicitSelection {
  if (!selection) fail('cao_target_selection_required');
  if (
    !hasExactKeys(selection, SELECTION_KEYS) ||
    (selection.mode !== 'explicit_single' && selection.mode !== 'explicit_set') ||
    !Array.isArray(selection.targets) ||
    selection.targets.length === 0 ||
    selection.targets.length > 32 ||
    (selection.mode === 'explicit_single' && selection.targets.length !== 1)
  ) {
    fail('cao_target_selection_invalid');
  }
  const identities = new Set<string>();
  for (const target of selection.targets) {
    if (
      !hasExactKeys(target, TARGET_IDENTITY_KEYS) ||
      (target.kind !== 'chat' && target.kind !== 'terminal') ||
      !validIdentifier(target.targetId)
    ) {
      fail('cao_target_selection_invalid');
    }
    const identity = `${target.kind}\u0000${target.targetId}`;
    if (identities.has(identity)) fail('cao_target_selection_invalid');
    identities.add(identity);
  }
}

function registryFailure(reason: string): never {
  const code = {
    missing: 'cao_target_missing',
    scope_mismatch: 'cao_target_scope_mismatch',
    unselected: 'cao_target_unselected',
    locked: 'cao_target_locked',
    owned: 'cao_target_lease_conflict',
    revision_conflict: 'cao_target_revision_stale',
  }[reason];
  fail(code ?? 'cao_target_registry_rejected');
}

function validRegistryClaim(
  value: unknown,
): value is Awaited<ReturnType<CaoTargetRegistry['claimExact']>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const claim = value as { applied?: unknown; targets?: unknown; reason?: unknown };
  if (claim.applied === true) {
    return hasExactKeys(value, APPLIED_CLAIM_KEYS) && validLiveTargetArray(claim.targets);
  }
  return (
    claim.applied === false &&
    hasExactKeys(value, REJECTED_CLAIM_KEYS) &&
    typeof claim.reason === 'string' &&
    REGISTRY_REJECTION_REASONS.has(claim.reason)
  );
}

function validDependencyEntry(value: unknown): value is object {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validLiveTargetRow(value: unknown): value is CaoLiveTarget {
  if (!validDependencyEntry(value) || !hasOnlyKnownKeys(value, LIVE_TARGET_KEYS)) return false;
  const row = value as Partial<CaoLiveTarget>;
  return (
    (row.kind === 'chat' || row.kind === 'terminal') &&
    validIdentifier(row.targetId) &&
    validIdentifier(row.accountId) &&
    validIdentifier(row.workspaceId) &&
    validIdentifier(row.projectId) &&
    Number.isSafeInteger(row.revision) &&
    (row.revision ?? -1) >= 0 &&
    typeof row.selected === 'boolean' &&
    typeof row.locked === 'boolean' &&
    (row.ownerLeaseId === undefined || validIdentifier(row.ownerLeaseId))
  );
}

function validLiveTargetArray(value: unknown): value is readonly CaoLiveTarget[] {
  if (!Array.isArray(value) || value.length > 32) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!validLiveTargetRow(value[index])) return false;
  }
  return true;
}

function validRunSnapshot(value: unknown): value is JarvisRun {
  if (!validDependencyEntry(value)) return false;
  const run = value as Partial<JarvisRun>;
  return (
    validIdentifier(run.id) &&
    validIdentifier(run.accountId) &&
    validIdentifier(run.agentId) &&
    typeof run.status === 'string'
  );
}

function canonicalDependencyValue<T>(value: T): T | undefined {
  try {
    return structuredClone(value);
  } catch {
    return undefined;
  }
}

function assertLiveTargets(
  rows: readonly CaoLiveTarget[],
  requested: readonly CaoTargetIdentity[],
  scope: LeaseScope,
  leaseId: string,
  expectedRevisions?: readonly number[],
): readonly CaoLiveTarget[] {
  if (rows.length !== requested.length) fail('cao_target_missing');
  const byIdentity = new Map<string, CaoLiveTarget>();
  for (const row of rows) {
    const identity = `${row.kind}\u0000${row.targetId}`;
    if (byIdentity.has(identity)) fail('cao_target_identity_mismatch');
    byIdentity.set(identity, row);
  }
  const ordered = requested.map((target) => {
    const row = byIdentity.get(`${target.kind}\u0000${target.targetId}`);
    if (!row) fail('cao_target_identity_mismatch');
    return row;
  });
  for (let index = 0; index < requested.length; index += 1) {
    const row = ordered[index];
    const target = requested[index];
    if (!row || !target || row.kind !== target.kind || row.targetId !== target.targetId) {
      fail('cao_target_identity_mismatch');
    }
    if (
      row.accountId !== scope.accountId ||
      row.workspaceId !== scope.workspaceId ||
      row.projectId !== scope.projectId
    ) {
      fail('cao_target_scope_mismatch');
    }
    if (!row.selected) fail('cao_target_unselected');
    if (row.locked) fail('cao_target_locked');
    if (row.ownerLeaseId !== leaseId) fail('cao_target_lease_conflict');
    if (!Number.isSafeInteger(row.revision) || row.revision < 0)
      fail('cao_target_revision_invalid');
    if (expectedRevisions && row.revision !== expectedRevisions[index]) {
      fail('cao_target_revision_stale');
    }
  }
  return ordered;
}

function releaseRequest(scope: LeaseScope, lease: CaoTargetLeaseV1) {
  return {
    accountId: scope.accountId,
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    runId: scope.runId,
    leaseId: lease.leaseId,
    targets: lease.targets.map(({ kind, targetId }) => ({ kind, targetId })),
  };
}

function verifyRequest(scope: LeaseScope, leaseId: string): VerifyInput {
  return {
    accountId: scope.accountId,
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    runId: scope.runId,
    leaseId,
  };
}

async function findLease(
  events: Pick<JarvisEventRepository, 'listByRun'>,
  scope: LeaseScope,
  leaseId: string,
): Promise<CaoTargetLeaseV1 | undefined> {
  let afterSeq = 0;
  let match: CaoTargetLeaseV1 | undefined;
  for (let pageNumber = 0; pageNumber < MAX_EVENT_PAGES; pageNumber += 1) {
    let page: readonly JarvisEvent[];
    try {
      page = await events.listByRun(scope.accountId, scope.runId, {
        afterSeq,
        limit: EVENT_PAGE_SIZE,
      });
    } catch {
      fail('cao_target_journal_unavailable');
    }
    const canonicalPage = canonicalDependencyValue(page);
    if (!Array.isArray(canonicalPage) || canonicalPage.length > EVENT_PAGE_SIZE) {
      fail('cao_target_journal_invalid');
    }
    for (let index = 0; index < canonicalPage.length; index += 1) {
      const candidate = canonicalPage[index];
      if (!validDependencyEntry(candidate)) fail('cao_target_journal_invalid');
      const event = candidate as JarvisEvent;
      if (
        event.runId !== scope.runId ||
        !Number.isSafeInteger(event.seq) ||
        event.seq <= afterSeq
      ) {
        fail('cao_target_journal_invalid');
      }
      afterSeq = event.seq;
      if (!event.caoTargetLease) continue;
      const validated = validateCaoTargetLease(event.caoTargetLease);
      if (!validated.ok) fail('cao_target_journal_invalid');
      const lease = validated.value;
      if (
        lease.runId !== event.runId ||
        event.type !== 'context' ||
        event.idempotencyKey !== `cao-target-lease:${lease.leaseId}` ||
        !Number.isSafeInteger(event.createdAt) ||
        event.createdAt !== lease.acquiredAt
      ) {
        fail('cao_target_journal_invalid');
      }
      if (lease.leaseId === leaseId) {
        if (match) fail('cao_target_journal_invalid');
        match = structuredClone(lease);
      }
    }
    if (canonicalPage.length < EVENT_PAGE_SIZE) return match;
  }
  fail('cao_target_journal_scan_exceeded');
}

function exactLeaseScope(lease: CaoTargetLeaseV1, scope: LeaseScope): void {
  if (
    lease.accountId !== scope.accountId ||
    lease.workspaceId !== scope.workspaceId ||
    lease.projectId !== scope.projectId ||
    lease.runId !== scope.runId
  ) {
    fail('cao_target_lease_scope_mismatch');
  }
}

function acknowledgesExactLease(
  event: JarvisEvent,
  scope: LeaseScope,
  expected: CaoTargetLeaseV1,
): boolean {
  if (
    event.runId !== scope.runId ||
    !Number.isSafeInteger(event.seq) ||
    event.seq <= 0 ||
    event.idempotencyKey !== `cao-target-lease:${expected.leaseId}` ||
    !event.caoTargetLease
  ) {
    return false;
  }
  const validated = validateCaoTargetLease(event.caoTargetLease);
  if (!validated.ok) return false;
  const actual = validated.value;
  return (
    actual.leaseId === expected.leaseId &&
    actual.accountId === expected.accountId &&
    actual.workspaceId === expected.workspaceId &&
    actual.projectId === expected.projectId &&
    actual.runId === expected.runId &&
    actual.selectionMode === expected.selectionMode &&
    actual.acquiredAt === expected.acquiredAt &&
    actual.expiresAt === expected.expiresAt &&
    actual.targets.length === expected.targets.length &&
    actual.targets.every((target, index) => {
      const expectedTarget = expected.targets[index];
      return (
        expectedTarget !== undefined &&
        target.kind === expectedTarget.kind &&
        target.targetId === expectedTarget.targetId &&
        target.revision === expectedTarget.revision
      );
    })
  );
}

export function createCaoTargetAuthority(dependencies: Dependencies) {
  async function readRun(accountId: string, runId: string): Promise<JarvisRun | undefined> {
    try {
      const observed = await dependencies.runs.getRun(accountId, runId);
      if (observed === undefined) return undefined;
      const canonical = canonicalDependencyValue(observed);
      if (!validRunSnapshot(canonical)) fail('cao_run_unavailable');
      return canonical;
    } catch {
      fail('cao_run_unavailable');
    }
  }

  function readNow(): number {
    try {
      return dependencies.now();
    } catch {
      fail('cao_target_clock_invalid');
    }
  }

  function createLeaseId(): string {
    try {
      return dependencies.newLeaseId();
    } catch {
      fail('cao_target_lease_id_invalid');
    }
  }

  async function readReleaseState(
    input: VerifyInput,
    lease: CaoTargetLeaseV1,
  ): Promise<'owned' | 'partially_released' | 'released'> {
    const request = releaseRequest(input, lease);
    let rows: readonly CaoLiveTarget[];
    try {
      rows = await dependencies.registry.readExact(request);
    } catch {
      fail('cao_target_registry_unavailable');
    }
    const canonicalRows = canonicalDependencyValue(rows);
    if (!validLiveTargetArray(canonicalRows)) {
      fail('cao_target_registry_invalid');
    }
    rows = canonicalRows;
    if (rows.length !== lease.targets.length) fail('cao_target_missing');
    const byIdentity = new Map<string, CaoLiveTarget>();
    for (const row of rows) {
      const identity = `${row.kind}\u0000${row.targetId}`;
      if (byIdentity.has(identity)) fail('cao_target_identity_mismatch');
      byIdentity.set(identity, row);
    }
    let owned = 0;
    let released = 0;
    for (let index = 0; index < lease.targets.length; index += 1) {
      const expected = lease.targets[index];
      const row = expected && byIdentity.get(`${expected.kind}\u0000${expected.targetId}`);
      if (!expected || !row) fail('cao_target_identity_mismatch');
      if (
        row.accountId !== input.accountId ||
        row.workspaceId !== input.workspaceId ||
        row.projectId !== input.projectId
      ) {
        fail('cao_target_scope_mismatch');
      }
      if (row.ownerLeaseId === lease.leaseId) owned += 1;
      else if (row.ownerLeaseId === undefined) released += 1;
      else fail('cao_target_lease_conflict');
    }
    if (released === rows.length) return 'released';
    if (owned === rows.length) return 'owned';
    if (owned + released === rows.length) return 'partially_released';
    fail('cao_target_lease_conflict');
  }

  async function releaseVerifiedLease(input: VerifyInput, lease: CaoTargetLeaseV1): Promise<void> {
    if ((await readReleaseState(input, lease)) === 'released') return;
    try {
      await dependencies.registry.releaseExact(releaseRequest(input, lease));
    } catch {
      // A transport failure can be ambiguous; exact live ownership is authoritative below.
    }
    if ((await readReleaseState(input, lease)) !== 'released') {
      fail('cao_target_registry_unavailable');
    }
  }

  async function verify(input: VerifyInput): Promise<CaoTargetLeaseV1> {
    if (!hasExactKeys(input, VERIFY_INPUT_KEYS)) fail('cao_target_input_invalid');
    assertScope(input);
    if (!validIdentifier(input.leaseId)) fail('cao_target_lease_id_invalid');
    const run = await readRun(input.accountId, input.runId);
    const lease = await findLease(dependencies.events, input, input.leaseId);
    if (!lease) fail('cao_target_lease_missing');
    exactLeaseScope(lease, input);
    if (!run) {
      await releaseVerifiedLease(input, lease);
      fail('cao_run_missing');
    }
    try {
      assertRunIdentity(run, input);
    } catch (error) {
      await releaseVerifiedLease(input, lease);
      throw error;
    }
    if (!ACTIVE_RUN_STATUSES.has(run.status)) {
      await releaseVerifiedLease(input, lease);
      fail('cao_run_inactive');
    }
    const observedAt = readNow();
    if (!Number.isSafeInteger(observedAt) || observedAt < lease.acquiredAt) {
      fail('cao_target_clock_invalid');
    }
    if (observedAt >= lease.expiresAt) {
      await releaseVerifiedLease(input, lease);
      fail('cao_target_lease_stale');
    }
    const targets = lease.targets.map(({ kind, targetId }) => ({ kind, targetId }));
    let liveRows: readonly CaoLiveTarget[];
    try {
      liveRows = await dependencies.registry.readExact({
        ...input,
        leaseId: lease.leaseId,
        targets,
      });
    } catch {
      fail('cao_target_registry_unavailable');
    }
    const canonicalRows = canonicalDependencyValue(liveRows);
    if (!validLiveTargetArray(canonicalRows)) {
      fail('cao_target_registry_invalid');
    }
    liveRows = canonicalRows;
    try {
      assertLiveTargets(
        liveRows,
        targets,
        input,
        lease.leaseId,
        lease.targets.map(({ revision }) => revision),
      );
    } catch (error) {
      await releaseVerifiedLease(input, lease);
      throw error;
    }
    try {
      const currentRun = await readRun(input.accountId, input.runId);
      assertRun(currentRun, input);
    } catch (error) {
      await releaseVerifiedLease(input, lease);
      throw error;
    }
    const returnAt = readNow();
    if (!Number.isSafeInteger(returnAt) || returnAt < observedAt) {
      await releaseVerifiedLease(input, lease);
      fail('cao_target_clock_invalid');
    }
    if (returnAt >= lease.expiresAt) {
      await releaseVerifiedLease(input, lease);
      fail('cao_target_lease_stale');
    }
    return structuredClone(lease);
  }

  async function verifyAcquiredLease(
    input: AcquireInput,
    lease: CaoTargetLeaseV1,
  ): Promise<CaoTargetLeaseV1> {
    try {
      return await verify(verifyRequest(input, lease.leaseId));
    } catch (error) {
      await releaseVerifiedLease(verifyRequest(input, lease.leaseId), lease);
      throw error;
    }
  }

  async function acquire(input: AcquireInput): Promise<CaoTargetLeaseV1> {
    if (!hasOnlyKnownKeys(input, ACQUIRE_INPUT_KEYS)) fail('cao_target_input_invalid');
    assertScope(input);
    assertSelection(input.selection);
    if (
      !Number.isSafeInteger(input.leaseMs) ||
      input.leaseMs <= 0 ||
      input.leaseMs > CAO_TARGET_LEASE_MAX_MS
    ) {
      fail('cao_target_lease_duration_invalid');
    }
    const run = await readRun(input.accountId, input.runId);
    assertRun(run, input);
    const acquiredAt = readNow();
    if (!Number.isSafeInteger(acquiredAt) || acquiredAt < 0) fail('cao_target_clock_invalid');
    const leaseId = createLeaseId();
    if (!validIdentifier(leaseId)) fail('cao_target_lease_id_invalid');
    const requested = input.selection.targets.map(({ kind, targetId }) => ({ kind, targetId }));
    const expiresAt = acquiredAt + input.leaseMs;
    if (!Number.isSafeInteger(expiresAt)) fail('cao_target_clock_invalid');
    const registryRequest: RegistryRequest = {
      accountId: input.accountId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      runId: input.runId,
      leaseId,
      expiresAt,
      targets: requested,
    };
    let claim: Awaited<ReturnType<CaoTargetRegistry['claimExact']>>;
    try {
      claim = await dependencies.registry.claimExact(registryRequest);
    } catch {
      fail('cao_target_registry_unavailable');
    }
    const canonicalClaim = canonicalDependencyValue(claim);
    const provisionalLease: CaoTargetLeaseV1 = {
      schemaVersion: 1,
      kind: 'cao_target_lease',
      leaseId,
      accountId: input.accountId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      runId: input.runId,
      selectionMode: input.selection.mode,
      targets: requested.map(({ kind, targetId }) => ({ kind, targetId, revision: 0 })),
      acquiredAt,
      expiresAt,
    };
    if (!validRegistryClaim(canonicalClaim)) {
      await releaseVerifiedLease(verifyRequest(input, leaseId), provisionalLease);
      fail('cao_target_registry_invalid');
    }
    claim = canonicalClaim;
    if (!claim.applied) registryFailure(claim.reason);
    let exactClaimTargets: readonly CaoLiveTarget[];
    try {
      exactClaimTargets = assertLiveTargets(claim.targets, requested, input, leaseId);
    } catch (error) {
      await releaseVerifiedLease(verifyRequest(input, leaseId), provisionalLease);
      throw error;
    }
    const lease: CaoTargetLeaseV1 = {
      schemaVersion: 1,
      kind: 'cao_target_lease',
      leaseId,
      accountId: input.accountId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      runId: input.runId,
      selectionMode: input.selection.mode,
      targets: exactClaimTargets.map(({ kind, targetId, revision }) => ({
        kind,
        targetId,
        revision,
      })),
      acquiredAt,
      expiresAt,
    };
    try {
      const currentRun = await readRun(input.accountId, input.runId);
      assertRun(currentRun, input);
    } catch (error) {
      await releaseVerifiedLease(verifyRequest(input, leaseId), lease);
      throw error;
    }
    let persistenceAt: number;
    try {
      persistenceAt = readNow();
      if (!Number.isSafeInteger(persistenceAt) || persistenceAt < acquiredAt) {
        fail('cao_target_clock_invalid');
      }
    } catch (error) {
      await releaseVerifiedLease(verifyRequest(input, leaseId), lease);
      throw error;
    }
    if (persistenceAt >= expiresAt) {
      await releaseVerifiedLease(verifyRequest(input, leaseId), lease);
      fail('cao_target_lease_stale');
    }
    try {
      let currentTargets: readonly CaoLiveTarget[];
      try {
        currentTargets = await dependencies.registry.readExact(releaseRequest(input, lease));
      } catch {
        fail('cao_target_registry_unavailable');
      }
      const canonicalTargets = canonicalDependencyValue(currentTargets);
      if (!validLiveTargetArray(canonicalTargets)) {
        fail('cao_target_registry_invalid');
      }
      assertLiveTargets(
        canonicalTargets,
        requested,
        input,
        leaseId,
        lease.targets.map(({ revision }) => revision),
      );
    } catch (error) {
      await releaseVerifiedLease(verifyRequest(input, leaseId), lease);
      throw error;
    }
    try {
      const currentRun = await readRun(input.accountId, input.runId);
      assertRun(currentRun, input);
      const authorizationAt = readNow();
      if (!Number.isSafeInteger(authorizationAt) || authorizationAt < persistenceAt) {
        fail('cao_target_clock_invalid');
      }
      if (authorizationAt >= expiresAt) fail('cao_target_lease_stale');
    } catch (error) {
      await releaseVerifiedLease(verifyRequest(input, leaseId), lease);
      throw error;
    }
    let appended: JarvisEvent;
    try {
      appended = await dependencies.journal.appendEvent(input.accountId, input.runId, {
        idempotencyKey: `cao-target-lease:${leaseId}`,
        type: 'context',
        title: 'CAO target authority acquired',
        safeSummary: `Authorized ${lease.targets.length} explicit CAO target${lease.targets.length === 1 ? '' : 's'} for a bounded lease.`,
        sourceRefs: [],
        artifactIds: [],
        createdAt: acquiredAt,
        caoTargetLease: lease,
      });
    } catch {
      let committed: CaoTargetLeaseV1 | undefined;
      try {
        committed = await findLease(dependencies.events, input, leaseId);
      } catch (error) {
        await releaseVerifiedLease(verifyRequest(input, leaseId), lease);
        throw error;
      }
      if (committed) return verifyAcquiredLease(input, lease);
      await releaseVerifiedLease(verifyRequest(input, leaseId), lease);
      fail('cao_target_lease_persistence_failed');
    }
    const canonicalAcknowledgement = canonicalDependencyValue(appended);
    if (
      !validDependencyEntry(canonicalAcknowledgement) ||
      !acknowledgesExactLease(canonicalAcknowledgement as JarvisEvent, input, lease)
    ) {
      await releaseVerifiedLease(verifyRequest(input, leaseId), lease);
      fail('cao_target_lease_persistence_failed');
    }
    return verifyAcquiredLease(input, lease);
  }

  async function release(input: VerifyInput): Promise<void> {
    if (!hasExactKeys(input, VERIFY_INPUT_KEYS)) fail('cao_target_input_invalid');
    assertScope(input);
    if (!validIdentifier(input.leaseId)) fail('cao_target_lease_id_invalid');
    const lease = await findLease(dependencies.events, input, input.leaseId);
    if (!lease) fail('cao_target_lease_missing');
    exactLeaseScope(lease, input);
    await releaseVerifiedLease(input, lease);
  }

  return Object.freeze({ acquire, verify, recover: verify, release });
}
