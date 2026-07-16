/**
 * Bounded filesystem walk + multi-clue filter for the File Explorer
 * mini-Jarvis search. Searches names + text file content (never image bytes).
 * Keeps scans finite and safe.
 */
import { listDirectory, readTextFileSample, type FsEntry } from '@/lib/fs';
import { extension } from './projectFiles';

export interface SearchClues {
  /** Free-text query after structured tokens are stripped (display / AI). */
  query: string;
  /**
   * Meaningful content/name terms after stopword filtering.
   * Multi-clue searches require most of these to match.
   */
  terms: string[];
  /** Optional: txt, pdf, png, … */
  extensions?: string[];
  /** Optional path substring (e.g. Documents, Desktop). */
  pathHint?: string;
  /** Optional size band in bytes. */
  minBytes?: number;
  maxBytes?: number;
  /**
   * When true, only search the caller's current folder (user said "here").
   * Default false → runtime expands across Home / Documents / etc.
   */
  hereOnly?: boolean;
}

export interface SearchHit {
  path: string;
  name: string;
  isDir: boolean;
  size?: number;
  score: number;
  reason: string;
  snippet?: string;
  /** How many required terms matched (name/path/content). */
  termsMatched?: number;
  termsTotal?: number;
}

const TEXT_EXTS = new Set([
  'txt', 'md', 'mdx', 'json', 'jsonc', 'js', 'jsx', 'ts', 'tsx', 'css', 'html',
  'htm', 'xml', 'yml', 'yaml', 'toml', 'ini', 'env', 'rs', 'py', 'go', 'java', 'cs',
  'php', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd', 'sql', 'csv', 'log', 'svg',
  'cfg', 'conf', 'config', 'properties', 'rtf', 'tex', 'rst', 'adoc',
  'c', 'cc', 'cpp', 'h', 'hpp', 'rb', 'swift', 'kt', 'kts', 'scala', 'lua',
  'r', 'pl', 'pm', 'vue', 'svelte', 'scss', 'less', 'sass', 'graphql', 'gql',
  'dockerfile', 'makefile', 'cmake', 'gradle', 'lock', 'sum', 'mod',
]);

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'heic', 'tif', 'tiff']);
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', 'wmv', 'flv']);
const AUDIO_EXTS = new Set(['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma']);
const ARCHIVE_EXTS = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'dmg']);
const BINARY_EXTS = new Set([
  ...IMAGE_EXTS,
  ...VIDEO_EXTS,
  ...AUDIO_EXTS,
  ...ARCHIVE_EXTS,
  'exe', 'dll', 'so', 'dylib', 'bin', 'dat', 'db', 'sqlite', 'wasm', 'pdf',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'pkg', 'msi',
  'apk', 'ipa', 'class', 'jar', 'o', 'a', 'lib', 'pdb', 'pyc', 'pyo',
]);

/** Words that must not drive a match alone (natural-language filler). */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'it', 'its', 'was', 'were', 'is', 'are', 'be', 'been', 'being',
  'and', 'or', 'but', 'if', 'then', 'so', 'as', 'at', 'by', 'for', 'from', 'of',
  'on', 'to', 'in', 'into', 'with', 'without', 'about', 'like', 'just', 'also',
  'too', 'very', 'really', 'had', 'has', 'have', 'having', 'my', 'your', 'our',
  'their', 'his', 'her', 'this', 'that', 'these', 'those', 'there', 'here',
  'file', 'files', 'document', 'documents', 'doc', 'folder', 'folders',
  'please', 'find', 'search', 'look', 'looking', 'show', 'get', 'me', 'some',
  'any', 'all', 'thing', 'things', 'stuff', 'one', 'two', 'three',
  'named', 'called', 'name', 'something', 'somewhere', 'inside', 'within',
  'which', 'what', 'when', 'where', 'who', 'how', 'why', 'can', 'could',
  'would', 'should', 'will', 'want', 'needs', 'need', 'containing', 'contains',
  'include', 'includes', 'including', 'using', 'use', 'used',
]);

const EXT_ALIASES: Record<string, string> = {
  text: 'txt',
  txt: 'txt',
  markdown: 'md',
  md: 'md',
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  photo: 'jpg',
  picture: 'png',
  image: 'png',
  screenshot: 'png',
  movie: 'mp4',
  video: 'mp4',
};

