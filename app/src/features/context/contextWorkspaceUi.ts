export const CONTEXT_WORKSPACE_SECTIONS = Object.freeze([
  Object.freeze({ id: 'maps', label: 'Maps' }),
  Object.freeze({ id: 'sources', label: 'Sources' }),
  Object.freeze({ id: 'notes', label: 'Notes' }),
  Object.freeze({ id: 'views', label: 'Views' }),
  Object.freeze({ id: 'templates', label: 'Templates' }),
  Object.freeze({ id: 'workspaces', label: 'Workspaces' }),
] as const);

export const CONTEXT_CENTER_MODES = Object.freeze([
  Object.freeze({ id: 'graph', label: 'Graph' }),
  Object.freeze({ id: 'note', label: 'Note editor' }),
  Object.freeze({ id: 'structured', label: 'Structured' }),
  Object.freeze({ id: 'search', label: 'Search' }),
] as const);

export const CONTEXT_INSPECTOR_TABS = Object.freeze([
  Object.freeze({ id: 'details', label: 'Details' }),
  Object.freeze({ id: 'links', label: 'Links' }),
  Object.freeze({ id: 'backlinks', label: 'Backlinks' }),
  Object.freeze({ id: 'properties', label: 'Properties' }),
  Object.freeze({ id: 'sources', label: 'Sources' }),
  Object.freeze({ id: 'jarvis_activity', label: 'JARVIS Activity' }),
  Object.freeze({ id: 'history', label: 'History' }),
] as const);

export type ContextWorkspaceSectionId = (typeof CONTEXT_WORKSPACE_SECTIONS)[number]['id'];
export type ContextCenterModeId = (typeof CONTEXT_CENTER_MODES)[number]['id'];
export type ContextInspectorTabId = (typeof CONTEXT_INSPECTOR_TABS)[number]['id'];

export type ContextSourceCard = Readonly<{
  kind: 'local_folder' | 'local_file' | 'github_repository';
  label: string;
  state: 'ready' | 'choose' | 'connect';
  permission: string;
  privacy: string;
}>;

export type ContextGitHubMapBadge = Readonly<{
  repository: string;
  branch: string;
  shortSha: string;
  visibility: 'public' | 'private' | 'internal';
  lastSyncAt: number;
  stale: boolean;
}>;

export type ContextJarvisUi = Readonly<{
  visible: boolean;
  chip: 'JARVIS using Context' | null;
  highlightedNodeIds: readonly string[];
  sourceCount: number;
  retrievalPackId: string | null;
}>;

type SourceCardInput = Readonly<{
  localFolderSelected: boolean;
  localFileSelected: boolean;
  githubConnected: boolean;
}>;

type GitHubBadgeInput = Readonly<{
  owner: string;
  repository: string;
  branch: string;
  resolvedCommitSha: string;
  visibility: 'public' | 'private' | 'internal';
  lastSyncAt: number;
  status: 'ready' | 'stale';
}>;

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,199}$/u;
const SAFE_GITHUB_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?$/;
const MAX_CONTEXT_ACTIVITY_MAPS = 200;

export function contextTabKeyTarget(
  currentIndex: number,
  key: string,
  length: number,
): number | null {
  if (
    !Number.isSafeInteger(currentIndex) ||
    !Number.isSafeInteger(length) ||
    length < 1 ||
    currentIndex < 0 ||
    currentIndex >= length
  ) {
    return null;
  }
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (currentIndex + 1) % length;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (currentIndex - 1 + length) % length;
  return null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function readClosedDataRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> | null {
  try {
    if (!isPlainRecord(value)) return null;
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== keys.length ||
      ownKeys.some((key) => typeof key !== 'string' || !keys.includes(key))
    ) {
      return null;
    }
    const copy: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return null;
      copy[key] = descriptor.value;
    }
    return copy;
  } catch {
    return null;
  }
}

function hasSafeString(value: unknown, pattern = SAFE_IDENTIFIER): value is string {
  return typeof value === 'string' && pattern.test(value);
}

function isBoundedIdentifierList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 10_000 &&
    value.every((id) => hasSafeString(id)) &&
    new Set(value).size === value.length
  );
}

function isBoundedSourceCount(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 10_000_000
  );
}

export function buildContextSourceCards(input: SourceCardInput): readonly ContextSourceCard[] {
  if (
    !isPlainRecord(input) ||
    !hasExactKeys(input, ['localFolderSelected', 'localFileSelected', 'githubConnected']) ||
    typeof input.localFolderSelected !== 'boolean' ||
    typeof input.localFileSelected !== 'boolean' ||
    typeof input.githubConnected !== 'boolean'
  ) {
    throw new Error('Invalid Context source-card state');
  }

  return Object.freeze([
    Object.freeze({
      kind: 'local_folder',
      label: 'Local folder',
      state: input.localFolderSelected ? 'ready' : 'choose',
      permission: 'Read access to the folder you choose',
      privacy: 'Indexed locally unless you explicitly select a cloud model',
    }),
    Object.freeze({
      kind: 'local_file',
      label: 'Local file',
      state: input.localFileSelected ? 'ready' : 'choose',
      permission: 'Read access to the file you choose',
      privacy: 'The selected file remains local unless cloud processing is enabled',
    }),
    Object.freeze({
      kind: 'github_repository',
      label: 'GitHub repository',
      state: input.githubConnected ? 'ready' : 'connect',
      permission: 'Only repositories granted to the VibeSpace GitHub App',
      privacy: 'Repository access uses the connected installation and read-only indexing',
    }),
  ]);
}

