import { nativeFetch } from '@/lib/nativeFetch';
import type { ActionResult } from '@/lib/actions/types';
import type { JarvisRegisteredActionExecutor } from '@/lib/jarvis/actions/catalog';
import type { CanonicalPluginEvidence } from '@/lib/jarvis/artifactProducerAdapters';
import type { JarvisArtifactDraft } from '@/lib/jarvis/contracts';
import type { PluginTestResult } from './types';

type CredentialMap = Readonly<Record<string, string>>;
type GoogleDriveRegistration = Extract<JarvisRegisteredActionExecutor, { kind: 'plugin_tool' }>;

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const GOOGLE_DOCUMENT_MIME = 'application/vnd.google-apps.document';
const REQUIRED_SCOPE_LIST = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
] as const;
const REQUIRED_SCOPES = new Set(REQUIRED_SCOPE_LIST);
const DESKTOP_CLIENT_ID = /^[A-Za-z0-9._-]{10,256}\.apps\.googleusercontent\.com$/;
const FILE_ID = /^[A-Za-z0-9_-]{3,256}$/;
const EMAIL =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const MIME_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/;
const TEXT_MIME_TYPES = new Set(['text/plain', 'text/markdown', 'text/csv', 'application/json']);
const FILE_FIELDS = 'id,name,mimeType,modifiedTime,size,capabilities(canDownload)';
const TOKEN_RESPONSE_LIMIT = 64 * 1024;
const ABOUT_RESPONSE_LIMIT = 64 * 1024;
const SEARCH_RESPONSE_LIMIT = 256 * 1024;
const METADATA_RESPONSE_LIMIT = 64 * 1024;
const DOCUMENT_RESPONSE_LIMIT = 512 * 1024;
const CREATE_RESPONSE_LIMIT = 64 * 1024;
const SEARCH_TERM_LIMIT = 256;
const SEARCH_RESULT_LIMIT = 20;
const DOCUMENT_TEXT_LIMIT = 40_000;
const FILE_NAME_LIMIT = 240;
const TITLE_LIMIT = 150;
const CREATE_CONTENT_LIMIT = 50_000;
const EXTERNAL_SECRET_PATTERNS: readonly RegExp[] = [
  /-----BEGIN((?: [A-Z0-9]+)*) PRIVATE KEY-----[\s\S]*?(?:-----END\1 PRIVATE KEY-----|$)/gi,
  /-----BEGIN PGP PRIVATE KEY BLOCK-----[\s\S]*?(?:-----END PGP PRIVATE KEY BLOCK-----|$)/gi,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/gi,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/gi,
  /\bxox[bp]-[A-Za-z0-9-]{20,}\b/gi,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  /\b(?:gsk_|sb_secret_)[A-Za-z0-9_-]{16,}\b/gi,
  /\b(?:xai-|sk-ant-)[A-Za-z0-9_-]{16,}\b/gi,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_]{8,}\b/gi,
  /\bwhsec_[A-Za-z0-9_]{8,}\b/gi,
  /\bsk-[A-Za-z0-9_-]{12,}\b/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{8,}={0,2}\b/gi,
  /\b(?:authorization|proxy[-_ ]?authorization|cookie|set[-_ ]?cookie|x[-_ ]?api[-_ ]?key|api[-_ ]?key|apikey|access[-_ ]?token|refresh[-_ ]?token|id[-_ ]?token|client[-_ ]?secret|private[-_ ]?key|signing[-_ ]?key|service[-_ ]?role|password|passwd|credential|secret)\b\s*(?:[:=]|\bis\b)\s*(?:"[^"\r\n]+"|'[^'\r\n]+'|[^\s,;}]+)/gi,
];

function driveFailure(reason: string): Error {
  return new Error(`Google Drive provider denied the operation: ${reason}.`);
}

function required(values: CredentialMap, field: string): string {
  const value = values[field]?.trim();
  if (!value || value.length > 8_192 || /[\r\n\u0000]/.test(value)) {
    throw driveFailure(`${field}_unavailable`);
  }
  return value;
}

