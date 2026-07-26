export interface ContextSkillCapability {
  canReadContext: boolean;
  canSuggestLinks: boolean;
  canCreateNotes: boolean;
  canUpdateProperties: boolean;
  canRefreshSources: boolean;
}

export type ContextSkillCapabilityName = keyof ContextSkillCapability;
export type ContextProcessorEngine = 'declarative' | 'wasm';
export type ContextProcessorIsolation = 'worker_no_dom' | 'sandboxed_process';

export interface ContextProcessorManifest {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  engine: ContextProcessorEngine;
  isolation: ContextProcessorIsolation;
  permissions: ContextSkillCapability;
}

export type ContextProcessorTrustEvidence =
  | {
      kind: 'signed_package';
      packageDigest: string;
      processorId: string;
      version: string;
      signer: string;
      verificationId: string;
    }
  | {
      kind: 'reviewed_local_install';
      packageDigest: string;
      processorId: string;
      version: string;
      reviewId: string;
      reviewedBy: string;
    };

export interface ContextProcessorTrustVerificationInput {
  manifest: Readonly<ContextProcessorManifest>;
  packageDigest: string;
}

export type ContextProcessorTrustVerifier = (
  input: Readonly<ContextProcessorTrustVerificationInput>,
) => unknown;

export interface ContextProcessorAuditEvent {
  id: string;
  processorId: string;
  version: string;
  occurredAt: number;
  actor: string;
  action: 'install_reviewed' | 'enabled' | 'disabled' | 'execution_allowed' | 'execution_denied';
  capability?: ContextSkillCapabilityName;
  reason: string;
}

export interface ContextProcessorState {
  schemaVersion: 1;
  manifest: ContextProcessorManifest;
  trust: ContextProcessorTrustEvidence;
  enabled: boolean;
  auditLog: readonly ContextProcessorAuditEvent[];
}

export interface PassiveContextPackage {
  schemaVersion: 1;
  kind: 'context_package';
  executable: false;
  documents: readonly {
    id: string;
    markdown: string;
  }[];
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,255}$/u;
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const ISSUED_STATES = new WeakSet<object>();
const CAPABILITIES = Object.freeze([
  'canReadContext',
  'canSuggestLinks',
  'canCreateNotes',
  'canUpdateProperties',
  'canRefreshSources',
] as const satisfies readonly ContextSkillCapabilityName[]);
const MAX_TEXT = 32_768;

function fail(detail: string): never {
  throw new Error(`Invalid Context processor: ${detail}.`);
}

function text(value: unknown, detail: string, allowEmpty = false, maximum = 4_096): string {
  if (
    typeof value !== 'string' ||
    value.length > maximum ||
    (!allowEmpty && value.trim().length === 0) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)
  ) {
    fail(detail);
  }
  return value;
}

function id(value: unknown, detail: string): string {
  const parsed = text(value, detail);
  if (!SAFE_ID.test(parsed)) fail(detail);
  return parsed;
}

function time(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail('time');
  return value as number;
}

function allowedKeys(value: object, keys: readonly string[], detail: string): void {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) fail(detail);
}

function assertPlainBoundary(value: unknown, depth = 0): void {
  if (value === null || typeof value !== 'object') return;
  if (depth > 4) fail('boundary');
  let array: boolean;
  let prototype: object | null;
  let keys: PropertyKey[];
  let descriptors: PropertyDescriptorMap;
  try {
    array = Array.isArray(value);
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return fail('boundary');
  }
  if (keys.some((key) => typeof key !== 'string')) fail('boundary');
  if (array) {
    if (prototype !== Array.prototype) fail('boundary');
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    const length =
      lengthDescriptor && 'value' in lengthDescriptor ? lengthDescriptor.value : undefined;
    if (!Number.isSafeInteger(length) || length < 0 || length > 1_000) fail('boundary');
    if (keys.length !== length + 1 || !keys.includes('length')) fail('boundary');
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor?.enumerable || !('value' in descriptor)) fail('boundary');
      assertPlainBoundary(descriptor.value, depth + 1);
    }
    return;
  }
  if (prototype !== Object.prototype && prototype !== null) fail('boundary');
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (!descriptor?.enumerable || !('value' in descriptor)) fail('boundary');
    assertPlainBoundary(descriptor.value, depth + 1);
  }
}

