import type { ExistingPluginCredentialAdapter } from '@/features/plugins/credentials';
import {
  withPluginCredentialLocatorLocks,
  type ExistingPluginCredentialLocator,
  type JarvisExistingCredentialAuthorization,
  type JarvisExistingCredentialAuthorizationAuthority,
} from '@/features/plugins/credentialAuthorization';

export type JarvisSecretHandleScope = {
  accountId: string;
  actionId: string;
  actionVersion: number;
  field: string;
  handleId: string;
};

export type JarvisSecretHandleValidation =
  | { valid: true }
  | {
      valid: false;
      reason:
        | 'not_found'
        | 'consumed'
        | 'invalidated'
        | 'boot_mismatch'
        | 'account_mismatch'
        | 'action_mismatch'
        | 'version_mismatch'
        | 'field_mismatch'
        | 'credential_account_unbound'
        | 'credential_account_mismatch'
        | 'credential_grant_stale'
        | 'credential_grant_unavailable'
        | 'credential_grant_storage_failed';
    };

type JarvisSecretHandleFailureReason = Extract<
  JarvisSecretHandleValidation,
  { valid: false }
>['reason'];

export class JarvisSecretHandleError extends Error {
  readonly code: JarvisSecretHandleFailureReason;

  constructor(code: JarvisSecretHandleFailureReason) {
    super(`Secret handle unavailable: ${code}.`);
    this.name = 'JarvisSecretHandleError';
    this.code = code;
  }
}

export interface JarvisSecretHandlePort {
  validate(scope: JarvisSecretHandleScope): Promise<JarvisSecretHandleValidation>;
  resolveOnce(scope: JarvisSecretHandleScope): Promise<string>;
}

type ExistingCredentialBinding = {
  field: string;
  handleId: string;
  authorization: JarvisExistingCredentialAuthorization;
};

type StoredBinding = ExistingCredentialBinding & {
  accountId: string;
  actionId: string;
  actionVersion: number;
};

const handleBootIds = new Map<string, string>();

function exactNonblank(value: string, label: string): void {
  if (!value || value.trim() !== value) throw new Error(`${label} must be a nonblank exact ID.`);
}

function assertBindingInput(input: {
  accountId: string;
  actionId: string;
  actionVersion: number;
  field: string;
  locator: ExistingPluginCredentialLocator;
}): void {
  exactNonblank(input.accountId, 'Account ID');
  exactNonblank(input.actionId, 'Action ID');
  exactNonblank(input.field, 'Secret field');
  exactNonblank(input.locator.pluginId, 'Plugin ID');
  exactNonblank(input.locator.fieldId, 'Plugin field ID');
  if (!Number.isSafeInteger(input.actionVersion) || input.actionVersion <= 0) {
    throw new Error('Action version must be a positive safe integer.');
  }
}

function failure(reason: JarvisSecretHandleFailureReason): JarvisSecretHandleValidation {
  return { valid: false, reason };
}

function throwFailure(decision: JarvisSecretHandleValidation): never {
  if (decision.valid) throw new Error('Expected a secret handle failure.');
  throw new JarvisSecretHandleError(decision.reason);
}

