export const SIYUAN_CONTEXT_VAULT_ENABLED = false as const;

export const SIYUAN_NATIVE_COMMANDS = Object.freeze({
  status: 'siyuan_status',
  start: 'siyuan_start',
  stop: 'siyuan_stop',
  version: 'siyuan_version',
  listNotebooks: 'siyuan_list_notebooks',
  searchBlocks: 'siyuan_search_blocks',
  getBlock: 'siyuan_get_block',
  createDocument: 'siyuan_create_document',
  updateBlock: 'siyuan_update_block',
  deleteBlock: 'siyuan_delete_block',
  createDailyNote: 'siyuan_create_daily_note',
  createSnapshot: 'siyuan_create_snapshot',
} as const);

export const SIYUAN_MAX_IDENTIFIER_LENGTH = 128;
export const SIYUAN_MAX_QUERY_LENGTH = 512;
export const SIYUAN_MAX_SEARCH_RESULTS = 100;
export const SIYUAN_MAX_BLOCK_CONTENT_LENGTH = 1_048_576;
export const SIYUAN_MAX_DOCUMENT_PATH_LENGTH = 4_096;
export const SIYUAN_MAX_SNAPSHOT_MEMO_LENGTH = 256;

export type SiyuanRuntimeState =
  | 'disabled'
  | 'stopped'
  | 'starting'
  | 'ready'
  | 'failed'
  | 'stopping';

export interface SiyuanStatus {
  featureEnabled: boolean;
  runtimeBundled: boolean;
  state: SiyuanRuntimeState;
}

export interface SiyuanVersion {
  version: string;
  commit: string;
}

export interface SiyuanNotebook {
  id: string;
  name: string;
  closed: boolean;
}

export interface SiyuanBlockSummary {
  id: string;
  notebookId: string;
  path: string;
  content: string;
}

export interface SiyuanBlock {
  id: string;
  notebookId: string;
  path: string;
  markdown: string;
}

export interface SiyuanDocumentMutation {
  id: string;
}

export interface SiyuanMutationResult {
  applied: true;
}

export class SiyuanContractError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'SiyuanContractError';
  }
}

function fail(code: string): never {
  throw new SiyuanContractError(code);
}

function record(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(code);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    fail(code);
  }
}

function boundedString(
  value: unknown,
  maximumLength: number,
  code: string,
  allowEmpty = false,
): string {
  if (
    typeof value !== 'string' ||
    (!allowEmpty && value.length === 0) ||
    value.length > maximumLength ||
    /[\u0000-\u001F\u007F]/u.test(value)
  ) {
    fail(code);
  }
  return value;
}

export function assertSiyuanIdentifier(value: unknown, code = 'siyuan_identifier_invalid'): string {
  const identifier = boundedString(value, SIYUAN_MAX_IDENTIFIER_LENGTH, code);
  if (!/^[A-Za-z0-9_-]+$/u.test(identifier)) fail(code);
  return identifier;
}

export function assertSiyuanQuery(value: unknown): string {
  const query = boundedString(value, SIYUAN_MAX_QUERY_LENGTH, 'siyuan_query_invalid');
  if (!query.trim()) fail('siyuan_query_invalid');
  return query;
}

export function assertSiyuanSearchLimit(value: unknown): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) > SIYUAN_MAX_SEARCH_RESULTS
  ) {
    fail('siyuan_limit_invalid');
  }
  return value as number;
}

export function assertSiyuanDocumentPath(value: unknown): string {
  const documentPath = boundedString(value, SIYUAN_MAX_DOCUMENT_PATH_LENGTH, 'siyuan_path_invalid');
  if (
    !documentPath.startsWith('/') ||
    documentPath.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    fail('siyuan_path_invalid');
  }
  return documentPath;
}

export function assertSiyuanMarkdown(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\u0000') ||
    new TextEncoder().encode(value).byteLength > SIYUAN_MAX_BLOCK_CONTENT_LENGTH
  ) {
    fail('siyuan_content_invalid');
  }
  return value;
}

export function assertSiyuanSnapshotMemo(value: unknown): string {
  const memo = boundedString(value, SIYUAN_MAX_SNAPSHOT_MEMO_LENGTH, 'siyuan_content_invalid');
  if (!memo.trim()) fail('siyuan_content_invalid');
  return memo;
}

