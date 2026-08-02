import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePetPresentationStore } from '@/features/pets/petPresentationStore';
import { useUIStore } from '@/stores/ui';
import { ChatView } from './ChatView';

const ensureActiveChatMock = vi.hoisted(() => vi.fn());

vi.mock('./chatLifecycle', () => ({
  ensureActiveChat: ensureActiveChatMock,
}));

vi.mock('./ChatThread', () => ({
  ChatThread: ({
    chatId,
    fixtureMessages,
  }: {
    chatId: string;
    fixtureMessages?: readonly unknown[];
  }) => (
    <div
      data-testid="chat-thread"
      data-chat-id={chatId}
      data-fixture-message-count={fixtureMessages?.length ?? 0}
    >
      Thread
    </div>
  ),
}));

vi.mock('./Composer', () => ({
  Composer: ({ chatId }: { chatId: string }) => (
    <div data-testid="chat-composer" data-chat-id={chatId}>
      Composer
    </div>
  ),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function expectOrigamiRoot(container: HTMLElement) {
  const root = container.querySelector("[data-vibespace-page='chat']");
  expect(root).not.toBeNull();
  expect(root?.getAttribute('data-vibespace-page')).toBe('chat');
  expect(root?.getAttribute('data-sakura-surface')).toBe('chat-route');
}

describe('ChatView Origami route scope', () => {
  beforeEach(() => {
    ensureActiveChatMock.mockReset();
    delete document.documentElement.dataset.monochromeChatState;
    delete document.documentElement.dataset.monochromeChatFixture;
    useUIStore.setState({ activeChatId: null });
    usePetPresentationStore.setState({ chats: {} });
  });

  afterEach(() => {
    delete document.documentElement.dataset.monochromeChatState;
    delete document.documentElement.dataset.monochromeChatFixture;
    cleanup();
  });

  it('marks the active Chat page root', () => {
    useUIStore.setState({ activeChatId: 'chat-active' });

    const { container } = render(<ChatView />);

    expectOrigamiRoot(container);
    expect(screen.getByTestId('chat-thread')).toBeTruthy();
    expect(screen.getByTestId('chat-composer')).toBeTruthy();
  });

  it('keeps the marker while Chat is ensuring an active conversation', async () => {
    const pending = deferred<string | null>();
    ensureActiveChatMock.mockReturnValue(pending.promise);

    const { container } = render(<ChatView />);

    expect(await screen.findByText('Starting a conversation…')).toBeTruthy();
    expectOrigamiRoot(container);
  });

  it('keeps the marker on the empty Chat state', async () => {
    const pending = deferred<string | null>();
    ensureActiveChatMock.mockReturnValue(pending.promise);
    const { container } = render(<ChatView />);
    await screen.findByText('Starting a conversation…');

    await act(async () => {
      pending.resolve('chat-created');
      await pending.promise;
    });

    expect(await screen.findByRole('heading', { name: 'Jarvis is ready.' })).toBeTruthy();
    expectOrigamiRoot(container);
  });

  it('keeps the marker when ensuring a Chat fails', async () => {
    const pending = deferred<string | null>();
    ensureActiveChatMock.mockReturnValue(pending.promise);
    const { container } = render(<ChatView />);
    await screen.findByText('Starting a conversation…');

    await act(async () => {
      pending.resolve(null);
      await pending.promise;
    });

    await waitFor(() => expect(screen.getByText(/Could not open a chat yet/)).toBeTruthy());
    expect(screen.getByRole('heading', { name: 'Jarvis is ready.' })).toBeTruthy();
    expectOrigamiRoot(container);
  });

  it('keeps the marker when ensuring a Chat rejects', async () => {
    ensureActiveChatMock.mockRejectedValue(new Error('fixture failure'));

    const { container } = render(<ChatView />);

    await waitFor(() => expect(screen.getByText(/Could not open a chat yet/)).toBeTruthy());
    expect(screen.getByRole('heading', { name: 'Jarvis is ready.' })).toBeTruthy();
    expectOrigamiRoot(container);
  });

  it('renders the real empty Chat without ensuring persistence for the exact visual marker', () => {
    document.documentElement.dataset.monochromeChatState = 'empty-state';
    ensureActiveChatMock.mockResolvedValue('unexpected-chat');

    const { container } = render(<ChatView />);

    expect(ensureActiveChatMock).not.toHaveBeenCalled();
    expect(container.querySelector('[data-vibespace-empty-chat]')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Jarvis is ready.' })).toBeTruthy();
  });

  it('keeps the exact visual empty state isolated from an existing active Chat', () => {
    document.documentElement.dataset.monochromeChatState = 'empty-state';
    useUIStore.setState({ activeChatId: 'persisted-chat' });

    const { container } = render(<ChatView />);

    expect(container.querySelector('[data-vibespace-empty-chat]')).not.toBeNull();
    expect(screen.queryByTestId('chat-thread')).toBeNull();
    expect(screen.queryByTestId('chat-composer')).toBeNull();
  });

  it('replays the exact visual chat fixture without asking persistence to create a chat', () => {
    document.documentElement.dataset.monochromeChatFixture = 'chat';
    ensureActiveChatMock.mockResolvedValue('unexpected-chat');

    render(<ChatView />);

    expect(ensureActiveChatMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('chat-thread').getAttribute('data-chat-id')).toBe('fixture-chat-001');
    expect(screen.getByTestId('chat-thread').getAttribute('data-fixture-message-count')).toBe('2');
    expect(screen.getByTestId('chat-composer').getAttribute('data-chat-id')).toBe(
      'fixture-chat-001',
    );
  });
});
