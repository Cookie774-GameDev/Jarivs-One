import { createContextPointer, type ContextPointer } from './losslessContext';
import type { ContextScope } from './contextQueryService';
import type { RlmBudget } from './rlmRuntime';

export const RLM_OPENCODE_TOOL_NAME = 'vibespace_context' as const;
export const RLM_CONTEXT_OPERATIONS = [
  'describe',
  'search',
  'open',
  'expand',
  'related',
  'timeline',
  'sources',
  'checkpoint',
  'investigate',
] as const;

export type RlmContextOperation = (typeof RLM_CONTEXT_OPERATIONS)[number];

export interface RlmContextLease {
  sessionId: string;
  accountId: string;
  workspaceId?: string;
  projectId?: string;
  worktreeId?: string;
  expiresAt: number;
}

export type RlmOpenCodeToolErrorCode = 'invalid_arguments' | 'lease_expired';

export class RlmOpenCodeToolError extends Error {
  constructor(
    readonly code: RlmOpenCodeToolErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'RlmOpenCodeToolError';
  }
}

interface QueryPort {
  describe(input: unknown): Promise<unknown>;
  search(input: unknown): Promise<unknown>;
  open(input: unknown): Promise<unknown>;
  expand(input: unknown): Promise<unknown>;
  related(input: unknown): Promise<unknown>;
  timeline(input: unknown): Promise<unknown>;
  sources(input: unknown): Promise<unknown>;
  checkpoint(input: unknown): Promise<unknown>;
}

interface RlmPort {
  investigate(input: unknown): Promise<unknown>;
}

const DEFAULT_RLM_BUDGET: Readonly<RlmBudget> = Object.freeze({
  maxDepth: 1,
  maxSubcalls: 4,
  maxConcurrentSubcalls: 2,
  maxInputTokens: 8_192,
  maxOutputTokens: 2_048,
  maxWallTimeMs: 60_000,
  maxToolCalls: 12,
  maxOpenBytes: 256 * 1024,
});

function invalid(): never {
  throw new RlmOpenCodeToolError('invalid_arguments');
}

function plainObject(value: unknown): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    invalid();
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  input: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  const value = plainObject(input);
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.prototype.hasOwnProperty.call(value, key)) ||
    Object.keys(value).some((key) => !allowed.has(key))
  ) {
    invalid();
  }
  return value;
}

function text(value: unknown, maximum = 4_096): string {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > maximum ||
    value.trim() !== value ||
    value.includes('\0')
  ) {
    invalid();
  }
  return value;
}

function optionalPositiveInteger(value: unknown, maximum: number): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 1) invalid();
  return Math.min(value as number, maximum);
}

function pointer(value: unknown): ContextPointer {
  const raw = exactKeys(
    value,
    ['id', 'recordId', 'sourceVersion', 'contentHash'],
    ['lineStart', 'lineEnd', 'byteStart', 'byteEnd', 'messageId', 'eventId', 'toolCallId'],
  );
  try {
    return createContextPointer(raw as unknown as ContextPointer);
  } catch {
    invalid();
  }
}

function leaseScope(lease: RlmContextLease, now: number): ContextScope {
  if (
    !lease.sessionId ||
    !lease.accountId ||
    !Number.isSafeInteger(lease.expiresAt) ||
    lease.expiresAt <= now
  ) {
    throw new RlmOpenCodeToolError('lease_expired');
  }
  return {
    accountId: lease.accountId,
    ...(lease.workspaceId ? { workspaceId: lease.workspaceId } : {}),
    ...(lease.projectId ? { projectId: lease.projectId } : {}),
    ...(lease.worktreeId ? { worktreeId: lease.worktreeId } : {}),
  };
}

