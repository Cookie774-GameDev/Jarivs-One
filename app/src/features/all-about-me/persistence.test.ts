import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAllAboutMeStore } from './store';
import { startAllAboutMePersistence } from './persistence';

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
      subscribeAccount: (listener) => { accountChanged = listener; return () => undefined; },
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
    let resolveLoad: ((value: {
      path: string;
      markdown: string;
      recovered: boolean;
      found: boolean;
    }) => void) | undefined;
    const load = vi.fn(() => new Promise<{
      path: string;
      markdown: string;
      recovered: boolean;
      found: boolean;
    }>((resolve) => { resolveLoad = resolve; }));

    const stop = startAllAboutMePersistence({
      getAccountId: () => 'account-new',
      subscribeAccount: () => () => undefined,
      load,
      save: async () => undefined,
    });

    expect(useAllAboutMeStore.getState().markdown).toBe('');
    resolveLoad?.({ path: 'account-new/all-about-me.md', markdown: '', recovered: false, found: false });
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
    await vi.waitFor(() => expect(useAllAboutMeStore.getState().markdown).toContain('Private profile'));

    expect(useAllAboutMeStore.getState().deleteProfile('delete')).toBe(true);

    await vi.waitFor(() => expect(save).toHaveBeenCalledWith('account-a', ''));
    stop();
  });

  it('migrates the legacy localStorage profile before removing its only copy', async () => {
    localStorage.setItem('jarvis-all-about-me', JSON.stringify({
      state: { markdown: '# All About Me\n\nLegacy profile' },
      version: 1,
    }));
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

    await vi.waitFor(() => expect(save).toHaveBeenCalledWith(
      'account-a',
      '# All About Me\n\nLegacy profile',
    ));
    expect(useAllAboutMeStore.getState().markdown).toContain('Legacy profile');
    expect(localStorage.getItem('jarvis-all-about-me')).toBeNull();
    stop();
  });
});
