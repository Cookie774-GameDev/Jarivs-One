import { describe, expect, it } from 'vitest';
import { boundedWhipFrameSteps } from './WhipCanvas';

describe('WhipCanvas frame pacing', () => {
  it('uses a stable step at normal refresh and bounds catch-up work after a stall', () => {
    expect(boundedWhipFrameSteps(16.7)).toBe(1);
    expect(boundedWhipFrameSteps(33.4)).toBe(2);
    expect(boundedWhipFrameSteps(5_000)).toBe(2);
    expect(boundedWhipFrameSteps(-1)).toBe(1);
  });
});
