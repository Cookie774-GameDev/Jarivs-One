import { describe, expect, it } from 'vitest';
import {
  CONTEXT_CENTER_MODES,
  CONTEXT_INSPECTOR_TABS,
  CONTEXT_WORKSPACE_SECTIONS,
  buildContextSourceCards,
  buildGitHubMapBadge,
  buildJarvisContextUi,
  contextTabKeyTarget,
  contextWorkspaceNoteStorageKey,
  getLatestContextJarvisUi,
  publishContextJarvisActivity,
} from './contextWorkspaceUi';

describe('Context workspace UI contracts', () => {
  it('exposes the complete workspace navigation, center modes, and inspector tabs', () => {
    expect(CONTEXT_WORKSPACE_SECTIONS.map(({ id, label }) => [id, label])).toEqual([
      ['maps', 'Maps'],
      ['sources', 'Sources'],
      ['notes', 'Notes'],
      ['views', 'Views'],
      ['templates', 'Templates'],
      ['workspaces', 'Workspaces'],
    ]);
    expect(CONTEXT_CENTER_MODES.map(({ id, label }) => [id, label])).toEqual([
      ['graph', 'Graph'],
      ['note', 'Note editor'],
      ['structured', 'Structured'],
      ['search', 'Search'],
    ]);
    expect(CONTEXT_INSPECTOR_TABS.map(({ id, label }) => [id, label])).toEqual([
      ['details', 'Details'],
      ['links', 'Links'],
      ['backlinks', 'Backlinks'],
      ['properties', 'Properties'],
      ['sources', 'Sources'],
      ['jarvis_activity', 'JARVIS Activity'],
      ['history', 'History'],
    ]);
  });

  it('resolves standard keyboard movement for Context tablists', () => {
    expect(contextTabKeyTarget(0, 'ArrowLeft', 4)).toBe(3);
    expect(contextTabKeyTarget(3, 'ArrowRight', 4)).toBe(0);
    expect(contextTabKeyTarget(2, 'Home', 4)).toBe(0);
    expect(contextTabKeyTarget(1, 'End', 4)).toBe(3);
    expect(contextTabKeyTarget(1, 'Enter', 4)).toBeNull();
  });

  it('builds honest source cards with explicit permission and privacy state', () => {
    expect(
      buildContextSourceCards({
        localFolderSelected: true,
        localFileSelected: false,
        githubConnected: false,
      }),
    ).toEqual([
      expect.objectContaining({
        kind: 'local_folder',
        label: 'Local folder',
        state: 'ready',
        permission: 'Read access to the folder you choose',
        privacy: 'Indexed locally unless you explicitly select a cloud model',
      }),
      expect.objectContaining({
        kind: 'local_file',
        label: 'Local file',
        state: 'choose',
        permission: 'Read access to the file you choose',
        privacy: 'The selected file remains local unless cloud processing is enabled',
      }),
      expect.objectContaining({
        kind: 'github_repository',
        label: 'GitHub repository',
        state: 'connect',
        permission: 'Only repositories granted to the VibeSpace GitHub App',
        privacy: 'Repository access uses the connected installation and read-only indexing',
      }),
    ]);
  });

  it('derives a complete GitHub badge without exposing a full commit hash', () => {
    expect(
      buildGitHubMapBadge({
        owner: 'octo',
        repository: 'vibespace',
        branch: 'main',
        resolvedCommitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        visibility: 'private',
        lastSyncAt: Date.parse('2026-07-26T09:00:00.000Z'),
        status: 'stale',
      }),
    ).toEqual({
      repository: 'octo/vibespace',
      branch: 'main',
      shortSha: 'aaaaaaa',
      visibility: 'private',
      lastSyncAt: Date.parse('2026-07-26T09:00:00.000Z'),
      stale: true,
    });
  });

  it('shows JARVIS context only from real bounded retrieval activity', () => {
    expect(buildJarvisContextUi(null)).toEqual({
      visible: false,
      chip: null,
      highlightedNodeIds: [],
      sourceCount: 0,
      retrievalPackId: null,
    });
    expect(
      buildJarvisContextUi({
        runId: 'run-1',
        lifecycle: 'retrieving',
        highlightedNodeIds: ['node-2', 'node-1'],
        sourceCount: 3,
        retrievalPackId: 'query-1',
      }),
    ).toEqual({
      visible: true,
      chip: 'JARVIS using Context',
      highlightedNodeIds: ['node-1', 'node-2'],
      sourceCount: 3,
      retrievalPackId: 'query-1',
    });
  });

  it('scopes local workspace notes to the signed-in account', () => {
    const firstAccount = contextWorkspaceNoteStorageKey('account-1', 'project-1', 'map-1');
    const secondAccount = contextWorkspaceNoteStorageKey('account-2', 'project-1', 'map-1');

    expect(firstAccount).not.toBe(secondAccount);
    expect(firstAccount).toContain('account-1');
    expect(() => contextWorkspaceNoteStorageKey('../account', 'project-1', 'map-1')).toThrow(
      /workspace note/i,
    );
  });

  it('fails closed on incomplete GitHub identity and forged JARVIS activity', () => {
    expect(() =>
      buildGitHubMapBadge({
        owner: 'octo',
        repository: 'vibespace',
        branch: 'main',
        resolvedCommitSha: 'not-a-sha',
        visibility: 'private',
        lastSyncAt: 1,
        status: 'ready',
      }),
    ).toThrow(/GitHub badge/i);
    expect(() =>
      buildJarvisContextUi({
        runId: 'run-1',
        lifecycle: 'retrieving',
        highlightedNodeIds: ['node-1', 'node-1'],
        sourceCount: 1,
        retrievalPackId: null,
      }),
    ).toThrow(/JARVIS activity/i);
  });

  it('rejects accessor-backed JARVIS events without invoking their getters', () => {
    let getterCalls = 0;
    const activity = {
      get runId() {
        getterCalls += 1;
        return 'run-1';
      },
      lifecycle: 'retrieving',
      highlightedNodeIds: ['node-1'],
      sourceCount: 1,
      retrievalPackId: 'query-1',
    };

    expect(() => buildJarvisContextUi(activity)).toThrow(/JARVIS activity/i);
    expect(getterCalls).toBe(0);
  });

  it('retains only validated latest activity and emits a content-free refresh signal', () => {
    const target = new EventTarget();
    let signals = 0;
    target.addEventListener('jarvis:context:activity', () => {
      signals += 1;
    });

    publishContextJarvisActivity(null, target);
    publishContextJarvisActivity(
      {
        runId: 'run-2',
        lifecycle: 'complete',
        highlightedNodeIds: ['node-2'],
        sourceCount: 1,
        retrievalPackId: 'query-2',
      },
      target,
    );

    expect(signals).toBe(2);
    expect(getLatestContextJarvisUi()).toEqual({
      visible: true,
      chip: 'JARVIS using Context',
      highlightedNodeIds: ['node-2'],
      sourceCount: 1,
      retrievalPackId: 'query-2',
    });
    publishContextJarvisActivity(null);
  });

  it('accepts system-safe identifiers and keeps multi-map activity project-scoped', () => {
    const mapIds = Array.from({ length: 6 }, (_, index) => `map@${index + 1}`);

    publishContextJarvisActivity(
      {
        runId: 'run@2',
        lifecycle: 'complete',
        highlightedNodeIds: ['node@2'],
        sourceCount: 6,
        retrievalPackId: 'query@2',
      },
      undefined,
      { projectId: 'project@1', mapIds },
    );

    expect(getLatestContextJarvisUi({ projectId: 'project@1', mapId: 'map@6' }).visible).toBe(true);
    expect(getLatestContextJarvisUi({ projectId: 'project@1', mapId: 'map@7' }).visible).toBe(
      false,
    );
    expect(getLatestContextJarvisUi().visible).toBe(false);
    publishContextJarvisActivity(null);
  });
});
