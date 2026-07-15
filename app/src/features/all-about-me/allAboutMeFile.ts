import { createDirectory, readTextFile, writeTextFile } from '@/lib/fs';
import { getJarvisRootDir, joinPath } from '@/features/files/projectFiles';
import { privateAccountDirectory } from '@/features/jarvis-memory/accountStorage';

import { containsAllAboutMeSecret } from './allAboutMeSecurity';

export interface AllAboutMeFileIo {
  resolveRoot: () => Promise<string>;
  createDirectory: (path: string) => Promise<void>;
  readText: (path: string) => Promise<string | null>;
  writeText: (path: string, value: string) => Promise<void>;
}

export interface AllAboutMeFileResult {
  path: string;
  markdown: string;
  recovered: boolean;
  found: boolean;
}

const DELETED_PROFILE_MARKER = '<!-- vibespace-all-about-me-deleted -->\n';

function deleted(markdown: string | null): boolean {
  return markdown?.trim() === DELETED_PROFILE_MARKER.trim();
}

function valid(markdown: string | null): markdown is string {
  return Boolean(
    markdown
    && /^# All(?:AboutMe| About Me)\.md\b|^# All(?:AboutMe| About Me)\b/m.test(markdown)
    && markdown.length <= 512 * 1024
    && !containsAllAboutMeSecret(markdown),
  );
}

async function paths(root: string, accountId: string) {
  const directory = joinPath(joinPath(root, 'Jarvis Memory'), await privateAccountDirectory(accountId));
  const primary = joinPath(directory, 'all-about-me.md');
  return { directory, primary, backup: `${primary}.bak`, temporary: `${primary}.tmp` };
}

const nativeIo: AllAboutMeFileIo = {
  resolveRoot: getJarvisRootDir,
  createDirectory: async (path) => {
    const result = await createDirectory(path);
    if (!result.ok) throw new Error(`Could not create private profile directory (${result.error.code}).`);
  },
  readText: async (path) => {
    const result = await readTextFile(path);
    if (result.ok) return result.content;
    if (result.error.code === 'not_found' || result.error.code === 'unavailable') return null;
    throw new Error(`Could not read private profile (${result.error.code}).`);
  },
  writeText: async (path, value) => {
    const result = await writeTextFile(path, value);
    if (!result.ok) throw new Error(`Could not write private profile (${result.error.code}).`);
  },
};

export async function saveAllAboutMeFile(
  accountId: string,
  markdown: string,
  io: AllAboutMeFileIo = nativeIo,
): Promise<AllAboutMeFileResult> {
  if (!accountId.trim()) throw new Error('Account id is required for All About Me.');
  if (containsAllAboutMeSecret(markdown)) throw new Error('Credential-shaped content cannot be stored in All About Me.');
  const clearing = !markdown.trim();
  if (!clearing && !valid(markdown)) throw new Error('all-about-me.md must have a valid heading and remain under 512 KB.');
  const root = await io.resolveRoot();
  if (!root) throw new Error('Private app-data storage is unavailable.');
  const target = await paths(root, accountId);
  await io.createDirectory(target.directory);
  if (clearing) {
    // Write the authoritative primary tombstone first. If the process exits
    // before stale recovery copies are scrubbed, load still observes deletion
    // and never resurrects the old profile.
    await io.writeText(target.primary, DELETED_PROFILE_MARKER);
    await io.writeText(target.backup, DELETED_PROFILE_MARKER);
    await io.writeText(target.temporary, DELETED_PROFILE_MARKER);
    return { path: target.primary, markdown: '', recovered: false, found: false };
  }
  const current = await io.readText(target.primary);
  if (valid(current)) await io.writeText(target.backup, current);
  await io.writeText(target.temporary, markdown);
  await io.writeText(target.primary, markdown);
  return { path: target.primary, markdown, recovered: false, found: true };
}

export async function loadAllAboutMeFile(
  accountId: string,
  io: AllAboutMeFileIo = nativeIo,
): Promise<AllAboutMeFileResult> {
  if (!accountId.trim()) throw new Error('Account id is required for All About Me.');
  const root = await io.resolveRoot();
  if (!root) throw new Error('Private app-data storage is unavailable.');
  const target = await paths(root, accountId);
  await io.createDirectory(target.directory);
  const primary = await io.readText(target.primary);
  if (deleted(primary)) return { path: target.primary, markdown: '', recovered: false, found: false };
  if (valid(primary)) return { path: target.primary, markdown: primary, recovered: false, found: true };
  for (const recoveryPath of [target.backup, target.temporary]) {
    const candidate = await io.readText(recoveryPath);
    if (deleted(candidate)) {
      await io.writeText(target.primary, DELETED_PROFILE_MARKER);
      return { path: target.primary, markdown: '', recovered: true, found: false };
    }
    if (!valid(candidate)) continue;
    await io.writeText(target.primary, candidate);
    return { path: target.primary, markdown: candidate, recovered: true, found: true };
  }
  return { path: target.primary, markdown: '', recovered: false, found: false };
}
