/**
 * Canvas video and audio domain slice.
 *
 * Framework-agnostic, deterministic, side-effect-free contracts for stable
 * media references and immutable playback state. A media reference stores safe
 * metadata only: a validated local or remote source, kind-specific MIME type,
 * filename, byte size, checksum, optional duration and video dimensions. Video
 * states add poster-frame and crop metadata; audio states add waveform
 * metadata. Both support user-controlled play/pause/mute/timestamp, trim
 * markers, transcript and project-file links, and external open actions. Media
 * never auto-plays: creation always yields a paused state and playback only
 * changes through an explicit `updateMediaPlayback` transition. Source
 * validation fails closed through the shared canvas security primitives;
 * structural validation fails closed through a local `CanvasMediaError`.
 */
import {
  CANVAS_ASSET_SOURCE_KINDS,
  CanvasAssetError,
  normalizeAssetChecksum,
  normalizeAssetFilename,
  normalizeAssetOpenDescriptor,
  normalizeCanvasImageCrop,
  type CanvasAssetChecksum,
  type CanvasAssetId,
  type CanvasAssetOpenDescriptor,
  type CanvasAssetSourceKind,
  type CanvasImageCrop,
} from './assets';
import {
  CANVAS_ID_PATTERN,
  CANVAS_MAX_TIMESTAMP,
  type CanvasBlockId,
  type CanvasOwnerId,
  type CanvasProjectId,
  type CanvasTimestamp,
} from './contracts';
import {
  CANVAS_MAX_ASSET_BYTES,
  CANVAS_MAX_ASSET_DIMENSION,
  assertSafeCanvasImportPath,
  sanitizeCanvasUrl,
} from './security';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type CanvasMediaErrorCode =
  | 'invalid-type'
  | 'invalid-id'
  | 'invalid-timestamp'
  | 'invalid-number'
  | 'unsupported-value'
  | 'scope-violation'
  | 'missing-asset';

export class CanvasMediaError extends Error {
  readonly code: CanvasMediaErrorCode;
  readonly path: string;

  constructor(code: CanvasMediaErrorCode, path: string, message: string) {
    super('Canvas media check failed (' + code + ') at ' + path + ': ' + message);
    this.name = 'CanvasMediaError';
    this.code = code;
    this.path = path;
  }
}

function failMedia(code: CanvasMediaErrorCode, path: string, message: string): never {
  throw new CanvasMediaError(code, path, message);
}

// ---------------------------------------------------------------------------
// Constants and branded identifiers
// ---------------------------------------------------------------------------

export const CANVAS_MEDIA_KINDS = ['video', 'audio'] as const;
export type CanvasMediaKind = (typeof CANVAS_MEDIA_KINDS)[number];

export const CANVAS_SAFE_VIDEO_MIME_TYPES = Object.freeze(['video/mp4', 'video/webm', 'video/ogg']);

export const CANVAS_SAFE_AUDIO_MIME_TYPES = Object.freeze([
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/aac',
  'audio/flac',
  'audio/webm',
]);

export const CANVAS_SAFE_MEDIA_IMPORT_EXTENSIONS = Object.freeze([
  '.mp4',
  '.webm',
  '.ogv',
  '.ogg',
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.flac',
]);

/** Domain-level autoplay guard. Media is always created paused. */
export const CANVAS_MEDIA_AUTOPLAY_ALLOWED = false;

export const CANVAS_MAX_WAVEFORM_SAMPLES = 4096;
export const CANVAS_MEDIA_MAX_DURATION_MS = 86_400_000;

const LANGUAGE_PATTERN = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

declare const canvasMediaBrand: unique symbol;

export type CanvasMediaId = string & { [canvasMediaBrand]: 'CanvasMediaId' };

// ---------------------------------------------------------------------------
// Data contracts
// ---------------------------------------------------------------------------

export interface CanvasMediaReference {
  readonly id: CanvasMediaId;
  readonly projectId: CanvasProjectId;
  readonly ownerId: CanvasOwnerId;
  readonly kind: CanvasMediaKind;
  readonly sourceKind: CanvasAssetSourceKind;
  readonly source: string;
  readonly mimeType: string;
  readonly filename: string;
  readonly byteSize: number;
  readonly checksum: CanvasAssetChecksum;
  readonly durationMs: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly missing: boolean;
  readonly createdAt: CanvasTimestamp;
}

