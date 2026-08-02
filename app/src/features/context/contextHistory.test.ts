import { describe, expect, it, vi } from 'vitest';
import {
  appendContextRevision,
  buildContextRevision,
  createContextHistoryLedger,
  planContextRecovery,
  type ContextRevisionInput,
} from './contextHistory';

const base: ContextRevisionInput = {
  id: 'revision-1',
  accountId: 'account-1',
  target: { kind: 'context_note', id: 'note-1' },
  timestamp: 100,
  author: { kind: 'user', id: 'user-1' },
  source: { kind: 'local_edit', id: 'edit-1' },
  beforeHash: 'a'.repeat(64),
  afterHash: 'b'.repeat(64),
  diff: '- old\n+ new',
  recoveryAction: 'restore_context_note_revision',
  recoveryEvidence: { kind: 'context_revision' },
};
const availability = {
  git: { hasCommit: vi.fn(() => true) },
  snapshot: { hasSnapshot: vi.fn(() => true) },
};

describe('Context revision and recovery history', () => {
  it('records the required immutable revision metadata', () => {
    const revision = buildContextRevision(base);
    expect(revision).toEqual(base);
    expect(Object.isFrozen(revision)).toBe(true);
    expect(Object.isFrozen(revision.target)).toBe(true);
    expect(Object.isFrozen(revision.author)).toBe(true);
    expect(Object.isFrozen(revision.source)).toBe(true);
    expect(Object.isFrozen(revision.recoveryEvidence)).toBe(true);
  });

  it('appends monotonic account-scoped revisions to a bounded ledger', () => {
    let ledger = createContextHistoryLedger('account-1');
    ledger = appendContextRevision(ledger, base, {
      maxRevisions: 100,
      maxSnapshots: 5,
      maxSnapshotBytes: 1_000_000,
      maxTotalSnapshotBytes: 2_000_000,
    });
    expect(ledger).toMatchObject({ version: 1, accountId: 'account-1', updatedAt: 100 });
    expect(ledger.revisions).toHaveLength(1);
    expect(Object.isFrozen(ledger.revisions)).toBe(true);
    expect(() =>
      appendContextRevision(
        ledger,
        { ...base, id: 'revision-2', timestamp: 99 },
        {
          maxRevisions: 100,
          maxSnapshots: 5,
          maxSnapshotBytes: 1_000_000,
          maxTotalSnapshotBytes: 2_000_000,
        },
      ),
    ).toThrow(/timestamp/i);
    expect(() =>
      appendContextRevision(
        ledger,
        { ...base, id: 'revision-2', accountId: 'account-2', timestamp: 101 },
        {
          maxRevisions: 100,
          maxSnapshots: 5,
          maxSnapshotBytes: 1_000_000,
          maxTotalSnapshotBytes: 2_000_000,
        },
      ),
    ).toThrow(/account/i);
  });

  it('plans all five Context recovery actions only as direct-user non-executable data', () => {
    const cases = [
      ['context_note', 'restore_context_note_revision'],
      ['deleted_context_note', 'restore_deleted_context_note'],
      ['property', 'restore_property_change'],
      ['generated_link', 'restore_generated_link_change'],
      ['interrupted_edit', 'recover_interrupted_edit'],
    ] as const;
    for (const [kind, recoveryAction] of cases) {
      const revision = buildContextRevision({
        ...base,
        id: `revision-${kind}`,
        target: { kind, id: `target-${kind}` },
        recoveryAction,
      });
      expect(
        planContextRecovery(
          revision,
          {
            kind: 'direct_user_action',
            accountId: 'account-1',
            requestId: `request-${kind}`,
          },
          availability,
        ),
      ).toMatchObject({
        action: recoveryAction,
        restorable: true,
        authorization: 'direct_user_action',
        executable: false,
      });
    }
  });

  it('truthfully permits source restoration only from a real Git commit or bounded snapshot', () => {
    const source = { kind: 'source_file' as const, id: 'src/app.ts' };
    const git = buildContextRevision({
      ...base,
      target: source,
      recoveryAction: 'restore_source',
      recoveryEvidence: {
        kind: 'git_commit',
        repositoryId: 'repo-1',
        commitSha: 'c'.repeat(40),
      },
    });
    expect(
      planContextRecovery(
        git,
        {
          kind: 'direct_user_action',
          accountId: 'account-1',
          requestId: 'request-git',
        },
        availability,
      ),
    ).toMatchObject({ action: 'restore_source_from_git', restorable: true });
    expect(
      planContextRecovery(
        git,
        {
          kind: 'direct_user_action',
          accountId: 'account-1',
          requestId: 'request-missing-git',
        },
        {
          git: { hasCommit: () => false },
          snapshot: { hasSnapshot: () => false },
        },
      ),
    ).toMatchObject({
      action: 'cannot_restore_source',
      restorable: false,
      reason: 'evidence_unavailable',
    });

    const snapshot = buildContextRevision({
      ...base,
      id: 'revision-snapshot',
      target: source,
      recoveryAction: 'restore_source',
      recoveryEvidence: {
        kind: 'bounded_snapshot',
        snapshotId: 'snapshot-1',
        checksum: 'd'.repeat(64),
        byteSize: 50_000,
      },
    });
    expect(
      planContextRecovery(
        snapshot,
        {
          kind: 'direct_user_action',
          accountId: 'account-1',
          requestId: 'request-snapshot',
        },
        availability,
      ),
    ).toMatchObject({ action: 'restore_source_from_snapshot', restorable: true });

    const indexed = buildContextRevision({
      ...base,
      id: 'revision-indexed',
      target: source,
      recoveryAction: 'restore_source',
      recoveryEvidence: { kind: 'indexed_revision' },
    });
    expect(
      planContextRecovery(
        indexed,
        {
          kind: 'direct_user_action',
          accountId: 'account-1',
          requestId: 'request-indexed',
        },
        availability,
      ),
    ).toEqual({
      action: 'cannot_restore_source',
      revisionId: 'revision-indexed',
      accountId: 'account-1',
      targetId: 'src/app.ts',
      restorable: false,
      reason: 'no_git_commit_or_backup',
      authorization: 'direct_user_action',
      requestId: 'request-indexed',
      executable: false,
    });
  });

  it('enforces bounded snapshot storage policy without storing source bytes', () => {
    const policy = {
      maxRevisions: 10,
      maxSnapshots: 1,
      maxSnapshotBytes: 100,
      maxTotalSnapshotBytes: 100,
    };
    let ledger = createContextHistoryLedger('account-1');
    ledger = appendContextRevision(
      ledger,
      {
        ...base,
        target: { kind: 'source_file', id: 'src/a.ts' },
        recoveryAction: 'restore_source',
        recoveryEvidence: {
          kind: 'bounded_snapshot',
          snapshotId: 'snapshot-1',
          checksum: 'c'.repeat(64),
          byteSize: 100,
        },
      },
      policy,
    );
    expect(() =>
      appendContextRevision(
        ledger,
        {
          ...base,
          id: 'revision-2',
          timestamp: 101,
          target: { kind: 'source_file', id: 'src/b.ts' },
          recoveryAction: 'restore_source',
          recoveryEvidence: {
            kind: 'bounded_snapshot',
            snapshotId: 'snapshot-2',
            checksum: 'd'.repeat(64),
            byteSize: 1,
          },
        },
        policy,
      ),
    ).toThrow(/snapshot/i);
    expect(JSON.stringify(ledger)).not.toMatch(/content|base64/i);
  });

  it('rejects mismatched recovery actions, hashes, duplicate IDs, and non-user authority', () => {
    expect(() =>
      buildContextRevision({ ...base, recoveryAction: 'restore_property_change' }),
    ).toThrow(/recovery action/i);
    expect(() => buildContextRevision({ ...base, beforeHash: 'weak' })).toThrow(/hash/i);
    const ledger = appendContextRevision(createContextHistoryLedger('account-1'), base, {
      maxRevisions: 10,
      maxSnapshots: 1,
      maxSnapshotBytes: 100,
      maxTotalSnapshotBytes: 100,
    });
    expect(() =>
      appendContextRevision(ledger, base, {
        maxRevisions: 10,
        maxSnapshots: 1,
        maxSnapshotBytes: 100,
        maxTotalSnapshotBytes: 100,
      }),
    ).toThrow(/duplicate/i);
    expect(() =>
      planContextRecovery(
        buildContextRevision(base),
        {
          kind: 'automation' as never,
          accountId: 'account-1',
          requestId: 'request-1',
        },
        availability,
      ),
    ).toThrow(/authority/i);
    expect(() =>
      planContextRecovery(
        buildContextRevision(base),
        {
          kind: 'direct_user_action',
          accountId: 'account-2',
          requestId: 'request-2',
        },
        availability,
      ),
    ).toThrow(/account scope/i);
  });

  it('rejects accessor, symbol, proxy, and oversized boundaries before cloning', () => {
    let getterCalls = 0;
    const accessor = {
      ...base,
      get diff() {
        getterCalls += 1;
        return 'diff';
      },
    };
    expect(() => buildContextRevision(accessor)).toThrow(/revision/i);
    expect(getterCalls).toBe(0);
    const symbolic = { ...base } as ContextRevisionInput & Record<symbol, string>;
    symbolic[Symbol('hidden')] = 'opaque';
    expect(() => buildContextRevision(symbolic)).toThrow(/revision/i);
    expect(() => buildContextRevision(new Proxy(base, {}))).toThrow(/revision/i);
    const clone = vi.spyOn(globalThis, 'structuredClone');
    try {
      expect(() => buildContextRevision({ ...base, diff: 'x'.repeat(200_000) })).toThrow(
        /revision/i,
      );
      expect(clone).not.toHaveBeenCalled();
    } finally {
      clone.mockRestore();
    }

    const branch = (): unknown => Array.from({ length: 100 }, () => ({}));
    const hostile = { ...base, unknown: Array.from({ length: 30 }, branch) };
    const aggregateClone = vi.spyOn(globalThis, 'structuredClone');
    try {
      expect(() => buildContextRevision(hostile as ContextRevisionInput)).toThrow(/revision/i);
      expect(aggregateClone).not.toHaveBeenCalled();
    } finally {
      aggregateClone.mockRestore();
    }
  });
});
