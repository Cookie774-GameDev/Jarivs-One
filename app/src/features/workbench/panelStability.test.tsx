import * as React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FilesPanel } from './FilesPanel';
import { JarvisPanel } from './JarvisPanel';
import type { WorkbenchPanel } from './types';

const listDirectory = vi.fn(async (path: string) => ({
  ok: true as const,
  path,
  entries: [{ name: 'a.ts', path: `${path}\\a.ts`, isDir: false }],
}));

vi.mock('@/lib/fs', () => ({
  listDirectory: (...args: unknown[]) => listDirectory(...(args as [string])),
  describeFsError: () => 'error',
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.mock('@/features/files/projectFiles', async () => {
  const actual = await vi.importActual<typeof import('@/features/files/projectFiles')>(
    '@/features/files/projectFiles',
  );
  return {
    ...actual,
    getStoredProjectRoot: () => 'C:\\proj',
    setStoredProjectRoot: vi.fn(),
    chooseProjectFolder: vi.fn(async () => null),
  };
});

vi.mock('@/features/chat', () => ({
  ChatThread: () => <div data-testid="thread">thread</div>,
  Composer: () => <div>composer</div>,
  EmptyChat: () => <div>empty</div>,
  ensureActiveChat: vi.fn(async () => 'chat-1'),
}));

vi.mock('@/stores/ui', () => ({
  useUIStore: (sel: (s: { activeChatId: string }) => unknown) =>
    sel({ activeChatId: 'chat-1' }),
}));

function basePanel(kind: WorkbenchPanel['kind']): WorkbenchPanel {
  return {
    id: `${kind}-1`,
    kind,
    title: kind,
    x: 0,
    y: 0,
    width: 400,
    height: 300,
    z: 1,
    minimized: false,
    status: 'idle',
    settings: {},
  };
}

describe('Workbench panel update stability', () => {
  beforeEach(() => {
    listDirectory.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not re-list the project folder when parent re-renders with a new onUpdate identity', async () => {
    let panel = basePanel('files');
    const onUpdate = vi.fn((patch: Partial<WorkbenchPanel>) => {
      panel = {
        ...panel,
        ...patch,
        settings: patch.settings ? { ...panel.settings, ...patch.settings } : panel.settings,
      };
    });

    const view = render(<FilesPanel panel={panel} onUpdate={onUpdate} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const callsAfterMount = listDirectory.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThanOrEqual(1);

    // Simulate canvas thrashing: new lambda every render, status already ready.
    for (let i = 0; i < 8; i += 1) {
      view.rerender(<FilesPanel panel={panel} onUpdate={(p) => onUpdate(p)} />);
      await act(async () => {
        await Promise.resolve();
      });
    }

    expect(listDirectory.mock.calls.length).toBe(callsAfterMount);
  });

  it('does not keep writing status when Jarvis already has an active chat', async () => {
    const panel = basePanel('jarvis');
    const onUpdate = vi.fn();
    const view = render(<JarvisPanel panel={panel} onUpdate={onUpdate} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const firstCount = onUpdate.mock.calls.length;
    expect(firstCount).toBeLessThanOrEqual(1);

    for (let i = 0; i < 6; i += 1) {
      view.rerender(
        <JarvisPanel
          panel={{ ...panel, status: 'ready' }}
          onUpdate={(p) => onUpdate(p)}
        />,
      );
      await act(async () => {
        await Promise.resolve();
      });
    }
    expect(onUpdate.mock.calls.length).toBe(firstCount);
  });
});
