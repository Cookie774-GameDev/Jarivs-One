/**
 * Content-addressed binary storage orchestration for canvas assets.
 *
 * This module deliberately owns no persistence implementation. Native
 * filesystem, browser IndexedDB, remote object storage, and scoped metadata
 * are injected as ports. Metadata becomes visible only after all content is
 * durable; failed metadata publication compensates by removing content newly
 * written by that operation.
 */

export type CanvasAssetStorageCapability = 'native' | 'browser' | 'server';
export type CanvasAssetPersistenceKind = 'filesystem' | 'indexeddb' | 'remote';
export type CanvasAssetStorageTarget = 'local' | 'server';

export type CanvasAssetStorageErrorCode =
  | 'invalid-configuration'
  | 'invalid-scope'
  | 'invalid-input'
  | 'unsupported-mime'
  | 'mime-mismatch'
  | 'asset-too-large'
  | 'thumbnail-too-large'
  | 'checksum-unavailable'
  | 'storage-unavailable'
  | 'quota-required'
  | 'quota-invalid'
  | 'content-write-failed'
  | 'metadata-write-failed'
  | 'asset-not-found'
  | 'content-not-found'
  | 'checksum-mismatch'
  | 'metadata-corrupt'
  | 'cleanup-plan-invalid';

export class CanvasAssetStorageError extends Error {
  readonly code: CanvasAssetStorageErrorCode;
  readonly cause?: unknown;

  constructor(code: CanvasAssetStorageErrorCode, message: string, cause?: unknown) {
    super(`Canvas asset storage failed (${code}): ${message}`);
    this.name = 'CanvasAssetStorageError';
    this.code = code;
    this.cause = cause;
  }
}

export interface CanvasStoredAssetScope {
  readonly accountId: string;
  readonly projectId: string;
  readonly ownerId: string;
}

export interface CanvasAssetQuotaTicket {
  readonly id: string;
  readonly accountId: string;
  readonly projectId: string;
  readonly ownerId: string;
  readonly byteSize: number;
  readonly checksumSha256: string;
  readonly mimeType: string;
  readonly expiresAt: number;
  readonly proof: string;
}

export interface CanvasAssetQuotaAuthority {
  authorize(
    scope: CanvasStoredAssetScope,
    request: {
      readonly byteSize: number;
      readonly checksumSha256: string;
      readonly mimeType: string;
    },
  ): Promise<CanvasAssetQuotaTicket>;
}

export interface CanvasAssetWriteOptions {
  readonly checksumSha256: string;
  readonly byteSize: number;
  readonly mimeType: string;
  readonly quotaTicket?: CanvasAssetQuotaTicket;
}

export interface CanvasAssetBinaryPort {
  readonly id: string;
  readonly capability: CanvasAssetStorageCapability;
  readonly persistence: CanvasAssetPersistenceKind;
  readonly maxAssetBytes: number;
  /**
   * Serialize all reads, writes, compensation, and deletion for one scoped key.
   * Implementations must coordinate every caller that can mutate that key.
   */
  withExclusiveLease<T>(
    scope: CanvasStoredAssetScope,
    storageKey: string,
    operation: () => Promise<T>,
  ): Promise<T>;
  isAvailable(): Promise<boolean>;
  has(scope: CanvasStoredAssetScope, storageKey: string): Promise<boolean>;
  write(
    scope: CanvasStoredAssetScope,
    storageKey: string,
    bytes: Blob,
    options: CanvasAssetWriteOptions,
  ): Promise<void>;
  read(scope: CanvasStoredAssetScope, storageKey: string): Promise<Blob | undefined>;
  remove(scope: CanvasStoredAssetScope, storageKey: string): Promise<void>;
  list(scope: CanvasStoredAssetScope): Promise<readonly string[]>;
}

export interface CanvasStoredAssetThumbnail {
  readonly assetId: string;
  readonly checksum: {
    readonly algorithm: 'sha-256';
    readonly digest: string;
  };
  readonly byteSize: number;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly storageKey: string;
}

export interface CanvasStoredAsset {
  readonly id: string;
  readonly scope: CanvasStoredAssetScope;
  readonly filename: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly checksum: {
    readonly algorithm: 'sha-256';
    readonly digest: string;
  };
  readonly width: number | null;
  readonly height: number | null;
  readonly durationMs: number | null;
  readonly storage: {
    readonly portId: string;
    readonly capability: CanvasAssetStorageCapability;
    readonly persistence: CanvasAssetPersistenceKind;
    readonly storageKey: string;
  };
  readonly thumbnail: CanvasStoredAssetThumbnail | null;
  readonly createdAt: number;
}

