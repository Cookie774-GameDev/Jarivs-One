import { nativeFetch } from '@/lib/nativeFetch';
import type { ActionResult } from '@/lib/actions/types';
import type { JarvisRegisteredActionExecutor } from '@/lib/jarvis/actions/catalog';
import type { CanonicalPluginEvidence } from '@/lib/jarvis/artifactProducerAdapters';
import type { JarvisArtifactDraft } from '@/lib/jarvis/contracts';
import type { PluginTestResult } from './types';

type CredentialMap = Readonly<Record<string, string>>;
type CanvaRegistration = Extract<JarvisRegisteredActionExecutor, { kind: 'plugin_tool' }>;

export type CanvaCredentialRotation = (input: {
  fieldId: 'refresh_token';
  expectedValue: string;
  nextValue: string;
}) => Promise<void>;

const TOKEN_ENDPOINT = 'https://api.canva.com/rest/v1/oauth/token';
const TOKEN_INTROSPECTION_ENDPOINT = 'https://api.canva.com/rest/v1/oauth/introspect';
const CANVA_API = 'https://api.canva.com/rest/v1';
const RESPONSE_LIMIT = 256 * 1024;
const TOKEN_RESPONSE_LIMIT = 64 * 1024;
const DESIGN_LIMIT = 20;
const QUERY_LIMIT = 255;
const TITLE_LIMIT = 255;
const AUTOFILL_JSON_LIMIT = 50_000;
const AUTOFILL_FIELD_LIMIT = 50;
const AUTOFILL_TEXT_LIMIT = 10_000;
const OPAQUE_ID = /^[A-Za-z0-9._~-]{3,512}$/;
const PRESET_NAMES = new Set(['doc', 'email', 'presentation', 'whiteboard']);
const DESIGN_TYPE = /^[a-z][a-z0-9_]{0,63}$/;
const SECRET_PATTERNS: readonly RegExp[] = [
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
  /\b(?:authorization|cookie|set[-_ ]?cookie|x[-_ ]?api[-_ ]?key|api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|client[-_ ]?secret|password|credential|secret)\b\s*(?:[:=]|\bis\b)\s*(?:"[^"\r\n]+"|'[^'\r\n]+'|[^\s,;}]+)/gi,
];

function canvaFailure(reason: string): Error {
  return new Error(`Canva provider denied the operation: ${reason}.`);
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
    throw canvaFailure(reason);
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
      throw canvaFailure(`${reason}_unknown_fields`);
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
    throw canvaFailure('provider_response_invalid');
  }
  return value as Record<string, unknown>;
}

function providerArray(value: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw canvaFailure('provider_response_invalid');
  }
  return value;
}

function credential(values: CredentialMap, field: string, maximum: number): string {
  const value = values[field];
  if (
    typeof value !== 'string' ||
    !value ||
    value !== value.trim() ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw canvaFailure(`${field}_unavailable`);
  }
  return value;
}

function redactExternalSecrets(value: string): string {
  let result = value;
  for (const pattern of SECRET_PATTERNS) result = result.replace(pattern, '[redacted secret]');
  return result;
}

function publicText(value: unknown, limit: number, required: boolean): string | undefined {
  if (value === null || value === undefined) {
    if (required) throw canvaFailure('provider_response_invalid');
    return undefined;
  }
  if (typeof value !== 'string') throw canvaFailure('provider_response_invalid');
  const normalized = value
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) {
    if (required) throw canvaFailure('provider_response_invalid');
    return undefined;
  }
  return Array.from(redactExternalSecrets(normalized)).slice(0, limit).join('');
}

function exactTitle(value: unknown, reason: string): string {
  if (typeof value !== 'string') throw canvaFailure(reason);
  const normalized = value.normalize('NFC');
  if (
    !normalized ||
    Array.from(normalized).length > TITLE_LIMIT ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw canvaFailure(reason);
  }
  return normalized;
}

