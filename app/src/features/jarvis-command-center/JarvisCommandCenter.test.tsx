import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  JarvisArtifactV1,
  JarvisCommandCenterDataPort,
  JarvisCommandCenterHandlers,
  JarvisLiveEvidenceSnapshot,
  JarvisRun,
} from './types';
import { JarvisCommandCenter } from './JarvisCommandCenter';

vi.mock('@/lib/jarvis/smoke/config', () => ({ isKernelSmokeEnabled: () => true }));

function run(overrides: Partial<JarvisRun> = {}): JarvisRun {
  return {
    id: 'run-1',
    accountId: 'account-1',
    chatId: 'chat-1',
    source: 'typed_chat',
    status: 'running',
    agentId: 'jarvis',
    identityVersion: 1,
    profileRevisionId: 'profile-1',
    model: {
      providerId: 'provider-1',
      modelId: 'model-1',
      connectionMode: 'native-api',
      capabilities: {},
      capturedAt: 90,
    },
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

function port(currentRun = run()): JarvisCommandCenterDataPort {
  return {
    getRunsForChat: vi.fn(async () => [currentRun]),
    getEventsForRun: vi.fn(async () => []),
    getArtifactsForRun: vi.fn(
      async (): Promise<readonly JarvisArtifactV1[]> => [
        {
          schemaVersion: 1,
          id: 'artifact-1',
          runId: currentRun.id,
          requestId: 'request-1',
          attemptNumber: 1,
          state: 'partial',
          kind: 'text',
          title: 'Draft answer',
          sourceRefs: [],
          createdAt: 110,
        },
      ],
    ),
    getLiveEvidenceSnapshot: vi.fn(
      async (): Promise<JarvisLiveEvidenceSnapshot> => ({
        schemaVersion: 1,
        accountId: currentRun.accountId,
        runId: currentRun.id,
        capturedAt: 150,
        nodes: [
          {
            kind: 'model' as const,
            id: 'model:provider-1' as const,
            accountId: currentRun.accountId,
            runId: currentRun.id,
            state: 'active' as const,
            operations: ['generate'] as const,
            evidenceRef: 'jlive_proof-1' as const,
            verifiedAt: 125,
            providerId: 'provider-1',
            modelId: 'model-1',
            modelSnapshotRef: 'snapshot-1',
          },
        ],
      }),
    ),
    subscribe: vi.fn(() => () => undefined),
  };
}

function setReducedMotion(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe('JarvisCommandCenter', () => {
  beforeEach(() => setReducedMotion(false));

  it('keeps its canonical store live through StrictMode replay and disposes on real unmount', async () => {
    const dataPort = port(run({ status: 'completed' }));
    const disposeSubscription = vi.fn();
    vi.mocked(dataPort.subscribe).mockReturnValue(disposeSubscription);
    const view = render(
      <StrictMode>
        <JarvisCommandCenter
          accountId="account-1"
          chatId="chat-1"
          dataPort={dataPort}
          handlers={{}}
        />
      </StrictMode>,
    );

    expect(await screen.findByText('Run completed')).not.toBeNull();
    expect(dataPort.subscribe).toHaveBeenCalledTimes(2);
    expect(disposeSubscription).toHaveBeenCalledTimes(1);

    view.unmount();
    await waitFor(() => expect(disposeSubscription).toHaveBeenCalledTimes(2));
  });

  it('quarantines the previous scope while replacing and disposing its store', async () => {
    const firstPort = port(run({ status: 'running' }));
    const secondPort = port(
      run({ id: 'run-2', accountId: 'account-2', chatId: 'chat-2', status: 'completed' }),
    );
    const disposeFirst = vi.fn();
    const disposeSecond = vi.fn();
    vi.mocked(firstPort.subscribe).mockReturnValue(disposeFirst);
    vi.mocked(secondPort.subscribe).mockReturnValue(disposeSecond);
    const view = render(
      <JarvisCommandCenter
        accountId="account-1"
        chatId="chat-1"
        dataPort={firstPort}
        handlers={{}}
      />,
    );
    expect(await screen.findByText('Run running')).not.toBeNull();

    view.rerender(
      <JarvisCommandCenter
        accountId="account-2"
        chatId="chat-2"
        dataPort={secondPort}
        handlers={{}}
      />,
    );

    expect(screen.queryByText('Run running')).toBeNull();
    expect(await screen.findByText('Run completed')).not.toBeNull();
    expect(disposeFirst).toHaveBeenCalledTimes(1);
    expect(disposeSecond).not.toHaveBeenCalled();

    view.unmount();
    expect(disposeSecond).toHaveBeenCalledTimes(1);
  });

  it('starts collapsed, renders no tab or graph subtree, and never reads live evidence', async () => {
    const dataPort = port();
    render(
      <JarvisCommandCenter
        accountId="account-1"
        chatId="chat-1"
        dataPort={dataPort}
        handlers={{}}
      />,
    );

    const toggle = await screen.findByRole('button', { name: /expand command center/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(
      document.querySelector('[data-sik-evidence="run.status"]')?.getAttribute('data-run-status'),
    ).toBe('running');
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByTestId('command-center-graph')).toBeNull();
    expect(dataPort.getLiveEvidenceSnapshot).not.toHaveBeenCalled();
  });

  it('keeps exactly the two required tabs visible in the calm data-error state', async () => {
    const dataPort = port();
    vi.mocked(dataPort.getRunsForChat).mockRejectedValue(new Error('repository unavailable'));
    render(
      <JarvisCommandCenter
        accountId="account-1"
        chatId="chat-1"
        dataPort={dataPort}
        handlers={{}}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /expand command center/i }));
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Outputs',
      'Live Systems',
    ]);
    expect(screen.getByRole('tab', { name: 'Outputs' }).getAttribute('data-sik-evidence')).toBe(
      'outputs.tab',
    );
    expect(
      screen.getByRole('tab', { name: 'Live Systems' }).getAttribute('data-sik-evidence'),
    ).toBe('live.systems-tab');
    expect(await screen.findByText('Command Center data is unavailable.')).not.toBeNull();
  });

  it('expands to exactly Outputs and Live Systems and lazy-loads live evidence only on its tab', async () => {
    const dataPort = port();
    render(
      <JarvisCommandCenter
        accountId="account-1"
        chatId="chat-1"
        dataPort={dataPort}
        handlers={{}}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /expand command center/i }));
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Outputs',
      'Live Systems',
    ]);
    expect(await screen.findByText('Draft answer')).not.toBeNull();
    expect(screen.getByText('partial')).not.toBeNull();
    expect(dataPort.getLiveEvidenceSnapshot).not.toHaveBeenCalled();

    const liveTab = screen.getByRole('tab', { name: 'Live Systems' });
    liveTab.focus();
    fireEvent.keyDown(liveTab, { key: 'Enter' });
    expect(await screen.findByText('provider-1 / model-1')).not.toBeNull();
    expect(dataPort.getLiveEvidenceSnapshot).toHaveBeenCalledTimes(1);
  });

  it('routes the one eligible action without cross-calling cancellation or logical retry', async () => {
    const scheduled = run({
      source: 'schedule',
      transportAttempts: [
        {
          schemaVersion: 1,
          attemptNumber: 1,
          kind: 'initial',
          requestId: 'request-1',
          state: 'retryable_failed',
          startedEventSeq: 1,
          effectBarrier: { state: 'open', version: 0, updatedAt: 101 },
          createdAt: 100,
          updatedAt: 101,
        },
      ],
    });
    const handlers: JarvisCommandCenterHandlers = {
      cancelRun: vi.fn(async () => ({ kind: 'authority_revoked_before_intent' as const })),
      retryScheduledTransport: vi.fn(async () => ({ kind: 'account_authority_revoked' as const })),
      retryLogicalRun: vi.fn(async () => ({ kind: 'account_authority_revoked' as const })),
    };
    render(
      <JarvisCommandCenter
        accountId="account-1"
        chatId="chat-1"
        dataPort={port(scheduled)}
        handlers={handlers}
      />,
    );

    const retry = await screen.findByRole('button', { name: 'Retry transport' });
    expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull();
    fireEvent.click(retry);
    await waitFor(() =>
      expect(handlers.retryScheduledTransport).toHaveBeenCalledWith('account-1', 'run-1'),
    );
    expect(handlers.cancelRun).not.toHaveBeenCalled();
    expect(handlers.retryLogicalRun).not.toHaveBeenCalled();
  });

  it('routes cancellation only through the exact injected account/run handler', async () => {
    const handlers: JarvisCommandCenterHandlers = {
      cancelRun: vi.fn(async () => ({ kind: 'authority_revoked_before_intent' as const })),
    };
    render(
      <JarvisCommandCenter
        accountId="account-1"
        chatId="chat-1"
        dataPort={port()}
        handlers={handlers}
      />,
    );

    const cancel = await screen.findByRole('button', { name: 'Cancel' });
    expect(cancel.getAttribute('data-sik-evidence')).toBe('cancellation.delivery');
    fireEvent.click(cancel);
    await waitFor(() => expect(handlers.cancelRun).toHaveBeenCalledWith('account-1', 'run-1'));
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
    expect(
      await screen.findByText('Account changed; cancellation was not requested.'),
    ).not.toBeNull();
  });

  it('offers a new logical run only for an eligible terminal schedule snapshot', async () => {
    const terminal = run({
      source: 'schedule',
      status: 'failed',
      scheduledRetrySnapshot: {
        schemaVersion: 1,
        accountId: 'account-1',
        eventId: 'event-1',
        occurrenceId: 'jocc_occurrence-1',
        dueAt: 80,
        logicalAttempt: 1,
        request: { accountId: 'account-1', runId: 'run-1', surface: 'schedule' },
      } as never,
    });
    const handlers: JarvisCommandCenterHandlers = {
      retryScheduledTransport: vi.fn(async () => ({ kind: 'account_authority_revoked' as const })),
      retryLogicalRun: vi.fn(async () => ({ kind: 'account_authority_revoked' as const })),
    };
    render(
      <JarvisCommandCenter
        accountId="account-1"
        chatId="chat-1"
        dataPort={port(terminal)}
        handlers={handlers}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Retry as new run' }));
    await waitFor(() =>
      expect(handlers.retryLogicalRun).toHaveBeenCalledWith('account-1', 'run-1'),
    );
    expect(handlers.retryScheduledTransport).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Retry transport' })).toBeNull();
  });

  it('renders quiet empty, cancelled, and unavailable states without fabricating an action', async () => {
    const dataPort = port(run({ status: 'cancelled' }));
    vi.mocked(dataPort.getArtifactsForRun).mockResolvedValue([]);
    vi.mocked(dataPort.getLiveEvidenceSnapshot).mockResolvedValue(undefined);
    render(
      <JarvisCommandCenter
        accountId="account-1"
        chatId="chat-1"
        dataPort={dataPort}
        handlers={{}}
      />,
    );

    expect(await screen.findByText('Run cancelled')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /cancel|retry/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /expand command center/i }));
    expect(await screen.findByText('No persisted outputs for this run yet.')).not.toBeNull();
    const liveTab = screen.getByRole('tab', { name: 'Live Systems' });
    liveTab.focus();
    fireEvent.keyDown(liveTab, { key: 'Enter' });
    expect(await screen.findByText('Live evidence is unavailable.')).not.toBeNull();
  });

  it('shows quiet retry copy instead of a disabled or fallback action when its handler is absent', async () => {
    const scheduled = run({
      source: 'schedule',
      transportAttempts: [
        {
          schemaVersion: 1,
          attemptNumber: 1,
          kind: 'initial',
          requestId: 'request-1',
          state: 'retryable_failed',
          startedEventSeq: 1,
          effectBarrier: { state: 'open', version: 0, updatedAt: 101 },
          createdAt: 100,
          updatedAt: 101,
        },
      ],
    });
    render(
      <JarvisCommandCenter
        accountId="account-1"
        chatId="chat-1"
        dataPort={port(scheduled)}
        handlers={{}}
      />,
    );

    expect(
      await screen.findByText('Transport retry is available; this view cannot request it.'),
    ).not.toBeNull();
    expect(screen.queryByRole('button', { name: /retry|cancel/i })).toBeNull();
  });

  it.each(['failed', 'timed_out'] as const)(
    'exposes the truthful smoke error marker for a %s canonical run',
    async (status) => {
      render(
        <JarvisCommandCenter
          accountId="account-1"
          chatId="chat-1"
          dataPort={port(run({ status }))}
          handlers={{}}
        />,
      );

      expect(await screen.findByText(`Run ${status.replaceAll('_', ' ')}`)).not.toBeNull();
      expect(document.querySelector('[data-sik-evidence="run.error"]')).not.toBeNull();
    },
  );

  it('preserves native Enter, Space, Tab, and Radix Arrow navigation semantics', async () => {
    render(
      <JarvisCommandCenter accountId="account-1" chatId="chat-1" dataPort={port()} handlers={{}} />,
    );
    const toggle = await screen.findByRole('button', { name: /expand command center/i });
    expect(fireEvent.keyDown(toggle, { key: 'Enter' })).toBe(true);
    expect(fireEvent.keyDown(toggle, { key: ' ' })).toBe(true);
    fireEvent.click(toggle);

    const outputs = screen.getByRole('tab', { name: 'Outputs' });
    const live = screen.getByRole('tab', { name: 'Live Systems' });
    outputs.focus();
    fireEvent.keyDown(outputs, { key: 'ArrowRight' });
    await waitFor(() => expect(document.activeElement).toBe(live));
    expect(fireEvent.keyDown(live, { key: 'Tab' })).toBe(true);
  });

  it('removes motion styling under reduced motion and preserves toggle focus and Escape behavior', async () => {
    setReducedMotion(true);
    render(
      <JarvisCommandCenter accountId="account-1" chatId="chat-1" dataPort={port()} handlers={{}} />,
    );
    const toggle = await screen.findByRole('button', { name: /expand command center/i });
    toggle.focus();
    fireEvent.click(toggle);
    expect(document.activeElement).toBe(toggle);
    expect(
      screen
        .getByTestId('jarvis-command-center')
        .classList.contains('jarvis-command-center--motion'),
    ).toBe(false);
    fireEvent.keyDown(screen.getByTestId('jarvis-command-center'), { key: 'Escape' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
  });
});