export interface CanvasAssetMetadataPort {
  /**
   * Serialize publication for one scoped asset id across all storage targets.
   */
  withExclusiveLease<T>(
    scope: CanvasStoredAssetScope,
    assetId: string,
    operation: () => Promise<T>,
  ): Promise<T>;
  get(scope: CanvasStoredAssetScope, assetId: string): Promise<CanvasStoredAsset | undefined>;
  put(scope: CanvasStoredAssetScope, asset: CanvasStoredAsset): Promise<void>;
  remove(scope: CanvasStoredAssetScope, assetId: string): Promise<void>;
  list(scope: CanvasStoredAssetScope): Promise<readonly CanvasStoredAsset[]>;
}

export interface CanvasAssetStoreRequest {
  readonly bytes: Blob;
  readonly filename: string;
  readonly mimeType: string;
  readonly width?: number;
  readonly height?: number;
  readonly durationMs?: number;
  readonly target?: CanvasAssetStorageTarget;
  readonly thumbnail?: {
    readonly bytes: Blob;
    readonly mimeType: string;
    readonly width: number;
    readonly height: number;
  };
}

export interface CanvasAssetReadResult {
  readonly metadata: CanvasStoredAsset;
  readonly bytes: Blob;
}

export interface CanvasAssetOrphanCleanupEntry {
  readonly portId: string;
  readonly storageKey: string;
}

export interface CanvasAssetOrphanCleanupPlan {
  readonly scope: CanvasStoredAssetScope;
  readonly entries: readonly CanvasAssetOrphanCleanupEntry[];
  readonly createdAt: number;
}

export interface CanvasAssetStorage {
  store(
    scope: CanvasStoredAssetScope,
    request: CanvasAssetStoreRequest,
  ): Promise<CanvasStoredAsset>;
  read(scope: CanvasStoredAssetScope, assetId: string): Promise<CanvasAssetReadResult>;
  planOrphanCleanup(scope: CanvasStoredAssetScope): Promise<CanvasAssetOrphanCleanupPlan>;
  cleanupOrphans(scope: CanvasStoredAssetScope, plan: CanvasAssetOrphanCleanupPlan): Promise<void>;
}

export interface CanvasAssetStorageOptions {
  readonly binaryPorts: readonly CanvasAssetBinaryPort[];
  readonly metadata: CanvasAssetMetadataPort;
  readonly quota?: CanvasAssetQuotaAuthority;
  readonly crypto?: Pick<Crypto, 'subtle'>;
  readonly now?: () => number;
  readonly maxAssetBytes?: number;
  readonly maxThumbnailBytes?: number;
  readonly allowedMimeTypes?: readonly string[];
}

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const UNSAFE_FILENAME = /[\/\\\u0000-\u001f\u007f]/u;
const MAX_DIMENSION = 16_384;
const DEFAULT_MAX_ASSET_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;
const DEFAULT_ALLOWED_MIME_TYPES = Object.freeze([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/pdf',
]);

function fail(code: CanvasAssetStorageErrorCode, message: string, cause?: unknown): never {
  throw new CanvasAssetStorageError(code, message, cause);
}

function freezeScope(scope: CanvasStoredAssetScope): CanvasStoredAssetScope {
  return Object.freeze({
    accountId: scope.accountId,
    projectId: scope.projectId,
    ownerId: scope.ownerId,
  });
}

function validateScope(scope: CanvasStoredAssetScope): CanvasStoredAssetScope {
  if (
    typeof scope !== 'object' ||
    scope === null ||
    !SAFE_ID.test(scope.accountId) ||
    !SAFE_ID.test(scope.projectId) ||
    !SAFE_ID.test(scope.ownerId)
  ) {
    fail('invalid-scope', 'accountId, projectId, and ownerId must be bounded safe identifiers');
  }
  return freezeScope(scope);
}

function sameScope(left: CanvasStoredAssetScope, right: CanvasStoredAssetScope): boolean {
  return (
    typeof left === 'object' &&
    left !== null &&
    left.accountId === right.accountId &&
    left.projectId === right.projectId &&
    left.ownerId === right.ownerId
  );
}