function exactRecord(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  reason: string,
): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    throw driveFailure(reason);
  }
  const allowedSet = new Set(allowed);
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      typeof key !== 'string' ||
      !allowedSet.has(key) ||
      !descriptor ||
      !('value' in descriptor)
    ) {
      throw driveFailure(`${reason}_unknown_fields`);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function providerRecord(value: unknown): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw driveFailure('provider_response_invalid');
  }
  return value as Record<string, unknown>;
}

function providerArray(value: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw driveFailure('provider_response_invalid');
  }
  return value;
}

function fileId(value: unknown, reason = 'file_id_invalid'): string {
  if (typeof value !== 'string' || !FILE_ID.test(value)) throw driveFailure(reason);
  return value;
}

function redactExternalSecrets(value: string): string {
  let result = value;
  for (const pattern of EXTERNAL_SECRET_PATTERNS) {
    result = result.replace(pattern, '[redacted secret]');
  }
  return result;
}

function boundedExternalText(
  value: unknown,
  limit: number,
  requiredValue: boolean,
): Readonly<{ text?: string; truncated: boolean }> {
  if (value === null || value === undefined) {
    if (requiredValue) throw driveFailure('provider_response_invalid');
    return { truncated: false };
  }
  if (typeof value !== 'string') throw driveFailure('provider_response_invalid');
  const normalized = value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!normalized) {
    if (requiredValue) throw driveFailure('provider_response_invalid');
    return { truncated: false };
  }
  const redacted = redactExternalSecrets(normalized);
  const characters = Array.from(redacted);
  return {
    text: characters.slice(0, limit).join(''),
    truncated: characters.length > limit,
  };
}

function exactExternalName(value: unknown): string {
  if (typeof value !== 'string') throw driveFailure('provider_response_invalid');
  const normalized = value.normalize('NFC');
  if (
    !normalized ||
    Array.from(normalized).length > FILE_NAME_LIMIT ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw driveFailure('provider_response_invalid');
  }
  return normalized;
}

function optionalPageToken(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 4_096 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw driveFailure('provider_response_invalid');
  }
  return value;
}

async function readBoundedBody(response: Response, limit: number): Promise<string> {
  const contentLength = response.headers.get('content-length');
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > limit)) {
    throw driveFailure('provider_response_too_large');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let result = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw driveFailure('provider_response_too_large');
      }
      result += decoder.decode(value, { stream: true });
    }
    result += decoder.decode();
    return result;
  } finally {
    reader.releaseLock();
  }
}

async function request(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  maxBytes: number,
): Promise<string> {
  const response = await nativeFetch(url, {
    ...init,
    redirect: 'error',
    signal,
    timeoutMs: 12_000,
  });
  if (!response.ok) throw driveFailure(`provider_rejected_${response.status}`);
  return await readBoundedBody(response, maxBytes);
}

async function requestJson(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  maxBytes: number,
): Promise<unknown> {
  const body = await request(url, init, signal, maxBytes);
  if (!body.trim()) throw driveFailure('provider_response_invalid');
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw driveFailure('provider_response_invalid');
  }
}

async function accessToken(values: CredentialMap, signal: AbortSignal): Promise<string> {
  const clientId = required(values, 'client_id');
  if (!DESKTOP_CLIENT_ID.test(clientId)) throw driveFailure('client_id_invalid');
  const response = providerRecord(
    await requestJson(
      TOKEN_ENDPOINT,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          refresh_token: required(values, 'refresh_token'),
          grant_type: 'refresh_token',
          scope: REQUIRED_SCOPE_LIST.join(' '),
        }),
      },
      signal,
      TOKEN_RESPONSE_LIMIT,
    ),
  );
  const token = response.access_token;
  if (
    typeof token !== 'string' ||
    token.length < 10 ||
    token.length > 4_096 ||
    /[\s\u0000]/.test(token)
  ) {
    throw driveFailure('access_token_invalid');
  }
  if (response.token_type !== undefined && response.token_type !== 'Bearer') {
    throw driveFailure('token_type_invalid');
  }
  if (typeof response.scope !== 'string') throw driveFailure('scope_invalid');
  const granted = new Set(response.scope.split(/\s+/).filter(Boolean));
  if (
    granted.size !== REQUIRED_SCOPES.size ||
    [...REQUIRED_SCOPES].some((scope) => !granted.has(scope))
  ) {
    throw driveFailure('required_scope_unavailable');
  }
  return token;
}

