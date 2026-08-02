import { nativeFetch } from '@/lib/nativeFetch';
import type { ActionResult } from '@/lib/actions/types';
import type { JarvisRegisteredActionExecutor } from '@/lib/jarvis/actions/catalog';
import type { CanonicalPluginEvidence } from '@/lib/jarvis/artifactProducerAdapters';
import type { JarvisArtifactDraft } from '@/lib/jarvis/contracts';
import type { PluginTestResult } from './types';

type CredentialMap = Readonly<Record<string, string>>;
type GmailRegistration = Extract<JarvisRegisteredActionExecutor, { kind: 'plugin_tool' }>;

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const OPEN_GMAIL_URL = 'https://mail.google.com/';
const REQUIRED_SCOPE_LIST = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
] as const;
const REQUIRED_SCOPES = new Set(REQUIRED_SCOPE_LIST);
const RESOURCE_ID = /^[A-Za-z0-9_-]{1,256}$/;
const SHA256_FINGERPRINT = /^[0-9a-f]{64}$/;
const DESKTOP_CLIENT_ID = /^[A-Za-z0-9._-]{10,256}\.apps\.googleusercontent\.com$/;
const EMAIL =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const RFC_MESSAGE_ID = /^<[^<>\r\n]{1,500}>$/;
const TOKEN_RESPONSE_LIMIT = 64 * 1024;
const PROFILE_RESPONSE_LIMIT = 64 * 1024;
const LIST_RESPONSE_LIMIT = 256 * 1024;
const MESSAGE_RESPONSE_LIMIT = 1024 * 1024;
const THREAD_RESPONSE_LIMIT = 2 * 1024 * 1024;
const WRITE_RESPONSE_LIMIT = 256 * 1024;
const MESSAGE_LIMIT = 20;
const HEADER_LIMIT = 100;
const MIME_PART_LIMIT = 64;
const MIME_DEPTH_LIMIT = 8;
const INLINE_BODY_DATA_LIMIT = 400 * 1024;
const BODY_TEXT_LIMIT = 12_000;
const THREAD_BODY_TEXT_LIMIT = 6_000;
const SUBJECT_LIMIT = 200;
const ADDRESS_HEADER_LIMIT = 500;
const SNIPPET_LIMIT = 300;
const ARTIFACT_RECIPIENT_LIMIT = 3;
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

function gmailFailure(reason: string): Error {
  return new Error(`Gmail provider denied the operation: ${reason}.`);
}

function required(values: CredentialMap, field: string): string {
  const value = values[field]?.trim();
  if (!value || value.length > 8_192 || /[\r\n\u0000]/.test(value)) {
    throw gmailFailure(`${field}_unavailable`);
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
    throw gmailFailure(reason);
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
      throw gmailFailure(reason);
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
    throw gmailFailure('provider_response_invalid');
  }
  return value as Record<string, unknown>;
}

function providerArray(value: unknown, max: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > max) {
    throw gmailFailure('provider_response_invalid');
  }
  return value;
}

function count(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw gmailFailure('provider_response_invalid');
  }
  return value as number;
}

function resourceId(value: unknown, reason = 'resource_id_invalid'): string {
  if (typeof value !== 'string' || !RESOURCE_ID.test(value)) {
    throw gmailFailure(reason);
  }
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
    if (requiredValue) throw gmailFailure('provider_response_invalid');
    return { truncated: false };
  }
  if (typeof value !== 'string') throw gmailFailure('provider_response_invalid');
  const normalized = value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!normalized) {
    if (requiredValue) throw gmailFailure('provider_response_invalid');
    return { truncated: false };
  }
  const redacted = redactExternalSecrets(normalized);
  const characters = Array.from(redacted);
  return {
    text: characters.slice(0, limit).join(''),
    truncated: characters.length > limit,
  };
}

async function readBoundedBody(response: Response, limit: number): Promise<string> {
  const contentLength = response.headers.get('content-length');
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > limit)) {
    throw gmailFailure('provider_response_too_large');
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
        throw gmailFailure('provider_response_too_large');
      }
      result += decoder.decode(value, { stream: true });
    }
    result += decoder.decode();
    return result;
  } finally {
    reader.releaseLock();
  }
}

