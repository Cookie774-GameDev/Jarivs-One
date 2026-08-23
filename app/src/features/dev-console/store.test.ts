import { beforeEach, describe, expect, it } from 'vitest';
import { DEV_LOG_CAPACITY, devConsole, redactForLog, useDevConsoleStore } from './store';

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
      description: 'x'.repeat(5000),
      rows: Array.from({ length: 40 }, (_, index) => index),
    }) as { description: string; rows: unknown[] };

    expect(redacted.description.length).toBeLessThan(4100);
    expect(redacted.description).toContain('[truncated');
    expect(redacted.rows).toHaveLength(26);
  });

  it('bounds the complete serialized detail payload before persistence', () => {
    devConsole.log({
      channel: 'app',
      level: 'debug',
      message: 'bounded detail',
      detail: Object.fromEntries(
        Array.from({ length: 40 }, (_, index) => [`safeField${index}`, 'x'.repeat(4_000)]),
      ),
    });

    const serialized = JSON.stringify(useDevConsoleStore.getState().entries[0]?.detail);
    expect(serialized.length).toBeLessThan(13_000);
    expect(serialized).toContain('[detail bounded]');
  });

  it('redacts credential assignments inside otherwise safe fields', () => {
    devConsole.log({
      channel: 'action',
      level: 'info',
      message: 'Action search',
      detail: { params: { query: 'find apiKey=do-not-log-this-value in files' } },
    });
    const serialized = JSON.stringify(useDevConsoleStore.getState().entries);
    expect(serialized).not.toContain('do-not-log-this-value');
    expect(serialized).toContain('[content omitted]');
  });

  it('omits prompt, source, input, output, and request body content while retaining safe identity', () => {
    devConsole.log({
      channel: 'ai',
      level: 'info',
      message: 'provider request apiKey=never-store-this',
      detail: {
        requestId: 'req-safe-1',
        providerId: 'openai',
        modelId: 'gpt-5.6-luna-fast',
        prompt: 'private prompt content',
        sourceContent: 'private source content',
        input: { text: 'private tool input' },
        output: 'private provider output',
        body: { password: 'private body secret' },
      },
    });

    const serialized = JSON.stringify(useDevConsoleStore.getState().entries);
    expect(serialized).toContain('req-safe-1');
    expect(serialized).toContain('gpt-5.6-luna-fast');
    expect(serialized).not.toContain('private prompt content');
    expect(serialized).not.toContain('private source content');
    expect(serialized).not.toContain('private tool input');
    expect(serialized).not.toContain('private provider output');
    expect(serialized).not.toContain('private body secret');
    expect(serialized).not.toContain('never-store-this');
  });

  it('retains only the newest 10,000 entries', () => {
    for (let index = 0; index < DEV_LOG_CAPACITY + 3; index += 1) {
      devConsole.log({ channel: 'app', level: 'debug', message: `event-${index}` });
    }

    const entries = useDevConsoleStore.getState().entries;
    expect(entries).toHaveLength(10_000);
    expect(entries[0]?.message).toBe('event-3');
    expect(entries.at(-1)?.message).toBe(`event-${DEV_LOG_CAPACITY + 2}`);
  });
});
