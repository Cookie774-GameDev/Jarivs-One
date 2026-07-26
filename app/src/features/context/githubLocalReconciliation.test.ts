import { describe, expect, it } from 'vitest';
import { planGitHubLocalReconciliation } from './githubLocalReconciliation';

const identity = {
  accountId: 'account-1',
  installationId: 'installation-1',
  owner: 'octo',
  repository: 'vibespace',
  resolvedCommitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
};

const localSnapshot = {
  projectId: 'project-1',
  remoteOrigin: {
    host: 'github.com' as const,
    owner: 'octo',
    repository: 'vibespace',
  },
  headCommitSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  changedFiles: [
    { path: 'src/context.ts', status: 'modified' as const, staged: false },
    { path: 'src/new.ts', status: 'added' as const, staged: true },
  ],
  detectedAt: '2026-07-26T07:30:00.000Z',
};

describe('GitHub/local clone reconciliation', () => {
  it('detects a trusted matching GitHub origin and offers source linking', () => {
    expect(
      planGitHubLocalReconciliation(
        identity,
        { projectId: 'project-1' },
        {
          getLocalRepository: () => localSnapshot,
        },
      ),
    ).toMatchObject({
      identity,
      projectId: 'project-1',
      remoteOriginDetected: true,
      repositoryIdentityMatches: true,
      offerLinkSources: true,
      linkStrategy: 'merge_by_repository_commit_path',
      avoidDuplicateNodes: true,
    });
  });

  it('shows local changes while retaining remote provenance and never authorizing upload', () => {
    expect(
      planGitHubLocalReconciliation(
        identity,
        { projectId: 'project-1' },
        {
          getLocalRepository: () => localSnapshot,
        },
      ),
    ).toEqual({
      identity,
      projectId: 'project-1',
      remoteOrigin: {
        host: 'github.com',
        owner: 'octo',
        repository: 'vibespace',
      },
      remoteOriginDetected: true,
      repositoryIdentityMatches: true,
      offerLinkSources: true,
      linkStrategy: 'merge_by_repository_commit_path',
      avoidDuplicateNodes: true,
      localHeadCommitSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      remoteProvenanceCommitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      workingTreeChanges: [
        {
          path: 'src/context.ts',
          status: 'modified',
          staged: false,
          contextSource: 'local_working_tree',
          remoteProvenanceCommitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          uploadToGitHub: false,
        },
        {
          path: 'src/new.ts',
          status: 'added',
          staged: true,
          contextSource: 'local_working_tree',
          remoteProvenanceCommitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          uploadToGitHub: false,
        },
      ],
      preferLocalFilesForUncommittedContext: true,
      preserveRemoteCommitProvenance: true,
      uploadLocalUncommittedFilesToGitHub: false,
      detectedAt: '2026-07-26T07:30:00.000Z',
      executable: false,
    });
  });

  it('does not offer linking for a different repository identity', () => {
    expect(
      planGitHubLocalReconciliation(
        identity,
        { projectId: 'project-1' },
        {
          getLocalRepository: () => ({
            ...localSnapshot,
            remoteOrigin: { ...localSnapshot.remoteOrigin, repository: 'other' },
          }),
        },
      ),
    ).toMatchObject({
      remoteOriginDetected: true,
      repositoryIdentityMatches: false,
      offerLinkSources: false,
      linkStrategy: 'separate_sources',
      avoidDuplicateNodes: false,
      workingTreeChanges: [],
      uploadLocalUncommittedFilesToGitHub: false,
    });
  });

  it('fails closed for foreign project snapshots, accessors, traversal, and duplicates', () => {
    expect(() =>
      planGitHubLocalReconciliation(
        identity,
        { projectId: 'project-1' },
        {
          getLocalRepository: () => ({ ...localSnapshot, projectId: 'project-2' }),
        },
      ),
    ).toThrow(/project/i);
    expect(() =>
      planGitHubLocalReconciliation(
        identity,
        { projectId: 'project-1' },
        {
          getLocalRepository: () => ({
            ...localSnapshot,
            changedFiles: [
              ...localSnapshot.changedFiles,
              { path: 'src/context.ts', status: 'modified', staged: false },
            ],
          }),
        },
      ),
    ).toThrow(/duplicate/i);

    let calls = 0;
    const accessor = {
      get projectId() {
        calls += 1;
        return 'project-1';
      },
    };
    expect(() =>
      planGitHubLocalReconciliation(identity, accessor, {
        getLocalRepository: () => localSnapshot,
      }),
    ).toThrow(/claim/i);
    expect(calls).toBe(0);
  });
});