function positiveBound(value: number | undefined, name: string, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    fail('invalid-configuration', `${name} must be a positive safe integer`);
  }
  return resolved;
}

function dimension(value: number | undefined, name: string): number | null {
  if (value === undefined) return null;
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_DIMENSION) {
    fail('invalid-input', `${name} must be a positive bounded integer`);
  }
  return value;
}

function duration(value: number | undefined): number | null {
  if (value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    fail('invalid-input', 'durationMs must be a non-negative safe integer');
  }
  return value;
}

function normalizeMime(value: string, allowed: ReadonlySet<string>): string {
  if (typeof value !== 'string') fail('unsupported-mime', 'MIME type must be a string');
  const normalized = value.trim().toLowerCase();
  if (!allowed.has(normalized)) fail('unsupported-mime', `MIME type is not allowed: ${normalized}`);
  return normalized;
}

function validateBlob(
  bytes: Blob,
  mimeType: string,
  maxBytes: number,
  sizeCode: 'asset-too-large' | 'thumbnail-too-large',
): void {
  if (typeof Blob === 'undefined' || !(bytes instanceof Blob)) {
    fail('invalid-input', 'asset bytes must be an immutable Blob');
  }
  if (!Number.isSafeInteger(bytes.size) || bytes.size <= 0) {
    fail('invalid-input', 'asset bytes must not be empty');
  }
  if (bytes.size > maxBytes) fail(sizeCode, `asset exceeds ${maxBytes} bytes`);
  if (bytes.type && bytes.type.trim().toLowerCase() !== mimeType) {
    fail('mime-mismatch', 'declared MIME type does not match Blob.type');
  }
}

function validateFilename(filename: string): string {
  if (
    typeof filename !== 'string' ||
    filename.length === 0 ||
    filename.length > 255 ||
    filename !== filename.trim() ||
    UNSAFE_FILENAME.test(filename)
  ) {
    fail('invalid-input', 'filename must be a bounded basename without control characters');
  }
  return filename;
}

