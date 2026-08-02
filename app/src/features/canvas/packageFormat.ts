/**
 * Portable JSON Canvas package codec foundation.
 *
 * Framework-agnostic, deterministic, side-effect-free encoding and strict
 * runtime parsing of a versioned portable canvas package. A package wraps the
 * single canonical canvas document in a small, self-describing envelope
 * (`kind`, `packageVersion`, `schemaVersion`, `document`) so an export can be
 * imported back without hidden duplication of content. Encoding is
 * deterministic (recursive sorted-key JSON) so identical documents always
 * serialize to identical bytes regardless of property insertion order.
 *
 * Parsing fails closed with a typed `CanvasPackageError` on unknown envelope
 * fields, an unknown package kind, unsupported package or schema versions
 * (including forward versions), malformed JSON, oversized textual payloads,
 * and any document that fails the strict `parseCanvasDocument` contract.
 * Error messages never echo unbounded untrusted input. This pure layer
 * performs no filesystem or Tauri access.
 */

import {
  CANVAS_SCHEMA_VERSION,
  CanvasValidationError,
  parseCanvasDocument,
  type CanvasDocument,
} from './contracts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Discriminator identifying a VibeSpace portable canvas package. */
export const CANVAS_PACKAGE_KIND = 'vibespace.canvas.package';

/** Envelope/format version of the portable package. */
export const CANVAS_PACKAGE_VERSION = 1;

/** Canvas document schema version carried by the envelope for fast rejection. */
export const CANVAS_PACKAGE_SCHEMA_VERSION = CANVAS_SCHEMA_VERSION;

/**
 * Default guard against hostile oversized imports, in characters. Legitimate
 * packages are far smaller because every textual document field is already
 * bounded by the canvas contract; this stops multi-megabyte payloads before
 * JSON parsing even begins.
 */
export const CANVAS_PACKAGE_MAX_TEXT_LENGTH = 50_000_000;

/** Maximum length of an untrusted token echoed into a path or message. */
const MAX_PREVIEW_LENGTH = 32;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type CanvasPackageErrorCode =
  | 'invalid-type'
  | 'malformed-json'
  | 'oversized-payload'
  | 'unknown-field'
  | 'unknown-kind'
  | 'unsupported-version'
  | 'unsupported-schema'
  | 'invalid-document';

/**
 * Typed failure for package encode/decode. `code` classifies the failure,
 * `path` locates it within the package, and `cause` (when present) preserves
 * the underlying error such as a JSON `SyntaxError` or `CanvasValidationError`.
 */
export class CanvasPackageError extends Error {
  readonly code: CanvasPackageErrorCode;
  readonly path: string;

  constructor(code: CanvasPackageErrorCode, path: string, message: string, options?: ErrorOptions) {
    super(`Canvas package failed (${code}) at ${path}: ${message}`, options);
    this.name = 'CanvasPackageError';
    this.code = code;
    this.path = path;
  }
}

function failPackage(
  code: CanvasPackageErrorCode,
  path: string,
  message: string,
  options?: ErrorOptions,
): never {
  throw new CanvasPackageError(code, path, message, options);
}

// ---------------------------------------------------------------------------
// Package shape
// ---------------------------------------------------------------------------

/** A validated, deeply frozen portable canvas package. */
export interface CanvasPackage {
  readonly kind: typeof CANVAS_PACKAGE_KIND;
  readonly packageVersion: typeof CANVAS_PACKAGE_VERSION;
  readonly schemaVersion: typeof CANVAS_PACKAGE_SCHEMA_VERSION;
  /** The single canonical document; content is never duplicated elsewhere. */
  readonly document: CanvasDocument;
}

