import { act, render } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VoiceActivityWaveform } from './VoiceActivityWaveform';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('VoiceActivityWaveform', () => {
  it('reads ref-local audio samples on animation frames without rerendering its owner', () => {
    let scheduledFrame: FrameRequestCallback | undefined;
    const roundRect = vi.fn();
    const gradient = { addColorStop: vi.fn() };
    const context = {
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      createLinearGradient: vi.fn(() => gradient),
      fill: vi.fn(),
      fillStyle: '',
      roundRect,
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((contextId: string) =>
      contextId === '2d' ? context : null) as HTMLCanvasElement['getContext']);
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 32,
      height: 32,
      left: 0,
      right: 360,
      top: 0,
      width: 360,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      scheduledFrame = callback;
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

    const levelRef = { current: 0.1 };
    let ownerRenders = 0;
    function Owner() {
      ownerRenders += 1;
      return <VoiceActivityWaveform levelRef={levelRef} active />;
    }

    render(<Owner />);
    expect(ownerRenders).toBe(1);

    const firstFrameStart = roundRect.mock.calls.length;
    act(() => scheduledFrame?.(48));
    const firstFrameEnd = roundRect.mock.calls.length;
    const firstFrameMax = Math.max(
      ...roundRect.mock.calls.slice(firstFrameStart, firstFrameEnd).map((call) => Number(call[3])),
    );
    levelRef.current = 0.9;
    const secondFrameStart = roundRect.mock.calls.length;
    act(() => scheduledFrame?.(96));
    const secondFrameEnd = roundRect.mock.calls.length;
    const secondFrameMax = Math.max(
      ...roundRect.mock.calls
        .slice(secondFrameStart, secondFrameEnd)
        .map((call) => Number(call[3])),
    );

    expect(firstFrameEnd).toBeGreaterThan(firstFrameStart);
    expect(secondFrameEnd).toBeGreaterThan(secondFrameStart);
    expect(secondFrameMax).toBeGreaterThan(firstFrameMax);
    expect(ownerRenders).toBe(1);
  });
});