export interface CanvasPosterReference {
  readonly assetId: CanvasAssetId;
  readonly source: string;
  readonly checksum: CanvasAssetChecksum;
  readonly width: number;
  readonly height: number;
  readonly timeMs: number;
}

export interface CanvasWaveformMetadata {
  readonly samples: readonly number[];
  readonly intervalMs: number;
  readonly channels: number;
}

export interface CanvasMediaTrim {
  readonly startMs: number;
  readonly endMs: number;
}

export interface CanvasMediaPlayback {
  readonly playing: boolean;
  readonly muted: boolean;
  readonly timeMs: number;
  readonly volume: number;
}

export interface CanvasTranscriptLink {
  readonly blockId: CanvasBlockId | null;
  readonly source: string;
  readonly language: string | null;
}

export interface CanvasProjectFileLink {
  readonly source: string;
  readonly filename: string;
  readonly checksum: CanvasAssetChecksum | null;
}

export interface CanvasPosterInput {
  readonly assetId: string;
  readonly source: string;
  readonly checksum: CanvasAssetChecksum;
  readonly width: number;
  readonly height: number;
  readonly timeMs: number;
}

export interface CanvasTranscriptLinkInput {
  readonly blockId: string | null;
  readonly source: string;
  readonly language: string | null;
}

interface CanvasMediaStateBase {
  readonly reference: CanvasMediaReference;
  readonly playback: CanvasMediaPlayback;
  readonly trim: CanvasMediaTrim | null;
  readonly transcript: CanvasTranscriptLink | null;
  readonly projectFile: CanvasProjectFileLink | null;
  readonly open: CanvasAssetOpenDescriptor | null;
}

export interface CanvasVideoState extends CanvasMediaStateBase {
  readonly kind: 'video';
  readonly poster: CanvasPosterReference | null;
  readonly crop: CanvasImageCrop | null;
}

export interface CanvasAudioState extends CanvasMediaStateBase {
  readonly kind: 'audio';
  readonly waveform: CanvasWaveformMetadata | null;
}

export type CanvasMediaState = CanvasVideoState | CanvasAudioState;

export interface CanvasMediaScope {
  readonly projectId: string;
  readonly ownerId: string;
}

export interface CanvasMediaPlaybackPatch {
  readonly playing?: boolean;
  readonly muted?: boolean;
  readonly timeMs?: number;
  readonly volume?: number;
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
      failMedia('unsupported-value', path + '.' + key, 'unexpected field "' + key + '"');
    }
  }
}

function assertMediaId(value: unknown, path: string): string {
  if (typeof value !== 'string' || !CANVAS_ID_PATTERN.test(value)) {
    failMedia(
      'invalid-id',
      path,
      'expected a stable id matching /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/',
    );
  }
  return value;
}

function assertMediaTimestamp(value: unknown, path: string): CanvasTimestamp {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    failMedia('invalid-timestamp', path, 'expected an integer timestamp');
  }
  if (value < 0 || value > CANVAS_MAX_TIMESTAMP) {
    failMedia(
      'invalid-timestamp',
      path,
      'timestamp out of range [0, ' + CANVAS_MAX_TIMESTAMP + ']',
    );
  }
  return value;
}

function assertPositiveBoundedInteger(value: unknown, path: string, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    failMedia('invalid-number', path, 'expected a safe integer');
  }
  if (value <= 0 || value > max) {
    failMedia('invalid-number', path, 'value out of range [1, ' + max + ']');
  }
  return value;
}

function assertFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    failMedia('invalid-number', path, 'expected a finite number');
  }
  return value;
}

// Wrappers that reuse the asset-domain validators but surface media errors.
// Security errors (unsafe URLs/paths) are intentionally allowed to propagate.

function mediaChecksum(input: unknown, path: string): CanvasAssetChecksum {
  try {
    return normalizeAssetChecksum(input, path);
  } catch (error) {
    if (error instanceof CanvasAssetError) {
      failMedia('unsupported-value', path, 'invalid checksum');
    }
    throw error;
  }
}

function mediaFilename(value: unknown, path: string): string {
  try {
    return normalizeAssetFilename(value, path);
  } catch (error) {
    if (error instanceof CanvasAssetError) {
      failMedia('unsupported-value', path, 'invalid filename');
    }
    throw error;
  }
}