export interface DecodeCanvasPackageOptions {
  /** Overrides the default oversized-payload guard, in characters. */
  readonly maxTextLength?: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const PACKAGE_KEYS = new Set(['kind', 'packageVersion', 'schemaVersion', 'document']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Bounds an untrusted token so it cannot bloat a path or message. */
function truncateToken(value: string): string {
  return value.length <= MAX_PREVIEW_LENGTH ? value : `${value.slice(0, MAX_PREVIEW_LENGTH)}\u2026`;
}

/** Bounded, safe description of an untrusted value for error messages. */
function preview(value: unknown): string {
  if (typeof value === 'string') {
    return `"${truncateToken(value)}"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return String(value);
  }
  return typeof value;
}

/** Recursively rebuilds a value with object keys sorted for deterministic JSON. */
function toStableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toStableValue);
  }
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const stable: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      stable[key] = toStableValue(source[key]);
    }
    return stable;
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
    Object.freeze(value);
  } else if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Encoding (export)
// ---------------------------------------------------------------------------

/**
 * Serializes a validated canonical document into a portable package string.
 * The output is deterministic: identical documents always produce identical
 * bytes regardless of property insertion order. The document is embedded once
 * under `document`; no content is copied into the envelope.
 *
 * Precondition: `document` is a validated `CanvasDocument` (for example from
 * `parseCanvasDocument` or a canvas factory).
 */
export function encodeCanvasPackage(document: CanvasDocument): string {
  const envelope = {
    kind: CANVAS_PACKAGE_KIND,
    packageVersion: CANVAS_PACKAGE_VERSION,
    schemaVersion: CANVAS_PACKAGE_SCHEMA_VERSION,
    document,
  };
  return JSON.stringify(toStableValue(envelope));
}

// ---------------------------------------------------------------------------
// Parsing (import)
// ---------------------------------------------------------------------------

/**
 * Strictly validates an already-parsed value as a portable canvas package.
 * Fails closed on unknown envelope fields, an unknown kind, unsupported
 * package or schema versions, a missing document, and any document that fails
 * the strict canvas contract. The result is deeply frozen.
 */
export function parseCanvasPackage(input: unknown): CanvasPackage {
  if (!isPlainObject(input)) {
    failPackage('invalid-type', 'package', 'expected a plain object');
  }
  for (const key of Object.keys(input)) {
    if (!PACKAGE_KEYS.has(key)) {
      failPackage(
        'unknown-field',
        `package.${truncateToken(key)}`,
        `unexpected field ${preview(key)}`,
      );
    }
  }

  if (input.kind !== CANVAS_PACKAGE_KIND) {
    failPackage('unknown-kind', 'package.kind', `unsupported package kind ${preview(input.kind)}`);
  }

  if (typeof input.packageVersion !== 'number' || !Number.isSafeInteger(input.packageVersion)) {
    failPackage('invalid-type', 'package.packageVersion', 'expected an integer package version');
  }
  if (input.packageVersion !== CANVAS_PACKAGE_VERSION) {
    failPackage(
      'unsupported-version',
      'package.packageVersion',
      `unsupported package version ${preview(input.packageVersion)}`,
    );
  }

  if (typeof input.schemaVersion !== 'number' || !Number.isSafeInteger(input.schemaVersion)) {
    failPackage('invalid-type', 'package.schemaVersion', 'expected an integer schema version');
  }
  if (input.schemaVersion !== CANVAS_PACKAGE_SCHEMA_VERSION) {
    failPackage(
      'unsupported-schema',
      'package.schemaVersion',
      `unsupported schema version ${preview(input.schemaVersion)}`,
    );
  }

  if (input.document === undefined) {
    failPackage('invalid-type', 'package.document', 'expected the canonical document object');
  }

  let document: CanvasDocument;
  try {
    document = parseCanvasDocument(input.document);
  } catch (error) {
    if (error instanceof CanvasValidationError) {
      throw new CanvasPackageError(
        'invalid-document',
        'package.document',
        'document failed strict validation',
        {
          cause: error,
        },
      );
    }
    throw error;
  }

  return deepFreeze({
    kind: CANVAS_PACKAGE_KIND,
    packageVersion: CANVAS_PACKAGE_VERSION,
    schemaVersion: CANVAS_PACKAGE_SCHEMA_VERSION,
    document,
  });
}

/**
 * Decodes a portable package from its JSON text form. Guards against
 * non-string input and oversized textual payloads before parsing, converts
 * malformed JSON into a typed error, and delegates structural validation to
 * `parseCanvasPackage`.
 */
export function decodeCanvasPackage(
  text: string,
  options: DecodeCanvasPackageOptions = {},
): CanvasPackage {
  if (typeof text !== 'string') {
    failPackage('invalid-type', 'package', 'expected a JSON string');
  }
  const maxTextLength = options.maxTextLength ?? CANVAS_PACKAGE_MAX_TEXT_LENGTH;
  if (!Number.isSafeInteger(maxTextLength) || maxTextLength < 0) {
    failPackage('invalid-type', 'options.maxTextLength', 'expected a non-negative safe integer');
  }
  if (text.length > maxTextLength) {
    failPackage('oversized-payload', 'package', `package text exceeds ${maxTextLength} characters`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new CanvasPackageError('malformed-json', 'package', 'package is not valid JSON', {
      cause: error,
    });
  }

  return parseCanvasPackage(parsed);
}