export function createRlmOpenCodeTool(dependencies: {
  queryService: QueryPort;
  rlmRuntime: RlmPort;
  now?: () => number;
  maxOpenBytes?: number;
  rlmBudget?: RlmBudget;
}) {
  const now = dependencies.now ?? Date.now;
  const maxOpenBytes = Math.max(1, Math.floor(dependencies.maxOpenBytes ?? 64 * 1024));
  const rlmBudget = Object.freeze({ ...(dependencies.rlmBudget ?? DEFAULT_RLM_BUDGET) });

  const execute = async (
    rawInput: unknown,
    lease: RlmContextLease,
    signal?: AbortSignal,
  ): Promise<unknown> => {
    const scope = leaseScope(lease, now());
    const base = exactKeys(
      rawInput,
      ['operation'],
      [
        'query',
        'limit',
        'continuation',
        'pointer',
        'maxBytes',
        'beforeBytes',
        'afterBytes',
        'recordId',
      ],
    );
    if (
      typeof base.operation !== 'string' ||
      !RLM_CONTEXT_OPERATIONS.includes(base.operation as RlmContextOperation)
    ) {
      invalid();
    }
    const operation = base.operation as RlmContextOperation;

    switch (operation) {
      case 'describe': {
        exactKeys(rawInput, ['operation']);
        return dependencies.queryService.describe({ scope, signal });
      }
      case 'search': {
        const args = exactKeys(rawInput, ['operation', 'query'], ['limit', 'continuation']);
        return dependencies.queryService.search({
          scope,
          query: text(args.query),
          ...(optionalPositiveInteger(args.limit, 100) === undefined
            ? {}
            : { limit: optionalPositiveInteger(args.limit, 100) }),
          ...(args.continuation === undefined
            ? {}
            : { continuation: text(args.continuation, 512) }),
          signal,
        });
      }
      case 'open': {
        const args = exactKeys(rawInput, ['operation', 'pointer'], ['maxBytes', 'continuation']);
        return dependencies.queryService.open({
          scope,
          pointer: pointer(args.pointer),
          maxBytes: optionalPositiveInteger(args.maxBytes, maxOpenBytes) ?? maxOpenBytes,
          ...(args.continuation === undefined
            ? {}
            : { continuation: text(args.continuation, 512) }),
          signal,
        });
      }
      case 'expand': {
        const args = exactKeys(rawInput, ['operation', 'pointer'], ['beforeBytes', 'afterBytes']);
        return dependencies.queryService.expand({
          scope,
          pointer: pointer(args.pointer),
          beforeBytes: optionalPositiveInteger(args.beforeBytes, maxOpenBytes) ?? 0,
          afterBytes: optionalPositiveInteger(args.afterBytes, maxOpenBytes) ?? 0,
          signal,
        });
      }
      case 'related': {
        const args = exactKeys(rawInput, ['operation', 'recordId'], ['limit']);
        return dependencies.queryService.related({
          scope,
          recordId: text(args.recordId, 512),
          ...(optionalPositiveInteger(args.limit, 100) === undefined
            ? {}
            : { limit: optionalPositiveInteger(args.limit, 100) }),
          signal,
        });
      }
      case 'timeline':
      case 'sources': {
        const args = exactKeys(rawInput, ['operation'], ['limit']);
        const method = dependencies.queryService[operation].bind(dependencies.queryService);
        return method({
          scope,
          ...(optionalPositiveInteger(args.limit, 100) === undefined
            ? {}
            : { limit: optionalPositiveInteger(args.limit, 100) }),
          signal,
        });
      }
      case 'checkpoint': {
        exactKeys(rawInput, ['operation']);
        return dependencies.queryService.checkpoint({ scope, signal });
      }
      case 'investigate': {
        const args = exactKeys(rawInput, ['operation', 'query']);
        return dependencies.rlmRuntime.investigate({
          question: text(args.query),
          scope,
          budget: rlmBudget,
          signal,
        });
      }
    }
  };

  return Object.freeze({ name: RLM_OPENCODE_TOOL_NAME, execute });
}
