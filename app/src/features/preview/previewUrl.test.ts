import { describe, expect, it } from 'vitest';
import { normalizePreviewUrl } from './previewUrl';

describe('normalizePreviewUrl', () => {
  it('adds http for localhost', () => {
    const r = normalizePreviewUrl('localhost:5173');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url).toBe('http://localhost:5173/');
  });

  it('preserves https', () => {
    const r = normalizePreviewUrl('https://example.com/path');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url).toContain('https://example.com');
  });

  it('rejects javascript: and file:', () => {
    expect(normalizePreviewUrl('javascript:alert(1)').ok).toBe(false);
    expect(normalizePreviewUrl('file:///tmp/x').ok).toBe(false);
  });

  it('handles 127.0.0.1 with port', () => {
    const r = normalizePreviewUrl('127.0.0.1:3000');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url).toBe('http://127.0.0.1:3000/');
  });
});