function mediaCrop(input: unknown, path: string): CanvasImageCrop {
  try {
    return normalizeCanvasImageCrop(input, path);
  } catch (error) {
    if (error instanceof CanvasAssetError) {
      failMedia('invalid-number', path, 'invalid crop');
    }
    throw error;
  }
}

function mediaOpen(input: unknown, path: string): CanvasAssetOpenDescriptor {
  try {
    return normalizeAssetOpenDescriptor(input, path, CANVAS_SAFE_MEDIA_IMPORT_EXTENSIONS);
  } catch (error) {
    if (error instanceof CanvasAssetError) {
      failMedia('unsupported-value', path, 'invalid open descriptor');
    }
    throw error;
  }
}

function assertWithinDuration(value: number, durationMs: number | null, path: string): void {
  if (durationMs !== null && value > durationMs) {
    failMedia('invalid-number', path, 'value exceeds the media duration');
  }
}

// ---------------------------------------------------------------------------
// Media reference validation
// ---------------------------------------------------------------------------

const REFERENCE_KEYS = new Set([
  'id',
  'projectId',
  'ownerId',
  'kind',
  'sourceKind',
  'source',
  'mimeType',
  'filename',
  'byteSize',
  'checksum',
  'durationMs',
  'width',
  'height',
  'missing',
  'createdAt',
]);

export function validateCanvasMediaReference(input: unknown): CanvasMediaReference {
  if (!isPlainObject(input)) failMedia('invalid-type', 'reference', 'expected an object');
  assertExactKeys(input, REFERENCE_KEYS, 'reference');

  const id = assertMediaId(input.id, 'reference.id') as CanvasMediaId;
  const projectId = assertMediaId(input.projectId, 'reference.projectId') as CanvasProjectId;
  const ownerId = assertMediaId(input.ownerId, 'reference.ownerId') as CanvasOwnerId;

  const kind = input.kind;
  if (typeof kind !== 'string' || !CANVAS_MEDIA_KINDS.includes(kind as CanvasMediaKind)) {
    failMedia('unsupported-value', 'reference.kind', 'unsupported media kind');
  }
  const mediaKind = kind as CanvasMediaKind;

  const sourceKind = input.sourceKind;
  if (
    typeof sourceKind !== 'string' ||
    !CANVAS_ASSET_SOURCE_KINDS.includes(sourceKind as CanvasAssetSourceKind)
  ) {
    failMedia('unsupported-value', 'reference.sourceKind', 'unsupported source kind');
  }
  const kind2 = sourceKind as CanvasAssetSourceKind;

  const source =
    kind2 === 'remote'
      ? sanitizeCanvasUrl(input.source, 'reference.source')
      : assertSafeCanvasImportPath(
          input.source,
          { allowedExtensions: CANVAS_SAFE_MEDIA_IMPORT_EXTENSIONS },
          'reference.source',
        );

  if (typeof input.mimeType !== 'string') {
    failMedia('invalid-type', 'reference.mimeType', 'expected a string MIME type');
  }
  const mimeType = input.mimeType.trim().toLowerCase();
  const allowlist =
    mediaKind === 'video' ? CANVAS_SAFE_VIDEO_MIME_TYPES : CANVAS_SAFE_AUDIO_MIME_TYPES;
  if (!allowlist.includes(mimeType)) {
    failMedia('unsupported-value', 'reference.mimeType', 'unsupported MIME type for ' + mediaKind);
  }

  const filename = mediaFilename(input.filename, 'reference.filename');
  const byteSize = assertPositiveBoundedInteger(
    input.byteSize,
    'reference.byteSize',
    CANVAS_MAX_ASSET_BYTES,
  );
  const checksum = mediaChecksum(input.checksum, 'reference.checksum');

  let durationMs: number | null = null;
  if (input.durationMs !== null && input.durationMs !== undefined) {
    durationMs = assertPositiveBoundedInteger(
      input.durationMs,
      'reference.durationMs',
      CANVAS_MEDIA_MAX_DURATION_MS,
    );
  }

  const width =
    input.width === null || input.width === undefined
      ? null
      : assertPositiveBoundedInteger(input.width, 'reference.width', CANVAS_MAX_ASSET_DIMENSION);
  const height =
    input.height === null || input.height === undefined
      ? null
      : assertPositiveBoundedInteger(input.height, 'reference.height', CANVAS_MAX_ASSET_DIMENSION);
  if (mediaKind === 'audio' && (width !== null || height !== null)) {
    failMedia('unsupported-value', 'reference', 'audio references must not carry dimensions');
  }

  if (typeof input.missing !== 'boolean') {
    failMedia('invalid-type', 'reference.missing', 'expected a boolean');
  }
  const createdAt = assertMediaTimestamp(input.createdAt, 'reference.createdAt');

  return deepFreeze({
    id,
    projectId,
    ownerId,
    kind: mediaKind,
    sourceKind: kind2,
    source,
    mimeType,
    filename,
    byteSize,
    checksum,
    durationMs,
    width,
    height,
    missing: input.missing,
    createdAt,
  });
}

