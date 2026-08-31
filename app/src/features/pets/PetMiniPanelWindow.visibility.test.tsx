import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  hidePetOverlay: vi.fn(async () => undefined),
  hidePetPanel: vi.fn(async () => undefined),
  reassertPetOverlayTopmost: vi.fn(async () => undefined),
}));
const settings = vi.hoisted(() => ({ enabled: false }));

vi.mock('@/features/auth/AuthGate', () => ({
  AuthGate: ({ children }: { children: unknown }) => children,
}));
vi.mock('@/stores/ui', () => ({
  applyThemeToDocument: vi.fn(),
  useUIStore: (selector: (state: { theme: string }) => unknown) => selector({ theme: 'dark' }),
}));
vi.mock('./PetMiniPanel', () => ({ PetMiniPanel: () => null }));
vi.mock('./petPresentationStore', () => ({
  installPetPresentationStorageSync: vi.fn(() => () => undefined),
}));
vi.mock('./petSettingsStore', () => ({
  installPetSettingsStorageSync: vi.fn(() => () => undefined),
  usePetSettingsStore: (selector: (state: { enabled: boolean }) => unknown) =>
    selector({ enabled: settings.enabled }),
}));
vi.mock('./petTauriBridge', () => ({
  hidePetOverlay: bridge.hidePetOverlay,
  hidePetPanel: bridge.hidePetPanel,
  reassertPetOverlayTopmost: bridge.reassertPetOverlayTopmost,
}));

import { PetMiniPanelWindow } from './PetMiniPanelWindow';

describe('PetMiniPanelWindow disabled startup visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settings.enabled = false;
  });

  it('hides the panel before the overlay and skips topmost recovery when Pet is disabled', async () => {
    render(<PetMiniPanelWindow />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(bridge.hidePetPanel).toHaveBeenCalledTimes(1);
    expect(bridge.hidePetOverlay).toHaveBeenCalledTimes(1);
    expect(bridge.hidePetPanel.mock.invocationCallOrder[0]).toBeLessThan(
      bridge.hidePetOverlay.mock.invocationCallOrder[0],
    );
    expect(bridge.reassertPetOverlayTopmost).not.toHaveBeenCalled();
  });
});
