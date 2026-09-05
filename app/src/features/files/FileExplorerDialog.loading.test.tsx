import * as React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelFileExplorer, openFileExplorer } from './fileExplorerStore';

const testMocks = vi.hoisted(() => ({
  listDirectory: vi.fn(),
  resolveExplorerPlaces: vi.fn(),
}));

vi.mock('@/lib/fs', async () => {
  const actual = await vi.importActual<typeof import('@/lib/fs')>('@/lib/fs');
  return {
    ...actual,
    listDirectory: testMocks.listDirectory,
  };
});

vi.mock('./fileExplorerPlaces', async () => {
  const actual =
    await vi.importActual<typeof import('./fileExplorerPlaces')>('./fileExplorerPlaces');
  return {
    ...actual,
    resolveExplorerPlaces: testMocks.resolveExplorerPlaces,
  };
});

import { FileExplorerHost } from './FileExplorerDialog';

beforeEach(() => {
  cancelFileExplorer();
  testMocks.listDirectory.mockReset();
  testMocks.resolveExplorerPlaces.mockReset();
  testMocks.resolveExplorerPlaces.mockResolvedValue([
    { id: 'home', label: 'Home', path: 'C:\\Users\\viper', icon: 'home' },
  ]);
});

afterEach(() => {
  cleanup();
  cancelFileExplorer();
  vi.useRealTimers();
});

describe('FileExplorerDialog loading resilience', () => {
  it('starts an explicit initial folder without waiting for Places resolution', async () => {
    testMocks.resolveExplorerPlaces.mockReturnValue(new Promise(() => undefined));
    testMocks.listDirectory.mockResolvedValue({
      ok: true,
      path: 'C:\\project',
      entries: [{ name: 'alpha.txt', path: 'C:\\project\\alpha.txt', isDir: false, size: 5 }],
    });

    void openFileExplorer({ mode: 'file', initialPath: 'C:\\project' });
    render(<FileExplorerHost />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(testMocks.listDirectory).toHaveBeenCalledWith('C:\\project', {});
    expect(screen.queryByText('alpha.txt')).not.toBeNull();
  });

  it('keeps the newest folder when an older listing resolves last', async () => {
    const slowResult = {
      ok: true as const,
      path: 'C:\\slow',
      entries: [{ name: 'stale.txt', path: 'C:\\slow\\stale.txt', isDir: false, size: 5 }],
    };
    let resolveSlow!: (value: typeof slowResult) => void;
    const slowRequest = new Promise<typeof slowResult>((resolve) => {
      resolveSlow = resolve;
    });
    testMocks.listDirectory.mockReturnValueOnce(slowRequest).mockResolvedValueOnce({
      ok: true,
      path: 'C:\\fast',
      entries: [{ name: 'current.txt', path: 'C:\\fast\\current.txt', isDir: false, size: 7 }],
    });

    void openFileExplorer({ mode: 'file', initialPath: 'C:\\slow' });
    render(<FileExplorerHost />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    fireEvent.change(screen.getByLabelText('Current path'), {
      target: { value: 'C:\\fast' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText('current.txt')).not.toBeNull();

    await act(async () => {
      resolveSlow(slowResult);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByText('stale.txt')).toBeNull();
    expect(screen.queryByText('current.txt')).not.toBeNull();
    expect((screen.getByLabelText('Current path') as HTMLInputElement).value).toBe('C:\\fast');
  });

  it('adds Places that resolve after the fast-start deadline', async () => {
    vi.useFakeTimers();
    let resolvePlaces!: (value: Array<{
      id: string;
      label: string;
      path: string;
      icon: 'desktop';
    }>) => void;
    testMocks.resolveExplorerPlaces.mockReturnValue(
      new Promise((resolve) => {
        resolvePlaces = resolve;
      }),
    );
    testMocks.listDirectory.mockResolvedValue({
      ok: true,
      path: 'C:\\project',
      entries: [],
    });

    void openFileExplorer({ mode: 'file', initialPath: 'C:\\project' });
    render(<FileExplorerHost />);

    await act(async () => {
      await Promise.resolve();
      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
    });
    expect(screen.queryByRole('button', { name: 'Desktop' })).toBeNull();

    await act(async () => {
      resolvePlaces([
        { id: 'desktop', label: 'Desktop', path: 'C:\\Users\\viper\\Desktop', icon: 'desktop' },
      ]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByRole('button', { name: 'Desktop' })).not.toBeNull();
  });

  it('stops the spinner when a directory listing never settles', async () => {
    vi.useFakeTimers();
    testMocks.listDirectory.mockReturnValue(new Promise(() => undefined));

    void openFileExplorer({ mode: 'file', initialPath: 'C:\\project' });
    render(<FileExplorerHost />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(testMocks.listDirectory).toHaveBeenCalled();
    expect(screen.queryByText('Loading…')).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByText('Loading…')).toBeNull();
    expect(screen.queryByText(/taking too long/i)).not.toBeNull();
  });
});