async function readBoundedBody(response: Response, limit: number): Promise<string> {
  const contentLength = response.headers.get('content-length');
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > limit)) {
    throw canvaFailure('provider_response_too_large');
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
        throw canvaFailure('provider_response_too_large');
      }
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function requestJson(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  limit: number,
): Promise<unknown> {
  const response = await nativeFetch(url, {
    ...init,
    redirect: 'error',
    signal,
    timeoutMs: 12_000,
  });
  if (!response.ok) throw canvaFailure(`provider_rejected_${response.status}`);
  const body = await readBoundedBody(response, limit);
  if (!body.trim()) throw canvaFailure('provider_response_invalid');
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw canvaFailure('provider_response_invalid');
  }
}

function basicAuthorization(clientId: string, clientSecret: string): string {
  if (clientId.includes(':')) throw canvaFailure('client_id_invalid');
  const bytes = new TextEncoder().encode(`${clientId}:${clientSecret}`);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

type CanvaSession = Readonly<{ token: string; scopes: ReadonlySet<string> }>;

async function accessToken(input: {
  values: CredentialMap;
  signal: AbortSignal;
  rotateCredential: CanvaCredentialRotation;
}): Promise<CanvaSession> {
  const clientId = credential(input.values, 'client_id', 512);
  const clientSecret = credential(input.values, 'client_secret', 8_192);
  const currentRefreshToken = credential(input.values, 'refresh_token', 8_192);
  const response = providerRecord(
    await requestJson(
      TOKEN_ENDPOINT,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: basicAuthorization(clientId, clientSecret),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: currentRefreshToken,
        }),
      },
      input.signal,
      TOKEN_RESPONSE_LIMIT,
    ),
  );
  const token = response.access_token;
  const nextRefreshToken = response.refresh_token;
  const expiresIn = response.expires_in;
  if (
    typeof token !== 'string' ||
    token.length < 10 ||
    token.length > 4_096 ||
    /[\s\u0000]/.test(token)
  ) {
    throw canvaFailure('access_token_invalid');
  }
  if (
    typeof nextRefreshToken !== 'string' ||
    nextRefreshToken.length < 10 ||
    nextRefreshToken.length > 8_192 ||
    /[\s\u0000]/.test(nextRefreshToken) ||
    nextRefreshToken === currentRefreshToken
  ) {
    throw canvaFailure('refresh_token_invalid');
  }
  if (
    response.token_type !== 'Bearer' ||
    !Number.isSafeInteger(expiresIn) ||
    (expiresIn as number) < 1 ||
    (expiresIn as number) > 604_800
  ) {
    throw canvaFailure('token_response_invalid');
  }
  try {
    await input.rotateCredential({
      fieldId: 'refresh_token',
      expectedValue: currentRefreshToken,
      nextValue: nextRefreshToken,
    });
  } catch {
    throw canvaFailure('credential_rotation_failed');
  }
  let rawScope = response.scope;
  if (rawScope === undefined) {
    const introspection = providerRecord(
      await requestJson(
        TOKEN_INTROSPECTION_ENDPOINT,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: basicAuthorization(clientId, clientSecret),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ token }),
        },
        input.signal,
        TOKEN_RESPONSE_LIMIT,
      ),
    );
    if (
      introspection.active !== true ||
      (introspection.client !== undefined && introspection.client !== clientId)
    ) {
      throw canvaFailure('token_introspection_invalid');
    }
    rawScope = introspection.scope;
  }
  if (typeof rawScope !== 'string') throw canvaFailure('scope_invalid');
  const scopes = new Set(rawScope.split(/\s+/).filter(Boolean));
  if (scopes.size === 0) throw canvaFailure('scope_invalid');
  return { token, scopes };
}

function requireScope(session: CanvaSession, scope: string): void {
  if (!session.scopes.has(scope)) throw canvaFailure('required_scope_unavailable');
}

