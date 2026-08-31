export interface CodexBackendIdentity {
  modelProvider: string;
  model: string;
  effort: string | null;
  serviceTier: string | null;
  cwd: string;
}

export type CodexExecutionMode =
  | { kind: 'ask' | 'plan' }
  | {
      kind: 'agent';
      approvalPolicy: 'on-request' | 'never';
      sandbox:
        | {
            kind: 'workspace-write';
            writableRoots: readonly string[];
            networkAccess: boolean;
          }
        | { kind: 'danger-full-access' };
    };

export interface CodexThreadRequestInput {
  requestId: string;
  identity: Readonly<CodexBackendIdentity>;
  mode: CodexExecutionMode;
}

export interface CodexThreadResumeRequestInput extends CodexThreadRequestInput {
  threadId: string;
}

export interface CodexTurnStartRequestInput extends CodexThreadResumeRequestInput {
  clientUserMessageId: string;
  text: string;
}

export type CodexThreadStartValidation =
  | { ok: true; threadId: string }
  | {
      ok: false;
      reason: 'invalid_response' | 'request_mismatch' | 'identity_mismatch';
      field: string;
    };

const MAX_IDENTIFIER = 256;
const MAX_TEXT = 1_048_576;
const MAX_WRITABLE_ROOTS = 16;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/+@-]*$/u;
const UNSAFE_CONTROL = /[\u0000-\u001f\u007f]/u;

type ApprovalPolicy = 'on-request' | 'never';
type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';
type SandboxPolicy =
  | { type: 'readOnly'; networkAccess: false }
  | {
      type: 'workspaceWrite';
      writableRoots: string[];
      networkAccess: boolean;
      excludeTmpdirEnvVar: true;
      excludeSlashTmp: true;
    }
  | { type: 'dangerFullAccess' };

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function requireIdentifier(value: string, label: string): string {
  if (
    !value ||
    value.length > MAX_IDENTIFIER ||
    UNSAFE_CONTROL.test(value) ||
    !SAFE_IDENTIFIER.test(value)
  ) {
    throw new Error(`Codex ${label} identifier is invalid.`);
  }
  return value;
}

function isAbsolutePath(value: string): boolean {
  if (!value || UNSAFE_CONTROL.test(value)) return false;
  const normalized = value.replaceAll('\\', '/');
  if (!/^([A-Za-z]:\/|\/\/[^/]+\/|\/)/u.test(normalized)) return false;
  return !normalized.split('/').some((part) => part === '..');
}

function requireAbsolutePath(value: string, label: string): string {
  if (!isAbsolutePath(value)) throw new Error(`Codex ${label} must be an absolute safe path.`);
  return value;
}

function requireIdentity(identity: Readonly<CodexBackendIdentity>): CodexBackendIdentity {
  return {
    modelProvider: requireIdentifier(identity.modelProvider, 'model provider'),
    model: requireIdentifier(identity.model, 'model'),
    effort:
      identity.effort === null ? null : requireIdentifier(identity.effort, 'reasoning effort'),
    serviceTier:
      identity.serviceTier === null
        ? null
        : requireIdentifier(identity.serviceTier, 'service tier'),
    cwd: requireAbsolutePath(identity.cwd, 'working directory'),
  };
}

function modePolicy(mode: CodexExecutionMode): {
  approvalPolicy: ApprovalPolicy;
  sandbox: SandboxMode;
  sandboxPolicy: SandboxPolicy;
} {
  if (!('sandbox' in mode)) {
    return {
      approvalPolicy: 'never',
      sandbox: 'read-only',
      sandboxPolicy: { type: 'readOnly', networkAccess: false },
    };
  }
  if (mode.sandbox.kind === 'danger-full-access') {
    return {
      approvalPolicy: mode.approvalPolicy,
      sandbox: 'danger-full-access',
      sandboxPolicy: { type: 'dangerFullAccess' },
    };
  }
  if (
    mode.sandbox.writableRoots.length === 0 ||
    mode.sandbox.writableRoots.length > MAX_WRITABLE_ROOTS
  ) {
    throw new Error('Codex Agent writable root count is invalid.');
  }
  const writableRoots = mode.sandbox.writableRoots.map((root) =>
    requireAbsolutePath(root, 'writable root'),
  );
  const uniqueRoots = new Set(
    writableRoots.map((root) =>
      /^[A-Za-z]:[\\/]/u.test(root) ? root.replaceAll('\\', '/').toLowerCase() : root,
    ),
  );
  if (uniqueRoots.size !== writableRoots.length) {
    throw new Error('Codex Agent writable roots must be unique.');
  }
  return {
    approvalPolicy: mode.approvalPolicy,
    sandbox: 'workspace-write',
    sandboxPolicy: {
      type: 'workspaceWrite',
      writableRoots,
      networkAccess: mode.sandbox.networkAccess,
      excludeTmpdirEnvVar: true,
      excludeSlashTmp: true,
    },
  };
}

function configFor(identity: Readonly<CodexBackendIdentity>): Record<string, string> | undefined {
  return identity.effort === null ? undefined : { model_reasoning_effort: identity.effort };
}