async function requestJson(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  maxBytes: number,
): Promise<unknown> {
  const response = await nativeFetch(url, {
    ...init,
    redirect: 'error',
    signal,
    timeoutMs: 12_000,
  });
  if (!response.ok) throw gmailFailure(`provider_rejected_${response.status}`);
  const body = await readBoundedBody(response, maxBytes);
  if (!body.trim()) throw gmailFailure('provider_response_invalid');
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw gmailFailure('provider_response_invalid');
  }
}

async function accessToken(values: CredentialMap, signal: AbortSignal): Promise<string> {
  const clientId = required(values, 'client_id');
  if (!DESKTOP_CLIENT_ID.test(clientId)) throw gmailFailure('client_id_invalid');
  const body = new URLSearchParams({
    client_id: clientId,
    refresh_token: required(values, 'refresh_token'),
    grant_type: 'refresh_token',
    scope: REQUIRED_SCOPE_LIST.join(' '),
  });
  const response = providerRecord(
    await requestJson(
      TOKEN_ENDPOINT,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
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
    throw gmailFailure('access_token_invalid');
  }
  if (response.token_type !== undefined && response.token_type !== 'Bearer') {
    throw gmailFailure('token_type_invalid');
  }
  if (typeof response.scope !== 'string') throw gmailFailure('scope_invalid');
  const granted = new Set(response.scope.split(/\s+/).filter(Boolean));
  if (
    granted.size !== REQUIRED_SCOPES.size ||
    [...REQUIRED_SCOPES].some((scope) => !granted.has(scope))
  ) {
    throw gmailFailure('required_scope_unavailable');
  }
  return token;
}

function gmailHeaders(token: string): Readonly<Record<string, string>> {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function gmailJson(
  path: string,
  input: {
    token: string;
    signal: AbortSignal;
    maxBytes: number;
    method?: 'GET' | 'POST';
    body?: string;
  },
): Promise<unknown> {
  return await requestJson(
    `${GMAIL_API}${path}`,
    {
      method: input.method ?? 'GET',
      headers: {
        ...gmailHeaders(input.token),
        ...(input.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(input.body === undefined ? {} : { body: input.body }),
    },
    input.signal,
    input.maxBytes,
  );
}

export async function testGmailConnection(input: {
  values: CredentialMap;
  signal: AbortSignal;
}): Promise<PluginTestResult> {
  const token = await accessToken(input.values, input.signal);
  const profile = providerRecord(
    await gmailJson('/profile', {
      token,
      signal: input.signal,
      maxBytes: PROFILE_RESPONSE_LIMIT,
    }),
  );
  const email = typeof profile.emailAddress === 'string' ? profile.emailAddress : '';
  if (
    !EMAIL.test(email) ||
    email.length > 254 ||
    profile.messagesTotal === undefined ||
    profile.threadsTotal === undefined
  ) {
    throw gmailFailure('provider_response_invalid');
  }
  count(profile.messagesTotal);
  count(profile.threadsTotal);
  return { ok: true, accountLabel: email };
}

function parameterResourceId(value: unknown): string {
  return resourceId(typeof value === 'string' ? value.trim() : value);
}

function queryParameters(
  params: Readonly<Record<string, unknown>>,
): Readonly<{ query: string; maxResults: number }> {
  const record = exactRecord(params, ['query', 'maxResults'], 'search_parameters_invalid');
  const query = typeof record.query === 'string' ? record.query.trim() : '';
  if (!query || Array.from(query).length > 500 || /[\u0000-\u001f\u007f]/.test(query)) {
    throw gmailFailure('search_parameters_invalid');
  }
  const maxResults = record.maxResults === undefined ? 10 : record.maxResults;
  if (
    !Number.isSafeInteger(maxResults) ||
    (maxResults as number) < 1 ||
    (maxResults as number) > MESSAGE_LIMIT
  ) {
    throw gmailFailure('search_parameters_invalid');
  }
  return { query, maxResults: maxResults as number };
}

function normalizedRecipients(value: unknown): readonly string[] {
  if (typeof value !== 'string' || /[\r\n\u0000]/.test(value)) {
    throw gmailFailure('recipient_invalid');
  }
  const recipients = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (
    recipients.length === 0 ||
    recipients.length > MESSAGE_LIMIT ||
    recipients.some((email) => email.length > 254 || !EMAIL.test(email))
  ) {
    throw gmailFailure('recipient_invalid');
  }
  return recipients;
}

function subject(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim().normalize('NFC') : '';
  if (
    !normalized ||
    Array.from(normalized).length > SUBJECT_LIMIT ||
    /[\r\n\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw gmailFailure('subject_invalid');
  }
  return normalized;
}

function body(value: unknown): string {
  if (typeof value !== 'string') throw gmailFailure('body_invalid');
  const normalized = value.normalize('NFC').replace(/\r\n?/g, '\n');
  if (
    !normalized.trim() ||
    Array.from(normalized).length > 50_000 ||
    /[\u0000\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)
  ) {
    throw gmailFailure('body_invalid');
  }
  return normalized;
}

function headersFromPayload(payloadValue: unknown): ReadonlyMap<string, string> {
  const payload = providerRecord(payloadValue);
  const candidates = providerArray(payload.headers ?? [], HEADER_LIMIT);
  const headers = new Map<string, string>();
  for (const candidate of candidates) {
    const header = providerRecord(candidate);
    if (typeof header.name !== 'string' || typeof header.value !== 'string') {
      throw gmailFailure('provider_response_invalid');
    }
    const name = header.name.toLowerCase();
    if (
      [
        'from',
        'reply-to',
        'to',
        'cc',
        'subject',
        'date',
        'message-id',
        'references',
        'content-disposition',
      ].includes(name) &&
      !headers.has(name)
    ) {
      headers.set(name, header.value);
    }
  }
  return headers;
}

function labels(value: unknown): readonly string[] {
  if (value === undefined) return [];
  return providerArray(value, 50).map((entry) => {
    if (typeof entry !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(entry)) {
      throw gmailFailure('provider_response_invalid');
    }
    return entry;
  });
}

function optionalExternal(value: unknown, limit: number): string | undefined {
  return boundedExternalText(value, limit, false).text;
}

function metadataMessage(value: unknown, expectedId?: string): Readonly<Record<string, unknown>> {
  const message = providerRecord(value);
  const id = resourceId(message.id, 'provider_response_invalid');
  if (expectedId && id !== expectedId) throw gmailFailure('provider_response_invalid');
  const threadId = resourceId(message.threadId, 'provider_response_invalid');
  const headers = headersFromPayload(message.payload);
  const result: Record<string, unknown> = {
    id,
    threadId,
    labelIds: labels(message.labelIds),
  };
  for (const [header, output, limit] of [
    ['from', 'untrustedFrom', ADDRESS_HEADER_LIMIT],
    ['to', 'untrustedTo', ADDRESS_HEADER_LIMIT],
    ['subject', 'untrustedSubject', SUBJECT_LIMIT],
    ['date', 'untrustedDate', 120],
  ] as const) {
    const normalized = optionalExternal(headers.get(header), limit);
    if (normalized !== undefined) result[output] = normalized;
  }
  const snippet = optionalExternal(message.snippet, SNIPPET_LIMIT);
  if (snippet !== undefined) result.untrustedSnippet = snippet;
  return result;
}

function decodeBase64UrlBytes(value: string): Uint8Array {
  if (value.length > INLINE_BODY_DATA_LIMIT || !/^[A-Za-z0-9_-]*={0,2}$/.test(value)) {
    throw gmailFailure('provider_response_invalid');
  }
  const unpadded = value.replace(/=+$/g, '');
  if (unpadded.length % 4 === 1) throw gmailFailure('provider_response_invalid');
  const padded =
    unpadded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (unpadded.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw gmailFailure('provider_response_invalid');
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeBase64Url(value: string): string {
  return new TextDecoder().decode(decodeBase64UrlBytes(value));
}

function stripHtml(value: string): string {
  return value
    .replace(
      /<(?:script|style|template|svg|iframe|object)\b[^>]*>[\s\S]*?<\/(?:script|style|template|svg|iframe|object)>/gi,
      ' ',
    )
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function collectMimeText(
  payloadValue: unknown,
  state: { parts: number; plain: string[]; html: string[] },
  depth = 0,
): void {
  if (depth > MIME_DEPTH_LIMIT || state.parts >= MIME_PART_LIMIT) {
    throw gmailFailure('provider_response_invalid');
  }
  state.parts += 1;
  const payload = providerRecord(payloadValue);
  if (payload.filename !== undefined && typeof payload.filename !== 'string') {
    throw gmailFailure('provider_response_invalid');
  }
  const disposition = headersFromPayload(payload).get('content-disposition');
  if (
    (typeof payload.filename === 'string' && payload.filename.trim().length > 0) ||
    disposition?.trim().toLowerCase().startsWith('attachment')
  ) {
    return;
  }
  const mimeType = typeof payload.mimeType === 'string' ? payload.mimeType.toLowerCase() : '';
  const bodyRecord = payload.body === undefined ? undefined : providerRecord(payload.body);
  if (bodyRecord?.data !== undefined) {
    if (typeof bodyRecord.data !== 'string') {
      throw gmailFailure('provider_response_invalid');
    }
    if (mimeType === 'text/plain') state.plain.push(decodeBase64Url(bodyRecord.data));
    else if (mimeType === 'text/html') {
      state.html.push(stripHtml(decodeBase64Url(bodyRecord.data)));
    }
  }
  if (payload.parts !== undefined) {
    for (const child of providerArray(payload.parts, MIME_PART_LIMIT - state.parts)) {
      collectMimeText(child, state, depth + 1);
    }
  }
}

function fullMessage(
  value: unknown,
  expectedId?: string,
  textLimit = BODY_TEXT_LIMIT,
): Readonly<Record<string, unknown>> {
  const message = providerRecord(value);
  const metadata = { ...metadataMessage(message, expectedId) };
  const state = { parts: 0, plain: [] as string[], html: [] as string[] };
  collectMimeText(message.payload, state);
  const selected = state.plain.length ? state.plain.join('\n\n') : state.html.join('\n\n');
  const bounded = boundedExternalText(selected, textLimit, false);
  return {
    contentTrust: 'external_untrusted',
    ...metadata,
    ...(bounded.text === undefined ? {} : { untrustedBodyExcerpt: bounded.text }),
    bodyTruncated: bounded.truncated,
    attachmentsRetrieved: false,
    remoteContentLoaded: false,
  };
}

function rfcHeader(headers: ReadonlyMap<string, string>, name: string): string {
  const value = headers.get(name);
  if (!value || /[\r\n\u0000]/.test(value)) {
    throw gmailFailure('provider_response_invalid');
  }
  return value;
}

function replyAddress(value: string): string {
  const angle = /<([^<>\s]+@[^<>\s]+)>/.exec(value);
  const candidate = (angle?.[1] ?? value).trim();
  if (!EMAIL.test(candidate) || candidate.length > 254) {
    throw gmailFailure('provider_response_invalid');
  }
  return candidate;
}

function messageIdHeader(value: string): string {
  const normalized = value.trim();
  if (!RFC_MESSAGE_ID.test(normalized)) throw gmailFailure('provider_response_invalid');
  return normalized;
}

function referencesHeader(value: string | undefined, messageId: string): string {
  const existing =
    value === undefined ? [] : value.trim().split(/\s+/).filter(Boolean).map(messageIdHeader);
  const combined = [...existing.filter((entry) => entry !== messageId), messageId];
  if (combined.join(' ').length > 2_000) throw gmailFailure('provider_response_invalid');
  return combined.join(' ');
}

function base64UrlEncode(value: string): string {
  return base64Utf8(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function foldedListHeader(name: 'To' | 'Cc' | 'Bcc', values: readonly string[]): string {
  return `${name}: ${values
    .map(
      (value, index) => `${index === 0 ? '' : ' '}${value}${index < values.length - 1 ? ',' : ''}`,
    )
    .join('\r\n')}`;
}

function foldedReferences(value: string): string {
  const ids = value.split(/\s+/).filter(Boolean);
  return `References: ${ids.map((id, index) => `${index === 0 ? '' : ' '}${id}`).join('\r\n')}`;
}

function assertRfcLineLengths(value: string): void {
  if (value.split('\r\n').some((line) => new TextEncoder().encode(line).byteLength > 998)) {
    throw gmailFailure('mime_line_too_long');
  }
}

function mimeMessage(input: {
  to: readonly string[];
  cc?: readonly string[];
  bcc?: readonly string[];
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const encodedBody = base64Utf8(input.body)
    .match(/.{1,76}/g)
    ?.join('\r\n');
  if (!encodedBody) throw gmailFailure('body_invalid');
  const lines = [
    foldedListHeader('To', input.to),
    ...(input.cc?.length ? [foldedListHeader('Cc', input.cc)] : []),
    ...(input.bcc?.length ? [foldedListHeader('Bcc', input.bcc)] : []),
    `Subject: ${input.subject}`,
    ...(input.inReplyTo ? [`In-Reply-To: ${input.inReplyTo}`] : []),
    ...(input.references ? [foldedReferences(input.references)] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    encodedBody,
  ];
  const mime = lines.join('\r\n');
  assertRfcLineLengths(mime);
  return base64UrlEncode(mime);
}

function draftResult(
  value: unknown,
): Readonly<{ draftId: string; messageId: string; threadId: string }> {
  const draft = providerRecord(value);
  const message = providerRecord(draft.message);
  return {
    draftId: resourceId(draft.id, 'provider_response_invalid'),
    messageId: resourceId(message.id, 'provider_response_invalid'),
    threadId: resourceId(message.threadId, 'provider_response_invalid'),
  };
}

function draftFingerprint(value: unknown): string {
  if (typeof value !== 'string' || !SHA256_FINGERPRINT.test(value)) {
    throw gmailFailure('draft_fingerprint_invalid');
  }
  return value;
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  const bytes = new Uint8Array(value.byteLength);
  bytes.set(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes.buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readDraftSnapshot(input: {
  token: string;
  signal: AbortSignal;
  draftId: string;
}): Promise<
  Readonly<{
    draftId: string;
    messageId: string;
    threadId: string;
    draftFingerprint: string;
    raw: string;
  }>
> {
  const response = providerRecord(
    await gmailJson(`/drafts/${encodeURIComponent(input.draftId)}?format=raw`, {
      token: input.token,
      signal: input.signal,
      maxBytes: WRITE_RESPONSE_LIMIT,
    }),
  );
  const coordinates = draftResult(response);
  if (coordinates.draftId !== input.draftId) {
    throw gmailFailure('provider_response_invalid');
  }
  const message = providerRecord(response.message);
  if (typeof message.raw !== 'string') throw gmailFailure('provider_response_invalid');
  return {
    ...coordinates,
    raw: message.raw,
    draftFingerprint: await sha256Hex(decodeBase64UrlBytes(message.raw)),
  };
}

async function createDraft(input: {
  token: string;
  signal: AbortSignal;
  raw: string;
  threadId?: string;
}): Promise<
  Readonly<{
    draftId: string;
    messageId: string;
    threadId: string;
    draftFingerprint: string;
  }>
> {
  const response = await gmailJson('/drafts', {
    token: input.token,
    signal: input.signal,
    maxBytes: WRITE_RESPONSE_LIMIT,
    method: 'POST',
    body: JSON.stringify({
      message: {
        raw: input.raw,
        ...(input.threadId === undefined ? {} : { threadId: input.threadId }),
      },
    }),
  });
  const created = draftResult(response);
  const snapshot = await readDraftSnapshot({
    token: input.token,
    signal: input.signal,
    draftId: created.draftId,
  });
  if (snapshot.messageId !== created.messageId || snapshot.threadId !== created.threadId) {
    throw gmailFailure('provider_response_invalid');
  }
  const { raw: _raw, ...safeSnapshot } = snapshot;
  return safeSnapshot;
}

export async function runGmailTool(input: {
  toolName: string;
  params: Readonly<Record<string, unknown>>;
  values: CredentialMap;
  signal: AbortSignal;
}): Promise<ActionResult> {
  if (input.toolName === 'message_search') {
    queryParameters(input.params);
  } else if (input.toolName === 'message_read') {
    const params = exactRecord(input.params, ['messageId'], 'message_parameters_invalid');
    parameterResourceId(params.messageId);
  } else if (input.toolName === 'thread_read') {
    const params = exactRecord(input.params, ['threadId'], 'thread_parameters_invalid');
    parameterResourceId(params.threadId);
  } else if (input.toolName === 'draft_create') {
    const params = exactRecord(
      input.params,
      ['to', 'cc', 'bcc', 'subject', 'body'],
      'draft_parameters_invalid',
    );
    normalizedRecipients(params.to);
    if (params.cc !== undefined) normalizedRecipients(params.cc);
    if (params.bcc !== undefined) normalizedRecipients(params.bcc);
    subject(params.subject);
    body(params.body);
  } else if (input.toolName === 'reply_draft_create') {
    const params = exactRecord(input.params, ['messageId', 'body'], 'reply_parameters_invalid');
    parameterResourceId(params.messageId);
    body(params.body);
  } else if (input.toolName === 'draft_send') {
    const params = exactRecord(
      input.params,
      ['draftId', 'draftFingerprint'],
      'send_parameters_invalid',
    );
    parameterResourceId(params.draftId);
    draftFingerprint(params.draftFingerprint);
  } else {
    throw gmailFailure('tool_unavailable');
  }
  const token = await accessToken(input.values, input.signal);

  if (input.toolName === 'message_search') {
    const params = queryParameters(input.params);
    const search = new URLSearchParams({
      q: params.query,
      maxResults: String(params.maxResults),
      includeSpamTrash: 'false',
    });
    const list = providerRecord(
      await gmailJson(`/messages?${search.toString()}`, {
        token,
        signal: input.signal,
        maxBytes: LIST_RESPONSE_LIMIT,
      }),
    );
    const messageRefs =
      list.messages === undefined ? [] : providerArray(list.messages, params.maxResults);
    const messages: Readonly<Record<string, unknown>>[] = [];
    for (const candidate of messageRefs) {
      const reference = providerRecord(candidate);
      const id = resourceId(reference.id, 'provider_response_invalid');
      const threadId = resourceId(reference.threadId, 'provider_response_invalid');
      const metadataQuery = new URLSearchParams();
      metadataQuery.set('format', 'metadata');
      for (const header of ['From', 'To', 'Subject', 'Date']) {
        metadataQuery.append('metadataHeaders', header);
      }
      const metadata = metadataMessage(
        await gmailJson(`/messages/${encodeURIComponent(id)}?${metadataQuery.toString()}`, {
          token,
          signal: input.signal,
          maxBytes: LIST_RESPONSE_LIMIT,
        }),
        id,
      );
      if (metadata.threadId !== threadId) {
        throw gmailFailure('provider_response_invalid');
      }
      messages.push(metadata);
    }
    const threadsSelected = new Set(messages.map((message) => message.threadId)).size;
    const resultSizeEstimate =
      list.resultSizeEstimate === undefined ? messages.length : count(list.resultSizeEstimate);
    return {
      ok: true,
      summary: `${messages.length} Gmail messages examined across ${threadsSelected} selected threads.`,
      data: {
        contentTrust: 'external_untrusted',
        queryApplied: true,
        messagesExamined: messages.length,
        threadsSelected,
        resultSizeEstimate,
        messages,
      },
    };
  }

  if (input.toolName === 'message_read') {
    const params = exactRecord(input.params, ['messageId'], 'message_parameters_invalid');
    const messageId = parameterResourceId(params.messageId);
    const message = fullMessage(
      await gmailJson(`/messages/${encodeURIComponent(messageId)}?format=full`, {
        token,
        signal: input.signal,
        maxBytes: MESSAGE_RESPONSE_LIMIT,
      }),
      messageId,
    );
    return {
      ok: true,
      summary: `Gmail message ${messageId} retrieved.`,
      data: message,
    };
  }

  if (input.toolName === 'thread_read') {
    const params = exactRecord(input.params, ['threadId'], 'thread_parameters_invalid');
    const threadId = parameterResourceId(params.threadId);
    const thread = providerRecord(
      await gmailJson(`/threads/${encodeURIComponent(threadId)}?format=full`, {
        token,
        signal: input.signal,
        maxBytes: THREAD_RESPONSE_LIMIT,
      }),
    );
    if (resourceId(thread.id, 'provider_response_invalid') !== threadId) {
      throw gmailFailure('provider_response_invalid');
    }
    const messages = providerArray(thread.messages, MESSAGE_LIMIT).map((candidate) =>
      fullMessage(candidate, undefined, THREAD_BODY_TEXT_LIMIT),
    );
    if (messages.some((message) => message.threadId !== threadId)) {
      throw gmailFailure('provider_response_invalid');
    }
    return {
      ok: true,
      summary: `${messages.length} Gmail messages retrieved from thread ${threadId}.`,
      data: {
        contentTrust: 'external_untrusted',
        threadId,
        messagesExamined: messages.length,
        messages,
      },
    };
  }

  if (input.toolName === 'draft_create') {
    const params = exactRecord(
      input.params,
      ['to', 'cc', 'bcc', 'subject', 'body'],
      'draft_parameters_invalid',
    );
    const to = normalizedRecipients(params.to);
    const cc = params.cc === undefined ? undefined : normalizedRecipients(params.cc);
    const bcc = params.bcc === undefined ? undefined : normalizedRecipients(params.bcc);
    const normalizedSubject = subject(params.subject);
    const normalizedBody = body(params.body);
    const created = await createDraft({
      token,
      signal: input.signal,
      raw: mimeMessage({
        to,
        ...(cc === undefined ? {} : { cc }),
        ...(bcc === undefined ? {} : { bcc }),
        subject: normalizedSubject,
        body: normalizedBody,
      }),
    });
    const recipientCount = to.length + (cc?.length ?? 0) + (bcc?.length ?? 0);
    const recipients = [...to, ...(cc ?? []), ...(bcc ?? [])];
    return {
      ok: true,
      summary: `Gmail draft created for ${recipientCount} recipient${recipientCount === 1 ? '' : 's'}.`,
      data: {
        ...created,
        untrustedSubject: normalizedSubject,
        recipientCount,
        untrustedRecipients: recipients.slice(0, ARTIFACT_RECIPIENT_LIMIT),
        recipientsTruncated: recipients.length > ARTIFACT_RECIPIENT_LIMIT,
        openGmailUrl: OPEN_GMAIL_URL,
      },
    };
  }

  if (input.toolName === 'reply_draft_create') {
    const params = exactRecord(input.params, ['messageId', 'body'], 'reply_parameters_invalid');
    const selectedMessageId = parameterResourceId(params.messageId);
    const normalizedBody = body(params.body);
    const original = providerRecord(
      await gmailJson(
        `/messages/${encodeURIComponent(selectedMessageId)}?format=metadata&metadataHeaders=From&metadataHeaders=Reply-To&metadataHeaders=Subject&metadataHeaders=Message-ID&metadataHeaders=References`,
        {
          token,
          signal: input.signal,
          maxBytes: LIST_RESPONSE_LIMIT,
        },
      ),
    );
    if (resourceId(original.id, 'provider_response_invalid') !== selectedMessageId) {
      throw gmailFailure('provider_response_invalid');
    }
    const threadId = resourceId(original.threadId, 'provider_response_invalid');
    const headers = headersFromPayload(original.payload);
    const to = replyAddress(headers.get('reply-to') ?? rfcHeader(headers, 'from'));
    const originalSubject = subject(rfcHeader(headers, 'subject'));
    const replySubject = originalSubject;
    const inReplyTo = messageIdHeader(rfcHeader(headers, 'message-id'));
    const references = referencesHeader(headers.get('references'), inReplyTo);
    const created = await createDraft({
      token,
      signal: input.signal,
      threadId,
      raw: mimeMessage({
        to: [to],
        subject: replySubject,
        body: normalizedBody,
        inReplyTo,
        references,
      }),
    });
    if (created.threadId !== threadId) throw gmailFailure('provider_response_invalid');
    return {
      ok: true,
      summary: 'Gmail reply draft created for 1 recipient.',
      data: {
        ...created,
        untrustedSubject: replySubject,
        recipientCount: 1,
        untrustedRecipients: [to],
        recipientsTruncated: false,
        openGmailUrl: OPEN_GMAIL_URL,
      },
    };
  }

  if (input.toolName === 'draft_send') {
    const params = exactRecord(
      input.params,
      ['draftId', 'draftFingerprint'],
      'send_parameters_invalid',
    );
    const draftId = parameterResourceId(params.draftId);
    const approvedFingerprint = draftFingerprint(params.draftFingerprint);
    const snapshot = await readDraftSnapshot({
      token,
      signal: input.signal,
      draftId,
    });
    if (snapshot.draftFingerprint !== approvedFingerprint) {
      throw gmailFailure('draft_changed_since_approval');
    }
    const sent = providerRecord(
      await gmailJson('/drafts/send', {
        token,
        signal: input.signal,
        maxBytes: WRITE_RESPONSE_LIMIT,
        method: 'POST',
        body: JSON.stringify({
          id: draftId,
          message: {
            raw: snapshot.raw,
            threadId: snapshot.threadId,
          },
        }),
      }),
    );
    return {
      ok: true,
      summary: `Approved unchanged Gmail draft ${draftId} sent.`,
      data: {
        draftId,
        draftFingerprint: approvedFingerprint,
        messageId: resourceId(sent.id, 'provider_response_invalid'),
        threadId: resourceId(sent.threadId, 'provider_response_invalid'),
        sourceDraftDeletedByProvider: true,
        openGmailUrl: OPEN_GMAIL_URL,
      },
    };
  }
  throw gmailFailure('tool_unavailable');
}

function gmailLinkDraft(input: {
  evidence: CanonicalPluginEvidence;
  title: string;
  safeSummary: string;
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
      uri: OPEN_GMAIL_URL,
    }),
  });
}

function gmailProviderResultDraft(input: {
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

export function gmailArtifactDrafts(input: {
  evidence: CanonicalPluginEvidence;
  registration: GmailRegistration;
  result: Extract<ActionResult, { ok: true }>;
}): readonly JarvisArtifactDraft[] {
  if (input.registration.pluginId !== 'gmail') return Object.freeze([]);
  const data = providerRecord(input.result.data);
  if (
    input.registration.toolName === 'draft_create' ||
    input.registration.toolName === 'reply_draft_create'
  ) {
    resourceId(data.draftId, 'plugin_result_invalid');
    const normalizedSubject = boundedExternalText(data.untrustedSubject, SUBJECT_LIMIT, true).text;
    if (!normalizedSubject) throw gmailFailure('plugin_result_invalid');
    const recipientCount = count(data.recipientCount);
    if (recipientCount < 1) throw gmailFailure('plugin_result_invalid');
    const approvedFingerprint = draftFingerprint(data.draftFingerprint);
    const recipients = providerArray(data.untrustedRecipients, ARTIFACT_RECIPIENT_LIMIT).map(
      (candidate) => {
        if (typeof candidate !== 'string') throw gmailFailure('plugin_result_invalid');
        return normalizedRecipients(candidate)[0]!;
      },
    );
    if (recipients.length === 0 || typeof data.recipientsTruncated !== 'boolean') {
      throw gmailFailure('plugin_result_invalid');
    }
    const recipientSummary = `${recipients.join(', ')}${
      data.recipientsTruncated ? ` +${recipientCount - recipients.length} more` : ''
    }`;
    return Object.freeze([
      gmailProviderResultDraft({
        evidence: input.evidence,
        title: `Gmail draft: ${normalizedSubject}`,
        safeSummary: `Draft snapshot for ${recipientSummary}; open Gmail for current state.`,
        content: JSON.stringify({
          draftId: data.draftId,
          draftFingerprint: approvedFingerprint,
          subject: normalizedSubject,
          recipients,
          recipientCount,
          recipientsTruncated: data.recipientsTruncated,
        }),
      }),
      gmailLinkDraft({
        evidence: input.evidence,
        title: 'Open Gmail',
        safeSummary: 'Open Gmail to review the draft’s current state.',
      }),
    ]);
  }
  if (input.registration.toolName === 'draft_send') {
    resourceId(data.draftId, 'plugin_result_invalid');
    resourceId(data.messageId, 'plugin_result_invalid');
    draftFingerprint(data.draftFingerprint);
    return Object.freeze([
      gmailLinkDraft({
        evidence: input.evidence,
        title: 'Gmail message sent',
        safeSummary: 'Approved Gmail draft sent.',
      }),
    ]);
  }
  return Object.freeze([]);
}
