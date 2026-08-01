import {
  DEFAULT_SUBAGENT_LIFECYCLE_LIMITS,
  type DelegatedFileClaim,
  type DelegatedWorkItem,
  type SafeDelegationCapability,
  type SubagentLifecycleLimits,
} from './contracts';

export type SubagentLifecycleErrorCode =
  | 'invalid_input'
  | 'path_traversal'
  | 'claim_outside_root'
  | 'prohibited_capability'
  | 'limit_exceeded'
  | 'dependency_missing'
  | 'queue_capacity'
  | 'concurrent_capacity'
  | 'claim_conflict'
  | 'attempt_not_found'
  | 'terminal_immutable'
  | 'work_item_exists'
  | 'result_evidence_invalid'
  | 'retry_not_allowed'
  | 'invalid_checkpoint';

const ERROR_MESSAGES: Readonly<Record<SubagentLifecycleErrorCode, string>> = Object.freeze({
  invalid_input: 'Subagent lifecycle input is invalid.',
  path_traversal: 'Delegated paths must be canonical project-relative paths.',
  claim_outside_root: 'A delegated file claim is outside its bounded roots.',
  prohibited_capability: 'The delegated capability is prohibited.',
  limit_exceeded: 'The delegated work item exceeds a lifecycle limit.',
  dependency_missing: 'A delegated dependency does not exist in this parent run.',
  queue_capacity: 'The delegated work queue is at capacity.',
  concurrent_capacity: 'The delegated work run is at concurrent capacity.',
  claim_conflict: 'A delegated file claim conflicts with running work.',
  attempt_not_found: 'The delegated attempt does not exist in this exact owner and parent run.',
  terminal_immutable: 'A terminal delegated attempt is immutable.',
  work_item_exists: 'The delegated work item already exists in this parent run.',
  result_evidence_invalid: 'The delegated result evidence is invalid.',
  retry_not_allowed: 'The delegated attempt is not eligible for retry.',
  invalid_checkpoint: 'The delegated lifecycle checkpoint is invalid.',
});

export class SubagentLifecycleError extends Error {
  readonly code: SubagentLifecycleErrorCode;

  constructor(code: SubagentLifecycleErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'SubagentLifecycleError';
    this.code = code;
  }
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/u;
const SAFE_TEXT = /^[^\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]{1,2000}$/u;
const SAFE_CAPABILITIES = new Set<SafeDelegationCapability>([
  'file_read',
  'file_write',
  'test',
  'analysis',
]);
const REASONING_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh']);
const WORK_ITEM_KEYS = new Set([
  'id',
  'ownerId',
  'parentRunId',
  'parentWorkItemId',
  'depth',
  'title',
  'objective',
  'deliverable',
  'context',
  'model',
  'skills',
  'tools',
  'roots',
  'fileClaims',
  'maxTokens',
  'maxCostUsd',
  'timeoutMs',
  'dependencies',
  'mutationPolicy',
  'required',
]);

function fail(code: SubagentLifecycleErrorCode): never {
  throw new SubagentLifecycleError(code);
}

function safeId(value: unknown): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) return fail('invalid_input');
  return value;
}

function safeText(value: unknown): string {
  if (typeof value !== 'string') return fail('invalid_input');
  const trimmed = value.trim();
  if (!SAFE_TEXT.test(trimmed)) return fail('invalid_input');
  return trimmed;
}

function safeInteger(value: unknown, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    return fail('limit_exceeded');
  }
  return value as number;
}

function safeMoney(value: unknown, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum) {
    return fail('limit_exceeded');
  }
  return value;
}

function safePath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 500 ||
    value.includes('\\') ||
    value.startsWith('/') ||
    /^[A-Za-z]:/u.test(value) ||
    /(^|\/)\.{1,2}(\/|$)/u.test(value) ||
    /[\u0000-\u001f\u007f]/u.test(value) ||
    value.endsWith('/') ||
    value.includes('//')
  ) {
    return fail('path_traversal');
  }
  return value;
}

function safeStringList(value: unknown, maximum: number): readonly string[] {
  if (!Array.isArray(value) || value.length > maximum) return fail('invalid_input');
  return Object.freeze([...new Set(value.map(safeId))]);
}

function safeCapabilities(value: unknown): readonly SafeDelegationCapability[] {
  if (!Array.isArray(value) || value.length > SAFE_CAPABILITIES.size) {
    return fail('invalid_input');
  }
  const capabilities = [...new Set(value)];
  for (const capability of capabilities) {
    if (
      typeof capability !== 'string' ||
      !SAFE_CAPABILITIES.has(capability as SafeDelegationCapability)
    ) {
      return fail('prohibited_capability');
    }
  }
  return Object.freeze(capabilities.sort()) as readonly SafeDelegationCapability[];
}

