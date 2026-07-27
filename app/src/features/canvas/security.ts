/**
 * Canvas security primitives.
 *
 * Framework-agnostic, deterministic, side-effect-free validators and
 * sanitizers for untrusted URL, rich-text, plain-text, code, import-path and
 * asset-metadata input that enters the canvas through paste, import, and media
 * layers. Every primitive fails closed: it rejects control characters,
 * dangerous URL schemes, path traversal, unsupported types, and oversized
 * input while allowing explicitly safe values.
 *
 * These are narrow typed primitives, not a full HTML/embed sandbox. Rich-text
 * sanitization removes the most dangerous constructs and then escapes all
 * residual markup so no live HTML or script survives; it does not add an HTML
 * parser dependency and does not claim to safely render arbitrary embeds.
 */

import { CANVAS_MAX_TEXT_LENGTH } from './contracts';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type CanvasSecurityErrorCode =
  | 'invalid-input'
  | 'oversized'
  | 'control-character'
  | 'unsafe-content'
  | 'unsafe-url'
  | 'unsafe-scheme'
  | 'unsafe-path'
  | 'path-traversal'
  | 'unsupported-type';

export class CanvasSecurityError extends Error {
  readonly code: CanvasSecurityErrorCode;
  readonly path: string;

  constructor(code: CanvasSecurityErrorCode, path: string, message: string) {
    super('Canvas security check failed (' + code + ') at ' + path + ': ' + message);
    this.name = 'CanvasSecurityError';
    this.code = code;
    this.path = path;
  }
}

function deny(code: CanvasSecurityErrorCode, path: string, message: string): never {
  throw new CanvasSecurityError(code, path, message);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** URL schemes that may appear in canvas links. Everything else fails closed. */
export const CANVAS_SAFE_URL_SCHEMES = Object.freeze(['https:', 'http:', 'mailto:']);

export const CANVAS_MAX_URL_LENGTH = 2048;
export const CANVAS_MAX_IMPORT_PATH_LENGTH = 1024;

/** Asset size ceiling, aligned with the canvas document size bound. */
export const CANVAS_MAX_ASSET_BYTES = 10_000_000;
export const CANVAS_MAX_ASSET_DIMENSION = 16_384;

/** Import file extensions treated as safe. SVG is excluded (scriptable). */
export const CANVAS_SAFE_IMPORT_EXTENSIONS = Object.freeze([
  '.md',
  '.markdown',
  '.txt',
  '.json',
  '.csv',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
]);

/** Asset MIME types treated as safe. SVG and HTML are excluded (scriptable). */
export const CANVAS_SAFE_ASSET_MIME_TYPES = Object.freeze([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
]);

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

const URL_CONTROL_PATTERN = /[\u0000-\u001f\u007f]/u;
const HTML_ENTITY_PATTERN = /&#/u;
const BIDI_OVERRIDE_PATTERN = /[\u202a-\u202e\u2066-\u2069]/u;
const TEXT_CONTROL_STRIP_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const CRLF_PATTERN = /\r\n?/g;
const URL_SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):/i;
const DANGEROUS_BLOCK_PATTERN =
  /<\s*(script|style|iframe|object|embed|svg|math|template|noscript|frame|frameset|applet|meta|link|base|form)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->|<![^>]*>/g;
const EVENT_HANDLER_PATTERN = /\son[a-z]+\s*=\s*[^\s>]+/gi;
const DANGEROUS_URL_ATTR_PATTERN =
  /\s(?:href|src|xlink:href|formaction|action|background)\s*=\s*[^\s>]*(?:javascript|vbscript|data)\s*:[^\s>]*/gi;
const WINDOWS_RESERVED_NAME_PATTERN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