// ---------------------------------------------------------------------------
// Sub-structure normalizers
// ---------------------------------------------------------------------------

function normalizeMediaPlayback(
  input: unknown,
  path: string,
  durationMs: number | null,
): CanvasMediaPlayback {
  if (!isPlainObject(input)) failMedia('invalid-type', path, 'expected a playback object');
  assertExactKeys(input, new Set(['playing', 'muted', 'timeMs', 'volume']), path);
  if (typeof input.playing !== 'boolean') {
    failMedia('invalid-type', path + '.playing', 'expected a boolean');
  }
  if (typeof input.muted !== 'boolean') {
    failMedia('invalid-type', path + '.muted', 'expected a boolean');
  }
  const timeMs = assertFiniteNumber(input.timeMs, path + '.timeMs');
  if (timeMs < 0) failMedia('invalid-number', path + '.timeMs', 'timestamp must not be negative');
  assertWithinDuration(timeMs, durationMs, path + '.timeMs');
  const volume = assertFiniteNumber(input.volume, path + '.volume');
  if (volume < 0 || volume > 1) {
    failMedia('invalid-number', path + '.volume', 'volume out of range [0, 1]');
  }
  return { playing: input.playing, muted: input.muted, timeMs, volume };
}

function normalizeMediaTrim(
  input: unknown,
  path: string,
  durationMs: number | null,
): CanvasMediaTrim {
  if (!isPlainObject(input)) failMedia('invalid-type', path, 'expected a trim object');
  assertExactKeys(input, new Set(['startMs', 'endMs']), path);
  const startMs = assertFiniteNumber(input.startMs, path + '.startMs');
  const endMs = assertFiniteNumber(input.endMs, path + '.endMs');
  if (startMs < 0) failMedia('invalid-number', path + '.startMs', 'start must not be negative');
  if (endMs <= startMs) failMedia('invalid-number', path, 'trim end must follow start');
  assertWithinDuration(endMs, durationMs, path + '.endMs');
  return { startMs, endMs };
}

function normalizePoster(
  input: unknown,
  path: string,
  durationMs: number | null,
): CanvasPosterReference {
  if (!isPlainObject(input)) failMedia('invalid-type', path, 'expected a poster object');
  assertExactKeys(
    input,
    new Set(['assetId', 'source', 'checksum', 'width', 'height', 'timeMs']),
    path,
  );
  const assetId = assertMediaId(input.assetId, path + '.assetId') as CanvasAssetId;
  const source = sanitizeCanvasUrl(input.source, path + '.source');
  const checksum = mediaChecksum(input.checksum, path + '.checksum');
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
  const timeMs = assertFiniteNumber(input.timeMs, path + '.timeMs');
  if (timeMs < 0) failMedia('invalid-number', path + '.timeMs', 'poster time must not be negative');
  assertWithinDuration(timeMs, durationMs, path + '.timeMs');
  return { assetId, source, checksum, width, height, timeMs };
}

function normalizeWaveform(input: unknown, path: string): CanvasWaveformMetadata {
  if (!isPlainObject(input)) failMedia('invalid-type', path, 'expected a waveform object');
  assertExactKeys(input, new Set(['samples', 'intervalMs', 'channels']), path);
  if (!Array.isArray(input.samples)) {
    failMedia('invalid-type', path + '.samples', 'expected an array of samples');
  }
  if (input.samples.length === 0) {
    failMedia('unsupported-value', path + '.samples', 'waveform must have at least one sample');
  }
  if (input.samples.length > CANVAS_MAX_WAVEFORM_SAMPLES) {
    failMedia('unsupported-value', path + '.samples', 'waveform has too many samples');
  }
  const samples = input.samples.map((sample, index) => {
    const value = assertFiniteNumber(sample, path + '.samples[' + index + ']');
    if (value < 0 || value > 1) {
      failMedia('invalid-number', path + '.samples[' + index + ']', 'sample out of range [0, 1]');
    }
    return value;
  });
  const intervalMs = assertFiniteNumber(input.intervalMs, path + '.intervalMs');
  if (intervalMs <= 0) {
    failMedia('invalid-number', path + '.intervalMs', 'interval must be positive');
  }
  if (input.channels !== 1 && input.channels !== 2) {
    failMedia('unsupported-value', path + '.channels', 'channels must be 1 or 2');
  }
  return { samples, intervalMs, channels: input.channels };
}

