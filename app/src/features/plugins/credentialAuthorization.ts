export type ExistingPluginCredentialLocator = Readonly<{
  pluginId: string;
  fieldId: string;
}>;

export const PLUGIN_CREDENTIAL_ACCOUNT_GRANTS_KEY = 'jarvis.pluginCredentialAccountGrants.v1';

export type PluginCredentialAccountGrantV1 = Readonly<{
  schemaVersion: 1;
  accountId: string;
  pluginId: string;
  fieldId: string;
  grantId: string;
  revision: number;
  grantedAt: number;
  source: 'explicit_account_save';
}>;

export type PluginCredentialGrantIdentityV1 = Readonly<
  Pick<
    PluginCredentialAccountGrantV1,
    'accountId' | 'pluginId' | 'fieldId' | 'grantId' | 'revision'
  >
>;

export type PluginCredentialGrantExpectedStateV1 =
  | Readonly<{ state: 'absent' }>
  | Readonly<{ state: 'present'; grant: PluginCredentialGrantIdentityV1 }>;

const pluginCredentialLocatorLockSetBrand: unique symbol = Symbol(
  'jarvis.plugin-credential-locator-lock-set',
);

export type PluginCredentialLocatorLockSet = Readonly<{
  locators: readonly ExistingPluginCredentialLocator[];
  [pluginCredentialLocatorLockSetBrand]: true;
}>;

export interface PluginCredentialAccountGrantRepository {
  get(
    locator: ExistingPluginCredentialLocator,
  ): Promise<PluginCredentialAccountGrantV1 | undefined>;
  getLocked(input: {
    locks: PluginCredentialLocatorLockSet;
    locator: ExistingPluginCredentialLocator;
  }): Promise<PluginCredentialAccountGrantV1 | undefined>;
  replaceExact(input: {
    locks: PluginCredentialLocatorLockSet;
    expected: PluginCredentialGrantExpectedStateV1;
    grant: PluginCredentialAccountGrantV1;
  }): Promise<void>;
  removeExact(input: {
    locks: PluginCredentialLocatorLockSet;
    locator: ExistingPluginCredentialLocator;
    expected: PluginCredentialGrantIdentityV1;
  }): Promise<void>;
}

export interface StrictPluginCredentialGrantStorage {
  readRaw(): string | null;
  compareAndSetRaw(input: { expectedRaw: string | null; nextRaw: string | null }): void;
}

export class PluginCredentialGrantStorageError extends Error {
  readonly code: 'credential_grant_storage_conflict' | 'credential_grant_storage_failed';

  constructor(code: PluginCredentialGrantStorageError['code']) {
    super(
      code === 'credential_grant_storage_conflict'
        ? 'Plugin credential grant storage changed concurrently.'
        : 'Plugin credential grant storage is unavailable.',
    );
    this.name = 'PluginCredentialGrantStorageError';
    this.code = code;
  }
}

function storageFailure(error: unknown): PluginCredentialGrantStorageError {
  return error instanceof PluginCredentialGrantStorageError
    ? error
    : new PluginCredentialGrantStorageError('credential_grant_storage_failed');
}

export function createStrictPluginCredentialGrantStorage(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
): StrictPluginCredentialGrantStorage {
  const readRaw = (): string | null => {
    try {
      return storage.getItem(PLUGIN_CREDENTIAL_ACCOUNT_GRANTS_KEY);
    } catch (error) {
      throw storageFailure(error);
    }
  };

  return Object.freeze({
    readRaw,
    compareAndSetRaw({
      expectedRaw,
      nextRaw,
    }: {
      expectedRaw: string | null;
      nextRaw: string | null;
    }) {
      const currentRaw = readRaw();
      if (currentRaw !== expectedRaw) {
        throw new PluginCredentialGrantStorageError('credential_grant_storage_conflict');
      }
      try {
        if (nextRaw === null) storage.removeItem(PLUGIN_CREDENTIAL_ACCOUNT_GRANTS_KEY);
        else storage.setItem(PLUGIN_CREDENTIAL_ACCOUNT_GRANTS_KEY, nextRaw);
      } catch (error) {
        throw storageFailure(error);
      }
      try {
        if (readRaw() === nextRaw) return;
      } catch {
        // The write is not durable evidence until readback succeeds. Restore below.
      }
      try {
        if (expectedRaw === null) storage.removeItem(PLUGIN_CREDENTIAL_ACCOUNT_GRANTS_KEY);
        else storage.setItem(PLUGIN_CREDENTIAL_ACCOUNT_GRANTS_KEY, expectedRaw);
      } catch {
        // Preserve the original fail-closed result even if best-effort restoration fails.
      }
      throw new PluginCredentialGrantStorageError('credential_grant_storage_failed');
    },
  });
}