/** Bytes of each text file to sample for content matching. */
export const CONTENT_SAMPLE_BYTES = 96 * 1024;
/** Skip content read for huge text files (name/path only). */
const MAX_CONTENT_FILE_BYTES = 4 * 1024 * 1024;

export function isImagePath(path: string): boolean {
  return IMAGE_EXTS.has(extension(path));
}

export function isVideoPath(path: string): boolean {
  return VIDEO_EXTS.has(extension(path));
}

/** Text-like files that can show a safe content sample in the explorer preview. */
export function isTextPath(path: string): boolean {
  return TEXT_EXTS.has(extension(path));
}

export function isBinaryPath(path: string): boolean {
  const ext = extension(path);
  if (!ext) return false;
  return BINARY_EXTS.has(ext) && !TEXT_EXTS.has(ext);
}

/** True when we should open the file and scan UTF-8 content (never images/video). */
export function canSearchFileContent(path: string, size?: number): boolean {
  if (isImagePath(path) || isVideoPath(path)) return false;
  if (isBinaryPath(path)) return false;
  if (size != null && size > MAX_CONTENT_FILE_BYTES) return false;
  const ext = extension(path);
  // Known text, or extensionless / unknown small files (try sample)
  if (TEXT_EXTS.has(ext)) return true;
  if (!ext && (size == null || size <= 256 * 1024)) return true;
  if (ext && !BINARY_EXTS.has(ext) && (size == null || size <= 512 * 1024)) return true;
  return false;
}

function normalizeExtToken(raw: string): string {
  const t = raw.toLowerCase().replace(/^\./, '');
  return EXT_ALIASES[t] ?? t;
}

/**
 * Parse natural language + structured clues into a multi-clue search plan.
 *
 * Examples:
 *  - "IT WAS A txt Document and had like DeepGram key my API keys"
 *    → ext txt, terms [deepgram, api, keys, key]
 *  - "type:pdf in:documents >1mb invoice"
 */
