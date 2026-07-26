import type { GitHubRepositoryIdentity } from './githubRepositoryRetrieval';

export const GITHUB_REFRESH_MODES = Object.freeze([
  'manual',
  'on_app_open',
  'interval',
  'webhook_assisted',
] as const);

export const GITHUB_WEBHOOK_EVENT_KINDS = Object.freeze([
  'push',
  'repository_renamed',
  'branch_changed',
  'installation_removed',
  'repository_access_changed',
  'issue_or_pr_updated',
] as const);

export type GitHubRefreshMode = (typeof GITHUB_REFRESH_MODES)[number];
export type GitHubWebhookEventKind = (typeof GITHUB_WEBHOOK_EVENT_KINDS)[number];
export type GitHubRetentionPolicy = 'purge_on_revocation' | 'keep_encrypted_after_revocation';

export interface GitHubRefreshPolicyInput {
  mode: GitHubRefreshMode;
  intervalMinutes: number | null;
}

export interface GitHubRefreshPolicy extends GitHubRefreshPolicyInput {}

export type GitHubRefreshTrigger =
  | { kind: 'manual' }
  | { kind: 'app_open' }
  | { kind: 'interval' }
  | { kind: 'webhook'; deliveryId: string };

export interface GitHubAccessSnapshot {
  identity: GitHubRepositoryIdentity;
  state: 'active' | 'removed';
  checkedAt: string;
}

export interface GitHubWebhookEvent {
  deliveryId: string;
  identity: GitHubRepositoryIdentity;
  kind: GitHubWebhookEventKind;
  occurredAt: string;
}

export interface GitHubRefreshAuthority {
  getAccess(identity: Readonly<GitHubRepositoryIdentity>): GitHubAccessSnapshot | undefined;
  getWebhookEvent?(deliveryId: string): GitHubWebhookEvent | undefined;
}

export interface GitHubCloudModelApproval {
  approvalId: string;
  actor: 'direct_user';
  identity: GitHubRepositoryIdentity;
  providerId: string;
  modelId: string;
  purpose: 'private_repository_analysis';
  approvedAt: string;
}

export interface GitHubCloudModelApprovalAuthority {
  isApproved(approval: Readonly<GitHubCloudModelApproval>): boolean;
}

export interface GitHubPrivateRepositoryPolicyInput {
  identity: GitHubRepositoryIdentity;
  visibility: 'private' | 'public' | 'internal';
  retentionPolicy: GitHubRetentionPolicy;
  cloudApproval: GitHubCloudModelApproval | null;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,499}$/u;
const SAFE_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9])?$/u;
const SAFE_REPOSITORY = /^[A-Za-z0-9_.-]{1,100}$/u;
const SHA = /^[a-fA-F0-9]{40}$/u;
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;
const MAX_NODES = 10_000;
const MAX_CHARS = 1_000_000;

function fail(reason: string): never {
  throw new Error(`Invalid GitHub refresh/privacy ${reason}.`);
}

function text(value: unknown, reason: string, maximum = 500): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim() !== value ||
    FORBIDDEN.test(value)
  ) {
    fail(reason);
  }
  return value;
}

function stableId(value: unknown, reason: string): string {
  const id = text(value, reason);
  if (!SAFE_ID.test(id)) fail(reason);
  return id;
}

function timestamp(value: unknown, reason: string): string {
  const result = text(value, reason, 40);
  const milliseconds = Date.parse(result);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== result) {
    fail(reason);
  }
  return result;
}

function assertClosed(
  value: unknown,
  reason: string,
  depth = 0,
  budget = { nodes: 0, chars: 0 },
): void {
  budget.nodes += 1;
  if (budget.nodes > MAX_NODES || depth > 6) fail(reason);
  if (typeof value === 'string') {
    if (value.length > 10_000) fail(reason);
    budget.chars += value.length;
    if (budget.chars > MAX_CHARS) fail(reason);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  let prototype: object | null;
  let keys: PropertyKey[];
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return fail(reason);
  }
  if (keys.some((key) => typeof key !== 'string')) fail(reason);
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype || value.length > 100) fail(reason);
    if (keys.length !== value.length + 1 || !keys.includes('length')) fail(reason);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail(reason);
      assertClosed(descriptor.value, reason, depth + 1, budget);
    }
    return;
  }
  if ((prototype !== Object.prototype && prototype !== null) || keys.length > 10) fail(reason);
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail(reason);
    assertClosed(descriptor.value, reason, depth + 1, budget);
  }
}

