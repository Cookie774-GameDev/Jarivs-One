import { describe, expect, it } from 'vitest';
import { installPatchers } from './patchers';
import { useDevConsoleStore } from './store';

describe('DevConsole console patcher', () => {
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
          message: 'deferred console mirror probe',
        }),
      ]);
    } finally {
      teardown();
      useDevConsoleStore.getState().clear();
    }
  });
});
