import Dexie from 'dexie';
import type { AccountIdentity } from '@/lib/accountIdentity';
import type { JarvisDexie } from '@/lib/db';
import type { JarvisIdentityRevisionRow, JarvisProfileRow } from '@/lib/db/schema';
import {
  JARVIS_IDENTITY_ID,
  JARVIS_IDENTITY_POLICY,
  JARVIS_IDENTITY_VERSION,
  KNOWN_SHIPPED_JARVIS_PROMPT_HASHES,
  hashJarvisText,
  isProtectedJarvisAgent,
  normalizeLegacyJarvisPrompt,
} from '@/lib/jarvis/identity';

export type JarvisV3MigrationSource = 'legacy_agent' | 'clean_default';

export type JarvisV3MigrationResult = {
  accountId: string;
  profileId: string;
  identityRevisionId: string;
  migrationVersion: 3;
  source: JarvisV3MigrationSource;
  migrationSourcePromptHash?: string;
  migrated: boolean;
};

export type JarvisV3MigrationErrorCode =
  | 'migration_conflict'
  | 'profile_integrity_error'
  | 'invalid_account_identity';

export class JarvisV3MigrationError extends Error {
  readonly code: JarvisV3MigrationErrorCode;

  constructor(code: JarvisV3MigrationErrorCode) {
    super(code);
    this.name = 'JarvisV3MigrationError';
    this.code = code;
  }
}

export type JarvisV3ActivationResult =
  | { state: 'ready'; migration: JarvisV3MigrationResult }
  | {
      state: 'degraded';
      accountId: string;
      category: 'database_open_failed' | 'migration_failed' | 'identity_not_ready';
      retry: () => Promise<JarvisV3ActivationResult>;
    };

const IDENTITY_REVISION_ID = `jident_${JARVIS_IDENTITY_ID}_v${JARVIS_IDENTITY_VERSION}`;
// This protected revision is shipped data, not account-created data. Bind it to
// the approved specification date so every installation verifies one complete row.
const IDENTITY_REVISION_CREATED_AT = Date.UTC(2026, 6, 16);
const IDENTITY_REVISION_KEYS = Object.freeze([
  'core_hash',
  'created_at',
  'id',
  'identity_id',
  'response_contract_hash',
  'version',
]);
const knownShippedPromptHashes = new Set<string>(Object.values(KNOWN_SHIPPED_JARVIS_PROMPT_HASHES));

function assertAccountIdentity(identity: AccountIdentity): void {
  if (
    !identity ||
    typeof identity.accountId !== 'string' ||
    identity.accountId.length === 0 ||
    identity.accountId !== identity.accountId.trim() ||
    (identity.source !== 'local' && identity.source !== 'supabase')
  ) {
    throw new JarvisV3MigrationError('invalid_account_identity');
  }
}

async function hashExactUtf8(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto SHA-256 is unavailable.');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function defaultJarvisProfileId(accountId: string): Promise<string> {
  if (typeof accountId !== 'string' || accountId.length === 0 || accountId !== accountId.trim()) {
    throw new JarvisV3MigrationError('invalid_account_identity');
  }

  const digest = await hashExactUtf8(accountId);
  return `jprof_${digest.slice(0, 24)}`;
}

type MigrationSourceResolution = {
  source: JarvisV3MigrationSource;
  customInstructions: string;
  instructionSource: JarvisProfileRow['instruction_source'];
  migrationSourcePromptHash?: string;
  sourcePromptHash?: string;
};

async function resolveMigrationSource(
  db: JarvisDexie,
  identity: AccountIdentity,
): Promise<MigrationSourceResolution> {
  if (identity.source === 'supabase') {
    return {
      source: 'clean_default',
      customInstructions: '',
      instructionSource: 'none',
    };
  }

  const legacyAgent = await db.agents.filter((agent) => isProtectedJarvisAgent(agent)).first();
  if (!legacyAgent) {
    return {
      source: 'clean_default',
      customInstructions: '',
      instructionSource: 'none',
    };
  }

  const normalizedPrompt = normalizeLegacyJarvisPrompt(legacyAgent.system_prompt);
  const promptHash = await Dexie.waitFor(hashJarvisText(legacyAgent.system_prompt));
  if (knownShippedPromptHashes.has(promptHash)) {
    return {
      source: 'legacy_agent',
      customInstructions: '',
      instructionSource: 'none',
      migrationSourcePromptHash: promptHash,
    };
  }

  return {
    source: 'legacy_agent',
    customInstructions: normalizedPrompt,
    instructionSource: 'legacy_user_extension',
    migrationSourcePromptHash: promptHash,
    sourcePromptHash: promptHash,
  };
}

function isValidProtectedIdentityRevision(
  row: JarvisIdentityRevisionRow,
  coreHash: string,
  responseContractHash: string,
): boolean {
  return (
    JSON.stringify(Object.keys(row).sort()) === JSON.stringify(IDENTITY_REVISION_KEYS) &&
    row.id === IDENTITY_REVISION_ID &&
    row.identity_id === JARVIS_IDENTITY_ID &&
    row.version === JARVIS_IDENTITY_VERSION &&
    row.core_hash === coreHash &&
    row.response_contract_hash === responseContractHash &&
    row.created_at === IDENTITY_REVISION_CREATED_AT
  );
}

