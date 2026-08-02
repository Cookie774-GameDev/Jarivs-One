import { describe, expect, it, vi } from 'vitest';
import {
  CONTEXT_WORKSPACE_EXAMPLES,
  applyContextWorkspaceOperation,
  buildContextWorkspaceSwitcher,
  createContextWorkspaceLibrary,
  loadContextWorkspace,
  type ContextWorkspaceArrangement,
} from './contextWorkspaces';

const arrangement: ContextWorkspaceArrangement = {
  activeMapId: 'map-1',
  selectedNodeId: 'node-1',
  openContextNoteIds: ['note-1', 'note-2'],
  graphMode: 'local',
  graphFilters: {
    nodeKinds: ['file', 'note'],
    relationshipKinds: ['references'],
    includeArchived: false,
  },
  localDepth: 3,
  searchQuery: 'kind:file AND worker',
  activeContextView: 'graph',
  sidebarVisibility: { maps: true, inspector: true },
  sidebarWidths: { maps: 280, inspector: 360 },
  inspectorTab: 'details',
  camera: { x: 120, y: -40, zoom: 1.25 },
};

function savedLibrary() {
  return applyContextWorkspaceOperation(createContextWorkspaceLibrary('account-1'), {
    kind: 'save',
    workspaceId: 'workspace-1',
    name: 'Coding',
    arrangement,
    now: 10,
  });
}