function driveHeaders(token: string): Readonly<Record<string, string>> {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

function driveJson(
  path: string,
  input: {
    token: string;
    signal: AbortSignal;
    maxBytes: number;
    method?: 'GET' | 'POST';
    body?: string;
    headers?: Readonly<Record<string, string>>;
    upload?: boolean;
  },
): Promise<unknown> {
  const base = input.upload ? DRIVE_UPLOAD_API : DRIVE_API;
  return requestJson(
    `${base}${path}`,
    {
      method: input.method ?? 'GET',
      headers: {
        ...driveHeaders(input.token),
        ...input.headers,
      },
      ...(input.body === undefined ? {} : { body: input.body }),
    },
    input.signal,
    input.maxBytes,
  );
}

export async function testGoogleDriveConnection(input: {
  values: CredentialMap;
  signal: AbortSignal;
}): Promise<PluginTestResult> {
  const token = await accessToken(input.values, input.signal);
  const fields = new URLSearchParams({ fields: 'user(displayName,emailAddress)' });
  const about = providerRecord(
    await driveJson(`/about?${fields.toString()}`, {
      token,
      signal: input.signal,
      maxBytes: ABOUT_RESPONSE_LIMIT,
    }),
  );
  const user = providerRecord(about.user);
  const email = typeof user.emailAddress === 'string' ? user.emailAddress : '';
  if (!EMAIL.test(email) || email.length > 254) {
    throw driveFailure('provider_response_invalid');
  }
  return { ok: true, accountLabel: email };
}

function searchParameters(
  value: Readonly<Record<string, unknown>>,
): Readonly<{ term: string; maxResults: number }> {
  const record = exactRecord(value, ['term', 'maxResults'], 'search_parameters_invalid');
  const term = typeof record.term === 'string' ? record.term.trim().normalize('NFC') : '';
  if (!term || Array.from(term).length > SEARCH_TERM_LIMIT || /[\u0000-\u001f\u007f]/.test(term)) {
    throw driveFailure('search_term_invalid');
  }
  const maxResults = record.maxResults === undefined ? 10 : record.maxResults;
  if (
    !Number.isSafeInteger(maxResults) ||
    (maxResults as number) < 1 ||
    (maxResults as number) > SEARCH_RESULT_LIMIT
  ) {
    throw driveFailure('max_results_invalid');
  }
  return { term, maxResults: maxResults as number };
}

function documentReadParameters(
  value: Readonly<Record<string, unknown>>,
): Readonly<{ fileId: string }> {
  const record = exactRecord(value, ['fileId'], 'document_parameters_invalid');
  return { fileId: fileId(record.fileId) };
}

function documentCreateParameters(
  value: Readonly<Record<string, unknown>>,
): Readonly<{ title: string; content: string }> {
  const record = exactRecord(value, ['title', 'content'], 'create_parameters_invalid');
  const title = typeof record.title === 'string' ? record.title.trim().normalize('NFC') : '';
  if (!title || Array.from(title).length > TITLE_LIMIT || /[\u0000-\u001f\u007f]/.test(title)) {
    throw driveFailure('title_invalid');
  }
  if (typeof record.content !== 'string') throw driveFailure('content_invalid');
  const content = record.content.normalize('NFC').replace(/\r\n?/g, '\n');
  if (
    !content.trim() ||
    Array.from(content).length > CREATE_CONTENT_LIMIT ||
    /[\u0000\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(content)
  ) {
    throw driveFailure('content_invalid');
  }
  return { title, content };
}

function createIdempotencyKey(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length < 8 ||
    value.length > 2_048 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw driveFailure('idempotency_key_unavailable');
  }
  return value;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizedMimeType(value: unknown): string {
  if (typeof value !== 'string' || !MIME_TYPE.test(value) || value !== value.toLowerCase()) {
    throw driveFailure('provider_response_invalid');
  }
  return value;
}

function modifiedTime(value: unknown): string {
  if (typeof value !== 'string' || value.length > 40) {
    throw driveFailure('provider_response_invalid');
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw driveFailure('provider_response_invalid');
  }
  return value;
}

function sizeBytes(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,15})$/.test(value)) {
    throw driveFailure('provider_response_invalid');
  }
  const size = Number(value);
  if (!Number.isSafeInteger(size)) throw driveFailure('provider_response_invalid');
  return size;
}

