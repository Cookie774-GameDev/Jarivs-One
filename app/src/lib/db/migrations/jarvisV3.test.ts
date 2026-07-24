import { createJarvisDb, type JarvisDexie } from '@/lib/db';
import { createJarvisRepositories } from '@/lib/db/jarvisRepositories';
import type { JarvisIdentityRevisionRow, JarvisProfileRow } from '@/lib/db/schema';
import { LEGACY_JARVIS_AGENT_COMPATIBILITY_PROMPT } from '@/lib/jarvis/builtinAgents';
import { TEST_INDEXED_DB, uniqueTestDbName } from '@/test/indexedDb';
import type { Agent } from '@/types/agent';
import {
  createJarvisIdentitySnapshot,
  JARVIS_IDENTITY_POLICY,
  JARVIS_IDENTITY_VERSION,
  hashJarvisText,
} from '@/lib/jarvis/identity';
import { compileJarvisPrompt } from '@/lib/jarvis/promptCompiler';
import { createJarvisProfileSnapshot } from '@/lib/jarvis/profiles/types';
import { createJarvisRequestEnvelope } from '@/lib/jarvis/requestEnvelope';
import {
  JarvisV3MigrationError,
  activateJarvisV3ForAccount,
  defaultJarvisProfileId,
  migrateLegacyJarvisIdentityForAccount,
  type JarvisV3ActivationResult,
  type JarvisV3MigrationResult,
} from './jarvisV3';

const SHIPPED_PROMPT = LEGACY_JARVIS_AGENT_COMPATIBILITY_PROMPT;

const NOW = 1_786_000_000_000;
const IDENTITY_REVISION_CREATED_AT = Date.UTC(2026, 6, 16);
const openedDatabases: JarvisDexie[] = [];

function makeAgent(input: {
  id: string;
  slug?: string;
  builtin?: boolean;
  systemPrompt?: string;
}): Agent {
  return {
    id: input.id,
    slug: input.slug ?? 'jarvis',
    name: `Agent ${input.id}`,
    description: 'Fixture agent',
    system_prompt: input.systemPrompt ?? SHIPPED_PROMPT,
    model: { provider: 'mock', model: 'fixture-model' },
    tools_allowed: ['fixture-tool'],
    memory_scope: 'workspace',
    temperature: 0.37,
    max_output_tokens: 3456,
    color_hue: 117,
    capabilities: ['reasoning'],
    builtin: input.builtin,
    effort: 'high',
    persona: 'jarvis',
    skills: ['fixture-skill'],
    source: input.builtin ? 'builtin' : 'user-form',
    created_at: NOW - 20,
    updated_at: NOW - 10,
  } as unknown as Agent;
}

async function openTestDb(prefix: string): Promise<JarvisDexie> {
  const db = createJarvisDb(uniqueTestDbName(prefix), TEST_INDEXED_DB);
  openedDatabases.push(db);
  await db.open();
  return db;
}

function profileFixture(
  input: Partial<JarvisProfileRow> & Pick<JarvisProfileRow, 'id' | 'account_id'>,
) {
  return {
    name: 'JARVIS',
    active: 1,
    identity_version: JARVIS_IDENTITY_VERSION,
    revision_id: `${input.id}_r1`,
    custom_instructions: '',
    instruction_source: 'none',
    memory_scope: 'profile',
    voice_enabled: true,
    created_at: NOW,
    updated_at: NOW,
    migration_version: 3,
    migration_source: 'clean_default',
    migration_completed_at: NOW,
    ...input,
  } satisfies JarvisProfileRow;
}

