/**
 * Safe bookmark and sandboxed web-embed contracts for Canvas.
 *
 * This module never fetches or renders remote content. It validates bounded
 * metadata and emits a least-privilege iframe descriptor that a UI may mount
 * only after a user gesture and an explicit origin-policy match.
 */

import {
  CANVAS_ID_PATTERN,
  CANVAS_MAX_TITLE_LENGTH,
  CanvasValidationError,
  type CanvasValidationErrorCode,
} from './contracts';
import { sanitizeCanvasUrl } from './security';

export const CANVAS_EMBED_SANDBOX = 'allow-forms allow-popups allow-scripts';
export const CANVAS_EMBED_REFERRER_POLICY = 'no-referrer';
export const CANVAS_BOOKMARK_MAX_DESCRIPTION_LENGTH = 2000;
export const CANVAS_EMBED_MAX_ALLOWED_ORIGINS = 32;

export interface CanvasBookmarkOpenAction {
  readonly kind: 'external-url';
  readonly url: string;
  readonly requiresUserGesture: true;
}

export interface CanvasBookmark {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly description: string;
  readonly favicon: string | null;
  readonly previewImage: string | null;
  readonly sourceDomain: string;
  readonly openAction: CanvasBookmarkOpenAction;
}

export interface CreateCanvasBookmarkInput {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly description?: string;
  readonly favicon?: string | null;
  readonly previewImage?: string | null;
}

export type CanvasWebEmbedStatus = 'ready' | 'blocked' | 'removed';
export type CanvasWebEmbedBlockedReason = 'user-action-required' | 'origin-not-allowed' | 'removed';

export interface CanvasWebEmbed {
  readonly id: string;
  readonly status: CanvasWebEmbedStatus;
  readonly blockedReason: CanvasWebEmbedBlockedReason | null;
  readonly label: string;
  readonly url: string;
  readonly origin: string;
  readonly sandbox: typeof CANVAS_EMBED_SANDBOX;
  readonly referrerPolicy: typeof CANVAS_EMBED_REFERRER_POLICY;
  readonly csp: string;
  readonly userInitiated: boolean;
  readonly removable: true;
  readonly fallback: CanvasBookmark;
}

export interface CreateCanvasWebEmbedInput {
  readonly id: string;
  readonly bookmark: CanvasBookmark;
  readonly userInitiated: boolean;
  readonly allowedOrigins: readonly string[];
}

const BOOKMARK_KEYS = new Set(['id', 'url', 'title', 'description', 'favicon', 'previewImage']);
const EMBED_KEYS = new Set(['id', 'bookmark', 'userInitiated', 'allowedOrigins']);
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/u;

function fail(code: CanvasValidationErrorCode, path: string, message: string): never {
  throw new CanvasValidationError(code, path, message);
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
      fail('unsupported-value', `${path}.${key}`, `unexpected field "${key}"`);
    }
  }
}

function id(value: unknown, path: string): string {
  if (typeof value !== 'string' || !CANVAS_ID_PATTERN.test(value)) {
    fail('invalid-id', path, 'expected a stable Canvas id');
  }
  return value;
}

function boundedText(value: unknown, path: string, maximum: number): string {
  if (typeof value !== 'string') {
    fail('invalid-type', path, 'expected a string');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maximum || CONTROL_PATTERN.test(trimmed)) {
    fail('unsupported-value', path, `expected non-empty printable text up to ${maximum} chars`);
  }
  return trimmed;
}

function optionalText(value: unknown, path: string, maximum: number): string {
  if (value === undefined) return '';
  if (typeof value !== 'string') {
    fail('invalid-type', path, 'expected a string');
  }
  const trimmed = value.trim();
  if (trimmed.length > maximum || CONTROL_PATTERN.test(trimmed)) {
    fail('unsupported-value', path, `expected printable text up to ${maximum} chars`);
  }
  return trimmed;
}

function absoluteWebUrl(
  value: unknown,
  path: string,
): { readonly url: string; readonly parsed: URL } {
  const url = sanitizeCanvasUrl(value, path);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    fail('unsupported-value', path, 'expected an absolute web URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    fail('unsupported-value', path, 'expected an http or https URL');
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.local')
  ) {
    fail('unsupported-value', path, 'local and application origins are not embeddable');
  }
  return Object.freeze({ url, parsed });
}

function optionalWebUrl(value: unknown, path: string): string | null {
  if (value === undefined || value === null) return null;
  return absoluteWebUrl(value, path).url;
}

function freezeBookmark(value: CanvasBookmark): CanvasBookmark {
  Object.freeze(value.openAction);
  return Object.freeze(value);
}