function clone<T>(value: T, reason: string): T {
  try {
    assertClosed(value, reason);
    return structuredClone(value);
  } catch {
    return fail(reason);
  }
}

function record(value: unknown, reason: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(reason);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(reason);
  return value as Record<string, unknown>;
}

function exact(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  reason: string,
): void {
  const keys = new Set(allowed);
  if (Object.keys(value).some((key) => !keys.has(key))) fail(reason);
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) fail(reason);
}

function validateIdentity(rawIdentity: GitHubRepositoryIdentity): GitHubRepositoryIdentity {
  const identity = record(rawIdentity, 'identity');
  exact(
    identity,
    ['accountId', 'installationId', 'owner', 'repository', 'resolvedCommitSha'],
    ['accountId', 'installationId', 'owner', 'repository', 'resolvedCommitSha'],
    'identity',
  );
  const owner = text(identity.owner, 'owner', 100);
  const repository = text(identity.repository, 'repository', 100);
  const resolvedCommitSha = text(identity.resolvedCommitSha, 'resolved commit SHA', 40);
  if (
    !SAFE_OWNER.test(owner) ||
    !SAFE_REPOSITORY.test(repository) ||
    repository === '.' ||
    repository === '..' ||
    !SHA.test(resolvedCommitSha)
  ) {
    fail('identity');
  }
  return Object.freeze({
    accountId: stableId(identity.accountId, 'account ID'),
    installationId: stableId(identity.installationId, 'installation ID'),
    owner,
    repository,
    resolvedCommitSha: resolvedCommitSha.toLowerCase(),
  });
}

function sameIdentity(left: GitHubRepositoryIdentity, right: GitHubRepositoryIdentity): boolean {
  return (
    left.accountId === right.accountId &&
    left.installationId === right.installationId &&
    left.owner === right.owner &&
    left.repository === right.repository &&
    left.resolvedCommitSha === right.resolvedCommitSha
  );
}

function validateAccess(
  rawIdentity: GitHubRepositoryIdentity,
  authority: Pick<GitHubRefreshAuthority, 'getAccess'>,
): Readonly<GitHubAccessSnapshot> {
  const identity = validateIdentity(rawIdentity);
  if (!authority || typeof authority.getAccess !== 'function') fail('access authority');
  const rawAccess = authority.getAccess(identity);
  if (!rawAccess) fail('access');
  const access = record(clone(rawAccess, 'access'), 'access');
  exact(access, ['identity', 'state', 'checkedAt'], ['identity', 'state', 'checkedAt'], 'access');
  const accessIdentity = validateIdentity(access.identity as GitHubRepositoryIdentity);
  if (!sameIdentity(identity, accessIdentity)) fail('access identity');
  if (access.state !== 'active' && access.state !== 'removed') fail('access state');
  return Object.freeze({
    identity,
    state: access.state,
    checkedAt: timestamp(access.checkedAt, 'access timestamp'),
  });
}

export function buildGitHubRefreshPolicy(
  rawInput: GitHubRefreshPolicyInput,
): Readonly<GitHubRefreshPolicy> {
  const input = record(clone(rawInput, 'policy'), 'policy');
  exact(input, ['mode', 'intervalMinutes'], ['mode', 'intervalMinutes'], 'policy');
  if (!(GITHUB_REFRESH_MODES as readonly unknown[]).includes(input.mode)) fail('refresh mode');
  if (input.mode === 'interval') {
    if (
      !Number.isSafeInteger(input.intervalMinutes) ||
      (input.intervalMinutes as number) < 5 ||
      (input.intervalMinutes as number) > 10_080
    ) {
      fail('interval');
    }
  } else if (input.intervalMinutes !== null) {
    fail('interval');
  }
  return Object.freeze({
    mode: input.mode as GitHubRefreshMode,
    intervalMinutes: input.intervalMinutes as number | null,
  });
}

