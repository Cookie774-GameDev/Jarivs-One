import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TEST_INDEXED_DB, uniqueTestDbName } from '@/test/indexedDb';
import { createJarvisDb, type JarvisDexie } from '@/lib/db';
import { createProductionCaoTargetRegistry } from './productionTargetRegistry';

const scope = {
  accountId: 'account-1',
  workspaceId: 'workspace-1',
  projectId: 'project-1',
  runId: 'jrun-control-1',
  leaseId: 'lease-control-1',
};
const targets = [
  { kind: 'terminal' as const, targetId: 'terminal-1' },
  { kind: 'chat' as const, targetId: 'chat-1' },
];

describe('production CAO target registry', () => {
  let database: JarvisDexie;
  let now: number;

  beforeEach(async () => {
    now = 1_000;
    database = createJarvisDb(uniqueTestDbName('cao-target-registry'), TEST_INDEXED_DB);
    await database.open();
    await database.workspaces.put({
      id: scope.workspaceId as never,
      owner_id: scope.accountId,
      name: 'Workspace',
      created_at: 1,
      updated_at: 1,
    });
    await database.projects.put({
      id: scope.projectId as never,
      workspace_id: scope.workspaceId as never,
      name: 'Project',
      created_at: 1,
      updated_at: 1,
    });
    await database.chats.put({
      id: 'chat-1' as never,
      workspace_id: scope.workspaceId as never,
      project_id: scope.projectId as never,
      title: 'Chat',
      mode: 'chat',
      active_agent_ids: [],
      created_at: 1,
      updated_at: 4,
      archived: false,
    });
    await database.terminal_sessions.put({
      id: 'terminal-1' as never,
      workspace_id: scope.workspaceId as never,
      project_id: scope.projectId as never,
      title: 'Terminal',
      shell_command: 'pwsh',
      shell_args: [],
      status: 'running',
      cols: 80,
      rows: 24,
      one_shot: false,
      last_active_at: 8,
      created_at: 1,
    });
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  function registry() {
    return createProductionCaoTargetRegistry(database, () => now);
  }

  it('atomically claims an explicitly ordered mixed target set and reloads the same lease', async () => {
    const authority = registry();
    const request = { ...scope, expiresAt: 2_000, targets };
    const first = await authority.claimExact(request);
    const reloaded = await createProductionCaoTargetRegistry(database, () => now).claimExact({
      ...request,
      expiresAt: 9_000,
    });

    expect(first).toEqual(reloaded);
    expect(first).toEqual({
      applied: true,
      targets: [
        {
          kind: 'terminal',
          targetId: 'terminal-1',
          accountId: scope.accountId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          revision: 8,
          selected: true,
          locked: false,
          ownerLeaseId: scope.leaseId,
        },
        {
          kind: 'chat',
          targetId: 'chat-1',
          accountId: scope.accountId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          revision: 4,
          selected: true,
          locked: false,
          ownerLeaseId: scope.leaseId,
        },
      ],
    });
    const claims = await database.table('cao_target_claims').toArray();
    expect(claims).toHaveLength(2);
    expect(claims.every((claim) => claim.expiresAt === 2_000)).toBe(true);
  });

  it('rejects the whole set for missing, cross-scope, archived, or exited targets', async () => {
    const authority = registry();
    await expect(
      authority.claimExact({
        ...scope,
        expiresAt: 2_000,
        targets: [...targets, { kind: 'chat', targetId: 'missing' }],
      }),
    ).resolves.toEqual({ applied: false, reason: 'missing' });
    expect(await database.table('cao_target_claims').count()).toBe(0);

    await database.chats.update('chat-1' as never, { project_id: 'project-other' as never });
    await expect(authority.claimExact({ ...scope, expiresAt: 2_000, targets })).resolves.toEqual({
      applied: false,
      reason: 'scope_mismatch',
    });
    await database.chats.update('chat-1' as never, {
      project_id: scope.projectId as never,
      archived: true,
    });
    await expect(authority.claimExact({ ...scope, expiresAt: 2_000, targets })).resolves.toEqual({
      applied: false,
      reason: 'locked',
    });
    await database.chats.update('chat-1' as never, { archived: false });
    await database.terminal_sessions.update('terminal-1' as never, { status: 'exited' });
    await expect(authority.claimExact({ ...scope, expiresAt: 2_000, targets })).resolves.toEqual({
      applied: false,
      reason: 'locked',
    });
    expect(await database.table('cao_target_claims').count()).toBe(0);
  });

  it('rejects a foreign unexpired owner without leaving a partial claim', async () => {
    const authority = registry();
    await authority.claimExact({
      ...scope,
      runId: 'jrun-foreign',
      leaseId: 'lease-foreign',
      expiresAt: 2_000,
      targets: [targets[1]!],
    });

    await expect(authority.claimExact({ ...scope, expiresAt: 2_000, targets })).resolves.toEqual({
      applied: false,
      reason: 'owned',
    });
    const terminalClaim = await database.table('cao_target_claims').get(['terminal', 'terminal-1']);
    expect(terminalClaim).toBeUndefined();
  });

  it('reclaims expired orphan ownership but rejects same-lease revision drift', async () => {
    const authority = registry();
    await authority.claimExact({
      ...scope,
      runId: 'jrun-orphan',
      leaseId: 'lease-orphan',
      expiresAt: 1_100,
      targets,
    });
    now = 1_100;
    await expect(
      authority.claimExact({ ...scope, expiresAt: 2_000, targets }),
    ).resolves.toMatchObject({ applied: true });

    await database.chats.update('chat-1' as never, { updated_at: 5 });
    await expect(authority.claimExact({ ...scope, expiresAt: 2_000, targets })).resolves.toEqual({
      applied: false,
      reason: 'revision_conflict',
    });
  });

  it('reads current exact ownership and releases only the exact run and lease set', async () => {
    const authority = registry();
    const request = { ...scope, expiresAt: 2_000, targets };
    await authority.claimExact(request);
    await expect(
      authority.releaseExact({ ...scope, runId: 'jrun-foreign', targets }),
    ).rejects.toThrow('cao_target_release_conflict');
    expect((await authority.readExact(scopeAndTargets())).every((row) => row.ownerLeaseId)).toBe(
      true,
    );

    await authority.releaseExact(scopeAndTargets());
    expect(
      (await authority.readExact(scopeAndTargets())).every((row) => row.ownerLeaseId === undefined),
    ).toBe(true);
    await expect(authority.releaseExact(scopeAndTargets())).resolves.toBeUndefined();
  });

  it('never projects a caller-supplied account over the workspace owner truth', async () => {
    const authority = registry();
    await authority.claimExact({ ...scope, expiresAt: 2_000, targets });

    const observed = await authority.readExact({
      ...scopeAndTargets(),
      accountId: 'account-foreign',
    });
    expect(observed.map((row) => row.accountId)).toEqual(['account-1', 'account-1']);
  });

  function scopeAndTargets() {
    return { ...scope, targets };
  }
});
