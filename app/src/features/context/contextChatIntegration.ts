import type { ContextAttachment, ContextMapRecord, ContextNodeKind, ContextTreeNode } from './tree';

export const CONTEXT_CHAT_ATTACHMENT_LEVELS = Object.freeze([
  'map_summary',
  'entity',
  'note',
  'heading',
  'block',
  'saved_view',
  'search_results',
  'github_pull_request',
  'graph_cluster',
] as const);

export type ContextChatAttachmentLevel = (typeof CONTEXT_CHAT_ATTACHMENT_LEVELS)[number];
export type ContextChatFreshness = 'current' | 'stale' | 'unknown';
export type ContextChatSourceType =
  | 'local_folder'
  | 'local_file'
  | 'github_repository'
  | 'linked_vibespace_content'
  | 'portable_markdown_folder';

export interface ContextChatAttachment extends ContextAttachment {
  attachmentLevel: ContextChatAttachmentLevel;
  mapId: string;
  source: {
    type: ContextChatSourceType;
    label: string;
    branchRef?: string;
  };
  freshness: ContextChatFreshness;
  itemCount: number;
  lastIndexedAt?: number;
}

export interface ContextChatAttachmentInput {
  projectId: string | null;
  rootDir: string;
  generatedAt: number;
  nodeId: string;
  mapId: string;
  title: string;
  kind: ContextNodeKind;
  summary: string;
  attachmentLevel: ContextChatAttachmentLevel;
  source: {
    type: ContextChatSourceType;
    label: string;
    branchRef?: string;
  };
  freshness: ContextChatFreshness;
  itemCount: number;
  lastIndexedAt?: number;
  path?: string;
  tags?: string[];
  sizeBytes?: number;
  createdAt?: number;
  modifiedAt?: number;
  childrenCount?: number;
}

export interface ContextAttachmentTokenView {
  label: string;
  source: string;
  freshness: ContextChatFreshness;
  itemCount: number;
  sublabel: string;
  accessibleLabel: string;
}

export interface ContextMapPickerOption {
  id: string;
  label: string;
  description: string;
  metadata: string;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,255}$/u;
const MAX_TEXT = 4_096;
const MAX_TIMESTAMP = 8_640_000_000_000_000;
const STALE_AFTER_MS = 24 * 60 * 60 * 1_000;

function fail(detail: string): never {
  throw new Error(`Invalid chat Context attachment: ${detail}.`);
}

function text(value: unknown, detail: string, allowEmpty = false): string {
  if (
    typeof value !== 'string' ||
    value.length > MAX_TEXT ||
    (!allowEmpty && value.trim().length === 0) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)
  ) {
    fail(detail);
  }
  return value;
}

function id(value: unknown, detail: string): string {
  const parsed = text(value, detail);
  if (!SAFE_ID.test(parsed)) fail(detail);
  return parsed;
}

function timestamp(value: unknown, detail: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > MAX_TIMESTAMP) {
    fail(detail);
  }
  return value as number;
}

function optionalTimestamp(value: unknown, detail: string): number | undefined {
  return value === undefined ? undefined : timestamp(value, detail);
}

function itemCount(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 1_000_000) {
    fail('item count');
  }
  return value as number;
}

function clone<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return fail('boundary');
  }
}

function assertPlainBoundary(value: unknown, depth = 0): void {
  if (value === null || typeof value !== 'object') return;
  if (depth > 5) fail('boundary');
  let isArray: boolean;
  let prototype: object | null;
  let keys: PropertyKey[];
  let descriptors: PropertyDescriptorMap;
  try {
    isArray = Array.isArray(value);
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return fail('boundary');
  }
  if (keys.some((key) => typeof key !== 'string')) fail('boundary');
  if (isArray) {
    if (prototype !== Array.prototype) fail('boundary');
    const lengthDescriptor = descriptors.length;
    const length =
      lengthDescriptor && 'value' in lengthDescriptor ? lengthDescriptor.value : undefined;
    if (!Number.isSafeInteger(length) || length < 0 || length > 100) fail('boundary');
    if (keys.length !== length + 1 || !keys.includes('length')) fail('boundary');
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail('boundary');
      assertPlainBoundary(descriptor.value, depth + 1);
    }
    return;
  }
  if (prototype !== Object.prototype && prototype !== null) fail('boundary');
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (!descriptor) fail('boundary');
    if (!descriptor.enumerable || !('value' in descriptor)) fail('boundary');
    assertPlainBoundary(descriptor.value, depth + 1);
  }
}

function allowedKeys(value: object, allowed: readonly string[], detail: string): void {
  const names = new Set(allowed);
  if (Object.keys(value).some((key) => !names.has(key))) fail(detail);
}

