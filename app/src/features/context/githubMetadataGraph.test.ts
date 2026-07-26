import { describe, expect, it } from 'vitest';
import {
  GITHUB_METADATA_EDGE_KINDS,
  GITHUB_METADATA_NODE_KINDS,
  GITHUB_PR_CONTEXT_SECTIONS,
  buildGitHubMetadataGraph,
  buildGitHubPullRequestContext,
  planGitHubPullRequestAction,
} from './githubMetadataGraph';

const identity = {
  accountId: 'account-1',
  installationId: 'installation-1',
  owner: 'octo',
  repository: 'vibespace',
  resolvedCommitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
};

const nodes = [
  {
    id: 'issue-1',
    kind: 'issue' as const,
    githubId: 101,
    title: 'Track Context graph',
    updatedAt: '2026-07-26T07:00:00.000Z',
  },
  {
    id: 'pr-1',
    kind: 'pull_request' as const,
    githubId: 26,
    title: 'Build Context graph',
    updatedAt: '2026-07-26T07:01:00.000Z',
  },
  {
    id: 'commit-1',
    kind: 'commit' as const,
    githubId: 102,
    title: 'feat context',
    updatedAt: '2026-07-26T07:02:00.000Z',
  },
  {
    id: 'release-1',
    kind: 'release' as const,
    githubId: 103,
    title: 'v1.0.0',
    updatedAt: '2026-07-26T07:03:00.000Z',
  },
  {
    id: 'check-1',
    kind: 'check_result' as const,
    githubId: 104,
    title: 'Context tests',
    updatedAt: '2026-07-26T07:04:00.000Z',
  },
  {
    id: 'workflow-1',
    kind: 'workflow' as const,
    githubId: 105,
    title: 'CI',
    updatedAt: '2026-07-26T07:05:00.000Z',
  },
];

