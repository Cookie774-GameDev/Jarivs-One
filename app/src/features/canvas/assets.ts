/**
 * Canvas asset and image domain slice.
 *
 * Framework-agnostic, deterministic, side-effect-free contracts for stable
 * image/document asset references and immutable image transform state. An
 * asset reference stores safe metadata only: a validated source (URL or
 * relative path), MIME type, filename, byte size, checksum, optional
 * dimensions/duration, thumbnail reference, alt text, annotations, and
 * original/open/export descriptors. Large binaries and base64 payloads are
 * never embedded in document JSON; only stable references and checksums are
 * carried. Every validator fails closed through the shared canvas security
 * primitives and a local `CanvasAssetError`.
 */
import {
  CANVAS_ID_PATTERN,
  CANVAS_MAX_TIMESTAMP,
  type CanvasOwnerId,
  type CanvasProjectId,
  type CanvasTimestamp,
} from './contracts';
import {
  CANVAS_MAX_ASSET_DIMENSION,
  assertSafeCanvasAsset,
  assertSafeCanvasImportPath,
  sanitizeCanvasUrl,
} from './security';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type CanvasAssetErrorCode =
  | 'invalid-type'
  | 'invalid-id'
  | 'invalid-timestamp'
  | 'invalid-number'
  | 'unsupported-value'
  | 'scope-violation'
  | 'missing-asset';

export class CanvasAssetError extends Error {
  readonly code: CanvasAssetErrorCode;
  readonly path: string;

  constructor(code: CanvasAssetErrorCode, path: string, message: string) {
    super('Canvas asset check failed (' + code + ') at ' + path + ': ' + message);
    this.name = 'CanvasAssetError';
    this.code = code;
    this.path = path;
  }
}

function failAsset(code: CanvasAssetErrorCode, path: string, message: string): never {
  throw new CanvasAssetError(code, path, message);
}

// ---------------------------------------------------------------------------
// Constants and branded identifiers
// ---------------------------------------------------------------------------

export const CANVAS_ASSET_SOURCE_KINDS = ['local', 'remote'] as const;
export type CanvasAssetSourceKind = (typeof CANVAS_ASSET_SOURCE_KINDS)[number];

export const CANVAS_ASSET_EXPORT_FORMATS = ['original', 'png', 'jpeg', 'webp'] as const;
export type CanvasAssetExportFormat = (typeof CANVAS_ASSET_EXPORT_FORMATS)[number];

export const CANVAS_IMAGE_FIT_MODES = ['fit', 'fill'] as const;
export type CanvasImageFitMode = (typeof CANVAS_IMAGE_FIT_MODES)[number];

/** Image MIME subset eligible for image transform state. */
export const CANVAS_IMAGE_MIME_TYPES = Object.freeze([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

export const CANVAS_ASSET_MAX_ALT_LENGTH = 1_000;
export const CANVAS_ASSET_MAX_ANNOTATION_LENGTH = 2_000;
export const CANVAS_ASSET_MAX_ANNOTATIONS = 100;
export const CANVAS_ASSET_MAX_FILENAME_LENGTH = 255;
export const CANVAS_ASSET_MAX_DURATION_MS = 86_400_000;
export const CANVAS_ASSET_MAX_ROTATION = 360;

const CHECKSUM_DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/;
const WINDOWS_RESERVED_NAME_PATTERN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

declare const canvasAssetBrand: unique symbol;
declare const canvasAnnotationBrand: unique symbol;

export type CanvasAssetId = string & { [canvasAssetBrand]: 'CanvasAssetId' };
export type CanvasAnnotationId = string & { [canvasAnnotationBrand]: 'CanvasAnnotationId' };

// ---------------------------------------------------------------------------
// Data contracts
// ---------------------------------------------------------------------------

export interface CanvasAssetChecksum {
  readonly algorithm: 'sha-256';
  readonly digest: string;
}

export interface CanvasAssetOriginDescriptor {
  readonly sourceKind: CanvasAssetSourceKind;
  readonly source: string;
  readonly mimeType: string;
  readonly filename: string;
  readonly byteSize: number;
  readonly checksum: CanvasAssetChecksum;
  readonly width: number | null;
  readonly height: number | null;
  readonly durationMs: number | null;
}

export interface CanvasThumbnailReference {
  readonly assetId: CanvasAssetId;
  readonly source: string;
  readonly checksum: CanvasAssetChecksum;
  readonly width: number;
  readonly height: number;
}

export interface CanvasAssetAnnotation {
  readonly id: CanvasAnnotationId;
  readonly text: string;
  readonly createdAt: CanvasTimestamp;
}

export interface CanvasAssetOpenDescriptor {
  readonly kind: 'url' | 'local';
  readonly target: string;
  readonly label: string | null;
}

export interface CanvasAssetExportDescriptor {
  readonly format: CanvasAssetExportFormat;
  readonly filename: string;
  readonly width: number | null;
  readonly height: number | null;
}

export interface CanvasAssetReference {
  readonly id: CanvasAssetId;
  readonly projectId: CanvasProjectId;
  readonly ownerId: CanvasOwnerId;
  readonly original: CanvasAssetOriginDescriptor;
  readonly missing: boolean;
  readonly thumbnail: CanvasThumbnailReference | null;
  readonly altText: string | null;
  readonly annotations: readonly CanvasAssetAnnotation[];
  readonly open: CanvasAssetOpenDescriptor | null;
  readonly export: CanvasAssetExportDescriptor | null;
  readonly createdAt: CanvasTimestamp;
}

export interface CanvasImageCrop {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface CanvasImageTransform {
  readonly resizeWidth: number | null;
  readonly resizeHeight: number | null;
  readonly fitMode: CanvasImageFitMode;
  readonly crop: CanvasImageCrop | null;
  readonly rotation: number;
  readonly opacity: number;
}

export interface CanvasImageState {
  readonly asset: CanvasAssetReference;
  readonly transform: CanvasImageTransform;
}

export interface CanvasAssetScope {
  readonly projectId: string;
  readonly ownerId: string;
}

// ---------------------------------------------------------------------------
// Local validation helpers
// ---------------------------------------------------------------------------

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    Object.freeze(value);
  } else if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      failAsset('unsupported-value', path + '.' + key, 'unexpected field "' + key + '"');
    }
  }
}

