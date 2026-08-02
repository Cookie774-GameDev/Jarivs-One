export interface VoicePanelPoint {
  x: number;
  y: number;
}

export interface VoicePanelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface VoicePanelViewport {
  width: number;
  height: number;
}

const PANEL_DRAG_BLOCK_SELECTOR = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  '[contenteditable="true"]',
  '[data-no-panel-drag="true"]',
  '[role="button"]',
  '[role="scrollbar"]',
  '[role="tab"]',
].join(',');

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function clampVoicePanelTranslation({
  rect,
  current,
  requested,
  viewport,
  margin = 8,
}: {
  rect: VoicePanelRect;
  current: VoicePanelPoint;
  requested: VoicePanelPoint;
  viewport: VoicePanelViewport;
  margin?: number;
}): VoicePanelPoint {
  const baseLeft = rect.left - current.x;
  const baseTop = rect.top - current.y;
  const minimumX = margin - baseLeft;
  const maximumX = viewport.width - margin - rect.width - baseLeft;
  const minimumY = margin - baseTop;
  const maximumY = viewport.height - margin - rect.height - baseTop;

  return {
    x: clamp(requested.x, Math.min(minimumX, maximumX), Math.max(minimumX, maximumX)),
    y: clamp(requested.y, Math.min(minimumY, maximumY), Math.max(minimumY, maximumY)),
  };
}

export function shouldStartVoicePanelDrag(button: number, target: EventTarget | null): boolean {
  if (button !== 0) return false;
  return !(target instanceof Element && target.closest(PANEL_DRAG_BLOCK_SELECTOR));
}
