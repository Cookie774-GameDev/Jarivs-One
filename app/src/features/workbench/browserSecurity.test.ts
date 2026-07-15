import { describe, expect, it } from 'vitest';
import {
  EMBEDDED_BROWSER_SANDBOX,
  browserFramePolicy,
  normalizeBrowserUrl,
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

  it('never grants embedded pages same-origin or local bridge access', () => {
    expect(EMBEDDED_BROWSER_SANDBOX).toContain('allow-scripts');
    expect(EMBEDDED_BROWSER_SANDBOX).not.toContain('allow-same-origin');
    expect(EMBEDDED_BROWSER_SANDBOX).not.toContain(
      'allow-popups-to-escape-sandbox',
    );
    expect(browserFramePolicy('https://example.com')).toMatchObject({
      src: 'https://example.com/',
      referrerPolicy: 'no-referrer',
      sandbox: EMBEDDED_BROWSER_SANDBOX,
    });
  });
});
