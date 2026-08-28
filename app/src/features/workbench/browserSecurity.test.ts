import { describe, expect, it } from 'vitest';
import {
  EMBEDDED_BROWSER_SANDBOX,
  LOOPBACK_BROWSER_SANDBOX,
  TRUSTED_MEDIA_EMBED_SANDBOX,
  browserFramePolicy,
  normalizeBrowserUrl,
  toEmbeddableUrl,
} from './browserSecurity';

describe('Workbench browser isolation', () => {
  it('allows ordinary web and localhost URLs but rejects privileged schemes', () => {
    expect(normalizeBrowserUrl('example.com')).toBe('https://example.com/');
    expect(normalizeBrowserUrl('localhost:5173')).toBe('http://localhost:5173/');
    expect(normalizeBrowserUrl('https://docs.example.com/api')).toBe(
      'https://docs.example.com/api',
    );

    for (const unsafe of [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'tauri://localhost',
      'data:text/html,<script>alert(1)</script>',
      'https://user:password@example.com/private',
    ]) {
      expect(() => normalizeBrowserUrl(unsafe)).toThrow(/http/i);
    }
  });

  it('routes ordinary remote pages to the normal browser instead of a credentialless iframe', () => {
    expect(EMBEDDED_BROWSER_SANDBOX).toContain('allow-scripts');
    expect(EMBEDDED_BROWSER_SANDBOX).not.toContain('allow-same-origin');
    expect(browserFramePolicy('https://example.com')).toMatchObject({
      src: 'https://example.com/',
      referrerPolicy: 'no-referrer',
      sandbox: EMBEDDED_BROWSER_SANDBOX,
      frameBlocked: true,
      delivery: 'system-browser',
    });
  });

  it('uses loopback sandbox for localhost so local apps are not blank', () => {
    const policy = browserFramePolicy('http://localhost:5173');
    expect(policy.sandbox).toBe(LOOPBACK_BROWSER_SANDBOX);
    expect(policy.sandbox).toContain('allow-same-origin');
    expect(policy.frameBlocked).toBe(false);
    expect(policy.delivery).toBe('embedded');
  });

  it('rewrites YouTube watch URLs to the privacy embed endpoint', () => {
    const rewritten = toEmbeddableUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(rewritten.usedEmbed).toBe(true);
    expect(rewritten.src).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');

    const policy = browserFramePolicy('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(policy.usedEmbed).toBe(true);
    expect(policy.frameBlocked).toBe(false);
    expect(policy.delivery).toBe('embedded');
    expect(policy.src).toContain('/embed/');
    expect(policy.sandbox).toBe(TRUSTED_MEDIA_EMBED_SANDBOX);
    expect(policy.sandbox).toContain('allow-same-origin');
  });

  it('does not grant the trusted-media sandbox to arbitrary remote or loopback pages', () => {
    expect(browserFramePolicy('https://example.com').sandbox).toBe(EMBEDDED_BROWSER_SANDBOX);
    expect(browserFramePolicy('http://127.0.0.1:5173').sandbox).toBe(LOOPBACK_BROWSER_SANDBOX);
    expect(TRUSTED_MEDIA_EMBED_SANDBOX).not.toBe(EMBEDDED_BROWSER_SANDBOX);
  });

  it('marks non-embeddable YouTube home pages as frame-blocked', () => {
    const policy = browserFramePolicy('https://www.youtube.com/');
    expect(policy.frameBlocked).toBe(true);
    expect(policy.externalUrl).toContain('youtube.com');
  });
});