export function isSafeCanvasUrl(value: unknown): boolean {
  try {
    sanitizeCanvasUrl(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates an untrusted URL and returns it trimmed. Fails closed on control
 * characters, HTML-entity obfuscation, backslashes, protocol-relative URLs,
 * and any scheme outside the safe allowlist. Relative references (no scheme)
 * are allowed once screened.
 */
export function sanitizeCanvasUrl(value: unknown, path = 'url'): string {
  if (typeof value !== 'string') deny('invalid-input', path, 'expected a string URL');
  const raw = value.trim();
  if (raw.length === 0) deny('invalid-input', path, 'URL is empty');
  if (raw.length > CANVAS_MAX_URL_LENGTH) deny('oversized', path, 'URL exceeds the length limit');
  if (URL_CONTROL_PATTERN.test(raw))
    deny('control-character', path, 'URL contains a control character');
  if (HTML_ENTITY_PATTERN.test(raw))
    deny('unsafe-content', path, 'URL contains HTML-entity encoding');
  if (raw.includes('\\')) deny('unsafe-url', path, 'URL contains a backslash');
  if (raw.startsWith('//')) deny('unsafe-url', path, 'protocol-relative URLs are not allowed');

  const schemeMatch = URL_SCHEME_PATTERN.exec(raw);
  if (schemeMatch === null) return raw;

  const scheme = schemeMatch[1].toLowerCase() + ':';
  if (!CANVAS_SAFE_URL_SCHEMES.includes(scheme)) {
    deny('unsafe-scheme', path, 'URL scheme is not allowed: ' + scheme);
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    deny('unsafe-url', path, 'URL is malformed');
  }
  if (!CANVAS_SAFE_URL_SCHEMES.includes(parsed.protocol)) {
    deny('unsafe-scheme', path, 'URL scheme is not allowed: ' + parsed.protocol);
  }
  if (parsed.protocol === 'mailto:') {
    if (!parsed.pathname.includes('@')) deny('unsafe-url', path, 'mailto URL is malformed');
  } else if (parsed.hostname.length === 0) {
    deny('unsafe-url', path, 'URL is missing a host');
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Text sanitization
// ---------------------------------------------------------------------------

function assertString(value: unknown, path: string): string {
  if (typeof value !== 'string') deny('invalid-input', path, 'expected a string');
  if (value.length > CANVAS_MAX_TEXT_LENGTH)
    deny('oversized', path, 'text exceeds the length limit');
  if (BIDI_OVERRIDE_PATTERN.test(value)) {
    deny('control-character', path, 'text contains bidi override characters');
  }
  return value;
}

function cleanText(value: string): string {
  return value.replace(CRLF_PATTERN, '\n').replace(TEXT_CONTROL_STRIP_PATTERN, '');
}

/** Escapes the five HTML metacharacters so text renders inert. */
export function escapeCanvasHtml(value: unknown, path = 'html'): string {
  const text = assertString(value, path);
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitizes untrusted plain text: normalizes newlines, strips null bytes and
 * control characters (preserving tabs and line feeds), rejects bidi overrides,
 * bounds length, and trims surrounding whitespace.
 */
export function sanitizeCanvasPlainText(value: unknown, path = 'text'): string {
  return cleanText(assertString(value, path)).trim();
}

/**
 * Sanitizes untrusted code-block content treated as inert text: normalizes
 * newlines and strips null/control and bidi characters while preserving
 * indentation and line breaks. Code is never executed.
 */
export function sanitizeCanvasCodeBlock(value: unknown, path = 'code'): string {
  return cleanText(assertString(value, path));
}

/**
 * Conservatively sanitizes untrusted rich text without an HTML parser. Removes
 * dangerous element blocks, comments, inline event handlers, and dangerous URL
 * attributes, then escapes all residual markup so no live HTML or script
 * survives. The result is safe inert text; this is not a full embed sandbox.
 */
export function sanitizeCanvasRichText(value: unknown, path = 'richText'): string {
  let text = cleanText(assertString(value, path));
  text = text.replace(DANGEROUS_BLOCK_PATTERN, '');
  text = text.replace(HTML_COMMENT_PATTERN, '');
  text = text.replace(EVENT_HANDLER_PATTERN, '');
  text = text.replace(DANGEROUS_URL_ATTR_PATTERN, '');
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
}

// ---------------------------------------------------------------------------
// Import path validation
// ---------------------------------------------------------------------------

export interface CanvasImportPathOptions {
  readonly allowedExtensions?: readonly string[];
  readonly maxLength?: number;
}

export function isSafeCanvasImportPath(value: unknown, options?: CanvasImportPathOptions): boolean {
  try {
    assertSafeCanvasImportPath(value, options);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates an untrusted import file path as a forward-slash relative path.
 * Fails closed on traversal, absolute/scheme/backslash/protocol-relative forms,
 * hidden and Windows-reserved segments, trailing space/dot, empty segments, and
 * extensions outside the allowlist. Returns the normalized relative path.
 */
export function assertSafeCanvasImportPath(
  value: unknown,
  options?: CanvasImportPathOptions,
  path = 'importPath',
): string {
  const maxLength = options?.maxLength ?? CANVAS_MAX_IMPORT_PATH_LENGTH;
  const allowed = options?.allowedExtensions ?? CANVAS_SAFE_IMPORT_EXTENSIONS;
  if (typeof value !== 'string') deny('invalid-input', path, 'expected a string path');
  if (value.length === 0) deny('invalid-input', path, 'path is empty');
  if (value.length > maxLength) deny('oversized', path, 'path exceeds the length limit');
  if (URL_CONTROL_PATTERN.test(value))
    deny('control-character', path, 'path contains a control character');
  if (BIDI_OVERRIDE_PATTERN.test(value))
    deny('control-character', path, 'path contains bidi override characters');
  if (value.includes('\\')) deny('unsafe-path', path, 'path contains a backslash');
  if (value.startsWith('//')) deny('unsafe-path', path, 'protocol-relative paths are not allowed');
  if (URL_SCHEME_PATTERN.test(value))
    deny('unsafe-path', path, 'paths with a scheme are not allowed');
  if (value.startsWith('/')) deny('unsafe-path', path, 'absolute paths are not allowed');

  const segments = value.split('/');
  for (const segment of segments) {
    if (segment === '..') deny('path-traversal', path, 'path traversal is not allowed');
    if (segment === '.') continue;
    if (segment.length === 0) deny('unsafe-path', path, 'path has an empty segment');
    if (segment.startsWith('.')) deny('unsafe-path', path, 'hidden path segments are not allowed');
    if (WINDOWS_RESERVED_NAME_PATTERN.test(segment))
      deny('unsafe-path', path, 'reserved device name');
    if (segment.endsWith(' ') || segment.endsWith('.')) {
      deny('unsafe-path', path, 'segment has a trailing space or dot');
    }
  }

  const last = segments[segments.length - 1];
  const dot = last.lastIndexOf('.');
  const extension = dot >= 0 ? last.slice(dot).toLowerCase() : '';
  if (!allowed.includes(extension)) {
    deny('unsupported-type', path, 'unsupported file extension: ' + (extension || '(none)'));
  }

  const normalized = segments.filter((segment) => segment !== '.').join('/');
  if (normalized.length === 0) deny('unsafe-path', path, 'path is empty after normalization');
  return normalized;
}

// ---------------------------------------------------------------------------
// Asset metadata validation
// ---------------------------------------------------------------------------

export interface CanvasAssetMetadataInput {
  readonly size: unknown;
  readonly mimeType: unknown;
  readonly width?: unknown;
  readonly height?: unknown;
}

export interface CanvasAssetMetadata {
  readonly size: number;
  readonly mimeType: string;
  readonly width?: number;
  readonly height?: number;
}

export function isSafeCanvasAsset(value: unknown): boolean {
  try {
    assertSafeCanvasAsset(value);
    return true;
  } catch {
    return false;
  }
}

function assertDimension(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    deny('invalid-input', path, 'expected a safe integer');
  }
  if (value <= 0 || value > CANVAS_MAX_ASSET_DIMENSION) {
    deny('invalid-input', path, 'dimension out of bounds');
  }
  return value;
}

/**
 * Validates untrusted asset metadata. Enforces a positive safe-integer size
 * within the byte ceiling, a MIME type inside the safe allowlist, and optional
 * positive bounded dimensions. Returns a frozen metadata object.
 */
export function assertSafeCanvasAsset(input: unknown, path = 'asset'): CanvasAssetMetadata {
  if (typeof input !== 'object' || input === null)
    deny('invalid-input', path, 'expected an object');
  const record = input as Record<string, unknown>;

  const size = record.size;
  if (typeof size !== 'number' || !Number.isSafeInteger(size)) {
    deny('invalid-input', path + '.size', 'expected a safe integer byte size');
  }
  if (size <= 0) deny('invalid-input', path + '.size', 'asset size must be positive');
  if (size > CANVAS_MAX_ASSET_BYTES)
    deny('oversized', path + '.size', 'asset exceeds the byte limit');

  const mimeType = record.mimeType;
  if (typeof mimeType !== 'string')
    deny('invalid-input', path + '.mimeType', 'expected a string MIME type');
  const normalizedMime = mimeType.trim().toLowerCase();
  if (!CANVAS_SAFE_ASSET_MIME_TYPES.includes(normalizedMime)) {
    deny('unsupported-type', path + '.mimeType', 'unsupported MIME type: ' + normalizedMime);
  }

  const result: { size: number; mimeType: string; width?: number; height?: number } = {
    size,
    mimeType: normalizedMime,
  };
  if (record.width !== undefined) result.width = assertDimension(record.width, path + '.width');
  if (record.height !== undefined) result.height = assertDimension(record.height, path + '.height');
  return Object.freeze(result);
}