function apiJson(
  path: string,
  session: CanvaSession,
  signal: AbortSignal,
  init: Omit<RequestInit, 'headers'> & { headers?: Readonly<Record<string, string>> } = {},
): Promise<unknown> {
  return requestJson(
    `${CANVA_API}${path}`,
    {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${session.token}`,
        ...init.headers,
      },
    },
    signal,
    RESPONSE_LIMIT,
  );
}

function opaqueId(value: unknown): string {
  if (typeof value !== 'string' || !OPAQUE_ID.test(value)) {
    throw canvaFailure('provider_response_invalid');
  }
  return value;
}

function canvaUrl(value: unknown, mode: 'edit' | 'view'): string {
  if (typeof value !== 'string' || value.length > 2_048) {
    throw canvaFailure('provider_response_invalid');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw canvaFailure('provider_response_invalid');
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'www.canva.com' ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !new RegExp(`^/api/design/[A-Za-z0-9._~!$&'()+,;=:@%-]{3,1024}/${mode}/?$`).test(url.pathname)
  ) {
    throw canvaFailure('provider_response_invalid');
  }
  return url.toString();
}

function timestamp(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) > 253_402_300_799
  ) {
    throw canvaFailure('provider_response_invalid');
  }
  return new Date((value as number) * 1_000).toISOString();
}

type PublicDesign = Readonly<{
  id: string;
  untrustedTitle: string;
  designTypes: readonly string[];
  pageCount?: number;
  createdAt?: string;
  updatedAt?: string;
  editUrl: string;
  viewUrl: string;
  exactTitle?: string;
}>;

function normalizedDesign(value: unknown, missingTitle = 'Untitled Canva design'): PublicDesign {
  const design = providerRecord(value);
  const urls = providerRecord(design.urls);
  const rawTypes = design.design_types === undefined ? [] : providerArray(design.design_types, 8);
  const designTypes = rawTypes.map((item) => {
    if (typeof item !== 'string' || !DESIGN_TYPE.test(item)) {
      throw canvaFailure('provider_response_invalid');
    }
    return item;
  });
  const pageCount = design.page_count;
  if (
    pageCount !== undefined &&
    (!Number.isSafeInteger(pageCount) ||
      (pageCount as number) < 0 ||
      (pageCount as number) > 1_000_000)
  ) {
    throw canvaFailure('provider_response_invalid');
  }
  const exact =
    design.title === undefined ? undefined : exactTitle(design.title, 'provider_response_invalid');
  return {
    id: opaqueId(design.id),
    untrustedTitle: publicText(exact ?? missingTitle, TITLE_LIMIT, true) as string,
    designTypes,
    ...(pageCount === undefined ? {} : { pageCount: pageCount as number }),
    ...(timestamp(design.created_at) === undefined
      ? {}
      : { createdAt: timestamp(design.created_at) }),
    ...(timestamp(design.updated_at) === undefined
      ? {}
      : { updatedAt: timestamp(design.updated_at) }),
    editUrl: canvaUrl(urls.edit_url, 'edit'),
    viewUrl: canvaUrl(urls.view_url, 'view'),
    ...(exact === undefined ? {} : { exactTitle: exact }),
  };
}

function publicDesign(design: PublicDesign): Omit<PublicDesign, 'exactTitle'> {
  const { exactTitle: _exactTitle, ...result } = design;
  return result;
}

function searchParameters(value: Readonly<Record<string, unknown>>): {
  query: string;
  maxResults: number;
} {
  const record = exactRecord(value, ['query', 'maxResults'], 'search_parameters_invalid');
  const query = typeof record.query === 'string' ? record.query.normalize('NFC').trim() : '';
  if (!query || Array.from(query).length > QUERY_LIMIT || /[\u0000-\u001f\u007f]/.test(query)) {
    throw canvaFailure('query_invalid');
  }
  const maxResults = record.maxResults ?? 10;
  if (
    !Number.isSafeInteger(maxResults) ||
    (maxResults as number) < 1 ||
    (maxResults as number) > DESIGN_LIMIT
  ) {
    throw canvaFailure('max_results_invalid');
  }
  return { query, maxResults: maxResults as number };
}

