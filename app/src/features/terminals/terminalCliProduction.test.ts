import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContextMapRecord } from '@/features/context';
import {
  createProductionTerminalCliRuntimeDependencies,
  resolvePersistedTerminalContextEntity,
  searchPersistedTerminalContext,
} from './terminalCliProduction';
import { productionContextGateway } from '@/features/context/gateway/productionContextGateway';
import {
  mintTerminalContextBridgeIdentity,
  resetTerminalContextBridgeIdentitiesForTests,
  revokeTerminalContextBridgeIdentity,
} from './terminalContextBridgeIdentity';

afterEach(() => {
  vi.restoreAllMocks();
  resetTerminalContextBridgeIdentitiesForTests();
});

function map(
  id: string,
  nodes: ContextMapRecord['tree']['nodes'],
  status: ContextMapRecord['status'] = 'active',
): ContextMapRecord {
  return {
    id,
    projectId: 'project-a',
    rootDir: 'C:\\VibeSpace',
    name: id,
    status,
    createdAt: 1,
    updatedAt: 2,
    sourceType: 'local_folder',
    tree: {
      version: 1,
      projectId: 'project-a',
      rootDir: 'C:\\VibeSpace',
      generatedAt: 2,
      model: 'local-fallback',
      fileCount: 1,
      totalBytes: 10,
      summary: 'Map summary',
      nodes,
    },
  };
}

describe('terminal CLI production Context projection', () => {
  const maps = [
    map('map-a', [
      {
        id: 'root-a',
        title: 'Application',
        kind: 'area',
        summary: 'Frontend entry points',
        children: [
          {
            id: 'file-app',
            title: 'App.tsx',
            kind: 'file',
            path: 'src/App.tsx',
            summary: 'Application bootstrap and terminal runtime host',
            importance: 5,
          },
        ],
      },
    ]),
    map('map-b', [
      {
        id: 'file-other',
        title: 'Other App',
        kind: 'file',
        path: 'src/App.tsx',
        summary: 'A duplicate path in another map',
      },
    ]),
    map(
      'deleted-map',
      [
        {
          id: 'deleted-secret',
          title: 'Deleted secret',
          kind: 'file',
          path: 'secret.txt',
          summary: 'must not be searched',
        },
      ],
      'deleted',
    ),
  ];

  it('searches only selected active maps and ranks title, path, summary, and importance', () => {
    expect(searchPersistedTerminalContext(maps, ['map-a'], 'app runtime')).toEqual([
      {
        id: 'file-app',
        label: 'App.tsx',
        path: 'src/App.tsx',
        mapId: 'map-a',
      },
    ]);
    expect(searchPersistedTerminalContext(maps, ['deleted-map'], 'secret')).toEqual([]);
  });

  it('resolves an exact id but fails closed when a normalized path is ambiguous', () => {
    expect(resolvePersistedTerminalContextEntity(maps, 'file-app')).toEqual({
      id: 'file-app',
      label: 'App.tsx',
      path: 'src/App.tsx',
      mapId: 'map-a',
    });
    expect(resolvePersistedTerminalContextEntity(maps, 'SRC\\APP.TSX')).toBeNull();
  });

  it('cancels an in-flight Gateway ask when its terminal identity is revoked', async () => {
    const identity = mintTerminalContextBridgeIdentity(
      {
        accountId: 'account-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        worktreeId: 'worktree-1',
        paneId: 'pane-1',
        access: 'read',
      },
      { now: () => 100, createId: () => 'terminal-run-1' },
    );
    let rejectAsk!: (error: DOMException) => void;
    const ask = vi.spyOn(productionContextGateway, 'ask').mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectAsk = reject;
        }),
    );
    const cancel = vi.spyOn(productionContextGateway, 'cancel').mockImplementation(() => {
      rejectAsk(new DOMException('cancelled', 'AbortError'));
    });
    const pending = createProductionTerminalCliRuntimeDependencies().askContext({
      requestId: 'request-1',
      question: 'Find the prior decision.',
      identity,
    });
    await vi.waitFor(() => expect(ask).toHaveBeenCalledOnce());

    revokeTerminalContextBridgeIdentity(identity.identityId);

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancel).toHaveBeenCalledWith('request-1');
  });
});
