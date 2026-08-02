import { compileContextNoteRenderPlan, type ContextNoteRenderPlan } from './noteRendering';
import { parseContextNoteSyntax } from './noteSyntax';

export type ContextPackageEntryKind = 'document' | 'asset';

export interface ContextPackageArchiveEntry {
  path: string;
  kind: ContextPackageEntryKind;
  mediaType: string;
  compressedSize: number;
  decompressedSize: number;
  checksumSha256: string;
}

export interface ContextPackageArchiveLink {
  sourcePath: string;
  target: string;
}

export interface ContextPackageArchiveManifest {
  schemaVersion: 1;
  kind: 'context_package_archive';
  entries: ContextPackageArchiveEntry[];
  links: ContextPackageArchiveLink[];
}

export type ContextPackageEntryReader = (
  path: string,
) =>
  | AsyncIterable<Uint8Array<ArrayBufferLike>>
  | Iterable<Uint8Array<ArrayBufferLike>>
  | Promise<AsyncIterable<Uint8Array<ArrayBufferLike>> | Iterable<Uint8Array<ArrayBufferLike>>>;

export interface ValidatedContextPackageImport {
  schemaVersion: 1;
  kind: 'context_package';
  executable: false;
  fileCount: number;
  totalDecompressedSize: number;
  documents: readonly Readonly<{
    path: string;
    markdown: string;
    renderPlan: Readonly<ContextNoteRenderPlan>;
  }>[];
  assets: readonly Readonly<{
    path: string;
    mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
    byteSize: number;
    checksumSha256: string;
  }>[];
}

const MAX_FILES = 1_000;
const MAX_ENTRY_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 100;
const RATIO_ALLOWANCE_BYTES = 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;
const MEDIA_BY_EXTENSION = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
} as const);

function fail(reason: string): never {
  throw new Error(`Invalid Context package ${reason}.`);
}

function assertBoundary(value: unknown, depth = 0): void {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string' && value.length > 2_048) fail('manifest boundary');
    return;
  }
  if (depth > 5) fail('manifest boundary');
  let keys: PropertyKey[];
  let descriptors: PropertyDescriptorMap;
  let prototype: object | null;
  try {
    keys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
    prototype = Object.getPrototypeOf(value);
  } catch {
    return fail('manifest boundary');
  }
  if (keys.some((key) => typeof key !== 'string')) fail('manifest boundary');
  if (Array.isArray(value)) {
    const lengthDescriptor = descriptors.length;
    const length =
      lengthDescriptor && 'value' in lengthDescriptor ? lengthDescriptor.value : undefined;
    if (
      prototype !== Array.prototype ||
      !Number.isSafeInteger(length) ||
      length < 0 ||
      length > 10_000 ||
      keys.length !== length + 1 ||
      !keys.includes('length')
    ) {
      fail('manifest boundary');
    }
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor?.enumerable || !('value' in descriptor)) fail('manifest boundary');
      assertBoundary(descriptor.value, depth + 1);
    }
    return;
  }
  if (prototype !== Object.prototype && prototype !== null) fail('manifest boundary');
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (!descriptor?.enumerable || !('value' in descriptor)) fail('manifest boundary');
    assertBoundary(descriptor.value, depth + 1);
  }
}

function closedRecord(
  value: unknown,
  allowed: readonly string[],
  required: readonly string[],
  reason: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(reason);
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.some((key) => !allowed.includes(key)) ||
    required.some((key) => !Object.prototype.hasOwnProperty.call(record, key))
  ) {
    fail(reason);
  }
  return record;
}

function safeString(value: unknown, reason: string, maximum = 1_024): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)
  ) {
    fail(reason);
  }
  return value;
}

function safePath(value: unknown): string {
  const path = safeString(value, 'path');
  if (
    path.startsWith('/') ||
    path.startsWith('\\') ||
    path.includes('\\') ||
    /^[A-Za-z]:/u.test(path) ||
    /%(?:2e|2f|5c)/iu.test(path)
  ) {
    fail('path');
  }
  const segments = path.split('/');
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === '.' ||
        segment === '..' ||
        segment.length > 255 ||
        /[<>:"|?*]/u.test(segment) ||
        /[. ]$/u.test(segment),
    )
  ) {
    fail('path');
  }
  return path;
}