function createParameters(value: Readonly<Record<string, unknown>>): {
  title: string;
  preset: string;
} {
  const record = exactRecord(value, ['title', 'preset'], 'create_parameters_invalid');
  const title = exactTitle(record.title, 'title_invalid');
  if (typeof record.preset !== 'string' || !PRESET_NAMES.has(record.preset)) {
    throw canvaFailure('preset_invalid');
  }
  return { title, preset: record.preset };
}

function readParameters(value: Readonly<Record<string, unknown>>): { designId: string } {
  const record = exactRecord(value, ['designId'], 'read_parameters_invalid');
  return { designId: opaqueId(record.designId) };
}

function brandTemplateDatasetParameters(value: Readonly<Record<string, unknown>>): {
  brandTemplateId: string;
} {
  const record = exactRecord(value, ['brandTemplateId'], 'dataset_parameters_invalid');
  return { brandTemplateId: opaqueId(record.brandTemplateId) };
}

function autofillJobParameters(value: Readonly<Record<string, unknown>>): { jobId: string } {
  const record = exactRecord(value, ['jobId'], 'autofill_job_parameters_invalid');
  return { jobId: opaqueId(record.jobId) };
}

function datasetFieldName(value: unknown): string {
  if (typeof value !== 'string') throw canvaFailure('dataset_field_invalid');
  const normalized = value.normalize('NFC');
  if (
    !normalized ||
    normalized !== value ||
    Array.from(normalized).length > 255 ||
    /[\u0000-\u001f\u007f]/.test(normalized) ||
    redactExternalSecrets(normalized) !== normalized
  ) {
    throw canvaFailure('dataset_field_invalid');
  }
  return normalized;
}

function autofillParameters(value: Readonly<Record<string, unknown>>): {
  brandTemplateId: string;
  title: string;
  data: Readonly<Record<string, Readonly<{ type: 'text'; text: string }>>>;
} {
  const record = exactRecord(
    value,
    ['brandTemplateId', 'title', 'textDataJson'],
    'autofill_parameters_invalid',
  );
  const brandTemplateId = opaqueId(record.brandTemplateId);
  const title = exactTitle(record.title, 'title_invalid');
  if (
    typeof record.textDataJson !== 'string' ||
    !record.textDataJson ||
    record.textDataJson.length > AUTOFILL_JSON_LIMIT
  ) {
    throw canvaFailure('autofill_data_invalid');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(record.textDataJson);
  } catch {
    throw canvaFailure('autofill_data_invalid');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.getPrototypeOf(parsed) !== Object.prototype
  ) {
    throw canvaFailure('autofill_data_invalid');
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length < 1 || entries.length > AUTOFILL_FIELD_LIMIT) {
    throw canvaFailure('autofill_data_invalid');
  }
  const data: Record<string, Readonly<{ type: 'text'; text: string }>> = Object.create(
    null,
  ) as Record<string, Readonly<{ type: 'text'; text: string }>>;
  for (const [rawName, rawText] of entries) {
    const name = datasetFieldName(rawName);
    if (typeof rawText !== 'string') throw canvaFailure('autofill_data_invalid');
    const text = rawText.normalize('NFC').replace(/\r\n?/g, '\n');
    if (
      Array.from(text).length > AUTOFILL_TEXT_LIMIT ||
      /[\u0000\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)
    ) {
      throw canvaFailure('autofill_data_invalid');
    }
    data[name] = Object.freeze({ type: 'text', text });
  }
  return { brandTemplateId, title, data: Object.freeze(data) };
}

function normalizedDataset(value: unknown): ReadonlyArray<
  Readonly<{
    untrustedName: string;
    type: 'text' | 'image' | 'chart' | 'sheet';
    supportedForGeneration: boolean;
  }>
> {
  const dataset = providerRecord(value);
  const entries = Object.entries(dataset);
  if (entries.length > 100) throw canvaFailure('provider_response_invalid');
  return entries
    .map(([rawName, rawDefinition]) => {
      const name = datasetFieldName(rawName);
      const definition = providerRecord(rawDefinition);
      if (
        typeof definition.type !== 'string' ||
        !['text', 'image', 'chart', 'sheet'].includes(definition.type)
      ) {
        throw canvaFailure('provider_response_invalid');
      }
      return {
        untrustedName: name,
        type: definition.type as 'text' | 'image' | 'chart' | 'sheet',
        supportedForGeneration: definition.type === 'text',
      };
    })
    .sort((left, right) =>
      left.untrustedName < right.untrustedName
        ? -1
        : left.untrustedName > right.untrustedName
          ? 1
          : 0,
    );
}

