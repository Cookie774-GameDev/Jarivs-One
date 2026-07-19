import type { ActionRunContext } from '@/lib/actions/types';
import type { JarvisAuthorityBoundResult, JarvisRun } from '@/lib/jarvis/contracts/execution';
import type { JarvisApprovalV1 } from '@/lib/jarvis/contracts';
import type {
  JarvisCanonicalActionExecutionResult,
  JarvisKernelActionPort,
} from '@/lib/jarvis/approvalEngine';
import type { JarvisRequestAttempt } from '@/lib/jarvis/requestEnvelope';
import { canonicalizeBrowserJson, classifyRisk } from './browserActions';
import type {
  BrowserActionRisk,
  BrowserControlMode,
  BrowserJsonValue,
  BrowserReviewedAction,
} from './browserTypes';

export const BROWSER_OPERATOR_CAPABILITY_ID = 'browser.operator' as const;

export type BrowserApprovalAdapterErrorCode =
  | 'invalid_dependencies'
  | 'mutable_input'
  | 'invalid_record'
  | 'not_pending'
  | 'user_only'
  | 'account_mismatch'
  | 'run_mismatch'
  | 'context_mismatch'
  | 'secret_shaped_input';

export class BrowserApprovalAdapterError extends Error {
  constructor(readonly code: BrowserApprovalAdapterErrorCode) {
    super(`Browser approval adapter rejected: ${code}.`);
    this.name = 'BrowserApprovalAdapterError';
  }
}

export type BrowserApprovalParentReference = Readonly<{
  parentRun: JarvisRun;
  attempt: JarvisRequestAttempt;
  context: ActionRunContext;
  controlMode: BrowserControlMode;
}>;

export type BrowserCanonicalApprovalParametersV1 = Readonly<{
  schemaVersion: 1;
  reviewId: string;
  origin: string;
  tabId: string;
  frameId: string | null;
  target: Readonly<Record<string, BrowserJsonValue>>;
  parameters: Readonly<Record<string, BrowserJsonValue>>;
  parametersHash: string;
  reviewedHash: string;
  expectedEffect: string;
  reviewedRisk: BrowserActionRisk;
  capability: Readonly<{
    id: typeof BROWSER_OPERATOR_CAPABILITY_ID;
    operation: string;
  }>;
}>;

type BrowserActionPort = Pick<JarvisKernelActionPort, 'create' | 'executeAutoApprovedSafe'>;

export type BrowserApprovalAdapterResult =
  | Readonly<{
      kind: 'safe_execution';
      result: JarvisAuthorityBoundResult<JarvisCanonicalActionExecutionResult>;
    }>
  | Readonly<{
      kind: 'approval_created';
      result: JarvisAuthorityBoundResult<JarvisApprovalV1>;
    }>;

const REVIEWED_ACTION_KEYS = [
  'id',
  'accountId',
  'requester',
  'kind',
  'actionVersion',
  'origin',
  'tabId',
  'frameId',
  'target',
  'parameters',
  'parametersHash',
  'reviewedHash',
  'expectedEffect',
  'risk',
  'safeSummary',
  'status',
  'requestedAt',
  'expiresAt',
  'result',
] as const;

const PROTECTED_PARAMETER_KEYS = new Set([
  'password',
  'passphrase',
  'cookie',
  'setcookie',
  'authorization',
  'authorizationheader',
  'authheader',
  'apikey',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'bearertoken',
  'token',
  'clientsecret',
  'privatekey',
  'recoverycode',
  'recoveryphrase',
  'seedphrase',
  'mnemonic',
  'credentialhandle',
  'credentialhandleid',
  'secrethandle',
  'secrethandleid',
]);

function reject(code: BrowserApprovalAdapterErrorCode): never {
  throw new BrowserApprovalAdapterError(code);
}

function assertExactDataKeys(
  value: object,
  allowed: readonly string[],
  code: BrowserApprovalAdapterErrorCode,
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowedKeys.has(key)) reject(code);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !('value' in descriptor)) reject(code);
  }
}

function stableText(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value === value.trim() &&
    !value.includes('\u0000')
  );
}

function isDeeplyFrozenData(value: unknown, seen = new WeakSet<object>()): boolean {
  if (value === null || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) return false;
    if (!isDeeplyFrozenData(descriptor.value, seen)) return false;
  }
  return true;
}

function protectedKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (PROTECTED_PARAMETER_KEYS.has(normalized)) return true;
  return [
    'password',
    'passphrase',
    'cookie',
    'authorization',
    'apikey',
    'token',
    'clientsecret',
    'privatekey',
    'recoverycode',
    'recoveryphrase',
    'seedphrase',
    'mnemonic',
    'credentialhandle',
    'secrethandle',
  ].some((stem) => normalized.includes(stem));
}

function protectedText(value: string): boolean {
  return (
    /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----/i.test(value) ||
    /\b(?:bearer|basic)\s+[a-z0-9+/._=-]{8,}\b/i.test(value) ||
    /\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b/.test(value) ||
    /\b(?:sk|pk|api)[-_][a-z0-9_-]{16,}\b/i.test(value) ||
    /(?:password|cookie|authorization|api[_ -]?key|access[_ -]?token|client[_ -]?secret|recovery[_ -]?code)\s*[:=]/i.test(
      value,
    )
  );
}

function containsProtectedShape(value: BrowserJsonValue): boolean {
  if (typeof value === 'string') return protectedText(value);
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsProtectedShape);
  return Object.entries(value).some(
    ([key, nested]) =>
      protectedKey(key) ||
      (key.toLowerCase() === 'secret' && nested === true) ||
      containsProtectedShape(nested),
  );
}

