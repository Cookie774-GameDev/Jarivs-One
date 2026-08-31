import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JarvisEdgeAura, normalizeAmbientSnapshot } from './JarvisEdgeAura';
import type { JarvisAmbientSnapshot } from './types';

const listening: JarvisAmbientSnapshot = {
  revision: 4,
  state: 'listening',
  source: 'voice',
  observedAt: 100,
  energy: 0.72,
};

describe('JarvisEdgeAura', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => vi.restoreAllMocks());

  it('exposes only a decorative full-window canvas for the active state', () => {
    render(<JarvisEdgeAura snapshot={listening} reducedMotion />);
    const aura = screen.getByTestId('jarvis-edge-aura');
    expect(aura.getAttribute('data-jarvis-ambient-state')).toBe('listening');
    expect(aura.getAttribute('data-energy')).toBe('0.72');
    expect(aura.getAttribute('aria-hidden')).toBe('true');
    expect(aura.querySelector('canvas')).not.toBeNull();
    expect(aura.textContent).toBe('');
  });

  it('fails malformed snapshots closed to invisible idle', () => {
    expect(normalizeAmbientSnapshot({ ...listening, energy: 4 })).toMatchObject({
      state: 'idle',
      energy: 0,
    });
    expect(normalizeAmbientSnapshot(null)).toMatchObject({ state: 'idle', energy: 0 });
  });
});
