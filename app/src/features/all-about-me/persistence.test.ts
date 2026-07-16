import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAllAboutMeStore } from './store';
import { startAllAboutMePersistence } from './persistence';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return {
    promise,
    resolve: () => resolve?.(),
  };
}

function deferredValue<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return {
    promise,
    resolve: (value) => resolve?.(value),
  };
}

describe('All About Me account persistence coordinator', () => {
  beforeEach(() => {
    localStorage.clear();
    useAllAboutMeStore.setState(useAllAboutMeStore.getInitialState(), true);
  });

  it('flushes the old account and resets before loading a different account', async () => {
    let accountId = 'account-a';
    let accountChanged: () => void = () => {};
    const save = vi.fn(async () => undefined);
    const load = vi.fn(async (id: string) => ({
      path: `${id}/all-about-me.md`,
      markdown: id === 'account-b' ? '# AllAboutMe.md\n\nProfile B' : '',
      recovered: false,
      found: id === 'account-b',
    }));
    const stop = startAllAboutMePersistence({
      getAccountId: () => accountId,
      subscribeAccount: (listener) => {
        accountChanged = listener;
        return () => undefined;
      },
      load,
      save,
      debounceMs: 0,
    });
    await vi.waitFor(() => expect(load).toHaveBeenCalledWith('account-a'));
    useAllAboutMeStore.getState().setMarkdown('# AllAboutMe.md\n\nProfile A');

    accountId = 'account-b';
    accountChanged();

    await vi.waitFor(() => expect(useAllAboutMeStore.getState().markdown).toContain('Profile B'));
    expect(save).toHaveBeenCalledWith('account-a', '# AllAboutMe.md\n\nProfile A');
    stop();
  });

  it('clears a legacy unscoped profile before the initial account load resolves', async () => {
    useAllAboutMeStore.getState().setMarkdown('# AllAboutMe.md\n\nPrevious account profile');
    let resolveLoad:
      | ((value: { path: string; markdown: string; recovered: boolean; found: boolean }) => void)
      | undefined;
    const load = vi.fn(
      () =>
        new Promise<{
          path: string;
          markdown: string;
          recovered: boolean;
          found: boolean;
        }>((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const stop = startAllAboutMePersistence({
      getAccountId: () => 'account-new',
      subscribeAccount: () => () => undefined,
      load,
      save: async () => undefined,
    });

    expect(useAllAboutMeStore.getState().markdown).toBe('');
    resolveLoad?.({
      path: 'account-new/all-about-me.md',
      markdown: '',
      recovered: false,
      found: false,
    });
    await Promise.resolve();
    stop();
  });

  it('persists an empty profile so deletion clears every durable copy', async () => {
    const save = vi.fn(async () => undefined);
    const stop = startAllAboutMePersistence({
      getAccountId: () => 'account-a',
      subscribeAccount: () => () => undefined,
      load: async () => ({
        path: 'account-a/all-about-me.md',
        markdown: '# All About Me\n\nPrivate profile',
        recovered: false,
        found: true,
      }),
      save,
      debounceMs: 0,
    });
    await vi.waitFor(() =>
      expect(useAllAboutMeStore.getState().markdown).toContain('Private profile'),
    );

    expect(useAllAboutMeStore.getState().deleteProfile('delete')).toBe(true);

    await vi.waitFor(() => expect(save).toHaveBeenCalledWith('account-a', ''));
    stop();
  });

  it('migrates the legacy localStorage profile before removing its only copy', async () => {
    localStorage.setItem(
      'jarvis-all-about-me',
      JSON.stringify({
        state: { markdown: '# All About Me\n\nLegacy profile' },
        version: 1,
      }),
    );
    const save = vi.fn(async () => undefined);
    const stop = startAllAboutMePersistence({
      getAccountId: () => 'account-a',
      subscribeAccount: () => () => undefined,
      load: async () => ({
        path: 'account-a/all-about-me.md',
        markdown: '',
        recovered: false,
        found: false,
      }),
      save,
    });

    await vi.waitFor(() =>
      expect(save).toHaveBeenCalledWith('account-a', '# All About Me\n\nLegacy profile'),
    );
    expect(useAllAboutMeStore.getState().markdown).toContain('Legacy profile');
    expect(localStorage.getItem('jarvis-all-about-me')).toBeNull();
    stop();
  });

  it('flushes the latest debounced profile before stop resolves', async () => {
    const save = vi.fn(async () => undefined);
    const stop = startAllAboutMePersistence({
      getAccountId: () => 'account-a',
      subscribeAccount: () => () => undefined,
      load: async () => ({
        path: 'account-a/all-about-me.md',
        markdown: '',
        recovered: false,
        found: false,
      }),
      save,
      debounceMs: 60_000,
    });
    await vi.waitFor(() => {
      expect(useAllAboutMeStore.getState().accountScope).toBe('account-a');
    });

    useAllAboutMeStore.getState().setMarkdown('# All About Me\n\nPrivate account A profile');
    expect(save).not.toHaveBeenCalled();

    await stop();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('account-a', '# All About Me\n\nPrivate account A profile');
  });

  it('serializes a latest stop flush behind an older in-flight profile write', async () => {
    const completions = [deferred(), deferred()];
    let nextCompletion = 0;
    let durableMarkdown = '';
    const save = vi.fn((_accountId: string, markdown: string) => {
      const completion = completions[nextCompletion++];
      if (!completion) throw new Error('Unexpected All About Me save.');
      return completion.promise.then(() => {
        durableMarkdown = markdown;
      });
    });
    const stop = startAllAboutMePersistence({
      getAccountId: () => 'account-a',
      subscribeAccount: () => () => undefined,
      load: async () => ({
        path: 'account-a/all-about-me.md',
        markdown: '',
        recovered: false,
        found: false,
      }),
      save,
      debounceMs: 0,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    useAllAboutMeStore.getState().setMarkdown('# All About Me\n\nOlder profile');
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    useAllAboutMeStore.getState().setMarkdown('# All About Me\n\nLatest durable profile');

    const stopping = stop();
    await new Promise((resolve) => setTimeout(resolve, 0));
    completions[1]!.resolve();
    await Promise.resolve();
    completions[0]!.resolve();
    await stopping;

    expect(save).toHaveBeenCalledTimes(2);
    expect(durableMarkdown).toBe('# All About Me\n\nLatest durable profile');
  });

  it('tracks a claimed legacy migration through stop without offering it to the next account', async () => {
    localStorage.setItem(
      'jarvis-all-about-me',
      JSON.stringify({
        state: { markdown: '# All About Me\n\nLegacy account A profile' },
        version: 1,
      }),
    );
    const migration = deferred();
    const save = vi.fn((accountId: string) =>
      accountId === 'account-a' ? migration.promise : Promise.resolve(),
    );
    const load = vi.fn(async (accountId: string) => ({
      path: `${accountId}/all-about-me.md`,
      markdown: '',
      recovered: false,
      found: false,
    }));
    const stopAccountA = startAllAboutMePersistence({
      getAccountId: () => 'account-a',
      subscribeAccount: () => () => undefined,
      load,
      save,
    });
    await vi.waitFor(() => expect(save).toHaveBeenCalledWith('account-a', expect.any(String)));

    let stopSettled = false;
    const stoppingAccountA = stopAccountA().then(() => {
      stopSettled = true;
    });
    const stopAccountB = startAllAboutMePersistence({
      getAccountId: () => 'account-b',
      subscribeAccount: () => () => undefined,
      load,
      save,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const stopWaitedForMigration = !stopSettled;
    const migratedToAccountB = save.mock.calls.some(([accountId]) => accountId === 'account-b');
    const claimedLegacy = localStorage.getItem('jarvis-all-about-me');

    migration.resolve();
    await stoppingAccountA;
    await stopAccountB();

    expect(stopWaitedForMigration).toBe(true);
    expect(migratedToAccountB).toBe(false);
    expect(JSON.parse(claimedLegacy ?? '{}').state?.accountScope).toBe('account-a');
    expect(localStorage.getItem('jarvis-all-about-me')).not.toBeNull();
  });

  it('claims legacy before canonical load and tracks the activation through teardown', async () => {
    const legacyMarkdown = '# All About Me\n\nLegacy account A profile';
    localStorage.setItem(
      'jarvis-all-about-me',
      JSON.stringify({
        state: { markdown: legacyMarkdown },
        version: 1,
      }),
    );
    const accountALoad = deferredValue<{
      path: string;
      markdown: string;
      recovered: boolean;
      found: boolean;
    }>();
    const accountAMigration = deferred();
    const load = vi.fn((accountId: string) =>
      accountId === 'account-a'
        ? accountALoad.promise
        : Promise.resolve({
            path: `${accountId}/all-about-me.md`,
            markdown: '',
            recovered: false,
            found: false,
          }),
    );
    const save = vi.fn((accountId: string) =>
      accountId === 'account-a' ? accountAMigration.promise : Promise.resolve(),
    );

    const stopAccountA = startAllAboutMePersistence({
      getAccountId: () => 'account-a',
      subscribeAccount: () => () => undefined,
      load,
      save,
    });
    const claimedBeforeLoad = JSON.parse(localStorage.getItem('jarvis-all-about-me') ?? '{}').state
      ?.accountScope;

    let accountAStopSettled = false;
    const stoppingAccountA = stopAccountA().then(() => {
      accountAStopSettled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const stopSettledBeforeLoad = accountAStopSettled;

    const stopAccountB = startAllAboutMePersistence({
      getAccountId: () => 'account-b',
      subscribeAccount: () => () => undefined,
      load,
      save,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const accountBMigratedBeforeALoad = save.mock.calls.some(
      ([accountId]) => accountId === 'account-b',
    );
    const accountBAppliedLegacy = useAllAboutMeStore.getState().markdown === legacyMarkdown;

    accountALoad.resolve({
      path: 'account-a/all-about-me.md',
      markdown: '',
      recovered: false,
      found: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const accountAMigrationQueued = save.mock.calls.some(
      ([accountId]) => accountId === 'account-a',
    );
    const stopSettledBeforeMigration = accountAStopSettled;

    accountAMigration.resolve();
    await stoppingAccountA;
    await stopAccountB();
    const retainedLegacy = JSON.parse(localStorage.getItem('jarvis-all-about-me') ?? '{}').state;

    expect(claimedBeforeLoad).toBe('account-a');
    expect(stopSettledBeforeLoad).toBe(false);
    expect(accountBMigratedBeforeALoad).toBe(false);
    expect(accountBAppliedLegacy).toBe(false);
    expect(accountAMigrationQueued).toBe(true);
    expect(stopSettledBeforeMigration).toBe(false);
    expect(retainedLegacy).toMatchObject({
      accountScope: 'account-a',
      markdown: legacyMarkdown,
    });
  });

  it('does not migrate captured legacy after a newer profile edit is queued', async () => {
    const legacyMarkdown = '# All About Me\n\nLegacy account A profile';
    const newestMarkdown = '# All About Me\n\nNewest account A profile';
    localStorage.setItem(
      'jarvis-all-about-me',
      JSON.stringify({
        state: { markdown: legacyMarkdown },
        version: 1,
      }),
    );
    const accountALoad = deferredValue<{
      path: string;
      markdown: string;
      recovered: boolean;
      found: boolean;
    }>();
    let durableMarkdown = '';
    const save = vi.fn(async (_accountId: string, markdown: string) => {
      durableMarkdown = markdown;
    });
    const stop = startAllAboutMePersistence({
      getAccountId: () => 'account-a',
      subscribeAccount: () => () => undefined,
      load: () => accountALoad.promise,
      save,
      debounceMs: 60_000,
    });
    expect(
      JSON.parse(localStorage.getItem('jarvis-all-about-me') ?? '{}').state?.accountScope,
    ).toBe('account-a');

    useAllAboutMeStore.getState().setMarkdown(newestMarkdown);
    let stopSettled = false;
    const stopping = stop().then(() => {
      stopSettled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stopSettled).toBe(false);

    accountALoad.resolve({
      path: 'account-a/all-about-me.md',
      markdown: '',
      recovered: false,
      found: false,
    });
    await stopping;

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('account-a', newestMarkdown);
    expect(durableMarkdown).toBe(newestMarkdown);
    expect(JSON.parse(localStorage.getItem('jarvis-all-about-me') ?? '{}').state).toMatchObject({
      accountScope: 'account-a',
      markdown: legacyMarkdown,
    });
  });

  it('quarantines the profile synchronously when the account becomes blank', async () => {
    let accountId = 'account-a';
    let accountChanged: () => void = () => undefined;
    const completion = deferred();
    const save = vi.fn(() => completion.promise);
    const stop = startAllAboutMePersistence({
      getAccountId: () => accountId,
      subscribeAccount: (listener) => {
        accountChanged = listener;
        return () => undefined;
      },
      load: async () => ({
        path: 'account-a/all-about-me.md',
        markdown: '',
        recovered: false,
        found: false,
      }),
      save,
      debounceMs: 60_000,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    useAllAboutMeStore
      .getState()
      .setMarkdown('# All About Me\n\nPrivate profile pending a slow flush');

    accountId = '';
    accountChanged();
    const sameTurnState = {
      accountScope: useAllAboutMeStore.getState().accountScope,
      markdown: useAllAboutMeStore.getState().markdown,
    };

    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    completion.resolve();
    await vi.waitFor(() => expect(useAllAboutMeStore.getState().accountScope).toBe(''));
    await stop();

    expect(sameTurnState).toEqual({
      accountScope: '',
      markdown: '',
    });
    expect(useAllAboutMeStore.getState().markdown).toBe('');
  });

  it('rejects a blank persistence scope instead of fabricating local-unassigned', () => {
    const load = vi.fn(async () => ({
      path: 'unused/all-about-me.md',
      markdown: '',
      recovered: false,
      found: false,
    }));
    const save = vi.fn(async () => undefined);

    expect(() =>
      startAllAboutMePersistence({
        getAccountId: () => '   ',
        subscribeAccount: () => () => undefined,
        load,
        save,
      }),
    ).toThrow(/account id/i);
    expect(load).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(useAllAboutMeStore.getState().accountScope).toBe('');
  });
});
