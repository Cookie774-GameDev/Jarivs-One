import type { JarvisArtifactDraft, JarvisArtifactV1 } from './contracts/execution';
import { validateJarvisArtifact, validateJarvisSourceRef } from './contracts/validators';
import type { ArtifactPreDigestBinding, VerifiedArtifactBinding } from './artifactReceipts';
import { hasDetectedSecret } from '@/lib/security/secretDetector';

const canonicalArtifactMaterialBrand: unique symbol = Symbol('jarvis.canonical-artifact-material');
const MAX_TEXT_PREVIEW_BYTES = 16_384;
const ALLOWED_URI_PROTOCOLS = new Set([
  'https:',
  'asset:',
  'vibespace:',
  'app:',
  'jarvis:',
  'tauri:',
]);
const PRODUCER_IDS = new Set([
  'provider_response',
  'file_action_result',
  'terminal_exit',
  'plugin_result',
  'mcp_result',
  'schedule_result',
]);
const ARTIFACT_KINDS = new Set([
  'file',
  'link',
  'text',
  'image',
  'document',
  'code',
  'terminal_output',
  'provider_result',
]);
const ARTIFACT_STATES = new Set(['ready', 'partial', 'quarantined']);
const LOCAL_REFERENCE_KINDS = new Set(['path', 'blob_key', 'message_part']);
const FORBIDDEN_RESULT_REFS =
  /^(?:queued|planned(?:[-_:]|$)|capability(?:[-_:]|$)|source-only(?:[-_:]|$))/i;
const CANONICAL_PLUGIN_RESULT_REF = /^jresult_[a-f0-9]{64}$/;
const CANONICAL_ARTIFACT_UUID = /^jart_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const CANONICAL_RUN_UUID = /^jrun_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const CANONICAL_REQUEST_UUID = /^jreq_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
/** @internal Imported only by artifactRuntimeInternals.ts and focused tests. */
export type CanonicalArtifactMaterial = Readonly<{
  artifact: JarvisArtifactV1;
  artifactDigest: string;
  [canonicalArtifactMaterialBrand]: true;
}>;

const materialBindings = new WeakMap<CanonicalArtifactMaterial, ArtifactPreDigestBinding>();

function fail(category: string): never {
  throw new Error(category);
}

function stableText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allow = new Set(allowed);
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== 'string' || !allow.has(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && 'value' in descriptor;
  });
}

function validateBinding(binding: ArtifactPreDigestBinding): void {
  if (
    !stableText(binding.accountId) ||
    !stableText(binding.runId) ||
    !stableText(binding.requestId) ||
    !Number.isSafeInteger(binding.attemptNumber) ||
    binding.attemptNumber < 1 ||
    !stableText(binding.artifactId) ||
    !binding.artifactId.startsWith('jart_') ||
    !PRODUCER_IDS.has(binding.producerId) ||
    !stableText(binding.resultRef) ||
    !Number.isSafeInteger(binding.verifiedAt) ||
    binding.verifiedAt < 0
  ) {
    fail('artifact_binding_invalid');
  }
  if (FORBIDDEN_RESULT_REFS.test(binding.resultRef)) fail('artifact_result_not_verified');
  if (
    binding.producerId !== 'plugin_result' ||
    !CANONICAL_PLUGIN_RESULT_REF.test(binding.resultRef)
  ) {
    assertArtifactSecretFree(binding.resultRef);
  }
}

function assertArtifactSecretFree(value: string | Uint8Array | undefined): void {
  if (value === undefined) return;
  const text = typeof value === 'string' ? value : new TextDecoder().decode(value);
  if (hasDetectedSecret(text)) {
    fail('artifact_secret_rejected');
  }
}

function isCanonicalArtifactStructuralId(path: readonly string[], value: string): boolean {
  if (path.length !== 1) return false;
  switch (path[0]) {
    case 'id':
      return CANONICAL_ARTIFACT_UUID.test(value);
    case 'runId':
      return CANONICAL_RUN_UUID.test(value);
    case 'requestId':
      return CANONICAL_REQUEST_UUID.test(value);
    default:
      return false;
  }
}