function assertAssetId(value: unknown, path: string): string {
  if (typeof value !== 'string' || !CANVAS_ID_PATTERN.test(value)) {
    failAsset(
      'invalid-id',
      path,
      'expected a stable id matching /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/',
    );
  }
  return value;
}

function assertAssetTimestamp(value: unknown, path: string): CanvasTimestamp {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    failAsset('invalid-timestamp', path, 'expected an integer timestamp');
  }
  if (value < 0 || value > CANVAS_MAX_TIMESTAMP) {
    failAsset(
      'invalid-timestamp',
      path,
      'timestamp out of range [0, ' + CANVAS_MAX_TIMESTAMP + ']',
    );
  }
  return value;
}

function assertPositiveBoundedInteger(value: unknown, path: string, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    failAsset('invalid-number', path, 'expected a safe integer');
  }
  if (value <= 0 || value > max) {
    failAsset('invalid-number', path, 'value out of range [1, ' + max + ']');
  }
  return value;
}

export function normalizeAssetFilename(value: unknown, path: string): string {
  if (typeof value !== 'string') failAsset('invalid-type', path, 'expected a string filename');
  if (value.length === 0) failAsset('unsupported-value', path, 'filename is empty');
  if (value.length > CANVAS_ASSET_MAX_FILENAME_LENGTH) {
    failAsset('unsupported-value', path, 'filename exceeds the length limit');
  }
  if (CONTROL_CHAR_PATTERN.test(value)) {
    failAsset('unsupported-value', path, 'filename contains a control character');
  }
  if (value.includes('/') || value.includes('\\')) {
    failAsset('unsupported-value', path, 'filename must not contain a path separator');
  }
  if (value === '..' || value === '.') {
    failAsset('unsupported-value', path, 'filename must not be a traversal segment');
  }
  if (WINDOWS_RESERVED_NAME_PATTERN.test(value)) {
    failAsset('unsupported-value', path, 'filename is a reserved device name');
  }
  if (value.endsWith(' ') || value.endsWith('.')) {
    failAsset('unsupported-value', path, 'filename has a trailing space or dot');
  }
  return value;
}

function assertOptionalBoundedText(value: unknown, path: string, max: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') failAsset('invalid-type', path, 'expected a string');
  if (CONTROL_CHAR_PATTERN.test(value)) {
    failAsset('unsupported-value', path, 'text contains a control character');
  }
  if (value.length > max)
    failAsset('unsupported-value', path, 'text exceeds ' + max + ' characters');
  return value;
}

