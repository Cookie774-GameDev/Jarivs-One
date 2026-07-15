/**
 * Workbench local save library — Desktop/VibeSpace/{editor|notes}/
 * Tracks a lightweight catalog so the Open dropdown works even when
 * directory listing is slow, and falls back to browser download outside Tauri.
 */

import { createDirectory, listDirectory, readTextFile, writeTextFile } from '@/lib/fs';
import { isTauri } from '@/lib/utils';

export type WorkbenchSaveKind = 'editor' | 'notes';

export interface WorkbenchSavedFile {
  id: string;
  kind: WorkbenchSaveKind;
  name: string;
  fileName: string;
  path: string;
  extension: string;
  updatedAt: number;
}

const CATALOG_KEY = 'vibespace-workbench-saves:v1';
const FOLDER_NAME = 'VibeSpace';

function sanitizeBaseName(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim();
  return cleaned || 'untitled';
}

function ensureExtension(base: string, ext: string): string {
  const e = ext.replace(/^\./, '').toLowerCase() || 'txt';
  const lower = base.toLowerCase();
  if (lower.endsWith(`.${e}`)) return base;
  // strip a different trailing extension then append the chosen one
  const stripped = base.replace(/\.[a-z0-9]{1,8}$/i, '');
  return `${stripped}.${e}`;
}

function readCatalog(): WorkbenchSavedFile[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CATALOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WorkbenchSavedFile[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e) => e && typeof e.path === 'string' && typeof e.name === 'string');
  } catch {
    return [];
  }
}

function writeCatalog(entries: WorkbenchSavedFile[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CATALOG_KEY, JSON.stringify(entries.slice(0, 200)));
  } catch {
    // quota
  }
}