async function verifyOrSeedIdentityRevision(db: JarvisDexie): Promise<void> {
  const [coreHash, responseContractHash] = await Dexie.waitFor(
    Promise.all([
      hashJarvisText(JARVIS_IDENTITY_POLICY.identityCore),
      hashJarvisText(JARVIS_IDENTITY_POLICY.responseContract),
    ]),
  );
  const [byId, byVersion] = await Promise.all([
    db.jarvis_identity_revisions.get(IDENTITY_REVISION_ID),
    db.jarvis_identity_revisions
      .where('[identity_id+version]')
      .equals([JARVIS_IDENTITY_ID, JARVIS_IDENTITY_VERSION])
      .first(),
  ]);

  for (const existing of [byId, byVersion]) {
    if (existing && !isValidProtectedIdentityRevision(existing, coreHash, responseContractHash)) {
      throw new JarvisV3MigrationError('migration_conflict');
    }
  }

  if (byId && byVersion && JSON.stringify(byId) !== JSON.stringify(byVersion)) {
    throw new JarvisV3MigrationError('migration_conflict');
  }

  if (!byId && !byVersion) {
    await db.jarvis_identity_revisions.add({
      id: IDENTITY_REVISION_ID,
      identity_id: JARVIS_IDENTITY_ID,
      version: JARVIS_IDENTITY_VERSION,
      core_hash: coreHash,
      response_contract_hash: responseContractHash,
      created_at: IDENTITY_REVISION_CREATED_AT,
    });
  }
}

function hasMatchingMigrationMarker(
  row: JarvisProfileRow,
  accountId: string,
  profileId: string,
  source: MigrationSourceResolution,
): boolean {
  return (
    row.id === profileId &&
    row.account_id === accountId &&
    row.identity_version === JARVIS_IDENTITY_VERSION &&
    row.migration_version === 3 &&
    row.migration_source === source.source &&
    row.migration_source_prompt_hash === source.migrationSourcePromptHash &&
    Number.isFinite(row.migration_completed_at)
  );
}

function migrationResult(
  identity: AccountIdentity,
  profileId: string,
  source: MigrationSourceResolution,
  migrated: boolean,
): JarvisV3MigrationResult {
  return {
    accountId: identity.accountId,
    profileId,
    identityRevisionId: IDENTITY_REVISION_ID,
    migrationVersion: 3,
    source: source.source,
    ...(source.migrationSourcePromptHash === undefined
      ? {}
      : { migrationSourcePromptHash: source.migrationSourcePromptHash }),
    migrated,
  };
}

export async function migrateLegacyJarvisIdentityForAccount(
  db: JarvisDexie,
  identity: AccountIdentity,
): Promise<JarvisV3MigrationResult> {
  assertAccountIdentity(identity);
  const profileId = await defaultJarvisProfileId(identity.accountId);

  return db.transaction(
    'rw',
    db.agents,
    db.jarvis_identity_revisions,
    db.jarvis_profiles,
    async () => {
      const source = await resolveMigrationSource(db, identity);
      const now = Date.now();
      const accountProfiles = await db.jarvis_profiles
        .where('account_id')
        .equals(identity.accountId)
        .toArray();
      const existing = await db.jarvis_profiles.get(profileId);
      if (accountProfiles.some((profile) => profile.active !== 0 && profile.active !== 1)) {
        throw new JarvisV3MigrationError('profile_integrity_error');
      }
      const activeProfiles = accountProfiles.filter((profile) => profile.active === 1);
      if (activeProfiles.length > 1 || (!existing && activeProfiles.length > 0)) {
        throw new JarvisV3MigrationError('profile_integrity_error');
      }

      await verifyOrSeedIdentityRevision(db);

      if (existing) {
        if (!hasMatchingMigrationMarker(existing, identity.accountId, profileId, source)) {
          throw new JarvisV3MigrationError('migration_conflict');
        }
        return migrationResult(identity, profileId, source, false);
      }

      const profile: JarvisProfileRow = {
        id: profileId,
        account_id: identity.accountId,
        name: 'Jarvis',
        active: 1,
        identity_version: JARVIS_IDENTITY_VERSION,
        revision_id: `${profileId}_r1`,
        custom_instructions: source.customInstructions,
        instruction_source: source.instructionSource,
        memory_scope: 'none',
        voice_enabled: false,
        ...(source.sourcePromptHash === undefined
          ? {}
          : { source_prompt_hash: source.sourcePromptHash }),
        created_at: now,
        updated_at: now,
        migration_version: 3,
        migration_source: source.source,
        ...(source.migrationSourcePromptHash === undefined
          ? {}
          : { migration_source_prompt_hash: source.migrationSourcePromptHash }),
        migration_completed_at: now,
      };
      await db.jarvis_profiles.add(profile);

      return migrationResult(identity, profileId, source, true);
    },
  );
}

function degradedActivation(
  db: JarvisDexie,
  identity: AccountIdentity,
  category: 'database_open_failed' | 'migration_failed' | 'identity_not_ready',
): JarvisV3ActivationResult {
  return {
    state: 'degraded',
    accountId: typeof identity?.accountId === 'string' ? identity.accountId : '',
    category,
    retry: () => activateJarvisV3ForAccount(db, identity),
  };
}

export async function activateJarvisV3ForAccount(
  db: JarvisDexie,
  identity: AccountIdentity,
): Promise<JarvisV3ActivationResult> {
  try {
    assertAccountIdentity(identity);
  } catch {
    return degradedActivation(db, identity, 'identity_not_ready');
  }

  try {
    await db.open();
  } catch {
    return degradedActivation(db, identity, 'database_open_failed');
  }

  try {
    return {
      state: 'ready',
      migration: await migrateLegacyJarvisIdentityForAccount(db, identity),
    };
  } catch {
    return degradedActivation(db, identity, 'migration_failed');
  }
}
