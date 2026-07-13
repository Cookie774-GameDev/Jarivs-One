/**
 * Selection rules for the themed File Explorer.
 *
 * Files are always selectable so the side-pane preview works in every mode
 * (including "Choose project folder" while browsing mini-Jarvis search hits).
 * Folder-mode confirm still only commits directories / the open folder path.
 */
import type { FileExplorerMode } from './fileExplorerStore';

export interface SelectableEntry {
  path: string;
  isDir: boolean;
}

/**
 * Compute the next selected path list after a click.
 * Returns `null` when the click should not change selection
 * (e.g. single-clicking a directory in file-picker modes).
 */
export function nextExplorerSelection(
  mode: FileExplorerMode,
  entry: SelectableEntry,
  prev: string[],
  multiToggle: boolean,
): string[] | null {
  if (!entry.path) return null;

  if (entry.isDir) {
    // Directories are only "selected" in folder mode (for Select folder).
    if (mode === 'folder') return [entry.path];
    return null;
  }

  // Files: always select for preview. Multi-select only in files mode.
  if (mode === 'files' && multiToggle) {
    return prev.includes(entry.path)
      ? prev.filter((p) => p !== entry.path)
      : [...prev, entry.path];
  }

  return [entry.path];
}

/**
 * When search hits refresh, keep a valid selection if possible;
 * otherwise seed the first hit so the preview has something to show.
 */
export function seedSelectionFromHits(
  prev: string[],
  hitPaths: string[],
): string[] {
  if (hitPaths.length === 0) return prev;
  if (prev.length === 1 && hitPaths.includes(prev[0]!)) return prev;
  if (prev.some((p) => hitPaths.includes(p))) {
    return prev.filter((p) => hitPaths.includes(p));
  }
  return [hitPaths[0]!];
}
