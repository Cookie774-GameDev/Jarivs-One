import { describe, expect, it } from 'vitest';
import {
  CANVAS_MAX_ASSET_BYTES,
  CANVAS_MAX_URL_LENGTH,
  CANVAS_SAFE_ASSET_MIME_TYPES,
  CANVAS_SAFE_IMPORT_EXTENSIONS,
  CANVAS_SAFE_URL_SCHEMES,
  CanvasSecurityError,
  assertSafeCanvasAsset,
  assertSafeCanvasImportPath,
  escapeCanvasHtml,
  isSafeCanvasAsset,
  isSafeCanvasImportPath,
  isSafeCanvasUrl,
  sanitizeCanvasCodeBlock,
  sanitizeCanvasPlainText,
  sanitizeCanvasRichText,
  sanitizeCanvasUrl,
} from './security';

const chr = (code: number): string => String.fromCharCode(code);
const NULL = chr(0);
const TAB = chr(9);
const LF = chr(10);
const CR = chr(13);
const BELL = chr(7);
const BIDI_RLO = chr(0x202e);
const BIDI_LRI = chr(0x2066);
const BACKSLASH = chr(92);

const hasAngle = (value: string): boolean => value.includes('<') || value.includes('>');

describe('canvas url security', () => {
  it('allows explicitly safe http, https, mailto and relative urls', () => {
    expect(sanitizeCanvasUrl('https://example.com/page?q=1')).toBe('https://example.com/page?q=1');
    expect(sanitizeCanvasUrl('http://example.com')).toBe('http://example.com');
    expect(sanitizeCanvasUrl('mailto:user@example.com')).toBe('mailto:user@example.com');
    expect(sanitizeCanvasUrl('/relative/path')).toBe('/relative/path');
    expect(sanitizeCanvasUrl('notes/guide.md')).toBe('notes/guide.md');
    expect(sanitizeCanvasUrl('#fragment')).toBe('#fragment');
    expect(sanitizeCanvasUrl('  https://example.com  ')).toBe('https://example.com');
  });

  it('rejects dangerous schemes', () => {
    const bad = [
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      'vbscript:msgbox(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'about:blank',
      'blob:https://example.com/x',
      'ftp://example.com/x',
    ];
    for (const value of bad) {
      expect(isSafeCanvasUrl(value)).toBe(false);
      expect(() => sanitizeCanvasUrl(value)).toThrow(CanvasSecurityError);
    }
  });

  it('rejects encoded and obfuscated javascript urls', () => {
    const bad = [
      'java' + TAB + 'script:alert(1)',
      'java' + LF + 'script:alert(1)',
      'java' + CR + 'script:alert(1)',
      ' javascript:alert(1)',
      '&#106;avascript:alert(1)',
      '&#x6A;avascript:alert(1)',
      'javascript' + NULL + ':alert(1)',
    ];
    for (const value of bad) {
      expect(isSafeCanvasUrl(value)).toBe(false);
    }
  });

  it('rejects protocol-relative, backslash, drive-letter and over-long urls', () => {
    expect(isSafeCanvasUrl('//evil.com/x')).toBe(false);
    expect(isSafeCanvasUrl('https://evil.com' + BACKSLASH + '@good.com')).toBe(false);
    expect(isSafeCanvasUrl('C:/Windows/system32')).toBe(false);
    expect(isSafeCanvasUrl('https://' + 'a'.repeat(CANVAS_MAX_URL_LENGTH))).toBe(false);
    expect(isSafeCanvasUrl('')).toBe(false);
    expect(isSafeCanvasUrl(42 as unknown)).toBe(false);
    expect(isSafeCanvasUrl(null as unknown)).toBe(false);
  });

  it('exposes the safe scheme allowlist', () => {
    expect(CANVAS_SAFE_URL_SCHEMES).toContain('https:');
    expect(CANVAS_SAFE_URL_SCHEMES).not.toContain('javascript:');
  });
});

describe('canvas html escaping', () => {
  it('escapes the five html metacharacters', () => {
    expect(escapeCanvasHtml('<>&' + chr(34) + chr(39))).toBe('&lt;&gt;&amp;&quot;&#39;');
    expect(escapeCanvasHtml('plain text')).toBe('plain text');
  });

  it('rejects non-string input', () => {
    expect(() => escapeCanvasHtml(7 as unknown)).toThrow(CanvasSecurityError);
  });
});

