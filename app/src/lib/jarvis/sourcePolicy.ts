import type { FsReadError } from '@/lib/fs';

export type JarvisSourceChannel =
  | 'automatic_scan'
  | 'explicit_attachment'
  | 'connected_file'
  | 'artifact_preview'
  | 'sync';

export type JarvisSourcePolicyInput = {
  path: string;
  root?: string | null;
  sizeBytes?: number;
  channel: JarvisSourceChannel;
  kind: 'directory' | 'text' | 'media_metadata' | 'binary' | 'unknown';
  contentSample?: string;
  defaultSensitivity?: 'public' | 'private';
};

export type JarvisSourceDecision =
  | {
      allowed: true;
      reason: 'allowed_text_source';
      sensitivity: 'public' | 'private';
      safeSummary: string;
    }
  | {
      allowed: false;
      reason:
        | 'secret_filename'
        | 'secret_content'
        | 'credential_path'
        | 'binary'
        | 'too_large'
        | 'outside_allowed_root'
        | 'unsupported';
      sensitivity: 'restricted' | 'secret';
      safeSummary: string;
    };

const MAX_SOURCE_BYTES = 100 * 1024 * 1024;
const SECRET_FILE_EXTENSIONS = new Set(['pem', 'key', 'p12', 'pfx']);
const PRIVATE_KEY_FILE_NAMES = new Set(['id_rsa', 'id_ed25519']);
const CREDENTIAL_DIRECTORY_NAMES = new Set([
  '.aws',
  '.azure',
  '.codex',
  '.claude',
  '.gemini',
  '.credentials',
  'gcloud',
  'credentials',
  'credential',
  'secrets',
  'secret',
  'auth-store',
  'auth_store',
]);

function normalizedSegments(path: string): string[] {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment.length > 0);
}

function hasTraversal(path: string): boolean {
  return normalizedSegments(path).some((segment) => segment === '..');
}

function normalizeLexicalPath(path: string): string {
  const rawSlashPath = path.trim().replace(/\\/g, '/');
  const unc = rawSlashPath.startsWith('//');
  const slashPath = unc
    ? `//${rawSlashPath.slice(2).replace(/\/+/g, '/')}`
    : rawSlashPath.replace(/\/+/g, '/');
  const drive = slashPath.match(/^([a-zA-Z]:)(?:\/|$)/)?.[1]?.toLowerCase();
  const isUnc = unc;
  const isPosix = slashPath.startsWith('/') && !isUnc;
  const prefix = drive ? `${drive}/` : isUnc ? '//' : isPosix ? '/' : '';
  const withoutPrefix = drive
    ? slashPath.slice(drive.length).replace(/^\//, '')
    : slashPath.replace(/^\/+/, '');
  const out: string[] = [];
  for (const segment of withoutPrefix.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      out.pop();
      continue;
    }
    out.push(segment.toLowerCase());
  }
  const joined = `${prefix}${out.join('/')}`;
  return joined.length > prefix.length ? joined.replace(/\/$/, '') : joined;
}

function isAbsoluteNormalized(path: string): boolean {
  return /^[a-z]:\//.test(path) || path.startsWith('/') || path.startsWith('//');
}

function isOutsideRoot(path: string, root?: string | null): boolean {
  if (hasTraversal(path)) return true;
  if (!root?.trim()) return false;
  if (hasTraversal(root)) return true;
  const normalizedPath = normalizeLexicalPath(path);
  const normalizedRoot = normalizeLexicalPath(root);
  if (!isAbsoluteNormalized(normalizedPath) || !isAbsoluteNormalized(normalizedRoot)) return false;
  if (normalizedPath === normalizedRoot) return false;
  const boundary = normalizedRoot.endsWith('/') ? normalizedRoot : `${normalizedRoot}/`;
  return !normalizedPath.startsWith(boundary);
}

function baseName(path: string): string {
  const parts = normalizedSegments(path);
  return parts.at(-1) || 'source';
}

const RECOGNIZABLE_TOKEN_PATTERN =
  /(?:^|[^A-Za-z0-9_])(?:github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{20,})/;

function safeBaseName(path: string): string {
  const basename = baseName(path);
  if (
    basename.length > 120 ||
    /[\u0000-\u001f\u007f]/.test(basename) ||
    RECOGNIZABLE_TOKEN_PATTERN.test(basename) ||
    /(?:API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|CLIENT_SECRET|PASSWORD|SECRET_ACCESS_KEY)\s*[:=]/i.test(
      basename,
    )
  ) {
    return 'source';
  }
  return basename;
}

