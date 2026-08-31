import { describe, expect, it, vi } from 'vitest';
import type { JarvisEvent, JarvisRun } from '@/lib/jarvis/contracts/execution';
import {
  CAO_TARGET_LEASE_MAX_MS,
  createCaoTargetAuthority,
  type CaoLiveTarget,
  type CaoTargetRegistry,
} from './caoTargetAuthority';

const NOW = 10_000;

function run(overrides: Partial<JarvisRun> = {}): JarvisRun {
  return {
    id: 'jrun-cao',
    accountId: 'account-a',
    workspaceId: 'workspace-a',
    projectId: 'project-a',
    chatId: 'chat-a',
    source: 'typed_chat',
    status: 'running',
    agentId: 'jarvis-cao',
    identityVersion: 1,
    profileRevisionId: 'profile-revision-a',
    model: {
      connectionId: 'connection-cao',
      providerId: 'openai-codex',
      modelId: 'gpt-5.6-terra',
      connectionMode: 'native-api',
      capabilities: { cao: true },
      capturedAt: 1,
    },
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

function target(overrides: Partial<CaoLiveTarget> = {}): CaoLiveTarget {
  return {
    kind: 'chat',
    targetId: 'chat-a',
    accountId: 'account-a',
    workspaceId: 'workspace-a',
    projectId: 'project-a',
    revision: 7,
    selected: true,
    locked: false,
    ...overrides,
  };
}

function harness(initialTargets: CaoLiveTarget[] = [target()]) {
  let currentRun = run();
  const rows: JarvisEvent[] = [];
  const targets = new Map(
    initialTargets.map((value) => [`${value.kind}:${value.targetId}`, value]),
  );
  const registry: CaoTargetRegistry = {
    claimExact: vi.fn(async (input) => {
      const claimed: CaoLiveTarget[] = [];
      for (const requested of input.targets) {
        const key = `${requested.kind}:${requested.targetId}`;
        const value = targets.get(key);
        if (!value) return { applied: false as const, reason: 'missing' as const };
        if (value.ownerLeaseId && value.ownerLeaseId !== input.leaseId) {
          return { applied: false as const, reason: 'owned' as const };
        }
        claimed.push({ ...value, ownerLeaseId: input.leaseId });
      }
      for (const value of claimed) targets.set(`${value.kind}:${value.targetId}`, value);
      return { applied: true as const, targets: claimed };
    }),
    readExact: vi.fn(async (input: Parameters<CaoTargetRegistry['readExact']>[0]) =>
      input.targets.flatMap((requested) => {
        const value = targets.get(`${requested.kind}:${requested.targetId}`);
        return value ? [{ ...value }] : [];
      }),
    ),
    releaseExact: vi.fn(async (input) => {
      for (const requested of input.targets) {
        const key = `${requested.kind}:${requested.targetId}`;
        const value = targets.get(key);
        if (value && value.ownerLeaseId === input.leaseId) {
          targets.set(key, { ...value, ownerLeaseId: undefined });
        }
      }
    }),
  };
  const appendEvent = vi.fn(async (_accountId, runId, event) => {
    const row = { ...structuredClone(event), runId, seq: rows.length + 1 } as JarvisEvent;
    rows.push(row);
    return structuredClone(row);
  });
  const deps = {
    runs: { getRun: vi.fn(async () => structuredClone(currentRun)) },
    journal: { appendEvent },
    events: {
      listByRun: vi.fn(async (_accountId, _runId, options = {}) => {
        const afterSeq = options.afterSeq ?? 0;
        return structuredClone(rows.filter((row) => row.seq > afterSeq).slice(0, options.limit));
      }),
    },
    registry,
    now: vi.fn(() => NOW),
    newLeaseId: vi.fn(() => `cao_lease_${rows.length + 1}`),
  };
  return {
    deps,
    registry,
    rows,
    targets,
    setRun(value: JarvisRun) {
      currentRun = value;
    },
  };
}

const scope = {
  accountId: 'account-a',
  workspaceId: 'workspace-a',
  projectId: 'project-a',
  runId: 'jrun-cao',
} as const;

describe('CAO explicit target authority', () => {
  it('grants no target by default and rejects implicit or malformed multi-target selection', async () => {
    const h = harness([target(), target({ kind: 'terminal', targetId: 'terminal-a' })]);
    const authority = createCaoTargetAuthority(h.deps);

    await expect(authority.acquire({ ...scope, leaseMs: 5_000 } as never)).rejects.toThrow(
      'cao_target_selection_required',
    );
    await expect(
      authority.acquire({
        ...scope,
        leaseMs: 5_000,
        selection: {
          mode: 'explicit_single',
          targets: [
            { kind: 'chat', targetId: 'chat-a' },
            { kind: 'terminal', targetId: 'terminal-a' },
          ],
        },
      }),
    ).rejects.toThrow('cao_target_selection_invalid');
    expect(h.registry.claimExact).not.toHaveBeenCalled();
    expect(h.rows).toEqual([]);
  });

  it('persists exact target revisions and recovers the same bounded authority after reload', async () => {
    const h = harness();
    const first = createCaoTargetAuthority(h.deps);
    const acquired = await first.acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });

    expect(acquired).toMatchObject({
      schemaVersion: 1,
      kind: 'cao_target_lease',
      leaseId: 'cao_lease_1',
      ...scope,
      targets: [{ kind: 'chat', targetId: 'chat-a', revision: 7 }],
      acquiredAt: NOW,
      expiresAt: NOW + 5_000,
    });
    expect(h.rows[0]).toMatchObject({
      type: 'context',
      safeSummary: 'Authorized 1 explicit CAO target for a bounded lease.',
      caoTargetLease: acquired,
    });

    const reloaded = createCaoTargetAuthority(h.deps);
    await expect(reloaded.verify({ ...scope, leaseId: acquired.leaseId })).resolves.toEqual(
      acquired,
    );
  });

  it.each([
    ['unknown schema version', { schemaVersion: 2 }],
    ['invalid temporal bounds', { acquiredAt: NOW + 6_000 }],
    [
      'duplicate target identity',
      {
        selectionMode: 'explicit_set',
        targets: [
          { kind: 'chat', targetId: 'chat-a', revision: 7 },
          { kind: 'chat', targetId: 'chat-a', revision: 7 },
        ],
      },
    ],
  ])('rejects a persisted lease with %s before registry recovery', async (_case, corruption) => {
    const h = harness();
    const authority = createCaoTargetAuthority(h.deps);
    const acquired = await authority.acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    const row = h.rows[0] as unknown as { caoTargetLease: Record<string, unknown> };
    row.caoTargetLease = { ...row.caoTargetLease, ...corruption };
    vi.mocked(h.registry.readExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).verify({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow('cao_target_journal_invalid');
    expect(h.registry.readExact).not.toHaveBeenCalled();
  });

  it('rolls back a registry claim when ambiguous append recovery finds a corrupt lease', async () => {
    const h = harness();
    h.deps.journal.appendEvent.mockImplementationOnce(async (_accountId, runId, event) => {
      h.rows.push({
        ...structuredClone(event),
        runId,
        seq: 1,
        caoTargetLease: { ...event.caoTargetLease!, schemaVersion: 2 },
      } as unknown as JarvisEvent);
      throw new Error('ambiguous durable append');
    });

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow('cao_target_lease_persistence_failed');
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('rejects duplicate durable records for one lease identity during reload', async () => {
    const h = harness();
    const authority = createCaoTargetAuthority(h.deps);
    const acquired = await authority.acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.rows.push({ ...structuredClone(h.rows[0]!), seq: 2 } as JarvisEvent);
    vi.mocked(h.registry.readExact).mockClear();

    await expect(authority.verify({ ...scope, leaseId: acquired.leaseId })).rejects.toThrow(
      'cao_target_journal_invalid',
    );
    expect(h.registry.readExact).not.toHaveBeenCalled();
  });

  it('rejects crossed event lineage before reusing a valid-looking persisted lease', async () => {
    const h = harness();
    const authority = createCaoTargetAuthority(h.deps);
    const acquired = await authority.acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.rows[0] = { ...h.rows[0]!, runId: 'jrun-other' };
    vi.mocked(h.registry.readExact).mockClear();

    await expect(authority.verify({ ...scope, leaseId: acquired.leaseId })).rejects.toThrow(
      'cao_target_journal_invalid',
    );
    expect(h.registry.readExact).not.toHaveBeenCalled();
  });

  it('rejects non-monotonic durable event order before lease recovery', async () => {
    const h = harness();
    const authority = createCaoTargetAuthority(h.deps);
    const acquired = await authority.acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.rows[0] = { ...h.rows[0]!, seq: 2 };
    const { caoTargetLease: _lease, ...unrelated } = structuredClone(h.rows[0]!);
    h.rows.unshift({ ...unrelated, seq: 3, idempotencyKey: 'unrelated-context' } as JarvisEvent);
    vi.mocked(h.registry.readExact).mockClear();

    await expect(authority.verify({ ...scope, leaseId: acquired.leaseId })).rejects.toThrow(
      'cao_target_journal_invalid',
    );
    expect(h.registry.readExact).not.toHaveBeenCalled();
  });

  it('requires an explicit set for multiple targets and preserves exact chat/terminal isolation', async () => {
    const h = harness([
      target(),
      target({ kind: 'terminal', targetId: 'terminal-a', revision: 3 }),
    ]);
    const authority = createCaoTargetAuthority(h.deps);
    const lease = await authority.acquire({
      ...scope,
      leaseMs: CAO_TARGET_LEASE_MAX_MS,
      selection: {
        mode: 'explicit_set',
        targets: [
          { kind: 'chat', targetId: 'chat-a' },
          { kind: 'terminal', targetId: 'terminal-a' },
        ],
      },
    });

    expect(lease.targets).toEqual([
      { kind: 'chat', targetId: 'chat-a', revision: 7 },
      { kind: 'terminal', targetId: 'terminal-a', revision: 3 },
    ]);
    await expect(
      authority.acquire({
        ...scope,
        leaseMs: CAO_TARGET_LEASE_MAX_MS + 1,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow('cao_target_lease_duration_invalid');
  });

  it.each([
    ['account drift', { accountId: 'account-b' }, 'cao_target_scope_mismatch'],
    ['workspace drift', { workspaceId: 'workspace-b' }, 'cao_target_scope_mismatch'],
    ['project drift', { projectId: 'project-b' }, 'cao_target_scope_mismatch'],
    ['unselected', { selected: false }, 'cao_target_unselected'],
    ['locked', { locked: true }, 'cao_target_locked'],
    ['other owner', { ownerLeaseId: 'cao_lease_other' }, 'cao_target_lease_conflict'],
  ] as const)('rejects %s before persistence', async (_label, change, code) => {
    const h = harness([target(change)]);
    const authority = createCaoTargetAuthority(h.deps);
    await expect(
      authority.acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(code);
    expect(h.rows).toEqual([]);
  });

  it('fails closed on expiry, target revision drift, and run scope/status drift after reload', async () => {
    const h = harness();
    const authority = createCaoTargetAuthority(h.deps);
    const lease = await authority.acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });

    h.targets.set('chat:chat-a', { ...target(), revision: 8, ownerLeaseId: lease.leaseId });
    await expect(authority.verify({ ...scope, leaseId: lease.leaseId })).rejects.toThrow(
      'cao_target_revision_stale',
    );
    h.targets.set('chat:chat-a', { ...target(), ownerLeaseId: lease.leaseId });
    h.setRun(run({ status: 'completed' }));
    await expect(authority.verify({ ...scope, leaseId: lease.leaseId })).rejects.toThrow(
      'cao_run_inactive',
    );
    h.setRun(run());
    h.deps.now.mockReturnValue(NOW + 5_000);
    await expect(authority.verify({ ...scope, leaseId: lease.leaseId })).rejects.toThrow(
      'cao_target_lease_stale',
    );
  });

  it('uses the registry atomic claim to isolate concurrent leases and rolls back an unpersisted claim', async () => {
    const h = harness();
    const one = createCaoTargetAuthority({ ...h.deps, newLeaseId: () => 'cao_lease_one' });
    const two = createCaoTargetAuthority({ ...h.deps, newLeaseId: () => 'cao_lease_two' });
    const input = {
      ...scope,
      leaseMs: 5_000,
      selection: {
        mode: 'explicit_single' as const,
        targets: [{ kind: 'chat' as const, targetId: 'chat-a' }],
      },
    };

    const results = await Promise.allSettled([one.acquire(input), two.acquire(input)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(h.rows).toHaveLength(1);

    const rollback = harness();
    rollback.deps.journal.appendEvent.mockRejectedValueOnce(new Error('disk failure'));
    const authority = createCaoTargetAuthority(rollback.deps);
    await expect(authority.acquire(input)).rejects.toThrow('cao_target_lease_persistence_failed');
    expect(rollback.registry.releaseExact).toHaveBeenCalledOnce();
    expect(rollback.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });
});