function assertArtifactMetadataSecretFree(value: unknown, path: readonly string[] = []): void {
  if (typeof value === 'string') {
    if (isCanonicalArtifactStructuralId(path, value)) return;
    assertArtifactSecretFree(value);
    if (value.includes('://')) {
      let parsed: URL | undefined;
      try {
        parsed = new URL(value);
      } catch {
        parsed = undefined;
      }
      if (parsed) {
        if (parsed.username || parsed.password) fail('artifact_secret_rejected');
        for (const [key, field] of parsed.searchParams) {
          assertArtifactSecretFree(`${key}=${field}`);
        }
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertArtifactMetadataSecretFree(item, [...path, '[]']);
    return;
  }
  if (!isPlainRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    assertArtifactMetadataSecretFree(item, [...path, key]);
  }
}

function copySourceRefs(value: JarvisArtifactDraft['artifact']['sourceRefs'], accountId: string) {
  if (!Array.isArray(value)) fail('artifact_shape_invalid');
  return value.map((source) => {
    const result = validateJarvisSourceRef(source);
    if (!result.ok) fail('artifact_shape_invalid');
    if (result.value.accountId !== accountId) fail('artifact_account_scope_mismatch');
    return structuredClone(result.value);
  });
}

function validateDraftArtifact(value: JarvisArtifactDraft['artifact']): void {
  if (!isPlainRecord(value)) fail('artifact_shape_invalid');
  if (
    !hasOnlyKeys(value, [
      'kind',
      'title',
      'mimeType',
      'safeSummary',
      'sourceRefs',
      'createdAt',
      'state',
    ]) ||
    !ARTIFACT_KINDS.has(value.kind as string) ||
    !stableText(value.title) ||
    (value.mimeType !== undefined && !stableText(value.mimeType)) ||
    (value.safeSummary !== undefined && typeof value.safeSummary !== 'string') ||
    !Array.isArray(value.sourceRefs) ||
    !Number.isFinite(value.createdAt) ||
    (value.state !== undefined && !ARTIFACT_STATES.has(value.state as string))
  ) {
    fail('artifact_shape_invalid');
  }
  assertArtifactSecretFree(value.safeSummary);
}

function validateUri(uri: unknown): string {
  if (!stableText(uri)) fail('artifact_backing_invalid');
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    fail('artifact_backing_invalid');
  }
  if (!ALLOWED_URI_PROTOCOLS.has(parsed.protocol)) fail('artifact_backing_invalid');
  return parsed.toString();
}

function copyLocalReference(value: unknown): NonNullable<JarvisArtifactV1['localReference']> {
  if (
    !isPlainRecord(value) ||
    !hasOnlyKeys(value, ['kind', 'value']) ||
    !LOCAL_REFERENCE_KINDS.has(value.kind as string) ||
    !stableText(value.value)
  ) {
    fail('artifact_backing_invalid');
  }
  return {
    kind: value.kind as NonNullable<JarvisArtifactV1['localReference']>['kind'],
    value: value.value,
  };
}

function exactContent(value: unknown): string | Uint8Array | undefined {
  if (value === undefined || typeof value === 'string') return value;
  if (value instanceof Uint8Array) return new Uint8Array(value);
  return fail('artifact_backing_invalid');
}

function contentBytes(value: string | Uint8Array): Uint8Array {
  return typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('artifact_shape_invalid');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (!isPlainRecord(value)) fail('artifact_shape_invalid');
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(',')}}`;
}

function utf8Preview(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

function truncateUtf8(value: string, maxBytes: number): string {
  let result = '';
  let used = 0;
  const encoder = new TextEncoder();
  for (const point of value) {
    const pointBytes = encoder.encode(point).byteLength;
    if (used + pointBytes > maxBytes) break;
    result += point;
    used += pointBytes;
  }
  return result;
}

function buildPreview(input: {
  artifact: JarvisArtifactDraft['artifact'];
  content: string | Uint8Array;
  bytes: Uint8Array;
}): NonNullable<JarvisArtifactV1['preview']> {
  if (
    input.artifact.kind === 'image' ||
    input.artifact.mimeType?.toLowerCase().startsWith('image/')
  ) {
    return { kind: 'image', truncated: false, sizeBytes: input.bytes.byteLength };
  }
  const text = utf8Preview(input.bytes);
  if (text === undefined) {
    return { kind: 'none', truncated: false, sizeBytes: input.bytes.byteLength };
  }
  const previewText = truncateUtf8(text, MAX_TEXT_PREVIEW_BYTES);
  return {
    kind: 'text',
    text: previewText,
    truncated: new TextEncoder().encode(previewText).byteLength < input.bytes.byteLength,
    sizeBytes: input.bytes.byteLength,
  };
}

function freezeArtifact(value: JarvisArtifactV1): JarvisArtifactV1 {
  for (const source of value.sourceRefs) Object.freeze(source);
  Object.freeze(value.sourceRefs);
  if (value.preview) Object.freeze(value.preview);
  if (value.localReference) Object.freeze(value.localReference);
  return Object.freeze(value);
}

function copyBinding(value: ArtifactPreDigestBinding): ArtifactPreDigestBinding {
  return Object.freeze({
    accountId: value.accountId,
    runId: value.runId,
    requestId: value.requestId,
    attemptNumber: value.attemptNumber,
    artifactId: value.artifactId,
    producerId: value.producerId,
    resultRef: value.resultRef,
    verifiedAt: value.verifiedAt,
  });
}

function exactPreBinding(
  expected: ArtifactPreDigestBinding,
  actual: VerifiedArtifactBinding,
): boolean {
  return (
    expected.accountId === actual.accountId &&
    expected.runId === actual.runId &&
    expected.requestId === actual.requestId &&
    expected.attemptNumber === actual.attemptNumber &&
    expected.artifactId === actual.artifactId &&
    expected.producerId === actual.producerId &&
    expected.resultRef === actual.resultRef &&
    expected.verifiedAt === actual.verifiedAt
  );
}

/** @internal Imported only by artifactRuntimeInternals.ts and focused tests. */
export async function canonicalizeArtifactDraftInternal(input: {
  binding: ArtifactPreDigestBinding;
  draft: JarvisArtifactDraft;
}): Promise<CanonicalArtifactMaterial> {
  validateBinding(input.binding);
  if (!isPlainRecord(input.draft) || !hasOnlyKeys(input.draft, ['artifact', 'backing'])) {
    fail('artifact_shape_invalid');
  }
  validateDraftArtifact(input.draft.artifact);
  if (!isPlainRecord(input.draft.backing)) {
    fail('artifact_backing_invalid');
  }
  const kindDescriptor = Object.getOwnPropertyDescriptor(input.draft.backing, 'kind');
  if (
    !kindDescriptor ||
    !kindDescriptor.enumerable ||
    !('value' in kindDescriptor) ||
    !stableText(kindDescriptor.value)
  ) {
    fail('artifact_backing_invalid');
  }
  const backing = input.draft.backing;

  const state = input.draft.artifact.state ?? 'ready';
  let uri: string | undefined;
  let localReference: JarvisArtifactV1['localReference'];
  let content: string | Uint8Array | undefined;
  switch (backing.kind) {
    case 'uri':
      if (!hasOnlyKeys(backing, ['kind', 'uri'])) fail('artifact_backing_invalid');
      uri = validateUri(backing.uri);
      break;
    case 'local_reference':
      if (!hasOnlyKeys(backing, ['kind', 'localReference', 'content'])) {
        fail('artifact_backing_invalid');
      }
      localReference = copyLocalReference(backing.localReference);
      if (localReference.kind === 'path' && input.binding.producerId !== 'file_action_result') {
        fail('artifact_backing_invalid');
      }
      if (
        localReference.kind === 'message_part' &&
        localReference.value !== input.binding.resultRef
      ) {
        fail('artifact_backing_invalid');
      }
      content = exactContent(backing.content);
      break;
    case 'producer_result':
      if (!hasOnlyKeys(backing, ['kind', 'content'])) fail('artifact_backing_invalid');
      localReference = { kind: 'message_part', value: input.binding.resultRef };
      content = exactContent(backing.content);
      break;
    default:
      fail('artifact_backing_invalid');
  }

  assertArtifactSecretFree(content);
  if (
    state === 'partial' &&
    content === undefined &&
    input.draft.backing.kind === 'producer_result'
  ) {
    fail('artifact_partial_backing_required');
  }
  if (state === 'quarantined') {
    if (input.draft.backing.kind !== 'producer_result' || content !== undefined) {
      fail('artifact_quarantine_invalid');
    }
  }

  const sourceRefs = copySourceRefs(input.draft.artifact.sourceRefs, input.binding.accountId);
  const artifact: JarvisArtifactV1 = {
    schemaVersion: 1,
    id: input.binding.artifactId,
    runId: input.binding.runId,
    requestId: input.binding.requestId,
    attemptNumber: input.binding.attemptNumber,
    state,
    kind: input.draft.artifact.kind,
    title: input.draft.artifact.title,
    ...(uri === undefined ? {} : { uri }),
    ...(input.draft.artifact.mimeType === undefined
      ? {}
      : { mimeType: input.draft.artifact.mimeType }),
    ...(input.draft.artifact.safeSummary === undefined
      ? {}
      : { safeSummary: input.draft.artifact.safeSummary }),
    sourceRefs,
    createdAt: input.draft.artifact.createdAt,
    ...(localReference === undefined ? {} : { localReference }),
  };

  if (state === 'quarantined') {
    artifact.preview = { kind: 'none', truncated: false, sizeBytes: 0 };
  } else if (content !== undefined) {
    const bytes = contentBytes(content);
    artifact.contentHash = await sha256(bytes);
    artifact.sizeBytes = bytes.byteLength;
    artifact.preview = buildPreview({ artifact: input.draft.artifact, content, bytes });
  }

  if (!validateJarvisArtifact(artifact).ok) fail('artifact_shape_invalid');
  assertArtifactMetadataSecretFree(artifact);

  const detached = freezeArtifact(structuredClone(artifact));
  const artifactDigest = await sha256(new TextEncoder().encode(canonicalJson(detached)));
  const materialValue = {
    artifact: detached,
    artifactDigest,
  } as CanonicalArtifactMaterial;
  Object.defineProperty(materialValue, canonicalArtifactMaterialBrand, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  const material = Object.freeze(materialValue);
  materialBindings.set(material, copyBinding(input.binding));
  return material;
}

/** @internal Imported only by artifactRuntimeInternals.ts and focused tests. */
export function normalizeVerifiedArtifactInternal(input: {
  binding: VerifiedArtifactBinding;
  material: CanonicalArtifactMaterial;
}): JarvisArtifactV1 {
  const expected = materialBindings.get(input.material);
  if (!expected || input.material[canonicalArtifactMaterialBrand] !== true) {
    fail('artifact_material_invalid');
  }
  materialBindings.delete(input.material);
  if (
    !exactPreBinding(expected, input.binding) ||
    input.material.artifactDigest !== input.binding.artifactDigest ||
    input.material.artifact.id !== input.binding.artifactId ||
    input.material.artifact.runId !== input.binding.runId ||
    input.material.artifact.requestId !== input.binding.requestId ||
    input.material.artifact.attemptNumber !== input.binding.attemptNumber
  ) {
    fail('artifact_binding_mismatch');
  }
  return freezeArtifact(structuredClone(input.material.artifact));
}