describe('canvas plain text sanitization', () => {
  it('strips null bytes and control characters but keeps tabs and newlines', () => {
    expect(sanitizeCanvasPlainText('a' + NULL + 'b' + BELL + 'c')).toBe('abc');
    expect(sanitizeCanvasPlainText('line1' + LF + 'line2' + TAB + 'tab')).toBe(
      'line1' + LF + 'line2' + TAB + 'tab',
    );
    expect(sanitizeCanvasPlainText('a' + CR + LF + 'b' + CR + 'c')).toBe('a' + LF + 'b' + LF + 'c');
  });

  it('rejects bidi override (trojan source) characters', () => {
    expect(() => sanitizeCanvasPlainText('evil' + BIDI_RLO + 'payload')).toThrow(
      CanvasSecurityError,
    );
  });

  it('trims and bounds length', () => {
    expect(sanitizeCanvasPlainText('  hi  ')).toBe('hi');
    expect(() => sanitizeCanvasPlainText('x'.repeat(100001))).toThrow(CanvasSecurityError);
    expect(() => sanitizeCanvasPlainText(undefined as unknown)).toThrow(CanvasSecurityError);
  });
});

describe('canvas rich text sanitization', () => {
  it('removes script blocks entirely', () => {
    const out = sanitizeCanvasRichText('<script>alert(1)</script>Hi');
    expect(out).toBe('Hi');
    expect(out.toLowerCase().includes('alert')).toBe(false);
  });

  it('neutralizes inline event handlers and residual markup', () => {
    const out = sanitizeCanvasRichText('<img src=x onerror=alert(1)>');
    expect(out.toLowerCase().includes('onerror')).toBe(false);
    expect(hasAngle(out)).toBe(false);
  });

  it('escapes all residual angle brackets so no live html remains', () => {
    const out = sanitizeCanvasRichText('Hello <b>world</b> & <i>friends</i>');
    expect(hasAngle(out)).toBe(false);
    expect(out.includes('&lt;b&gt;')).toBe(true);
  });

  it('removes html comments and dangerous url attributes', () => {
    const input = '<!-- comment --><a href=' + chr(34) + 'javascript:alert(1)' + chr(34) + '>x</a>';
    const out = sanitizeCanvasRichText(input);
    expect(out.includes('comment')).toBe(false);
    expect(out.toLowerCase().includes('javascript:')).toBe(false);
    expect(hasAngle(out)).toBe(false);
  });

  it('keeps safe plain text and rejects oversized or non-string input', () => {
    expect(sanitizeCanvasRichText('Just some safe text.')).toBe('Just some safe text.');
    expect(() => sanitizeCanvasRichText('z'.repeat(100001))).toThrow(CanvasSecurityError);
    expect(() => sanitizeCanvasRichText(3 as unknown)).toThrow(CanvasSecurityError);
    expect(() => sanitizeCanvasRichText('bad' + BIDI_RLO)).toThrow(CanvasSecurityError);
  });
});

describe('canvas code block sanitization', () => {
  it('preserves indentation and newlines while stripping control characters', () => {
    const code = '  const x = 1;' + LF + TAB + 'console.log(x);' + NULL;
    expect(sanitizeCanvasCodeBlock(code)).toBe('  const x = 1;' + LF + TAB + 'console.log(x);');
  });

  it('rejects bidi overrides and oversized code', () => {
    expect(() => sanitizeCanvasCodeBlock('x' + BIDI_LRI + 'y')).toThrow(CanvasSecurityError);
    expect(() => sanitizeCanvasCodeBlock('c'.repeat(100001))).toThrow(CanvasSecurityError);
    expect(() => sanitizeCanvasCodeBlock(false as unknown)).toThrow(CanvasSecurityError);
  });
});

describe('canvas import path security', () => {
  it('allows simple relative paths with supported extensions', () => {
    expect(assertSafeCanvasImportPath('notes/guide.md')).toBe('notes/guide.md');
    expect(assertSafeCanvasImportPath('a/b/c.png')).toBe('a/b/c.png');
    expect(assertSafeCanvasImportPath('./doc.txt')).toBe('doc.txt');
    expect(assertSafeCanvasImportPath('README.md')).toBe('README.md');
    expect(isSafeCanvasImportPath('image.webp')).toBe(true);
  });

  it('rejects path traversal', () => {
    const bad = ['../secret.ts', 'notes/../private/note.md', 'a/../../b.md', '..'];
    for (const value of bad) {
      expect(isSafeCanvasImportPath(value)).toBe(false);
      expect(() => assertSafeCanvasImportPath(value)).toThrow(CanvasSecurityError);
    }
  });

  it('rejects absolute, scheme, backslash and protocol-relative paths', () => {
    const bad = [
      '/etc/passwd',
      'C:/Windows/x.md',
      BACKSLASH + BACKSLASH + 'server' + BACKSLASH + 'share.md',
      '//evil.com/x.md',
      'file:///x.md',
      'https://x.com/a.md',
    ];
    for (const value of bad) {
      expect(isSafeCanvasImportPath(value)).toBe(false);
    }
  });

  it('rejects hidden, reserved, trailing-space and dot-ending segments', () => {
    const bad = ['.env', '.git/config', 'con.md', 'nul.txt', 'name.md ', 'name.', 'a//b.md'];
    for (const value of bad) {
      expect(isSafeCanvasImportPath(value)).toBe(false);
    }
  });

  it('rejects unsupported extensions and empty or over-long paths', () => {
    const bad = ['app.exe', 'script.svg', 'archive.tar.gz', 'noextension', ''];
    for (const value of bad) {
      expect(isSafeCanvasImportPath(value)).toBe(false);
    }
    expect(isSafeCanvasImportPath('a'.repeat(2000) + '.md')).toBe(false);
  });

  it('honors a custom extension allowlist', () => {
    expect(assertSafeCanvasImportPath('data.csv', { allowedExtensions: ['.csv'] })).toBe(
      'data.csv',
    );
    expect(isSafeCanvasImportPath('notes.md', { allowedExtensions: ['.csv'] })).toBe(false);
  });

  it('exposes the default extension allowlist without svg', () => {
    expect(CANVAS_SAFE_IMPORT_EXTENSIONS).toContain('.md');
    expect(CANVAS_SAFE_IMPORT_EXTENSIONS).not.toContain('.svg');
  });
});

