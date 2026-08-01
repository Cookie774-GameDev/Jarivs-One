import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiKeySaveBurst, fireApiKeySaveBurstFromElement } from './ApiKeySaveBurst';

const globalsCss = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8');
const burstBlockStart = globalsCss.indexOf('/* ── API key save');
const burstBlockEnd = globalsCss.indexOf('@keyframes terminal-focus-pulse', burstBlockStart);
const burstCss = globalsCss.slice(burstBlockStart, burstBlockEnd);

describe('ApiKeySaveBurst', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    delete document.documentElement.dataset.theme;
    document.head.querySelector('[data-api-key-save-burst-test-styles]')?.remove();
    document.body.querySelector('[data-api-key-save-burst-test-overlay]')?.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('dispatches from the trigger center and preserves every timed burst phase', () => {
    const trigger = document.createElement('button');
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      bottom: 240,
      height: 40,
      left: 100,
      right: 160,
      top: 200,
      width: 60,
      x: 100,
      y: 200,
      toJSON: () => ({}),
    });

    const { container } = render(<ApiKeySaveBurst />);

    act(() => fireApiKeySaveBurstFromElement(trigger));

    const wave = container.querySelector<HTMLElement>('.jarvis-api-key-save-burst-wave');
    const glow = container.querySelector<HTMLElement>('.jarvis-api-key-save-burst-glow');
    expect(wave?.style.left).toBe('130px');
    expect(wave?.style.top).toBe('220px');
    expect(glow?.classList.contains('phase-expanding')).toBe(true);

    act(() => vi.advanceTimersByTime(400));
    expect(wave?.classList.contains('phase-holding')).toBe(true);

    act(() => vi.advanceTimersByTime(500));
    expect(wave?.classList.contains('phase-retracting')).toBe(true);

    act(() => vi.advanceTimersByTime(700));
    expect(wave?.classList.contains('phase-sparkle')).toBe(true);
    expect(container.querySelectorAll('.jarvis-sparkle')).toHaveLength(8);

    act(() => vi.advanceTimersByTime(1200));
    expect(container.querySelector('.mc7f-api-key-save-burst')).toBeNull();
  });

  it('clears every pending phase timer when the overlay unmounts', () => {
    const clearTimeout = vi.spyOn(window, 'clearTimeout');
    const { unmount } = render(<ApiKeySaveBurst />);

    act(() => fireApiKeySaveBurstFromElement(null));
    unmount();

    expect(clearTimeout).toHaveBeenCalledTimes(4);
  });

  it('renders a visible solid ring and plane without gradients, blur, or shadows in MonoChrome', () => {
    const style = document.createElement('style');
    style.dataset.apiKeySaveBurstTestStyles = '';
    style.textContent = burstCss;
    document.head.append(style);

    const overlay = document.createElement('div');
    overlay.className = 'mc7f-api-key-save-burst';
    overlay.dataset.apiKeySaveBurstTestOverlay = '';
    overlay.innerHTML = `
      <div class="jarvis-api-key-save-burst-wave phase-expanding"></div>
      <div class="jarvis-api-key-save-burst-glow phase-expanding"></div>
      <div class="jarvis-sparkle"></div>
    `;
    document.body.append(overlay);

    const wave = overlay.querySelector<HTMLElement>('.jarvis-api-key-save-burst-wave')!;
    const glow = overlay.querySelector<HTMLElement>('.jarvis-api-key-save-burst-glow')!;
    const sparkle = overlay.querySelector<HTMLElement>('.jarvis-sparkle')!;

    expect(getComputedStyle(wave).backgroundImage).toContain('conic-gradient');
    expect(getComputedStyle(wave).filter).toBe('blur(40px)');
    expect(getComputedStyle(glow).backgroundImage).toContain('radial-gradient');
    expect(getComputedStyle(glow).filter).toBe('blur(30px)');

    document.documentElement.dataset.theme = 'monochrome';

    const monochromeWave = getComputedStyle(wave);
    const monochromeGlow = getComputedStyle(glow);
    const monochromeSparkle = getComputedStyle(sparkle);
    expect(monochromeWave.backgroundImage).toBe('none');
    expect(monochromeWave.filter).toBe('none');
    expect(monochromeWave.boxShadow).toBe('none');
    expect(monochromeWave.borderTopStyle).toBe('solid');
    expect(Number.parseFloat(monochromeWave.borderTopWidth)).toBeGreaterThan(0);
    expect(monochromeGlow.backgroundImage).toBe('none');
    expect(monochromeGlow.filter).toBe('none');
    expect(monochromeGlow.boxShadow).toBe('none');
    expect(monochromeGlow.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(monochromeSparkle.backgroundImage).toBe('none');
    expect(monochromeSparkle.filter).toBe('none');
    expect(monochromeSparkle.boxShadow).toBe('none');

    overlay.remove();
  });
});
