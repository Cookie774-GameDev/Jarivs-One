import { describe, expect, it } from 'vitest';
import {
  CONTEXT_JARVIS_ACTIONS,
  CONTEXT_PROACTIVE_INSIGHT_KINDS,
  ContextJarvisPolicyError,
  createContextCorrectionApprovalAuthority,
  createContextCorrectionCandidate,
  createContextInsightEvidenceAuthority,
  planContextCorrectionPersistence,
  selectContextProactiveInsights,
} from './jarvisContextPolicy';

describe('Context proactive insight policy', () => {
  it('covers every approved insight family and suppresses low-value notification churn', () => {
    expect(CONTEXT_PROACTIVE_INSIGHT_KINDS).toEqual([
      'notes_code_conflict',
      'stale_release_plan',
      'unresolved_high_severity_finding',
      'duplicated_implementation',
      'missing_test_coverage',
      'broken_link',
      'stale_github_map',
      'terminal_context_contradiction',
    ]);
    const now = 1_700_000_000_000;
    const authority = createContextInsightEvidenceAuthority();
    const attest = (
      candidate: Omit<
        Parameters<typeof authority.attestInsight>[0],
        'accountId' | 'projectId' | 'mapId' | 'evidenceReceipts'
      >,
      evidenceIds: string[],
    ) =>
      authority.attestInsight({
        ...candidate,
        accountId: 'account-1',
        projectId: 'project-1',
        mapId: 'map-1',
        evidenceReceipts: evidenceIds.map((evidenceId) =>
          authority.recordEvidence({
            accountId: 'account-1',
            projectId: 'project-1',
            mapId: 'map-1',
            evidenceId,
            observedAt: candidate.observedAt,
          }),
        ),
      });
    const selected = selectContextProactiveInsights({
      authority,
      accountId: 'account-1',
      projectId: 'project-1',
      mapId: 'map-1',
      now,
      maxResults: 3,
      attestations: [
        attest(
          {
            id: 'critical-new',
            kind: 'terminal_context_contradiction',
            severity: 'critical',
            confidence: 0.95,
            summary: 'Terminal work contradicts the release Context.',
            dedupeKey: 'terminal-release-conflict',
            observedAt: now - 100,
          },
          ['terminal-1', 'context-1'],
        ),
        attest(
          {
            id: 'medium-good',
            kind: 'missing_test_coverage',
            severity: 'medium',
            confidence: 0.9,
            summary: 'A changed authorization path has no focused test.',
            dedupeKey: 'missing-test-auth',
            observedAt: now - 200,
          },
          ['file-1'],
        ),
        attest(
          {
            id: 'low-noise',
            kind: 'broken_link',
            severity: 'low',
            confidence: 1,
            summary: 'One optional note link is unresolved.',
            dedupeKey: 'optional-link',
            observedAt: now - 50,
          },
          ['link-1'],
        ),
        attest(
          {
            id: 'duplicate-recent',
            kind: 'stale_github_map',
            severity: 'high',
            confidence: 1,
            summary: 'The GitHub map is stale.',
            dedupeKey: 'github-stale',
            observedAt: now - 300,
          },
          ['repo-1'],
        ),
      ],
      notificationHistory: [
        {
          accountId: 'account-1',
          projectId: 'project-1',
          mapId: 'map-1',
          dedupeKey: 'github-stale',
          shownAt: now - 1_000,
        },
      ],
    });

    expect(selected.map(({ id }) => id)).toEqual(['critical-new', 'medium-good']);
    expect(selected.every(({ evidenceIds }) => evidenceIds.length > 0)).toBe(true);
    expect(Object.isFrozen(selected)).toBe(true);
  });

  it('rejects malformed confidence, chronology, and evidence-free claims', () => {
    const authority = createContextInsightEvidenceAuthority();
    expect(() =>
      authority.attestInsight({
        id: 'bad',
        accountId: 'account-1',
        projectId: 'project-1',
        mapId: 'map-1',
        kind: 'broken_link',
        severity: 'high',
        confidence: Number.NaN,
        summary: 'Bad.',
        evidenceReceipts: [],
        dedupeKey: 'bad',
        observedAt: 101,
      }),
    ).toThrowError(ContextJarvisPolicyError);
  });

  it('binds selection scope and collapses same-batch scoped dedupe keys', () => {
    const authority = createContextInsightEvidenceAuthority();
    const attest = (id: string, accountId: string, severity: 'high' | 'critical') => {
      const evidence = authority.recordEvidence({
        accountId,
        projectId: 'project-1',
        mapId: 'map-1',
        evidenceId: `evidence-${id}`,
        observedAt: 90,
      });
      return authority.attestInsight({
        id,
        accountId,
        projectId: 'project-1',
        mapId: 'map-1',
        kind: 'broken_link',
        severity,
        confidence: 1,
        summary: `Insight ${id}.`,
        evidenceReceipts: [evidence],
        dedupeKey: 'same-link',
        observedAt: 90,
      });
    };
    const strongest = attest('strongest', 'account-1', 'critical');
    const duplicate = attest('duplicate', 'account-1', 'high');
    expect(
      selectContextProactiveInsights({
        authority,
        accountId: 'account-1',
        projectId: 'project-1',
        mapId: 'map-1',
        now: 100,
        maxResults: 3,
        attestations: [duplicate, strongest],
        notificationHistory: [],
      }).map(({ id }) => id),
    ).toEqual(['strongest']);

    const crossAccount = attest('cross-account', 'account-2', 'critical');
    expect(() =>
      selectContextProactiveInsights({
        authority,
        accountId: 'account-1',
        projectId: 'project-1',
        mapId: 'map-1',
        now: 100,
        maxResults: 3,
        attestations: [crossAccount],
        notificationHistory: [],
      }),
    ).toThrowError(expect.objectContaining({ code: 'scope_mismatch' }));
  });
});