function exactNonblank(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function canonicalLocator(locator: ExistingPluginCredentialLocator): string {
  if (!exactNonblank(locator.pluginId) || !exactNonblank(locator.fieldId)) {
    throw new PluginCredentialGrantStorageError('credential_grant_storage_failed');
  }
  return `${locator.pluginId}\u0000${locator.fieldId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

const GRANT_FIELDS = [
  'schemaVersion',
  'accountId',
  'pluginId',
  'fieldId',
  'grantId',
  'revision',
  'grantedAt',
  'source',
] as const;

function validatedGrant(value: unknown): PluginCredentialAccountGrantV1 | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join('\u0000') !== [...GRANT_FIELDS].sort().join('\u0000')
  ) {
    return undefined;
  }
  if (
    value.schemaVersion !== 1 ||
    !exactNonblank(value.accountId) ||
    !exactNonblank(value.pluginId) ||
    !exactNonblank(value.fieldId) ||
    !exactNonblank(value.grantId) ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) <= 0 ||
    typeof value.grantedAt !== 'number' ||
    !Number.isFinite(value.grantedAt) ||
    value.source !== 'explicit_account_save'
  ) {
    return undefined;
  }
  return Object.freeze({
    schemaVersion: 1,
    accountId: value.accountId,
    pluginId: value.pluginId,
    fieldId: value.fieldId,
    grantId: value.grantId,
    revision: value.revision as number,
    grantedAt: value.grantedAt,
    source: 'explicit_account_save',
  });
}

type GrantMap = Record<string, PluginCredentialAccountGrantV1>;

function parseGrantMap(raw: string | null): GrantMap {
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) throw new Error('invalid');
    const result: GrantMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      const grant = validatedGrant(value);
      if (!grant || canonicalLocator(grant) !== key) throw new Error('invalid');
      result[key] = grant;
    }
    return result;
  } catch {
    throw new PluginCredentialGrantStorageError('credential_grant_storage_failed');
  }
}

function serializeGrantMap(map: GrantMap): string | null {
  const entries = Object.entries(map).sort(([left], [right]) => left.localeCompare(right));
  return entries.length === 0 ? null : JSON.stringify(Object.fromEntries(entries));
}

function sameIdentity(
  grant: PluginCredentialAccountGrantV1,
  expected: PluginCredentialGrantIdentityV1,
): boolean {
  return (
    grant.accountId === expected.accountId &&
    grant.pluginId === expected.pluginId &&
    grant.fieldId === expected.fieldId &&
    grant.grantId === expected.grantId &&
    grant.revision === expected.revision
  );
}

const locatorQueues = new Map<string, Promise<void>>();
const activeLockSets = new WeakSet<object>();

async function acquireLocator(key: string): Promise<() => void> {
  const predecessor = locatorQueues.get(key) ?? Promise.resolve();
  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const tail = predecessor.then(() => current);
  locatorQueues.set(key, tail);
  await predecessor;
  return () => {
    releaseCurrent();
    if (locatorQueues.get(key) === tail) locatorQueues.delete(key);
  };
}

export async function withPluginCredentialLocatorLocks<T>(
  locators: readonly ExistingPluginCredentialLocator[],
  body: (locks: PluginCredentialLocatorLockSet) => Promise<T>,
): Promise<T> {
  if (locators.length === 0) throw new Error('At least one credential locator is required.');
  const canonical = locators.map((locator) => ({
    key: canonicalLocator(locator),
    locator: Object.freeze({ pluginId: locator.pluginId, fieldId: locator.fieldId }),
  }));
  const unique = new Set(canonical.map(({ key }) => key));
  if (unique.size !== canonical.length) throw new Error('Duplicate credential locator.');
  canonical.sort((left, right) => left.key.localeCompare(right.key));

  const releases: Array<() => void> = [];
  try {
    for (const { key } of canonical) releases.push(await acquireLocator(key));
    const locks = Object.freeze({
      locators: Object.freeze(canonical.map(({ locator }) => locator)),
      [pluginCredentialLocatorLockSetBrand]: true as const,
    });
    activeLockSets.add(locks);
    try {
      return await body(locks);
    } finally {
      activeLockSets.delete(locks);
    }
  } finally {
    for (let index = releases.length - 1; index >= 0; index -= 1) releases[index]!();
  }
}

function assertLocked(
  locks: PluginCredentialLocatorLockSet,
  locator: ExistingPluginCredentialLocator,
): void {
  const key = canonicalLocator(locator);
  if (
    !activeLockSets.has(locks) ||
    locks[pluginCredentialLocatorLockSetBrand] !== true ||
    !locks.locators.some((candidate) => canonicalLocator(candidate) === key)
  ) {
    throw new Error('Credential locator lock is unavailable.');
  }
}

export function createPluginCredentialAccountGrantRepository(input: {
  storage: StrictPluginCredentialGrantStorage;
}): PluginCredentialAccountGrantRepository {
  const read = (): { raw: string | null; map: GrantMap } => {
    try {
      const raw = input.storage.readRaw();
      return { raw, map: parseGrantMap(raw) };
    } catch (error) {
      throw storageFailure(error);
    }
  };

  const repository: PluginCredentialAccountGrantRepository = {
    get(locator) {
      return withPluginCredentialLocatorLocks([locator], (locks) =>
        repository.getLocked({ locks, locator }),
      );
    },
    async getLocked({ locks, locator }) {
      assertLocked(locks, locator);
      return read().map[canonicalLocator(locator)];
    },
    async replaceExact({ locks, expected, grant }) {
      const validated = validatedGrant(grant);
      if (!validated)
        throw new PluginCredentialGrantStorageError('credential_grant_storage_failed');
      const locator = { pluginId: validated.pluginId, fieldId: validated.fieldId };
      assertLocked(locks, locator);
      const key = canonicalLocator(locator);
      const { raw, map } = read();
      const current = map[key];
      const matches =
        expected.state === 'absent'
          ? current === undefined
          : current !== undefined && sameIdentity(current, expected.grant);
      if (!matches) {
        throw new PluginCredentialGrantStorageError('credential_grant_storage_conflict');
      }
      input.storage.compareAndSetRaw({
        expectedRaw: raw,
        nextRaw: serializeGrantMap({ ...map, [key]: validated }),
      });
    },
    async removeExact({ locks, locator, expected }) {
      assertLocked(locks, locator);
      const key = canonicalLocator(locator);
      const { raw, map } = read();
      const current = map[key];
      if (!current || !sameIdentity(current, expected)) {
        throw new PluginCredentialGrantStorageError('credential_grant_storage_conflict');
      }
      const next = { ...map };
      delete next[key];
      input.storage.compareAndSetRaw({ expectedRaw: raw, nextRaw: serializeGrantMap(next) });
    },
  };
  return Object.freeze(repository);
}

const jarvisExistingCredentialAuthorizationBrand: unique symbol = Symbol(
  'jarvis.existing-credential-authorization',
);

export type JarvisExistingCredentialAuthorization = Readonly<{
  accountId: string;
  locator: ExistingPluginCredentialLocator;
  grantId: string;
  revision: number;
  [jarvisExistingCredentialAuthorizationBrand]: true;
}>;

export type JarvisExistingCredentialAuthorizationDecision =
  | { authorized: true; authorization: JarvisExistingCredentialAuthorization }
  | {
      authorized: false;
      reason:
        | 'credential_account_unbound'
        | 'credential_account_mismatch'
        | 'credential_grant_stale'
        | 'credential_grant_unavailable'
        | 'credential_grant_storage_failed';
    };

export interface JarvisExistingCredentialAuthorizationAuthority {
  authorize(input: {
    accountId: string;
    locator: ExistingPluginCredentialLocator;
  }): Promise<JarvisExistingCredentialAuthorizationDecision>;
  revalidate(
    authorization: JarvisExistingCredentialAuthorization,
  ): Promise<JarvisExistingCredentialAuthorizationDecision>;
  revalidateLocked(input: {
    authorization: JarvisExistingCredentialAuthorization;
    locks: PluginCredentialLocatorLockSet;
  }): Promise<JarvisExistingCredentialAuthorizationDecision>;
}

export function createJarvisExistingCredentialAuthorization(input: {
  grants: PluginCredentialAccountGrantRepository;
  getActiveAccountId(): string | undefined;
}): JarvisExistingCredentialAuthorizationAuthority {
  const issued = new WeakSet<object>();

  const denyStorage = (error: unknown): JarvisExistingCredentialAuthorizationDecision => {
    if (error instanceof PluginCredentialGrantStorageError) {
      return { authorized: false, reason: 'credential_grant_storage_failed' };
    }
    return { authorized: false, reason: 'credential_grant_unavailable' };
  };

  const evaluateExisting = (
    authorization: JarvisExistingCredentialAuthorization,
    current: PluginCredentialAccountGrantV1 | undefined,
  ): JarvisExistingCredentialAuthorizationDecision => {
    if (!issued.has(authorization)) return { authorized: false, reason: 'credential_grant_stale' };
    if (input.getActiveAccountId() !== authorization.accountId) {
      return { authorized: false, reason: 'credential_account_mismatch' };
    }
    if (!current) return { authorized: false, reason: 'credential_grant_unavailable' };
    if (current.accountId !== authorization.accountId) {
      return { authorized: false, reason: 'credential_account_mismatch' };
    }
    if (current.grantId !== authorization.grantId || current.revision !== authorization.revision) {
      return { authorized: false, reason: 'credential_grant_stale' };
    }
    return { authorized: true, authorization };
  };

  const authority: JarvisExistingCredentialAuthorizationAuthority = {
    async authorize({ accountId, locator }) {
      if (!exactNonblank(accountId) || input.getActiveAccountId() !== accountId) {
        return { authorized: false, reason: 'credential_account_mismatch' };
      }
      try {
        const current = await input.grants.get(locator);
        if (!current) return { authorized: false, reason: 'credential_account_unbound' };
        if (current.accountId !== accountId) {
          return { authorized: false, reason: 'credential_account_mismatch' };
        }
        const authorization = Object.freeze({
          accountId,
          locator: Object.freeze({ pluginId: locator.pluginId, fieldId: locator.fieldId }),
          grantId: current.grantId,
          revision: current.revision,
          [jarvisExistingCredentialAuthorizationBrand]: true as const,
        });
        issued.add(authorization);
        return { authorized: true, authorization };
      } catch (error) {
        return denyStorage(error);
      }
    },
    async revalidate(authorization) {
      if (!issued.has(authorization))
        return { authorized: false, reason: 'credential_grant_stale' };
      try {
        return evaluateExisting(authorization, await input.grants.get(authorization.locator));
      } catch (error) {
        return denyStorage(error);
      }
    },
    async revalidateLocked({ authorization, locks }) {
      if (!issued.has(authorization))
        return { authorized: false, reason: 'credential_grant_stale' };
      try {
        return evaluateExisting(
          authorization,
          await input.grants.getLocked({ locks, locator: authorization.locator }),
        );
      } catch (error) {
        return denyStorage(error);
      }
    },
  };
  return Object.freeze(authority);
}
