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
  ChatThread: () => <div data-testid="chat-thread">Thread</div>,
}));

vi.mock('./Composer', () => ({
  Composer: () => <div data-testid="chat-composer">Composer</div>,
}));

vi.mock('./EmptyChat', () => ({
  EmptyChat: () => <div data-testid="empty-chat">Empty chat</div>,
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
}

describe('ChatView Origami route scope', () => {
  beforeEach(() => {
    ensureActiveChatMock.mockReset();
    useUIStore.setState({ activeChatId: null });
    usePetPresentationStore.setState({ chats: {} });
  });

  afterEach(() => {
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

    expect(await screen.findByTestId('empty-chat')).toBeTruthy();
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
    expect(screen.getByTestId('empty-chat')).toBeTruthy();
    expectOrigamiRoot(container);
  });

  it('keeps the marker when ensuring a Chat rejects', async () => {
    ensureActiveChatMock.mockRejectedValue(new Error('fixture failure'));

    const { container } = render(<ChatView />);

    await waitFor(() => expect(screen.getByText(/Could not open a chat yet/)).toBeTruthy());
    expect(screen.getByTestId('empty-chat')).toBeTruthy();
    expectOrigamiRoot(container);
  });
});
