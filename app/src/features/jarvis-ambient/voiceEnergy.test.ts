import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getJarvisInputEnergy,
  resetJarvisInputEnergy,
  setJarvisInputEnergy,
  subscribeJarvisInputEnergy,
} from './voiceEnergy';

describe('Jarvis input energy channel', () => {
  beforeEach(resetJarvisInputEnergy);

  it('starts at zero, clamps finite levels, and ignores duplicate samples', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeJarvisInputEnergy(listener);
    setJarvisInputEnergy(1.6);
    setJarvisInputEnergy(1.6);
    setJarvisInputEnergy(Number.NaN);

    expect(listener.mock.calls.map(([level]) => level)).toEqual([0, 1, 0]);
    expect(getJarvisInputEnergy()).toBe(0);
    unsubscribe();
  });

  it('stops publishing after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeJarvisInputEnergy(listener);
    unsubscribe();
    setJarvisInputEnergy(0.8);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
