import { describe, expect, it } from 'vitest';
import {
  isSensitiveTerminalPrompt,
  sanitizePersistedDraft,
  sanitizePersistedTerminalText,
} from './terminalContentSanitizer';

const limits = { maxBytes: 8_192, maxLines: 100 };

describe('sanitizePersistedTerminalText', () => {
  it('removes ANSI, OSC, DCS, focus, palette, and mouse protocol', () => {
    const input = [
      '\x1b[31mred\x1b[0m',
      '\x1b]0;private title\x07ready',
      '\x1bP1;2|private dcs\x1b\\done',
      '\x1b[I\x1b[O',
      '\x1b]4;0;rgb:2a/20/18\x07',
      '\x1b[<35;24;22M\x1b[<0;24;22m',
      '[<35;24;22M[<35;25;22M',
      '<35;26;22M<35;27;22M',
    ].join('\n');

    const result = sanitizePersistedTerminalText(input, limits).text;

    expect(result).toContain('red');
    expect(result).toContain('ready');
    expect(result).toContain('done');
    expect(result).not.toMatch(/private title|private dcs|rgb:|35;2|\x1b/);
  });

  it('redacts credential headers, URLs, assignments, JWTs, and provider tokens', () => {
    const syntheticJwt = [
      'eyJhbGciOiJIUzI1NiJ9',
      'eyJzdWIiOiJ0ZXN0LXVzZXIifQ',
      'synthetic_signature_value_1234567890',
    ].join('.');
    const input = [
      'Authorization: Bearer synthetic_bearer_value_1234567890',
      'https://demo-user:demo-pass@example.invalid/path',
      'SUPABASE_SERVICE_ROLE_KEY=synthetic_service_role_value',
      `token=${syntheticJwt}`,
      'OPENAI_API_KEY=sk-proj-synthetic_abcdefghijklmnopqrstuvwxyz',
      'GITHUB_TOKEN=github_pat_synthetic_abcdefghijklmnopqrstuvwxyz',
      'STRIPE_SECRET=sk_live_synthetic_abcdefghijklmnopqrstuvwxyz',
      'AWS_ACCESS_KEY_ID=AKIASYNTHETIC123456',
    ].join('\n');

    const result = sanitizePersistedTerminalText(input, limits).text;

    expect(result).not.toContain('synthetic_bearer_value');
    expect(result).not.toContain('demo-pass');
    expect(result).not.toContain('synthetic_service_role_value');
    expect(result).not.toContain(syntheticJwt);
    expect(result).not.toContain('sk-proj-synthetic');
    expect(result).not.toContain('github_pat_synthetic');
    expect(result).not.toContain('sk_live_synthetic');
    expect(result).not.toContain('AKIASYNTHETIC');
    expect(result.match(/\[REDACTED/g)?.length).toBeGreaterThanOrEqual(7);
  });

  it('normalizes line endings and truncates from complete oldest lines by UTF-8 bytes', () => {
    const result = sanitizePersistedTerminalText('one\r\ntwo\rthree\n😀😀😀', {
      maxBytes: 30,
      maxLines: 3,
      truncationMarker: '[trimmed]\n',
    });

    expect(result.truncated).toBe(true);
    expect(result.text).toBe('[trimmed]\nthree\n😀😀😀');
    expect(new TextEncoder().encode(result.text).byteLength).toBeLessThanOrEqual(30);
  });

  it('does not split a Unicode code point at the byte limit', () => {
    const result = sanitizePersistedTerminalText('prefix\n😀😀😀😀', {
      maxBytes: 17,
      maxLines: 10,
      truncationMarker: '',
    });

    expect(result.text).toBe('😀😀😀😀');
    expect(result.text).not.toContain('�');
  });

  it('trims a large UTF-8 transcript without shifting the line array', () => {
    const input = Array.from(
      { length: 2_000 },
      (_, index) => `line-${index.toString().padStart(4, '0')}-😀`,
    ).join('\n');
    const originalShift = Array.prototype.shift;
    let shiftCalls = 0;
    Array.prototype.shift = function countedShift<T>(this: T[]): T | undefined {
      shiftCalls += 1;
      return originalShift.call(this) as T | undefined;
    };

    try {
      const result = sanitizePersistedTerminalText(input, {
        maxBytes: 120,
        maxLines: 2_000,
        truncationMarker: '[trimmed]\n',
      });

      expect(shiftCalls).toBe(0);
      expect(result).toEqual({
        text: [
          '[trimmed]',
          'line-1993-😀',
          'line-1994-😀',
          'line-1995-😀',
          'line-1996-😀',
          'line-1997-😀',
          'line-1998-😀',
          'line-1999-😀',
        ].join('\n'),
        truncated: true,
      });
    } finally {
      Array.prototype.shift = originalShift;
    }
  });
});

describe('sensitive prompt protection', () => {
  it.each([
    'Password:',
    'Enter passphrase for key:',
    'PIN: ',
    'API key: ',
    'Paste access token:',
    'Client secret:',
    'Private key password:',
    '[sudo] password for demo:',
  ])('detects %s', (prompt) => {
    expect(isSensitiveTerminalPrompt(prompt)).toBe(true);
  });

  it('does not classify an ordinary shell prompt as sensitive', () => {
    expect(isSensitiveTerminalPrompt('PS C:\\repo> ')).toBe(false);
  });

  it('clears drafts at sensitive prompts', () => {
    expect(sanitizePersistedDraft('synthetic-hidden-value', 'Password:')).toBe('');
  });

  it('keeps ordinary printable drafts but strips controls, newlines, and mouse reports', () => {
    const draft = sanitizePersistedDraft(
      'npm test\x1b[A\x1b[<35;24;22M\r\n--watch\x00',
      'PS C:\\repo> ',
    );

    expect(draft).toBe('npm test--watch');
    expect(draft).not.toMatch(/[\x00-\x1f\x7f]/);
  });

  it('caps drafts to 4 KiB without splitting Unicode', () => {
    const draft = sanitizePersistedDraft(`start-${'😀'.repeat(2_000)}`);
    expect(new TextEncoder().encode(draft).byteLength).toBeLessThanOrEqual(4_096);
    expect(draft).not.toContain('�');
  });
});
