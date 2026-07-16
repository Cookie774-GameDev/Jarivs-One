/**
 * Promise-based bridge for the themed FileExplorer dialog.
 * Non-React code (chooseProjectFolder) can await a pick without
 * mounting its own React tree.
 */

export type FileExplorerMode = 'folder' | 'file' | 'files';

export interface FileExplorerOpenOptions {
  mode: FileExplorerMode;
  title?: string;
  /** Starting directory (absolute). */
  initialPath?: string | null;
  /** Optional project root to constrain navigation (file pickers). */
  root?: string | null;
  /** When mode is file/files, only show these extensions (lowercase, no dot). */
  extensions?: string[];
}

export type FileExplorerResult =
  | { ok: true; paths: string[] }
  | { ok: false; cancelled: true };

type Resolver = (result: FileExplorerResult) => void;

export interface FileExplorerSession extends FileExplorerOpenOptions {
  id: number;
  resolve: Resolver;
}

let nextId = 1;
let active: FileExplorerSession | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeFileExplorer(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getActiveFileExplorer(): FileExplorerSession | null {
  return active;
}

export function openFileExplorer(options: FileExplorerOpenOptions): Promise<FileExplorerResult> {
  return new Promise<FileExplorerResult>((resolve) => {
    if (active) {
      active.resolve({ ok: false, cancelled: true });
    }
    active = {
      id: nextId++,
      resolve,
      mode: options.mode,
      title: options.title,
      initialPath: options.initialPath ?? null,
      root: options.root ?? null,
      extensions: options.extensions,
    };
    emit();
  });
}

export function resolveFileExplorer(result: FileExplorerResult): void {
  if (!active) return;
  const session = active;
  active = null;
  emit();
  session.resolve(result);
}

export function cancelFileExplorer(): void {
  resolveFileExplorer({ ok: false, cancelled: true });
}