function isWithinRoot(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

function safeClaims(value: unknown, roots: readonly string[]): readonly DelegatedFileClaim[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    return fail('invalid_input');
  }
  const claims = value.map((raw): DelegatedFileClaim => {
    if (typeof raw !== 'object' || raw === null) return fail('invalid_input');
    const record = raw as Record<string, unknown>;
    const path = safePath(record.path);
    if (record.access !== 'read' && record.access !== 'write') return fail('invalid_input');
    if (!roots.some((root) => isWithinRoot(path, root))) return fail('claim_outside_root');
    return Object.freeze({ path, access: record.access });
  });
  return Object.freeze(claims);
}

export function createDelegationPlanValidator(
  limits: SubagentLifecycleLimits = DEFAULT_SUBAGENT_LIFECYCLE_LIMITS,
) {
  if (
    !Number.isSafeInteger(limits.maxConcurrent) ||
    limits.maxConcurrent < 1 ||
    !Number.isSafeInteger(limits.maxQueued) ||
    limits.maxQueued < 1 ||
    !Number.isSafeInteger(limits.maxDepth) ||
    limits.maxDepth < 1 ||
    !Number.isSafeInteger(limits.maxTokensPerWorkItem) ||
    limits.maxTokensPerWorkItem < 1 ||
    typeof limits.maxCostUsdPerWorkItem !== 'number' ||
    !Number.isFinite(limits.maxCostUsdPerWorkItem) ||
    limits.maxCostUsdPerWorkItem < 0 ||
    !Number.isSafeInteger(limits.maxTimeoutMs) ||
    limits.maxTimeoutMs < 1_000
  ) {
    throw new TypeError('Invalid subagent lifecycle limits.');
  }
  return Object.freeze({
    validate(input: DelegatedWorkItem): DelegatedWorkItem {
      if (typeof input !== 'object' || input === null) return fail('invalid_input');
      if (Object.keys(input).some((key) => !WORK_ITEM_KEYS.has(key))) return fail('invalid_input');
      if (
        typeof input.context !== 'object' ||
        input.context === null ||
        input.context.kind !== 'focused' ||
        Object.keys(input.context).some(
          (key) => !['kind', 'summary', 'references'].includes(key),
        ) ||
        typeof input.model !== 'object' ||
        input.model === null ||
        Object.keys(input.model).some(
          (key) => !['provider', 'model', 'reasoningEffort'].includes(key),
        ) ||
        !REASONING_EFFORTS.has(input.model.reasoningEffort) ||
        typeof input.mutationPolicy !== 'object' ||
        input.mutationPolicy === null ||
        Object.keys(input.mutationPolicy).some((key) => !['mode', 'capabilities'].includes(key)) ||
        !Array.isArray(input.roots) ||
        typeof input.required !== 'boolean'
      ) {
        return fail('invalid_input');
      }
      const roots = Object.freeze([...new Set(input.roots.map(safePath))]);
      if (roots.length === 0 || roots.length > 20) return fail('invalid_input');
      const tools = safeCapabilities(input.tools);
      const capabilities = safeCapabilities(input.mutationPolicy?.capabilities);
      if (
        input.mutationPolicy?.mode !== 'owned_files_only' &&
        input.mutationPolicy?.mode !== 'read_only'
      ) {
        return fail('invalid_input');
      }
      const claims = safeClaims(input.fileClaims, roots);
      if (
        input.mutationPolicy.mode === 'read_only' &&
        (capabilities.includes('file_write') || claims.some((claim) => claim.access === 'write'))
      ) {
        return fail('prohibited_capability');
      }
      if (tools.some((tool) => !capabilities.includes(tool))) return fail('prohibited_capability');

      return Object.freeze({
        id: safeId(input.id),
        ownerId: safeId(input.ownerId),
        parentRunId: safeId(input.parentRunId),
        parentWorkItemId: input.parentWorkItemId === null ? null : safeId(input.parentWorkItemId),
        depth: safeInteger(input.depth, 1, limits.maxDepth),
        title: safeText(input.title),
        objective: safeText(input.objective),
        deliverable: safeText(input.deliverable),
        context: Object.freeze({
          kind: 'focused' as const,
          summary: safeText(input.context.summary),
          references: safeStringList(input.context.references, 50),
        }),
        model: Object.freeze({
          provider: safeId(input.model.provider),
          model: safeId(input.model.model),
          reasoningEffort: input.model.reasoningEffort,
        }),
        skills: safeStringList(input.skills, 10),
        tools,
        roots,
        fileClaims: claims,
        maxTokens: safeInteger(input.maxTokens, 1, limits.maxTokensPerWorkItem),
        maxCostUsd: safeMoney(input.maxCostUsd, limits.maxCostUsdPerWorkItem),
        timeoutMs: safeInteger(input.timeoutMs, 1_000, limits.maxTimeoutMs),
        dependencies: safeStringList(input.dependencies, limits.maxQueued),
        mutationPolicy: Object.freeze({
          mode: input.mutationPolicy.mode,
          capabilities,
        }),
        required: input.required === true,
      });
    },
  });
}
