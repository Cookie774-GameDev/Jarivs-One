import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@/stores/ui';
import { EmpireFreezerHost } from './EmpireFreezerHost';
import {
  EMPIRE_FREEZER_STORAGE_KEY,
  getEmpireFreezerConfig,
  resetEmpireFreezerForTests,
  updateEmpireFreezerConfig,
} from './empireFreezer';

describe('Empire Freezer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetEmpireFreezerForTests();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    useUIStore.setState({
      wellnessActive: false,
      wellnessKind: null,
      wellnessStartedAt: null,
      wellnessDurationMs: null,
      ambientActive: false,
      voiceModalOpen: false,
      voiceListening: false,
      paletteOpen: false,
      settingsOpen: false,
      actionsPaletteOpen: false,
    });
  });

  afterEach(() => {
    cleanup();
    resetEmpireFreezerForTests();
    vi.useRealTimers();
  });

  it('persists a bounded local preference without network work', () => {
    updateEmpireFreezerConfig({ enabled: true, intervalMs: 1, durationMs: 99_000_000 });

    expect(getEmpireFreezerConfig()).toEqual({
      enabled: true,
      intervalMs: 60_000,
      durationMs: 600_000,
    });
    expect(JSON.parse(localStorage.getItem(EMPIRE_FREEZER_STORAGE_KEY) ?? '{}')).toEqual(
      getEmpireFreezerConfig(),
    );
  });

  it('uses one timer and starts the existing wellness overlay at the configured cadence', () => {
    updateEmpireFreezerConfig({ enabled: true, intervalMs: 60_000, durationMs: 20_000 });
    const timeoutSpy = vi.spyOn(window, 'setTimeout');
    render(<EmpireFreezerHost />);

    expect(timeoutSpy.mock.calls.filter(([, delay]) => delay === 60_000)).toHaveLength(1);
    act(() => vi.advanceTimersByTime(60_000));

    expect(useUIStore.getState()).toMatchObject({
      wellnessActive: true,
      wellnessKind: 'eye-break-20-20-20',
      wellnessDurationMs: 20_000,
    });
  });

  it('waits while VibeSpace is hidden and starts once it is safe', () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    updateEmpireFreezerConfig({ enabled: true, intervalMs: 60_000, durationMs: 20_000 });
    render(<EmpireFreezerHost />);

    act(() => vi.advanceTimersByTime(60_000));
    expect(useUIStore.getState().wellnessActive).toBe(false);
    expect(vi.getTimerCount()).toBe(1);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    act(() => vi.advanceTimersByTime(30_000));
    expect(useUIStore.getState().wellnessActive).toBe(true);
  });
});