function safeClone<T>(raw: T): T {
  assertPlainBoundary(raw);
  try {
    return structuredClone(raw);
  } catch {
    return fail('boundary');
  }
}

function permissions(raw: unknown): Readonly<ContextSkillCapability> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('declared permissions');
  allowedKeys(raw, CAPABILITIES, 'declared permissions');
  const value = raw as Record<ContextSkillCapabilityName, unknown>;
  if (CAPABILITIES.some((capability) => typeof value[capability] !== 'boolean')) {
    fail('declared permissions');
  }
  return Object.freeze(
    Object.fromEntries(CAPABILITIES.map((capability) => [capability, value[capability]])),
  ) as unknown as Readonly<ContextSkillCapability>;
}

function manifest(raw: unknown): Readonly<ContextProcessorManifest> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('manifest');
  const value = safeClone(raw) as Record<string, unknown>;
  allowedKeys(
    value,
    ['schemaVersion', 'id', 'name', 'version', 'engine', 'isolation', 'permissions'],
    'manifest fields',
  );
  if (value.schemaVersion !== 1) fail('schema version');
  if (typeof value.version !== 'string' || !SEMVER.test(value.version)) fail('version');
  if (!['declarative', 'wasm'].includes(value.engine as string)) {
    fail('JavaScript execution is not allowed');
  }
  if (!['worker_no_dom', 'sandboxed_process'].includes(value.isolation as string)) {
    fail('isolation');
  }
  return Object.freeze({
    schemaVersion: 1,
    id: id(value.id, 'processor ID'),
    name: text(value.name, 'processor name'),
    version: value.version,
    engine: value.engine as ContextProcessorEngine,
    isolation: value.isolation as ContextProcessorIsolation,
    permissions: permissions(value.permissions),
  });
}

function trust(
  raw: unknown,
  expected: Readonly<ContextProcessorTrustVerificationInput>,
): Readonly<ContextProcessorTrustEvidence> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('trust evidence');
  const value = safeClone(raw) as Record<string, unknown>;
  if (value.kind === 'signed_package') {
    allowedKeys(
      value,
      ['kind', 'packageDigest', 'processorId', 'version', 'signer', 'verificationId'],
      'signed package evidence',
    );
    if (
      typeof value.packageDigest !== 'string' ||
      !DIGEST.test(value.packageDigest) ||
      value.packageDigest !== expected.packageDigest ||
      value.processorId !== expected.manifest.id ||
      value.version !== expected.manifest.version
    ) {
      fail('package-bound verified signature');
    }
    return Object.freeze({
      kind: 'signed_package',
      packageDigest: value.packageDigest,
      processorId: expected.manifest.id,
      version: expected.manifest.version,
      signer: id(value.signer, 'signer'),
      verificationId: id(value.verificationId, 'verification ID'),
    });
  }
  if (value.kind === 'reviewed_local_install') {
    allowedKeys(
      value,
      ['kind', 'packageDigest', 'processorId', 'version', 'reviewId', 'reviewedBy'],
      'local review evidence',
    );
    if (
      value.packageDigest !== expected.packageDigest ||
      value.processorId !== expected.manifest.id ||
      value.version !== expected.manifest.version
    ) {
      fail('package-bound local review');
    }
    return Object.freeze({
      kind: 'reviewed_local_install',
      packageDigest: expected.packageDigest,
      processorId: expected.manifest.id,
      version: expected.manifest.version,
      reviewId: id(value.reviewId, 'review ID'),
      reviewedBy: id(value.reviewedBy, 'reviewer'),
    });
  }
  return fail('signed package or reviewed local install required');
}

function event(input: {
  processorId: string;
  version: string;
  occurredAt: number;
  actor: string;
  action: ContextProcessorAuditEvent['action'];
  capability?: ContextSkillCapabilityName;
  reason: string;
}): Readonly<ContextProcessorAuditEvent> {
  const occurredAt = time(input.occurredAt);
  return Object.freeze({
    id: `${input.processorId}:${occurredAt}:${input.action}`,
    processorId: input.processorId,
    version: input.version,
    occurredAt,
    actor: id(input.actor, 'audit actor'),
    action: input.action,
    ...(input.capability === undefined ? {} : { capability: input.capability }),
    reason: text(input.reason, 'audit reason'),
  });
}