async function sha256(bytes: Blob, cryptoProvider: Pick<Crypto, 'subtle'>): Promise<string> {
  let digest: ArrayBuffer;
  try {
    digest = await cryptoProvider.subtle.digest('SHA-256', await bytes.arrayBuffer());
  } catch (error) {
    fail('checksum-unavailable', 'WebCrypto SHA-256 failed', error);
  }
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function checksum(digest: string): CanvasStoredAsset['checksum'] {
  return Object.freeze({ algorithm: 'sha-256', digest });
}

function contentId(digest: string): string {
  return `asset_${digest}`;
}

function contentKey(digest: string): string {
  return `sha256/${digest}`;
}

function freezeTicket(ticket: CanvasAssetQuotaTicket): CanvasAssetQuotaTicket {
  return Object.freeze({
    id: ticket.id,
    accountId: ticket.accountId,
    projectId: ticket.projectId,
    ownerId: ticket.ownerId,
    byteSize: ticket.byteSize,
    checksumSha256: ticket.checksumSha256,
    mimeType: ticket.mimeType,
    expiresAt: ticket.expiresAt,
    proof: ticket.proof,
  });
}

function verifyTicket(
  ticket: CanvasAssetQuotaTicket,
  scope: CanvasStoredAssetScope,
  byteSize: number,
  digest: string,
  mimeType: string,
  now: number,
): CanvasAssetQuotaTicket {
  if (
    typeof ticket !== 'object' ||
    ticket === null ||
    !SAFE_ID.test(ticket.id) ||
    ticket.accountId !== scope.accountId ||
    ticket.projectId !== scope.projectId ||
    ticket.ownerId !== scope.ownerId ||
    ticket.byteSize !== byteSize ||
    ticket.checksumSha256 !== digest ||
    ticket.mimeType !== mimeType ||
    !Number.isSafeInteger(ticket.expiresAt) ||
    ticket.expiresAt <= now ||
    typeof ticket.proof !== 'string' ||
    ticket.proof.length === 0 ||
    ticket.proof.length > 4096
  ) {
    fail('quota-invalid', 'quota ticket does not exactly authorize this scoped upload');
  }
  return freezeTicket(ticket);
}

function freezeAsset(asset: CanvasStoredAsset): CanvasStoredAsset {
  const thumbnail =
    asset.thumbnail === null
      ? null
      : Object.freeze({
          ...asset.thumbnail,
          checksum: checksum(asset.thumbnail.checksum.digest),
        });
  return Object.freeze({
    ...asset,
    scope: freezeScope(asset.scope),
    checksum: checksum(asset.checksum.digest),
    storage: Object.freeze({ ...asset.storage }),
    thumbnail,
  });
}

function validateStoredAsset(
  asset: CanvasStoredAsset,
  scope: CanvasStoredAssetScope,
  allowedMimeTypes: ReadonlySet<string>,
  maxAssetBytes: number,
  maxThumbnailBytes: number,
  expectedId?: string,
): CanvasStoredAsset {
  const thumbnail = asset?.thumbnail;
  const thumbnailValid =
    thumbnail === null ||
    (typeof thumbnail === 'object' &&
      thumbnail !== null &&
      thumbnail.checksum?.algorithm === 'sha-256' &&
      SHA256.test(thumbnail.checksum.digest) &&
      thumbnail.assetId === contentId(thumbnail.checksum.digest) &&
      thumbnail.storageKey === contentKey(thumbnail.checksum.digest) &&
      Number.isSafeInteger(thumbnail.byteSize) &&
      thumbnail.byteSize > 0 &&
      thumbnail.byteSize <= maxThumbnailBytes &&
      typeof thumbnail.mimeType === 'string' &&
      allowedMimeTypes.has(thumbnail.mimeType) &&
      thumbnail.mimeType.startsWith('image/') &&
      Number.isSafeInteger(thumbnail.width) &&
      thumbnail.width > 0 &&
      thumbnail.width <= MAX_DIMENSION &&
      Number.isSafeInteger(thumbnail.height) &&
      thumbnail.height > 0 &&
      thumbnail.height <= MAX_DIMENSION);
  if (
    typeof asset !== 'object' ||
    asset === null ||
    !sameScope(asset.scope, scope) ||
    !SHA256.test(asset.checksum?.digest) ||
    asset.checksum.algorithm !== 'sha-256' ||
    asset.id !== contentId(asset.checksum.digest) ||
    (expectedId !== undefined && asset.id !== expectedId) ||
    !Number.isSafeInteger(asset.byteSize) ||
    asset.byteSize <= 0 ||
    asset.byteSize > maxAssetBytes ||
    typeof asset.filename !== 'string' ||
    asset.filename.length === 0 ||
    asset.filename.length > 255 ||
    asset.filename !== asset.filename.trim() ||
    UNSAFE_FILENAME.test(asset.filename) ||
    typeof asset.mimeType !== 'string' ||
    !allowedMimeTypes.has(asset.mimeType) ||
    (asset.width !== null &&
      (!Number.isSafeInteger(asset.width) || asset.width <= 0 || asset.width > MAX_DIMENSION)) ||
    (asset.height !== null &&
      (!Number.isSafeInteger(asset.height) || asset.height <= 0 || asset.height > MAX_DIMENSION)) ||
    (asset.durationMs !== null &&
      (!Number.isSafeInteger(asset.durationMs) || asset.durationMs < 0)) ||
    !SAFE_ID.test(asset.storage?.portId) ||
    asset.storage.storageKey !== contentKey(asset.checksum.digest) ||
    (asset.storage.capability !== 'native' &&
      asset.storage.capability !== 'browser' &&
      asset.storage.capability !== 'server') ||
    asset.storage.persistence !==
      ({ native: 'filesystem', browser: 'indexeddb', server: 'remote' } as const)[
        asset.storage.capability
      ] ||
    !Number.isSafeInteger(asset.createdAt) ||
    asset.createdAt < 0 ||
    !thumbnailValid
  ) {
    fail('metadata-corrupt', 'stored asset metadata is invalid or outside the requested scope');
  }
  return freezeAsset(asset);
}

export function createCanvasAssetStorage(options: CanvasAssetStorageOptions): CanvasAssetStorage {
  if (
    typeof options !== 'object' ||
    options === null ||
    !Array.isArray(options.binaryPorts) ||
    options.binaryPorts.length === 0 ||
    typeof options.metadata !== 'object' ||
    options.metadata === null
  ) {
    fail('invalid-configuration', 'binary and metadata ports are required');
  }
  if (typeof options.metadata.withExclusiveLease !== 'function') {
    fail('invalid-configuration', 'metadata port must provide scoped exclusive leases');
  }

  const maxAssetBytes = positiveBound(
    options.maxAssetBytes,
    'maxAssetBytes',
    DEFAULT_MAX_ASSET_BYTES,
  );
  const maxThumbnailBytes = positiveBound(
    options.maxThumbnailBytes,
    'maxThumbnailBytes',
    DEFAULT_MAX_THUMBNAIL_BYTES,
  );
  const allowedMimeTypes = new Set(
    (options.allowedMimeTypes ?? DEFAULT_ALLOWED_MIME_TYPES).map((value) =>
      value.trim().toLowerCase(),
    ),
  );
  if (allowedMimeTypes.size === 0 || allowedMimeTypes.has('')) {
    fail('invalid-configuration', 'allowedMimeTypes must contain non-empty MIME types');
  }
  const cryptoProvider = options.crypto ?? globalThis.crypto;
  if (!cryptoProvider?.subtle) {
    fail('checksum-unavailable', 'WebCrypto SubtleCrypto is required');
  }
  const now = options.now ?? Date.now;
  const ports = Array.from(options.binaryPorts) as CanvasAssetBinaryPort[];
  const portIds = new Set<string>();
  for (const port of ports) {
    if (!SAFE_ID.test(port.id) || portIds.has(port.id)) {
      fail('invalid-configuration', 'binary port ids must be unique safe identifiers');
    }
    portIds.add(port.id);
    if (!Number.isSafeInteger(port.maxAssetBytes) || port.maxAssetBytes <= 0) {
      fail('invalid-configuration', `binary port ${port.id} has an invalid byte limit`);
    }
    if (
      port.capability !== 'native' &&
      port.capability !== 'browser' &&
      port.capability !== 'server'
    ) {
      fail('invalid-configuration', `binary port ${port.id} has an invalid capability`);
    }
    const expectedPersistence: Record<CanvasAssetStorageCapability, CanvasAssetPersistenceKind> = {
      native: 'filesystem',
      browser: 'indexeddb',
      server: 'remote',
    };
    if (port.persistence !== expectedPersistence[port.capability]) {
      const detail =
        String(port.persistence).toLowerCase() === 'localstorage'
          ? 'localStorage is forbidden for canvas binary assets'
          : `binary port ${port.id} has an incompatible persistence capability`;
      fail('invalid-configuration', detail);
    }
    if (typeof port.withExclusiveLease !== 'function') {
      fail('invalid-configuration', `binary port ${port.id} must provide scoped exclusive leases`);
    }
  }

  async function selectPort(
    target: CanvasAssetStorageTarget,
    byteSize: number,
  ): Promise<CanvasAssetBinaryPort> {
    const priority = target === 'server' ? (['server'] as const) : (['native', 'browser'] as const);
    for (const capability of priority) {
      for (const port of ports) {
        if (
          port.capability === capability &&
          byteSize <= port.maxAssetBytes &&
          (await port.isAvailable())
        ) {
          return port;
        }
      }
    }
    fail('storage-unavailable', `no ${target} storage capability can accept this asset`);
  }

  async function writeContent(
    port: CanvasAssetBinaryPort,
    valueScope: CanvasStoredAssetScope,
    bytes: Blob,
    digest: string,
    mimeType: string,
  ): Promise<{ readonly storageKey: string; readonly created: boolean }> {
    const storageKey = contentKey(digest);
    let exists: boolean;
    try {
      exists = await port.has(valueScope, storageKey);
    } catch (error) {
      fail('content-write-failed', 'failed to check content-addressed storage', error);
    }
    if (exists) {
      const existing = await port.read(valueScope, storageKey);
      if (
        !(existing instanceof Blob) ||
        existing.size !== bytes.size ||
        (existing.type !== '' && existing.type.trim().toLowerCase() !== mimeType) ||
        (await sha256(existing, cryptoProvider)) !== digest
      ) {
        fail('checksum-mismatch', 'existing content-addressed bytes failed integrity validation');
      }
      return Object.freeze({ storageKey, created: false });
    }

    let quotaTicket: CanvasAssetQuotaTicket | undefined;
    if (port.capability === 'server') {
      if (!options.quota) fail('quota-required', 'server uploads require a quota authority');
      let issued: CanvasAssetQuotaTicket;
      try {
        issued = await options.quota.authorize(valueScope, {
          byteSize: bytes.size,
          checksumSha256: digest,
          mimeType,
        });
      } catch (error) {
        fail('quota-invalid', 'quota authority rejected the upload', error);
      }
      quotaTicket = verifyTicket(issued, valueScope, bytes.size, digest, mimeType, now());
    }

    try {
      await port.write(
        valueScope,
        storageKey,
        bytes,
        Object.freeze({
          checksumSha256: digest,
          byteSize: bytes.size,
          mimeType,
          ...(quotaTicket === undefined ? {} : { quotaTicket }),
        }),
      );
    } catch (error) {
      fail('content-write-failed', 'binary content write failed', error);
    }
    return Object.freeze({ storageKey, created: true });
  }

  async function removeCreated(
    port: CanvasAssetBinaryPort,
    valueScope: CanvasStoredAssetScope,
    storageKeys: readonly string[],
  ): Promise<unknown | undefined> {
    let firstError: unknown;
    for (const storageKey of [...storageKeys].reverse()) {
      try {
        await port.remove(valueScope, storageKey);
      } catch (error) {
        firstError ??= error;
      }
    }
    return firstError;
  }

  async function withContentLeases<T>(
    port: CanvasAssetBinaryPort,
    valueScope: CanvasStoredAssetScope,
    storageKeys: readonly string[],
    operation: () => Promise<T>,
  ): Promise<T> {
    const keys = [...new Set(storageKeys)].sort((left, right) => left.localeCompare(right));
    const acquire = (index: number): Promise<T> =>
      index === keys.length
        ? operation()
        : port.withExclusiveLease(valueScope, keys[index], () => acquire(index + 1));
    return acquire(0);
  }

  function metadataPort(asset: CanvasStoredAsset): CanvasAssetBinaryPort {
    const port = ports.find((candidate) => candidate.id === asset.storage.portId);
    if (
      port === undefined ||
      port.capability !== asset.storage.capability ||
      port.persistence !== asset.storage.persistence
    ) {
      fail('metadata-corrupt', 'asset metadata names an unavailable or mismatched storage port');
    }
    return port;
  }

  async function verifyContent(
    port: CanvasAssetBinaryPort,
    valueScope: CanvasStoredAssetScope,
    storageKey: string,
    byteSize: number,
    digest: string,
    mimeType: string,
  ): Promise<Blob> {
    const bytes = await port.read(valueScope, storageKey);
    if (bytes === undefined) {
      fail('content-not-found', 'asset content is missing');
    }
    if (
      !(bytes instanceof Blob) ||
      bytes.size !== byteSize ||
      (bytes.type !== '' && bytes.type.trim().toLowerCase() !== mimeType)
    ) {
      fail('checksum-mismatch', 'stored asset bytes do not match metadata');
    }
    if ((await sha256(bytes, cryptoProvider)) !== digest) {
      fail('checksum-mismatch', 'stored asset SHA-256 does not match metadata');
    }
    return bytes;
  }

  const store: CanvasAssetStorage['store'] = async (rawScope, request) => {
    const valueScope = validateScope(rawScope);
    if (typeof request !== 'object' || request === null) {
      fail('invalid-input', 'store request must be an object');
    }
    const mimeType = normalizeMime(request.mimeType, allowedMimeTypes);
    validateBlob(request.bytes, mimeType, maxAssetBytes, 'asset-too-large');
    const filename = validateFilename(request.filename);
    const width = dimension(request.width, 'width');
    const height = dimension(request.height, 'height');
    const durationMs = duration(request.durationMs);
    const target = request.target ?? 'local';
    if (target !== 'local' && target !== 'server') {
      fail('invalid-input', 'storage target must be local or server');
    }

    const digest = await sha256(request.bytes, cryptoProvider);
    const id = contentId(digest);
    let thumbnailInput: Readonly<{
      bytes: Blob;
      mimeType: string;
      width: number;
      height: number;
      digest: string;
    }> | null = null;
    if (request.thumbnail !== undefined) {
      const thumbnailMime = normalizeMime(request.thumbnail.mimeType, allowedMimeTypes);
      if (!thumbnailMime.startsWith('image/')) {
        fail('unsupported-mime', 'thumbnail MIME type must be an image');
      }
      validateBlob(
        request.thumbnail.bytes,
        thumbnailMime,
        maxThumbnailBytes,
        'thumbnail-too-large',
      );
      const thumbnailWidth = dimension(request.thumbnail.width, 'thumbnail.width');
      const thumbnailHeight = dimension(request.thumbnail.height, 'thumbnail.height');
      if (thumbnailWidth === null || thumbnailHeight === null) {
        fail('invalid-input', 'thumbnail dimensions are required');
      }
      const thumbnailDigest = await sha256(request.thumbnail.bytes, cryptoProvider);
      thumbnailInput = Object.freeze({
        bytes: request.thumbnail.bytes,
        mimeType: thumbnailMime,
        width: thumbnailWidth,
        height: thumbnailHeight,
        digest: thumbnailDigest,
      });
    }

    return options.metadata.withExclusiveLease(valueScope, id, async () => {
      const rawExisting = await options.metadata.get(valueScope, id);
      if (rawExisting !== undefined) {
        const existing = validateStoredAsset(
          rawExisting,
          valueScope,
          allowedMimeTypes,
          maxAssetBytes,
          maxThumbnailBytes,
          id,
        );
        const existingPort = metadataPort(existing);
        const existingKeys = [
          existing.storage.storageKey,
          ...(existing.thumbnail === null ? [] : [existing.thumbnail.storageKey]),
        ];
        return withContentLeases(existingPort, valueScope, existingKeys, async () => {
          await verifyContent(
            existingPort,
            valueScope,
            existing.storage.storageKey,
            existing.byteSize,
            existing.checksum.digest,
            existing.mimeType,
          );
          if (existing.thumbnail !== null) {
            await verifyContent(
              existingPort,
              valueScope,
              existing.thumbnail.storageKey,
              existing.thumbnail.byteSize,
              existing.thumbnail.checksum.digest,
              existing.thumbnail.mimeType,
            );
          }
          return existing;
        });
      }

      const port = await selectPort(target, request.bytes.size);
      const storageKeys = [
        contentKey(digest),
        ...(thumbnailInput === null ? [] : [contentKey(thumbnailInput.digest)]),
      ];
      return withContentLeases(port, valueScope, storageKeys, async () => {
        const createdKeys: string[] = [];
        let thumbnail: CanvasStoredAssetThumbnail | null = null;
        if (thumbnailInput !== null) {
          const thumbnailWrite = await writeContent(
            port,
            valueScope,
            thumbnailInput.bytes,
            thumbnailInput.digest,
            thumbnailInput.mimeType,
          );
          if (thumbnailWrite.created) createdKeys.push(thumbnailWrite.storageKey);
          thumbnail = Object.freeze({
            assetId: contentId(thumbnailInput.digest),
            checksum: checksum(thumbnailInput.digest),
            byteSize: thumbnailInput.bytes.size,
            mimeType: thumbnailInput.mimeType,
            width: thumbnailInput.width,
            height: thumbnailInput.height,
            storageKey: thumbnailWrite.storageKey,
          });
        }

        let mainWrite: { readonly storageKey: string; readonly created: boolean };
        try {
          mainWrite = await writeContent(port, valueScope, request.bytes, digest, mimeType);
          if (mainWrite.created) createdKeys.push(mainWrite.storageKey);
        } catch (error) {
          const rollbackError = await removeCreated(port, valueScope, createdKeys);
          if (rollbackError !== undefined) {
            fail('content-write-failed', 'content write and compensation both failed', {
              error,
              rollbackError,
            });
          }
          throw error;
        }

        const asset = freezeAsset({
          id,
          scope: valueScope,
          filename,
          mimeType,
          byteSize: request.bytes.size,
          checksum: checksum(digest),
          width,
          height,
          durationMs,
          storage: Object.freeze({
            portId: port.id,
            capability: port.capability,
            persistence: port.persistence,
            storageKey: mainWrite.storageKey,
          }),
          thumbnail,
          createdAt: now(),
        });

        try {
          await options.metadata.put(valueScope, asset);
        } catch (error) {
          const rollbackError = await removeCreated(port, valueScope, createdKeys);
          fail(
            'metadata-write-failed',
            rollbackError === undefined
              ? 'metadata publication failed; newly written content was removed'
              : 'metadata publication failed and content compensation was incomplete',
            rollbackError === undefined ? error : { error, rollbackError },
          );
        }
        return asset;
      });
    });
  };

  const read: CanvasAssetStorage['read'] = async (rawScope, assetId) => {
    const valueScope = validateScope(rawScope);
    if (typeof assetId !== 'string' || !/^asset_[a-f0-9]{64}$/.test(assetId)) {
      fail('invalid-input', 'assetId must be a content-addressed canvas asset id');
    }
    const rawMetadata = await options.metadata.get(valueScope, assetId);
    if (rawMetadata === undefined) fail('asset-not-found', 'asset is not present in this scope');
    const metadata = validateStoredAsset(
      rawMetadata,
      valueScope,
      allowedMimeTypes,
      maxAssetBytes,
      maxThumbnailBytes,
      assetId,
    );
    const port = metadataPort(metadata);
    return port.withExclusiveLease(valueScope, metadata.storage.storageKey, async () => {
      const bytes = await verifyContent(
        port,
        valueScope,
        metadata.storage.storageKey,
        metadata.byteSize,
        metadata.checksum.digest,
        metadata.mimeType,
      );
      return Object.freeze({ metadata, bytes });
    });
  };

  const planOrphanCleanup: CanvasAssetStorage['planOrphanCleanup'] = async (rawScope) => {
    const valueScope = validateScope(rawScope);
    const records = await options.metadata.list(valueScope);
    const liveByPort = new Map<string, Set<string>>();
    for (const rawRecord of records) {
      const record = validateStoredAsset(
        rawRecord,
        valueScope,
        allowedMimeTypes,
        maxAssetBytes,
        maxThumbnailBytes,
      );
      metadataPort(record);
      const live = liveByPort.get(record.storage.portId) ?? new Set<string>();
      live.add(record.storage.storageKey);
      if (record.thumbnail !== null) live.add(record.thumbnail.storageKey);
      liveByPort.set(record.storage.portId, live);
    }

    const entries: CanvasAssetOrphanCleanupEntry[] = [];
    for (const port of ports) {
      const live = liveByPort.get(port.id) ?? new Set<string>();
      const keys = await port.list(valueScope);
      for (const storageKey of keys) {
        if (typeof storageKey !== 'string' || storageKey.length === 0 || storageKey.length > 1024) {
          fail('metadata-corrupt', `storage port ${port.id} returned an invalid storage key`);
        }
        if (!live.has(storageKey)) {
          entries.push(Object.freeze({ portId: port.id, storageKey }));
        }
      }
    }
    entries.sort(
      (left, right) =>
        left.portId.localeCompare(right.portId) || left.storageKey.localeCompare(right.storageKey),
    );
    return Object.freeze({
      scope: valueScope,
      entries: Object.freeze(entries),
      createdAt: now(),
    });
  };

  const cleanupOrphans: CanvasAssetStorage['cleanupOrphans'] = async (rawScope, plan) => {
    const valueScope = validateScope(rawScope);
    if (
      typeof plan !== 'object' ||
      plan === null ||
      typeof plan.scope !== 'object' ||
      plan.scope === null ||
      !sameScope(plan.scope, valueScope) ||
      !Array.isArray(plan.entries) ||
      !Number.isSafeInteger(plan.createdAt) ||
      plan.createdAt < 0
    ) {
      fail('cleanup-plan-invalid', 'cleanup plan is not bound to the requested scope');
    }
    for (const entry of plan.entries) {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        typeof entry.portId !== 'string' ||
        !SAFE_ID.test(entry.portId) ||
        typeof entry.storageKey !== 'string' ||
        entry.storageKey.length === 0 ||
        entry.storageKey.length > 1024
      ) {
        fail('cleanup-plan-invalid', 'cleanup plan contains an invalid entry');
      }
      const port = ports.find((candidate) => candidate.id === entry.portId);
      if (port === undefined) {
        fail('cleanup-plan-invalid', 'cleanup plan names an unknown storage port');
      }
      await port.withExclusiveLease(valueScope, entry.storageKey, async () => {
        const records = await options.metadata.list(valueScope);
        const live = records.some((rawRecord) => {
          const record = validateStoredAsset(
            rawRecord,
            valueScope,
            allowedMimeTypes,
            maxAssetBytes,
            maxThumbnailBytes,
          );
          metadataPort(record);
          return (
            record.storage.portId === port.id &&
            (record.storage.storageKey === entry.storageKey ||
              record.thumbnail?.storageKey === entry.storageKey)
          );
        });
        if (!live) await port.remove(valueScope, entry.storageKey);
      });
    }
  };

  return Object.freeze({ store, read, planOrphanCleanup, cleanupOrphans });
}