export function parseSiyuanStatus(value: unknown): SiyuanStatus {
  const status = record(value, 'siyuan_status_invalid');
  exactKeys(status, ['featureEnabled', 'runtimeBundled', 'state'], 'siyuan_status_keys_invalid');
  if (typeof status.featureEnabled !== 'boolean' || typeof status.runtimeBundled !== 'boolean') {
    fail('siyuan_status_invalid');
  }
  const states: readonly SiyuanRuntimeState[] = [
    'disabled',
    'stopped',
    'starting',
    'ready',
    'failed',
    'stopping',
  ];
  if (!states.includes(status.state as SiyuanRuntimeState)) fail('siyuan_status_state_invalid');
  return {
    featureEnabled: status.featureEnabled,
    runtimeBundled: status.runtimeBundled,
    state: status.state as SiyuanRuntimeState,
  };
}

export function parseSiyuanVersion(value: unknown): SiyuanVersion {
  const version = record(value, 'siyuan_version_invalid');
  exactKeys(version, ['version', 'commit'], 'siyuan_version_keys_invalid');
  return {
    version: boundedString(version.version, 32, 'siyuan_version_invalid'),
    commit: boundedString(version.commit, 64, 'siyuan_commit_invalid'),
  };
}

function parseNotebook(value: unknown): SiyuanNotebook {
  const notebook = record(value, 'siyuan_notebook_invalid');
  exactKeys(notebook, ['id', 'name', 'closed'], 'siyuan_notebook_keys_invalid');
  if (typeof notebook.closed !== 'boolean') fail('siyuan_notebook_closed_invalid');
  return {
    id: assertSiyuanIdentifier(notebook.id, 'siyuan_notebook_id_invalid'),
    name: boundedString(notebook.name, 256, 'siyuan_notebook_name_invalid'),
    closed: notebook.closed,
  };
}

export function parseSiyuanNotebooks(value: unknown): SiyuanNotebook[] {
  const response = record(value, 'siyuan_notebooks_invalid');
  exactKeys(response, ['notebooks'], 'siyuan_notebooks_keys_invalid');
  if (!Array.isArray(response.notebooks) || response.notebooks.length > 1_000) {
    fail('siyuan_notebooks_invalid');
  }
  return response.notebooks.map(parseNotebook);
}

function parseBlockSummary(value: unknown): SiyuanBlockSummary {
  const block = record(value, 'siyuan_block_summary_invalid');
  exactKeys(block, ['id', 'notebookId', 'path', 'content'], 'siyuan_block_summary_keys_invalid');
  return {
    id: assertSiyuanIdentifier(block.id, 'siyuan_block_id_invalid'),
    notebookId: assertSiyuanIdentifier(block.notebookId, 'siyuan_notebook_id_invalid'),
    path: boundedString(block.path, 4_096, 'siyuan_block_path_invalid'),
    content: boundedString(
      block.content,
      SIYUAN_MAX_BLOCK_CONTENT_LENGTH,
      'siyuan_block_content_invalid',
      true,
    ),
  };
}

export function parseSiyuanSearchResults(
  value: unknown,
  requestedLimit: number,
): SiyuanBlockSummary[] {
  assertSiyuanSearchLimit(requestedLimit);
  const response = record(value, 'siyuan_search_results_invalid');
  exactKeys(response, ['blocks'], 'siyuan_search_results_keys_invalid');
  if (!Array.isArray(response.blocks) || response.blocks.length > requestedLimit) {
    fail('siyuan_search_results_invalid');
  }
  return response.blocks.map(parseBlockSummary);
}

export function parseSiyuanBlock(value: unknown): SiyuanBlock {
  const response = record(value, 'siyuan_block_response_invalid');
  exactKeys(response, ['block'], 'siyuan_block_response_keys_invalid');
  const block = record(response.block, 'siyuan_block_invalid');
  exactKeys(block, ['id', 'notebookId', 'path', 'markdown'], 'siyuan_block_keys_invalid');
  return {
    id: assertSiyuanIdentifier(block.id, 'siyuan_block_id_invalid'),
    notebookId: assertSiyuanIdentifier(block.notebookId, 'siyuan_notebook_id_invalid'),
    path: boundedString(block.path, 4_096, 'siyuan_block_path_invalid'),
    markdown: boundedString(
      block.markdown,
      SIYUAN_MAX_BLOCK_CONTENT_LENGTH,
      'siyuan_block_markdown_invalid',
      true,
    ),
  };
}

export function parseSiyuanDocumentMutation(value: unknown): SiyuanDocumentMutation {
  const response = record(value, 'siyuan_document_response_invalid');
  exactKeys(response, ['id'], 'siyuan_document_response_keys_invalid');
  return { id: assertSiyuanIdentifier(response.id, 'siyuan_block_id_invalid') };
}

export function parseSiyuanMutationResult(value: unknown): SiyuanMutationResult {
  const response = record(value, 'siyuan_mutation_response_invalid');
  exactKeys(response, ['applied'], 'siyuan_mutation_response_keys_invalid');
  if (response.applied !== true) fail('siyuan_mutation_response_invalid');
  return { applied: true };
}