export function normalizeAssetChecksum(input: unknown, path: string): CanvasAssetChecksum {
  if (!isPlainObject(input)) failAsset('invalid-type', path, 'expected a checksum object');
  assertExactKeys(input, new Set(['algorithm', 'digest']), path);
  if (input.algorithm !== 'sha-256') {
    failAsset('unsupported-value', path + '.algorithm', 'unsupported checksum algorithm');
  }
  if (typeof input.digest !== 'string' || !CHECKSUM_DIGEST_PATTERN.test(input.digest)) {
    failAsset('unsupported-value', path + '.digest', 'expected a 64-char lowercase hex digest');
  }
  return { algorithm: 'sha-256', digest: input.digest };
}

export function normalizeCanvasImageCrop(input: unknown, path: string): CanvasImageCrop {
  if (!isPlainObject(input)) failAsset('invalid-type', path, 'expected a crop object');
  assertExactKeys(input, new Set(['left', 'top', 'right', 'bottom']), path);
  const bound = (key: 'left' | 'top' | 'right' | 'bottom'): number => {
    const value = input[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      failAsset('invalid-number', path + '.' + key, 'expected a finite number');
    }
    if (value < 0 || value > 1) {
      failAsset('invalid-number', path + '.' + key, 'crop bound out of range [0, 1]');
    }
    return value;
  };
  const left = bound('left');
  const top = bound('top');
  const right = bound('right');
  const bottom = bound('bottom');
  if (left >= right) failAsset('invalid-number', path, 'crop left must precede right');
  if (top >= bottom) failAsset('invalid-number', path, 'crop top must precede bottom');
  return { left, top, right, bottom };
}

export function normalizeAssetOpenDescriptor(
  input: unknown,
  path: string,
  localExtensions?: readonly string[],
): CanvasAssetOpenDescriptor {
  if (!isPlainObject(input)) failAsset('invalid-type', path, 'expected an open descriptor');
  assertExactKeys(input, new Set(['kind', 'target', 'label']), path);
  if (input.kind !== 'url' && input.kind !== 'local') {
    failAsset('unsupported-value', path + '.kind', 'unsupported open kind');
  }
  const target =
    input.kind === 'url'
      ? sanitizeCanvasUrl(input.target, path + '.target')
      : assertSafeCanvasImportPath(
          input.target,
          localExtensions === undefined ? undefined : { allowedExtensions: localExtensions },
          path + '.target',
        );
  const label = assertOptionalBoundedText(
    input.label,
    path + '.label',
    CANVAS_ASSET_MAX_ALT_LENGTH,
  );
  return { kind: input.kind, target, label };
}

function normalizeThumbnail(input: unknown, path: string): CanvasThumbnailReference {
  if (!isPlainObject(input)) failAsset('invalid-type', path, 'expected a thumbnail object');
  assertExactKeys(input, new Set(['assetId', 'source', 'checksum', 'width', 'height']), path);
  const assetId = assertAssetId(input.assetId, path + '.assetId') as CanvasAssetId;
  const source = sanitizeCanvasUrl(input.source, path + '.source');
  const checksum = normalizeAssetChecksum(input.checksum, path + '.checksum');
  const width = assertPositiveBoundedInteger(
    input.width,
    path + '.width',
    CANVAS_MAX_ASSET_DIMENSION,
  );
  const height = assertPositiveBoundedInteger(
    input.height,
    path + '.height',
    CANVAS_MAX_ASSET_DIMENSION,
  );
  return { assetId, source, checksum, width, height };
}

function normalizeAnnotation(input: unknown, path: string): CanvasAssetAnnotation {
  if (!isPlainObject(input)) failAsset('invalid-type', path, 'expected an annotation object');
  assertExactKeys(input, new Set(['id', 'text', 'createdAt']), path);
  const id = assertAssetId(input.id, path + '.id') as CanvasAnnotationId;
  const text = assertOptionalBoundedText(
    input.text,
    path + '.text',
    CANVAS_ASSET_MAX_ANNOTATION_LENGTH,
  );
  if (text === null) failAsset('unsupported-value', path + '.text', 'annotation text is required');
  const createdAt = assertAssetTimestamp(input.createdAt, path + '.createdAt');
  return { id, text, createdAt };
}