describe('approved Context JARVIS actions', () => {
  it('registers all fourteen stable actions and never auto-approves mutations', () => {
    expect(CONTEXT_JARVIS_ACTIONS.map(({ id }) => id)).toEqual([
      'context.search',
      'context.open',
      'context.attach',
      'context.create_note',
      'context.update_note',
      'context.link_notes',
      'context.create_view',
      'context.refresh_map',
      'context.create_daily_note',
      'context.add_daily_entry',
      'context.suggest_links',
      'context.resolve_broken_link',
      'context.pin_entity',
      'context.create_from_github',
    ]);
    expect(
      CONTEXT_JARVIS_ACTIONS.filter(({ mutates }) => mutates).every(
        ({ approval }) => approval === 'always' || approval === 'depends_on_input',
      ),
    ).toBe(true);
    expect(
      CONTEXT_JARVIS_ACTIONS.filter(({ mutates }) => !mutates).every(
        ({ risk, approval }) => risk === 'read_only' && approval === 'never',
      ),
    ).toBe(true);
    expect(Object.isFrozen(CONTEXT_JARVIS_ACTIONS)).toBe(true);
  });
});

describe('Context correction workflow', () => {
  const candidate = () =>
    createContextCorrectionCandidate({
      id: 'correction-1',
      accountId: 'account-1',
      projectId: 'project-1',
      mapId: 'map-1',
      correction: 'The cancellation state remains active through period end.',
      conflictingSources: [
        {
          sourceId: 'source-note',
          label: 'VibeSpace Access',
          excerpt: 'Cancellation immediately revokes access.',
          provenance: {
            sourceRevision: 'note-rev-1',
            indexedAt: 100,
            terminalSessionId: 'terminal-1',
          },
        },
        {
          sourceId: 'source-code',
          label: 'access.ts',
          excerpt: 'Access remains active until current_period_end.',
          provenance: {
            sourceRevision: 'code-rev-7',
            indexedAt: 101,
            githubRef: 'main',
            githubSha: 'a'.repeat(40),
          },
        },
      ],
      recordedAt: 110,
    });

  it('records a visible conflict, asks where to store it, and preserves provenance', () => {
    const correction = candidate();
    expect(correction).toMatchObject({
      state: 'awaiting_storage_choice',
      question: 'Where should I store this durable correction?',
      destinations: ['context_note', 'entity_property', 'do_not_store'],
      preserveOriginalProvenance: true,
    });
    expect(correction.conflictingSources.map(({ sourceId }) => sourceId)).toEqual([
      'source-code',
      'source-note',
    ]);
    expect(correction.conflictingSources[0]?.provenance.sourceRevision).toBe('code-rev-7');
    expect(Object.isFrozen(correction)).toBe(true);
  });

  it('requires a host approval grant for note/property updates and never rewrites sources', () => {
    const correction = candidate();
    expect(() =>
      planContextCorrectionPersistence({
        candidate: correction,
        destination: 'context_note',
        targetId: 'note-access',
      }),
    ).toThrowError(expect.objectContaining({ code: 'approval_required' }));

    const authority = createContextCorrectionApprovalAuthority();
    const approvalGrant = authority.approve({
      candidate: correction,
      destination: 'context_note',
      targetId: 'note-access',
    });
    const plan = planContextCorrectionPersistence({
      candidate: correction,
      destination: 'context_note',
      targetId: 'note-access',
      approvalGrant,
    });
    expect(plan).toMatchObject({
      operation: 'append_context_note_revision',
      targetId: 'note-access',
      preserveOriginalProvenance: true,
      rewriteSourceCodeOrDocumentation: false,
      originalProvenance: [
        {
          sourceId: 'source-code',
          provenance: {
            sourceRevision: 'code-rev-7',
            indexedAt: 101,
            githubRef: 'main',
            githubSha: 'a'.repeat(40),
          },
        },
        {
          sourceId: 'source-note',
          provenance: {
            sourceRevision: 'note-rev-1',
            indexedAt: 100,
            terminalSessionId: 'terminal-1',
          },
        },
      ],
    });
    expect(
      planContextCorrectionPersistence({
        candidate: correction,
        destination: 'context_note',
        targetId: 'note-access',
        approvalGrant,
      }),
    ).toBe(plan);
    expect(Object.isFrozen(plan)).toBe(true);
  });

  it('supports declining durable storage without approval and rejects forged grants', () => {
    const correction = candidate();
    expect(
      planContextCorrectionPersistence({
        candidate: correction,
        destination: 'do_not_store',
      }),
    ).toMatchObject({ operation: 'none' });
    expect(() =>
      planContextCorrectionPersistence({
        candidate: correction,
        destination: 'entity_property',
        targetId: 'property-access-status',
        approvalGrant: Object.freeze({ version: 1, id: 'forged' }),
      }),
    ).toThrowError(expect.objectContaining({ code: 'approval_required' }));

    const authority = createContextCorrectionApprovalAuthority();
    const approvalGrant = authority.approve({
      candidate: correction,
      destination: 'entity_property',
      targetId: 'property-access-status',
    });
    expect(() =>
      planContextCorrectionPersistence({
        candidate: candidate(),
        destination: 'entity_property',
        targetId: 'property-access-status',
        approvalGrant,
      }),
    ).toThrowError(expect.objectContaining({ code: 'approval_required' }));
  });

  it('requires two sources and provenance observed no later than the correction', () => {
    const correction = candidate();
    const base = {
      accountId: correction.accountId,
      projectId: correction.projectId,
      mapId: correction.mapId,
      correction: correction.correction,
      recordedAt: correction.recordedAt,
    };
    expect(() =>
      createContextCorrectionCandidate({
        ...base,
        id: 'one-source',
        conflictingSources: [correction.conflictingSources[0]!],
      }),
    ).toThrowError(ContextJarvisPolicyError);
    expect(() =>
      createContextCorrectionCandidate({
        ...base,
        id: 'future-source',
        conflictingSources: [
          correction.conflictingSources[0]!,
          {
            ...correction.conflictingSources[1]!,
            provenance: {
              ...correction.conflictingSources[1]!.provenance,
              indexedAt: correction.recordedAt + 1,
            },
          },
        ],
      }),
    ).toThrowError(ContextJarvisPolicyError);
    for (const githubSha of [BigInt('1'.repeat(40)), Symbol('sha'), {}]) {
      expect(() =>
        createContextCorrectionCandidate({
          ...base,
          id: `hostile-sha-${typeof githubSha}`,
          conflictingSources: [
            correction.conflictingSources[0]!,
            {
              ...correction.conflictingSources[1]!,
              provenance: {
                ...correction.conflictingSources[1]!.provenance,
                githubSha: githubSha as unknown as string,
              },
            },
          ],
        }),
      ).toThrowError(ContextJarvisPolicyError);
    }
  });
});
