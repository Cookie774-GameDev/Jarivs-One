import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PetOverlayWindow } from './PetOverlayWindow';

const mocks = vi.hoisted(() => ({
  hidePetOverlay: vi.fn(async () => undefined),
  openOrFocusPetMiniPanel: vi.fn(async () => ({
    panelVisible: true,
    useInlineFallback: false,
    coalesced: false,
  })),
  reassertPetOverlayTopmost: vi.fn(async () => undefined),
  setPetPanelOpenFlag: vi.fn(),
  setOverlayVisible: vi.fn(),
  showPetOverlay: vi.fn(async () => undefined),
}));

vi.mock('./PetOverlay', () => ({
  PetOverlay: ({
    onOpenPanel,
    onRequestClose,
  }: {
    onOpenPanel?: () => void;
    onRequestClose?: () => void;
  }) => (
    <div>
      <button type="button" onClick={onOpenPanel}>Open mock pet panel</button>
      <button type="button" onClick={onRequestClose}>Close mock pet</button>
      <canvas data-pet-pixi-canvas="true" />
    </div>
  ),
}));

vi.mock('./petTauriBridge', () => ({
  openOrFocusPetPanel: vi.fn(async () => undefined),
  hidePetOverlay: mocks.hidePetOverlay,
  openOrFocusPetMiniPanel: mocks.openOrFocusPetMiniPanel,
  reassertPetOverlayTopmost: mocks.reassertPetOverlayTopmost,
  setPetPanelOpenFlag: mocks.setPetPanelOpenFlag,
  showPetOverlay: mocks.showPetOverlay,
}));

vi.mock('./petPresentationStore', () => ({
  installPetPresentationStorageSync: vi.fn(() => () => undefined),
}));

vi.mock('./petSettingsStore', () => ({
  installPetSettingsStorageSync: vi.fn(() => () => undefined),
  usePetSettingsStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      reducedMotion: false,
      sleepTimeoutMs: 300_000,
      idleFunIntervalMs: 60_000,
      panelMode: 'always-on-top',
      setOverlayVisible: mocks.setOverlayVisible,
    }),
}));

describe('PetOverlayWindow transparency shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hidePetOverlay.mockResolvedValue(undefined);
    mocks.openOrFocusPetMiniPanel.mockResolvedValue({
      panelVisible: true,
      useInlineFallback: false,
      coalesced: false,
    });
    mocks.showPetOverlay.mockResolvedValue(undefined);
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-vibespace-view');
    document.body.removeAttribute('data-vibespace-view');
    document.documentElement.removeAttribute('style');
    document.body.removeAttribute('style');
    const root = document.getElementById('root');
    root?.removeAttribute('style');
    root?.remove();
  });

  it('marks the document and overlay root as transparent pet-only chrome', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);

    render(<PetOverlayWindow />, { container: root });

    await waitFor(() => {
      expect(document.documentElement.dataset.vibespaceView).toBe('pet-overlay');
    });
    expect(document.body.dataset.vibespaceView).toBe('pet-overlay');
    expect(document.documentElement.style.background).toBe('transparent');
    expect(document.body.style.background).toBe('transparent');
    expect(document.body.style.margin).toBe('0px');
    expect(document.body.style.overflow).toBe('hidden');
    expect(root.style.background).toBe('transparent');

    const overlayRoot = screen.getByTestId('pet-overlay-root');
    expect(overlayRoot.classList.contains('pet-overlay-root')).toBe(true);
    expect(
      overlayRoot.style.background === 'transparent' ||
        overlayRoot.style.backgroundColor === 'transparent',
    ).toBe(true);
    expect(overlayRoot.querySelectorAll('[data-pet-pixi-canvas="true"]')).toHaveLength(1);
  });

  it('opens the real mini-panel with the persisted window mode', async () => {
    render(<PetOverlayWindow />);

    fireEvent.click(screen.getByRole('button', { name: 'Open mock pet panel' }));

    await waitFor(() => {
      expect(mocks.openOrFocusPetMiniPanel).toHaveBeenCalledWith(
        undefined,
        undefined,
        'always-on-top',
      );
    });
    expect(mocks.showPetOverlay).not.toHaveBeenCalled();
  });

  it('restores the sprite when mini-panel opening reports no visible panel', async () => {
    mocks.openOrFocusPetMiniPanel.mockResolvedValueOnce({
      panelVisible: false,
      useInlineFallback: false,
      coalesced: false,
    });
    render(<PetOverlayWindow />);

    fireEvent.click(screen.getByRole('button', { name: 'Open mock pet panel' }));

    await waitFor(() => expect(mocks.showPetOverlay).toHaveBeenCalledOnce());
    expect(mocks.setPetPanelOpenFlag).toHaveBeenCalledWith(false);
  });

  it('wires the native right-click Close action to hide the overlay', async () => {
    render(<PetOverlayWindow />);

    fireEvent.click(screen.getByRole('button', { name: 'Close mock pet' }));

    await waitFor(() => expect(mocks.hidePetOverlay).toHaveBeenCalledOnce());
    expect(mocks.setOverlayVisible).toHaveBeenCalledWith(false);
  });

  it('restores the visible preference when native overlay hiding fails', async () => {
    mocks.hidePetOverlay.mockRejectedValueOnce(new Error('synthetic hide failure'));
    render(<PetOverlayWindow />);

    fireEvent.click(screen.getByRole('button', { name: 'Close mock pet' }));

    await waitFor(() => expect(mocks.showPetOverlay).toHaveBeenCalledOnce());
    expect(mocks.setOverlayVisible).toHaveBeenNthCalledWith(1, false);
    expect(mocks.setOverlayVisible).toHaveBeenNthCalledWith(2, true);
  });
});