function sourceUrl(id: string, mimeType: string): string {
  return mimeType === GOOGLE_DOCUMENT_MIME
    ? `https://docs.google.com/document/d/${id}/edit`
    : `https://drive.google.com/file/d/${id}/view`;
}

function normalizedFile(
  value: unknown,
  expectedId?: string,
  requireExactName = false,
): Readonly<{
  id: string;
  exactName?: string;
  untrustedName: string;
  mimeType: string;
  modifiedTime: string;
  sizeBytes?: number;
  sourceUrl: string;
  canDownload: boolean;
}> {
  const file = providerRecord(value);
  const id = fileId(file.id, 'provider_response_invalid');
  if (expectedId !== undefined && id !== expectedId) {
    throw driveFailure('provider_response_invalid');
  }
  const exactName = requireExactName ? exactExternalName(file.name) : undefined;
  const name = boundedExternalText(file.name, FILE_NAME_LIMIT, true).text;
  if (!name) throw driveFailure('provider_response_invalid');
  const mimeType = normalizedMimeType(file.mimeType);
  const capabilities = providerRecord(file.capabilities);
  if (typeof capabilities.canDownload !== 'boolean') {
    throw driveFailure('provider_response_invalid');
  }
  const size = sizeBytes(file.size);
  return {
    id,
    ...(exactName === undefined ? {} : { exactName }),
    untrustedName: name,
    mimeType,
    modifiedTime: modifiedTime(file.modifiedTime),
    ...(size === undefined ? {} : { sizeBytes: size }),
    sourceUrl: sourceUrl(id, mimeType),
    canDownload: capabilities.canDownload,
  };
}

function publicFile(
  value: ReturnType<typeof normalizedFile>,
): Omit<ReturnType<typeof normalizedFile>, 'canDownload' | 'exactName'> {
  const { canDownload: _canDownload, exactName: _exactName, ...result } = value;
  return result;
}

function escapedQueryTerm(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function metadataPath(id: string): string {
  return `/files/${encodeURIComponent(id)}?${new URLSearchParams({ fields: FILE_FIELDS }).toString()}`;
}

function randomBoundary(title: string, content: string): string {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const boundary = `vibespace_drive_${[...bytes]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')}`;
    if (!title.includes(boundary) && !content.includes(boundary)) return boundary;
  }
  throw driveFailure('multipart_boundary_unavailable');
}

function multipartDocument(
  title: string,
  content: string,
  idempotencyMarker: string,
): Readonly<{
  body: string;
  contentType: string;
}> {
  const boundary = randomBoundary(title, content);
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({
      name: title,
      mimeType: GOOGLE_DOCUMENT_MIME,
      appProperties: { vibespace_request_sha256: idempotencyMarker },
    }),
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    content,
    `--${boundary}--`,
    '',
  ].join('\r\n');
  return {
    body,
    contentType: `multipart/related; boundary=${boundary}`,
  };
}