function safeCategory(kind: JarvisSourcePolicyInput['kind']): string {
  switch (kind) {
    case 'directory':
      return 'directory source';
    case 'media_metadata':
      return 'media source';
    case 'binary':
      return 'binary source';
    case 'unknown':
      return 'unsupported source';
    case 'text':
    default:
      return 'text source';
  }
}

function denied(
  input: Pick<JarvisSourcePolicyInput, 'path' | 'kind'>,
  reason: Extract<JarvisSourceDecision, { allowed: false }>['reason'],
): Extract<JarvisSourceDecision, { allowed: false }> {
  return {
    allowed: false,
    reason,
    sensitivity:
      reason === 'secret_content' || reason === 'secret_filename' || reason === 'credential_path'
        ? 'secret'
        : 'restricted',
    safeSummary: `${safeBaseName(input.path)}: ${safeCategory(input.kind)} blocked (${reason})`,
  };
}

function isSecretFilename(path: string): boolean {
  const basename = baseName(path).toLowerCase();
  const dot = basename.lastIndexOf('.');
  const ext = dot >= 0 ? basename.slice(dot + 1) : '';
  if (basename === '.env' || basename.startsWith('.env.')) return true;
  if (basename === '.npmrc' || basename === '.pypirc') return true;
  if (SECRET_FILE_EXTENSIONS.has(ext) || PRIVATE_KEY_FILE_NAMES.has(basename)) return true;
  return /(?:^|[-_ ])private[-_ ]?key[-_ ]?(?:export|backup)(?:[._ -]|$)/.test(basename);
}

