import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PetOverlayWindow } from './PetOverlayWindow';

vi.mock('./PetOverlay', () => ({
  PetOverlay: () => <canvas data-pet-pixi-canvas="true" />,
}));

vi.mock('./petTauriBridge', () => ({
  openOrFocusPetPanel: vi.fn(async () => undefined),
  openOrFocusPetMiniPanel: vi.fn(async () => ({
    panelVisible: true,
    useInlineFallback: false,
    coalesced: false,
  })),
  reassertPetOverlayTopmost: vi.fn(async () => undefined),
  setPetPanelOpenFlag: vi.fn(),
  showPetOverlay: vi.fn(async () => undefined),
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
    }),
}));

vi.mock('@/stores/ui', () => ({
  useUIStore: (sel: (s: Record<string, unknown>) => unknown) => sel({ theme: 'default' }),
  applyThemeToDocument: vi.fn(),
}));

describe('PetOverlayWindow transparency shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-vibespace-view');
    document.body.removeAttribute('data-vibespace-view');
    document.documentElement.removeAttribute('style');
    document.body.removeAttribute('style');
    const root = document.getElementById('root');
    root?.removeAttribute('style');
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

    root.remove();
  });

  it('keeps the real visual shell while suppressing native and storage effects', async () => {
    const { installPetPresentationStorageSync } = await import('./petPresentationStore');
    const { installPetSettingsStorageSync } = await import('./petSettingsStore');
    const { reassertPetOverlayTopmost } = await import('./petTauriBridge');
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);

    render(<PetOverlayWindow runtimeEffectsEnabled={false} />, { container: root });

    await waitFor(() => {
      expect(screen.getByTestId('pet-overlay-root')).toBeTruthy();
    });
    expect(installPetPresentationStorageSync).not.toHaveBeenCalled();
    expect(installPetSettingsStorageSync).not.toHaveBeenCalled();
    expect(reassertPetOverlayTopmost).not.toHaveBeenCalled();

    root.remove();
  });
});