function normalizeTranscriptLink(input: unknown, path: string): CanvasTranscriptLink {
  if (!isPlainObject(input)) failMedia('invalid-type', path, 'expected a transcript link');
  assertExactKeys(input, new Set(['blockId', 'source', 'language']), path);
  const blockId =
    input.blockId === null || input.blockId === undefined
      ? null
      : (assertMediaId(input.blockId, path + '.blockId') as CanvasBlockId);
  const source = sanitizeCanvasUrl(input.source, path + '.source');
  let language: string | null = null;
  if (input.language !== null && input.language !== undefined) {
    if (typeof input.language !== 'string' || !LANGUAGE_PATTERN.test(input.language)) {
      failMedia('unsupported-value', path + '.language', 'unsupported language tag');
    }
    language = input.language;
  }
  return { blockId, source, language };
}

function normalizeProjectFileLink(input: unknown, path: string): CanvasProjectFileLink {
  if (!isPlainObject(input)) failMedia('invalid-type', path, 'expected a project-file link');
  assertExactKeys(input, new Set(['source', 'filename', 'checksum']), path);
  const source = sanitizeCanvasUrl(input.source, path + '.source');
  const filename = mediaFilename(input.filename, path + '.filename');
  const checksum =
    input.checksum === null || input.checksum === undefined
      ? null
      : mediaChecksum(input.checksum, path + '.checksum');
  return { source, filename, checksum };
}

// ---------------------------------------------------------------------------
// State factories
// ---------------------------------------------------------------------------

function pausedPlayback(): CanvasMediaPlayback {
  return { playing: false, muted: false, timeMs: 0, volume: 1 };
}

export function createCanvasVideo(reference: CanvasMediaReference): CanvasVideoState {
  const validated = validateCanvasMediaReference(reference);
  if (validated.kind !== 'video') {
    failMedia('unsupported-value', 'reference.kind', 'expected a video reference');
  }
  if (validated.missing) {
    failMedia('missing-asset', 'reference', 'cannot create playback for a missing reference');
  }
  return deepFreeze({
    kind: 'video',
    reference: validated,
    poster: null,
    playback: pausedPlayback(),
    crop: null,
    trim: null,
    transcript: null,
    projectFile: null,
    open: null,
  });
}

export function createCanvasAudio(reference: CanvasMediaReference): CanvasAudioState {
  const validated = validateCanvasMediaReference(reference);
  if (validated.kind !== 'audio') {
    failMedia('unsupported-value', 'reference.kind', 'expected an audio reference');
  }
  if (validated.missing) {
    failMedia('missing-asset', 'reference', 'cannot create playback for a missing reference');
  }
  return deepFreeze({
    kind: 'audio',
    reference: validated,
    waveform: null,
    playback: pausedPlayback(),
    trim: null,
    transcript: null,
    projectFile: null,
    open: null,
  });
}

// ---------------------------------------------------------------------------
// Immutable transitions
// ---------------------------------------------------------------------------

function requireState(state: unknown, path: string): Record<string, unknown> {
  if (!isPlainObject(state) || !isPlainObject(state.reference) || !isPlainObject(state.playback)) {
    failMedia('invalid-type', path, 'expected a media state object');
  }
  return state;
}