type AutofillJob =
  | Readonly<{ jobId: string; status: 'in_progress' }>
  | Readonly<{ jobId: string; status: 'success'; design: PublicDesign }>;

function normalizedAutofillJob(
  value: unknown,
  expectedJobId?: string,
  expectedTitle?: string,
): AutofillJob {
  const job = providerRecord(providerRecord(value).job);
  const jobId = opaqueId(job.id);
  if (expectedJobId !== undefined && jobId !== expectedJobId) {
    throw canvaFailure('provider_response_invalid');
  }
  if (job.status === 'failed') throw canvaFailure('autofill_job_failed');
  if (job.status === 'in_progress') return { jobId, status: 'in_progress' };
  if (job.status !== 'success') throw canvaFailure('provider_response_invalid');
  const result = providerRecord(job.result);
  if (result.type !== 'create_design') throw canvaFailure('provider_response_invalid');
  const design = normalizedDesign(result.design, expectedTitle);
  if (
    expectedTitle !== undefined &&
    design.exactTitle !== undefined &&
    design.exactTitle !== expectedTitle
  ) {
    throw canvaFailure('provider_response_invalid');
  }
  return { jobId, status: 'success', design };
}

function normalizedBrandTemplate(value: unknown): Readonly<{
  id: string;
  untrustedTitle: string;
  createdAt?: string;
  updatedAt?: string;
}> {
  const template = providerRecord(value);
  const exact = exactTitle(template.title, 'provider_response_invalid');
  const createdAt = timestamp(template.created_at);
  const updatedAt = timestamp(template.updated_at);
  return {
    id: opaqueId(template.id),
    untrustedTitle: publicText(exact, TITLE_LIMIT, true) as string,
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
  };
}

function continuationPresent(value: unknown): boolean {
  if (value === undefined) return false;
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 4_096 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw canvaFailure('provider_response_invalid');
  }
  return true;
}

export async function testCanvaConnection(input: {
  values: CredentialMap;
  signal: AbortSignal;
  rotateCredential: CanvaCredentialRotation;
}): Promise<PluginTestResult> {
  const session = await accessToken(input);
  requireScope(session, 'profile:read');
  const response = providerRecord(await apiJson('/users/me/profile', session, input.signal));
  const profile = providerRecord(response.profile);
  const accountLabel = publicText(profile.display_name, 160, true);
  return { ok: true, accountLabel };
}

