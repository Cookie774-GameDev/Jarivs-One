import { describe, expect, it } from 'vitest';
import { sanitizeCredentialRequests, sanitizePromptLeaks } from './runtime';

describe('runtime credential safety', () => {
  it('replaces AI text that asks users for passwords or credentials', () => {
    const sanitized = sanitizeCredentialRequests(
      'Please enter your Google account password so I can continue.',
    );

    expect(sanitized).toContain("I can't ask for passwords");
    expect(sanitized).toContain('trusted settings or provider connection UI');
    expect(sanitized).not.toContain('enter your Google account password');
  });

  it('leaves normal responses untouched', () => {
    expect(sanitizeCredentialRequests('Done — opened Settings.')).toBe('Done — opened Settings.');
  });

  it('replaces leaked benchmark/tool/scenario prompt scaffolding', () => {
    const sanitized = sanitizePromptLeaks([
      '{"tools":[{"name":"browser"}],"scenario":"benchmark_eval"}',
      'Use the above benchmark scenario to test the model.',
      'Expected assistant response follows.',
    ].join('\n'));

    expect(sanitized).toContain('I hit an invalid model reply');
    expect(sanitized).not.toContain('"tools"');
    expect(sanitized).not.toContain('benchmark_eval');
    expect(sanitized).not.toContain('scenario');
  });
});
