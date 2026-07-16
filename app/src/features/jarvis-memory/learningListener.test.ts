import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { emojisEnabledFromLearning, startJarvisLearningListener } from './learningListener';
import { useJarvisLearningStore } from './learningStore';

describe('Jarvis learning event listener', () => {
  let stop: (() => void | Promise<void>) | undefined;

  beforeEach(() => {
    localStorage.clear();
    useJarvisLearningStore.getState().clearForTests();
  });
  afterEach(async () => {
    await stop?.();
  });

  it('persists explicit memory immediately and applies response preferences', async () => {
    const save = vi.fn(async (_accountId: string, _markdown: string) => undefined);
    const statuses: string[] = [];
    const onStatus = (event: Event) =>
      statuses.push((event as CustomEvent<{ state: string }>).detail.state);
    window.addEventListener('jarvis:memory-status', onStatus);
    stop = startJarvisLearningListener({
      getAccountId: () => 'account-a',
      save,
      debounceMs: 0,
      load: async () => null,
    });

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId: 'chat-1', text: 'Remember that I prefer no emojis in responses.' },
      }),
    );

    await vi.waitFor(() => expect(save).toHaveBeenCalled());
    expect(emojisEnabledFromLearning()).toBe(false);
    const saveCalls = save.mock.calls as unknown as Array<[string, string]>;
    expect(saveCalls.at(-1)?.[0]).toBe('account-a');
    expect(saveCalls.at(-1)?.[1]).toContain('I prefer no emojis');
    expect(statuses).toEqual(expect.arrayContaining(['updating', 'updated']));
    window.removeEventListener('jarvis:memory-status', onStatus);
  });

  it('removes the deprecated localStorage profile copy on startup', () => {
    localStorage.setItem('jarvis-learning-memory-v1', '{"legacy":"private profile"}');
    stop = startJarvisLearningListener({
      getAccountId: () => 'account-a',
      save: async () => undefined,
      load: async () => null,
    });
    expect(localStorage.getItem('jarvis-learning-memory-v1')).toBeNull();
  });

  it('does not announce completion before the physical save resolves', async () => {
    let finishSave: (() => void) | undefined;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    const statuses: string[] = [];
    const onStatus = (event: Event) =>
      statuses.push((event as CustomEvent<{ state: string }>).detail.state);
    window.addEventListener('jarvis:memory-status', onStatus);
    stop = startJarvisLearningListener({
      getAccountId: () => 'account-a',
      save,
      load: async () => null,
      debounceMs: 0,
    });

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId: 'chat-1', text: 'Remember that I prefer direct answers.' },
      }),
    );
    await vi.waitFor(() => expect(save).toHaveBeenCalled());
    expect(statuses).toEqual(['updating']);

    finishSave?.();
    await vi.waitFor(() => expect(statuses).toEqual(['updating', 'updated']));
    window.removeEventListener('jarvis:memory-status', onStatus);
  });

  it('waits for account recovery before applying a new memory update', async () => {
    let finishLoad: ((value: string | null) => void) | undefined;
    const load = vi.fn(
      () =>
        new Promise<string | null>((resolve) => {
          finishLoad = resolve;
        }),
    );
    const save = vi.fn(async (_accountId: string, _markdown: string) => undefined);
    stop = startJarvisLearningListener({
      getAccountId: () => 'account-a',
      load,
      save,
      debounceMs: 0,
    });

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId: 'chat-1', text: 'Remember that I prefer verified results.' },
      }),
    );
    await Promise.resolve();
    expect(save).not.toHaveBeenCalled();

    finishLoad?.(null);
    await vi.waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls.at(-1)?.[1]).toContain('I prefer verified results');
  });

  it('reviews ten meaningful messages from an ephemeral buffer', async () => {
    stop = startJarvisLearningListener({
      getAccountId: () => 'account-a',
      save: async () => undefined,
      debounceMs: 0,
      load: async () => null,
    });

    for (let index = 0; index < 10; index += 1) {
      window.dispatchEvent(
        new CustomEvent('jarvis:send', {
          detail: {
            chatId: 'chat-1',
            text: `I prefer concise status updates for workflow ${index}.`,
          },
        }),
      );
    }

    await vi.waitFor(() => {
      expect(useJarvisLearningStore.getState().currentProfile().lastEvaluationCount).toBe(10);
    });
    expect(
      useJarvisLearningStore
        .getState()
        .currentProfile()
        .items.some(
          (item) => item.source.kind === 'inferred' && item.category === 'response-style',
        ),
    ).toBe(true);
  });

  it('loads the correct account immediately when authentication changes', async () => {
    let accountId = 'account-a';
    let accountChanged: () => void = () => {};
    const load = vi.fn(async (id: string) =>
      id === 'account-b'
        ? '# Jarvis Learning\n\n<!-- jarvis-learning-v1:%7B%22accountId%22%3A%22account-b%22%2C%22enabled%22%3Atrue%2C%22items%22%3A%5B%5D%2C%22meaningfulMessageCount%22%3A0%2C%22lastEvaluationCount%22%3A0%2C%22updatedAt%22%3A1%7D -->'
        : null,
    );
    stop = startJarvisLearningListener({
      getAccountId: () => accountId,
      subscribeAccount: (listener) => {
        accountChanged = listener;
        return () => undefined;
      },
      save: async () => undefined,
      load,
    });
    await vi.waitFor(() => expect(load).toHaveBeenCalledWith('account-a'));

    accountId = 'account-b';
    accountChanged();

    await vi.waitFor(() =>
      expect(useJarvisLearningStore.getState().activeAccountId).toBe('account-b'),
    );
    expect(load).toHaveBeenCalledWith('account-b');
  });

  it('does not discard a pending save when the authenticated account changes', async () => {
    let accountId = 'account-a';
    let accountChanged: () => void = () => undefined;
    const save = vi.fn(async (_accountId: string, _markdown: string) => undefined);
    stop = startJarvisLearningListener({
      getAccountId: () => accountId,
      subscribeAccount: (listener) => {
        accountChanged = listener;
        return () => undefined;
      },
      save,
      load: async () => null,
      debounceMs: 25,
    });
    await vi.waitFor(() =>
      expect(useJarvisLearningStore.getState().activeAccountId).toBe('account-a'),
    );

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: {
          chatId: 'chat-1',
          text: 'This is a meaningful account A workflow preference message.',
        },
      }),
    );
    await vi.waitFor(() =>
      expect(useJarvisLearningStore.getState().currentProfile().meaningfulMessageCount).toBe(1),
    );
    accountId = 'account-b';
    accountChanged();

    await vi.waitFor(() => expect(save.mock.calls.some(([id]) => id === 'account-a')).toBe(true));
  });

  it('flushes the latest debounced account write before stop resolves', async () => {
    const save = vi.fn(async (_accountId: string, _markdown: string) => undefined);
    const load = vi.fn(async () => null);
    stop = startJarvisLearningListener({
      getAccountId: () => 'account-a',
      save,
      load,
      debounceMs: 60_000,
    });
    await vi.waitFor(() => expect(load).toHaveBeenCalledWith('account-a'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    useJarvisLearningStore.getState().remember({
      value: 'Keep account A review notes concise',
      category: 'response-style',
      source: { kind: 'explicit' },
    });
    expect(save).not.toHaveBeenCalled();

    const stopping = stop();
    stop = undefined;
    await stopping;

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(
      'account-a',
      expect.stringContaining('Keep account A review notes concise'),
    );
  });

  it('rejects a blank persistence scope instead of fabricating local-unassigned', () => {
    const load = vi.fn(async () => null);
    const save = vi.fn(async () => undefined);

    expect(() =>
      startJarvisLearningListener({
        getAccountId: () => '   ',
        load,
        save,
      }),
    ).toThrow(/account id/i);
    expect(load).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