export function reviewContextProcessorInstall(
  rawManifest: unknown,
  packageDigest: string,
  verifyTrust: ContextProcessorTrustVerifier,
  actor: string,
  now = Date.now(),
): Readonly<ContextProcessorState> {
  const approvedManifest = manifest(rawManifest);
  if (typeof packageDigest !== 'string' || !DIGEST.test(packageDigest)) fail('package digest');
  if (typeof verifyTrust !== 'function') fail('trusted verifier');
  const verificationInput = Object.freeze({
    manifest: approvedManifest,
    packageDigest,
  });
  let rawTrust: unknown;
  try {
    rawTrust = verifyTrust(verificationInput);
  } catch {
    return fail('trusted verifier');
  }
  const approvedTrust = trust(rawTrust, verificationInput);
  const installed = event({
    processorId: approvedManifest.id,
    version: approvedManifest.version,
    occurredAt: now,
    actor,
    action: 'install_reviewed',
    reason:
      approvedTrust.kind === 'signed_package'
        ? 'Verified signed package.'
        : 'Reviewed local install.',
  });
  const state = Object.freeze({
    schemaVersion: 1,
    manifest: approvedManifest,
    trust: approvedTrust,
    enabled: false,
    auditLog: Object.freeze([installed]),
  });
  ISSUED_STATES.add(state);
  return state;
}

export function setContextProcessorEnabled(
  state: ContextProcessorState,
  enabled: boolean,
  actor: string,
  now = Date.now(),
): Readonly<ContextProcessorState> {
  if (!ISSUED_STATES.has(state)) fail('unreviewed processor state');
  if (typeof enabled !== 'boolean') fail('enabled state');
  if (state.enabled === enabled) return state;
  const audit = event({
    processorId: state.manifest.id,
    version: state.manifest.version,
    occurredAt: now,
    actor,
    action: enabled ? 'enabled' : 'disabled',
    reason: enabled ? 'Processor enabled.' : 'Processor disabled.',
  });
  const nextState = Object.freeze({
    ...state,
    enabled,
    auditLog: Object.freeze([...state.auditLog, audit]),
  });
  ISSUED_STATES.add(nextState);
  return nextState;
}

export function authorizeContextProcessorCapability(
  state: ContextProcessorState,
  capability: ContextSkillCapabilityName,
  actor: string,
  now = Date.now(),
): Readonly<{ allowed: boolean; reason: string; state: ContextProcessorState }> {
  if (!ISSUED_STATES.has(state)) fail('unreviewed processor state');
  if (!CAPABILITIES.includes(capability)) fail('capability');
  const allowed = state.enabled && state.manifest.permissions[capability];
  const reason = !state.enabled
    ? 'Processor is disabled.'
    : allowed
      ? 'Declared capability allowed.'
      : 'Capability was not declared.';
  const audit = event({
    processorId: state.manifest.id,
    version: state.manifest.version,
    occurredAt: now,
    actor,
    action: allowed ? 'execution_allowed' : 'execution_denied',
    capability,
    reason,
  });
  const nextState = Object.freeze({
    ...state,
    auditLog: Object.freeze([...state.auditLog, audit]),
  });
  ISSUED_STATES.add(nextState);
  return Object.freeze({
    allowed,
    reason,
    state: nextState,
  });
}

export function parsePassiveContextPackage(raw: unknown): Readonly<PassiveContextPackage> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('package boundary');
  const value = safeClone(raw) as Record<string, unknown>;
  allowedKeys(value, ['schemaVersion', 'kind', 'documents'], 'package fields');
  if (value.schemaVersion !== 1 || value.kind !== 'context_package') fail('package schema');
  if (!Array.isArray(value.documents) || value.documents.length > 1_000) fail('documents');
  const documents = value.documents.map((rawDocument) => {
    if (!rawDocument || typeof rawDocument !== 'object' || Array.isArray(rawDocument)) {
      fail('document');
    }
    allowedKeys(rawDocument, ['id', 'markdown'], 'document fields');
    const document = rawDocument as Record<string, unknown>;
    return Object.freeze({
      id: id(document.id, 'document ID'),
      markdown: text(document.markdown, 'Markdown', true, MAX_TEXT),
    });
  });
  return Object.freeze({
    schemaVersion: 1,
    kind: 'context_package',
    executable: false,
    documents: Object.freeze(documents),
  });
}
