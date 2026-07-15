import { describe, expect, it } from 'vitest';
import {
  EMBEDDED_BROWSER_SANDBOX,
  LOOPBACK_BROWSER_SANDBOX,
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

  it('never grants remote embeds same-origin by default', () => {
    expect(EMBEDDED_BROWSER_SANDBOX).toContain('allow-scripts');
    expect(EMBEDDED_BROWSER_SANDBOX).not.toContain('allow-same-origin');
    expect(browserFramePolicy('https://example.com')).toMatchObject({
      src: 'https://example.com/',
      referrerPolicy: 'no-referrer',
      sandbox: EMBEDDED_BROWSER_SANDBOX,
      frameBlocked: false,
    });
  });

  it('uses loopback sandbox for localhost so local apps are not blank', () => {
    const policy = browserFramePolicy('http://localhost:5173');
    expect(policy.sandbox).toBe(LOOPBACK_BROWSER_SANDBOX);
    expect(policy.sandbox).toContain('allow-same-origin');
    expect(policy.frameBlocked).toBe(false);
  });

  it('rewrites YouTube watch URLs to the privacy embed endpoint', () => {
    const rewritten = toEmbeddableUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(rewritten.usedEmbed).toBe(true);
    expect(rewritten.src).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');

    const policy = browserFramePolicy('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(policy.usedEmbed).toBe(true);
    expect(policy.frameBlocked).toBe(false);
    expect(policy.src).toContain('/embed/');
  });

  it('marks non-embeddable YouTube home pages as frame-blocked', () => {
    const policy = browserFramePolicy('https://www.youtube.com/');
    expect(policy.frameBlocked).toBe(true);
    expect(policy.externalUrl).toContain('youtube.com');
  });
});