function validatePolicy(rawPolicy: GitHubRefreshPolicy): GitHubRefreshPolicy {
  return buildGitHubRefreshPolicy(rawPolicy);
}

function validateWebhook(
  rawEvent: GitHubWebhookEvent,
  identity: GitHubRepositoryIdentity,
  deliveryId: string,
): Readonly<GitHubWebhookEvent> {
  const event = record(clone(rawEvent, 'webhook event'), 'webhook event');
  exact(
    event,
    ['deliveryId', 'identity', 'kind', 'occurredAt'],
    ['deliveryId', 'identity', 'kind', 'occurredAt'],
    'webhook event',
  );
  if (
    stableId(event.deliveryId, 'delivery ID') !== deliveryId ||
    !(GITHUB_WEBHOOK_EVENT_KINDS as readonly unknown[]).includes(event.kind)
  ) {
    fail('webhook event');
  }
  const eventIdentity = validateIdentity(event.identity as GitHubRepositoryIdentity);
  if (!sameIdentity(identity, eventIdentity)) fail('webhook identity');
  return Object.freeze({
    deliveryId,
    identity,
    kind: event.kind as GitHubWebhookEventKind,
    occurredAt: timestamp(event.occurredAt, 'webhook timestamp'),
  });
}

export function planGitHubRefresh(
  rawIdentity: GitHubRepositoryIdentity,
  rawPolicy: GitHubRefreshPolicy,
  rawTrigger: GitHubRefreshTrigger,
  authority: GitHubRefreshAuthority,
) {
  const identity = validateIdentity(clone(rawIdentity, 'identity'));
  const policy = validatePolicy(clone(rawPolicy, 'policy'));
  const trigger = record(clone(rawTrigger, 'trigger'), 'trigger');
  const access = validateAccess(identity, authority);
  if (access.state !== 'active') fail('source permission lost');
  let triggerKind: 'manual' | 'app_open' | 'interval' | 'webhook';
  let webhookEvent: Readonly<GitHubWebhookEvent> | null = null;
  if (trigger.kind === 'manual') {
    exact(trigger, ['kind'], ['kind'], 'trigger');
    if (policy.mode !== 'manual') fail('refresh policy');
    triggerKind = 'manual';
  } else if (trigger.kind === 'app_open') {
    exact(trigger, ['kind'], ['kind'], 'trigger');
    if (policy.mode !== 'on_app_open') fail('refresh policy');
    triggerKind = 'app_open';
  } else if (trigger.kind === 'interval') {
    exact(trigger, ['kind'], ['kind'], 'trigger');
    if (policy.mode !== 'interval') fail('refresh policy');
    triggerKind = 'interval';
  } else if (trigger.kind === 'webhook') {
    exact(trigger, ['kind', 'deliveryId'], ['kind', 'deliveryId'], 'trigger');
    if (policy.mode !== 'webhook_assisted') fail('refresh policy');
    if (typeof authority.getWebhookEvent !== 'function') fail('webhook authority');
    const deliveryId = stableId(trigger.deliveryId, 'delivery ID');
    const rawEvent = authority.getWebhookEvent(deliveryId);
    if (!rawEvent) fail('webhook event');
    webhookEvent = validateWebhook(rawEvent, identity, deliveryId);
    triggerKind = 'webhook';
  } else {
    return fail('trigger');
  }
  const eventKind = webhookEvent?.kind ?? null;
  const accessRevoked =
    eventKind === 'installation_removed' || eventKind === 'repository_access_changed';
  const localIndexingRequired =
    eventKind === null || eventKind === 'push' || eventKind === 'branch_changed';
  return Object.freeze({
    identity,
    trigger: triggerKind,
    refreshAllowed: !accessRevoked,
    updateMetadata: true,
    markMapStale: true,
    localIndexingRequired: accessRevoked ? false : localIndexingRequired,
    remoteReadsAllowed: !accessRevoked,
    webhookEvent:
      webhookEvent === null
        ? null
        : Object.freeze({
            deliveryId: webhookEvent.deliveryId,
            kind: webhookEvent.kind,
            occurredAt: webhookEvent.occurredAt,
          }),
    executable: false as const,
  });
}