export async function runCanvaTool(input: {
  toolName: string;
  params: Readonly<Record<string, unknown>>;
  values: CredentialMap;
  signal: AbortSignal;
  rotateCredential: CanvaCredentialRotation;
}): Promise<ActionResult> {
  const search = input.toolName === 'designs_search' ? searchParameters(input.params) : undefined;
  const read = input.toolName === 'design_read' ? readParameters(input.params) : undefined;
  const templates =
    input.toolName === 'brand_templates_search' ? searchParameters(input.params) : undefined;
  const dataset =
    input.toolName === 'brand_template_dataset_read'
      ? brandTemplateDatasetParameters(input.params)
      : undefined;
  const autofill =
    input.toolName === 'design_autofill' ? autofillParameters(input.params) : undefined;
  const autofillJob =
    input.toolName === 'autofill_job_read' ? autofillJobParameters(input.params) : undefined;
  const create = input.toolName === 'design_create' ? createParameters(input.params) : undefined;
  if (!search && !read && !templates && !dataset && !autofill && !autofillJob && !create) {
    throw canvaFailure('tool_unavailable');
  }

  const session = await accessToken(input);
  if (search) {
    requireScope(session, 'design:meta:read');
    const query = new URLSearchParams({
      query: search.query,
      limit: String(search.maxResults),
      ownership: 'any',
      sort_by: 'relevance',
    });
    const response = providerRecord(
      await apiJson(`/designs?${query.toString()}`, session, input.signal),
    );
    const candidates =
      response.items === undefined ? [] : providerArray(response.items, search.maxResults);
    const designs = candidates.map((candidate) => publicDesign(normalizedDesign(candidate)));
    const count = designs.length;
    return {
      ok: true,
      summary: `${count} Canva design${count === 1 ? '' : 's'} examined; ${count} selected result${
        count === 1 ? '' : 's'
      } returned.`,
      data: {
        contentTrust: 'external_untrusted',
        designsExamined: count,
        designsSelected: count,
        hasMore: continuationPresent(response.continuation),
        designs,
      },
    };
  }

  if (read) {
    requireScope(session, 'design:meta:read');
    const response = providerRecord(
      await apiJson(`/designs/${encodeURIComponent(read.designId)}`, session, input.signal),
    );
    const design = normalizedDesign(response.design);
    if (design.id !== read.designId) throw canvaFailure('provider_response_invalid');
    return {
      ok: true,
      summary: `Canva design ${read.designId} retrieved.`,
      data: {
        contentTrust: 'external_untrusted',
        ...publicDesign(design),
      },
    };
  }

  if (templates) {
    requireScope(session, 'brandtemplate:meta:read');
    const query = new URLSearchParams({
      query: templates.query,
      limit: String(templates.maxResults),
      ownership: 'any',
      sort_by: 'relevance',
    });
    const response = providerRecord(
      await apiJson(`/brand-templates?${query.toString()}`, session, input.signal),
    );
    const candidates =
      response.items === undefined ? [] : providerArray(response.items, templates.maxResults);
    const normalized = candidates.map(normalizedBrandTemplate);
    const count = normalized.length;
    return {
      ok: true,
      summary: `${count} Canva brand template${count === 1 ? '' : 's'} examined; ${count} selected result${
        count === 1 ? '' : 's'
      } returned.`,
      data: {
        contentTrust: 'external_untrusted',
        templatesExamined: count,
        templatesSelected: count,
        hasMore: continuationPresent(response.continuation),
        templates: normalized,
      },
    };
  }

  if (dataset) {
    requireScope(session, 'brandtemplate:content:read');
    const response = providerRecord(
      await apiJson(
        `/brand-templates/${encodeURIComponent(dataset.brandTemplateId)}/dataset`,
        session,
        input.signal,
      ),
    );
    const fields = response.dataset === undefined ? [] : normalizedDataset(response.dataset);
    const supportedTextFields = fields.filter((field) => field.supportedForGeneration).length;
    return {
      ok: true,
      summary: `Canva brand template dataset retrieved; ${supportedTextFields} stable text field${
        supportedTextFields === 1 ? '' : 's'
      } supported.`,
      data: {
        contentTrust: 'external_untrusted',
        brandTemplateId: dataset.brandTemplateId,
        fields,
        supportedTextFields,
      },
    };
  }

  if (autofill) {
    requireScope(session, 'design:content:write');
    const response = await apiJson('/autofills', session, input.signal, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'create_from_brand_template',
        brand_template_id: autofill.brandTemplateId,
        title: autofill.title,
        data: autofill.data,
      }),
    });
    const job = normalizedAutofillJob(response, undefined, autofill.title);
    if (job.status === 'in_progress') {
      return {
        ok: true,
        summary: 'Canva accepted the structured design job; processing continues.',
        data: {
          jobId: job.jobId,
          status: job.status,
          created: false,
          structuredContextApplied: true,
        },
      };
    }
    return {
      ok: true,
      summary: 'Canva structured design created.',
      data: {
        ...publicDesign(job.design),
        jobId: job.jobId,
        created: true,
        structuredContextApplied: true,
      },
    };
  }

  if (autofillJob) {
    requireScope(session, 'design:meta:read');
    const job = normalizedAutofillJob(
      await apiJson(`/autofills/${encodeURIComponent(autofillJob.jobId)}`, session, input.signal),
      autofillJob.jobId,
    );
    if (job.status === 'in_progress') {
      return {
        ok: true,
        summary: 'Canva structured design job is still processing.',
        data: {
          jobId: job.jobId,
          status: job.status,
          created: false,
          structuredContextApplied: true,
        },
      };
    }
    return {
      ok: true,
      summary: 'Canva structured design job completed.',
      data: {
        contentTrust: 'external_untrusted',
        ...publicDesign(job.design),
        jobId: job.jobId,
        status: job.status,
        created: true,
        structuredContextApplied: true,
      },
    };
  }

  if (create) {
    requireScope(session, 'design:content:write');
    const response = providerRecord(
      await apiJson('/designs', session, input.signal, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'type_and_asset',
          design_type: { type: 'preset', name: create.preset },
          title: create.title,
        }),
      }),
    );
    const design = normalizedDesign(response.design, create.title);
    if (design.exactTitle !== undefined && design.exactTitle !== create.title) {
      throw canvaFailure('provider_response_invalid');
    }
    return {
      ok: true,
      summary: 'Canva design created.',
      data: {
        ...publicDesign(design),
        created: true,
      },
    };
  }
  throw canvaFailure('tool_unavailable');
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

