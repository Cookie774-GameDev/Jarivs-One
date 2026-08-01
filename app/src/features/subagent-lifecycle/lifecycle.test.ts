import { describe, expect, it } from 'vitest';
import { createDelegationPlanValidator, SubagentLifecycleError } from './planValidator';
import { createSubagentLifecycleCore } from './lifecycleCore';
import type { DelegatedWorkItem, SubagentResult } from './contracts';

function validWorkItem(): DelegatedWorkItem {
  return {
    id: 'work-1',
    ownerId: 'owner-1',
    parentRunId: 'run-1',
    parentWorkItemId: 'parent-1',
    depth: 1,
    title: 'Implement bounded parser',
    objective: 'Parse the assigned format without expanding scope.',
    deliverable: 'A tested parser and focused handoff.',
    context: {
      kind: 'focused' as const,
      summary: 'Only the parser contract and its direct callers.',
      references: ['requirement:parser-1'],
    },
    model: {
      provider: 'openai',
      model: 'gpt-5.6-sol',
      reasoningEffort: 'medium',
    },
    skills: ['test-driven-development'],
    tools: ['file_read', 'file_write', 'test'],
    roots: ['app/src/features/parser'],
    fileClaims: [{ path: 'app/src/features/parser/parser.ts', access: 'write' as const }],
    maxTokens: 12_000,
    maxCostUsd: 4,
    timeoutMs: 300_000,
    dependencies: [],
    mutationPolicy: {
      mode: 'owned_files_only' as const,
      capabilities: ['file_read', 'file_write', 'test'],
    },
    required: true,
  };
}

function workItem(
  id: string,
  path = `app/src/features/parser/${id}.ts`,
  dependencies: readonly string[] = [],
) {
  return {
    ...validWorkItem(),
    id,
    fileClaims: [{ path, access: 'write' as const }],
    dependencies,
  };
}

function completedResult(
  attemptId: string,
  workItemId: string,
  path = 'app/src/features/parser/parser.ts',
): SubagentResult {
  return {
    attemptId,
    workItemId,
    ownerId: 'owner-1',
    parentRunId: 'run-1',
    status: 'completed',
    findings: [
      {
        id: 'finding-1',
        summary: 'The bounded parser behavior is verified.',
        sourceIds: ['source-1'],
      },
    ],
    sources: [
      {
        id: 'source-1',
        kind: 'file',
        locator: path,
        sha256: 'a'.repeat(64),
      },
    ],
    files: [
      {
        path,
        action: 'modified',
        sha256: 'a'.repeat(64),
      },
    ],
    proposals: [],
    artifacts: [],
    tests: [
      {
        command: 'npm test -- parser.test.ts',
        status: 'passed',
        exitCode: 0,
        durationMs: 100,
      },
    ],
    warnings: [],
    usage: {
      tokens: 2_000,
      costUsd: 1,
      durationMs: 2_000,
    },
  };
}

describe('delegated work plan validation', () => {
  it('accepts focused bounded work and rejects traversal or prohibited capabilities', () => {
    const validator = createDelegationPlanValidator();
    const valid = validator.validate(validWorkItem());
    expect(valid.context.kind).toBe('focused');
    expect(valid.fileClaims).toEqual([
      { path: 'app/src/features/parser/parser.ts', access: 'write' },
    ]);

    expect(() =>
      validator.validate({
        ...validWorkItem(),
        fileClaims: [{ path: 'app/src/features/parser/../../USER.md', access: 'write' }],
      }),
    ).toThrow(expect.objectContaining({ code: 'path_traversal' }) as SubagentLifecycleError);

    expect(() =>
      validator.validate({
        ...validWorkItem(),
        mutationPolicy: {
          mode: 'owned_files_only',
          capabilities: ['file_write', 'memory_write'],
        },
      } as never),
    ).toThrow(expect.objectContaining({ code: 'prohibited_capability' }) as SubagentLifecycleError);

    expect(() =>
      validator.validate({
        ...validWorkItem(),
        context: {
          ...validWorkItem().context,
          transcript: ['entire parent conversation'],
        },
      } as never),
    ).toThrow(expect.objectContaining({ code: 'invalid_input' }) as SubagentLifecycleError);
  });
});