export function parseSearchClues(raw: string): SearchClues {
  const text = raw.trim();
  const extensions: string[] = [];
  let pathHint: string | undefined;
  let minBytes: number | undefined;
  let maxBytes: number | undefined;
  let hereOnly = false;

  // Structured: type:txt / ext:pdf
  for (const m of text.matchAll(/(?:type|ext)\s*[:=]\s*\.?([a-z0-9]+)/gi)) {
    if (m[1]) extensions.push(normalizeExtToken(m[1]));
  }
  // Bare .txt / .pdf tokens
  for (const m of text.matchAll(/(?:^|[\s,])\.([a-z0-9]{1,8})\b/gi)) {
    if (m[1]) extensions.push(normalizeExtToken(m[1]));
  }
  // Natural language: "txt file", "txt document", "a text file", "pdf docs"
  for (const m of text.matchAll(
    /\b(?:a|an|the)?\s*([a-z0-9]{1,12})\s*(?:file|files|document|documents|doc|docs)\b/gi,
  )) {
    if (m[1] && !STOPWORDS.has(m[1].toLowerCase())) {
      extensions.push(normalizeExtToken(m[1]));
    }
  }
  // "was a txt" / "is a json"
  for (const m of text.matchAll(/\b(?:was|is|as)\s+a(?:n)?\s+([a-z0-9]{1,12})\b/gi)) {
    if (m[1] && !STOPWORDS.has(m[1].toLowerCase())) {
      extensions.push(normalizeExtToken(m[1]));
    }
  }

  // Location
  const inMatch = text.match(
    /\bin\s*[:=]?\s*(documents?|pictures?|videos?|desktop|downloads?|music|home|here|this\s+folder|current)\b/i,
  );
  if (inMatch?.[1]) {
    const loc = inMatch[1].toLowerCase().replace(/\s+/g, ' ');
    if (loc === 'here' || loc === 'this folder' || loc === 'current') {
      hereOnly = true;
    } else {
      pathHint = loc.replace(/s$/, '') === 'document' ? 'document' : loc;
      // normalize plurals loosely
      if (/^documents?$/.test(loc)) pathHint = 'document';
      else if (/^pictures?$/.test(loc)) pathHint = 'picture';
      else if (/^videos?$/.test(loc)) pathHint = 'video';
      else if (/^downloads?$/.test(loc)) pathHint = 'download';
      else pathHint = loc;
    }
  }
  if (/\b(?:only\s+)?(?:here|this\s+folder|current\s+folder)\b/i.test(text)) {
    hereOnly = true;
  }

  // Size
  const sizeGt = text.match(/(?:>|over|larger than)\s*(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?/i);
  if (sizeGt) minBytes = toBytes(Number(sizeGt[1]), sizeGt[2] || 'mb');
  const sizeLt = text.match(/(?:<|under|smaller than)\s*(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?/i);
  if (sizeLt) maxBytes = toBytes(Number(sizeLt[1]), sizeLt[2] || 'mb');

  // Strip structured tokens for free-text term extraction
  let free = text
    .replace(/(?:type|ext)\s*[:=]\s*\.?[a-z0-9]+/gi, ' ')
    .replace(/(?:^|[\s,])\.([a-z0-9]{1,8})\b/gi, ' ')
    .replace(
      /\b(?:a|an|the)?\s*[a-z0-9]{1,12}\s*(?:file|files|document|documents|doc|docs)\b/gi,
      ' ',
    )
    .replace(/\b(?:was|is|as)\s+a(?:n)?\s+[a-z0-9]{1,12}\b/gi, ' ')
    .replace(
      /\bin\s*[:=]?\s*(documents?|pictures?|videos?|desktop|downloads?|music|home|here|this\s+folder|current)\b/gi,
      ' ',
    )
    .replace(/\b(?:only\s+)?(?:here|this\s+folder|current\s+folder)\b/gi, ' ')
    .replace(/(?:>|over|larger than|<|under|smaller than)\s*\d+(?:\.\d+)?\s*(?:b|kb|mb|gb)?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Quoted phrases as atomic terms
  const phrases: string[] = [];
  free = free.replace(/"([^"]{2,80})"|'([^']{2,80})'/g, (_m, d, s) => {
    const p = String(d || s).trim().toLowerCase();
    if (p) phrases.push(p);
    return ' ';
  });

  // Multi-word API / key style phrases
  for (const m of free.matchAll(/\b(api\s*keys?|access\s*tokens?|secret\s*keys?)\b/gi)) {
    phrases.push(m[1].toLowerCase().replace(/\s+/g, ' '));
  }

  const terms = extractSearchTerms(free, phrases);

  // Drop extension tokens accidentally kept as terms
  const extSet = new Set(extensions.map((e) => e.toLowerCase()));
  const cleanedTerms = terms.filter((t) => !extSet.has(t) && t !== 'txt' && t !== 'pdf');

  return {
    query: free.replace(/\s+/g, ' ').trim() || text,
    terms: cleanedTerms,
    extensions: extensions.length ? [...new Set(extensions)] : undefined,
    pathHint,
    minBytes,
    maxBytes,
    hereOnly,
  };
}

/** Export for tests — stopword-aware term extraction. */
export function extractSearchTerms(freeText: string, extraPhrases: string[] = []): string[] {
  const out: string[] = [];
  for (const p of extraPhrases) {
    const n = p.trim().toLowerCase();
    if (n.length >= 2) out.push(n);
  }
  const words = freeText
    .toLowerCase()
    .split(/[^a-z0-9_./+-]+/i)
    .map((t) => t.trim())
    .filter(Boolean);

  for (const w of words) {
    if (w.length < 2) continue;
    if (STOPWORDS.has(w)) continue;
    // Skip pure numbers unless long (could be port / id)
    if (/^\d+$/.test(w) && w.length < 4) continue;
    out.push(w);
  }

  // Prefer longer unique terms first for matching priority
  const unique = [...new Set(out)];
  unique.sort((a, b) => b.length - a.length || a.localeCompare(b));
  return unique;
}

function toBytes(n: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u === 'gb') return Math.round(n * 1024 * 1024 * 1024);
  if (u === 'mb') return Math.round(n * 1024 * 1024);
  if (u === 'kb') return Math.round(n * 1024);
  return Math.round(n);
}

export interface WalkOptions {
  maxDepth?: number;
  maxFiles?: number;
  /** When set, listDirectory is constrained to this root. */
  accessRoot?: string | null;
  onProgress?: (scanned: number) => void;
  /** Skip directory names that usually explode the walk. */
  skipDirNames?: string[];
}

