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

function ambiguouslyCommit(
  h: ReturnType<typeof harness>,
  mutate?: (row: JarvisEvent) => void,
): void {
  h.deps.journal.appendEvent.mockImplementationOnce(async (_accountId, runId, event) => {
    const row = { ...structuredClone(event), runId, seq: h.rows.length + 1 } as JarvisEvent;
    h.rows.push(row);
    mutate?.(row);
    throw new Error('ambiguous append transport failure');
  });
}

const scope = {
  accountId: 'account-a',
  workspaceId: 'workspace-a',
  projectId: 'project-a',
  runId: 'jrun-cao',
} as const;

describe('CAO explicit target authority', () => {
  it.each([
    ['control-bearing account', { ...scope, accountId: 'account\nprivate' }],
    ['oversized run', { ...scope, runId: 'r'.repeat(129) }],
  ])('rejects %s scope before journal or registry access', async (_case, malformedScope) => {
    const h = harness();
    const authority = createCaoTargetAuthority(h.deps);

    await expect(
      authority.acquire({
        ...malformedScope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow('cao_target_scope_invalid');
    expect(h.deps.runs.getRun).not.toHaveBeenCalled();
    expect(h.registry.claimExact).not.toHaveBeenCalled();
  });

  it('rejects a control-bearing target before run or registry access', async () => {
    const h = harness();
    const authority = createCaoTargetAuthority(h.deps);

    await expect(
      authority.acquire({
        ...scope,
        leaseMs: 5_000,
        selection: {
          mode: 'explicit_single',
          targets: [{ kind: 'chat', targetId: 'chat-a\nprivate' }],
        },
      }),
    ).rejects.toThrow('cao_target_selection_invalid');
    expect(h.deps.runs.getRun).not.toHaveBeenCalled();
    expect(h.registry.claimExact).not.toHaveBeenCalled();
  });

  it('rejects a generated control-bearing lease identity before claim mutation', async () => {
    const h = harness();
    h.deps.newLeaseId.mockReturnValue('lease\nprivate');

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow('cao_target_lease_id_invalid');
    expect(h.registry.claimExact).not.toHaveBeenCalled();
    expect(h.rows).toEqual([]);
  });

  it('rejects a recovered oversized lease identity before run or journal access', async () => {
    const h = harness();
    const authority = createCaoTargetAuthority(h.deps);

    await expect(authority.verify({ ...scope, leaseId: 'l'.repeat(129) })).rejects.toThrow(
      'cao_target_lease_id_invalid',
    );
    expect(h.deps.runs.getRun).not.toHaveBeenCalled();
    expect(h.deps.events.listByRun).not.toHaveBeenCalled();
  });

  it.each([
    ['acquire', { ...scope, privatePath: 'private/acquire/path' }],
    ['verify', { ...scope, leaseId: 'lease-a', implicitRenew: true }],
    ['release', { ...scope, leaseId: 'lease-a', privatePayload: 'private-release' }],
  ])('rejects unknown %s fields before authority dependencies', async (operation, drifted) => {
    const h = harness();
    const authority = createCaoTargetAuthority(h.deps);
    const pending =
      operation === 'acquire'
        ? authority.acquire({
            ...drifted,
            leaseMs: 5_000,
            selection: {
              mode: 'explicit_single',
              targets: [{ kind: 'chat', targetId: 'chat-a' }],
            },
          } as never)
        : operation === 'verify'
          ? authority.verify(drifted as never)
          : authority.release(drifted as never);

    await expect(pending).rejects.toThrow('cao_target_input_invalid');
    expect(h.deps.runs.getRun).not.toHaveBeenCalled();
    expect(h.deps.events.listByRun).not.toHaveBeenCalled();
    expect(h.registry.claimExact).not.toHaveBeenCalled();
  });

  it.each([
    [
      'selection metadata',
      { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }], renew: true },
    ],
    [
      'target metadata',
      {
        mode: 'explicit_single',
        targets: [{ kind: 'chat', targetId: 'chat-a', privatePath: 'private/target' }],
      },
    ],
  ])('rejects unknown %s before run or registry access', async (_case, selection) => {
    const h = harness();

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection,
      } as never),
    ).rejects.toThrow('cao_target_selection_invalid');
    expect(h.deps.runs.getRun).not.toHaveBeenCalled();
    expect(h.registry.claimExact).not.toHaveBeenCalled();
  });

  it('sends only the canonical claim contract to the registry', async () => {
    const h = harness();

    await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });

    expect(Object.keys(vi.mocked(h.registry.claimExact).mock.calls[0]?.[0] ?? {}).sort()).toEqual([
      'accountId',
      'expiresAt',
      'leaseId',
      'projectId',
      'runId',
      'targets',
      'workspaceId',
    ]);
  });

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
    ).rejects.toThrow('cao_target_journal_invalid');
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('preserves journal-unavailable truth while reconciling an ambiguous append', async () => {
    const h = harness();
    h.deps.journal.appendEvent.mockRejectedValueOnce(
      new Error('private ambiguous append adapter payload'),
    );
    h.deps.events.listByRun.mockRejectedValueOnce(
      new Error('private ambiguous reconciliation payload'),
    );

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_journal_unavailable$/);
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('reports registry unavailability when ambiguous-journal cleanup retains ownership', async () => {
    const h = harness();
    h.deps.journal.appendEvent.mockRejectedValueOnce(
      new Error('private ambiguous append adapter payload'),
    );
    h.deps.events.listByRun.mockRejectedValueOnce(
      new Error('private ambiguous reconciliation payload'),
    );
    h.registry.releaseExact = vi.fn(async () => {
      throw new Error('private ambiguous cleanup payload');
    });

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_registry_unavailable$/);
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe('cao_lease_1');
  });

  it('cleans exact ownership when an ambiguous commit disappears on its final durable read', async () => {
    const h = harness();
    ambiguouslyCommit(h);
    h.deps.events.listByRun
      .mockImplementationOnce(async () => structuredClone(h.rows))
      .mockRejectedValueOnce(new Error('private second durable read payload'));

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_journal_unavailable$/);
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('revalidates a valid ambiguously committed lease against the live registry', async () => {
    const h = harness();
    ambiguouslyCommit(h);
    vi.mocked(h.registry.readExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).resolves.toMatchObject({ leaseId: 'cao_lease_1', targets: [{ revision: 7 }] });
    expect(h.registry.readExact).toHaveBeenCalledTimes(2);
    expect(h.registry.claimExact).toHaveBeenCalledOnce();
  });

  it('rejects revision drift after an ambiguous durable commit without reacquiring', async () => {
    const h = harness();
    ambiguouslyCommit(h, (row) => {
      h.targets.set('chat:chat-a', {
        ...target(),
        revision: 8,
        ownerLeaseId: row.caoTargetLease!.leaseId,
      });
    });

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow('cao_target_revision_stale');
    expect(h.registry.claimExact).toHaveBeenCalledOnce();
  });

  it('rejects ownership and run drift after an ambiguous durable commit', async () => {
    const ownerDrift = harness();
    ambiguouslyCommit(ownerDrift, () => {
      ownerDrift.targets.set('chat:chat-a', {
        ...target(),
        ownerLeaseId: 'cao_lease_other',
      });
    });
    await expect(
      createCaoTargetAuthority(ownerDrift.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow('cao_target_lease_conflict');
    expect(ownerDrift.registry.claimExact).toHaveBeenCalledOnce();

    const runDrift = harness();
    ambiguouslyCommit(runDrift, () => runDrift.setRun(run({ status: 'completed' })));
    await expect(
      createCaoTargetAuthority(runDrift.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow('cao_run_inactive');
    expect(runDrift.registry.claimExact).toHaveBeenCalledOnce();
  });

  it('rejects expiry after an ambiguous durable commit and releases exact ownership', async () => {
    const h = harness();
    ambiguouslyCommit(h, () => h.deps.now.mockReturnValue(NOW + 5_000));

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow('cao_target_lease_stale');
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

  it.each([
    ['mismatched idempotency lineage', { idempotencyKey: 'cao-target-lease:other' }],
    ['wrong event type', { type: 'tool' as const }],
    ['earlier persistence timestamp', { createdAt: NOW - 1 }],
    ['later persistence timestamp', { createdAt: NOW + 1 }],
  ])('rejects a recovered lease with %s before registry reuse', async (_label, mutation) => {
    const h = harness();
    const authority = createCaoTargetAuthority(h.deps);
    const acquired = await authority.acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.rows[0] = { ...h.rows[0]!, ...mutation } as JarvisEvent;
    vi.mocked(h.registry.readExact).mockClear();

    await expect(authority.recover({ ...scope, leaseId: acquired.leaseId })).rejects.toThrow(
      /^cao_target_journal_invalid$/,
    );
    expect(h.registry.readExact).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe(acquired.leaseId);
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

  it('maps restart run lookup failure to safe unavailable truth before journal access', async () => {
    const h = harness();
    const authority = createCaoTargetAuthority(h.deps);
    const acquired = await authority.acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.deps.events.listByRun.mockClear();
    vi.mocked(h.registry.readExact).mockClear();
    h.deps.runs.getRun.mockRejectedValueOnce(new Error('private database path unavailable'));

    await expect(authority.verify({ ...scope, leaseId: acquired.leaseId })).rejects.toThrow(
      /^cao_run_unavailable$/,
    );
    expect(h.deps.events.listByRun).not.toHaveBeenCalled();
    expect(h.registry.readExact).not.toHaveBeenCalled();
  });

  it('maps restart journal failure to safe unavailable truth before registry access', async () => {
    const h = harness();
    const authority = createCaoTargetAuthority(h.deps);
    const acquired = await authority.acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    vi.mocked(h.registry.readExact).mockClear();
    h.deps.events.listByRun.mockRejectedValueOnce(new Error('raw journal payload unavailable'));

    await expect(authority.verify({ ...scope, leaseId: acquired.leaseId })).rejects.toThrow(
      /^cao_target_journal_unavailable$/,
    );
    expect(h.registry.readExact).not.toHaveBeenCalled();
  });

  it('maps restart registry failure to safe unavailable truth without releasing authority', async () => {
    const h = harness();
    const authority = createCaoTargetAuthority(h.deps);
    const acquired = await authority.acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    vi.mocked(h.registry.releaseExact).mockClear();
    vi.mocked(h.registry.readExact).mockRejectedValueOnce(
      new Error('raw registry owner row unavailable'),
    );

    await expect(authority.verify({ ...scope, leaseId: acquired.leaseId })).rejects.toThrow(
      /^cao_target_registry_unavailable$/,
    );
    expect(h.registry.releaseExact).not.toHaveBeenCalled();
  });

  it('maps acquire dependency failures safely and creates no durable authority', async () => {
    const input = {
      ...scope,
      leaseMs: 5_000,
      selection: {
        mode: 'explicit_single' as const,
        targets: [{ kind: 'chat' as const, targetId: 'chat-a' }],
      },
    };
    const runFailure = harness();
    runFailure.deps.runs.getRun.mockRejectedValueOnce(new Error('private run lookup failure'));
    await expect(createCaoTargetAuthority(runFailure.deps).acquire(input)).rejects.toThrow(
      /^cao_run_unavailable$/,
    );
    expect(runFailure.registry.claimExact).not.toHaveBeenCalled();
    expect(runFailure.rows).toEqual([]);

    const registryFailure = harness();
    vi.mocked(registryFailure.registry.claimExact).mockRejectedValueOnce(
      new Error('private registry transaction failure'),
    );
    await expect(createCaoTargetAuthority(registryFailure.deps).acquire(input)).rejects.toThrow(
      /^cao_target_registry_unavailable$/,
    );
    expect(registryFailure.rows).toEqual([]);
  });

  it.each([
    ['null claim', null],
    ['claim with null targets', { applied: true, targets: null }],
  ])('reconciles a malformed %s without retaining ambiguous ownership', async (_case, result) => {
    const h = harness();
    vi.mocked(h.registry.claimExact).mockImplementationOnce(async (request) => {
      h.targets.set('chat:chat-a', {
        ...target(),
        ownerLeaseId: request.leaseId,
      });
      return result as never;
    });

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_registry_invalid$/);
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
    expect(h.rows).toEqual([]);
  });

  it('rejects a malformed journal page without exposing repository details', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.deps.events.listByRun.mockResolvedValueOnce(null as never);
    vi.mocked(h.registry.readExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).verify({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_journal_invalid$/);
    expect(h.registry.readExact).not.toHaveBeenCalled();
  });

  it('rejects a malformed live registry read without releasing valid durable authority', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    vi.mocked(h.registry.readExact).mockResolvedValueOnce(null as never);
    vi.mocked(h.registry.releaseExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).verify({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_registry_invalid$/);
    expect(h.registry.releaseExact).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe(acquired.leaseId);
  });

  it('rejects a null journal entry before registry recovery', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.deps.events.listByRun.mockResolvedValueOnce([null] as never);
    vi.mocked(h.registry.readExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).verify({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_journal_invalid$/);
    expect(h.registry.readExact).not.toHaveBeenCalled();
  });

  it('rejects a sparse journal page before registry recovery', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    const sparsePage = new Array<JarvisEvent>(2);
    sparsePage[1] = structuredClone(h.rows[0]!);
    h.deps.events.listByRun.mockResolvedValueOnce(sparsePage);
    vi.mocked(h.registry.readExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_journal_invalid$/);
    expect(h.registry.readExact).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe(acquired.leaseId);
  });

  it('rejects an oversized journal page before registry recovery', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    const source = structuredClone(h.rows[0]!);
    delete source.caoTargetLease;
    const oversizedPage = Array.from({ length: 501 }, (_, index) => ({
      ...structuredClone(source),
      seq: index + 1,
      idempotencyKey: `unrelated:${index + 1}`,
    }));
    h.deps.events.listByRun.mockResolvedValueOnce(oversizedPage);
    vi.mocked(h.registry.readExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).verify({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_journal_invalid$/);
    expect(h.registry.readExact).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe(acquired.leaseId);
  });

  it('rejects lease payload lineage that disagrees with its journal event', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    const durableLeaseEvent = structuredClone(h.rows[0]!);
    const unrelatedLease = {
      ...structuredClone(durableLeaseEvent.caoTargetLease!),
      leaseId: 'cao_lease_unrelated',
      runId: 'jrun-other',
    };
    h.deps.events.listByRun.mockResolvedValueOnce([
      {
        ...durableLeaseEvent,
        seq: 1,
        idempotencyKey: `cao-target-lease:${unrelatedLease.leaseId}`,
        caoTargetLease: unrelatedLease,
      },
      { ...durableLeaseEvent, seq: 2 },
    ]);
    vi.mocked(h.registry.readExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_journal_invalid$/);
    expect(h.registry.readExact).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe(acquired.leaseId);
  });

  it('reconciles an applied claim containing a null live row', async () => {
    const h = harness();
    vi.mocked(h.registry.claimExact).mockImplementationOnce(async (request) => {
      h.targets.set('chat:chat-a', { ...target(), ownerLeaseId: request.leaseId });
      return { applied: true, targets: [null] } as never;
    });

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_registry_invalid$/);
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
    expect(h.rows).toEqual([]);
  });

  it('rejects a null verification row without releasing valid durable authority', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    vi.mocked(h.registry.readExact).mockResolvedValueOnce([null] as never);
    vi.mocked(h.registry.releaseExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).verify({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_registry_invalid$/);
    expect(h.registry.releaseExact).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe(acquired.leaseId);
  });

  it('redacts a throwing journal entry accessor before registry recovery', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    const poisonedEvent = {};
    Object.defineProperty(poisonedEvent, 'seq', {
      enumerable: true,
      get: () => {
        throw new Error('private journal adapter payload');
      },
    });
    h.deps.events.listByRun.mockResolvedValueOnce([poisonedEvent] as never);
    vi.mocked(h.registry.readExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_journal_invalid$/);
    expect(h.registry.readExact).not.toHaveBeenCalled();
  });

  it('reconciles an applied claim whose live-row accessor throws', async () => {
    const h = harness();
    vi.mocked(h.registry.claimExact).mockImplementationOnce(async (request) => {
      h.targets.set('chat:chat-a', { ...target(), ownerLeaseId: request.leaseId });
      const poisonedRow = {};
      Object.defineProperty(poisonedRow, 'kind', {
        enumerable: true,
        get: () => {
          throw new Error('private registry row payload');
        },
      });
      return { applied: true, targets: [poisonedRow] } as never;
    });

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_registry_invalid$/);
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
    expect(h.rows).toEqual([]);
  });

  it('redacts a throwing claim discriminator and reconciles possible ownership', async () => {
    const h = harness();
    vi.mocked(h.registry.claimExact).mockImplementationOnce(async (request) => {
      h.targets.set('chat:chat-a', { ...target(), ownerLeaseId: request.leaseId });
      const poisonedClaim = {};
      Object.defineProperty(poisonedClaim, 'applied', {
        enumerable: true,
        get: () => {
          throw new Error('private claim adapter payload');
        },
      });
      return poisonedClaim as never;
    });

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_registry_invalid$/);
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
    expect(h.rows).toEqual([]);
  });

  it('redacts a throwing verification-row accessor without releasing valid authority', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    const poisonedRow = {};
    Object.defineProperty(poisonedRow, 'kind', {
      enumerable: true,
      get: () => {
        throw new Error('private verification adapter payload');
      },
    });
    vi.mocked(h.registry.readExact).mockResolvedValueOnce([poisonedRow] as never);
    vi.mocked(h.registry.releaseExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).verify({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_registry_invalid$/);
    expect(h.registry.releaseExact).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe(acquired.leaseId);
  });

  it('redacts a throwing acquisition clock before target claim', async () => {
    const h = harness();
    h.deps.now.mockImplementationOnce(() => {
      throw new Error('private clock provider path');
    });

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_clock_invalid$/);
    expect(h.registry.claimExact).not.toHaveBeenCalled();
  });

  it('redacts a throwing recovery clock before live registry access', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.deps.now.mockImplementationOnce(() => {
      throw new Error('private recovery clock path');
    });
    vi.mocked(h.registry.readExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).verify({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_clock_invalid$/);
    expect(h.registry.readExact).not.toHaveBeenCalled();
  });

  it('redacts a throwing lease identity provider before claim mutation', async () => {
    const h = harness();
    h.deps.newLeaseId.mockImplementationOnce(() => {
      throw new Error('private lease generator payload');
    });

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_lease_id_invalid$/);
    expect(h.registry.claimExact).not.toHaveBeenCalled();
    expect(h.rows).toEqual([]);
  });

  it('redacts a throwing acquisition run snapshot before target claim', async () => {
    const h = harness();
    const poisonedRun = {};
    Object.defineProperty(poisonedRun, 'workspaceId', {
      enumerable: true,
      get: () => {
        throw new Error('private run adapter payload');
      },
    });
    h.deps.runs.getRun.mockResolvedValueOnce(poisonedRun as never);

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_run_unavailable$/);
    expect(h.registry.claimExact).not.toHaveBeenCalled();
    expect(h.rows).toEqual([]);
  });

  it('redacts a throwing initial recovery run snapshot before journal access', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    const poisonedRun = {};
    Object.defineProperty(poisonedRun, 'status', {
      enumerable: true,
      get: () => {
        throw new Error('private recovery run payload');
      },
    });
    h.deps.runs.getRun.mockReset();
    h.deps.runs.getRun.mockResolvedValueOnce(poisonedRun as never);
    h.deps.events.listByRun.mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_run_unavailable$/);
    expect(h.deps.events.listByRun).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe(acquired.leaseId);
  });

  it('releases exact ownership when the post-registry run snapshot is malformed', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    const poisonedRun = {};
    Object.defineProperty(poisonedRun, 'agentId', {
      enumerable: true,
      get: () => {
        throw new Error('private post-registry run payload');
      },
    });
    h.deps.runs.getRun.mockReset();
    h.deps.runs.getRun.mockResolvedValueOnce(run()).mockResolvedValueOnce(poisonedRun as never);
    vi.mocked(h.registry.releaseExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_run_unavailable$/);
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('does not persist authority when the run becomes terminal during registry claim I/O', async () => {
    const h = harness();
    h.deps.runs.getRun
      .mockResolvedValueOnce(run())
      .mockResolvedValueOnce(run({ status: 'completed' }));

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_run_inactive$/);
    expect(h.deps.journal.appendEvent).not.toHaveBeenCalled();
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('does not persist authority when the exact run ID drifts during registry claim I/O', async () => {
    const h = harness();
    h.deps.runs.getRun
      .mockResolvedValueOnce(run())
      .mockResolvedValueOnce(run({ id: 'jrun-other' }));

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_run_not_authorized$/);
    expect(h.deps.journal.appendEvent).not.toHaveBeenCalled();
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('does not persist authority when its lease expires during registry claim I/O', async () => {
    const h = harness();
    h.deps.now.mockReset();
    h.deps.now.mockReturnValueOnce(NOW).mockReturnValueOnce(NOW + 5_000);

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_lease_stale$/);
    expect(h.deps.journal.appendEvent).not.toHaveBeenCalled();
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('reconciles ambiguous pre-persistence cleanup before reporting run drift', async () => {
    const h = harness();
    h.deps.runs.getRun
      .mockResolvedValueOnce(run())
      .mockResolvedValueOnce(run({ status: 'failed' }));
    vi.mocked(h.registry.releaseExact).mockImplementationOnce(async () => {
      h.targets.set('chat:chat-a', { ...target(), ownerLeaseId: undefined });
      throw new Error('private pre-persistence cleanup transport payload');
    });

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_run_inactive$/);
    expect(h.deps.journal.appendEvent).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('reports registry unavailability without persistence when pre-persistence cleanup retains ownership', async () => {
    const h = harness();
    h.deps.runs.getRun
      .mockResolvedValueOnce(run())
      .mockResolvedValueOnce(run({ status: 'cancelled' }));
    vi.mocked(h.registry.releaseExact).mockRejectedValueOnce(
      new Error('private pre-persistence cleanup failure payload'),
    );

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_registry_unavailable$/);
    expect(h.deps.journal.appendEvent).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe('cao_lease_1');
  });

  it('does not persist authority when target revision drifts before journal authorization', async () => {
    const h = harness();
    h.deps.runs.getRun.mockResolvedValueOnce(run()).mockImplementationOnce(async () => {
      h.targets.set('chat:chat-a', {
        ...target({ revision: 8 }),
        ownerLeaseId: 'cao_lease_1',
      });
      return run();
    });

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_revision_stale$/);
    expect(h.deps.journal.appendEvent).not.toHaveBeenCalled();
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('does not persist authority when target selection drifts before journal authorization', async () => {
    const h = harness();
    h.deps.runs.getRun.mockResolvedValueOnce(run()).mockImplementationOnce(async () => {
      h.targets.set('chat:chat-a', {
        ...target({ selected: false }),
        ownerLeaseId: 'cao_lease_1',
      });
      return run();
    });

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_unselected$/);
    expect(h.deps.journal.appendEvent).not.toHaveBeenCalled();
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('does not persist or release when target ownership transfers before authorization', async () => {
    const h = harness();
    h.deps.runs.getRun.mockResolvedValueOnce(run()).mockImplementationOnce(async () => {
      h.targets.set('chat:chat-a', {
        ...target(),
        ownerLeaseId: 'cao_lease_other',
      });
      return run();
    });

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_lease_conflict$/);
    expect(h.deps.journal.appendEvent).not.toHaveBeenCalled();
    expect(h.registry.releaseExact).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe('cao_lease_other');
  });

  it('releases provisional ownership when pre-persistence registry read is transiently unavailable', async () => {
    const h = harness();
    vi.mocked(h.registry.readExact).mockRejectedValueOnce(
      new Error('private pre-persistence registry read payload'),
    );

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_registry_unavailable$/);
    expect(h.deps.journal.appendEvent).not.toHaveBeenCalled();
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('reconciles ambiguous live-drift cleanup before reporting the stable target error', async () => {
    const h = harness();
    h.deps.runs.getRun.mockResolvedValueOnce(run()).mockImplementationOnce(async () => {
      h.targets.set('chat:chat-a', {
        ...target({ locked: true }),
        ownerLeaseId: 'cao_lease_1',
      });
      return run();
    });
    vi.mocked(h.registry.releaseExact).mockImplementationOnce(async () => {
      h.targets.set('chat:chat-a', { ...target({ locked: true }), ownerLeaseId: undefined });
      throw new Error('private pre-persistence live cleanup transport payload');
    });

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_locked$/);
    expect(h.deps.journal.appendEvent).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('does not persist when the run becomes terminal during final live-target verification', async () => {
    const h = harness();
    vi.mocked(h.registry.readExact).mockImplementationOnce(async (input) => {
      const rows = input.targets.map((requested) => ({
        ...h.targets.get(`${requested.kind}:${requested.targetId}`)!,
      }));
      h.setRun(run({ status: 'completed' }));
      return rows;
    });
    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_run_inactive$/);
    expect(h.deps.journal.appendEvent).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('does not persist when run identity drifts during final live-target verification', async () => {
    const h = harness();
    vi.mocked(h.registry.readExact).mockImplementationOnce(async (input) => {
      const rows = input.targets.map((requested) => ({
        ...h.targets.get(`${requested.kind}:${requested.targetId}`)!,
      }));
      h.setRun(run({ id: 'jrun-other' }));
      return rows;
    });
    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_run_not_authorized$/);
    expect(h.deps.journal.appendEvent).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('does not persist when the lease expires during final live-target verification', async () => {
    const h = harness();
    vi.mocked(h.registry.readExact).mockImplementationOnce(async (input) => {
      const rows = input.targets.map((requested) => ({
        ...h.targets.get(`${requested.kind}:${requested.targetId}`)!,
      }));
      h.deps.now.mockReturnValue(NOW + 5_000);
      return rows;
    });
    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_lease_stale$/);
    expect(h.deps.journal.appendEvent).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('rolls back ownership when a journal acknowledgement accessor throws', async () => {
    const h = harness();
    h.deps.journal.appendEvent.mockImplementationOnce(async () => {
      const poisonedAcknowledgement = {};
      Object.defineProperty(poisonedAcknowledgement, 'runId', {
        enumerable: true,
        get: () => {
          throw new Error('private journal acknowledgement payload');
        },
      });
      return poisonedAcknowledgement as never;
    });

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_lease_persistence_failed$/);
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
    expect(h.rows).toEqual([]);
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

  it('reports registry unavailability when invalid applied-claim cleanup cannot release ownership', async () => {
    const h = harness();
    vi.mocked(h.registry.claimExact).mockImplementationOnce(async (request) => {
      h.targets.set('chat:chat-a', { ...target(), ownerLeaseId: request.leaseId });
      return {
        applied: true,
        targets: [{ ...target({ workspaceId: 'workspace-other' }), ownerLeaseId: request.leaseId }],
      };
    });
    vi.mocked(h.registry.releaseExact).mockRejectedValueOnce(
      new Error('private ambiguous release transport payload'),
    );

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_registry_unavailable$/);
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe('cao_lease_1');
    expect(h.rows).toEqual([]);
  });

  it('recovers an ambiguously successful invalid-claim release before reporting scope drift', async () => {
    const h = harness();
    vi.mocked(h.registry.claimExact).mockImplementationOnce(async (request) => {
      h.targets.set('chat:chat-a', { ...target(), ownerLeaseId: request.leaseId });
      return {
        applied: true,
        targets: [{ ...target({ workspaceId: 'workspace-other' }), ownerLeaseId: request.leaseId }],
      };
    });
    vi.mocked(h.registry.releaseExact).mockImplementationOnce(async (request) => {
      h.targets.set('chat:chat-a', { ...target(), ownerLeaseId: undefined });
      expect(request.leaseId).toBe('cao_lease_1');
      throw new Error('private post-commit transport payload');
    });

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_scope_mismatch$/);
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
    expect(h.rows).toEqual([]);
  });

  it('does not claim invalid-claim cleanup succeeded when release retains ownership', async () => {
    const h = harness();
    vi.mocked(h.registry.claimExact).mockImplementationOnce(async (request) => {
      h.targets.set('chat:chat-a', { ...target(), ownerLeaseId: request.leaseId });
      return {
        applied: true,
        targets: [{ ...target({ selected: false }), ownerLeaseId: request.leaseId }],
      };
    });
    vi.mocked(h.registry.releaseExact).mockResolvedValueOnce(undefined);

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_registry_unavailable$/);
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe('cao_lease_1');
    expect(h.rows).toEqual([]);
  });

  it('reports cleanup read unavailability after an invalid applied claim', async () => {
    const h = harness();
    vi.mocked(h.registry.claimExact).mockImplementationOnce(async (request) => {
      h.targets.set('chat:chat-a', { ...target(), ownerLeaseId: request.leaseId });
      return {
        applied: true,
        targets: [{ ...target({ locked: true }), ownerLeaseId: request.leaseId }],
      };
    });
    vi.mocked(h.registry.readExact).mockRejectedValueOnce(
      new Error('private cleanup read payload'),
    );

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_registry_unavailable$/);
    expect(h.registry.releaseExact).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe('cao_lease_1');
    expect(h.rows).toEqual([]);
  });

  it('reports registry unavailability when verification-drift cleanup retains ownership', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.targets.set('chat:chat-a', {
      ...target({ revision: 8 }),
      ownerLeaseId: acquired.leaseId,
    });
    vi.mocked(h.registry.releaseExact).mockRejectedValueOnce(
      new Error('private verification release transport payload'),
    );

    await expect(
      createCaoTargetAuthority(h.deps).verify({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_registry_unavailable$/);
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe(acquired.leaseId);
  });

  it('recovers an ambiguously successful verification-drift cleanup before reporting drift', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.targets.set('chat:chat-a', {
      ...target({ revision: 8 }),
      ownerLeaseId: acquired.leaseId,
    });
    vi.mocked(h.registry.releaseExact).mockImplementationOnce(async () => {
      h.targets.set('chat:chat-a', { ...target({ revision: 8 }), ownerLeaseId: undefined });
      throw new Error('private post-release transport payload');
    });

    await expect(
      createCaoTargetAuthority(h.deps).verify({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_revision_stale$/);
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('does not mask a verification cleanup no-op with the original target error', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.targets.set('chat:chat-a', {
      ...target({ locked: true }),
      ownerLeaseId: acquired.leaseId,
    });
    vi.mocked(h.registry.releaseExact).mockResolvedValueOnce(undefined);

    await expect(
      createCaoTargetAuthority(h.deps).verify({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_registry_unavailable$/);
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe(acquired.leaseId);
  });

  it('reports cleanup read unavailability after live verification drift', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    vi.mocked(h.registry.readExact)
      .mockResolvedValueOnce([{ ...target({ revision: 8 }), ownerLeaseId: acquired.leaseId }])
      .mockRejectedValueOnce(new Error('private verification cleanup read payload'));
    vi.mocked(h.registry.releaseExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).verify({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_registry_unavailable$/);
    expect(h.registry.releaseExact).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe(acquired.leaseId);
  });

  it('releases exact persisted authority when recovery finds a terminal CAO run', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.setRun(run({ status: 'completed' }));
    vi.mocked(h.registry.releaseExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_run_inactive$/);
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('reconciles ambiguously successful terminal-run cleanup before reporting inactivity', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.setRun(run({ status: 'failed' }));
    vi.mocked(h.registry.releaseExact).mockImplementationOnce(async () => {
      h.targets.set('chat:chat-a', { ...target(), ownerLeaseId: undefined });
      throw new Error('private terminal cleanup transport payload');
    });

    await expect(
      createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_run_inactive$/);
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('reports registry unavailability when terminal-run cleanup retains ownership', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.setRun(run({ status: 'cancelled' }));
    vi.mocked(h.registry.releaseExact).mockRejectedValueOnce(
      new Error('private terminal cleanup failure payload'),
    );

    await expect(
      createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_registry_unavailable$/);
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe(acquired.leaseId);
  });

  it('reports journal unavailability when terminal-run recovery cannot resolve its lease', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.setRun(run({ status: 'timed_out' }));
    h.deps.events.listByRun.mockRejectedValueOnce(
      new Error('private terminal recovery journal payload'),
    );
    vi.mocked(h.registry.releaseExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_journal_unavailable$/);
    expect(h.registry.releaseExact).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe(acquired.leaseId);
  });

  it('releases exact persisted authority when restart recovery finds its run missing', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.deps.runs.getRun.mockReset();
    h.deps.runs.getRun.mockResolvedValueOnce(undefined as never);
    vi.mocked(h.registry.releaseExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_run_missing$/);
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('reconciles ambiguously successful missing-run cleanup before reporting missing truth', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.deps.runs.getRun.mockReset();
    h.deps.runs.getRun.mockResolvedValueOnce(undefined as never);
    vi.mocked(h.registry.releaseExact).mockImplementationOnce(async () => {
      h.targets.set('chat:chat-a', { ...target(), ownerLeaseId: undefined });
      throw new Error('private missing-run cleanup transport payload');
    });

    await expect(
      createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_run_missing$/);
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('reports registry unavailability when missing-run cleanup retains ownership', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.deps.runs.getRun.mockReset();
    h.deps.runs.getRun.mockResolvedValueOnce(undefined as never);
    vi.mocked(h.registry.releaseExact).mockRejectedValueOnce(
      new Error('private missing-run cleanup failure payload'),
    );

    await expect(
      createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_registry_unavailable$/);
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe(acquired.leaseId);
  });

  it('reports journal unavailability when missing-run recovery cannot resolve its lease', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.deps.runs.getRun.mockReset();
    h.deps.runs.getRun.mockResolvedValueOnce(undefined as never);
    h.deps.events.listByRun.mockRejectedValueOnce(
      new Error('private missing-run recovery journal payload'),
    );
    vi.mocked(h.registry.releaseExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_journal_unavailable$/);
    expect(h.registry.releaseExact).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe(acquired.leaseId);
  });

  it('revokes exact persisted authority when restart recovery finds a non-CAO run identity', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.setRun(run({ agentId: 'jarvis-agent' }));
    vi.mocked(h.registry.releaseExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_run_not_authorized$/);
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('rejects a dependency-returned different run ID before acquisition can claim targets', async () => {
    const h = harness();
    h.setRun(run({ id: 'jrun-other' }));

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_run_not_authorized$/);
    expect(h.registry.claimExact).not.toHaveBeenCalled();
    expect(h.deps.journal.appendEvent).not.toHaveBeenCalled();
  });

  it('revokes exact persisted authority when restart recovery receives a different run ID', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.setRun(run({ id: 'jrun-other' }));
    vi.mocked(h.registry.releaseExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_run_not_authorized$/);
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('reconciles ambiguous cleanup before reporting a recovered different run ID', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.setRun(run({ id: 'jrun-other' }));
    vi.mocked(h.registry.releaseExact).mockImplementationOnce(async () => {
      h.targets.set('chat:chat-a', { ...target(), ownerLeaseId: undefined });
      throw new Error('private mismatched-run cleanup transport payload');
    });

    await expect(
      createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_run_not_authorized$/);
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('reports registry unavailability when different-run cleanup retains ownership', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.setRun(run({ id: 'jrun-other' }));
    vi.mocked(h.registry.releaseExact).mockRejectedValueOnce(
      new Error('private mismatched-run cleanup failure payload'),
    );

    await expect(
      createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_registry_unavailable$/);
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe(acquired.leaseId);
  });

  it('reports journal unavailability before different-run cleanup can resolve its lease', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.setRun(run({ id: 'jrun-other' }));
    h.deps.events.listByRun.mockRejectedValueOnce(
      new Error('private mismatched-run recovery journal payload'),
    );
    vi.mocked(h.registry.releaseExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_journal_unavailable$/);
    expect(h.registry.releaseExact).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe(acquired.leaseId);
  });

  it('reconciles ambiguous cleanup before reporting recovered run scope drift', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.setRun(run({ projectId: 'project-other' }));
    vi.mocked(h.registry.releaseExact).mockImplementationOnce(async () => {
      h.targets.set('chat:chat-a', { ...target(), ownerLeaseId: undefined });
      throw new Error('private revoked-run cleanup transport payload');
    });

    await expect(
      createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_run_scope_mismatch$/);
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('reports registry unavailability when revoked-run cleanup retains ownership', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.setRun(run({ workspaceId: 'workspace-other' }));
    vi.mocked(h.registry.releaseExact).mockRejectedValueOnce(
      new Error('private revoked-run cleanup failure payload'),
    );

    await expect(
      createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_registry_unavailable$/);
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe(acquired.leaseId);
  });

  it('reports journal unavailability before revoked-run cleanup when its lease cannot be resolved', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.setRun(run({ accountId: 'account-other' }));
    h.deps.events.listByRun.mockRejectedValueOnce(
      new Error('private revoked-run recovery journal payload'),
    );
    vi.mocked(h.registry.releaseExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_journal_unavailable$/);
    expect(h.registry.releaseExact).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe(acquired.leaseId);
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

  it('releases exact durable ownership after authority recreation and makes release idempotent', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    const restarted = createCaoTargetAuthority(h.deps);

    await expect(
      restarted.release({ ...scope, leaseId: acquired.leaseId }),
    ).resolves.toBeUndefined();
    await expect(
      restarted.release({ ...scope, leaseId: acquired.leaseId }),
    ).resolves.toBeUndefined();

    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
    await expect(restarted.verify({ ...scope, leaseId: acquired.leaseId })).rejects.toThrow(
      'cao_target_lease_conflict',
    );
  });

  it('reconciles an ambiguously committed release from exact live ownership', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.registry.releaseExact = vi.fn(async (input) => {
      for (const requested of input.targets) {
        const key = `${requested.kind}:${requested.targetId}`;
        const value = h.targets.get(key);
        if (value && value.ownerLeaseId === input.leaseId) {
          h.targets.set(key, { ...value, ownerLeaseId: undefined });
        }
      }
      throw new Error('ambiguous registry transport failure');
    });

    await expect(
      createCaoTargetAuthority(h.deps).release({ ...scope, leaseId: acquired.leaseId }),
    ).resolves.toBeUndefined();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('fails closed when release leaves ownership retained or transfers it to another lease', async () => {
    const retained = harness();
    const retainedLease = await createCaoTargetAuthority(retained.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    retained.registry.releaseExact = vi.fn(async () => {
      throw new Error('private registry write failure');
    });
    await expect(
      createCaoTargetAuthority(retained.deps).release({
        ...scope,
        leaseId: retainedLease.leaseId,
      }),
    ).rejects.toThrow(/^cao_target_registry_unavailable$/);
    expect(retained.targets.get('chat:chat-a')?.ownerLeaseId).toBe(retainedLease.leaseId);

    const transferred = harness();
    const transferredLease = await createCaoTargetAuthority(transferred.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    transferred.targets.set('chat:chat-a', {
      ...target(),
      ownerLeaseId: 'cao_lease_other',
    });
    vi.mocked(transferred.registry.releaseExact).mockClear();
    await expect(
      createCaoTargetAuthority(transferred.deps).release({
        ...scope,
        leaseId: transferredLease.leaseId,
      }),
    ).rejects.toThrow('cao_target_lease_conflict');
    expect(transferred.registry.releaseExact).not.toHaveBeenCalled();
  });

  it('reports registry unavailability when expiry cleanup cannot release retained ownership', async () => {
    const h = harness();
    const authority = createCaoTargetAuthority(h.deps);
    const acquired = await authority.acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.deps.now.mockReturnValue(NOW + 5_000);
    h.registry.releaseExact = vi.fn(async () => {
      throw new Error('private registry write failure');
    });

    await expect(authority.verify({ ...scope, leaseId: acquired.leaseId })).rejects.toThrow(
      /^cao_target_registry_unavailable$/,
    );
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe(acquired.leaseId);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1.5, Number.MAX_SAFE_INTEGER])(
    'rejects unsafe acquisition clock %s before claiming a target',
    async (observedAt) => {
      const h = harness();
      h.deps.now.mockReturnValue(observedAt);

      await expect(
        createCaoTargetAuthority(h.deps).acquire({
          ...scope,
          leaseMs: 5_000,
          selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
        }),
      ).rejects.toThrow('cao_target_clock_invalid');
      expect(h.registry.claimExact).not.toHaveBeenCalled();
      expect(h.rows).toEqual([]);
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, NOW - 1])(
    'rejects unsafe or rolled-back recovery clock %s before registry reuse',
    async (observedAt) => {
      const h = harness();
      const acquired = await createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      });
      vi.mocked(h.registry.readExact).mockClear();
      h.deps.now.mockReturnValue(observedAt);

      await expect(
        createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
      ).rejects.toThrow('cao_target_clock_invalid');
      expect(h.registry.readExact).not.toHaveBeenCalled();
      expect(h.registry.releaseExact).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['lease collision', { leaseId: 'cao_lease_other' }, scope.runId],
    ['crossed run acknowledgement', {}, 'jrun-other'],
    [
      'changed target revision',
      { targets: [{ kind: 'chat', targetId: 'chat-a', revision: 8 }] },
      scope.runId,
    ],
  ] as const)(
    'rejects %s returned by journal append and rolls back live ownership',
    async (_case, leaseChange, acknowledgedRunId) => {
      const h = harness();
      h.deps.journal.appendEvent.mockImplementationOnce(
        async (_accountId, _runId, event) =>
          ({
            ...structuredClone(event),
            runId: acknowledgedRunId,
            seq: 1,
            caoTargetLease: { ...event.caoTargetLease!, ...leaseChange },
          }) as JarvisEvent,
      );

      await expect(
        createCaoTargetAuthority(h.deps).acquire({
          ...scope,
          leaseMs: 5_000,
          selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
        }),
      ).rejects.toThrow('cao_target_lease_persistence_failed');
      expect(h.registry.releaseExact).toHaveBeenCalledOnce();
      expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
    },
  );

  it('persists an explicit target set in requested order when the atomic registry returns rows reordered', async () => {
    const h = harness([
      target(),
      target({ kind: 'terminal', targetId: 'terminal-a', revision: 3 }),
    ]);
    vi.mocked(h.registry.claimExact).mockImplementationOnce(async (request) => {
      const claimed = request.targets.map((requested) => ({
        ...h.targets.get(`${requested.kind}:${requested.targetId}`)!,
        ownerLeaseId: request.leaseId,
      }));
      for (const row of claimed) h.targets.set(`${row.kind}:${row.targetId}`, row);
      return { applied: true, targets: claimed.reverse() };
    });

    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: {
        mode: 'explicit_set',
        targets: [
          { kind: 'chat', targetId: 'chat-a' },
          { kind: 'terminal', targetId: 'terminal-a' },
        ],
      },
    });

    expect(acquired.targets).toEqual([
      { kind: 'chat', targetId: 'chat-a', revision: 7 },
      { kind: 'terminal', targetId: 'terminal-a', revision: 3 },
    ]);
  });

  it('recovers the exact durable target set when registry reads return rows reordered', async () => {
    const h = harness([
      target(),
      target({ kind: 'terminal', targetId: 'terminal-a', revision: 3 }),
    ]);
    const authority = createCaoTargetAuthority(h.deps);
    const acquired = await authority.acquire({
      ...scope,
      leaseMs: 5_000,
      selection: {
        mode: 'explicit_set',
        targets: [
          { kind: 'chat', targetId: 'chat-a' },
          { kind: 'terminal', targetId: 'terminal-a' },
        ],
      },
    });
    vi.mocked(h.registry.readExact).mockImplementation(async (request) =>
      request.targets
        .flatMap((requested) => {
          const row = h.targets.get(`${requested.kind}:${requested.targetId}`);
          return row ? [{ ...row }] : [];
        })
        .reverse(),
    );

    await expect(
      createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
    ).resolves.toEqual(acquired);
  });

  it('finishes a partially applied same-lease release after restart', async () => {
    const h = harness([
      target(),
      target({ kind: 'terminal', targetId: 'terminal-a', revision: 3 }),
    ]);
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: {
        mode: 'explicit_set',
        targets: [
          { kind: 'chat', targetId: 'chat-a' },
          { kind: 'terminal', targetId: 'terminal-a' },
        ],
      },
    });
    h.targets.set('chat:chat-a', { ...target(), ownerLeaseId: undefined });
    vi.mocked(h.registry.releaseExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).release({ ...scope, leaseId: acquired.leaseId }),
    ).resolves.toBeUndefined();
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
    expect(h.targets.get('terminal:terminal-a')?.ownerLeaseId).toBeUndefined();
  });

  it('never completes partial recovery by releasing a target now owned by another lease', async () => {
    const h = harness([
      target(),
      target({ kind: 'terminal', targetId: 'terminal-a', revision: 3 }),
    ]);
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: {
        mode: 'explicit_set',
        targets: [
          { kind: 'chat', targetId: 'chat-a' },
          { kind: 'terminal', targetId: 'terminal-a' },
        ],
      },
    });
    h.targets.set('chat:chat-a', { ...target(), ownerLeaseId: undefined });
    h.targets.set('terminal:terminal-a', {
      ...target({ kind: 'terminal', targetId: 'terminal-a', revision: 3 }),
      ownerLeaseId: 'cao_lease_other',
    });
    vi.mocked(h.registry.releaseExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).release({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow('cao_target_lease_conflict');
    expect(h.registry.releaseExact).not.toHaveBeenCalled();
    expect(h.targets.get('terminal:terminal-a')?.ownerLeaseId).toBe('cao_lease_other');
  });

  it('rejects duplicate live registry identities before recovering durable set authority', async () => {
    const h = harness([
      target(),
      target({ kind: 'terminal', targetId: 'terminal-a', revision: 3 }),
    ]);
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: {
        mode: 'explicit_set',
        targets: [
          { kind: 'chat', targetId: 'chat-a' },
          { kind: 'terminal', targetId: 'terminal-a' },
        ],
      },
    });
    vi.mocked(h.registry.readExact).mockResolvedValue([
      { ...h.targets.get('chat:chat-a')! },
      { ...h.targets.get('chat:chat-a')! },
    ]);

    await expect(
      createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow('cao_target_identity_mismatch');
  });

  it('rechecks run activity after registry recovery and releases exact ownership on terminal drift', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.deps.runs.getRun
      .mockResolvedValueOnce(run())
      .mockResolvedValueOnce(run({ status: 'completed' }));
    vi.mocked(h.registry.releaseExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow('cao_run_inactive');
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('rechecks expiry after registry recovery and releases authority that expires during I/O', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    h.deps.now.mockReset();
    h.deps.now.mockReturnValueOnce(NOW).mockReturnValueOnce(NOW + 5_000);
    vi.mocked(h.registry.releaseExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow('cao_target_lease_stale');
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('does not return newly persisted authority after ownership transfers before acknowledgement', async () => {
    const h = harness();
    h.deps.journal.appendEvent.mockImplementationOnce(async (_accountId, runId, event) => {
      const row = { ...structuredClone(event), runId, seq: 1 } as JarvisEvent;
      h.rows.push(row);
      h.targets.set('chat:chat-a', { ...target(), ownerLeaseId: 'cao_lease_other' });
      return structuredClone(row);
    });
    vi.mocked(h.registry.releaseExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow('cao_target_lease_conflict');
    expect(h.registry.claimExact).toHaveBeenCalledOnce();
    expect(h.registry.releaseExact).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe('cao_lease_other');
  });

  it('releases only the exact same lease when revision drifts after durable acknowledgement', async () => {
    const h = harness();
    h.deps.journal.appendEvent.mockImplementationOnce(async (_accountId, runId, event) => {
      const row = { ...structuredClone(event), runId, seq: 1 } as JarvisEvent;
      h.rows.push(row);
      h.targets.set('chat:chat-a', {
        ...target({ revision: 8 }),
        ownerLeaseId: event.caoTargetLease!.leaseId,
      });
      return structuredClone(row);
    });

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow('cao_target_revision_stale');
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('releases provisional ownership when the acknowledged lease is missing on final durable read', async () => {
    const h = harness();
    h.deps.events.listByRun.mockResolvedValueOnce([]);

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_lease_missing$/);
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('releases provisional ownership when final durable verification is unavailable', async () => {
    const h = harness();
    h.deps.events.listByRun.mockRejectedValueOnce(
      new Error('private post-ack journal adapter payload'),
    );

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_journal_unavailable$/);
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('releases provisional ownership when final durable verification is corrupt', async () => {
    const h = harness();
    h.deps.events.listByRun.mockImplementationOnce(async () => {
      const row = structuredClone(h.rows[0]!);
      row.type = 'result' as never;
      return [row];
    });

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_journal_invalid$/);
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('reports registry unavailability when post-ack recovery cannot clear retained ownership', async () => {
    const h = harness();
    h.deps.events.listByRun.mockResolvedValueOnce([]);
    h.registry.releaseExact = vi.fn(async () => {
      throw new Error('private post-ack cleanup payload');
    });

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_registry_unavailable$/);
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe('cao_lease_1');
  });

  it('rejects a sparse applied claim and clears its exact provisional ownership', async () => {
    const h = harness();
    vi.mocked(h.registry.claimExact).mockImplementationOnce(async (request) => {
      h.targets.set('chat:chat-a', { ...target(), ownerLeaseId: request.leaseId });
      return { applied: true, targets: new Array<CaoLiveTarget>(1) } as never;
    });

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_registry_invalid$/);
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('rejects an oversized applied claim and clears its exact provisional ownership', async () => {
    const h = harness();
    vi.mocked(h.registry.claimExact).mockImplementationOnce(async (request) => {
      h.targets.set('chat:chat-a', { ...target(), ownerLeaseId: request.leaseId });
      return {
        applied: true,
        targets: Array.from({ length: 33 }, () => ({
          ...target(),
          ownerLeaseId: request.leaseId,
        })),
      } as never;
    });

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_registry_invalid$/);
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('rejects sparse live verification rows without releasing valid durable ownership', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    vi.mocked(h.registry.readExact).mockResolvedValueOnce(new Array<CaoLiveTarget>(1));
    vi.mocked(h.registry.releaseExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).verify({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_registry_invalid$/);
    expect(h.registry.releaseExact).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe(acquired.leaseId);
  });

  it('rejects oversized live verification rows without releasing valid durable ownership', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    vi.mocked(h.registry.readExact).mockResolvedValueOnce(
      Array.from({ length: 33 }, () => ({
        ...target(),
        ownerLeaseId: acquired.leaseId,
      })),
    );
    vi.mocked(h.registry.releaseExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_registry_invalid$/);
    expect(h.registry.releaseExact).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe(acquired.leaseId);
  });

  it('rejects sparse release-state rows before issuing a registry mutation', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    vi.mocked(h.registry.readExact).mockResolvedValueOnce(new Array<CaoLiveTarget>(1));
    vi.mocked(h.registry.releaseExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).release({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_registry_invalid$/);
    expect(h.registry.releaseExact).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe(acquired.leaseId);
  });

  it('rejects an unknown claim rejection reason and clears ambiguous ownership', async () => {
    const h = harness();
    vi.mocked(h.registry.claimExact).mockImplementationOnce(async (request) => {
      h.targets.set('chat:chat-a', { ...target(), ownerLeaseId: request.leaseId });
      return { applied: false, reason: 'private-provider-reason' } as never;
    });

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_registry_invalid$/);
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('rejects extra fields on a rejected claim and clears ambiguous ownership', async () => {
    const h = harness();
    vi.mocked(h.registry.claimExact).mockImplementationOnce(async (request) => {
      h.targets.set('chat:chat-a', { ...target(), ownerLeaseId: request.leaseId });
      return { applied: false, reason: 'missing', targets: [] } as never;
    });

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_registry_invalid$/);
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('rejects extra fields on an applied claim and clears its exact ownership', async () => {
    const h = harness();
    vi.mocked(h.registry.claimExact).mockImplementationOnce(async (request) => {
      const owned = { ...target(), ownerLeaseId: request.leaseId };
      h.targets.set('chat:chat-a', owned);
      return { applied: true, targets: [owned], reason: 'missing' } as never;
    });

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_registry_invalid$/);
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('preserves a canonical known registry rejection without cleanup mutation', async () => {
    const h = harness();
    vi.mocked(h.registry.claimExact).mockResolvedValueOnce({ applied: false, reason: 'missing' });

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_missing$/);
    expect(h.registry.releaseExact).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('rejects a type-confused applied target row and clears exact provisional ownership', async () => {
    const h = harness();
    vi.mocked(h.registry.claimExact).mockImplementationOnce(async (request) => {
      const owned = { ...target(), ownerLeaseId: request.leaseId };
      h.targets.set('chat:chat-a', owned);
      return { applied: true, targets: [{ ...owned, selected: 'true' }] } as never;
    });

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_registry_invalid$/);
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('rejects metadata-bearing applied target rows and clears exact provisional ownership', async () => {
    const h = harness();
    vi.mocked(h.registry.claimExact).mockImplementationOnce(async (request) => {
      const owned = { ...target(), ownerLeaseId: request.leaseId };
      h.targets.set('chat:chat-a', owned);
      return {
        applied: true,
        targets: [{ ...owned, privateProviderMetadata: 'must-not-cross-boundary' }],
      } as never;
    });

    await expect(
      createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      }),
    ).rejects.toThrow(/^cao_target_registry_invalid$/);
    expect(h.registry.releaseExact).toHaveBeenCalledOnce();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBeUndefined();
  });

  it('rejects a type-confused live verification row without releasing valid ownership', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    vi.mocked(h.registry.readExact).mockResolvedValueOnce([
      { ...target(), ownerLeaseId: acquired.leaseId, locked: 0 } as never,
    ]);
    vi.mocked(h.registry.releaseExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).verify({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_registry_invalid$/);
    expect(h.registry.releaseExact).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe(acquired.leaseId);
  });

  it('rejects an invalid release-state revision before issuing a mutation', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    vi.mocked(h.registry.readExact).mockResolvedValueOnce([
      { ...target(), ownerLeaseId: acquired.leaseId, revision: Number.NaN },
    ]);
    vi.mocked(h.registry.releaseExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).release({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_registry_invalid$/);
    expect(h.registry.releaseExact).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe(acquired.leaseId);
  });

  it.each([null, false])(
    'rejects a present malformed lease payload %s before registry recovery',
    async (malformedLease) => {
      const h = harness();
      const acquired = await createCaoTargetAuthority(h.deps).acquire({
        ...scope,
        leaseMs: 5_000,
        selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
      });
      const durable = structuredClone(h.rows[0]!);
      h.deps.events.listByRun.mockResolvedValueOnce([
        {
          ...durable,
          seq: 1,
          idempotencyKey: 'unrelated-malformed-lease',
          caoTargetLease: malformedLease,
        } as never,
        { ...durable, seq: 2 },
      ]);
      vi.mocked(h.registry.readExact).mockClear();

      await expect(
        createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
      ).rejects.toThrow(/^cao_target_journal_invalid$/);
      expect(h.registry.readExact).not.toHaveBeenCalled();
      expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe(acquired.leaseId);
    },
  );

  it('rejects duplicate unrelated lease identities in one journal page', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    const durable = structuredClone(h.rows[0]!);
    const foreignLease = {
      ...structuredClone(durable.caoTargetLease!),
      leaseId: 'cao_lease_foreign',
    };
    const foreignEvent = {
      ...durable,
      idempotencyKey: `cao-target-lease:${foreignLease.leaseId}`,
      caoTargetLease: foreignLease,
    };
    h.deps.events.listByRun.mockResolvedValueOnce([
      { ...foreignEvent, seq: 1 },
      { ...foreignEvent, seq: 2 },
      { ...durable, seq: 3 },
    ]);
    vi.mocked(h.registry.readExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).verify({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_journal_invalid$/);
    expect(h.registry.readExact).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe(acquired.leaseId);
  });

  it('rejects duplicate unrelated lease identities split across journal pages', async () => {
    const h = harness();
    const acquired = await createCaoTargetAuthority(h.deps).acquire({
      ...scope,
      leaseMs: 5_000,
      selection: { mode: 'explicit_single', targets: [{ kind: 'chat', targetId: 'chat-a' }] },
    });
    const durable = structuredClone(h.rows[0]!);
    const foreignLease = {
      ...structuredClone(durable.caoTargetLease!),
      leaseId: 'cao_lease_foreign',
    };
    const foreignEvent = {
      ...durable,
      idempotencyKey: `cao-target-lease:${foreignLease.leaseId}`,
      caoTargetLease: foreignLease,
    };
    const filler = structuredClone(durable);
    delete filler.caoTargetLease;
    const firstPage = [
      { ...foreignEvent, seq: 1 },
      ...Array.from({ length: 499 }, (_, index) => ({
        ...filler,
        seq: index + 2,
        idempotencyKey: `unrelated:${index + 2}`,
      })),
    ];
    h.deps.events.listByRun.mockResolvedValueOnce(firstPage).mockResolvedValueOnce([
      { ...foreignEvent, seq: 501 },
      { ...durable, seq: 502 },
    ]);
    vi.mocked(h.registry.readExact).mockClear();

    await expect(
      createCaoTargetAuthority(h.deps).recover({ ...scope, leaseId: acquired.leaseId }),
    ).rejects.toThrow(/^cao_target_journal_invalid$/);
    expect(h.registry.readExact).not.toHaveBeenCalled();
    expect(h.targets.get('chat:chat-a')?.ownerLeaseId).toBe(acquired.leaseId);
  });
});
