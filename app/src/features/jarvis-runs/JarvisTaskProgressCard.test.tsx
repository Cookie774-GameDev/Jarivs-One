import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JarvisCancellationRequestResult } from '@/lib/jarvis/contracts/execution';
import type { JarvisTaskRunProjection } from '@/lib/jarvis/executionJournal/legacyTaskRunAdapter';

import { JarvisTaskProgressCard } from './JarvisTaskProgressCard';
import { useJarvisTaskRunStore } from './taskRunStore';

const NOW = '2026-07-19T07:00:00.000Z';

function projection(
  runId: string,
  overrides: Partial<JarvisTaskRunProjection> = {},
): JarvisTaskRunProjection {
  return {
    canonical: true,
    runId,
    chatId: 'chat-a',
    status: 'running',
    goal: 'Inspect systems',
    userVisibleSummary: 'Canonical activity is running.',
    progress: 50,
    activeAgents: ['agent-terminal'],
    activeTerminals: ['pane-1'],
    updatedAt: NOW,
    cancellable: true,
    transportRetryAvailable: false,
    ...overrides,
  };
}

function load(...runs: JarvisTaskRunProjection[]) {
  act(() => {
    const store = useJarvisTaskRunStore.getState();
    store.setAccountScope('scope-alpha');
    store.replaceCanonicalForAccount('scope-alpha', runs, {});
  });
}

describe('JarvisTaskProgressCard', () => {
  beforeEach(() => useJarvisTaskRunStore.getState().clearForTests());

  it('shows bounded canonical progress but no Cancel without a real injected handler', () => {
    load(projection('jrun-alpha'));

    render(<JarvisTaskProgressCard chatId="chat-a" />);

    expect(screen.getByText('Inspect systems')).not.toBeNull();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50');
    expect(screen.getByText('1 agent')).not.toBeNull();
    expect(screen.getByText('1 terminal')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel task' })).toBeNull();
  });

  it('requests canonical cancellation and reports delivery without terminalizing local state', async () => {
    load(projection('jrun-alpha'));
    const requestCancellation = vi.fn(
      async (): Promise<JarvisCancellationRequestResult> => ({
        kind: 'intent_committed',
        requestState: 'new',
        authorityState: 'current',
        cancellationRequestId: 'jcancel-alpha',
        aggregate: { kind: 'signal_delivered', ownerIds: ['provider-alpha'] },
      }),
    );

    render(<JarvisTaskProgressCard chatId="chat-a" requestCancellation={requestCancellation} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel task' }));

    await screen.findByText('Cancellation signal delivered; waiting for verified run state.');
    expect(requestCancellation).toHaveBeenCalledWith('jrun-alpha');
    expect(useJarvisTaskRunStore.getState().runs['jrun-alpha']?.status).toBe('running');
  });

  it('reports outer authority revocation without treating it as cancellation', async () => {
    load(projection('jrun-alpha'));
    const requestCancellation = vi.fn(
      async (): Promise<JarvisCancellationRequestResult> => ({
        kind: 'authority_revoked_before_intent',
      }),
    );

    render(<JarvisTaskProgressCard chatId="chat-a" requestCancellation={requestCancellation} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel task' }));

    await screen.findByText('Cancellation authority changed; no intent was recorded.');
    expect(useJarvisTaskRunStore.getState().runs['jrun-alpha']?.status).toBe('running');
  });

  it('suppresses Cancel and generic Retry for the scheduled transport retry composite', () => {
    load(
      projection('jrun-schedule', {
        status: 'waiting-for-input',
        cancellable: false,
        transportRetryAvailable: true,
        transportRetryAttemptNumber: 2,
        userVisibleSummary: 'Transport retry available.',
      }),
    );
    const requestCancellation = vi.fn(
      async (): Promise<JarvisCancellationRequestResult> => ({
        kind: 'authority_revoked_before_intent',
      }),
    );

    render(<JarvisTaskProgressCard chatId="chat-a" requestCancellation={requestCancellation} />);

    expect(screen.getByText('Transport retry available')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /cancel task/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });

  it('never exposes cancellation for detached legacy history or another chat', () => {
    load(
      projection('legacy', { canonical: false, cancellable: false }),
      projection('other', { chatId: 'other-chat' }),
    );
    const requestCancellation = vi.fn(
      async (): Promise<JarvisCancellationRequestResult> => ({
        kind: 'authority_revoked_before_intent',
      }),
    );

    render(<JarvisTaskProgressCard chatId="chat-a" requestCancellation={requestCancellation} />);

    expect(screen.queryByRole('button', { name: /cancel task/i })).toBeNull();
    expect(screen.queryByText('other')).toBeNull();
  });
});
