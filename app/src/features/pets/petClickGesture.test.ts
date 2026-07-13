import { describe, expect, it } from 'vitest';
import {
  beginPetPointerGesture,
  PET_CLICK_MOVE_THRESHOLD_PX,
  samplePetPointerGesture,
  shouldOpenPanelFromGesture,
} from './petClickGesture';

describe('petClickGesture (click vs drag)', () => {
  it('small jitter below threshold is still a click', () => {
    const g = beginPetPointerGesture({
      pointerId: 1,
      clientX: 100,
      clientY: 100,
      screenX: 100,
      screenY: 100,
      logicalLeft: 20,
      logicalTop: 40,
      nowMs: 0,
    });
    samplePetPointerGesture(g, 104, 103); // 5px-ish
    samplePetPointerGesture(g, 106, 102);
    expect(g.dragged).toBe(false);
    expect(shouldOpenPanelFromGesture(g)).toBe(true);
  });

  it('movement above threshold is a drag and does not open panel', () => {
    const g = beginPetPointerGesture({
      pointerId: 1,
      clientX: 100,
      clientY: 100,
      screenX: 100,
      screenY: 100,
      logicalLeft: 20,
      logicalTop: 40,
      nowMs: 0,
    });
    samplePetPointerGesture(g, 100 + PET_CLICK_MOVE_THRESHOLD_PX + 1, 100);
    expect(g.dragged).toBe(true);
    expect(shouldOpenPanelFromGesture(g)).toBe(false);
  });

  it('one pointermove event below threshold does not suppress click', () => {
    const g = beginPetPointerGesture({
      pointerId: 1,
      clientX: 50,
      clientY: 50,
      screenX: 50,
      screenY: 50,
      logicalLeft: 0,
      logicalTop: 0,
      nowMs: 10,
    });
    // A single tiny move (common WebView noise) must still count as click.
    samplePetPointerGesture(g, 51, 50);
    expect(shouldOpenPanelFromGesture(g)).toBe(true);
  });

  it('null gesture does not open panel', () => {
    expect(shouldOpenPanelFromGesture(null)).toBe(false);
    expect(shouldOpenPanelFromGesture(undefined)).toBe(false);
  });
});