export function canvaArtifactDrafts(input: {
  evidence: CanonicalPluginEvidence;
  registration: Pick<CanvaRegistration, 'pluginId' | 'toolName'>;
  result: Extract<ActionResult, { ok: true }>;
}): readonly JarvisArtifactDraft[] {
  if (
    input.registration.pluginId !== 'canva' ||
    !['design_read', 'design_create', 'design_autofill'].includes(input.registration.toolName)
  ) {
    return Object.freeze([]);
  }
  const data = providerRecord(input.result.data);
  if (input.registration.toolName === 'design_autofill' && data.status === 'in_progress') {
    const jobId = opaqueId(data.jobId);
    if (data.created !== false || data.structuredContextApplied !== true) {
      throw canvaFailure('plugin_result_invalid');
    }
    return Object.freeze([
      providerResultDraft({
        evidence: input.evidence,
        title: 'Canva structured design job',
        safeSummary: 'Canva accepted the structured design job; processing continues.',
        content: JSON.stringify({ jobId, status: 'in_progress' }),
      }),
    ]);
  }
  const id = opaqueId(data.id);
  const title = publicText(data.untrustedTitle, TITLE_LIMIT, true);
  const editUrl = canvaUrl(data.editUrl, 'edit');
  const viewUrl = canvaUrl(data.viewUrl, 'view');
  const structured = input.registration.toolName === 'design_autofill';
  const created = input.registration.toolName !== 'design_read';
  if (!title || (created && data.created !== true) || (!created && data.created !== undefined)) {
    throw canvaFailure('plugin_result_invalid');
  }
  let jobId: string | undefined;
  if (structured) {
    jobId = opaqueId(data.jobId);
    if (data.structuredContextApplied !== true) throw canvaFailure('plugin_result_invalid');
  }
  const safeSummary = structured
    ? 'Created structured Canva design; open Canva for current state.'
    : created
      ? 'Created Canva design; open Canva for current state.'
      : 'Retrieved Canva design; open Canva for current state.';
  return Object.freeze([
    providerResultDraft({
      evidence: input.evidence,
      title: `Canva design: ${title}`,
      safeSummary,
      content: JSON.stringify({
        id,
        title,
        editUrl,
        viewUrl,
        created,
        ...(jobId === undefined ? {} : { jobId, structuredContextApplied: true }),
      }),
    }),
    linkDraft({
      evidence: input.evidence,
      title: 'Edit Canva design',
      safeSummary: 'Open the Canva design editor; provider links are temporary.',
      uri: editUrl,
    }),
    linkDraft({
      evidence: input.evidence,
      title: 'View Canva design',
      safeSummary: 'Open the Canva design viewer; provider links are temporary.',
      uri: viewUrl,
    }),
  ]);
}