async function expectMigrationError(
  action: Promise<unknown>,
  code: JarvisV3MigrationError['code'],
): Promise<void> {
  await expect(action).rejects.toMatchObject({
    name: 'JarvisV3MigrationError',
    code,
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
  while (openedDatabases.length > 0) {
    const db = openedDatabases.pop();
    if (!db) continue;
    db.close();
    await db.delete();
  }
});

describe('defaultJarvisProfileId', () => {
  it('exposes the exact migration and activation surface', () => {
    expectTypeOf(defaultJarvisProfileId).toEqualTypeOf<(accountId: string) => Promise<string>>();
    expectTypeOf(migrateLegacyJarvisIdentityForAccount).toEqualTypeOf<
      (
        db: JarvisDexie,
        identity: { accountId: string; source: 'supabase' | 'local' },
      ) => Promise<JarvisV3MigrationResult>
    >();
    expectTypeOf(activateJarvisV3ForAccount).toEqualTypeOf<
      (
        db: JarvisDexie,
        identity: { accountId: string; source: 'supabase' | 'local' },
      ) => Promise<JarvisV3ActivationResult>
    >();
    expectTypeOf<JarvisV3MigrationError['code']>().toEqualTypeOf<
      'migration_conflict' | 'profile_integrity_error' | 'invalid_account_identity'
    >();
  });

  it('is deterministic, account-scoped, opaque, and validates the exact account ID', async () => {
    const first = await defaultJarvisProfileId('account-alpha');
    const repeated = await defaultJarvisProfileId('account-alpha');
    const other = await defaultJarvisProfileId('account-beta');

    expect(first).toBe(repeated);
    expect(first).toMatch(/^jprof_[0-9a-f]{24}$/);
    expect(first).not.toContain('account-alpha');
    expect(other).not.toBe(first);
    await expectMigrationError(defaultJarvisProfileId(''), 'invalid_account_identity');
    await expectMigrationError(defaultJarvisProfileId('   '), 'invalid_account_identity');
    await expectMigrationError(
      defaultJarvisProfileId(' account-alpha'),
      'invalid_account_identity',
    );
    await expectMigrationError(
      defaultJarvisProfileId('account-alpha '),
      'invalid_account_identity',
    );
  });
});

describe('migrateLegacyJarvisIdentityForAccount', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  it('seeds a known shipped local prompt once without treating it as custom instructions', async () => {
    const db = await openTestDb('jarvis-v3-known');
    await db.agents.add(makeAgent({ id: 'agent-protected', builtin: true }));
    const transactionSpy = vi.spyOn(db, 'transaction');

    const result = await migrateLegacyJarvisIdentityForAccount(db, {
      accountId: 'local-account',
      source: 'local',
    });
    const profile = await db.jarvis_profiles.get(result.profileId);
    const sourceHash = await hashJarvisText(SHIPPED_PROMPT);

    expect(result).toEqual({
      accountId: 'local-account',
      profileId: await defaultJarvisProfileId('local-account'),
      identityRevisionId: 'jident_jarvis_v1',
      migrationVersion: 3,
      source: 'legacy_agent',
      migrationSourcePromptHash: sourceHash,
      migrated: true,
    });
    expect(profile).toMatchObject({
      id: result.profileId,
      account_id: 'local-account',
      active: 1,
      identity_version: 1,
      revision_id: `${result.profileId}_r1`,
      custom_instructions: '',
      instruction_source: 'none',
      migration_version: 3,
      migration_source: 'legacy_agent',
      migration_source_prompt_hash: sourceHash,
      migration_completed_at: NOW,
    });
    expect(profile).not.toHaveProperty('source_prompt_hash');
    expect(await db.jarvis_identity_revisions.count()).toBe(1);
    expect(await db.jarvis_profiles.where('account_id').equals('local-account').count()).toBe(1);
    expect(transactionSpy).toHaveBeenCalledTimes(1);
    expect(transactionSpy.mock.calls[0]?.slice(0, 4)).toEqual([
      'rw',
      db.agents,
      db.jarvis_identity_revisions,
      db.jarvis_profiles,
    ]);
  });

  it('compiles the protected JARVIS prompt from a truly fresh install profile', async () => {
    const db = await openTestDb('jarvis-v3-fresh-compile');
    const accountId = 'fresh-install-account';

    const migration = await migrateLegacyJarvisIdentityForAccount(db, {
      accountId,
      source: 'local',
    });
    const repositories = createJarvisRepositories(db);
    const [identityRevision, profile] = await Promise.all([
      repositories.identity.getVersion('jarvis', JARVIS_IDENTITY_VERSION),
      repositories.profile.getActive(accountId),
    ]);
    if (!identityRevision || !profile) {
      throw new Error('Expected fresh migration to persist the protected identity and profile.');
    }

    const envelope = await createJarvisRequestEnvelope({
      attempt: {
        kind: 'initial',
        requestId: 'fresh-request',
        runId: 'fresh-run',
        attemptNumber: 1,
      },
      accountId,
      agent: { id: 'builtin-jarvis', slug: 'jarvis', builtin: true },
      surface: 'typed_chat',
      interactionMode: 'ask',
      identity: createJarvisIdentitySnapshot(identityRevision),
      profile: createJarvisProfileSnapshot(profile),
      model: {
        connectionId: 'fresh-local-connection',
        providerId: 'ollama',
        modelId: 'fixture-free-model',
        connectionMode: 'local',
        capabilities: { tools: true, vision: false },
        effectiveTemperature: 0.2,
        capturedAt: NOW,
      },
      capabilities: {
        capturedAt: NOW,
        tools: [],
        plugins: [],
        mcps: [],
        terminals: [],
        agents: [],
        entitlements: {
          source: 'local_development',
          capabilities: [],
        },
      },
      context: {
        items: [],
        budget: { maxChars: 32_000, usedChars: 0 },
        exclusions: [],
      },
      outputContract: {
        preserveStructuredBlocks: true,
        allowActionBlocks: true,
        allowPlanBlocks: true,
        allowQuestionBlocks: true,
        allowPermissionBlocks: true,
        voiceDelivery: 'validated_stream',
      },
      userText: 'Report readiness.',
      messageHistory: [],
      createdAt: NOW,
    });
    const compiled = compileJarvisPrompt(envelope);

    expect(migration).toMatchObject({
      accountId,
      source: 'clean_default',
      migrated: true,
      profileId: profile.id,
      identityRevisionId: identityRevision.id,
    });
    expect(identityRevision).toMatchObject({
      identityId: 'jarvis',
      version: JARVIS_IDENTITY_VERSION,
      coreHash: await hashJarvisText(JARVIS_IDENTITY_POLICY.identityCore),
      responseContractHash: await hashJarvisText(JARVIS_IDENTITY_POLICY.responseContract),
    });
    expect(profile).toMatchObject({
      accountId,
      identityVersion: JARVIS_IDENTITY_VERSION,
      revisionId: `${migration.profileId}_r1`,
      customInstructions: '',
      instructionSource: 'none',
      active: true,
    });
    expect(compiled.identityVersion).toBe(identityRevision.version);
    expect(compiled.profileRevisionId).toBe(profile.revisionId);
    expect(compiled.layers[0]?.content).toBe(JARVIS_IDENTITY_POLICY.responseContract);
    expect(compiled.layers[1]?.content).toBe(
      [
        `Protected identity version: ${identityRevision.version}`,
        `Identity core hash: ${identityRevision.coreHash}`,
        `Response contract hash: ${identityRevision.responseContractHash}`,
        JARVIS_IDENTITY_POLICY.identityCore,
      ].join('\n'),
    );
    expect(compiled.promptHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('preserves the complete normalized edited prompt and leaves every agent unchanged', async () => {
    const db = await openTestDb('jarvis-v3-edited');
    const protectedAgent = makeAgent({
      id: 'agent-protected',
      builtin: true,
      systemPrompt: '  Keep the first line.\r\n\r\nKeep the final line.  ',
    });
    const otherAgent = makeAgent({
      id: 'agent-other',
      slug: 'researcher',
      builtin: true,
      systemPrompt: 'OTHER AGENT MUST REMAIN UNCHANGED',
    });
    await db.agents.bulkAdd([protectedAgent, otherAgent]);
    const before = structuredClone(await db.agents.toArray());

    const result = await migrateLegacyJarvisIdentityForAccount(db, {
      accountId: 'edited-account',
      source: 'local',
    });
    const profile = await db.jarvis_profiles.get(result.profileId);
    const normalized = 'Keep the first line.\n\nKeep the final line.';
    const sourceHash = await hashJarvisText(normalized);

    expect(profile).toMatchObject({
      custom_instructions: normalized,
      instruction_source: 'legacy_user_extension',
      source_prompt_hash: sourceHash,
      migration_source_prompt_hash: sourceHash,
    });
    expect(await db.agents.toArray()).toEqual(before);
  });

  it('ignores a user-created jarvis slug collision when no protected row exists', async () => {
    const db = await openTestDb('jarvis-v3-user-collision');
    const userCollision = makeAgent({
      id: 'agent-user-collision',
      builtin: false,
      systemPrompt: 'USER COLLISION MUST NEVER MIGRATE',
    });
    await db.agents.add(userCollision);
    const before = structuredClone(await db.agents.toArray());

    const result = await migrateLegacyJarvisIdentityForAccount(db, {
      accountId: 'user-collision-account',
      source: 'local',
    });
    const profile = await db.jarvis_profiles.get(result.profileId);

    expect(result).toMatchObject({ source: 'clean_default', migrated: true });
    expect(result).not.toHaveProperty('migrationSourcePromptHash');
    expect(profile).toMatchObject({ custom_instructions: '', instruction_source: 'none' });
    expect(profile).not.toHaveProperty('source_prompt_hash');
    expect(await db.agents.toArray()).toEqual(before);
  });

  it('uses a clean default for a Supabase identity without reading or importing local prompt text', async () => {
    const db = await openTestDb('jarvis-v3-cloud');
    await db.agents.add(
      makeAgent({
        id: 'agent-protected',
        builtin: true,
        systemPrompt: 'LOCAL SECRET PROFILE TEXT MUST NOT CROSS THE CLOUD ACCOUNT BOUNDARY',
      }),
    );
    const agentFilterSpy = vi.spyOn(db.agents, 'filter');

    const result = await migrateLegacyJarvisIdentityForAccount(db, {
      accountId: 'cloud-account',
      source: 'supabase',
    });
    const profile = await db.jarvis_profiles.get(result.profileId);

    expect(result).toEqual({
      accountId: 'cloud-account',
      profileId: await defaultJarvisProfileId('cloud-account'),
      identityRevisionId: 'jident_jarvis_v1',
      migrationVersion: 3,
      source: 'clean_default',
      migrated: true,
    });
    expect(profile).toMatchObject({
      custom_instructions: '',
      instruction_source: 'none',
      migration_source: 'clean_default',
    });
    expect(profile).not.toHaveProperty('source_prompt_hash');
    expect(profile).not.toHaveProperty('migration_source_prompt_hash');
    expect(agentFilterSpy).not.toHaveBeenCalled();
  });

  it('rejects a non-canonical runtime identity source before any write', async () => {
    const db = await openTestDb('jarvis-v3-invalid-source');

    await expectMigrationError(
      migrateLegacyJarvisIdentityForAccount(db, {
        accountId: 'invalid-source-account',
        source: 'forged-source',
      } as unknown as Parameters<typeof migrateLegacyJarvisIdentityForAccount>[1]),
      'invalid_account_identity',
    );
    expect(await db.jarvis_identity_revisions.count()).toBe(0);
    expect(await db.jarvis_profiles.count()).toBe(0);
  });

  it('returns the matching marker unchanged and preserves every authorized mutable field', async () => {
    const db = await openTestDb('jarvis-v3-idempotent');
    await db.agents.add(
      makeAgent({
        id: 'agent-protected',
        builtin: true,
        systemPrompt: 'A complete legacy extension.',
      }),
    );
    const identity = { accountId: 'mutable-account', source: 'local' } as const;
    const first = await migrateLegacyJarvisIdentityForAccount(db, identity);
    const initial = await db.jarvis_profiles.get(first.profileId);
    if (!initial) throw new Error('Expected the initial profile.');

    const later = {
      ...initial,
      revision_id: `${first.profileId}_r9`,
      custom_instructions: 'Authorized current instructions',
      instruction_source: 'user' as const,
      source_prompt_hash: 'authorized-domain-hash',
      memory_scope: 'shared_selected' as const,
      voice_enabled: false,
      soul_revision_id: 'soul-revision-5',
      active: 0 as const,
      created_at: NOW - 900,
      updated_at: NOW + 900,
    };
    await db.jarvis_profiles.put(later);

    const repeated = await migrateLegacyJarvisIdentityForAccount(db, identity);

    expect(repeated).toEqual({ ...first, migrated: false });
    expect(await db.jarvis_profiles.get(first.profileId)).toEqual(later);
    expect(await db.jarvis_identity_revisions.count()).toBe(1);
    expect(await db.jarvis_profiles.where('account_id').equals(identity.accountId).count()).toBe(1);
  });

  it('fails closed when a completed local migration observes a changed source hash', async () => {
    const db = await openTestDb('jarvis-v3-source-conflict');
    const agent = makeAgent({
      id: 'agent-protected',
      builtin: true,
      systemPrompt: 'Original extension',
    });
    await db.agents.add(agent);
    const identity = { accountId: 'conflict-account', source: 'local' } as const;
    const first = await migrateLegacyJarvisIdentityForAccount(db, identity);
    const before = await db.jarvis_profiles.get(first.profileId);

    await db.agents.put({ ...agent, system_prompt: 'Changed extension', updated_at: NOW + 1 });

    await expectMigrationError(
      migrateLegacyJarvisIdentityForAccount(db, identity),
      'migration_conflict',
    );
    expect(await db.jarvis_profiles.get(first.profileId)).toEqual(before);
  });

  it.each([
    {
      name: 'identity version',
      mutate: (row: JarvisProfileRow): JarvisProfileRow => ({ ...row, identity_version: 2 }),
    },
    {
      name: 'migration version',
      mutate: (row: JarvisProfileRow): JarvisProfileRow =>
        ({ ...row, migration_version: 2 }) as unknown as JarvisProfileRow,
    },
    {
      name: 'migration source',
      mutate: (row: JarvisProfileRow): JarvisProfileRow => ({
        ...row,
        migration_source: 'legacy_agent',
      }),
    },
    {
      name: 'migration source prompt hash',
      mutate: (row: JarvisProfileRow): JarvisProfileRow => ({
        ...row,
        migration_source_prompt_hash: 'unexpected-source-hash',
      }),
    },
  ])('fails closed when the deterministic profile has a conflicting $name', async ({ mutate }) => {
    const db = await openTestDb('jarvis-v3-profile-marker-conflict');
    const accountId = 'deterministic-conflict-account';
    const profileId = await defaultJarvisProfileId(accountId);
    const conflicting = mutate(profileFixture({ id: profileId, account_id: accountId }));
    await db.jarvis_profiles.add(conflicting);

    await expectMigrationError(
      migrateLegacyJarvisIdentityForAccount(db, { accountId, source: 'supabase' }),
      'migration_conflict',
    );
    expect(await db.jarvis_profiles.get(profileId)).toEqual(conflicting);
    expect(await db.jarvis_identity_revisions.count()).toBe(0);
  });

  it('fails closed on multiple active profiles for the account', async () => {
    const db = await openTestDb('jarvis-v3-profile-integrity');
    await db.jarvis_profiles.bulkAdd([
      profileFixture({ id: 'profile-a', account_id: 'integrity-account' }),
      profileFixture({ id: 'profile-b', account_id: 'integrity-account' }),
    ]);

    await expectMigrationError(
      migrateLegacyJarvisIdentityForAccount(db, {
        accountId: 'integrity-account',
        source: 'supabase',
      }),
      'profile_integrity_error',
    );
  });

  it('fails closed instead of returning an inactive default beside another active profile', async () => {
    const db = await openTestDb('jarvis-v3-existing-active-profile');
    await db.jarvis_profiles.add(
      profileFixture({
        id: 'non-deterministic-active-profile',
        account_id: 'existing-active-account',
      }),
    );

    await expectMigrationError(
      migrateLegacyJarvisIdentityForAccount(db, {
        accountId: 'existing-active-account',
        source: 'supabase',
      }),
      'profile_integrity_error',
    );
    expect(await db.jarvis_profiles.count()).toBe(1);
    expect(await db.jarvis_identity_revisions.count()).toBe(0);
  });

  it('fails closed on a malformed persisted active flag', async () => {
    const db = await openTestDb('jarvis-v3-malformed-active-profile');
    await db.jarvis_profiles.add(
      profileFixture({
        id: 'malformed-active-profile',
        account_id: 'malformed-active-account',
        active: true as unknown as 0 | 1,
      }),
    );

    await expectMigrationError(
      migrateLegacyJarvisIdentityForAccount(db, {
        accountId: 'malformed-active-account',
        source: 'supabase',
      }),
      'profile_integrity_error',
    );
    expect(await db.jarvis_identity_revisions.count()).toBe(0);
  });

  it('fails closed when the deterministic profile ID belongs to another account', async () => {
    const db = await openTestDb('jarvis-v3-profile-owner-conflict');
    const deterministicId = await defaultJarvisProfileId('expected-account');
    await db.jarvis_profiles.add(
      profileFixture({
        id: deterministicId,
        account_id: 'foreign-account',
      }),
    );

    await expectMigrationError(
      migrateLegacyJarvisIdentityForAccount(db, {
        accountId: 'expected-account',
        source: 'supabase',
      }),
      'migration_conflict',
    );
    expect(await db.jarvis_identity_revisions.count()).toBe(0);
  });

  it.each([
    {
      name: 'deterministic identity ID',
      row: {
        id: 'jident_jarvis_v1',
        identity_id: 'jarvis',
        version: 1,
        core_hash: 'wrong-core-hash',
        response_contract_hash: 'wrong-response-hash',
        created_at: NOW,
      } satisfies JarvisIdentityRevisionRow,
    },
    {
      name: 'identity/version compound key',
      row: {
        id: 'conflicting-id',
        identity_id: 'jarvis',
        version: 1,
        core_hash: 'wrong-core-hash',
        response_contract_hash: 'wrong-response-hash',
        created_at: NOW,
      } satisfies JarvisIdentityRevisionRow,
    },
  ])('fails closed on a conflicting protected revision at the $name', async ({ row }) => {
    const db = await openTestDb('jarvis-v3-identity-conflict');
    await db.jarvis_identity_revisions.add(row);

    await expectMigrationError(
      migrateLegacyJarvisIdentityForAccount(db, {
        accountId: 'identity-conflict-account',
        source: 'supabase',
      }),
      'migration_conflict',
    );
    expect(await db.jarvis_profiles.count()).toBe(0);
  });

  it('seeds the immutable protected revision from the policy hashes', async () => {
    const db = await openTestDb('jarvis-v3-identity');
    await migrateLegacyJarvisIdentityForAccount(db, {
      accountId: 'identity-account',
      source: 'supabase',
    });

    expect(await db.jarvis_identity_revisions.get('jident_jarvis_v1')).toEqual({
      id: 'jident_jarvis_v1',
      identity_id: 'jarvis',
      version: JARVIS_IDENTITY_VERSION,
      core_hash: await hashJarvisText(JARVIS_IDENTITY_POLICY.identityCore),
      response_contract_hash: await hashJarvisText(JARVIS_IDENTITY_POLICY.responseContract),
      created_at: IDENTITY_REVISION_CREATED_AT,
    });
  });

  it('accepts one exact existing protected revision without reseeding it', async () => {
    const db = await openTestDb('jarvis-v3-existing-identity');
    const existing: JarvisIdentityRevisionRow = {
      id: 'jident_jarvis_v1',
      identity_id: 'jarvis',
      version: JARVIS_IDENTITY_VERSION,
      core_hash: await hashJarvisText(JARVIS_IDENTITY_POLICY.identityCore),
      response_contract_hash: await hashJarvisText(JARVIS_IDENTITY_POLICY.responseContract),
      created_at: IDENTITY_REVISION_CREATED_AT,
    };
    await db.jarvis_identity_revisions.add(existing);
    vi.mocked(Date.now).mockReturnValue(NOW + 10_000);
    const identity = { accountId: 'existing-identity-account', source: 'supabase' } as const;

    const first = await migrateLegacyJarvisIdentityForAccount(db, identity);
    const repeated = await migrateLegacyJarvisIdentityForAccount(db, identity);

    expect(first.migrated).toBe(true);
    expect(repeated).toEqual({ ...first, migrated: false });
    expect(await db.jarvis_identity_revisions.toArray()).toEqual([existing]);
  });

  it.each(['changed creation timestamp', 'unexpected own field'] as const)(
    'rejects an otherwise matching protected revision with a %s',
    async (variant) => {
      const db = await openTestDb(`jarvis-v3-complete-identity-${variant}`);
      const exact = {
        id: 'jident_jarvis_v1',
        identity_id: 'jarvis',
        version: JARVIS_IDENTITY_VERSION,
        core_hash: await hashJarvisText(JARVIS_IDENTITY_POLICY.identityCore),
        response_contract_hash: await hashJarvisText(JARVIS_IDENTITY_POLICY.responseContract),
        created_at: variant === 'changed creation timestamp' ? NOW : IDENTITY_REVISION_CREATED_AT,
      } satisfies JarvisIdentityRevisionRow;
      const forged =
        variant === 'unexpected own field'
          ? ({ ...exact, unexpected_authority: 'forged' } as unknown as JarvisIdentityRevisionRow)
          : exact;
      await db.jarvis_identity_revisions.add(forged);

      await expectMigrationError(
        migrateLegacyJarvisIdentityForAccount(db, {
          accountId: 'complete-row-conflict-account',
          source: 'supabase',
        }),
        'migration_conflict',
      );
      expect(await db.jarvis_profiles.count()).toBe(0);
    },
  );

  it.each([
    ['identity write', 'jarvis_identity_revisions'],
    ['profile and marker write', 'jarvis_profiles'],
  ] as const)('rolls the whole transaction back after a failed %s', async (_label, tableName) => {
    const db = await openTestDb(`jarvis-v3-rollback-${tableName}`);
    const protectedAgent = makeAgent({ id: 'agent-protected', builtin: true });
    const unrelatedAgent = makeAgent({
      id: 'agent-unrelated',
      slug: 'coder',
      builtin: true,
      systemPrompt: 'Unrelated',
    });
    await db.agents.bulkAdd([protectedAgent, unrelatedAgent]);
    const agentsBefore = structuredClone(await db.agents.toArray());
    const table = db[tableName] as unknown as {
      add(value: unknown): Promise<unknown>;
    };
    const originalAdd = table.add.bind(table);
    vi.spyOn(table, 'add').mockImplementation(async (value) => {
      const key = await originalAdd(value);
      throw new Error(`Injected failure after ${String(key)}`);
    });

    await expect(
      migrateLegacyJarvisIdentityForAccount(db, {
        accountId: 'rollback-account',
        source: 'local',
      }),
    ).rejects.toThrow('Injected failure');
    expect(await db.jarvis_identity_revisions.count()).toBe(0);
    expect(await db.jarvis_profiles.count()).toBe(0);
    expect(await db.agents.toArray()).toEqual(agentsBefore);
  });
});

describe('activateJarvisV3ForAccount', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  it('maps database-open failure to a retryable bounded degraded result', async () => {
    const db = createJarvisDb(uniqueTestDbName('jarvis-v3-open-failure'), TEST_INDEXED_DB);
    openedDatabases.push(db);
    const openSpy = vi.spyOn(db, 'open').mockRejectedValueOnce(new Error('sensitive open detail'));

    const degraded = await activateJarvisV3ForAccount(db, {
      accountId: 'retry-account',
      source: 'supabase',
    });

    expect(degraded).toMatchObject({
      state: 'degraded',
      accountId: 'retry-account',
      category: 'database_open_failed',
    });
    if (degraded.state !== 'degraded') throw new Error('Expected degraded activation.');
    openSpy.mockRestore();
    await expect(degraded.retry()).resolves.toMatchObject({ state: 'ready' });
  });

  it('maps identity validation and migration conflicts to their bounded categories', async () => {
    const db = await openTestDb('jarvis-v3-activation-categories');

    await expect(
      activateJarvisV3ForAccount(db, { accountId: ' invalid', source: 'local' }),
    ).resolves.toMatchObject({ state: 'degraded', category: 'identity_not_ready' });

    await db.jarvis_identity_revisions.add({
      id: 'jident_jarvis_v1',
      identity_id: 'jarvis',
      version: 1,
      core_hash: 'wrong',
      response_contract_hash: 'wrong',
      created_at: NOW,
    });
    await expect(
      activateJarvisV3ForAccount(db, { accountId: 'migration-account', source: 'supabase' }),
    ).resolves.toMatchObject({ state: 'degraded', category: 'migration_failed' });
  });

  it('preserves a repository-created later profile revision across reactivation', async () => {
    const db = await openTestDb('jarvis-v3-reactivation-profile-revision');
    const accountId = 'reactivation-account';
    const firstActivation = await activateJarvisV3ForAccount(db, {
      accountId,
      source: 'local',
    });
    expect(firstActivation).toMatchObject({
      state: 'ready',
      migration: { accountId, migrated: true },
    });
    if (firstActivation.state !== 'ready') throw new Error('Expected ready first activation.');

    const repositories = createJarvisRepositories(db, {
      now: () => NOW + 500,
      newProfileRevisionId: () => 'jprof_rev_reactivation',
    });
    const beforeUpdate = await db.jarvis_profiles.get(firstActivation.migration.profileId);
    if (!beforeUpdate) throw new Error('Expected the activated profile row.');

    const updated = await repositories.profile.updateCustomInstructions(
      accountId,
      beforeUpdate.id,
      'First line\r\nSecond line',
    );
    expect(updated).toMatchObject({
      id: beforeUpdate.id,
      accountId,
      revisionId: 'jprof_rev_reactivation',
      customInstructions: 'First line\nSecond line',
      instructionSource: 'user',
      updatedAt: NOW + 500,
    });

    const reactivated = await activateJarvisV3ForAccount(db, { accountId, source: 'local' });
    expect(reactivated).toMatchObject({
      state: 'ready',
      migration: { accountId, profileId: beforeUpdate.id, migrated: false },
    });
    expect(await db.jarvis_profiles.get(beforeUpdate.id)).toEqual({
      ...beforeUpdate,
      revision_id: 'jprof_rev_reactivation',
      custom_instructions: 'First line\nSecond line',
      instruction_source: 'user',
      updated_at: NOW + 500,
    });
  });
});