/** @internal Imported only by trusted security composition and focused tests. */
export function createJarvisSecretHandleAuthority(input: {
  credentials: ExistingPluginCredentialAdapter;
  credentialAuthorization: JarvisExistingCredentialAuthorizationAuthority;
  bootId: string;
  randomUUID: () => string;
}): {
  port: JarvisSecretHandlePort;
  bindExistingCredential(binding: {
    accountId: string;
    actionId: string;
    actionVersion: number;
    field: string;
    locator: ExistingPluginCredentialLocator;
  }): Promise<ExistingCredentialBinding>;
  invalidateAccount(accountId: string): void;
  invalidateAll(): void;
} {
  exactNonblank(input.bootId, 'Boot ID');
  const bindings = new Map<string, StoredBinding>();
  const terminal = new Map<string, 'consumed' | 'invalidated'>();
  const issuedHandleIds = new Set<string>();

  const inspect = (
    scope: JarvisSecretHandleScope,
  ): JarvisSecretHandleValidation | StoredBinding => {
    const ownerBootId = handleBootIds.get(scope.handleId);
    if (ownerBootId !== undefined && ownerBootId !== input.bootId) return failure('boot_mismatch');
    const terminalState = terminal.get(scope.handleId);
    if (terminalState) return failure(terminalState);
    const binding = bindings.get(scope.handleId);
    if (!binding) return failure('not_found');
    if (scope.accountId !== binding.accountId) return failure('account_mismatch');
    if (scope.actionId !== binding.actionId) return failure('action_mismatch');
    if (scope.actionVersion !== binding.actionVersion) return failure('version_mismatch');
    if (scope.field !== binding.field) return failure('field_mismatch');
    return binding;
  };

  const port: JarvisSecretHandlePort = Object.freeze({
    async validate(scope: JarvisSecretHandleScope): Promise<JarvisSecretHandleValidation> {
      const inspected = inspect(scope);
      if ('valid' in inspected) return inspected;
      const decision = await input.credentialAuthorization.revalidate(inspected.authorization);
      return decision.authorized ? { valid: true as const } : failure(decision.reason);
    },
    async resolveOnce(scope: JarvisSecretHandleScope): Promise<string> {
      const inspected = inspect(scope);
      if ('valid' in inspected) return throwFailure(inspected);
      return await withPluginCredentialLocatorLocks(
        [inspected.authorization.locator],
        async (locks) => {
          const lockedBinding = inspect(scope);
          if ('valid' in lockedBinding) return throwFailure(lockedBinding);
          const before = await input.credentialAuthorization.revalidateLocked({
            authorization: lockedBinding.authorization,
            locks,
          });
          if (!before.authorized) throw new JarvisSecretHandleError(before.reason);

          bindings.delete(scope.handleId);
          terminal.set(scope.handleId, 'consumed');

          let value: string | undefined;
          try {
            value = await input.credentials.readExistingCredential(
              lockedBinding.authorization.locator,
            );
          } catch {
            throw new JarvisSecretHandleError('credential_grant_unavailable');
          }
          if (value === undefined) {
            throw new JarvisSecretHandleError('credential_grant_unavailable');
          }
          const after = await input.credentialAuthorization.revalidateLocked({
            authorization: lockedBinding.authorization,
            locks,
          });
          if (!after.authorized) throw new JarvisSecretHandleError(after.reason);
          return value;
        },
      );
    },
  });

  return Object.freeze({
    port,
    async bindExistingCredential(binding: {
      accountId: string;
      actionId: string;
      actionVersion: number;
      field: string;
      locator: ExistingPluginCredentialLocator;
    }) {
      assertBindingInput(binding);
      const decision = await input.credentialAuthorization.authorize({
        accountId: binding.accountId,
        locator: binding.locator,
      });
      if (!decision.authorized) throw new JarvisSecretHandleError(decision.reason);
      const randomId = input.randomUUID();
      exactNonblank(randomId, 'Secret handle ID');
      const handleId = `jsecret_${randomId}`;
      if (issuedHandleIds.has(handleId)) throw new JarvisSecretHandleError('not_found');
      const stored: StoredBinding = Object.freeze({
        accountId: binding.accountId,
        actionId: binding.actionId,
        actionVersion: binding.actionVersion,
        field: binding.field,
        handleId,
        authorization: decision.authorization,
      });
      issuedHandleIds.add(handleId);
      bindings.set(handleId, stored);
      handleBootIds.set(handleId, input.bootId);
      return Object.freeze({
        field: stored.field,
        handleId: stored.handleId,
        authorization: stored.authorization,
      });
    },
    invalidateAccount(accountId: string) {
      for (const [handleId, binding] of bindings) {
        if (binding.accountId !== accountId) continue;
        bindings.delete(handleId);
        terminal.set(handleId, 'invalidated');
      }
    },
    invalidateAll() {
      for (const handleId of bindings.keys()) terminal.set(handleId, 'invalidated');
      bindings.clear();
    },
  });
}
