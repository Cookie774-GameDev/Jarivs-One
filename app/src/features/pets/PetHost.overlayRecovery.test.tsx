import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  showPetOverlay: vi.fn(),
  hidePetOverlay: vi.fn(async () => undefined),
  isPetPanelVisible: vi.fn(async () => false),
}));

vi.mock('./PetOverlay', () => ({ PetOverlay: () => null }));
vi.mock('./PetMiniPanel', () => ({ PetMiniPanel: () => null }));
vi.mock('./petTauriBridge', () => ({
  claimPetHostInstance: vi.fn(() => true),
  hidePetOverlay: bridge.hidePetOverlay,
  isPetPanelVisible: bridge.isPetPanelVisible,
  isTauriRuntime: vi.fn(() => true),
  openOrFocusPetMiniPanel: vi.fn(),
  PET_OPEN_PANEL_EVENT: 'vibespace:pet-open-panel',
  PET_PANEL_OPEN_FLAG_KEY: 'vibespace:pet-panel-open',
  readPetPanelOpenFlag: vi.fn(() => false),
  releasePetHostInstance: vi.fn(),
  setPetPanelOpenFlag: vi.fn(),
  showPetOverlay: bridge.showPetOverlay,
}));
vi.mock('./petRuntimeEvents', () => ({
  installPetApplicationEventAdapters: vi.fn(() => () => undefined),
}));
vi.mock('./petPresentationStore', () => ({
  installPetPresentationStorageSync: vi.fn(() => () => undefined),
}));
vi.mock('./petSettingsStore', () => ({
  installPetSettingsStorageSync: vi.fn(() => () => undefined),
  usePetSettingsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      enabled: true,
      reducedMotion: false,
      panelMode: 'normal',
      overlayVisible: true,
      sleepTimeoutMs: 300_000,
      idleFunIntervalMs: 60_000,
      setOverlayVisible: vi.fn(),
      setEnabled: vi.fn(),
    }),
}));
vi.mock('./pixiAtlasPlayer', () => ({ getLivePixiApplicationCount: vi.fn(() => 0) }));
vi.mock('./petDevPerf', () => ({ installPetDevPerfGlobal: vi.fn(() => () => undefined) }));

import { PetHost } from './PetHost';

function hiddenNativeOverlay() {
  return {
    mode: 'native-overlay' as const,
    created: false,
    visible: false,
    topmostApplied: false,
    rendererReady: null,
    reason: 'visibility_timeout' as const,
  };
}

function visibleNativeOverlay() {
  return {
    mode: 'native-overlay' as const,
    created: false,
    visible: true,
    topmostApplied: true,
    rendererReady: null,
    reason: null,
  };
}

describe('PetHost native overlay recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    bridge.isPetPanelVisible.mockResolvedValue(false);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('retries one transient native show failure and stops once the detached overlay is visible', async () => {
    bridge.showPetOverlay
      .mockResolvedValueOnce(hiddenNativeOverlay())
      .mockResolvedValueOnce(visibleNativeOverlay());

    render(<PetHost />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(bridge.showPetOverlay).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(bridge.showPetOverlay).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(bridge.showPetOverlay).toHaveBeenCalledTimes(2);
  });

  it('cancels a queued recovery when the Pet host unmounts', async () => {
    bridge.showPetOverlay.mockResolvedValue(hiddenNativeOverlay());

    const mounted = render(<PetHost />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(bridge.showPetOverlay).toHaveBeenCalledTimes(1);

    mounted.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(bridge.showPetOverlay).toHaveBeenCalledTimes(1);
  });
});