describe('canvas asset metadata security', () => {
  it('accepts valid bounded image and text assets', () => {
    expect(assertSafeCanvasAsset({ size: 1024, mimeType: 'image/png' })).toMatchObject({
      size: 1024,
      mimeType: 'image/png',
    });
    expect(assertSafeCanvasAsset({ size: 10, mimeType: 'TEXT/PLAIN' }).mimeType).toBe('text/plain');
    expect(
      assertSafeCanvasAsset({ size: 5, mimeType: 'image/webp', width: 100, height: 50 }),
    ).toMatchObject({
      width: 100,
      height: 50,
    });
    expect(isSafeCanvasAsset({ size: 1, mimeType: 'application/json' })).toBe(true);
  });

  it('rejects oversized, zero, negative and non-integer sizes', () => {
    expect(isSafeCanvasAsset({ size: CANVAS_MAX_ASSET_BYTES + 1, mimeType: 'image/png' })).toBe(
      false,
    );
    expect(isSafeCanvasAsset({ size: 0, mimeType: 'image/png' })).toBe(false);
    expect(isSafeCanvasAsset({ size: -5, mimeType: 'image/png' })).toBe(false);
    expect(isSafeCanvasAsset({ size: 1.5, mimeType: 'image/png' })).toBe(false);
    expect(isSafeCanvasAsset({ size: Number.NaN, mimeType: 'image/png' })).toBe(false);
  });

  it('rejects unsupported or scriptable mime types', () => {
    const bad = [
      'image/svg+xml',
      'text/html',
      'application/javascript',
      'application/x-msdownload',
      '',
    ];
    for (const mimeType of bad) {
      expect(isSafeCanvasAsset({ size: 10, mimeType })).toBe(false);
    }
    expect(CANVAS_SAFE_ASSET_MIME_TYPES).not.toContain('image/svg+xml');
  });

  it('rejects invalid dimensions and non-object input', () => {
    expect(isSafeCanvasAsset({ size: 10, mimeType: 'image/png', width: 0 })).toBe(false);
    expect(isSafeCanvasAsset({ size: 10, mimeType: 'image/png', width: -1 })).toBe(false);
    expect(isSafeCanvasAsset({ size: 10, mimeType: 'image/png', height: 999999 })).toBe(false);
    expect(isSafeCanvasAsset(null)).toBe(false);
    expect(isSafeCanvasAsset({ size: 10 })).toBe(false);
  });

  it('returns a frozen metadata object', () => {
    const meta = assertSafeCanvasAsset({ size: 10, mimeType: 'image/png' });
    expect(Object.isFrozen(meta)).toBe(true);
  });
});

describe('canvas security errors', () => {
  it('throws typed errors with stable codes', () => {
    let urlCode = '';
    try {
      sanitizeCanvasUrl('javascript:alert(1)');
    } catch (error) {
      urlCode = (error as CanvasSecurityError).code;
    }
    expect(urlCode).toBe('unsafe-scheme');

    let pathCode = '';
    try {
      assertSafeCanvasImportPath('../x.md');
    } catch (error) {
      pathCode = (error as CanvasSecurityError).code;
    }
    expect(pathCode).toBe('path-traversal');

    let assetCode = '';
    try {
      assertSafeCanvasAsset({ size: CANVAS_MAX_ASSET_BYTES + 1, mimeType: 'image/png' });
    } catch (error) {
      assetCode = (error as CanvasSecurityError).code;
    }
    expect(assetCode).toBe('oversized');
  });
});
