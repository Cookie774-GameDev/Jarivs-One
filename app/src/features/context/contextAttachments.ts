export const CONTEXT_ATTACHMENT_KINDS = Object.freeze([
  'image',
  'audio',
  'video',
  'pdf',
  'text',
  'source',
  'archive',
  'approved_other',
] as const);

export type ContextAttachmentKind = (typeof CONTEXT_ATTACHMENT_KINDS)[number];
export type ContextAttachmentTargetKind = 'context_note' | 'graph_entity';

export interface ContextAttachmentInput {
  accountId: string;
  attachmentId: string;
  target: { kind: ContextAttachmentTargetKind; id: string };
  kind: ContextAttachmentKind;
  fileName: string;
  mimeType: string;
  byteSize: number;
  assetKey: string;
  checksum: { algorithm: 'sha256'; value: string };
  approvedTypeId?: string;
}

export interface ContextAttachmentReference extends ContextAttachmentInput {
  storage: 'asset_reference';
  executable: false;
}

export type ContextAttachmentPreviewKind =
  | 'image_thumbnail'
  | 'audio_player'
  | 'video_player'
  | 'pdf_page_preview'
  | 'text_preview'
  | 'metadata_fallback';

export interface ContextAttachmentPreviewPlan {
  kind: ContextAttachmentPreviewKind;
  attachmentId: string;
  page?: 1;
  executable: false;
}

export interface ContextAttachmentExtractionRequest {
  explicit: boolean;
  providerId?: string;
  modelId?: string;
}

export type ContextAttachmentExtractionPlan =
  | {
      kind: 'parse_text_directly' | 'extract_pdf_text';
      attachmentId: string;
      pageProvenance: boolean;
      executable: false;
    }
  | {
      kind: 'transcribe_media' | 'summarize_image';
      attachmentId: string;
      providerId: string;
      modelId: string;
      explicit: true;
      executable: false;
    }
  | {
      kind: 'none';
      attachmentId: string;
      reason: 'explicit_request_required' | 'archive_metadata_only' | 'unsupported_extraction';
      executable: false;
    };

export interface SafeContextWebOpenPlan {
  url: string;
  target: '_blank';
  rel: 'noopener noreferrer';
  referrerPolicy: 'no-referrer';
  executable: false;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u;
const SAFE_STORAGE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/u;
const SAFE_MIME = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const FORBIDDEN_TEXT =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;
const MAX_BOUNDARY_STRING = 2_048;
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024 * 1024;
const MAX_BOUNDARY_DEPTH = 5;

function fail(reason: string): never {
  throw new Error(`Invalid Context attachment ${reason}.`);
}

function safeText(value: unknown, reason: string, maximum: number): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim() !== value ||
    FORBIDDEN_TEXT.test(value)
  ) {
    fail(reason);
  }
  return value;
}

function stableId(value: unknown, reason: string): string {
  const id = safeText(value, reason, 200);
  if (!SAFE_ID.test(id)) fail(reason);
  return id;
}

function storageId(value: unknown, reason: string): string {
  const id = safeText(value, reason, 200);
  if (!SAFE_STORAGE_ID.test(id)) fail(reason);
  return id;
}

function assertClosedBoundary(value: unknown, reason: string, depth = 0): void {
  if (typeof value === 'string') {
    if (value.length > MAX_BOUNDARY_STRING) fail(reason);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (depth > MAX_BOUNDARY_DEPTH || Array.isArray(value)) fail(reason);
  let prototype: object | null;
  let keys: PropertyKey[];
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return fail(reason);
  }
  if (prototype !== Object.prototype && prototype !== null) fail(reason);
  if (keys.some((key) => typeof key !== 'string')) fail(reason);
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail(reason);
    assertClosedBoundary(descriptor.value, reason, depth + 1);
  }
}

function cloneBoundary<T>(value: T, reason: string): T {
  try {
    assertClosedBoundary(value, reason);
    return structuredClone(value);
  } catch {
    return fail(reason);
  }
}

function plainRecord(value: unknown, reason: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(reason);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(reason);
  return value as Record<string, unknown>;
}

function allowedKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  reason: string,
): void {
  const names = new Set(allowed);
  if (Object.keys(record).some((key) => !names.has(key))) fail(reason);
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(record, key))) fail(reason);
}

function safeFileName(value: unknown): string {
  const fileName = safeText(value, 'file name', 255);
  if (
    fileName === '.' ||
    fileName === '..' ||
    fileName.includes('/') ||
    fileName.includes('\\') ||
    /[<>:"|?*]/u.test(fileName) ||
    /[. ]$/u.test(fileName)
  ) {
    fail('file name');
  }
  return fileName;
}

function safeAssetKey(value: unknown): string {
  const assetKey = safeText(value, 'asset key', 1_024);
  if (
    assetKey.includes('\\') ||
    assetKey.startsWith('/') ||
    /^[a-z][a-z0-9+.-]*:/iu.test(assetKey) ||
    /(?:^|\/)\.{1,2}(?:\/|$)/u.test(assetKey) ||
    /base64|data:/iu.test(assetKey)
  ) {
    fail('asset key');
  }
  const segments = assetKey.split('/');
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment.length > 200 ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(segment),
    )
  ) {
    fail('asset key');
  }
  return assetKey;
}