function safeSize(value: unknown, reason: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(reason);
  return value as number;
}

function extension(path: string): string {
  const index = path.lastIndexOf('.');
  return index < 0 ? '' : path.slice(index).toLocaleLowerCase('en-US');
}

function assetMediaType(path: string, value: unknown): keyof typeof MEDIA_SIGNATURES {
  const mediaType = safeString(value, 'asset type', 100).toLocaleLowerCase('en-US');
  const expected =
    MEDIA_BY_EXTENSION[extension(path) as keyof typeof MEDIA_BY_EXTENSION] ?? undefined;
  if (expected !== mediaType) fail('asset type');
  return mediaType;
}

function parseManifest(raw: unknown): ContextPackageArchiveManifest {
  assertBoundary(raw);
  let cloned: unknown;
  try {
    cloned = structuredClone(raw);
  } catch {
    return fail('manifest boundary');
  }
  const manifest = closedRecord(
    cloned,
    ['schemaVersion', 'kind', 'entries', 'links'],
    ['schemaVersion', 'kind', 'entries', 'links'],
    'manifest fields',
  );
  if (manifest.schemaVersion !== 1 || manifest.kind !== 'context_package_archive') {
    fail('schema');
  }
  if (
    !Array.isArray(manifest.entries) ||
    manifest.entries.length === 0 ||
    manifest.entries.length > MAX_FILES
  ) {
    fail('file count');
  }
  if (!Array.isArray(manifest.links) || manifest.links.length > 10_000) fail('links');

  let totalCompressed = 0;
  let totalDecompressed = 0;
  const paths = new Set<string>();
  const entries = manifest.entries.map((rawEntry) => {
    const entry = closedRecord(
      rawEntry,
      ['path', 'kind', 'mediaType', 'compressedSize', 'decompressedSize', 'checksumSha256'],
      ['path', 'kind', 'mediaType', 'compressedSize', 'decompressedSize', 'checksumSha256'],
      'entry fields',
    );
    const path = safePath(entry.path);
    const foldedPath = path.normalize('NFC').toLocaleLowerCase('en-US');
    if (paths.has(foldedPath)) fail('duplicate path');
    paths.add(foldedPath);
    if (entry.kind !== 'document' && entry.kind !== 'asset') fail('entry kind');
    const compressedSize = safeSize(entry.compressedSize, 'compressed size');
    const decompressedSize = safeSize(entry.decompressedSize, 'decompressed size');
    if (decompressedSize > MAX_ENTRY_BYTES) fail('decompressed size');
    if (
      decompressedSize > RATIO_ALLOWANCE_BYTES &&
      (compressedSize === 0 || decompressedSize > compressedSize * MAX_COMPRESSION_RATIO)
    ) {
      fail('compression ratio');
    }
    totalCompressed += compressedSize;
    totalDecompressed += decompressedSize;
    if (totalCompressed > MAX_TOTAL_BYTES) fail('compressed size');
    if (totalDecompressed > MAX_TOTAL_BYTES) fail('decompressed size');
    const checksumSha256 = safeString(entry.checksumSha256, 'checksum', 64).toLowerCase();
    if (!SHA256.test(checksumSha256)) fail('checksum');
    const mediaType =
      entry.kind === 'document'
        ? safeString(entry.mediaType, 'document type', 100).toLowerCase()
        : assetMediaType(path, entry.mediaType);
    if (entry.kind === 'document' && (mediaType !== 'text/markdown' || extension(path) !== '.md')) {
      fail('document type');
    }
    return {
      path,
      kind: entry.kind,
      mediaType,
      compressedSize,
      decompressedSize,
      checksumSha256,
    } as ContextPackageArchiveEntry;
  });
  const links = manifest.links.map((rawLink) => {
    const link = closedRecord(
      rawLink,
      ['sourcePath', 'target'],
      ['sourcePath', 'target'],
      'link fields',
    );
    return {
      sourcePath: safePath(link.sourcePath),
      target: safeString(link.target, 'link target', 2_048),
    };
  });
  return { schemaVersion: 1, kind: 'context_package_archive', entries, links };
}