export function buildCodexThreadStartRequest(input: Readonly<CodexThreadRequestInput>) {
  const requestId = requireIdentifier(input.requestId, 'request');
  const identity = requireIdentity(input.identity);
  const policy = modePolicy(input.mode);
  return {
    id: requestId,
    method: 'thread/start' as const,
    params: {
      model: identity.model,
      modelProvider: identity.modelProvider,
      serviceTier: identity.serviceTier,
      cwd: identity.cwd,
      approvalPolicy: policy.approvalPolicy,
      approvalsReviewer: 'user' as const,
      sandbox: policy.sandbox,
      ...(configFor(identity) ? { config: configFor(identity) } : {}),
      ephemeral: false,
      threadSource: 'vibespace',
    },
  };
}

export function buildCodexThreadResumeRequest(input: Readonly<CodexThreadResumeRequestInput>) {
  const requestId = requireIdentifier(input.requestId, 'request');
  const threadId = requireIdentifier(input.threadId, 'thread');
  const identity = requireIdentity(input.identity);
  const policy = modePolicy(input.mode);
  return {
    id: requestId,
    method: 'thread/resume' as const,
    params: {
      threadId,
      model: identity.model,
      modelProvider: identity.modelProvider,
      serviceTier: identity.serviceTier,
      cwd: identity.cwd,
      approvalPolicy: policy.approvalPolicy,
      approvalsReviewer: 'user' as const,
      sandbox: policy.sandbox,
      ...(configFor(identity) ? { config: configFor(identity) } : {}),
      excludeTurns: true,
    },
  };
}

export function buildCodexTurnStartRequest(input: Readonly<CodexTurnStartRequestInput>) {
  const requestId = requireIdentifier(input.requestId, 'request');
  const threadId = requireIdentifier(input.threadId, 'thread');
  const clientUserMessageId = requireIdentifier(input.clientUserMessageId, 'message');
  const identity = requireIdentity(input.identity);
  const policy = modePolicy(input.mode);
  if (!input.text || input.text.length > MAX_TEXT || UNSAFE_CONTROL.test(input.text)) {
    throw new Error('Codex user text is invalid.');
  }
  return {
    id: requestId,
    method: 'turn/start' as const,
    params: {
      threadId,
      clientUserMessageId,
      input: [{ type: 'text' as const, text: input.text, text_elements: [] }],
      turnTrigger: 'user',
      cwd: identity.cwd,
      approvalPolicy: policy.approvalPolicy,
      approvalsReviewer: 'user' as const,
      sandboxPolicy: policy.sandboxPolicy,
      model: identity.model,
      serviceTierForTurn: identity.serviceTier,
      effort: identity.effort,
      summary: 'concise' as const,
    },
  };
}

function sandboxMatches(observed: Record<string, unknown> | undefined, expected: SandboxPolicy) {
  if (!observed || observed.type !== expected.type) return false;
  if (expected.type === 'readOnly') return observed.networkAccess === false;
  if (expected.type === 'dangerFullAccess') return true;
  return (
    observed.networkAccess === expected.networkAccess &&
    observed.excludeTmpdirEnvVar === true &&
    observed.excludeSlashTmp === true &&
    Array.isArray(observed.writableRoots) &&
    observed.writableRoots.length === expected.writableRoots.length &&
    observed.writableRoots.every((root, index) => root === expected.writableRoots[index])
  );
}

export function validateCodexThreadStartResponse(
  value: unknown,
  expectedRequestId: string,
  expectedIdentity: Readonly<CodexBackendIdentity>,
  expectedMode: CodexExecutionMode,
): CodexThreadStartValidation {
  const requestId = requireIdentifier(expectedRequestId, 'request');
  const identity = requireIdentity(expectedIdentity);
  const policy = modePolicy(expectedMode);
  const envelope = recordOf(value);
  if (!envelope) return { ok: false, reason: 'invalid_response', field: 'envelope' };
  if (envelope.id !== requestId) {
    return { ok: false, reason: 'request_mismatch', field: 'id' };
  }
  const result = recordOf(envelope.result);
  const thread = recordOf(result?.thread);
  const threadId = typeof thread?.id === 'string' ? thread.id : '';
  if (!result || !threadId || !SAFE_IDENTIFIER.test(threadId)) {
    return { ok: false, reason: 'invalid_response', field: 'threadId' };
  }
  const sandbox = recordOf(result.sandbox);
  if (!sandboxMatches(sandbox, policy.sandboxPolicy)) {
    return { ok: false, reason: 'identity_mismatch', field: 'sandbox' };
  }
  const comparisons: readonly [string, unknown, unknown][] = [
    ['model', result.model, identity.model],
    ['modelProvider', result.modelProvider, identity.modelProvider],
    ['serviceTier', result.serviceTier, identity.serviceTier],
    ['cwd', result.cwd, identity.cwd],
    ['approvalPolicy', result.approvalPolicy, policy.approvalPolicy],
    ['approvalsReviewer', result.approvalsReviewer, 'user'],
    ['reasoningEffort', result.reasoningEffort, identity.effort],
  ];
  for (const [field, observed, expected] of comparisons) {
    if (observed !== expected) {
      return { ok: false, reason: 'identity_mismatch', field };
    }
  }
  return { ok: true, threadId };
}