export function updateMediaPlayback(
  state: CanvasMediaState,
  patch: CanvasMediaPlaybackPatch,
): CanvasMediaState {
  requireState(state, 'state');
  const current = state.playback;
  const durationMs = state.reference.durationMs;

  const playing = patch.playing === undefined ? current.playing : patch.playing;
  if (typeof playing !== 'boolean') {
    failMedia('invalid-type', 'patch.playing', 'expected a boolean');
  }
  const muted = patch.muted === undefined ? current.muted : patch.muted;
  if (typeof muted !== 'boolean') {
    failMedia('invalid-type', 'patch.muted', 'expected a boolean');
  }
  const timeMs =
    patch.timeMs === undefined ? current.timeMs : assertFiniteNumber(patch.timeMs, 'patch.timeMs');
  if (timeMs < 0) failMedia('invalid-number', 'patch.timeMs', 'timestamp must not be negative');
  assertWithinDuration(timeMs, durationMs, 'patch.timeMs');
  const volume =
    patch.volume === undefined ? current.volume : assertFiniteNumber(patch.volume, 'patch.volume');
  if (volume < 0 || volume > 1) {
    failMedia('invalid-number', 'patch.volume', 'volume out of range [0, 1]');
  }

  if (
    playing === current.playing &&
    muted === current.muted &&
    timeMs === current.timeMs &&
    volume === current.volume
  ) {
    return state;
  }

  const playback: CanvasMediaPlayback = { playing, muted, timeMs, volume };
  return deepFreeze({ ...state, playback }) as CanvasMediaState;
}

export function setMediaTrim(
  state: CanvasMediaState,
  trim: CanvasMediaTrim | null,
): CanvasMediaState {
  requireState(state, 'state');
  const next = trim === null ? null : normalizeMediaTrim(trim, 'trim', state.reference.durationMs);
  return deepFreeze({ ...state, trim: next }) as CanvasMediaState;
}

export function setVideoPoster(
  state: CanvasMediaState,
  poster: CanvasPosterInput | null,
): CanvasVideoState {
  requireState(state, 'state');
  if (state.kind !== 'video') {
    failMedia('unsupported-value', 'state.kind', 'poster frames require a video state');
  }
  const next =
    poster === null ? null : normalizePoster(poster, 'poster', state.reference.durationMs);
  return deepFreeze({ ...state, poster: next }) as CanvasVideoState;
}

export function setVideoCrop(
  state: CanvasMediaState,
  crop: CanvasImageCrop | null,
): CanvasVideoState {
  requireState(state, 'state');
  if (state.kind !== 'video') {
    failMedia('unsupported-value', 'state.kind', 'crop requires a video state');
  }
  const next = crop === null ? null : mediaCrop(crop, 'crop');
  return deepFreeze({ ...state, crop: next }) as CanvasVideoState;
}

export function setAudioWaveform(
  state: CanvasMediaState,
  waveform: CanvasWaveformMetadata | null,
): CanvasAudioState {
  requireState(state, 'state');
  if (state.kind !== 'audio') {
    failMedia('unsupported-value', 'state.kind', 'waveform metadata requires an audio state');
  }
  const next = waveform === null ? null : normalizeWaveform(waveform, 'waveform');
  return deepFreeze({ ...state, waveform: next }) as CanvasAudioState;
}

export function linkMediaTranscript(
  state: CanvasMediaState,
  transcript: CanvasTranscriptLinkInput | null,
): CanvasMediaState {
  requireState(state, 'state');
  const next = transcript === null ? null : normalizeTranscriptLink(transcript, 'transcript');
  return deepFreeze({ ...state, transcript: next }) as CanvasMediaState;
}

export function linkMediaProjectFile(
  state: CanvasMediaState,
  projectFile: CanvasProjectFileLink | null,
): CanvasMediaState {
  requireState(state, 'state');
  const next = projectFile === null ? null : normalizeProjectFileLink(projectFile, 'projectFile');
  return deepFreeze({ ...state, projectFile: next }) as CanvasMediaState;
}

export function setMediaOpen(
  state: CanvasMediaState,
  open: CanvasAssetOpenDescriptor | null,
): CanvasMediaState {
  requireState(state, 'state');
  const next = open === null ? null : mediaOpen(open, 'open');
  return deepFreeze({ ...state, open: next }) as CanvasMediaState;
}

// ---------------------------------------------------------------------------
// Missing state and scope isolation
// ---------------------------------------------------------------------------

export function markMediaMissing(reference: CanvasMediaReference): CanvasMediaReference {
  if (reference.missing) return reference;
  return deepFreeze({ ...reference, missing: true });
}

export function restoreMedia(reference: CanvasMediaReference): CanvasMediaReference {
  if (!reference.missing) return reference;
  return deepFreeze({ ...reference, missing: false });
}

export function assertMediaScope(
  reference: CanvasMediaReference,
  scope: CanvasMediaScope,
): CanvasMediaReference {
  assertMediaId(scope.projectId, 'scope.projectId');
  assertMediaId(scope.ownerId, 'scope.ownerId');
  if (reference.projectId !== scope.projectId || reference.ownerId !== scope.ownerId) {
    failMedia(
      'scope-violation',
      'reference',
      'reference is outside the requested project/owner scope',
    );
  }
  return reference;
}