async function readBoundedEntry(
  entry: ContextPackageArchiveEntry,
  readEntry: ContextPackageEntryReader,
): Promise<Uint8Array<ArrayBuffer>> {
  let stream: AsyncIterable<Uint8Array<ArrayBufferLike>> | Iterable<Uint8Array<ArrayBufferLike>>;
  try {
    stream = await readEntry(entry.path);
  } catch {
    return fail('entry read');
  }
  if (!stream || typeof stream !== 'object') fail('entry read');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for await (const rawChunk of stream) {
      if (
        !ArrayBuffer.isView(rawChunk) ||
        Object.prototype.toString.call(rawChunk) !== '[object Uint8Array]'
      ) {
        fail('entry chunk');
      }
      size += rawChunk.byteLength;
      if (size > entry.decompressedSize || size > MAX_ENTRY_BYTES) fail('streamed size');
      chunks.push(Uint8Array.from(rawChunk));
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid Context package')) throw error;
    return fail('entry read');
  }
  if (size !== entry.decompressedSize) fail('streamed size');
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

const MEDIA_SIGNATURES = {
  'image/png': (bytes: Uint8Array) =>
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    ),
  'image/jpeg': (bytes: Uint8Array) =>
    bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  'image/gif': (bytes: Uint8Array) => {
    const header = new TextDecoder().decode(bytes.slice(0, 6));
    return header === 'GIF87a' || header === 'GIF89a';
  },
  'image/webp': (bytes: Uint8Array) =>
    bytes.length >= 12 &&
    new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
    new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP',
} as const;

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) fail('checksum verifier unavailable');
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function resolveLinkTarget(
  sourcePath: string,
  target: string,
  paths: ReadonlySet<string>,
): string | null {
  if (target.startsWith('#')) return null;
  if (/%(?:0[0-9a-f]|1[0-9a-f]|2e|2f|5c|7f)/iu.test(target)) fail('link target');
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/u.exec(target)?.[1]?.toLowerCase();
  if (scheme) {
    if (scheme === 'mailto') return null;
    if (scheme !== 'http' && scheme !== 'https') fail('link target');
    let url: URL;
    try {
      url = new URL(target);
    } catch {
      return fail('link target');
    }
    if (url.username || url.password) fail('link target');
    return null;
  }
  if (target.startsWith('/') || target.startsWith('\\') || target.includes('\\')) {
    fail('link target');
  }
  const pathPart = target.split(/[?#]/u, 1)[0] ?? '';
  if (!pathPart) return null;
  const resolved = sourcePath.split('/').slice(0, -1);
  for (const segment of pathPart.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (resolved.length === 0) fail('link target');
      resolved.pop();
    } else {
      resolved.push(segment);
    }
  }
  const path = safePath(resolved.join('/'));
  if (!paths.has(path.normalize('NFC').toLocaleLowerCase('en-US'))) fail('missing link target');
  return path;
}

function resolveWikiTarget(
  sourcePath: string,
  targetTitle: string,
  documentPaths: readonly string[],
): void {
  if (!targetTitle) return;
  if (
    targetTitle.startsWith('/') ||
    targetTitle.startsWith('\\') ||
    targetTitle.includes('\\') ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(targetTitle) ||
    /%(?:0[0-9a-f]|1[0-9a-f]|2e|2f|5c|7f)/iu.test(targetTitle)
  ) {
    fail('link target');
  }
  const titlePath = targetTitle.endsWith('.md') ? targetTitle : `${targetTitle}.md`;
  const candidates = new Set<string>();
  const exact = titlePath.normalize('NFC').toLocaleLowerCase('en-US');
  const sourceRelative = [...sourcePath.split('/').slice(0, -1), ...titlePath.split('/')];
  const resolved: string[] = [];
  for (const segment of sourceRelative) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (resolved.length === 0) fail('link target');
      resolved.pop();
    } else {
      resolved.push(segment);
    }
  }
  const relative = safePath(resolved.join('/')).normalize('NFC').toLocaleLowerCase('en-US');
  const simpleTitle = !targetTitle.includes('/');
  for (const path of documentPaths) {
    const folded = path.normalize('NFC').toLocaleLowerCase('en-US');
    const base = folded.slice(folded.lastIndexOf('/') + 1);
    if (folded === exact || folded === relative || (simpleTitle && base === exact)) {
      candidates.add(folded);
    }
  }
  if (candidates.size === 0) fail('missing link target');
  if (candidates.size > 1) fail('ambiguous link target');
}