function normalizeExportDescriptor(input: unknown, path: string): CanvasAssetExportDescriptor {
  if (!isPlainObject(input)) failAsset('invalid-type', path, 'expected an export descriptor');
  assertExactKeys(input, new Set(['format', 'filename', 'width', 'height']), path);
  const format = input.format;
  if (
    typeof format !== 'string' ||
    !CANVAS_ASSET_EXPORT_FORMATS.includes(format as CanvasAssetExportFormat)
  ) {
    failAsset('unsupported-value', path + '.format', 'unsupported export format');
  }
  const filename = normalizeAssetFilename(input.filename, path + '.filename');
  const width =
    input.width === null || input.width === undefined
      ? null
      : assertPositiveBoundedInteger(input.width, path + '.width', CANVAS_MAX_ASSET_DIMENSION);
  const height =
    input.height === null || input.height === undefined
      ? null
      : assertPositiveBoundedInteger(input.height, path + '.height', CANVAS_MAX_ASSET_DIMENSION);
  return { format: format as CanvasAssetExportFormat, filename, width, height };
}

const ORIGIN_KEYS = new Set([
  'sourceKind',
  'source',
  'mimeType',
  'filename',
  'byteSize',
  'checksum',
  'width',
  'height',
  'durationMs',
]);

function normalizeOrigin(input: unknown, path: string): CanvasAssetOriginDescriptor {
  if (!isPlainObject(input)) failAsset('invalid-type', path, 'expected an origin descriptor');
  assertExactKeys(input, ORIGIN_KEYS, path);

  const sourceKind = input.sourceKind;
  if (
    typeof sourceKind !== 'string' ||
    !CANVAS_ASSET_SOURCE_KINDS.includes(sourceKind as CanvasAssetSourceKind)
  ) {
    failAsset('unsupported-value', path + '.sourceKind', 'unsupported source kind');
  }
  const kind = sourceKind as CanvasAssetSourceKind;

  const source =
    kind === 'remote'
      ? sanitizeCanvasUrl(input.source, path + '.source')
      : assertSafeCanvasImportPath(input.source, undefined, path + '.source');

  const metadataInput: Record<string, unknown> = { size: input.byteSize, mimeType: input.mimeType };
  if (input.width !== null && input.width !== undefined) metadataInput.width = input.width;
  if (input.height !== null && input.height !== undefined) metadataInput.height = input.height;
  const metadata = assertSafeCanvasAsset(metadataInput, path);

  const filename = normalizeAssetFilename(input.filename, path + '.filename');
  const checksum = normalizeAssetChecksum(input.checksum, path + '.checksum');

  let durationMs: number | null = null;
  if (input.durationMs !== null && input.durationMs !== undefined) {
    if (typeof input.durationMs !== 'number' || !Number.isSafeInteger(input.durationMs)) {
      failAsset('invalid-number', path + '.durationMs', 'expected a safe integer');
    }
    if (input.durationMs <= 0 || input.durationMs > CANVAS_ASSET_MAX_DURATION_MS) {
      failAsset('invalid-number', path + '.durationMs', 'duration out of range');
    }
    durationMs = input.durationMs;
  }

  return {
    sourceKind: kind,
    source,
    mimeType: metadata.mimeType,
    filename,
    byteSize: metadata.size,
    checksum,
    width: metadata.width === undefined ? null : metadata.width,
    height: metadata.height === undefined ? null : metadata.height,
    durationMs,
  };
}

// ---------------------------------------------------------------------------
// Asset reference validation
// ---------------------------------------------------------------------------

const ASSET_KEYS = new Set([
  'id',
  'projectId',
  'ownerId',
  'original',
  'missing',
  'thumbnail',
  'altText',
  'annotations',
  'open',
  'export',
  'createdAt',
]);

export function validateCanvasAsset(input: unknown): CanvasAssetReference {
  if (!isPlainObject(input)) failAsset('invalid-type', 'asset', 'expected an object');
  assertExactKeys(input, ASSET_KEYS, 'asset');

  const id = assertAssetId(input.id, 'asset.id') as CanvasAssetId;
  const projectId = assertAssetId(input.projectId, 'asset.projectId') as CanvasProjectId;
  const ownerId = assertAssetId(input.ownerId, 'asset.ownerId') as CanvasOwnerId;
  const original = normalizeOrigin(input.original, 'asset.original');

  if (typeof input.missing !== 'boolean') {
    failAsset('invalid-type', 'asset.missing', 'expected a boolean');
  }

  const thumbnail =
    input.thumbnail === null || input.thumbnail === undefined
      ? null
      : normalizeThumbnail(input.thumbnail, 'asset.thumbnail');
  const altText = assertOptionalBoundedText(
    input.altText,
    'asset.altText',
    CANVAS_ASSET_MAX_ALT_LENGTH,
  );

  if (!Array.isArray(input.annotations)) {
    failAsset('invalid-type', 'asset.annotations', 'expected an array');
  }
  if (input.annotations.length > CANVAS_ASSET_MAX_ANNOTATIONS) {
    failAsset('unsupported-value', 'asset.annotations', 'too many annotations');
  }
  const annotations = input.annotations.map((item, index) =>
    normalizeAnnotation(item, 'asset.annotations[' + index + ']'),
  );

  const open =
    input.open === null || input.open === undefined
      ? null
      : normalizeAssetOpenDescriptor(input.open, 'asset.open');
  const exportDescriptor =
    input.export === null || input.export === undefined
      ? null
      : normalizeExportDescriptor(input.export, 'asset.export');
  const createdAt = assertAssetTimestamp(input.createdAt, 'asset.createdAt');

  return deepFreeze({
    id,
    projectId,
    ownerId,
    original,
    missing: input.missing,
    thumbnail,
    altText,
    annotations,
    open,
    export: exportDescriptor,
    createdAt,
  });
}