describe('subagent scheduler lifecycle', () => {
  it('enforces queue, concurrency, dependency, exact-run, and claim boundaries', () => {
    const core = createSubagentLifecycleCore({
      limits: {
        maxConcurrent: 1,
        maxQueued: 2,
        maxDepth: 1,
        maxTokensPerWorkItem: 64_000,
        maxCostUsdPerWorkItem: 25,
        maxTimeoutMs: 1_800_000,
      },
    });

    expect(() => core.submit(workItem('missing-dependency', undefined, ['missing']), 1)).toThrow(
      expect.objectContaining({ code: 'dependency_missing' }),
    );
    const first = core.submit(workItem('first', 'app/src/features/parser/shared.ts'), 2);
    core.submit(workItem('second', 'app/src/features/parser/shared.ts'), 3);
    expect(() => core.submit(workItem('queue-full'), 4)).toThrow(
      expect.objectContaining({ code: 'queue_capacity' }),
    );

    expect(core.startNext({ ownerId: 'owner-1', parentRunId: 'run-1', now: 5 })).toMatchObject({
      status: 'started',
      attempt: { id: first.id, status: 'running' },
    });
    core.submit(workItem('dependent', undefined, ['first']), 6);
    expect(core.startNext({ ownerId: 'owner-1', parentRunId: 'run-1', now: 7 })).toEqual({
      status: 'blocked',
      code: 'concurrent_capacity',
    });

    expect(() =>
      core.cancelAttempt({
        ownerId: 'owner-1',
        parentRunId: 'different-run',
        attemptId: first.id,
        now: 8,
      }),
    ).toThrow(expect.objectContaining({ code: 'attempt_not_found' }));
    core.cancelAttempt({
      ownerId: 'owner-1',
      parentRunId: 'run-1',
      attemptId: first.id,
      now: 9,
    });
    expect(() =>
      core.cancelAttempt({
        ownerId: 'owner-1',
        parentRunId: 'run-1',
        attemptId: first.id,
        now: 10,
      }),
    ).toThrow(expect.objectContaining({ code: 'terminal_immutable' }));

    expect(core.startNext({ ownerId: 'owner-1', parentRunId: 'run-1', now: 11 })).toMatchObject({
      status: 'started',
      attempt: { workItemId: 'second' },
    });
  });

  it('does not start a conflicting claim while another run owns it', () => {
    const core = createSubagentLifecycleCore();
    core.submit(workItem('first', 'app/src/features/parser/shared.ts'), 1);
    core.submit(
      {
        ...workItem('other', 'app/src/features/parser/shared.ts'),
        ownerId: 'owner-2',
        parentRunId: 'run-2',
      },
      2,
    );
    core.startNext({ ownerId: 'owner-1', parentRunId: 'run-1', now: 3 });
    expect(core.startNext({ ownerId: 'owner-2', parentRunId: 'run-2', now: 4 })).toEqual({
      status: 'blocked',
      code: 'claim_conflict',
    });
  });

  it('fails running work once its bounded timeout is reached and offers retry', () => {
    const core = createSubagentLifecycleCore();
    const queued = core.submit(workItem('timed'), 1);
    core.startNext({ ownerId: 'owner-1', parentRunId: 'run-1', now: 2 });
    expect(core.enforceTimeouts(300_002)).toEqual([
      expect.objectContaining({
        id: queued.id,
        status: 'failed',
        retryable: true,
        warning: 'timeout_exceeded',
      }),
    ]);
  });
});