function validateCloudApproval(
  rawApproval: GitHubCloudModelApproval,
): Readonly<GitHubCloudModelApproval> {
  const approval = record(clone(rawApproval, 'cloud approval'), 'cloud approval');
  exact(
    approval,
    ['approvalId', 'actor', 'identity', 'providerId', 'modelId', 'purpose', 'approvedAt'],
    ['approvalId', 'actor', 'identity', 'providerId', 'modelId', 'purpose', 'approvedAt'],
    'cloud approval',
  );
  if (approval.actor !== 'direct_user' || approval.purpose !== 'private_repository_analysis') {
    fail('cloud approval');
  }
  return Object.freeze({
    approvalId: stableId(approval.approvalId, 'approval ID'),
    actor: 'direct_user',
    identity: validateIdentity(approval.identity as GitHubRepositoryIdentity),
    providerId: stableId(approval.providerId, 'provider ID'),
    modelId: stableId(approval.modelId, 'model ID'),
    purpose: 'private_repository_analysis',
    approvedAt: timestamp(approval.approvedAt, 'approval timestamp'),
  });
}

export function buildGitHubPrivateRepositoryPolicy(
  rawInput: GitHubPrivateRepositoryPolicyInput,
  authority: GitHubCloudModelApprovalAuthority | null,
) {
  const input = record(clone(rawInput, 'privacy policy'), 'privacy policy');
  exact(
    input,
    ['identity', 'visibility', 'retentionPolicy', 'cloudApproval'],
    ['identity', 'visibility', 'retentionPolicy', 'cloudApproval'],
    'privacy policy',
  );
  const identity = validateIdentity(input.identity as GitHubRepositoryIdentity);
  if (!['private', 'public', 'internal'].includes(input.visibility as string)) {
    fail('visibility');
  }
  if (
    input.retentionPolicy !== 'purge_on_revocation' &&
    input.retentionPolicy !== 'keep_encrypted_after_revocation'
  ) {
    fail('retention policy');
  }
  const isPrivate = input.visibility === 'private' || input.visibility === 'internal';
  let approval: Readonly<GitHubCloudModelApproval> | null = null;
  if (input.cloudApproval !== null) {
    if (!isPrivate) fail('cloud approval scope');
    approval = validateCloudApproval(input.cloudApproval as GitHubCloudModelApproval);
    if (!sameIdentity(identity, approval.identity)) fail('cloud approval binding');
    if (!authority || typeof authority.isApproved !== 'function') fail('cloud authority');
    if (authority.isApproved(approval) !== true) fail('trusted cloud approval');
  } else if (authority !== null) {
    fail('cloud authority');
  }
  return Object.freeze({
    identity,
    visibility: input.visibility as 'private' | 'public' | 'internal',
    privacyBadge: isPrivate,
    cloudRetention: isPrivate ? ('minimized' as const) : ('standard' as const),
    cacheEncryptionRequired: isPrivate,
    publicCodeUrlsAllowed: !isPrivate,
    cloudModelAllowed: approval !== null,
    approvedProviderId: approval?.providerId ?? null,
    approvedModelId: approval?.modelId ?? null,
    retentionPolicy: input.retentionPolicy as GitHubRetentionPolicy,
    executable: false as const,
  });
}

export function planGitHubAccessRevocation(
  rawIdentity: GitHubRepositoryIdentity,
  rawRetentionPolicy: GitHubRetentionPolicy,
  authority: Pick<GitHubRefreshAuthority, 'getAccess'>,
) {
  if (
    rawRetentionPolicy !== 'purge_on_revocation' &&
    rawRetentionPolicy !== 'keep_encrypted_after_revocation'
  ) {
    fail('retention policy');
  }
  const access = validateAccess(clone(rawIdentity, 'identity'), authority);
  if (access.state !== 'removed') fail('access is still active');
  const purge = rawRetentionPolicy === 'purge_on_revocation';
  return Object.freeze({
    identity: access.identity,
    sourcePermission: 'lost' as const,
    refreshAllowed: false as const,
    remoteReadsAllowed: false as const,
    localSnapshotAction: purge ? ('purge' as const) : ('keep_encrypted' as const),
    cachedContentRemovalRequired: purge,
    options: Object.freeze(['reconnect', 'remove_source'] as const),
    checkedAt: access.checkedAt,
    executable: false as const,
  });
}
