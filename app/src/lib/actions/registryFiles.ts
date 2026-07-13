import { FilePlus2, FileText } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import {
  createDirectory,
  createTextFileWithContent,
  describeFsError,
  readTextFile,
  readTextFileSample,
  writeTextFile,
} from '@/lib/fs';
import {
  dirname,
  getJarvisProjectsDir,
  getJarvisRootDir,
  getStoredProjectRoot,
} from '@/features/files/projectFiles';
import { isPathInsideRoot } from './filePolicy';
import type { ActionDef, ActionResult } from './types';

const ok = (summary: string, data?: unknown): ActionResult => ({ ok: true, summary, data });
const fail = (error: string): ActionResult => ({ ok: false, error });

function isAbsolutePath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('/');
}

function samePath(left: string, right: string): boolean {
  const normalize = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return normalize(left) === normalize(right);
}

async function allowedRoot(requested?: string): Promise<
  | { ok: true; root: string; jarvisRoot: string; isDefault: boolean }
  | { ok: false; error: string }
> {
  const projectId = useAuthStore.getState().projectId;
  const activeRoot = getStoredProjectRoot(projectId ? String(projectId) : null).trim();
  const jarvisRoot = await getJarvisRootDir();
  const defaultRoot = await getJarvisProjectsDir();
  const requestedRoot = requested?.trim();
  const root = requestedRoot || activeRoot || defaultRoot;
  if (!root || !isAbsolutePath(root)) return { ok: false, error: 'No allowed project folder is available.' };
  const allowed = [activeRoot, defaultRoot].filter(Boolean);
  if (!allowed.some((candidate) => samePath(candidate, root))) {
    return { ok: false, error: 'The requested folder is not the active project or Jarvis Projects folder.' };
  }
  return { ok: true, root, jarvisRoot, isDefault: Boolean(defaultRoot && samePath(defaultRoot, root)) };
}

async function validatePath(path: unknown, rootParam: unknown) {
  const value = typeof path === 'string' ? path.trim() : '';
  if (!value || !isAbsolutePath(value)) return { ok: false as const, error: 'An absolute file path is required.' };
  const root = await allowedRoot(typeof rootParam === 'string' ? rootParam : undefined);
  if (!root.ok) return root;
  if (!isPathInsideRoot(value, root.root)) {
    return { ok: false as const, error: 'The file path is outside the allowed project folder.' };
  }
  return {
    ok: true as const,
    path: value,
    root: root.root,
    jarvisRoot: root.jarvisRoot,
    isDefault: root.isDefault,
  };
}

export const FILE_ACTIONS: ActionDef[] = [
  {
    id: 'files.create',
    category: 'file',
    label: 'Create a new text file',
    description: 'Create one new text file inside the active project or Jarvis Projects. Never overwrites.',
    icon: FilePlus2,
    params: [
      { key: 'path', label: 'Absolute file path', type: 'string', required: true },
      { key: 'content', label: 'File content', type: 'string', required: true },
      { key: 'root', label: 'Allowed project root', type: 'string', required: false },
    ],
    run: async (params) => {
      const resolved = await validatePath(params.path, params.root);
      if (!resolved.ok) return fail(resolved.error);
      const content = typeof params.content === 'string' ? params.content : '';
      if (resolved.isDefault) {
        const madeRoot = await createDirectory(resolved.root, { root: resolved.jarvisRoot });
        if (!madeRoot.ok) return fail(describeFsError(madeRoot.error));
      }
      const madeParent = await createDirectory(dirname(resolved.path), { root: resolved.root });
      if (!madeParent.ok) return fail(describeFsError(madeParent.error));
      const created = await createTextFileWithContent(resolved.path, content, { root: resolved.root });
      if (!created.ok) {
        const message = created.error.code === 'already_exists'
          ? 'A file already exists at that path. Choose update, a numbered copy, or another name.'
          : describeFsError(created.error);
        return fail(message);
      }
      return ok(`Created ${resolved.path}.`, { path: resolved.path, operation: 'create' });
    },
  },
  {
    id: 'files.edit',
    category: 'file',
    label: 'Replace an existing text file',
    description: 'Replace the contents of a specific existing text file inside an allowed project root.',
    icon: FileText,
    destructive: true,
    params: [
      { key: 'path', label: 'Absolute existing file path', type: 'string', required: true },
      { key: 'content', label: 'Replacement content', type: 'string', required: true },
      { key: 'root', label: 'Allowed project root', type: 'string', required: false },
    ],
    run: async (params) => {
      const resolved = await validatePath(params.path, params.root);
      if (!resolved.ok) return fail(resolved.error);
      const existing = await readTextFile(resolved.path, { root: resolved.root });
      if (!existing.ok) return fail(describeFsError(existing.error));
      const content = typeof params.content === 'string' ? params.content : '';
      const written = await writeTextFile(resolved.path, content, { root: resolved.root });
      if (!written.ok) return fail(describeFsError(written.error));
      return ok(`Updated ${resolved.path}.`, { path: resolved.path, operation: 'edit' });
    },
  },
  {
    id: 'files.read',
    category: 'file',
    label: 'Read a project text file',
    description: 'Read a bounded sample from one text file inside an allowed project root.',
    icon: FileText,
    params: [
      { key: 'path', label: 'Absolute file path', type: 'string', required: true },
      { key: 'root', label: 'Allowed project root', type: 'string', required: false },
    ],
    run: async (params) => {
      const resolved = await validatePath(params.path, params.root);
      if (!resolved.ok) return fail(resolved.error);
      const sample = await readTextFileSample(resolved.path, 48_000, { root: resolved.root });
      if (!sample.ok) return fail(describeFsError(sample.error));
      return ok(`Read ${resolved.path}.`, { path: resolved.path, content: sample.content });
    },
  },
];
