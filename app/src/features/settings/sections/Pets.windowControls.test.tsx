import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  hidePetOverlay: vi.fn(async () => undefined),
  hidePetPanel: vi.fn(async () => undefined),
  openOrFocusPetMiniPanel: vi.fn(async () => ({
    panelVisible: true,
    useInlineFallback: false,
    overlayVisible: false,
    reason: null,
    coalesced: false,
  })),
  openOrFocusPetPanel: vi.fn(async () => ({ visible: true, focused: true })),
  showPetOverlay: vi.fn(async () => ({ visible: true })),
}));

const settings = vi.hoisted(() => ({
  setEnabled: vi.fn(),
  setOverlayVisible: vi.fn(),
}));

vi.mock('@/features/pets/petTauriBridge', () => ({
  getPetStartWithWindows: vi.fn(async () => false),
  hidePetOverlay: bridge.hidePetOverlay,
  hidePetPanel: bridge.hidePetPanel,
  isPetOverlayVisible: vi.fn(async () => true),
  isTauriRuntime: vi.fn(() => true),
  openOrFocusPetMiniPanel: bridge.openOrFocusPetMiniPanel,
  openOrFocusPetPanel: bridge.openOrFocusPetPanel,
  setPetOverlayPosition: vi.fn(async () => undefined),
  setPetStartWithWindows: vi.fn(async (enabled: boolean) => enabled),
  showPetOverlay: bridge.showPetOverlay,
}));

vi.mock('@/features/pets/petSettingsStore', () => ({
  forcePetAnim: vi.fn(),
  usePetSettingsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      enabled: true,
      reducedMotion: false,
      sleepTimeoutMs: 300_000,
      idleFunIntervalMs: 60_000,
      showDiagnostics: false,
      overlayVisible: true,
      panelMode: 'normal',
      positionLocked: false,
      edgeSnapping: true,
      animationLevel: 'calm',
      soundEnabled: true,
      notificationReactions: true,
      pointerTracking: true,
      setEnabled: settings.setEnabled,
      setReducedMotion: vi.fn(),
      setSleepTimeoutMs: vi.fn(),
      setIdleFunIntervalMs: vi.fn(),
      setShowDiagnostics: vi.fn(),
      setOverlayVisible: settings.setOverlayVisible,
      setPanelMode: vi.fn(),
      setPositionLocked: vi.fn(),
      setEdgeSnapping: vi.fn(),
      setAnimationLevel: vi.fn(),
      setSoundEnabled: vi.fn(),
      setNotificationReactions: vi.fn(),
      setPointerTracking: vi.fn(),
    }),
}));

vi.mock('@/features/pets/petPresentationStore', () => ({
  usePetPresentationStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      panelLifecycle: 'closed',
      chats: {},
      terminals: {},
      panelActiveChatId: null,
      pushActivity: vi.fn(),
    }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => false),
}));

import { Pets } from './Pets';

describe('Settings Pet window controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('closes the mini panel before showing the detached Pet', async () => {
    render(<Pets />);

    fireEvent.click(screen.getByRole('button', { name: 'Show Pet' }));

    await waitFor(() => expect(bridge.showPetOverlay).toHaveBeenCalledTimes(1));
    expect(bridge.hidePetPanel).toHaveBeenCalledTimes(1);
    expect(bridge.hidePetPanel.mock.invocationCallOrder[0]).toBeLessThan(
      bridge.showPetOverlay.mock.invocationCallOrder[0],
    );
  });

  it('uses the confirmed exclusive panel path instead of the raw native open command', async () => {
    render(<Pets />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Mini Panel' }));

    await waitFor(() => expect(bridge.openOrFocusPetMiniPanel).toHaveBeenCalledTimes(1));
    expect(bridge.openOrFocusPetPanel).not.toHaveBeenCalled();
  });
});