function canonicalCopy<T>(value: BrowserJsonValue): T {
  return JSON.parse(canonicalizeBrowserJson(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && 'value' in descriptor) deepFreeze(descriptor.value);
  }
  return Object.freeze(value);
}

function validateDependencies(dependencies: Readonly<{ actions: BrowserActionPort }>): void {
  if (!dependencies || typeof dependencies !== 'object') reject('invalid_dependencies');
  assertExactDataKeys(dependencies, ['actions'], 'invalid_dependencies');
  const actions = dependencies.actions;
  if (!actions || typeof actions !== 'object') reject('invalid_dependencies');
  assertExactDataKeys(actions, ['create', 'executeAutoApprovedSafe'], 'invalid_dependencies');
  if (
    typeof actions.create !== 'function' ||
    typeof actions.executeAutoApprovedSafe !== 'function'
  ) {
    reject('invalid_dependencies');
  }
}

function validateRecord(action: Readonly<BrowserReviewedAction>): void {
  if (!action || typeof action !== 'object') reject('invalid_record');
  assertExactDataKeys(action, REVIEWED_ACTION_KEYS, 'invalid_record');
  if (!isDeeplyFrozenData(action)) reject('mutable_input');
  if (action.status !== 'pending') reject('not_pending');
  if (
    action.actionVersion !== 1 ||
    !stableText(action.id) ||
    !stableText(action.accountId) ||
    !stableText(action.kind) ||
    !action.kind.startsWith('browser.') ||
    !stableText(action.origin) ||
    !stableText(action.tabId) ||
    !stableText(action.parametersHash) ||
    !stableText(action.reviewedHash) ||
    !stableText(action.expectedEffect) ||
    !['safe', 'confirm', 'dangerous'].includes(action.risk) ||
    !Number.isSafeInteger(action.requestedAt) ||
    !Number.isSafeInteger(action.expiresAt) ||
    action.expiresAt <= action.requestedAt
  ) {
    reject('invalid_record');
  }
  canonicalizeBrowserJson(action.parameters);
  canonicalizeBrowserJson(action.target as unknown as BrowserJsonValue);
  if (
    containsProtectedShape(action.parameters) ||
    containsProtectedShape(action.target as unknown as BrowserJsonValue) ||
    protectedText(action.expectedEffect)
  ) {
    reject('secret_shaped_input');
  }
  if (classifyRisk(action.kind, action.parameters) !== action.risk) reject('invalid_record');
}

function validateParent(
  action: Readonly<BrowserReviewedAction>,
  parent: BrowserApprovalParentReference,
): void {
  if (!parent || typeof parent !== 'object') reject('context_mismatch');
  assertExactDataKeys(
    parent,
    ['parentRun', 'attempt', 'context', 'controlMode'],
    'context_mismatch',
  );
  if (
    !Object.isFrozen(parent) ||
    !Object.isFrozen(parent.parentRun) ||
    !Object.isFrozen(parent.attempt) ||
    !Object.isFrozen(parent.context)
  ) {
    reject('mutable_input');
  }
  if (parent.controlMode === 'user_only') reject('user_only');
  if (
    !['ask_every_action', 'allow_safe_session', 'agent_controlled'].includes(parent.controlMode)
  ) {
    reject('context_mismatch');
  }
  if (action.accountId !== parent.parentRun.accountId) reject('account_mismatch');
  if (
    parent.attempt.runId !== parent.parentRun.id ||
    (action.requester.runId !== undefined && action.requester.runId !== parent.parentRun.id)
  ) {
    reject('run_mismatch');
  }
  if (
    parent.context.source !== 'ai' ||
    parent.context.accountId !== parent.parentRun.accountId ||
    parent.context.runId !== parent.parentRun.id ||
    parent.context.requestId !== parent.attempt.requestId ||
    parent.context.attemptNumber !== parent.attempt.attemptNumber
  ) {
    reject('context_mismatch');
  }
}

function canonicalParameters(
  action: Readonly<BrowserReviewedAction>,
): BrowserCanonicalApprovalParametersV1 {
  const value: BrowserCanonicalApprovalParametersV1 = {
    schemaVersion: 1,
    reviewId: action.id,
    origin: action.origin,
    tabId: action.tabId,
    frameId: action.frameId ?? null,
    target: canonicalCopy(action.target as unknown as BrowserJsonValue),
    parameters: canonicalCopy(action.parameters),
    parametersHash: action.parametersHash,
    reviewedHash: action.reviewedHash,
    expectedEffect: action.expectedEffect,
    reviewedRisk: action.risk,
    capability: {
      id: BROWSER_OPERATOR_CAPABILITY_ID,
      operation: action.kind,
    },
  };
  return deepFreeze(canonicalCopy(value as unknown as BrowserJsonValue));
}

export function createBrowserApprovalAdapter(
  dependencies: Readonly<{ actions: BrowserActionPort }>,
): Readonly<{
  submit(
    action: Readonly<BrowserReviewedAction>,
    parent: BrowserApprovalParentReference,
  ): Promise<BrowserApprovalAdapterResult>;
}> {
  validateDependencies(dependencies);
  const actions = dependencies.actions;
  return Object.freeze({
    async submit(action, parent): Promise<BrowserApprovalAdapterResult> {
      validateRecord(action);
      validateParent(action, parent);
      const input = Object.freeze({
        parentRun: parent.parentRun,
        attempt: parent.attempt,
        actionId: action.kind,
        actionVersion: action.actionVersion,
        params: canonicalParameters(action),
        expiresAt: action.expiresAt,
      });
      if (action.risk === 'safe') {
        const result = await actions.executeAutoApprovedSafe(
          Object.freeze({ ...input, context: parent.context }),
        );
        return Object.freeze({ kind: 'safe_execution', result });
      }
      const result = await actions.create(input);
      return Object.freeze({ kind: 'approval_created', result });
    },
  });
}