function parseInput(raw: ContextChatAttachmentInput): ContextChatAttachmentInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('boundary');
  assertPlainBoundary(raw);
  const input = clone(raw);
  allowedKeys(
    input,
    [
      'projectId',
      'rootDir',
      'generatedAt',
      'nodeId',
      'mapId',
      'title',
      'kind',
      'summary',
      'attachmentLevel',
      'source',
      'freshness',
      'itemCount',
      'lastIndexedAt',
      'path',
      'tags',
      'sizeBytes',
      'createdAt',
      'modifiedAt',
      'childrenCount',
    ],
    'fields',
  );
  if (!input.source || typeof input.source !== 'object' || Array.isArray(input.source)) {
    fail('source');
  }
  allowedKeys(input.source, ['type', 'label', 'branchRef'], 'source fields');
  if (!(CONTEXT_CHAT_ATTACHMENT_LEVELS as readonly unknown[]).includes(input.attachmentLevel)) {
    fail('attachment level');
  }
  if (!['root', 'area', 'file', 'symbol', 'note'].includes(input.kind)) fail('node kind');
  if (!['current', 'stale', 'unknown'].includes(input.freshness)) fail('freshness');
  if (
    ![
      'local_folder',
      'local_file',
      'github_repository',
      'linked_vibespace_content',
      'portable_markdown_folder',
    ].includes(input.source?.type)
  ) {
    fail('source type');
  }
  if (
    input.tags !== undefined &&
    (!Array.isArray(input.tags) ||
      input.tags.length > 100 ||
      input.tags.some((tag) => typeof tag !== 'string' || tag.length === 0 || tag.length > 200))
  ) {
    fail('tags');
  }
  for (const [name, value] of [
    ['size', input.sizeBytes],
    ['children count', input.childrenCount],
  ] as const) {
    if (
      value !== undefined &&
      (!Number.isSafeInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER)
    ) {
      fail(name);
    }
  }
  return {
    ...input,
    projectId: input.projectId === null ? null : id(input.projectId, 'project ID'),
    rootDir: text(input.rootDir, 'root directory', true),
    generatedAt: timestamp(input.generatedAt, 'generated time'),
    nodeId: id(input.nodeId, 'node ID'),
    mapId: id(input.mapId, 'map ID'),
    title: text(input.title, 'label'),
    summary: text(input.summary, 'summary', true),
    ...(input.path === undefined ? {} : { path: text(input.path, 'path', true) }),
    ...(input.tags === undefined ? {} : { tags: input.tags.map((tag) => text(tag, 'tag')) }),
    ...(input.createdAt === undefined
      ? {}
      : { createdAt: timestamp(input.createdAt, 'created time') }),
    ...(input.modifiedAt === undefined
      ? {}
      : { modifiedAt: timestamp(input.modifiedAt, 'modified time') }),
    source: {
      type: input.source.type,
      label: text(input.source.label, 'source label'),
      ...(input.source.branchRef === undefined
        ? {}
        : { branchRef: text(input.source.branchRef, 'branch/ref') }),
    },
    freshness: input.freshness,
    itemCount: itemCount(input.itemCount),
    ...(optionalTimestamp(input.lastIndexedAt, 'last indexed time') === undefined
      ? {}
      : { lastIndexedAt: input.lastIndexedAt }),
  };
}

export function buildContextChatAttachment(
  rawInput: ContextChatAttachmentInput,
): Readonly<ContextChatAttachment> {
  const input = parseInput(rawInput);
  return Object.freeze({
    ...input,
    source: Object.freeze({ ...input.source }),
    ...(input.tags ? { tags: Object.freeze([...input.tags]) as string[] } : {}),
  });
}

function countNodes(nodes: readonly ContextTreeNode[]): number {
  let count = 0;
  const pending = [...nodes];
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node) continue;
    count += 1;
    if (count > 1_000_000) fail('entity count');
    pending.push(...(node.children ?? []));
  }
  return count;
}

function mapSourceTypeLabel(map: ContextMapRecord): string {
  return {
    local_folder: 'Local folder',
    local_file: 'Local file',
    github_repository: 'GitHub',
    linked_vibespace_content: 'VibeSpace',
    portable_markdown_folder: 'Markdown folder',
  }[map.sourceType ?? 'local_folder'];
}

function mapSourceLabel(map: ContextMapRecord): string {
  return map.sourceLabel ?? mapSourceTypeLabel(map);
}

export function contextFreshness(indexedAt: number | undefined, now: number): ContextChatFreshness {
  if (indexedAt === undefined) return 'unknown';
  timestamp(indexedAt, 'indexed time');
  timestamp(now, 'current time');
  if (indexedAt > now) return 'unknown';
  return now - indexedAt > STALE_AFTER_MS ? 'stale' : 'current';
}

