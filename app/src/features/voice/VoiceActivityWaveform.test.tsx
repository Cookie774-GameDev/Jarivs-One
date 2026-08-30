import { act, render } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VoiceActivityWaveform } from './VoiceActivityWaveform';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('VoiceActivityWaveform', () => {
  it('uses the theme-provided honey and copper signal colors', () => {
    const gradient = { addColorStop: vi.fn() };
    const context = {
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      createLinearGradient: vi.fn(() => gradient),
      fill: vi.fn(),
      fillStyle: '',
      roundRect: vi.fn(),
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
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (property: string) =>
        ({
          '--jarvis-waveform-high': '#ffe3a3',
          '--jarvis-waveform-mid': '#d98a4e',
          '--jarvis-waveform-low': '#8f5338',
        })[property] ?? '',
    } as CSSStyleDeclaration);
    let scheduledFrame: FrameRequestCallback | undefined;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      scheduledFrame = callback;
      return 1;
    });

    render(<VoiceActivityWaveform levelRef={{ current: 0.7 }} active />);
    act(() => scheduledFrame?.(48));

    expect(gradient.addColorStop).toHaveBeenNthCalledWith(1, 0, '#ffe3a3');
    expect(gradient.addColorStop).toHaveBeenNthCalledWith(2, 0.5, '#d98a4e');
    expect(gradient.addColorStop).toHaveBeenNthCalledWith(3, 1, '#8f5338');
  });

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

  it('cancels active drawing while backgrounded and resumes only after foregrounding', () => {
    const callbacks: FrameRequestCallback[] = [];
    const context = {
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      fill: vi.fn(),
      fillStyle: '',
      roundRect: vi.fn(),
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
    const requestFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callbacks.push(callback);
        return callbacks.length;
      });
    const cancelFrame = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');

    render(<VoiceActivityWaveform levelRef={{ current: 0.5 }} active />);
    expect(requestFrame).toHaveBeenCalledOnce();

    visibility.mockReturnValue('hidden');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(cancelFrame).toHaveBeenCalledWith(1);
    expect(requestFrame).toHaveBeenCalledOnce();

    act(() => callbacks[0]?.(48));
    expect(requestFrame).toHaveBeenCalledOnce();

    visibility.mockReturnValue('visible');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(requestFrame).toHaveBeenCalledTimes(2);
  });

  it('is decorative and draws a static frame without scheduling animation for reduced motion', () => {
    const context = {
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      fill: vi.fn(),
      fillStyle: '',
      roundRect: vi.fn(),
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
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

    const rendered = render(<VoiceActivityWaveform levelRef={{ current: 0.8 }} active />);
    const canvas = rendered.container.querySelector('canvas');

    expect(canvas?.getAttribute('aria-hidden')).toBe('true');
    expect(context.fill).toHaveBeenCalled();
    expect(requestFrame).not.toHaveBeenCalled();
  });
});
