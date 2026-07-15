/**
 * File-explorer-only guards so folders full of large photos do not
 * flood the app with concurrent full-file base64 reads.
 *
 * Scope: explorer thumbnails + side preview. Does not change Rust
 * IPC limits or chat image attachment behavior.
 */

/** Max bytes for a grid thumbnail (skip larger images → icon only). */
export const EXPLORER_THUMB_MAX_BYTES = 2.5 * 1024 * 1024;

/**
 * Max bytes for the side-pane image preview.
 * Matches native `fs_read_image_base64` cap (8 MiB) so screenshots can load.
 */
export const EXPLORER_PREVIEW_MAX_BYTES = 8 * 1024 * 1024;

/** Parallel image base64 reads from the explorer at once. */
export const EXPLORER_MAX_CONCURRENT_IMAGE_READS = 2;

/** Cap how many grid cells load a real thumbnail per folder. */
export const EXPLORER_MAX_GRID_THUMBS = 24;

/** Auto-switch to grid only in this media-count band. */
export const EXPLORER_AUTO_GRID_MIN_MEDIA = 4;
export const EXPLORER_AUTO_GRID_MAX_MEDIA = 48;

/**
 * Whether it is safe to attempt an image read for explorer UI.
 * When size is unknown, allow the attempt (backend still rejects too_large)
 * but callers must go through the concurrency slot.
 */
export function shouldLoadExplorerImage(
  sizeBytes: number | undefined | null,
  maxBytes: number,
): boolean {
  if (sizeBytes == null || !Number.isFinite(sizeBytes)) return true;
  if (sizeBytes < 0) return false;
  return sizeBytes <= maxBytes;
}

/** Auto-grid only for modest media folders — huge Pictures dirs stay list. */
export function shouldAutoGridMedia(mediaCount: number): boolean {
  if (!Number.isFinite(mediaCount) || mediaCount < 0) return false;
  return (
    mediaCount >= EXPLORER_AUTO_GRID_MIN_MEDIA &&
    mediaCount <= EXPLORER_AUTO_GRID_MAX_MEDIA
  );
}

/**
 * True when this image index among images in the current listing
 * is allowed a thumbnail (first N only).
 */
export function isWithinThumbBudget(imageIndex: number, maxThumbs = EXPLORER_MAX_GRID_THUMBS): boolean {
  if (!Number.isFinite(imageIndex) || imageIndex < 0) return false;
  return imageIndex < maxThumbs;
}

/** Module-level concurrency gate shared by explorer tiles + preview. */
let activeImageReads = 0;
const waitQueue: Array<() => void> = [];

/**
 * Run an image load after waiting for a free explorer image slot.
 * Always releases the slot, even on throw/cancel paths that complete the promise.
 */
export async function withExplorerImageSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activeImageReads >= EXPLORER_MAX_CONCURRENT_IMAGE_READS) {
    await new Promise<void>((resolve) => {
      waitQueue.push(resolve);
    });
  }
  activeImageReads += 1;
  try {
    return await fn();
  } finally {
    activeImageReads -= 1;
    const next = waitQueue.shift();
    if (next) next();
  }
}

/** Test helper: reset concurrency state between unit tests. */
export function __resetExplorerImageSlotsForTests(): void {
  activeImageReads = 0;
  waitQueue.length = 0;
}

/** Test helper: observe how many reads are in flight. */
export function __getActiveExplorerImageReadsForTests(): number {
  return activeImageReads;
}