export async function runGoogleDriveTool(input: {
  toolName: string;
  params: Readonly<Record<string, unknown>>;
  values: CredentialMap;
  signal: AbortSignal;
  idempotencyKey?: string;
}): Promise<ActionResult> {
  if (input.toolName === 'files_search') {
    searchParameters(input.params);
  } else if (input.toolName === 'document_read') {
    documentReadParameters(input.params);
  } else if (input.toolName === 'document_create') {
    documentCreateParameters(input.params);
    createIdempotencyKey(input.idempotencyKey);
  } else {
    throw driveFailure('tool_unavailable');
  }

  const token = await accessToken(input.values, input.signal);
  if (input.toolName === 'files_search') {
    const params = searchParameters(input.params);
    const escaped = escapedQueryTerm(params.term);
    const query = new URLSearchParams({
      q: `trashed = false and (name contains '${escaped}' or fullText contains '${escaped}')`,
      pageSize: String(params.maxResults),
      spaces: 'drive',
      orderBy: 'modifiedTime desc,name',
      fields: `files(${FILE_FIELDS}),incompleteSearch`,
    });
    const response = providerRecord(
      await driveJson(`/files?${query.toString()}`, {
        token,
        signal: input.signal,
        maxBytes: SEARCH_RESPONSE_LIMIT,
      }),
    );
    const candidates =
      response.files === undefined ? [] : providerArray(response.files, params.maxResults);
    if (typeof response.incompleteSearch !== 'boolean') {
      throw driveFailure('provider_response_invalid');
    }
    const files = candidates.map((candidate) => publicFile(normalizedFile(candidate)));
    return {
      ok: true,
      summary: `${files.length} Google Drive files examined; ${files.length} selected results returned.`,
      data: {
        contentTrust: 'external_untrusted',
        filesExamined: files.length,
        filesSelected: files.length,
        incompleteSearch: response.incompleteSearch,
        files,
      },
    };
  }

  if (input.toolName === 'document_read') {
    const params = documentReadParameters(input.params);
    const metadata = normalizedFile(
      await driveJson(metadataPath(params.fileId), {
        token,
        signal: input.signal,
        maxBytes: METADATA_RESPONSE_LIMIT,
      }),
      params.fileId,
    );
    if (!metadata.canDownload) throw driveFailure('download_not_permitted');
    let contentPath: string;
    if (metadata.mimeType === GOOGLE_DOCUMENT_MIME) {
      contentPath = `/files/${encodeURIComponent(params.fileId)}/export?${new URLSearchParams({
        mimeType: 'text/plain',
      }).toString()}`;
    } else if (TEXT_MIME_TYPES.has(metadata.mimeType)) {
      contentPath = `/files/${encodeURIComponent(params.fileId)}?alt=media`;
    } else {
      throw driveFailure('document_type_unsupported');
    }
    const content = await request(
      `${DRIVE_API}${contentPath}`,
      { method: 'GET', headers: driveHeaders(token) },
      input.signal,
      DOCUMENT_RESPONSE_LIMIT,
    );
    const bounded = boundedExternalText(content, DOCUMENT_TEXT_LIMIT, false);
    return {
      ok: true,
      summary: `Google Drive document ${params.fileId} retrieved.`,
      data: {
        contentTrust: 'external_untrusted',
        ...publicFile(metadata),
        ...(bounded.text === undefined ? {} : { untrustedBodyExcerpt: bounded.text }),
        bodyTruncated: bounded.truncated,
        remoteContentLoaded: false,
      },
    };
  }

  if (input.toolName === 'document_create') {
    const params = documentCreateParameters(input.params);
    const marker = await sha256Hex(createIdempotencyKey(input.idempotencyKey));
    const idempotencyQuery = new URLSearchParams({
      q: `trashed = false and appProperties has { key='vibespace_request_sha256' and value='${marker}' }`,
      pageSize: '2',
      spaces: 'drive',
      fields: `files(${FILE_FIELDS}),incompleteSearch,nextPageToken`,
    });
    const existingResponse = providerRecord(
      await driveJson(`/files?${idempotencyQuery.toString()}`, {
        token,
        signal: input.signal,
        maxBytes: SEARCH_RESPONSE_LIMIT,
      }),
    );
    if (existingResponse.incompleteSearch !== false) {
      throw driveFailure('idempotency_state_ambiguous');
    }
    if (optionalPageToken(existingResponse.nextPageToken) !== undefined) {
      throw driveFailure('idempotency_state_ambiguous');
    }
    const existingFiles =
      existingResponse.files === undefined ? [] : providerArray(existingResponse.files, 2);
    if (existingFiles.length > 1) throw driveFailure('idempotency_state_ambiguous');
    if (existingFiles.length === 1) {
      const existing = normalizedFile(existingFiles[0], undefined, true);
      if (existing.mimeType !== GOOGLE_DOCUMENT_MIME || existing.exactName !== params.title) {
        throw driveFailure('idempotency_state_conflict');
      }
      return {
        ok: true,
        summary: 'Google Drive document created.',
        data: {
          ...publicFile(existing),
          created: true,
          idempotentlyRecovered: true,
        },
      };
    }
    const multipart = multipartDocument(params.title, params.content, marker);
    const query = new URLSearchParams({
      uploadType: 'multipart',
      fields: FILE_FIELDS,
    });
    const created = normalizedFile(
      await driveJson(`/files?${query.toString()}`, {
        token,
        signal: input.signal,
        maxBytes: CREATE_RESPONSE_LIMIT,
        method: 'POST',
        body: multipart.body,
        headers: { 'Content-Type': multipart.contentType },
        upload: true,
      }),
      undefined,
      true,
    );
    if (created.mimeType !== GOOGLE_DOCUMENT_MIME || created.exactName !== params.title) {
      throw driveFailure('provider_response_invalid');
    }
    return {
      ok: true,
      summary: 'Google Drive document created.',
      data: {
        ...publicFile(created),
        created: true,
      },
    };
  }
  throw driveFailure('tool_unavailable');
}