export function createCanvasBookmark(input: unknown): CanvasBookmark {
  if (!isPlainObject(input)) {
    fail('invalid-type', 'bookmark', 'expected a plain object');
  }
  assertExactKeys(input, BOOKMARK_KEYS, 'bookmark');
  const bookmarkId = id(input.id, 'bookmark.id');
  const { url, parsed } = absoluteWebUrl(input.url, 'bookmark.url');
  const title = boundedText(input.title, 'bookmark.title', CANVAS_MAX_TITLE_LENGTH);
  const description = optionalText(
    input.description,
    'bookmark.description',
    CANVAS_BOOKMARK_MAX_DESCRIPTION_LENGTH,
  );
  const favicon = optionalWebUrl(input.favicon, 'bookmark.favicon');
  const previewImage = optionalWebUrl(input.previewImage, 'bookmark.previewImage');
  return freezeBookmark({
    id: bookmarkId,
    url,
    title,
    description,
    favicon,
    previewImage,
    sourceDomain: parsed.hostname.toLowerCase(),
    openAction: {
      kind: 'external-url',
      url,
      requiresUserGesture: true,
    },
  });
}

function parseBookmark(value: unknown): CanvasBookmark {
  if (!isPlainObject(value)) {
    fail('invalid-type', 'embed.bookmark', 'expected a bookmark');
  }
  const candidate = value as unknown as CanvasBookmark;
  return createCanvasBookmark({
    id: candidate.id,
    url: candidate.url,
    title: candidate.title,
    description: candidate.description,
    favicon: candidate.favicon,
    previewImage: candidate.previewImage,
  });
}

function normalizeAllowedOrigins(value: unknown): ReadonlySet<string> {
  if (!Array.isArray(value) || value.length > CANVAS_EMBED_MAX_ALLOWED_ORIGINS) {
    fail('unsupported-value', 'embed.allowedOrigins', 'expected a bounded origin array');
  }
  const origins = new Set<string>();
  value.forEach((raw, index) => {
    if (typeof raw !== 'string' || raw.trim() === '*') {
      fail('unsupported-value', `embed.allowedOrigins[${index}]`, 'wildcard origins are forbidden');
    }
    const { parsed } = absoluteWebUrl(raw, `embed.allowedOrigins[${index}]`);
    if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') {
      fail(
        'unsupported-value',
        `embed.allowedOrigins[${index}]`,
        'expected an exact origin without path, query, or fragment',
      );
    }
    origins.add(parsed.origin);
  });
  return origins;
}

function createEmbedValue(
  embedId: string,
  bookmark: CanvasBookmark,
  status: CanvasWebEmbedStatus,
  blockedReason: CanvasWebEmbedBlockedReason | null,
  userInitiated: boolean,
): CanvasWebEmbed {
  const origin = new URL(bookmark.url).origin;
  return Object.freeze({
    id: embedId,
    status,
    blockedReason,
    label: `Embedded content from ${bookmark.sourceDomain}`,
    url: bookmark.url,
    origin,
    sandbox: CANVAS_EMBED_SANDBOX,
    referrerPolicy: CANVAS_EMBED_REFERRER_POLICY,
    csp: `default-src 'none'; frame-src ${origin}; img-src https:;`,
    userInitiated,
    removable: true,
    fallback: bookmark,
  });
}

export function createCanvasWebEmbed(input: unknown): CanvasWebEmbed {
  if (!isPlainObject(input)) {
    fail('invalid-type', 'embed', 'expected a plain object');
  }
  assertExactKeys(input, EMBED_KEYS, 'embed');
  const embedId = id(input.id, 'embed.id');
  const bookmark = parseBookmark(input.bookmark);
  if (typeof input.userInitiated !== 'boolean') {
    fail('invalid-type', 'embed.userInitiated', 'expected a boolean');
  }
  const origins = normalizeAllowedOrigins(input.allowedOrigins);
  if (!input.userInitiated) {
    return createEmbedValue(embedId, bookmark, 'blocked', 'user-action-required', false);
  }
  if (!origins.has(new URL(bookmark.url).origin)) {
    return createEmbedValue(embedId, bookmark, 'blocked', 'origin-not-allowed', true);
  }
  return createEmbedValue(embedId, bookmark, 'ready', null, true);
}

export function removeCanvasWebEmbed(embed: CanvasWebEmbed): CanvasWebEmbed {
  if (embed.status === 'removed') return embed;
  return createEmbedValue(embed.id, embed.fallback, 'removed', 'removed', embed.userInitiated);
}