export function contextMapPickerOption(
  map: ContextMapRecord,
  now = Date.now(),
): Readonly<ContextMapPickerOption> {
  const indexedAt = map.lastIndexedAt ?? map.tree?.generatedAt;
  const freshness = contextFreshness(indexedAt, now);
  const entities = countNodes(map.tree?.nodes ?? []);
  const sourceType = mapSourceTypeLabel(map);
  const sourceLabel = mapSourceLabel(map);
  return Object.freeze({
    id: map.id,
    label: map.name || 'Untitled',
    description: `${sourceType}${sourceLabel === sourceType ? '' : ` · ${sourceLabel}`} · ${freshness} · ${entities} ${
      entities === 1 ? 'entity' : 'entities'
    }`,
    metadata: `${map.branchRef ?? 'workspace'} · indexed ${
      indexedAt !== undefined ? new Date(indexedAt).toLocaleDateString() : 'unknown'
    }`,
  });
}

export function buildMapSummaryChatAttachment(
  map: ContextMapRecord,
  now = Date.now(),
): Readonly<ContextChatAttachment> {
  const root = map.tree?.nodes?.[0];
  if (!root) fail('map root');
  const lastIndexedAt = map.lastIndexedAt ?? map.tree.generatedAt;
  return buildContextChatAttachment({
    projectId: map.projectId,
    rootDir: map.rootDir,
    generatedAt: map.tree.generatedAt,
    nodeId: root.id || `map:${map.id}`,
    mapId: map.id,
    title: map.name || 'Context Map',
    kind: 'root',
    summary: map.tree.summary ?? '',
    attachmentLevel: 'map_summary',
    source: {
      type: map.sourceType ?? 'local_folder',
      label: mapSourceLabel(map),
      branchRef: map.branchRef ?? 'workspace',
    },
    freshness: contextFreshness(lastIndexedAt, now),
    itemCount: Math.max(1, countNodes(map.tree.nodes)),
    lastIndexedAt,
    path: '',
    childrenCount: root.children?.length,
  });
}

export function normalizeContextChatAttachment(
  attachment: ContextAttachment | ContextChatAttachment,
  now = Date.now(),
): Readonly<ContextChatAttachment> {
  const candidate = attachment as Partial<ContextChatAttachment>;
  const richKeys = [
    'attachmentLevel',
    'mapId',
    'source',
    'freshness',
    'itemCount',
    'lastIndexedAt',
  ];
  if (richKeys.some((key) => Object.prototype.hasOwnProperty.call(candidate, key))) {
    return buildContextChatAttachment(candidate as ContextChatAttachment);
  }
  const indexedAt = optionalTimestamp(attachment.generatedAt, 'generated time');
  return buildContextChatAttachment({
    ...attachment,
    mapId: attachment.nodeId.startsWith('map:') ? attachment.nodeId.slice(4) : attachment.nodeId,
    attachmentLevel: attachment.kind === 'note' ? 'note' : 'entity',
    source: { type: 'local_folder', label: 'Local folder', branchRef: 'workspace' },
    freshness: contextFreshness(indexedAt, now),
    itemCount: Math.max(1, (attachment.childrenCount ?? 0) + 1),
    lastIndexedAt: indexedAt,
  });
}

export function contextAttachmentTokenView(
  rawAttachment: ContextAttachment | ContextChatAttachment,
  now = Date.now(),
): Readonly<ContextAttachmentTokenView> {
  const attachment = normalizeContextChatAttachment(rawAttachment, now);
  const ref = attachment.source.branchRef ? ` · ${attachment.source.branchRef}` : '';
  const sublabel = `${attachment.source.label}${ref} · ${attachment.freshness} · ${attachment.itemCount} ${
    attachment.itemCount === 1 ? 'item' : 'items'
  }`;
  return Object.freeze({
    label: attachment.title,
    source: attachment.source.label,
    freshness: attachment.freshness,
    itemCount: attachment.itemCount,
    sublabel,
    accessibleLabel: `${attachment.title}; source ${attachment.source.label}; ${attachment.freshness}; ${attachment.itemCount} items`,
  });
}

export function contextChatAttachmentKey(
  rawAttachment: ContextAttachment | ContextChatAttachment,
): string {
  const attachment = normalizeContextChatAttachment(rawAttachment);
  const project =
    attachment.projectId === null ? 'n' : `p${attachment.projectId.length}:${attachment.projectId}`;
  return `${project}${attachment.mapId.length}:${attachment.mapId}${attachment.nodeId.length}:${
    attachment.nodeId
  }${attachment.attachmentLevel}`;
}

export function contextChatAttachmentMatchesProject(
  rawAttachment: ContextAttachment | ContextChatAttachment,
  projectId: string | null,
): boolean {
  const attachment = normalizeContextChatAttachment(rawAttachment);
  return attachment.projectId === projectId;
}