const DEFAULT_SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '__pycache__',
  '.cache',
  'cache',
  'dist',
  'build',
  '.next',
  '.turbo',
  'target',
  'vendor',
  '.venv',
  'venv',
  'Library',
  'AppData',
  'Application Data',
  'Windows',
  'System32',
  'Program Files',
  'Program Files (x86)',
  '$Recycle.Bin',
  'Recovery',
]);

/** Breadth-first walk; returns files + dirs (capped). */
export async function walkEntries(
  startDir: string,
  options: WalkOptions = {},
): Promise<FsEntry[]> {
  const maxDepth = options.maxDepth ?? 6;
  const maxFiles = options.maxFiles ?? 2500;
  const access = options.accessRoot ? { root: options.accessRoot } : {};
  const skip = new Set(
    (options.skipDirNames ?? []).map((n) => n.toLowerCase()).concat([...DEFAULT_SKIP_DIRS].map((n) => n.toLowerCase())),
  );
  const out: FsEntry[] = [];
  const seen = new Set<string>();
  const queue: Array<{ path: string; depth: number }> = [{ path: startDir, depth: 0 }];
  let scanned = 0;

  while (queue.length > 0 && out.length < maxFiles) {
    const item = queue.shift()!;
    if (item.depth > maxDepth) continue;
    const key = item.path.replace(/[\\/]+$/, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const listed = await listDirectory(item.path, access);
    if (!listed.ok) continue;
    for (const entry of listed.entries) {
      scanned += 1;
      if (scanned % 40 === 0) options.onProgress?.(scanned);
      out.push(entry);
      if (out.length >= maxFiles) break;
      if (entry.isDir && item.depth < maxDepth) {
        const nameLower = entry.name.toLowerCase();
        if (skip.has(nameLower)) continue;
        if (nameLower.startsWith('.') && nameLower !== '.config' && nameLower !== '.ssh') {
          // Still allow common user-visible dot dirs at shallow depth only
          if (item.depth > 1) continue;
        }
        queue.push({ path: entry.path, depth: item.depth + 1 });
      }
    }
  }
  options.onProgress?.(scanned);
  return out;
}

/**
 * Walk several roots and merge unique entries (path-deduped).
 * Used for wide mini-Jarvis searches across Places.
 */
export async function walkMany(
  roots: string[],
  options: WalkOptions = {},
): Promise<FsEntry[]> {
  const byPath = new Map<string, FsEntry>();
  let scanned = 0;
  const perRootCap = Math.max(
    400,
    Math.floor((options.maxFiles ?? 2500) / Math.max(1, roots.length)),
  );

  for (const root of roots) {
    const clean = root.trim();
    if (!clean) continue;
    const walked = await walkEntries(clean, {
      ...options,
      maxFiles: perRootCap,
      onProgress: (n) => {
        scanned += 1;
        options.onProgress?.(scanned + n);
      },
    });
    for (const e of walked) {
      const k = e.path.replace(/[\\/]+$/, '').toLowerCase();
      if (!byPath.has(k)) byPath.set(k, e);
    }
    if (byPath.size >= (options.maxFiles ?? 2500)) break;
  }
  return [...byPath.values()];
}

/**
 * Score files against multi-clue plan.
 * - Extension / size / path filters are hard gates when present
 * - Content is scanned only for text-like files (never pictures)
 * - Multiple terms: prefer files matching ALL strong terms (AND when ≤4 terms)
 */
export async function scoreEntriesLocally(
  entries: FsEntry[],
  clues: SearchClues,
  accessRoot?: string | null,
): Promise<SearchHit[]> {
  const terms = clues.terms?.length
    ? clues.terms
    : extractSearchTerms(clues.query || '');
  const hits: SearchHit[] = [];
  const access = accessRoot ? { root: accessRoot } : {};
  const requireAnd = terms.length >= 2 && terms.length <= 6;

  for (const entry of entries) {
    if (entry.isDir) continue;
    const ext = extension(entry.path);
    if (clues.extensions?.length && !clues.extensions.includes(ext)) continue;
    if (clues.minBytes != null && (entry.size ?? 0) < clues.minBytes) continue;
    if (clues.maxBytes != null && entry.size != null && entry.size > clues.maxBytes) continue;
    if (clues.pathHint && !entry.path.toLowerCase().includes(clues.pathHint)) continue;

    let score = 0;
    const reasons: string[] = [];
    const matched = new Set<string>();
    const nameLower = entry.name.toLowerCase();
    const pathLower = entry.path.toLowerCase();

    for (const term of terms) {
      if (nameLower.includes(term)) {
        score += 14;
        reasons.push(`name:${term}`);
        matched.add(term);
      } else if (pathLower.includes(term)) {
        score += 4;
        reasons.push(`path:${term}`);
        matched.add(term);
      }
    }

    let snippet: string | undefined;
    const needContent =
      terms.length > 0 &&
      canSearchFileContent(entry.path, entry.size) &&
      // Always scan content when we have terms and file is text-like —
      // multi-clue "Deepgram in a txt" requires content match.
      (matched.size < terms.length || TEXT_EXTS.has(ext));

    if (needContent) {
      const sample = await readTextFileSample(entry.path, CONTENT_SAMPLE_BYTES, access);
      if (sample.ok && typeof sample.content === 'string') {
        const contentLower = sample.content.toLowerCase();
        for (const term of terms) {
          if (contentLower.includes(term)) {
            if (!matched.has(term)) {
              score += 18;
              reasons.push(`content:${term}`);
              matched.add(term);
            } else {
              score += 6; // name+content double hit
              reasons.push(`content:${term}`);
            }
            if (!snippet) {
              const idx = contentLower.indexOf(term);
              snippet = sample.content
                .slice(Math.max(0, idx - 48), idx + term.length + 72)
                .replace(/\s+/g, ' ')
                .trim();
            }
          }
        }
      }
    }

    // Extension-only filter match (no free terms)
    if (terms.length === 0 && (clues.extensions?.length || clues.pathHint || clues.minBytes != null || clues.maxBytes != null)) {
      score += 1;
      reasons.push('filter-match');
    }

    // Multi-clue AND: require most terms; if type is already gated, half is enough
    // so "txt + Deepgram + API keys" still hits deepgram-keys.txt by name.
    if (requireAnd && terms.length > 0) {
      const needed = clues.extensions?.length
        ? Math.max(1, Math.ceil(terms.length * 0.5))
        : terms.length <= 3
          ? terms.length
          : Math.ceil(terms.length * 0.75);
      if (matched.size < needed) continue;
      if (matched.size === terms.length) {
        score += 30;
        reasons.push('all-clues');
      } else {
        score += matched.size * 4;
      }
    } else if (terms.length === 1 && matched.size === 0 && score === 0) {
      continue;
    } else if (terms.length > 0 && matched.size === 0) {
      continue;
    }

    // Prefer real extension matches when user asked for a type
    if (clues.extensions?.length && clues.extensions.includes(ext)) {
      score += 10;
      reasons.push(`ext:${ext}`);
    }

    if (score > 0) {
      hits.push({
        path: entry.path,
        name: entry.name,
        isDir: false,
        size: entry.size,
        score,
        reason: reasons.join(', ') || 'match',
        snippet,
        termsMatched: matched.size,
        termsTotal: terms.length,
      });
    }
  }

  hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return hits.slice(0, 100);
}

/** Parse a model JSON array of paths from free-form AI output. */
export function parseAiPathList(text: string, allowed: Set<string>): string[] {
  const paths: string[] = [];
  try {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
    const parsed = JSON.parse(fenced.trim()) as unknown;
    const arr = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { paths?: unknown }).paths)
        ? (parsed as { paths: unknown[] }).paths
        : [];
    for (const item of arr) {
      const p = typeof item === 'string' ? item : (item as { path?: string })?.path;
      if (p && allowed.has(p)) paths.push(p);
    }
  } catch {
    for (const allowedPath of allowed) {
      if (text.includes(allowedPath)) paths.push(allowedPath);
    }
  }
  return [...new Set(paths)];
}

/** Human-readable summary of parsed clues for the status line. */
export function describeSearchClues(clues: SearchClues): string {
  const parts: string[] = [];
  if (clues.extensions?.length) parts.push(`type:${clues.extensions.join('|')}`);
  if (clues.terms.length) parts.push(`terms:${clues.terms.slice(0, 6).join('+')}`);
  if (clues.pathHint) parts.push(`in:${clues.pathHint}`);
  if (clues.hereOnly) parts.push('here-only');
  if (clues.minBytes != null) parts.push(`>${clues.minBytes}`);
  if (clues.maxBytes != null) parts.push(`<${clues.maxBytes}`);
  return parts.join(' · ') || 'free text';
}
