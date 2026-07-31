import { describe, expect, it, vi } from 'vitest';
import {
  resolveSakuraRenderingMode,
  startSakuraFrameProbe,
  type SakuraFrameScheduler,
} from './sakuraPerformanceMode';

describe('Sakura performance mode', () => {
  it('selects enhanced only after supported, motion-safe startup meets its frozen budget', () => {
    expect(
      resolveSakuraRenderingMode({
        forcedColors: false,
        frameProbe: 'met',
        reducedMotion: false,
        supportsVisualEffects: true,
      }),
    ).toBe('enhanced');

    for (const override of [
      { forcedColors: true },
      { frameProbe: 'pending' as const },
      { frameProbe: 'missed' as const },
      { reducedMotion: true },
      { supportsVisualEffects: false },
    ]) {
      expect(
        resolveSakuraRenderingMode({
          forcedColors: false,
          frameProbe: 'met',
          reducedMotion: false,
          supportsVisualEffects: true,
          ...override,
        }),
      ).toBe('static');
    }
  });

  it('uses exactly two startup frames and reports one bounded result', () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextId = 0;
    const scheduler: SakuraFrameScheduler = {
      requestFrame: vi.fn((callback) => {
        nextId += 1;
        callbacks.set(nextId, callback);
        return nextId;
      }),
      cancelFrame: vi.fn((id) => callbacks.delete(id)),
    };
    const onResult = vi.fn();

    const cancel = startSakuraFrameProbe(scheduler, onResult, 34);
    expect(scheduler.requestFrame).toHaveBeenCalledTimes(1);
    callbacks.get(1)?.(10);
    expect(scheduler.requestFrame).toHaveBeenCalledTimes(2);
    callbacks.get(2)?.(38);

    expect(onResult).toHaveBeenCalledOnce();
    expect(onResult).toHaveBeenCalledWith('met');
    expect(scheduler.requestFrame).toHaveBeenCalledTimes(2);
    cancel();
  });

  it('fails a late frame and cancellation prevents stale completion', () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextId = 0;
    const scheduler: SakuraFrameScheduler = {
      requestFrame(callback) {
        nextId += 1;
        callbacks.set(nextId, callback);
        return nextId;
      },
      cancelFrame: vi.fn((id) => callbacks.delete(id)),
    };
    const lateResult = vi.fn();
    startSakuraFrameProbe(scheduler, lateResult, 34);
    callbacks.get(1)?.(10);
    callbacks.get(2)?.(46);
    expect(lateResult).toHaveBeenCalledWith('missed');

    const staleResult = vi.fn();
    const cancel = startSakuraFrameProbe(scheduler, staleResult, 34);
    const pendingId = nextId;
    const staleCallback = callbacks.get(pendingId);
    cancel();
    staleCallback?.(20);
    expect(staleResult).not.toHaveBeenCalled();
    expect(scheduler.cancelFrame).toHaveBeenCalledWith(pendingId);
  });
});