export function buildGitHubMapBadge(input: GitHubBadgeInput): ContextGitHubMapBadge {
  if (
    !isPlainRecord(input) ||
    !hasExactKeys(input, [
      'owner',
      'repository',
      'branch',
      'resolvedCommitSha',
      'visibility',
      'lastSyncAt',
      'status',
    ]) ||
    !hasSafeString(input.owner, SAFE_GITHUB_NAME) ||
    !hasSafeString(input.repository, SAFE_GITHUB_NAME) ||
    !hasSafeString(input.branch) ||
    typeof input.resolvedCommitSha !== 'string' ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(input.resolvedCommitSha) ||
    !['public', 'private', 'internal'].includes(input.visibility) ||
    !Number.isSafeInteger(input.lastSyncAt) ||
    input.lastSyncAt < 0 ||
    !['ready', 'stale'].includes(input.status)
  ) {
    throw new Error('Invalid Context GitHub badge');
  }

  return Object.freeze({
    repository: `${input.owner}/${input.repository}`,
    branch: input.branch,
    shortSha: input.resolvedCommitSha.slice(0, 7).toLowerCase(),
    visibility: input.visibility,
    lastSyncAt: input.lastSyncAt,
    stale: input.status === 'stale',
  });
}

export function contextWorkspaceNoteStorageKey(
  accountId: string,
  projectId: string | null,
  mapId: string,
): string {
  if (
    !hasSafeString(accountId) ||
    (projectId !== null && !hasSafeString(projectId)) ||
    !hasSafeString(mapId)
  ) {
    throw new Error('Invalid Context workspace note scope');
  }
  const accountScope = encodeURIComponent(accountId);
  const projectScope = projectId === null ? 'personal' : `project:${encodeURIComponent(projectId)}`;
  return `jarvis:context-workspace-note:v2:${accountScope}:${projectScope}:${encodeURIComponent(mapId)}`;
}

export function buildJarvisContextUi(input: unknown): ContextJarvisUi {
  if (input === null) {
    return Object.freeze({
      visible: false,
      chip: null,
      highlightedNodeIds: Object.freeze([]),
      sourceCount: 0,
      retrievalPackId: null,
    });
  }

  const record = readClosedDataRecord(input, [
    'runId',
    'lifecycle',
    'highlightedNodeIds',
    'sourceCount',
    'retrievalPackId',
  ]);
  if (
    !record ||
    !hasSafeString(record.runId) ||
    (record.lifecycle !== 'retrieving' && record.lifecycle !== 'complete') ||
    !isBoundedIdentifierList(record.highlightedNodeIds) ||
    !isBoundedSourceCount(record.sourceCount) ||
    !hasSafeString(record.retrievalPackId)
  ) {
    throw new Error('Invalid Context JARVIS activity');
  }

  return Object.freeze({
    visible: true,
    chip: 'JARVIS using Context',
    highlightedNodeIds: Object.freeze([...record.highlightedNodeIds].sort()),
    sourceCount: record.sourceCount,
    retrievalPackId: record.retrievalPackId,
  });
}

let latestContextJarvisUi: ContextJarvisUi = buildJarvisContextUi(null);
let latestContextJarvisScope:
  | Readonly<{ projectId: string | null; mapIds: readonly string[] }>
  | undefined;

export function getLatestContextJarvisUi(
  scope?: Readonly<{ projectId: string | null; mapId: string | null }>,
): ContextJarvisUi {
  if (
    (latestContextJarvisScope && !scope) ||
    (scope &&
      (!latestContextJarvisScope ||
        latestContextJarvisScope.projectId !== scope.projectId ||
        !scope.mapId ||
        !latestContextJarvisScope.mapIds.includes(scope.mapId)))
  ) {
    return buildJarvisContextUi(null);
  }
  return latestContextJarvisUi;
}

export function publishContextJarvisActivity(
  input: unknown,
  target: EventTarget | undefined = typeof window === 'undefined' ? undefined : window,
  scope?: Readonly<{ projectId: string | null; mapIds: readonly string[] }>,
): ContextJarvisUi {
  const next = buildJarvisContextUi(input);
  if (
    scope &&
    ((scope.projectId !== null && !hasSafeString(scope.projectId)) ||
      !isBoundedIdentifierList(scope.mapIds) ||
      scope.mapIds.length < 1 ||
      scope.mapIds.length > MAX_CONTEXT_ACTIVITY_MAPS)
  ) {
    throw new Error('Invalid Context JARVIS activity scope');
  }
  latestContextJarvisUi = next;
  latestContextJarvisScope =
    next.visible && scope
      ? Object.freeze({
          projectId: scope.projectId,
          mapIds: Object.freeze([...scope.mapIds].sort()),
        })
      : undefined;
  if (target) {
    try {
      target.dispatchEvent(new Event('jarvis:context:activity'));
    } catch {
      // Retaining validated activity does not depend on an optional UI subscriber.
    }
  }
  return next;
}
