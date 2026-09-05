const DEFAULT_SHELL_SIZE = 144;
const DEFAULT_DISPLAY_SIZE = 128;
const SHELL_PADDING = DEFAULT_SHELL_SIZE - DEFAULT_DISPLAY_SIZE;

function finiteViewportDimension(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_SHELL_SIZE;
  return Math.max(1, Math.floor(value));
}

export function resolvePetOverlayViewport(
  viewportWidth: number,
  viewportHeight: number,
): { shellSize: number; displaySize: number } {
  const shellSize = Math.min(
    DEFAULT_SHELL_SIZE,
    finiteViewportDimension(viewportWidth),
    finiteViewportDimension(viewportHeight),
  );
  return {
    shellSize,
    displaySize: Math.max(1, Math.min(DEFAULT_DISPLAY_SIZE, shellSize - SHELL_PADDING)),
  };
}
