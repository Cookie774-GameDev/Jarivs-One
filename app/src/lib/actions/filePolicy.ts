const CONTROLLED_EXTENSIONS = new Set([
  'txt',
  'md',
  'json',
  'html',
  'css',
  'js',
  'jsx',
  'ts',
  'tsx',
  'py',
  'ps1',
  'bat',
  'cmd',
  'sh',
  'rs',
  'toml',
  'yaml',
  'yml',
  'xml',
  'csv',
  'sql',
]);

export type FileOperation = 'create' | 'edit' | 'append' | 'replace';

export interface DestinationCandidates {
  explicitDestination?: string;
  activeProjectPath?: string;
  conversationDestination?: string;
  contextMapDestination?: string;
  savedPreference?: string;
  workingProject?: string;
  jarvisRoot?: string;
}

export interface ResolvedDestination {
  path: string;
  source:
    | 'current-request'
    | 'active-project'
    | 'conversation'
    | 'context-map'
    | 'saved-preference'
    | 'working-project'
    | 'jarvis-projects';
}

export interface FileRequestContext extends DestinationCandidates {
  projectLanguage?: 'typescript' | 'javascript' | 'other';
}

export interface ResolvedFileRequest {
  operation: FileOperation;
  fileName: string;
  extension: string;
  destination: ResolvedDestination;
  path: string;
  needsFileTypeQuestion: boolean;
}

function cleanPath(path: string | undefined): string {
  return (path ?? '').trim().replace(/[\\/]$/, '');
}

const PATH_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

function collapseAbsoluteSegments(segments: readonly string[]): string[] | null {
  const normalized: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (normalized.length === 0) return null;
      normalized.pop();
      continue;
    }
    normalized.push(segment);
  }
  return normalized;
}

/**
 * Lexically normalizes an absolute Windows drive, UNC, or POSIX path without
 * relying on the browser host platform. Native filesystem commands still
 * canonicalize existing roots/parents to reject symlink and junction escapes.
 */
