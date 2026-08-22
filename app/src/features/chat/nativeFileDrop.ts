export type NativeChatFileDropEvent =
  | { type: 'enter'; paths: string[]; position: { x: number; y: number } }
  | { type: 'over'; position: { x: number; y: number } }
  | { type: 'drop'; paths: string[]; position: { x: number; y: number } }
  | { type: 'leave' };

interface NativeChatFileDropHandlerOptions {
  readonly devicePixelRatio: number;
  readonly hitTest: (clientX: number, clientY: number) => boolean;
  readonly onHoverChange: (hovering: boolean) => void;
  readonly onDropPaths: (paths: string[]) => void;
}

/**
 * Converts Tauri's physical drop position into CSS coordinates and forwards
 * only real filesystem paths dropped inside the active Chat surface.
 */
export function createNativeChatFileDropHandler({
  devicePixelRatio,
  hitTest,
  onHoverChange,
  onDropPaths,
}: NativeChatFileDropHandlerOptions) {
  const scale = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const isInsideChat = (position: { x: number; y: number }) =>
    hitTest(position.x / scale, position.y / scale);

  return (event: NativeChatFileDropEvent) => {
    if (event.type === 'leave') {
      onHoverChange(false);
      return;
    }
    const inside = isInsideChat(event.position);
    if (event.type === 'enter' || event.type === 'over') {
      onHoverChange(inside);
      return;
    }
    onHoverChange(false);
    if (!inside) return;
    const paths = event.paths.map((path) => path.trim()).filter(Boolean);
    if (paths.length > 0) onDropPaths(paths);
  };
}