function isCredentialPath(path: string): boolean {
  const segments = normalizedSegments(path).map((segment) => segment.toLowerCase());
  const basename = segments.at(-1) ?? '';
  const normalized = `/${segments.join('/')}`;
  if (segments.some((segment) => CREDENTIAL_DIRECTORY_NAMES.has(segment))) return true;
  if (
    segments.some(
      (segment, index) =>
        segment === '.config' &&
        ['gcloud', 'openai', 'opencode', 'gh', 'chromium'].includes(segments[index + 1] ?? ''),
    )
  )
    return true;
  if (normalized.endsWith('/.config/gh/hosts.yml')) return true;
  if (normalized.endsWith('/.docker/config.json')) return true;
  if (normalized.endsWith('/.kube/config')) return true;
  if (/application_default_credentials\.json$/.test(basename)) return true;
  if (/^(?:oauth_)?creds?(?:entials)?\.json$/.test(basename)) return true;
  if (/^\.credentials\.json$/.test(basename)) return true;
  if (
    /^auth\.json$/.test(basename) &&
    /\/(?:openai|opencode|claude|codex|gemini)\//.test(normalized)
  )
    return true;
  if (/(?:gcp|google|gcloud|service[-_ ]?account).*(?:credential|key).*\.json$/.test(basename))
    return true;
  if (/azure.*(?:credential|token)|(?:credential|token).*azure/.test(basename)) return true;
  if (/recovery[-_ ]?codes?(?:\.|-|_|$)/.test(basename)) return true;
  if (/keychain(?:-db)?$|\.keychain(?:-db)?$/.test(basename)) return true;
  if (/^(?:cookies?|cookies?\.(?:sqlite|db))$/.test(basename)) return true;
  if (
    /^(?:login data|login data for account|web data)$/.test(basename) &&
    /\/(?:chrome|chromium|google chrome|user data)\//.test(normalized)
  )
    return true;
  if (/^logins\.json$/.test(basename) && /\/(?:mozilla|firefox)\//.test(normalized)) return true;
  if (/(?:credential|secret|recovery|keychain)[-_ ]?export/.test(basename)) return true;
  return false;
}

function containsSecretContent(content: string): boolean {
  if (/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i.test(content)) return true;
  const assignment =
    /(?:^|[\s{,;])(?:export\s+)?(?:(?:const|let|var)\s+)?["']?(?:(?:[A-Z][A-Z0-9]*_)*(?:API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|CLIENT_SECRET|PASSWORD)|AWS_SECRET_ACCESS_KEY)["']?(?:\s*:\s*[A-Za-z_$][A-Za-z0-9_$<>,.\[\] |]*)?\s*[:=]\s*(?:"([^"\r\n]+)"|'([^'\r\n]+)'|`([^`\r\n]+)`|([^\s,;}#"'`][^,;}\r\n#]*))/im.exec(
      content,
    );
  if (assignment) {
    const value =
      assignment
        .slice(1)
        .find((part) => part !== undefined)
        ?.trim() ?? '';
    if (!/^(?:process\.env|import\.meta\.env|deno\.env)\b/i.test(value)) return true;
  }
  if (RECOGNIZABLE_TOKEN_PATTERN.test(content)) return true;
  if (
    /recovery[-_ ]?codes?/i.test(content) &&
    /\b[A-Z0-9]{4,8}(?:[- ][A-Z0-9]{4,8})+\b/.test(content)
  )
    return true;
  return (
    /credential[-_ ]?export/i.test(content) &&
    /(?:^|[,{]\s*|\n\s*)["']?(?:user(?:name)?|password|token|secret|key)["']?\s*[:=]\s*(?:"[^"\r\n]+"|'[^'\r\n]+'|[^\s,}\r\n]+)/im.test(
      content,
    )
  );
}

const MODEL_VISIBLE_SECRET_FIELD =
  /^(?:api[-_ ]?key|password|access[-_ ]?token|refresh[-_ ]?token|session[-_ ]?token|id[-_ ]?token|bearer[-_ ]?token|token|secret|client[-_ ]?secret|(?:aws[-_ ]?)?secret[-_ ]?access[-_ ]?key|credentials?|private[-_ ]?key|signing[-_ ]?key|authorization|cookies?|recovery[-_ ]?codes?)$/i;

/**
 * Closed defense-in-depth check for schema/catalog data that will be shown to
 * a model. The caller still owns structural contract validation.
 */
export function isJarvisModelVisibleSchemaSafe(value: unknown): boolean {
  const active = new WeakSet<object>();
  const stack: Array<{ value: unknown; leaving?: boolean }> = [{ value }];
  while (stack.length > 0) {
    const frame = stack.pop()!;
    const current = frame.value;
    if (frame.leaving) {
      active.delete(current as object);
      continue;
    }
    if (typeof current === 'string') {
      if (containsSecretContent(current)) return false;
      continue;
    }
    if (current === null || typeof current === 'number' || typeof current === 'boolean') continue;
    if (typeof current !== 'object' || active.has(current)) return false;
    const prototype = Object.getPrototypeOf(current);
    if (
      (Array.isArray(current) && prototype !== Array.prototype) ||
      (!Array.isArray(current) && prototype !== Object.prototype && prototype !== null)
    ) {
      return false;
    }
    active.add(current);
    stack.push({ value: current, leaving: true });
    if (Array.isArray(current)) {
      for (const entry of current) stack.push({ value: entry });
      continue;
    }
    for (const key of Reflect.ownKeys(current)) {
      if (typeof key !== 'string' || MODEL_VISIBLE_SECRET_FIELD.test(key)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return false;
      stack.push({ value: descriptor.value });
    }
  }
  return true;
}

export function classifyJarvisSource(input: JarvisSourcePolicyInput): JarvisSourceDecision {
  if (isOutsideRoot(input.path, input.root)) return denied(input, 'outside_allowed_root');
  if (isSecretFilename(input.path)) return denied(input, 'secret_filename');
  if (isCredentialPath(input.path)) return denied(input, 'credential_path');
  if (input.kind === 'binary') return denied(input, 'binary');
  if (typeof input.sizeBytes === 'number' && input.sizeBytes > MAX_SOURCE_BYTES)
    return denied(input, 'too_large');
  if (input.kind === 'unknown') return denied(input, 'unsupported');
  if (input.contentSample !== undefined && containsSecretContent(input.contentSample)) {
    return denied(input, 'secret_content');
  }
  return {
    allowed: true,
    reason: 'allowed_text_source',
    sensitivity: input.defaultSensitivity === 'public' ? 'public' : 'private',
    safeSummary: `${safeBaseName(input.path)}: ${safeCategory(input.kind)} allowed`,
  };
}

export function classifyJarvisReadError(
  error: FsReadError,
): Extract<JarvisSourceDecision, { allowed: false }> {
  const reason =
    error.code === 'outside_root'
      ? 'outside_allowed_root'
      : error.code === 'too_large'
        ? 'too_large'
        : error.code === 'not_utf8'
          ? 'binary'
          : error.code === 'unsupported_type'
            ? 'unsupported'
            : 'unsupported';
  return denied({ path: 'source', kind: 'unknown' }, reason);
}
