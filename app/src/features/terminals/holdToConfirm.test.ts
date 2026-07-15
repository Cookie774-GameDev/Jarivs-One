import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HOLD_CONFIRM_WINDOW_MS,
  HOLD_TO_CONFIRM_MS,
  createHoldToConfirmController,
} from './holdToConfirm';

describe('createHoldToConfirmController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('moves idle → holding → confirm after the hold duration', () => {
    const phases: string[] = [];
    const ctrl = createHoldToConfirmController({
      onPhaseChange: (p) => phases.push(p),
    });

    expect(ctrl.beginHold()).toBe(true);
    expect(ctrl.getPhase()).toBe('holding');
    expect(phases).toEqual(['holding']);

    vi.advanceTimersByTime(HOLD_TO_CONFIRM_MS - 1);
    expect(ctrl.getPhase()).toBe('holding');

    vi.advanceTimersByTime(1);
    expect(ctrl.getPhase()).toBe('confirm');
    expect(phases).toEqual(['holding', 'confirm']);

    ctrl.dispose();
  });

  it('cancelHold aborts only while holding, not while confirm', () => {
    const ctrl = createHoldToConfirmController();
    ctrl.beginHold();
    ctrl.cancelHold();
    expect(ctrl.getPhase()).toBe('idle');

    ctrl.beginHold();
    vi.advanceTimersByTime(HOLD_TO_CONFIRM_MS);
    expect(ctrl.getPhase()).toBe('confirm');
    ctrl.cancelHold();
    expect(ctrl.getPhase()).toBe('confirm');
    expect(ctrl.confirm()).toBe(true);
    expect(ctrl.getPhase()).toBe('idle');
    ctrl.dispose();
  });

  it('confirm only succeeds in the confirm window', () => {
    const ctrl = createHoldToConfirmController();
    expect(ctrl.confirm()).toBe(false);
    ctrl.beginHold();
    expect(ctrl.confirm()).toBe(false);
    vi.advanceTimersByTime(HOLD_TO_CONFIRM_MS);
    expect(ctrl.confirm()).toBe(true);
    expect(ctrl.confirm()).toBe(false);
    ctrl.dispose();
  });

  it('auto-resets to idle if confirm is not clicked in time', () => {
    const ctrl = createHoldToConfirmController();
    ctrl.beginHold();
    vi.advanceTimersByTime(HOLD_TO_CONFIRM_MS);
    expect(ctrl.getPhase()).toBe('confirm');
    vi.advanceTimersByTime(HOLD_CONFIRM_WINDOW_MS);
    expect(ctrl.getPhase()).toBe('idle');
    ctrl.dispose();
  });

  it('refuses beginHold when canBegin returns false', () => {
    const ctrl = createHoldToConfirmController({ canBegin: () => false });
    expect(ctrl.beginHold()).toBe(false);
    expect(ctrl.getPhase()).toBe('idle');
    ctrl.dispose();
  });
});