function providerResultDraft(input: {
  evidence: CanonicalPluginEvidence;
  title: string;
  safeSummary: string;
  content: string;
}): JarvisArtifactDraft {
  const sourceRefs: JarvisArtifactDraft['artifact']['sourceRefs'] = [];
  Object.freeze(sourceRefs);
  return Object.freeze({
    artifact: Object.freeze({
      kind: 'provider_result' as const,
      title: input.title,
      state: 'ready' as const,
      mimeType: 'application/json',
      safeSummary: input.safeSummary,
      sourceRefs,
      createdAt: input.evidence.verifiedAt,
    }),
    backing: Object.freeze({
      kind: 'producer_result' as const,
      content: input.content,
    }),
  });
}

function linkDraft(input: {
  evidence: CanonicalPluginEvidence;
  title: string;
  safeSummary: string;
  uri: string;
}): JarvisArtifactDraft {
  const sourceRefs: JarvisArtifactDraft['artifact']['sourceRefs'] = [];
  Object.freeze(sourceRefs);
  return Object.freeze({
    artifact: Object.freeze({
      kind: 'link' as const,
      title: input.title,
      state: 'ready' as const,
      safeSummary: input.safeSummary,
      sourceRefs,
      createdAt: input.evidence.verifiedAt,
    }),
    backing: Object.freeze({
      kind: 'uri' as const,
      uri: input.uri,
    }),
  });
}

export function googleDriveArtifactDrafts(input: {
  evidence: CanonicalPluginEvidence;
  registration: Pick<GoogleDriveRegistration, 'pluginId' | 'toolName'>;
  result: Extract<ActionResult, { ok: true }>;
}): readonly JarvisArtifactDraft[] {
  if (
    input.registration.pluginId !== 'google-drive' ||
    input.registration.toolName !== 'document_create'
  ) {
    return Object.freeze([]);
  }
  const data = providerRecord(input.result.data);
  const id = fileId(data.id, 'plugin_result_invalid');
  const name = boundedExternalText(data.untrustedName, TITLE_LIMIT, true).text;
  if (!name || data.mimeType !== GOOGLE_DOCUMENT_MIME || data.created !== true) {
    throw driveFailure('plugin_result_invalid');
  }
  const uri = sourceUrl(id, GOOGLE_DOCUMENT_MIME);
  if (data.sourceUrl !== uri) throw driveFailure('plugin_result_invalid');
  return Object.freeze([
    providerResultDraft({
      evidence: input.evidence,
      title: `Google Drive document: ${name}`,
      safeSummary: 'Created Google Drive document; open Drive for current state.',
      content: JSON.stringify({
        id,
        name,
        mimeType: GOOGLE_DOCUMENT_MIME,
        sourceUrl: uri,
      }),
    }),
    linkDraft({
      evidence: input.evidence,
      title: 'Open Google Drive document',
      safeSummary: 'Open the created Google Drive document.',
      uri,
    }),
  ]);
}