export async function validateContextPackageImport(
  rawManifest: unknown,
  readEntry: ContextPackageEntryReader,
): Promise<Readonly<ValidatedContextPackageImport>> {
  if (typeof readEntry !== 'function') fail('entry reader');
  const manifest = parseManifest(rawManifest);
  const paths = new Set(
    manifest.entries.map(({ path }) => path.normalize('NFC').toLocaleLowerCase('en-US')),
  );
  const documents: Array<ValidatedContextPackageImport['documents'][number]> = [];
  const assets: Array<ValidatedContextPackageImport['assets'][number]> = [];
  const actualLinks = new Set<string>();
  const wikiLinkKeys = new Set<string>();
  const documentPaths = manifest.entries
    .filter(({ kind }) => kind === 'document')
    .map(({ path }) => path);
  const recordActualLink = (key: string) => {
    actualLinks.add(key);
    if (actualLinks.size > manifest.links.length || actualLinks.size > 10_000) {
      fail('link manifest');
    }
  };

  for (const entry of manifest.entries) {
    const bytes = await readBoundedEntry(entry, readEntry);
    if (entry.kind === 'asset') {
      const mediaType = entry.mediaType as keyof typeof MEDIA_SIGNATURES;
      if (!MEDIA_SIGNATURES[mediaType](bytes)) fail('asset signature');
    }
    if ((await sha256(bytes)) !== entry.checksumSha256) fail('checksum');
    if (entry.kind === 'asset') {
      assets.push(
        Object.freeze({
          path: entry.path,
          mediaType:
            entry.mediaType as ValidatedContextPackageImport['assets'][number]['mediaType'],
          byteSize: entry.decompressedSize,
          checksumSha256: entry.checksumSha256,
        }),
      );
      continue;
    }
    let markdown: string;
    try {
      markdown = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return fail('document encoding');
    }
    const syntax = parseContextNoteSyntax(markdown);
    if (!syntax.ok || syntax.value.diagnostics.length > 0) fail('link target');
    const renderPlan = compileContextNoteRenderPlan(markdown);
    for (const link of syntax.value.markdownLinks) {
      recordActualLink(`${entry.path}\u0000${link.target}`);
      resolveLinkTarget(entry.path, link.target, paths);
    }
    for (const link of syntax.value.wikiLinks) {
      const key = `${entry.path}\u0000${link.raw}`;
      recordActualLink(key);
      wikiLinkKeys.add(key);
      resolveWikiTarget(entry.path, link.targetTitle, documentPaths);
    }
    documents.push(Object.freeze({ path: entry.path, markdown, renderPlan }));
  }

  const declaredLinks = new Set<string>();
  const importedDocumentPaths = new Set(
    documents.map(({ path }) => path.toLocaleLowerCase('en-US')),
  );
  for (const link of manifest.links) {
    if (!importedDocumentPaths.has(link.sourcePath.toLocaleLowerCase('en-US'))) {
      fail('link source');
    }
    const key = `${link.sourcePath}\u0000${link.target}`;
    if (!wikiLinkKeys.has(key)) resolveLinkTarget(link.sourcePath, link.target, paths);
    if (declaredLinks.has(key)) fail('duplicate link');
    declaredLinks.add(key);
  }
  if (
    declaredLinks.size !== actualLinks.size ||
    [...declaredLinks].some((link) => !actualLinks.has(link))
  ) {
    fail('link manifest');
  }

  return Object.freeze({
    schemaVersion: 1,
    kind: 'context_package',
    executable: false,
    fileCount: manifest.entries.length,
    totalDecompressedSize: manifest.entries.reduce(
      (total, entry) => total + entry.decompressedSize,
      0,
    ),
    documents: Object.freeze(documents),
    assets: Object.freeze(assets),
  });
}