function validateMime(kind: ContextAttachmentKind, mimeType: string): void {
  const matches =
    (kind === 'image' && mimeType.startsWith('image/')) ||
    (kind === 'audio' && mimeType.startsWith('audio/')) ||
    (kind === 'video' && mimeType.startsWith('video/')) ||
    (kind === 'pdf' && mimeType === 'application/pdf') ||
    (kind === 'text' && mimeType.startsWith('text/')) ||
    (kind === 'source' &&
      (mimeType.startsWith('text/') ||
        [
          'application/json',
          'application/javascript',
          'application/xml',
          'application/typescript',
        ].includes(mimeType))) ||
    (kind === 'archive' &&
      [
        'application/zip',
        'application/x-7z-compressed',
        'application/x-tar',
        'application/gzip',
        'application/vnd.rar',
      ].includes(mimeType)) ||
    kind === 'approved_other';
  if (!matches) fail('MIME type');
}

function parseInput(raw: ContextAttachmentInput): ContextAttachmentInput {
  const input = plainRecord(cloneBoundary(raw, 'attachment'), 'attachment');
  const required = [
    'accountId',
    'attachmentId',
    'target',
    'kind',
    'fileName',
    'mimeType',
    'byteSize',
    'assetKey',
    'checksum',
  ];
  allowedKeys(input, [...required, 'approvedTypeId'], required, 'attachment');
  if (!(CONTEXT_ATTACHMENT_KINDS as readonly unknown[]).includes(input.kind)) {
    fail('kind');
  }
  const kind = input.kind as ContextAttachmentKind;
  const target = plainRecord(input.target, 'target');
  allowedKeys(target, ['kind', 'id'], ['kind', 'id'], 'target');
  if (target.kind !== 'context_note' && target.kind !== 'graph_entity') fail('target');
  const checksum = plainRecord(input.checksum, 'checksum');
  allowedKeys(checksum, ['algorithm', 'value'], ['algorithm', 'value'], 'checksum');
  if (checksum.algorithm !== 'sha256') fail('checksum');
  const checksumValue = safeText(checksum.value, 'checksum', 64).toLocaleLowerCase('en-US');
  if (!SHA256.test(checksumValue)) fail('checksum');
  const mimeType = safeText(input.mimeType, 'MIME type', 255).toLocaleLowerCase('en-US');
  if (!SAFE_MIME.test(mimeType)) fail('MIME type');
  validateMime(kind, mimeType);
  if (
    !Number.isSafeInteger(input.byteSize) ||
    (input.byteSize as number) < 0 ||
    (input.byteSize as number) > MAX_ATTACHMENT_BYTES
  ) {
    fail('byte size');
  }
  const approvedTypeId =
    input.approvedTypeId === undefined
      ? undefined
      : stableId(input.approvedTypeId, 'approved type ID');
  if (kind === 'approved_other' && approvedTypeId === undefined) fail('approved type');
  if (kind !== 'approved_other' && approvedTypeId !== undefined) fail('approved type');
  const accountId = storageId(input.accountId, 'account ID');
  const attachmentId = storageId(input.attachmentId, 'attachment ID');
  const assetKey = safeAssetKey(input.assetKey);
  if (assetKey !== `context/${accountId}/${attachmentId}`) fail('asset key');
  return {
    accountId,
    attachmentId,
    target: Object.freeze({
      kind: target.kind,
      id: stableId(target.id, 'target ID'),
    }),
    kind,
    fileName: safeFileName(input.fileName),
    mimeType,
    byteSize: input.byteSize as number,
    assetKey,
    checksum: Object.freeze({ algorithm: 'sha256', value: checksumValue }),
    ...(approvedTypeId === undefined ? {} : { approvedTypeId }),
  };
}

export function buildContextAttachmentReference(
  rawInput: ContextAttachmentInput,
): Readonly<ContextAttachmentReference> {
  const input = parseInput(rawInput);
  return Object.freeze({
    ...input,
    storage: 'asset_reference',
    executable: false,
  });
}

function parseReference(raw: ContextAttachmentReference): Readonly<ContextAttachmentReference> {
  const reference = plainRecord(cloneBoundary(raw, 'reference'), 'reference');
  const required = [
    'accountId',
    'attachmentId',
    'target',
    'kind',
    'fileName',
    'mimeType',
    'byteSize',
    'assetKey',
    'checksum',
    'storage',
    'executable',
  ];
  allowedKeys(reference, [...required, 'approvedTypeId'], required, 'reference');
  if (reference.storage !== 'asset_reference' || reference.executable !== false) {
    fail('reference');
  }
  return buildContextAttachmentReference({
    accountId: reference.accountId as string,
    attachmentId: reference.attachmentId as string,
    target: reference.target as ContextAttachmentInput['target'],
    kind: reference.kind as ContextAttachmentKind,
    fileName: reference.fileName as string,
    mimeType: reference.mimeType as string,
    byteSize: reference.byteSize as number,
    assetKey: reference.assetKey as string,
    checksum: reference.checksum as ContextAttachmentInput['checksum'],
    ...(reference.approvedTypeId === undefined
      ? {}
      : { approvedTypeId: reference.approvedTypeId as string }),
  });
}

