import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SiyuanSurfaceBridge } from './siyuanSurface';
import { SiyuanVaultSurface } from './SiyuanVaultSurface';

class ResizeObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();
}

const targetProps = {
  mapId: 'map-1',
  notebookId: '20260824010101-abcdefg',
  rootDocumentId: '20260824010102-abcdefg',
} as const;

function bridge(overrides: Partial<SiyuanSurfaceBridge> = {}): SiyuanSurfaceBridge {
  const status = {
    created: true,
    visible: true,
    projectId: 'project-1',
    ...targetProps,
    graphMode: 'local' as const,
  };
  return {
    open: vi.fn(async () => status),
    setBounds: vi.fn(async () => true),
    hide: vi.fn(async () => true),
    reload: vi.fn(async () => true),
    close: vi.fn(async () => true),
    status: vi.fn(async () => status),
    ...overrides,
  };
}

describe('SiYuan Context Vault surface', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 400,
      top: 80,
      right: 1_600,
      bottom: 880,
      width: 1_200,
      height: 800,
      toJSON: () => ({}),
    });
  });

  it('opens over the reserved rectangle and clears the native surface on close', async () => {
    const native = bridge();
    const onClose = vi.fn();
    render(
      <SiyuanVaultSurface
        projectId="project-1"
        {...targetProps}
        bridge={native}
        onClose={onClose}
      />,
    );

    await waitFor(() =>
      expect(native.open).toHaveBeenCalledWith(
        'project-1',
        { ...targetProps, graphMode: 'local' },
        { x: 400, y: 80, width: 1_200, height: 800 },
      ),
    );
    expect(screen.getByTestId('siyuan-vault-surface').getAttribute('data-siyuan-map-id')).toBe(
      'map-1',
    );
    fireEvent.click(screen.getByRole('button', { name: /close/iu }));
    await waitFor(() => expect(native.close).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a stable redacted error and retries without exposing an origin', async () => {
    const open = vi
      .fn()
      .mockRejectedValueOnce(new Error('siyuan_surface_window_unavailable'))
      .mockResolvedValueOnce({
        created: true,
        visible: true,
        projectId: 'project-1',
        ...targetProps,
        graphMode: 'local',
      });
    const native = bridge({ open });
    render(
      <SiyuanVaultSurface
        projectId="project-1"
        {...targetProps}
        bridge={native}
        onClose={vi.fn()}
      />,
    );

    expect((await screen.findByRole('alert')).textContent).toContain(
      'siyuan_surface_window_unavailable',
    );
    expect(screen.getByRole('alert').textContent).not.toMatch(/cookie|token|127\.0\.0\.1|http/iu);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /retry/iu }));
    });
    await waitFor(() => expect(open).toHaveBeenCalledTimes(2));
  });

  it('retires the child webview when focused-map mode unmounts', async () => {
    const native = bridge();
    const rendered = render(
      <SiyuanVaultSurface
        projectId="project-1"
        {...targetProps}
        bridge={native}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(native.open).toHaveBeenCalled());
    rendered.unmount();
    await waitFor(() => expect(native.close).toHaveBeenCalled());
    expect(native.hide).not.toHaveBeenCalled();
  });
});
