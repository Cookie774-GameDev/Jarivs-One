import { afterEach, describe, expect, it } from 'vitest';
import {
  EXPLORER_AUTO_GRID_MAX_MEDIA,
  EXPLORER_AUTO_GRID_MIN_MEDIA,
  EXPLORER_MAX_CONCURRENT_IMAGE_READS,
  EXPLORER_MAX_GRID_THUMBS,
  EXPLORER_PREVIEW_MAX_BYTES,
  EXPLORER_THUMB_MAX_BYTES,
  __getActiveExplorerImageReadsForTests,
  __resetExplorerImageSlotsForTests,
  isWithinThumbBudget,
  shouldAutoGridMedia,
  shouldLoadExplorerImage,
  withExplorerImageSlot,
} from './fileExplorerMediaLimits';

afterEach(() => {
  __resetExplorerImageSlotsForTests();
});

describe('shouldLoadExplorerImage', () => {
  it('allows small and mid-size files under the cap', () => {
    expect(shouldLoadExplorerImage(0, EXPLORER_THUMB_MAX_BYTES)).toBe(true);
    expect(shouldLoadExplorerImage(1024, EXPLORER_THUMB_MAX_BYTES)).toBe(true);
    expect(shouldLoadExplorerImage(EXPLORER_THUMB_MAX_BYTES, EXPLORER_THUMB_MAX_BYTES)).toBe(true);
  });

  it('rejects files larger than the cap', () => {
    expect(shouldLoadExplorerImage(EXPLORER_THUMB_MAX_BYTES + 1, EXPLORER_THUMB_MAX_BYTES)).toBe(false);
    expect(shouldLoadExplorerImage(12 * 1024 * 1024, EXPLORER_PREVIEW_MAX_BYTES)).toBe(false);
  });

  it('allows unknown size so backend can still enforce too_large', () => {
    expect(shouldLoadExplorerImage(undefined, EXPLORER_THUMB_MAX_BYTES)).toBe(true);
    expect(shouldLoadExplorerImage(null, EXPLORER_PREVIEW_MAX_BYTES)).toBe(true);
  });

  it('rejects negative sizes', () => {
    expect(shouldLoadExplorerImage(-1, EXPLORER_THUMB_MAX_BYTES)).toBe(false);
  });
});

describe('shouldAutoGridMedia', () => {
  it('stays off for sparse folders', () => {
    expect(shouldAutoGridMedia(0)).toBe(false);
    expect(shouldAutoGridMedia(EXPLORER_AUTO_GRID_MIN_MEDIA - 1)).toBe(false);
  });

  it('enables for modest media folders', () => {
    expect(shouldAutoGridMedia(EXPLORER_AUTO_GRID_MIN_MEDIA)).toBe(true);
    expect(shouldAutoGridMedia(12)).toBe(true);
    expect(shouldAutoGridMedia(EXPLORER_AUTO_GRID_MAX_MEDIA)).toBe(true);
  });

  it('disables for huge media dumps so list mode avoids thumb storms', () => {
    expect(shouldAutoGridMedia(EXPLORER_AUTO_GRID_MAX_MEDIA + 1)).toBe(false);
    expect(shouldAutoGridMedia(500)).toBe(false);
  });
});

describe('isWithinThumbBudget', () => {
  it('allows only the first N image indices', () => {
    expect(isWithinThumbBudget(0)).toBe(true);
    expect(isWithinThumbBudget(EXPLORER_MAX_GRID_THUMBS - 1)).toBe(true);
    expect(isWithinThumbBudget(EXPLORER_MAX_GRID_THUMBS)).toBe(false);
    expect(isWithinThumbBudget(-1)).toBe(false);
  });
});

describe('withExplorerImageSlot', () => {
  it('caps concurrent image work', async () => {
    let maxSeen = 0;
    let current = 0;
    const total = EXPLORER_MAX_CONCURRENT_IMAGE_READS + 3;

    await Promise.all(
      Array.from({ length: total }, () =>
        withExplorerImageSlot(async () => {
          current += 1;
          maxSeen = Math.max(maxSeen, current);
          // Brief async pause so overlapping work can pile up if the gate fails.
          await new Promise((r) => setTimeout(r, 15));
          current -= 1;
        }),
      ),
    );

    expect(maxSeen).toBeLessThanOrEqual(EXPLORER_MAX_CONCURRENT_IMAGE_READS);
    expect(maxSeen).toBeGreaterThan(0);
    expect(__getActiveExplorerImageReadsForTests()).toBe(0);
  });

  it('releases the slot when the work rejects', async () => {
    await expect(
      withExplorerImageSlot(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(__getActiveExplorerImageReadsForTests()).toBe(0);
  });
});
