import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  showPetOverlay: vi.fn(),
  hidePetOverlay: vi.fn(async () => undefined),
  isPetOverlayVisible: vi.fn(async () => false),
  isPetPanelVisible: vi.fn(async () => false),
  reassertPetOverlayTopmost: vi.fn(async () => undefined),
}));

const settings = vi.hoisted(() => ({
  overlayVisible: true,
  setOverlayVisible: vi.fn(),
}));
const runtime = vi.hoisted(() => ({ tauri: true }));

vi.mock('./PetOverlay', () => ({ PetOverlay: () => null }));
vi.mock('./PetMiniPanel', () => ({
  PetMiniPanel: ({ open }: { open: boolean }) =>
    open ? <div data-testid="inline-pet-panel" /> : null,
}));
vi.mock('./petTauriBridge', () => ({
  claimPetHostInstance: vi.fn(() => true),
  hidePetOverlay: bridge.hidePetOverlay,
  hidePetPanel: vi.fn(async () => undefined),
  isPetOverlayVisible: bridge.isPetOverlayVisible,
  isPetPanelVisible: bridge.isPetPanelVisible,
  isTauriRuntime: vi.fn(() => runtime.tauri),
  openOrFocusPetMiniPanel: vi.fn(),
  PET_OPEN_PANEL_EVENT: 'vibespace:pet-open-panel',
  PET_PANEL_OPEN_FLAG_KEY: 'vibespace:pet-panel-open',
  readPetPanelOpenFlag: vi.fn(() => false),
  releasePetHostInstance: vi.fn(),
  reassertPetOverlayTopmost: bridge.reassertPetOverlayTopmost,
  setPetPanelOpenFlag: vi.fn(),
  showPetOverlay: bridge.showPetOverlay,
}));
vi.mock('./petRuntimeEvents', () => ({
  installPetApplicationEventAdapters: vi.fn(() => () => undefined),
}));
vi.mock('./petPresentationStore', () => ({
  installPetPresentationStorageSync: vi.fn(() => () => undefined),
}));
vi.mock('./petSettingsStore', () => {
  const state = () => ({
    enabled: true,
    reducedMotion: false,
    panelMode: 'normal',
    overlayVisible: settings.overlayVisible,
    sleepTimeoutMs: 300_000,
    idleFunIntervalMs: 60_000,
    setOverlayVisible: settings.setOverlayVisible,
    setEnabled: vi.fn(),
  });
  const usePetSettingsStore = (selector: (value: Record<string, unknown>) => unknown) =>
    selector(state());
  usePetSettingsStore.getState = state;
  return {
    installPetSettingsStorageSync: vi.fn(() => () => undefined),
    usePetSettingsStore,
  };
});
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
    bridge.isPetOverlayVisible.mockResolvedValue(false);
    settings.overlayVisible = true;
    settings.setOverlayVisible.mockClear();
    runtime.tauri = true;
  });

  it('keeps an enabled Pet intentionally hidden instead of reopening it', async () => {
    settings.overlayVisible = false;

    render(<PetHost />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(settings.setOverlayVisible).not.toHaveBeenCalled();
    expect(bridge.showPetOverlay).not.toHaveBeenCalled();
  });

  it('unmounts the browser mini panel before showing the Pet again', async () => {
    runtime.tauri = false;
    bridge.showPetOverlay.mockResolvedValue(visibleNativeOverlay());
    const mounted = render(<PetHost />);

    await act(async () => {
      window.dispatchEvent(new CustomEvent('vibespace:pet-open-panel'));
      await Promise.resolve();
    });
    expect(mounted.queryByTestId('inline-pet-panel')).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new CustomEvent('jarvis:pet:show'));
      await Promise.resolve();
    });
    expect(mounted.queryByTestId('inline-pet-panel')).toBeNull();
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
    bridge.isPetOverlayVisible.mockResolvedValue(true);

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

  it('keeps supervising an enabled detached overlay after startup retries are exhausted', async () => {
    bridge.showPetOverlay
      .mockResolvedValueOnce(hiddenNativeOverlay())
      .mockResolvedValueOnce(hiddenNativeOverlay())
      .mockResolvedValueOnce(hiddenNativeOverlay())
      .mockResolvedValueOnce(hiddenNativeOverlay())
      .mockResolvedValueOnce(visibleNativeOverlay());

    render(<PetHost />);
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(4_250);
    });
    expect(bridge.showPetOverlay).toHaveBeenCalledTimes(4);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(bridge.isPetOverlayVisible).toHaveBeenCalled();
    expect(bridge.showPetOverlay).toHaveBeenCalledTimes(5);
    expect(bridge.reassertPetOverlayTopmost).toHaveBeenCalledTimes(1);
  });
});