describe('subagent results and parent synthesis', () => {
  it('rejects fabricated evidence and makes terminal results immutable', () => {
    const core = createSubagentLifecycleCore();
    const queued = core.submit(workItem('parser', 'app/src/features/parser/parser.ts'), 1);
    core.startNext({ ownerId: 'owner-1', parentRunId: 'run-1', now: 2 });

    expect(() =>
      core.completeAttempt(
        {
          ...completedResult(queued.id, 'parser'),
          findings: [
            {
              id: 'finding-1',
              summary: 'Unsupported claim.',
              sourceIds: ['invented-source'],
            },
          ],
        },
        3,
      ),
    ).toThrow(expect.objectContaining({ code: 'result_evidence_invalid' }));
    expect(core.getAttempt('owner-1', 'run-1', queued.id).status).toBe('running');

    const completed = core.completeAttempt(completedResult(queued.id, 'parser'), 4);
    expect(completed.status).toBe('completed');
    expect(() => core.completeAttempt(completedResult(queued.id, 'parser'), 5)).toThrow(
      expect.objectContaining({ code: 'terminal_immutable' }),
    );
    expect(core.synthesisStatus('owner-1', 'run-1')).toEqual({
      complete: true,
      code: 'complete',
      incompleteWorkItemIds: [],
    });
  });

  it('never synthesizes complete for partial required work and retries as a new attempt', () => {
    const core = createSubagentLifecycleCore();
    const queued = core.submit(workItem('parser'), 1);
    core.startNext({ ownerId: 'owner-1', parentRunId: 'run-1', now: 2 });
    core.completeAttempt(
      {
        ...completedResult(queued.id, 'parser'),
        status: 'partial',
        warnings: ['One edge case remains.'],
      },
      3,
    );
    expect(core.synthesisStatus('owner-1', 'run-1')).toEqual({
      complete: false,
      code: 'required_work_incomplete',
      incompleteWorkItemIds: ['parser'],
    });
    expect(
      core.retryAttempt({
        ownerId: 'owner-1',
        parentRunId: 'run-1',
        attemptId: queued.id,
        now: 4,
      }),
    ).toMatchObject({
      id: 'parser:attempt:2',
      attemptNumber: 2,
      status: 'queued',
    });
  });
});

describe('subagent checkpoint restart truthfulness', () => {
  it('preserves completed work, marks lost local execution failed, and reconnects only supported remote jobs', () => {
    const core = createSubagentLifecycleCore();
    const done = core.submit(workItem('done'), 1);
    core.startNext({ ownerId: 'owner-1', parentRunId: 'run-1', now: 2 });
    core.completeAttempt(completedResult(done.id, 'done', 'app/src/features/parser/done.ts'), 3);
    const local = core.submit(workItem('local'), 4);
    const remote = core.submit(workItem('remote'), 5);
    const unsupported = core.submit(workItem('unsupported'), 6);
    core.startNext({ ownerId: 'owner-1', parentRunId: 'run-1', now: 7 });
    core.startNext({ ownerId: 'owner-1', parentRunId: 'run-1', now: 8 });
    core.startNext({ ownerId: 'owner-1', parentRunId: 'run-1', now: 9 });
    core.attachRemoteJob({
      ownerId: 'owner-1',
      parentRunId: 'run-1',
      attemptId: remote.id,
      remoteJobId: 'remote-job-1',
      reconnectSupported: true,
    });
    core.attachRemoteJob({
      ownerId: 'owner-1',
      parentRunId: 'run-1',
      attemptId: unsupported.id,
      remoteJobId: 'remote-job-2',
      reconnectSupported: false,
    });

    const restored = createSubagentLifecycleCore({
      checkpoint: core.checkpoint(),
      restartAt: 20,
    });
    expect(restored.getAttempt('owner-1', 'run-1', done.id).status).toBe('completed');
    expect(restored.getAttempt('owner-1', 'run-1', local.id)).toMatchObject({
      status: 'failed',
      retryable: true,
      warning: 'local_process_lost',
    });
    expect(restored.getAttempt('owner-1', 'run-1', remote.id)).toMatchObject({
      status: 'reconnecting',
      remoteJob: { id: 'remote-job-1', reconnectSupported: true },
    });
    expect(restored.getAttempt('owner-1', 'run-1', unsupported.id)).toMatchObject({
      status: 'failed',
      retryable: true,
      warning: 'remote_reconnect_unsupported',
    });
  });
});
