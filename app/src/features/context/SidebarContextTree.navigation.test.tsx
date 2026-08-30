import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContextMapRecord } from './tree';

const authState = vi.hoisted(() => ({
  projectId: 'project-context-routing',
}));

const activeMap = vi.hoisted<ContextMapRecord>(() => ({
  id: 'map-ar-outreach',
  projectId: 'project-context-routing',
  rootDir: 'C:\\workspace\\AR-OUTREACH',
  filePath: 'C:\\workspace\\AR-OUTREACH\\context_map.json',
  name: 'AR-OUTREACH Context Map',
  status: 'active',
  createdAt: 1,
  updatedAt: 2,
  tree: {
    version: 1,
    projectId: 'project-context-routing',
    rootDir: 'C:\\workspace\\AR-OUTREACH',
    generatedAt: 2,
    model: 'SiYuan local',
    fileCount: 4,
    totalBytes: 512,
    summary: 'AR outreach project',
    nodes: [],
  },
}));

const persistenceState = vi.hoisted(() => ({
  accountId: 'account-context-routing',
  projectId: 'project-context-routing',
  maps: [activeMap],
  selectedMapId: activeMap.id,
  selectedFile: null,
  recovery: null,
}));

const selectPersistedContextMap = vi.hoisted(() => vi.fn(async () => persistenceState));
const rightClickDrag = vi.hoisted(() => vi.fn());

vi.mock('@/stores/auth', () => {
  const useAuthStore = Object.assign(
    (selector: (state: typeof authState) => unknown) => selector(authState),
    { getState: () => authState },
  );
  return { useAuthStore };
});

vi.mock('@/lib/accountIdentity', () => ({
  resolveAccountIdentity: () => ({ accountId: 'account-context-routing' }),
}));

vi.mock('@/lib/rightClickDrag', () => ({
  startRightClickDrag: rightClickDrag,
}));

vi.mock('./contextPersistence', () => ({
  ensureContextPersistence: vi.fn(async () => persistenceState),
  getActiveContextPersistenceState: vi.fn(() => persistenceState),
  selectPersistedContextFile: vi.fn(),
  selectPersistedContextMap,
}));

import { SidebarContextTree } from './SidebarContextTree';

interface NavigationDetail {
  target: 'overview' | 'map';
  mapId?: string;
}

describe('SidebarContextTree navigation', () => {
  afterEach(() => {
    cleanup();
    selectPersistedContextMap.mockClear();
    rightClickDrag.mockClear();
    persistenceState.maps.splice(0, persistenceState.maps.length, activeMap);
    persistenceState.selectedMapId = activeMap.id;
  });

  it('opens the management overview from the aggregate active-map row', async () => {
    const onOpenContext = vi.fn();
    const intents: NavigationDetail[] = [];
    const onNavigate = (event: Event) => {
      intents.push((event as CustomEvent<NavigationDetail>).detail);
    };
    window.addEventListener('jarvis:context:navigate', onNavigate);

    render(<SidebarContextTree navOpen onOpenContext={onOpenContext} />);
    fireEvent.click(await screen.findByRole('button', { name: '1/5 active maps' }));

    expect(onOpenContext).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(intents).toEqual([{ target: 'overview' }]));
    expect(selectPersistedContextMap).not.toHaveBeenCalled();
    window.removeEventListener('jarvis:context:navigate', onNavigate);
  });

  it('opens the exact active map instead of the overview after selection is persisted', async () => {
    const onOpenContext = vi.fn();
    const intents: NavigationDetail[] = [];
    const onNavigate = (event: Event) => {
      intents.push((event as CustomEvent<NavigationDetail>).detail);
    };
    window.addEventListener('jarvis:context:navigate', onNavigate);

    render(<SidebarContextTree navOpen onOpenContext={onOpenContext} />);
    fireEvent.click(await screen.findByTitle(activeMap.filePath!));

    await waitFor(() =>
      expect(selectPersistedContextMap).toHaveBeenCalledWith(
        'project-context-routing',
        activeMap.id,
      ),
    );
    expect(onOpenContext).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(intents).toEqual([{ target: 'map', mapId: activeMap.id }]));
    window.removeEventListener('jarvis:context:navigate', onNavigate);
  });

  it('keeps a virtual map semantic while preserving its real child-file drag authority', async () => {
    const managedMap: ContextMapRecord = {
      ...activeMap,
      id: 'map-managed',
      filePath: 'C:\\workspace\\AR-OUTREACH\\context_map.json',
      name: 'Managed Context Map',
      tree: {
        ...activeMap.tree,
        model: 'context-map-v2',
        nodes: [
          {
            id: 'notes-file',
            title: 'notes.md',
            kind: 'file',
            summary: 'Exact notes file',
            path: 'notes.md',
          },
        ],
      },
    };
    persistenceState.maps.splice(0, persistenceState.maps.length, managedMap);
    persistenceState.selectedMapId = managedMap.id;
    const onOpenContext = vi.fn();
    const mapTransfer = {
      effectAllowed: 'none',
      setData: vi.fn(),
    } as unknown as DataTransfer;

    render(<SidebarContextTree navOpen onOpenContext={onOpenContext} />);
    const mapButton = await screen.findByRole('button', { name: /Managed Context Map/i });
    expect(mapButton.getAttribute('draggable')).toBe('false');
    expect(mapButton.getAttribute('title')).not.toContain('context_map.json');
    fireEvent.dragStart(mapButton, { dataTransfer: mapTransfer });
    fireEvent.mouseDown(mapButton, { button: 2 });
    expect(mapTransfer.setData).not.toHaveBeenCalled();
    expect(rightClickDrag).not.toHaveBeenCalled();

    fireEvent.click(mapButton);
    await waitFor(() =>
      expect(selectPersistedContextMap).toHaveBeenCalledWith(
        'project-context-routing',
        managedMap.id,
      ),
    );

    const childTransfer = {
      effectAllowed: 'none',
      setData: vi.fn(),
    } as unknown as DataTransfer;
    fireEvent.dragStart(screen.getByRole('button', { name: 'notes.md' }), {
      dataTransfer: childTransfer,
    });
    expect(childTransfer.setData).toHaveBeenCalledWith(
      'application/x-jarvis-file',
      'C:\\workspace\\AR-OUTREACH\\notes.md',
    );
    expect(childTransfer.setData).toHaveBeenCalledWith(
      'application/x-jarvis-context',
      expect.any(String),
    );
  });
});
