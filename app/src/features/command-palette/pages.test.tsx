import { Command } from 'cmdk';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCanvasBlock,
  createCanvasDocument,
  takePendingCanvasGlobalSearchNavigation,
  withBlockAdded,
  withPlacement,
} from '@/features/canvas';
import type { CanvasPersistenceRepository } from '@/features/canvas/persistence';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import { CanvasGlobalSearchItems } from './pages';
import { usePaletteStore } from './store';

function searchableDocument() {
  const created = createCanvasDocument({
    id: 'canvas-searchable',
    projectId: 'project-search',
    ownerId: 'owner-search',
    title: 'Launch canvas',
    now: 1_750_000_000_000,
  });
  const withBlock = withBlockAdded(
    created,
    createCanvasBlock({
      id: 'launch-note',
      content: { kind: 'text', text: 'Prepare release notes' },
      now: created.updatedAt,
    }),
    created.updatedAt,
  );
  return withPlacement(
    withBlock,
    { blockId: 'launch-note', x: 400, y: 300, width: 320, height: 180 },
    withBlock.updatedAt,
  );
}

describe('command palette Canvas global search', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    useAuthStore.setState({
      cloudSession: null,
      localUserId: 'owner-search',
      projectId: 'project-search' as never,
    });
    useUIStore.setState({ route: 'chat' });
    usePaletteStore.setState({ pageStack: [], search: 'release' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the active account scope, finds Canvas text, and stages zoom navigation', async () => {
    const list = vi.fn().mockResolvedValue([searchableDocument()]);
    const repository = { list } as unknown as CanvasPersistenceRepository;
    const closePalette = vi.fn();

    render(
      <Command shouldFilter={false}>
        <Command.List>
          <CanvasGlobalSearchItems
            ctx={{ closePalette, pushPage: vi.fn() }}
            repository={repository}
          />
        </Command.List>
      </Command>,
    );

    expect(await screen.findByText('Prepare release notes')).not.toBeNull();
    expect(list).toHaveBeenCalledWith({
      accountId: 'owner-search',
      ownerId: 'owner-search',
      projectId: 'project-search',
    });

    fireEvent.click(screen.getByText('Prepare release notes'));

    expect(useUIStore.getState().route).toBe('canvas');
    expect(closePalette).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(
        takePendingCanvasGlobalSearchNavigation({
          ownerId: 'owner-search',
          projectId: 'project-search',
        }),
      ).toMatchObject({
        documentId: 'canvas-searchable',
        objectId: 'launch-note',
        camera: expect.objectContaining({ zoom: expect.any(Number) }),
      });
    });
  });
});