export function isMediaInScope(reference: CanvasMediaReference, scope: CanvasMediaScope): boolean {
  try {
    assertMediaScope(reference, scope);
    return true;
  } catch (error) {
    if (error instanceof CanvasMediaError) return false;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Full state parsing
// ---------------------------------------------------------------------------

const VIDEO_STATE_KEYS = new Set([
  'kind',
  'reference',
  'poster',
  'playback',
  'crop',
  'trim',
  'transcript',
  'projectFile',
  'open',
]);

const AUDIO_STATE_KEYS = new Set([
  'kind',
  'reference',
  'waveform',
  'playback',
  'trim',
  'transcript',
  'projectFile',
  'open',
]);

function optional<T>(value: unknown): T | null {
  return value === null || value === undefined ? null : (value as T);
}

export function validateCanvasMedia(input: unknown): CanvasMediaState {
  if (!isPlainObject(input)) failMedia('invalid-type', 'state', 'expected an object');

  if (input.kind === 'video') {
    assertExactKeys(input, VIDEO_STATE_KEYS, 'state');
    const reference = validateCanvasMediaReference(input.reference);
    if (reference.kind !== 'video') {
      failMedia(
        'unsupported-value',
        'state.reference',
        'reference kind does not match video state',
      );
    }
    const durationMs = reference.durationMs;
    return deepFreeze({
      kind: 'video',
      reference,
      poster:
        optional<CanvasPosterReference>(input.poster) === null
          ? null
          : normalizePoster(input.poster, 'state.poster', durationMs),
      playback: normalizeMediaPlayback(input.playback, 'state.playback', durationMs),
      crop:
        optional<CanvasImageCrop>(input.crop) === null ? null : mediaCrop(input.crop, 'state.crop'),
      trim:
        optional<CanvasMediaTrim>(input.trim) === null
          ? null
          : normalizeMediaTrim(input.trim, 'state.trim', durationMs),
      transcript:
        optional<CanvasTranscriptLink>(input.transcript) === null
          ? null
          : normalizeTranscriptLink(input.transcript, 'state.transcript'),
      projectFile:
        optional<CanvasProjectFileLink>(input.projectFile) === null
          ? null
          : normalizeProjectFileLink(input.projectFile, 'state.projectFile'),
      open:
        optional<CanvasAssetOpenDescriptor>(input.open) === null
          ? null
          : mediaOpen(input.open, 'state.open'),
    });
  }

  if (input.kind === 'audio') {
    assertExactKeys(input, AUDIO_STATE_KEYS, 'state');
    const reference = validateCanvasMediaReference(input.reference);
    if (reference.kind !== 'audio') {
      failMedia(
        'unsupported-value',
        'state.reference',
        'reference kind does not match audio state',
      );
    }
    const durationMs = reference.durationMs;
    return deepFreeze({
      kind: 'audio',
      reference,
      waveform:
        optional<CanvasWaveformMetadata>(input.waveform) === null
          ? null
          : normalizeWaveform(input.waveform, 'state.waveform'),
      playback: normalizeMediaPlayback(input.playback, 'state.playback', durationMs),
      trim:
        optional<CanvasMediaTrim>(input.trim) === null
          ? null
          : normalizeMediaTrim(input.trim, 'state.trim', durationMs),
      transcript:
        optional<CanvasTranscriptLink>(input.transcript) === null
          ? null
          : normalizeTranscriptLink(input.transcript, 'state.transcript'),
      projectFile:
        optional<CanvasProjectFileLink>(input.projectFile) === null
          ? null
          : normalizeProjectFileLink(input.projectFile, 'state.projectFile'),
      open:
        optional<CanvasAssetOpenDescriptor>(input.open) === null
          ? null
          : mediaOpen(input.open, 'state.open'),
    });
  }

  return failMedia('unsupported-value', 'state.kind', 'unsupported media state kind');
}

export function isCanvasMedia(value: unknown): value is CanvasMediaState {
  try {
    validateCanvasMedia(value);
    return true;
  } catch (error) {
    if (error instanceof CanvasMediaError) return false;
    if (error instanceof Error && error.name === 'CanvasSecurityError') return false;
    throw error;
  }
}