function normalizePathKey(path: string): string {
  return path.replace(/\//g, '\\').toLowerCase();
}

function upsertCatalog(entry: WorkbenchSavedFile): void {
  const key = normalizePathKey(entry.path);
  const fileKey = `${entry.kind}:${entry.fileName.toLowerCase()}`;
  const next = [
    entry,
    ...readCatalog().filter((e) => {
      // Dedupe same path (slash style) and same kind+fileName so Save never doubles entries.
      if (normalizePathKey(e.path) === key) return false;
      if (`${e.kind}:${e.fileName.toLowerCase()}` === fileKey) return false;
      if (e.id === entry.id) return false;
      return true;
    }),
  ].slice(0, 200);
  writeCatalog(next);
}

/** Overwrite an existing absolute Desktop/project file without creating a second copy. */
export async function overwriteWorkbenchDocument(
  path: string,
  content: string,
): Promise<{ ok: true; path: string } | { ok: false; reason: string }> {
  if (!path || path.startsWith('download://')) {
    return { ok: false, reason: 'No existing file path to overwrite.' };
  }
  const written = await writeTextFile(path, content.slice(0, 900_000));
  if (!written.ok) {
    return { ok: false, reason: written.error.raw || written.error.code || 'Could not write file' };
  }
  const fileName = path.split(/[/\\]/).pop() || 'file';
  const kind: WorkbenchSaveKind = path.toLowerCase().includes('\\notes\\') || path.toLowerCase().includes('/notes/')
    ? 'notes'
    : 'editor';
  upsertCatalog({
    id: `${kind}:${path}`,
    kind,
    name: fileName.replace(/\.[^.]+$/, ''),
    fileName,
    path,
    extension: fileName.split('.').pop()?.toLowerCase() || 'txt',
    updatedAt: Date.now(),
  });
  return { ok: true, path };
}

export function listCatalog(kind?: WorkbenchSaveKind): WorkbenchSavedFile[] {
  const all = readCatalog().sort((a, b) => b.updatedAt - a.updatedAt);
  return kind ? all.filter((e) => e.kind === kind) : all;
}

async function resolveDesktopDir(): Promise<string | null> {
  if (!isTauri) return null;
  try {
    const { desktopDir } = await import('@tauri-apps/api/path');
    const dir = await desktopDir();
    return dir?.replace(/[\\/]+$/, '') ?? null;
  } catch {
    return null;
  }
}

/** Desktop/VibeSpace/{editor|notes} — created on demand. */
export async function ensureWorkbenchSaveDir(kind: WorkbenchSaveKind): Promise<string | null> {
  const desktop = await resolveDesktopDir();
  if (!desktop) return null;
  const sep = desktop.includes('\\') ? '\\' : '/';
  const dir = `${desktop}${sep}${FOLDER_NAME}${sep}${kind}`;
  const created = await createDirectory(dir);
  if (!created.ok && created.error.code !== 'not_a_dir') {
    // parent may need creating first
    const parent = `${desktop}${sep}${FOLDER_NAME}`;
    await createDirectory(parent);
    const again = await createDirectory(dir);
    if (!again.ok) return null;
  }
  return dir;
}

export async function saveWorkbenchDocument(input: {
  kind: WorkbenchSaveKind;
  displayName: string;
  content: string;
  extension: string;
}): Promise<
  | { ok: true; entry: WorkbenchSavedFile; path: string }
  | { ok: false; reason: string }
> {
  const base = sanitizeBaseName(input.displayName);
  const fileName = ensureExtension(base, input.extension || (input.kind === 'notes' ? 'txt' : 'html'));
  const content = input.content.slice(0, 900_000);

  const dir = await ensureWorkbenchSaveDir(input.kind);
  if (dir) {
    const sep = dir.includes('\\') ? '\\' : '/';
    const path = `${dir}${sep}${fileName}`;
    const written = await writeTextFile(path, content);
    if (!written.ok) {
      return {
        ok: false,
        reason: written.error.raw || written.error.code || 'Could not write file',
      };
    }
    const entry: WorkbenchSavedFile = {
      id: `${input.kind}:${path}`,
      kind: input.kind,
      name: base,
      fileName,
      path,
      extension: fileName.split('.').pop()?.toLowerCase() || 'txt',
      updatedAt: Date.now(),
    };
    upsertCatalog(entry);
    return { ok: true, entry, path };
  }

  // Browser / non-Tauri fallback: download the file
  try {
    if (typeof document !== 'undefined') {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      const entry: WorkbenchSavedFile = {
        id: `${input.kind}:download:${fileName}:${Date.now()}`,
        kind: input.kind,
        name: base,
        fileName,
        path: `download://${fileName}`,
        extension: fileName.split('.').pop()?.toLowerCase() || 'txt',
        updatedAt: Date.now(),
      };
      upsertCatalog(entry);
      return { ok: true, entry, path: entry.path };
    }
  } catch {
    /* fall through */
  }
  return { ok: false, reason: 'Desktop save requires the VibeSpace desktop app.' };
}

export async function loadWorkbenchDocument(path: string): Promise<
  | { ok: true; content: string; path: string }
  | { ok: false; reason: string }
> {
  if (path.startsWith('download://')) {
    return { ok: false, reason: 'Re-open a Desktop save from the dropdown (downloaded files are not re-readable in the browser).' };
  }
  const result = await readTextFile(path);
  if (!result.ok) {
    return { ok: false, reason: result.error.raw || result.error.code || 'Could not read file' };
  }
  return { ok: true, content: result.content, path: result.path };
}

/** Refresh catalog from disk listing when possible. */
export async function refreshCatalogFromDisk(kind: WorkbenchSaveKind): Promise<WorkbenchSavedFile[]> {
  const dir = await ensureWorkbenchSaveDir(kind);
  if (!dir) return listCatalog(kind);
  const listed = await listDirectory(dir);
  if (!listed.ok) return listCatalog(kind);
  const existing = listCatalog();
  const byPath = new Map(existing.map((e) => [e.path, e]));
  for (const entry of listed.entries) {
    if (entry.isDir) continue;
    const name = entry.name;
    const path = entry.path;
    const prev = byPath.get(path);
    byPath.set(path, {
      id: prev?.id ?? `${kind}:${path}`,
      kind,
      name: prev?.name ?? name.replace(/\.[^.]+$/, ''),
      fileName: name,
      path,
      extension: name.split('.').pop()?.toLowerCase() || 'txt',
      updatedAt: entry.modifiedMs ? Number(entry.modifiedMs) : prev?.updatedAt ?? Date.now(),
    });
  }
  const merged = Array.from(byPath.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  writeCatalog(merged);
  return merged.filter((e) => e.kind === kind);
}

export function extensionForLanguage(lang: string): string {
  const l = lang.replace(/^\./, '').toLowerCase();
  if (l === 'markdown') return 'md';
  if (l === 'text') return 'txt';
  return l || 'txt';
}

/**
 * True for Desktop/VibeSpace saves (and catalog download placeholders).
 * These must be read/written WITHOUT a project `root` scope, or the FS layer
 * rejects them with "outside the selected project folder".
 */
export function isWorkbenchDesktopSavePath(path: string | null | undefined): boolean {
  if (!path) return false;
  if (path.startsWith('download://')) return true;
  const normalized = path.replace(/\//g, '\\').toLowerCase();
  return (
    normalized.includes('\\vibespace\\editor\\') ||
    normalized.includes('\\vibespace\\notes\\') ||
    normalized.includes('/vibespace/editor/') ||
    normalized.includes('/vibespace/notes/') ||
    /\\vibespace\\(editor|notes)$/.test(normalized) ||
    /\/vibespace\/(editor|notes)$/.test(normalized)
  );
}

/** FS access options: never scope Desktop VibeSpace saves to the project root. */
export function fsOptionsForWorkbenchPath(
  path: string | null | undefined,
  projectRoot?: string | null,
): { root?: string } {
  if (isWorkbenchDesktopSavePath(path)) return {};
  if (projectRoot) return { root: projectRoot };
  return {};
}
