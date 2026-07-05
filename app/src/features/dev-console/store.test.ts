import { beforeEach, describe, expect, it } from 'vitest';
import { devConsole, redactForLog, useDevConsoleStore } from './store';

describe('DevConsole redaction', () => {
  beforeEach(() => {
    useDevConsoleStore.getState().clear();
  });

  it('redacts sensitive keys and bearer-like values before storing entries', () => {
    devConsole.log({
      channel: 'action',
      level: 'info',
      message: 'Authorization: Bearer fake-token-value-here',
      detail: {
        authorization: 'Bearer fake-token-value-here',
        nested: {
          apiKey: 'nested-secret-should-redact',
          safe: 'visible',
        },
      },
    });

    const [entry] = useDevConsoleStore.getState().entries;
    expect(entry?.message).toContain('[redacted]');
    expect(JSON.stringify(entry?.detail)).not.toContain('nested-secret-should-redact');
    expect(JSON.stringify(entry?.detail)).not.toContain('fake-token-value-here');
    expect(JSON.stringify(entry?.detail)).toContain('visible');
  });

  it('caps large strings and arrays', () => {
    const redacted = redactForLog({
      text: 'x'.repeat(5000),
      rows: Array.from({ length: 40 }, (_, index) => index),
    }) as { text: string; rows: unknown[] };

    expect(redacted.text.length).toBeLessThan(4100);
    expect(redacted.text).toContain('[truncated');
    expect(redacted.rows).toHaveLength(26);
  });
});