describe('GitHub metadata graph and PR context', () => {
  it('defines all optional metadata node, edge, and PR context kinds', () => {
    expect(GITHUB_METADATA_NODE_KINDS).toEqual([
      'issue',
      'pull_request',
      'review',
      'commit',
      'release',
      'workflow',
      'workflow_run',
      'check_result',
      'branch',
    ]);
    expect(GITHUB_METADATA_EDGE_KINDS).toEqual([
      'issue_references_file',
      'pr_changes_file',
      'commit_changes_symbol',
      'test_failure_affects_module',
      'release_contains_commit',
      'note_documents_pr',
    ]);
    expect(GITHUB_PR_CONTEXT_SECTIONS).toEqual([
      'changed_files',
      'changed_symbols',
      'tests',
      'review_comments',
      'linked_issues',
      'workflows',
      'risk_areas',
    ]);
  });

  it('builds a repository-bound metadata graph with typed edges', () => {
    const graph = buildGitHubMetadataGraph({
      identity,
      enabledNodeKinds: GITHUB_METADATA_NODE_KINDS,
      nodes,
      edges: [
        {
          id: 'edge-1',
          kind: 'issue_references_file',
          source: { kind: 'node', id: 'issue-1' },
          target: { kind: 'file', id: 'src/context.ts' },
        },
        {
          id: 'edge-2',
          kind: 'pr_changes_file',
          source: { kind: 'node', id: 'pr-1' },
          target: { kind: 'file', id: 'src/context.ts' },
        },
        {
          id: 'edge-3',
          kind: 'commit_changes_symbol',
          source: { kind: 'node', id: 'commit-1' },
          target: { kind: 'symbol', id: 'buildContext' },
        },
        {
          id: 'edge-4',
          kind: 'test_failure_affects_module',
          source: { kind: 'node', id: 'check-1' },
          target: { kind: 'module', id: 'context' },
        },
        {
          id: 'edge-5',
          kind: 'release_contains_commit',
          source: { kind: 'node', id: 'release-1' },
          target: { kind: 'node', id: 'commit-1' },
        },
        {
          id: 'edge-6',
          kind: 'note_documents_pr',
          source: { kind: 'note', id: 'note-1' },
          target: { kind: 'node', id: 'pr-1' },
        },
      ],
    });

    expect(graph).toMatchObject({
      identity,
      readOnly: true,
      nodes,
      edges: [
        { kind: 'issue_references_file' },
        { kind: 'pr_changes_file' },
        { kind: 'commit_changes_symbol' },
        { kind: 'test_failure_affects_module' },
        { kind: 'release_contains_commit' },
        { kind: 'note_documents_pr' },
      ],
      executable: false,
    });
  });

  it('rejects disabled node kinds and invalid edge endpoint combinations', () => {
    expect(() =>
      buildGitHubMetadataGraph({
        identity,
        enabledNodeKinds: ['pull_request'],
        nodes,
        edges: [],
      }),
    ).toThrow(/enabled/i);
    expect(() =>
      buildGitHubMetadataGraph({
        identity,
        enabledNodeKinds: GITHUB_METADATA_NODE_KINDS,
        nodes,
        edges: [
          {
            id: 'bad',
            kind: 'release_contains_commit',
            source: { kind: 'node', id: 'release-1' },
            target: { kind: 'node', id: 'pr-1' },
          },
        ],
      }),
    ).toThrow(/endpoint/i);
  });

  it('builds all seven PR-focused Context sections from validated graph references', () => {
    const graph = buildGitHubMetadataGraph({
      identity,
      enabledNodeKinds: GITHUB_METADATA_NODE_KINDS,
      nodes,
      edges: [],
    });
    expect(
      buildGitHubPullRequestContext({
        graph,
        pullRequestNodeId: 'pr-1',
        changedFiles: ['src/context.ts'],
        changedSymbols: ['buildContext'],
        tests: ['Context graph contract'],
        reviewComments: ['Review pagination trust boundary'],
        linkedIssueNodeIds: ['issue-1'],
        workflowNodeIds: ['workflow-1'],
        riskAreas: ['authorization'],
      }),
    ).toMatchObject({
      identity,
      pullRequestNodeId: 'pr-1',
      sections: {
        changed_files: ['src/context.ts'],
        changed_symbols: ['buildContext'],
        tests: ['Context graph contract'],
        review_comments: ['Review pagination trust boundary'],
        linked_issues: ['issue-1'],
        workflows: ['workflow-1'],
        risk_areas: ['authorization'],
      },
      readOnly: true,
      executable: false,
    });
  });

  it('keeps inspection read-only and never applies changes inside the Context Map', () => {
    const context = buildGitHubPullRequestContext({
      graph: buildGitHubMetadataGraph({
        identity,
        enabledNodeKinds: ['pull_request'],
        nodes: [nodes[1]],
        edges: [],
      }),
      pullRequestNodeId: 'pr-1',
      changedFiles: [],
      changedSymbols: [],
      tests: [],
      reviewComments: [],
      linkedIssueNodeIds: [],
      workflowNodeIds: [],
      riskAreas: [],
    });
    expect(planGitHubPullRequestAction(context, 'inspect', null, null)).toEqual({
      mode: 'read_only',
      action: 'inspect',
      allowedInsideContextMap: true,
      separateApprovedActionRequired: false,
      handoff: null,
      executable: false,
    });
    expect(planGitHubPullRequestAction(context, 'apply_changes', null, null)).toEqual({
      mode: 'read_only',
      action: 'apply_changes',
      allowedInsideContextMap: false,
      separateApprovedActionRequired: true,
      handoff: null,
      executable: false,
    });
  });

  it('emits only an opaque handoff for a separately trusted direct-user action approval', () => {
    const context = buildGitHubPullRequestContext({
      graph: buildGitHubMetadataGraph({
        identity,
        enabledNodeKinds: ['pull_request'],
        nodes: [nodes[1]],
        edges: [],
      }),
      pullRequestNodeId: 'pr-1',
      changedFiles: [],
      changedSymbols: [],
      tests: [],
      reviewComments: [],
      linkedIssueNodeIds: [],
      workflowNodeIds: [],
      riskAreas: [],
    });
    const approval = {
      approvalId: 'approval-1',
      actor: 'direct_user' as const,
      identity,
      pullRequestNodeId: 'pr-1',
      action: 'apply_pr_changes' as const,
      approvedAt: '2026-07-26T07:30:00.000Z',
    };
    expect(
      planGitHubPullRequestAction(context, 'apply_changes', approval, {
        isApproved: (candidate) => candidate.approvalId === 'approval-1',
      }),
    ).toEqual({
      mode: 'read_only',
      action: 'apply_changes',
      allowedInsideContextMap: false,
      separateApprovedActionRequired: true,
      handoff: {
        approvedActionId: 'approval-1',
        action: 'apply_pr_changes',
        identity,
        pullRequestNodeId: 'pr-1',
      },
      executable: false,
    });
  });

  it('rejects cross-repository approvals and closed-boundary abuse', () => {
    const context = buildGitHubPullRequestContext({
      graph: buildGitHubMetadataGraph({
        identity,
        enabledNodeKinds: ['pull_request'],
        nodes: [nodes[1]],
        edges: [],
      }),
      pullRequestNodeId: 'pr-1',
      changedFiles: [],
      changedSymbols: [],
      tests: [],
      reviewComments: [],
      linkedIssueNodeIds: [],
      workflowNodeIds: [],
      riskAreas: [],
    });
    expect(() =>
      planGitHubPullRequestAction(
        context,
        'apply_changes',
        {
          approvalId: 'approval-1',
          actor: 'direct_user',
          identity: { ...identity, repository: 'other' },
          pullRequestNodeId: 'pr-1',
          action: 'apply_pr_changes',
          approvedAt: '2026-07-26T07:30:00.000Z',
        },
        { isApproved: () => true },
      ),
    ).toThrow(/binding/i);

    let calls = 0;
    const accessor = {
      identity,
      enabledNodeKinds: [],
      get nodes() {
        calls += 1;
        return [];
      },
      edges: [],
    };
    expect(() => buildGitHubMetadataGraph(accessor)).toThrow(/graph/i);
    expect(calls).toBe(0);
  });
});
