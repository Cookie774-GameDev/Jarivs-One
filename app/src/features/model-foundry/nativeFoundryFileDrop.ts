export type NativeFoundryFileDropEvent =
  | { type: 'enter'; paths: string[]; position: { x: number; y: number } }
  | { type: 'over'; position: { x: number; y: number } }
  | { type: 'drop'; paths: string[]; position: { x: number; y: number } }
  | { type: 'leave' };

interface NativeFoundryFileDropHandlerOptions {
  readonly devicePixelRatio: number;
  readonly hitTest: (clientX: number, clientY: number) => boolean;
  readonly onHoverChange: (hovering: boolean) => void;
  readonly onDropPaths: (paths: string[]) => void;
}

export function distinctFoundryPaths(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const distinct: string[] = [];
  for (const value of paths) {
    const path = value.trim();
    if (!path) continue;
    const windowsPath = /^(?:[a-z]:[\\/]|\\\\)/iu.test(path);
    const identity = windowsPath ? path.replaceAll('/', '\\').toLocaleLowerCase() : path;
    if (seen.has(identity)) continue;
    seen.add(identity);
    distinct.push(path);
  }
  return distinct;
}

/** Keeps Tauri's global OS drop stream scoped to the visible Foundry source target. */
export function createNativeFoundryFileDropHandler({
  devicePixelRatio,
  hitTest,
  onHoverChange,
  onDropPaths,
}: NativeFoundryFileDropHandlerOptions) {
  const scale = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const isInside = (position: { x: number; y: number }) =>
    hitTest(position.x / scale, position.y / scale);

  return (event: NativeFoundryFileDropEvent) => {
    if (event.type === 'leave') {
      onHoverChange(false);
      return;
    }
    const inside = isInside(event.position);
    if (event.type === 'enter' || event.type === 'over') {
      onHoverChange(inside);
      return;
    }
    onHoverChange(false);
    if (!inside) return;
    const paths = distinctFoundryPaths(event.paths);
    if (paths.length > 0) onDropPaths(paths);
  };
}
