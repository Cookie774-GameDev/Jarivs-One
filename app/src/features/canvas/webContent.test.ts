import { describe, expect, it } from 'vitest';
import { CanvasSecurityError } from './security';
import {
  CANVAS_EMBED_SANDBOX,
  createCanvasBookmark,
  createCanvasWebEmbed,
  removeCanvasWebEmbed,
  type CanvasBookmark,
} from './webContent';

function bookmark(overrides: Partial<CanvasBookmark> = {}) {
  return createCanvasBookmark({
    id: 'bookmark-1',
    url: 'https://example.com/articles/one',
    title: 'Example',
    description: 'A safe bookmark',
    favicon: 'https://example.com/favicon.ico',
    previewImage: 'https://cdn.example.com/preview.png',
    ...overrides,
  });
}

describe('Canvas bookmarks', () => {
  it('stores bounded metadata, derives the source domain, and requires user action to open', () => {
    const value = bookmark();
    expect(value.sourceDomain).toBe('example.com');
    expect(value.openAction).toEqual({
      kind: 'external-url',
      url: 'https://example.com/articles/one',
      requiresUserGesture: true,
    });
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.openAction)).toBe(true);
  });

  it('permits only absolute http/https bookmark and image URLs', () => {
    expect(() => bookmark({ url: 'javascript:alert(1)' })).toThrow(CanvasSecurityError);
    expect(() => bookmark({ url: '/relative' })).toThrow();
    expect(() => bookmark({ favicon: 'data:image/png;base64,x' })).toThrow(CanvasSecurityError);
    expect(() => bookmark({ previewImage: 'file:///secret.png' })).toThrow(CanvasSecurityError);
  });

  it('fails closed on forged fields and oversized text', () => {
    expect(() =>
      createCanvasBookmark({
        id: 'x',
        url: 'https://example.com',
        title: 'x',
        token: 'secret',
      } as never),
    ).toThrow();
    expect(() =>
      createCanvasBookmark({
        id: 'x',
        url: 'https://example.com',
        title: 'x'.repeat(201),
      }),
    ).toThrow();
  });

  it('does not retain fetch responses, scripts, or binary payloads', () => {
    const json = JSON.stringify(bookmark());
    expect(json).not.toContain('base64');
    expect(Object.keys(bookmark())).not.toContain('html');
    expect(Object.keys(bookmark())).not.toContain('script');
  });
});

describe('Canvas web embeds', () => {
  it('creates a user-initiated, labeled, removable, CSP-bound sandbox descriptor', () => {
    const embed = createCanvasWebEmbed({
      id: 'embed-1',
      bookmark: bookmark(),
      userInitiated: true,
      allowedOrigins: ['https://example.com'],
    });
    expect(embed.status).toBe('ready');
    expect(embed.label).toContain('example.com');
    expect(embed.sandbox).toBe(CANVAS_EMBED_SANDBOX);
    expect(embed.sandbox).toContain('allow-scripts');
    expect(embed.sandbox).not.toContain('allow-same-origin');
    expect(embed.referrerPolicy).toBe('no-referrer');
    expect(embed.csp).toContain('frame-src https://example.com');
    expect(embed.removable).toBe(true);
    expect(Object.isFrozen(embed)).toBe(true);
  });

  it('blocks non-user-initiated embedding and keeps a safe bookmark fallback', () => {
    const source = bookmark();
    const embed = createCanvasWebEmbed({
      id: 'embed-1',
      bookmark: source,
      userInitiated: false,
      allowedOrigins: ['https://example.com'],
    });
    expect(embed.status).toBe('blocked');
    expect(embed.blockedReason).toBe('user-action-required');
    expect(embed.fallback).toEqual(source);
  });

  it('blocks origins not allowed by the current CSP policy', () => {
    const embed = createCanvasWebEmbed({
      id: 'embed-1',
      bookmark: bookmark(),
      userInitiated: true,
      allowedOrigins: ['https://docs.example.net'],
    });
    expect(embed.status).toBe('blocked');
    expect(embed.blockedReason).toBe('origin-not-allowed');
    expect(embed.fallback.url).toBe('https://example.com/articles/one');
  });

  it('rejects Tauri/local/file/data origins and unsafe policy entries', () => {
    for (const url of [
      'tauri://localhost/private',
      'http://localhost:1420',
      'file:///secret',
      'data:text/html,<script>x</script>',
    ]) {
      expect(() => bookmark({ url })).toThrow();
    }
    expect(() =>
      createCanvasWebEmbed({
        id: 'embed-1',
        bookmark: bookmark(),
        userInitiated: true,
        allowedOrigins: ['*'],
      }),
    ).toThrow();
  });

  it('removes the embed without discarding its bookmark fallback', () => {
    const embed = createCanvasWebEmbed({
      id: 'embed-1',
      bookmark: bookmark(),
      userInitiated: true,
      allowedOrigins: ['https://example.com'],
    });
    const removed = removeCanvasWebEmbed(embed);
    expect(removed.status).toBe('removed');
    expect(removed.fallback.url).toBe(embed.fallback.url);
    expect(removeCanvasWebEmbed(removed)).toBe(removed);
  });
});
