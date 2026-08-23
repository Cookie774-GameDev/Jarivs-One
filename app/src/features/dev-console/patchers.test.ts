// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { installPatchers } from './patchers';
import { useDevConsoleStore } from './store';

describe('DevConsole console patcher', () => {
  afterEach(() => {
    useDevConsoleStore.getState().clear();
  });

  it('defers its store update until the caller stack has completed', async () => {
    const teardown = installPatchers();

    try {
      useDevConsoleStore.getState().clear();
      console.warn('deferred console mirror probe');

      expect(useDevConsoleStore.getState().entries).toEqual([]);

      await Promise.resolve();

      expect(useDevConsoleStore.getState().entries).toEqual([
        expect.objectContaining({
          channel: 'console',
          level: 'warn',
          message: 'console.warn',
          detail: expect.objectContaining({
            argumentCount: 1,
            firstArgumentType: 'string',
          }),
        }),
      ]);
    } finally {
      teardown();
    }
  });

  it('redacts and bounds uncaught window error details before persistence', () => {
    const teardown = installPatchers();
    const privateValue = `private-${'x'.repeat(5000)}`;

    try {
      useDevConsoleStore.getState().clear();
      window.dispatchEvent(
        new ErrorEvent('error', {
          message: `apiKey=${privateValue}`,
          error: new Error(`Bearer ${privateValue}`),
          filename: 'renderer.ts',
          lineno: 42,
          colno: 7,
        }),
      );

      const [entry] = useDevConsoleStore.getState().entries;
      const serialized = JSON.stringify(entry);
      expect(entry).toMatchObject({
        channel: 'window',
        level: 'error',
      });
      expect(serialized).not.toContain(privateValue);
      expect(serialized).toContain('[redacted]');
      expect(serialized.length).toBeLessThan(5000);
    } finally {
      teardown();
    }
  });

  it('redacts unhandled rejection reasons before persistence', () => {
    const teardown = installPatchers();
    const privateValue = 'private-rejection-value';

    try {
      useDevConsoleStore.getState().clear();
      const event = new Event('unhandledrejection') as PromiseRejectionEvent;
      Object.defineProperty(event, 'reason', {
        configurable: true,
        value: new Error(`access_token=${privateValue}`),
      });
      window.dispatchEvent(event);

      const [entry] = useDevConsoleStore.getState().entries;
      const serialized = JSON.stringify(entry);
      expect(entry).toMatchObject({
        channel: 'window',
        level: 'error',
      });
      expect(serialized).not.toContain(privateValue);
      expect(serialized).toContain('[redacted]');
    } finally {
      teardown();
    }
  });

  it('records a safe request correlation without request or response content', async () => {
    const originalFetch = window.fetch;
    window.fetch = async () =>
      new Response('private response body', {
        status: 200,
        headers: { 'x-request-id': 'upstream-request-1' },
      });
    const teardown = installPatchers();

    try {
      useDevConsoleStore.getState().clear();
      await window.fetch('https://example.test/v1/models?api_key=private-query-secret', {
        method: 'POST',
        body: 'private request body',
      });

      const entry = useDevConsoleStore
        .getState()
        .entries.find((value) => value.channel === 'fetch');
      const serialized = JSON.stringify(entry);
      expect(entry).toMatchObject({
        channel: 'fetch',
        detail: {
          operationId: expect.stringMatching(/^fetch-\d+$/u),
          requestId: 'upstream-request-1',
          method: 'POST',
          status: 200,
        },
      });
      expect(serialized).not.toContain('private-query-secret');
      expect(serialized).not.toContain('private request body');
      expect(serialized).not.toContain('private response body');
    } finally {
      teardown();
      window.fetch = originalFetch;
    }
  });
});