export function isCanvasAsset(value: unknown): value is CanvasAssetReference {
  try {
    validateCanvasAsset(value);
    return true;
  } catch (error) {
    if (error instanceof CanvasAssetError) return false;
    if (error instanceof Error && error.name === 'CanvasSecurityError') return false;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Missing state and scope isolation
// ---------------------------------------------------------------------------

export function markAssetMissing(reference: CanvasAssetReference): CanvasAssetReference {
  if (reference.missing) return reference;
  return deepFreeze({ ...reference, missing: true });
}

export function restoreAsset(reference: CanvasAssetReference): CanvasAssetReference {
  if (!reference.missing) return reference;
  return deepFreeze({ ...reference, missing: false });
}

export function assertAssetScope(
  reference: CanvasAssetReference,
  scope: CanvasAssetScope,
): CanvasAssetReference {
  assertAssetId(scope.projectId, 'scope.projectId');
  assertAssetId(scope.ownerId, 'scope.ownerId');
  if (reference.projectId !== scope.projectId || reference.ownerId !== scope.ownerId) {
    failAsset('scope-violation', 'asset', 'reference is outside the requested project/owner scope');
  }
  return reference;
}

export function isAssetInScope(reference: CanvasAssetReference, scope: CanvasAssetScope): boolean {
  try {
    assertAssetScope(reference, scope);
    return true;
  } catch (error) {
    if (error instanceof CanvasAssetError) return false;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Image transform state
// ---------------------------------------------------------------------------

function assertImageAsset(reference: CanvasAssetReference, path: string): void {
  if (!CANVAS_IMAGE_MIME_TYPES.includes(reference.original.mimeType)) {
    failAsset('unsupported-value', path + '.mimeType', 'asset is not an image');
  }
  if (reference.missing) {
    failAsset('missing-asset', path, 'cannot use a missing asset as an image');
  }
}

export function createCanvasImage(asset: CanvasAssetReference): CanvasImageState {
  const reference = validateCanvasAsset(asset);
  assertImageAsset(reference, 'asset');
  const transform: CanvasImageTransform = {
    resizeWidth: null,
    resizeHeight: null,
    fitMode: 'fit',
    crop: null,
    rotation: 0,
    opacity: 1,
  };
  return deepFreeze({ asset: reference, transform });
}

export interface CanvasImageTransformPatch {
  readonly resizeWidth?: number | null;
  readonly resizeHeight?: number | null;
  readonly fitMode?: CanvasImageFitMode;
  readonly crop?: CanvasImageCrop | null;
  readonly rotation?: number;
  readonly opacity?: number;
}

function normalizeResize(value: unknown, path: string): number | null {
  if (value === null || value === undefined) return null;
  return assertPositiveBoundedInteger(value, path, CANVAS_MAX_ASSET_DIMENSION);
}

export function transformCanvasImage(
  state: CanvasImageState,
  patch: CanvasImageTransformPatch,
): CanvasImageState {
  if (!isPlainObject(state) || !isPlainObject(state.asset) || !isPlainObject(state.transform)) {
    failAsset('invalid-type', 'state', 'expected an image state object');
  }
  if (state.asset.missing) {
    failAsset('missing-asset', 'state.asset', 'cannot transform a missing asset');
  }
  const base = state.transform;

  const resizeWidth =
    patch.resizeWidth === undefined
      ? base.resizeWidth
      : normalizeResize(patch.resizeWidth, 'patch.resizeWidth');
  const resizeHeight =
    patch.resizeHeight === undefined
      ? base.resizeHeight
      : normalizeResize(patch.resizeHeight, 'patch.resizeHeight');

  const fitMode = patch.fitMode === undefined ? base.fitMode : patch.fitMode;
  if (typeof fitMode !== 'string' || !CANVAS_IMAGE_FIT_MODES.includes(fitMode)) {
    failAsset('unsupported-value', 'patch.fitMode', 'unsupported fit mode');
  }

  const crop =
    patch.crop === undefined
      ? base.crop
      : patch.crop === null
        ? null
        : normalizeCanvasImageCrop(patch.crop, 'patch.crop');

  const rotation = patch.rotation === undefined ? base.rotation : patch.rotation;
  if (typeof rotation !== 'number' || !Number.isFinite(rotation)) {
    failAsset('invalid-number', 'patch.rotation', 'expected a finite number');
  }
  if (rotation < -CANVAS_ASSET_MAX_ROTATION || rotation > CANVAS_ASSET_MAX_ROTATION) {
    failAsset('invalid-number', 'patch.rotation', 'rotation out of range [-360, 360]');
  }

  const opacity = patch.opacity === undefined ? base.opacity : patch.opacity;
  if (typeof opacity !== 'number' || !Number.isFinite(opacity)) {
    failAsset('invalid-number', 'patch.opacity', 'expected a finite number');
  }
  if (opacity < 0 || opacity > 1) {
    failAsset('invalid-number', 'patch.opacity', 'opacity out of range [0, 1]');
  }

  const transform: CanvasImageTransform = {
    resizeWidth,
    resizeHeight,
    fitMode,
    crop,
    rotation,
    opacity,
  };
  return deepFreeze({ asset: state.asset, transform });
}

export function replaceImageSource(
  state: CanvasImageState,
  asset: CanvasAssetReference,
): CanvasImageState {
  if (!isPlainObject(state) || !isPlainObject(state.asset)) {
    failAsset('invalid-type', 'state', 'expected an image state object');
  }
  const next = validateCanvasAsset(asset);
  assertImageAsset(next, 'asset');
  if (next.projectId !== state.asset.projectId || next.ownerId !== state.asset.ownerId) {
    failAsset('scope-violation', 'asset', 'replacement source is outside the current scope');
  }
  return deepFreeze({ asset: next, transform: state.transform });
}

function quarterTurn(rotation: number): boolean {
  const normalized = ((rotation % 360) + 360) % 360;
  return normalized === 90 || normalized === 270;
}

export function exportImageMetadata(
  state: CanvasImageState,
  format: CanvasAssetExportFormat = 'original',
): CanvasAssetExportDescriptor {
  if (!isPlainObject(state) || !isPlainObject(state.asset) || !isPlainObject(state.transform)) {
    failAsset('invalid-type', 'state', 'expected an image state object');
  }
  if (typeof format !== 'string' || !CANVAS_ASSET_EXPORT_FORMATS.includes(format)) {
    failAsset('unsupported-value', 'format', 'unsupported export format');
  }

  const original = state.asset.original;
  const transform = state.transform;

  let width = original.width;
  let height = original.height;

  if (transform.crop !== null && width !== null && height !== null) {
    width = Math.max(1, Math.round((transform.crop.right - transform.crop.left) * width));
    height = Math.max(1, Math.round((transform.crop.bottom - transform.crop.top) * height));
  }

  if (transform.resizeWidth !== null && transform.resizeHeight !== null) {
    width = transform.resizeWidth;
    height = transform.resizeHeight;
  } else if (transform.resizeWidth !== null && width !== null && height !== null) {
    const scale = transform.resizeWidth / width;
    width = transform.resizeWidth;
    height = Math.max(1, Math.round(height * scale));
  } else if (transform.resizeHeight !== null && width !== null && height !== null) {
    const scale = transform.resizeHeight / height;
    height = transform.resizeHeight;
    width = Math.max(1, Math.round(width * scale));
  }

  if (quarterTurn(transform.rotation) && width !== null && height !== null) {
    const swapped = width;
    width = height;
    height = swapped;
  }

  const dot = original.filename.lastIndexOf('.');
  const baseName = dot > 0 ? original.filename.slice(0, dot) : original.filename;
  const extension = format === 'original' ? null : format === 'jpeg' ? '.jpg' : '.' + format;
  const filename =
    extension === null
      ? original.filename
      : normalizeAssetFilename(baseName + extension, 'filename');

  return deepFreeze({ format, filename, width, height });
}