export function normalizePortableAbsolutePath(path: string): string | null {
  if (!path || PATH_CONTROL_CHARACTERS.test(path)) return null;
  const raw = path.trim();
  if (/^\\(?!\\)/u.test(raw)) return null;
  if (raw.startsWith('/') && !raw.startsWith('//') && raw.includes('\\')) return null;
  const input = raw.replace(/\\/gu, '/');
  if (!input) return null;

  const drive = input.match(/^([A-Za-z]):\//u);
  if (drive) {
    const segments = collapseAbsoluteSegments(input.slice(drive[0].length).split('/'));
    if (!segments || segments.some((segment) => segment.includes(':'))) return null;
    const root = `${drive[1]!.toUpperCase()}:\\`;
    return segments.length === 0 ? root : `${root}${segments.join('\\')}`;
  }

  if (input.startsWith('//')) {
    const segments = input
      .slice(2)
      .split('/')
      .filter((segment) => segment.length > 0);
    const server = segments.shift();
    const share = segments.shift();
    if (!server || !share || server === '.' || server === '..' || share === '.' || share === '..') {
      return null;
    }
    const rest = collapseAbsoluteSegments(segments);
    if (!rest || [server, share, ...rest].some((segment) => segment.includes(':'))) return null;
    const root = `\\\\${server}\\${share}`;
    return rest.length === 0 ? root : `${root}\\${rest.join('\\')}`;
  }

  if (input.startsWith('/')) {
    const segments = collapseAbsoluteSegments(input.slice(1).split('/'));
    if (!segments) return null;
    return segments.length === 0 ? '/' : `/${segments.join('/')}`;
  }

  return null;
}

export function joinPortablePath(dir: string, name: string): string {
  const separator = dir.includes('\\') ? '\\' : '/';
  return `${cleanPath(dir)}${separator}${name}`;
}

export function resolveProjectDestination(
  candidates: DestinationCandidates,
): ResolvedDestination | null {
  const ordered: Array<[ResolvedDestination['source'], string | undefined]> = [
    ['current-request', candidates.explicitDestination],
    ['active-project', candidates.activeProjectPath],
    ['conversation', candidates.conversationDestination],
    ['context-map', candidates.contextMapDestination],
    ['saved-preference', candidates.savedPreference],
    ['working-project', candidates.workingProject],
  ];
  for (const [source, candidate] of ordered) {
    const path = cleanPath(candidate);
    if (path) return { path, source };
  }
  const root = cleanPath(candidates.jarvisRoot);
  return root ? { path: joinPortablePath(root, 'Projects'), source: 'jarvis-projects' } : null;
}

function extensionOf(name: string): string {
  const match = name.match(/\.([a-z0-9]+)$/i);
  return match?.[1]?.toLowerCase() ?? '';
}

function requestedName(request: string): string {
  const quoted = request.match(/\b(?:named|called)\s+["'`]([^"'`]+)["'`]/i)?.[1];
  const bare = request.match(/\b(?:named|called)\s+([A-Za-z0-9._-]+)/i)?.[1];
  const explicit = request.match(
    /\b([A-Za-z0-9_-]+\.(?:txt|md|json|html|css|js|jsx|ts|tsx|py|ps1|bat|cmd|sh|rs|toml|ya?ml|xml|csv|sql))\b/i,
  )?.[1];
  return (quoted ?? explicit ?? bare ?? 'untitled').trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '-');
}

export function inferControlledExtension(
  request: string,
  fileName: string,
  projectLanguage: FileRequestContext['projectLanguage'] = 'other',
): { extension: string; needsQuestion: boolean } {
  const explicit = extensionOf(fileName);
  if (explicit)
    return CONTROLLED_EXTENSIONS.has(explicit)
      ? { extension: explicit, needsQuestion: false }
      : { extension: '', needsQuestion: true };
  const text = request.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/\b(?:python|py script)\b/, 'py'],
    [/\b(?:powershell|power shell)\b/, 'ps1'],
    [/\b(?:html|web page)\b/, 'html'],
    [/\b(?:stylesheet|css)\b/, 'css'],
    [/\bjson\b/, 'json'],
    [/\b(?:rust|cargo)\b/, 'rs'],
    [/\b(?:sql|database query)\b/, 'sql'],
    [/\b(?:yaml|yml)\b/, 'yaml'],
    [/\btoml\b/, 'toml'],
    [/\bcsv\b/, 'csv'],
    [
      /\b(?:react component|jsx component|tsx component)\b/,
      projectLanguage === 'javascript' ? 'jsx' : 'tsx',
    ],
    [/\b(?:typescript|ts file)\b/, 'ts'],
    [/\b(?:javascript|js file)\b/, 'js'],
    [/\b(?:markdown|roadmap|notes?|document|list)\b/, 'md'],
    [/\b(?:plain text|text file)\b/, 'txt'],
  ];
  const inferred = rules.find(([pattern]) => pattern.test(text))?.[1];
  return inferred
    ? { extension: inferred, needsQuestion: false }
    : { extension: 'md', needsQuestion: false };
}

function inferOperation(request: string): FileOperation {
  if (/\bappend\b/i.test(request)) return 'append';
  if (/\breplace|overwrite\b/i.test(request)) return 'replace';
  if (/\bedit|update|modify|fix\b/i.test(request)) return 'edit';
  return 'create';
}

export function resolveFileRequest(
  request: string,
  context: FileRequestContext,
): ResolvedFileRequest | null {
  const destination = resolveProjectDestination(context);
  if (!destination) return null;
  const rawName = requestedName(request);
  const inferred = inferControlledExtension(request, rawName, context.projectLanguage);
  const fileName =
    extensionOf(rawName) || !inferred.extension ? rawName : `${rawName}.${inferred.extension}`;
  return {
    operation: inferOperation(request),
    fileName,
    extension: extensionOf(fileName),
    destination,
    path: joinPortablePath(destination.path, fileName),
    needsFileTypeQuestion: inferred.needsQuestion,
  };
}

export function isPathInsideRoot(path: string, root: string): boolean {
  const candidate = normalizePortableAbsolutePath(path);
  const boundary = normalizePortableAbsolutePath(root);
  if (!candidate || !boundary) return false;
  const windows =
    /^[A-Za-z]:\\/u.test(candidate) ||
    /^[A-Za-z]:\\/u.test(boundary) ||
    candidate.startsWith('\\\\') ||
    boundary.startsWith('\\\\');
  const comparable = (value: string) => value.replace(/\\/gu, '/');
  const left = windows ? comparable(candidate).toLowerCase() : comparable(candidate);
  const right = windows ? comparable(boundary).toLowerCase() : comparable(boundary);
  const prefix = right.endsWith('/') ? right : `${right}/`;
  return left === right || left.startsWith(prefix);
}

export { CONTROLLED_EXTENSIONS };