describe('Context Workspaces', () => {
  it('ships the six requested example names', () => {
    expect(CONTEXT_WORKSPACE_EXAMPLES).toEqual([
      'Coding',
      'Security Audit',
      'Research',
      'Release Management',
      'GitHub Review',
      'JARVIS Activity',
    ]);
    expect(Object.isFrozen(CONTEXT_WORKSPACE_EXAMPLES)).toBe(true);
  });

  it('saves every Context-page arrangement field without becoming a project or map', () => {
    const library = savedLibrary();
    expect(library).toMatchObject({
      version: 1,
      accountId: 'account-1',
      updatedAt: 10,
    });
    expect(library.workspaces[0]).toMatchObject({
      id: 'workspace-1',
      accountId: 'account-1',
      name: 'Coding',
      kind: 'context_workspace',
      createdAt: 10,
      updatedAt: 10,
      arrangement,
    });
    expect(library.workspaces[0]).not.toHaveProperty('projectId');
    expect(library.workspaces[0]).not.toHaveProperty('map');
  });

  it('updates and loads immutable non-executable arrangement plans', () => {
    let library = savedLibrary();
    library = applyContextWorkspaceOperation(library, {
      kind: 'update',
      workspaceId: 'workspace-1',
      arrangement: {
        ...arrangement,
        graphMode: 'global',
        localDepth: 1,
        selectedNodeId: null,
      },
      now: 20,
    });
    const plan = loadContextWorkspace(library, 'workspace-1');
    expect(plan).toMatchObject({
      operation: 'load',
      accountId: 'account-1',
      workspaceId: 'workspace-1',
      name: 'Coding',
      executable: false,
      arrangement: { graphMode: 'global', localDepth: 1, selectedNodeId: null },
    });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.arrangement)).toBe(true);
  });

  it('renames, duplicates, and deletes workspaces with monotonic timestamps', () => {
    let library = savedLibrary();
    library = applyContextWorkspaceOperation(library, {
      kind: 'rename',
      workspaceId: 'workspace-1',
      name: 'Primary Coding',
      now: 20,
    });
    library = applyContextWorkspaceOperation(library, {
      kind: 'duplicate',
      workspaceId: 'workspace-1',
      newWorkspaceId: 'workspace-2',
      name: 'Coding Copy',
      now: 30,
    });
    expect(library.workspaces[1]).toMatchObject({
      id: 'workspace-2',
      name: 'Coding Copy',
      createdAt: 30,
      updatedAt: 30,
      arrangement,
    });
    library = applyContextWorkspaceOperation(library, {
      kind: 'delete',
      workspaceId: 'workspace-1',
      now: 40,
    });
    expect(library.workspaces.map(({ id }) => id)).toEqual(['workspace-2']);
    expect(() => loadContextWorkspace(library, 'workspace-1')).toThrow(/workspace/i);
  });

  it('builds deterministic keyboard switcher items', () => {
    let library = savedLibrary();
    library = applyContextWorkspaceOperation(library, {
      kind: 'duplicate',
      workspaceId: 'workspace-1',
      newWorkspaceId: 'workspace-2',
      name: 'Security Audit',
      now: 20,
    });
    expect(buildContextWorkspaceSwitcher(library, 'workspace-2')).toEqual([
      {
        workspaceId: 'workspace-1',
        name: 'Coding',
        shortcut: 'Ctrl+1',
        active: false,
        executable: false,
      },
      {
        workspaceId: 'workspace-2',
        name: 'Security Audit',
        shortcut: 'Ctrl+2',
        active: true,
        executable: false,
      },
    ]);
  });

  it('rejects cross-account, duplicate, stale, and missing workspace operations', () => {
    const library = savedLibrary();
    expect(() =>
      applyContextWorkspaceOperation(
        {
          ...library,
          accountId: 'account-2',
        },
        { kind: 'delete', workspaceId: 'workspace-1', now: 20 },
      ),
    ).toThrow(/account|library/i);
    expect(() =>
      applyContextWorkspaceOperation(library, {
        kind: 'save',
        workspaceId: 'workspace-1',
        name: 'Other',
        arrangement,
        now: 20,
      }),
    ).toThrow(/duplicate/i);
    expect(() =>
      applyContextWorkspaceOperation(library, {
        kind: 'save',
        workspaceId: 'workspace-2',
        name: 'coding',
        arrangement,
        now: 20,
      }),
    ).toThrow(/duplicate/i);
    expect(() =>
      applyContextWorkspaceOperation(library, {
        kind: 'rename',
        workspaceId: 'workspace-1',
        name: 'Stale',
        now: 9,
      }),
    ).toThrow(/operation time/i);
    expect(() =>
      applyContextWorkspaceOperation(library, {
        kind: 'delete',
        workspaceId: 'missing',
        now: 20,
      }),
    ).toThrow(/workspace/i);
  });

  it('validates arrangement references, filters, dimensions, depth, view, tab, and camera bounds', () => {
    const save = (candidate: ContextWorkspaceArrangement) =>
      applyContextWorkspaceOperation(createContextWorkspaceLibrary('account-1'), {
        kind: 'save',
        workspaceId: 'workspace-1',
        name: 'Coding',
        arrangement: candidate,
        now: 1,
      });
    expect(() => save({ ...arrangement, openContextNoteIds: ['note-1', 'note-1'] })).toThrow(
      /duplicate note/i,
    );
    expect(() => save({ ...arrangement, localDepth: 0 })).toThrow(/depth/i);
    expect(() => save({ ...arrangement, sidebarWidths: { maps: 100, inspector: 360 } })).toThrow(
      /width/i,
    );
    expect(() => save({ ...arrangement, activeContextView: 'terminal' as never })).toThrow(/view/i);
    expect(() => save({ ...arrangement, inspectorTab: 'shell' as never })).toThrow(/tab/i);
    expect(() => save({ ...arrangement, camera: { x: 0, y: 0, zoom: 100 } })).toThrow(/camera/i);
  });

  it('rejects accessor, symbol, proxy, sparse, and decorated boundaries without invoking getters', () => {
    let getterCalls = 0;
    const accessorArrangement = {
      ...arrangement,
      get searchQuery() {
        getterCalls += 1;
        return '';
      },
    };
    expect(() =>
      applyContextWorkspaceOperation(createContextWorkspaceLibrary('account-1'), {
        kind: 'save',
        workspaceId: 'workspace-1',
        name: 'Coding',
        arrangement: accessorArrangement,
        now: 1,
      }),
    ).toThrow(/operation|arrangement/i);
    expect(getterCalls).toBe(0);

    const symbolic = { ...arrangement } as ContextWorkspaceArrangement & Record<symbol, string>;
    symbolic[Symbol('hidden')] = 'opaque';
    expect(() =>
      applyContextWorkspaceOperation(createContextWorkspaceLibrary('account-1'), {
        kind: 'save',
        workspaceId: 'workspace-1',
        name: 'Coding',
        arrangement: symbolic,
        now: 1,
      }),
    ).toThrow(/operation|arrangement/i);
    expect(() =>
      applyContextWorkspaceOperation(createContextWorkspaceLibrary('account-1'), {
        kind: 'save',
        workspaceId: 'workspace-1',
        name: 'Coding',
        arrangement: new Proxy(arrangement, {}),
        now: 1,
      }),
    ).toThrow(/operation|arrangement/i);

    const decorated = [...arrangement.openContextNoteIds] as string[] & { extra?: string };
    decorated.extra = 'opaque';
    expect(() => saveArrangement({ ...arrangement, openContextNoteIds: decorated })).toThrow(
      /operation|arrangement/i,
    );

    const library = savedLibrary();
    const workspace = library.workspaces[0]!;
    const huge = 'x'.repeat(100_000);
    const oversized = [
      { ...library, workspaces: [{ ...workspace, name: huge }] },
      { ...library, workspaces: [{ ...workspace, id: huge }] },
      {
        ...library,
        workspaces: [
          { ...workspace, arrangement: { ...workspace.arrangement, searchQuery: huge } },
        ],
      },
      {
        ...library,
        workspaces: [
          {
            ...workspace,
            arrangement: {
              ...workspace.arrangement,
              graphFilters: {
                ...workspace.arrangement.graphFilters,
                nodeKinds: [huge],
              },
            },
          },
        ],
      },
    ];
    const clone = vi.spyOn(globalThis, 'structuredClone');
    try {
      for (const candidate of oversized) {
        expect(() => loadContextWorkspace(candidate, 'workspace-1')).toThrow(/library/i);
      }
      expect(clone).not.toHaveBeenCalled();
    } finally {
      clone.mockRestore();
    }
  });

  it('deep-freezes libraries, workspaces, filters, note lists, and camera state', () => {
    const library = savedLibrary();
    const workspace = library.workspaces[0]!;
    expect(Object.isFrozen(library)).toBe(true);
    expect(Object.isFrozen(library.workspaces)).toBe(true);
    expect(Object.isFrozen(workspace)).toBe(true);
    expect(Object.isFrozen(workspace.arrangement)).toBe(true);
    expect(Object.isFrozen(workspace.arrangement.openContextNoteIds)).toBe(true);
    expect(Object.isFrozen(workspace.arrangement.graphFilters)).toBe(true);
    expect(Object.isFrozen(workspace.arrangement.camera)).toBe(true);
  });
});

function saveArrangement(candidate: ContextWorkspaceArrangement) {
  return applyContextWorkspaceOperation(createContextWorkspaceLibrary('account-1'), {
    kind: 'save',
    workspaceId: 'workspace-1',
    name: 'Coding',
    arrangement: candidate,
    now: 1,
  });
}