export function serializeContextAttachmentReference(
  rawReference: ContextAttachmentReference,
): string {
  const reference = parseReference(rawReference);
  const json = JSON.stringify(reference);
  if (json.length > 10_000 || /base64|data:/iu.test(json)) fail('serialized reference');
  return json;
}

export function planContextAttachmentPreview(
  rawReference: ContextAttachmentReference,
): Readonly<ContextAttachmentPreviewPlan> {
  const reference = parseReference(rawReference);
  const kind: ContextAttachmentPreviewKind =
    reference.kind === 'image'
      ? 'image_thumbnail'
      : reference.kind === 'audio'
        ? 'audio_player'
        : reference.kind === 'video'
          ? 'video_player'
          : reference.kind === 'pdf'
            ? 'pdf_page_preview'
            : reference.kind === 'text' || reference.kind === 'source'
              ? 'text_preview'
              : 'metadata_fallback';
  return Object.freeze({
    kind,
    attachmentId: reference.attachmentId,
    ...(kind === 'pdf_page_preview' ? { page: 1 as const } : {}),
    executable: false,
  });
}

function parseExtractionRequest(
  raw: ContextAttachmentExtractionRequest,
): ContextAttachmentExtractionRequest {
  const request = plainRecord(cloneBoundary(raw, 'extraction request'), 'extraction request');
  allowedKeys(request, ['explicit', 'providerId', 'modelId'], ['explicit'], 'extraction request');
  if (typeof request.explicit !== 'boolean') fail('extraction request');
  return {
    explicit: request.explicit,
    ...(request.providerId === undefined
      ? {}
      : { providerId: stableId(request.providerId, 'provider ID') }),
    ...(request.modelId === undefined ? {} : { modelId: stableId(request.modelId, 'model ID') }),
  };
}

export function planContextAttachmentExtraction(
  rawReference: ContextAttachmentReference,
  rawRequest: ContextAttachmentExtractionRequest,
): Readonly<ContextAttachmentExtractionPlan> {
  const reference = parseReference(rawReference);
  const request = parseExtractionRequest(rawRequest);
  if (reference.kind === 'text' || reference.kind === 'source') {
    return Object.freeze({
      kind: 'parse_text_directly',
      attachmentId: reference.attachmentId,
      pageProvenance: false,
      executable: false,
    });
  }
  if (reference.kind === 'pdf') {
    return Object.freeze({
      kind: 'extract_pdf_text',
      attachmentId: reference.attachmentId,
      pageProvenance: true,
      executable: false,
    });
  }
  if (reference.kind === 'archive') {
    return Object.freeze({
      kind: 'none',
      attachmentId: reference.attachmentId,
      reason: 'archive_metadata_only',
      executable: false,
    });
  }
  if (reference.kind === 'audio' || reference.kind === 'video' || reference.kind === 'image') {
    if (!request.explicit) {
      return Object.freeze({
        kind: 'none',
        attachmentId: reference.attachmentId,
        reason: 'explicit_request_required',
        executable: false,
      });
    }
    if (!request.providerId || !request.modelId) fail('provider and model');
    return Object.freeze({
      kind: reference.kind === 'image' ? 'summarize_image' : 'transcribe_media',
      attachmentId: reference.attachmentId,
      providerId: request.providerId,
      modelId: request.modelId,
      explicit: true,
      executable: false,
    });
  }
  return Object.freeze({
    kind: 'none',
    attachmentId: reference.attachmentId,
    reason: 'unsupported_extraction',
    executable: false,
  });
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLocaleLowerCase('en-US').replace(/\.+$/u, '');
  if (
    !host.includes('.') ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.localdomain') ||
    host.endsWith('.internal') ||
    host.endsWith('.lan') ||
    host.endsWith('.home') ||
    host.endsWith('.corp') ||
    host.includes(':')
  ) {
    return true;
  }
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(host);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((value) => value > 255)) return true;
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

export function planSafeContextWebOpen(rawUrl: string): Readonly<SafeContextWebOpenPlan> {
  const input = safeText(rawUrl, 'web link', 2_048);
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return fail('web link');
  }
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    (url.port !== '' && url.port !== '443') ||
    isPrivateHost(url.hostname)
  ) {
    fail('web link');
  }
  url.hostname = url.hostname.replace(/\.+$/u, '');
  return Object.freeze({
    url: url.toString(),
    target: '_blank',
    rel: 'noopener noreferrer',
    referrerPolicy: 'no-referrer',
    executable: false,
  });
}
