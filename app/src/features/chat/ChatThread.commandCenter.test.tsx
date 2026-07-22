import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  JarvisCommandCenterProvider,
  type JarvisCommandCenterBinding,
} from '@/features/jarvis-command-center/JarvisCommandCenter';
import type { JarvisRun } from '@/features/jarvis-command-center/types';
import { useJarvisTaskRunStore } from '@/features/jarvis-runs/taskRunStore';
import { ChatThread } from './ChatThread';

vi.mock('./hooks', () => ({ useChatMessages: () => [] }));
vi.mock('./MessageBubble', () => ({ MessageBubble: () => <div>message</div> }));
vi.mock('./activity', () => ({
  ChatActivityTimeline: () => <div data-testid="legacy-timeline">Legacy timeline</div>,
}));
vi.mock('@/features/jarvis-interaction/AgentActivityCard', () => ({
  ChatAgentActivityPanel: () => <div data-testid="agent-panel">Agent panel</div>,
}));
vi.mock('@/features/jarvis-runs/JarvisTaskProgressCard', () => ({
  JarvisTaskProgressCard: () => <div data-testid="legacy-progress">Legacy progress</div>,
}));
vi.mock('@/features/jarvis-memory/JarvisMemoryStatus', () => ({
  JarvisMemoryStatus: () => <div data-testid="memory-status">Memory</div>,
}));
vi.mock('@/lib/jarvis/smoke/config', () => ({ isKernelSmokeEnabled: () => true }));

function canonicalRun({
  accountId = 'account-1',
  chatId = 'chat-1',
}: { accountId?: string; chatId?: string } = {}): JarvisRun {
  return {
    id: 'jrun-direct-1',
    accountId,
    chatId,
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
  };
}

function binding(
  runs: readonly JarvisRun[] = [],
  accountId = 'account-1',
): JarvisCommandCenterBinding {
  const liveEvidence = {
    accountId,
    snapshot: vi.fn(async () => undefined),
    subscribe: vi.fn(() => () => undefined),
  } as JarvisCommandCenterBinding['hostPort']['liveEvidence'];
  return {
    hostPort: {
      accountId,
      liveEvidence,
      requestCancellation: vi.fn(async () => ({
        kind: 'authority_revoked_before_intent' as const,
      })),
      retryScheduledTransport: vi.fn(async () => ({
        kind: 'account_authority_revoked' as const,
      })),
      retryLogicalRun: vi.fn(async () => ({ kind: 'account_authority_revoked' as const })),
    },
    dataPort: {
      getRunsForChat: vi.fn(async () => runs),
      getEventsForRun: vi.fn(async () => []),
      getArtifactsForRun: vi.fn(async () => []),
      getLiveEvidenceSnapshot: vi.fn(async () => undefined),
      subscribe: vi.fn(() => () => undefined),
    },
  };
}

describe('ChatThread Command Center routing', () => {
  beforeEach(() => {
    useJarvisTaskRunStore.getState().clearForTests();
    useJarvisTaskRunStore.getState().setAccountScope('scope-1');
  });
  afterEach(() => useJarvisTaskRunStore.getState().clearForTests());

  it('uses the Command Center for a canonical run without duplicate legacy lifecycle surfaces', async () => {
    useJarvisTaskRunStore.getState().replaceCanonicalForAccount(
      'scope-1',
      [
        {
          canonical: true,
          runId: 'run-1',
          chatId: 'chat-1',
          status: 'running',
          goal: 'Do the work',
          userVisibleSummary: 'Working',
          progress: 50,
          activeAgents: [],
          activeTerminals: [],
          updatedAt: new Date(100).toISOString(),
          cancellable: true,
          transportRetryAvailable: false,
        },
      ],
      {},
    );

    render(
      <JarvisCommandCenterProvider value={binding()}>
        <ChatThread chatId="chat-1" />
      </JarvisCommandCenterProvider>,
    );

    expect(await screen.findByText('Command Center')).not.toBeNull();
    expect(screen.queryByTestId('legacy-timeline')).toBeNull();
    expect(screen.queryByTestId('legacy-progress')).toBeNull();
    expect(screen.getByTestId('agent-panel')).not.toBeNull();
    expect(screen.getByTestId('memory-status')).not.toBeNull();
    expect(screen.getByRole('log').getAttribute('data-sik-evidence')).toBe('chat.run-shell');
    expect(document.querySelectorAll('[data-sik-evidence="chat.runtime-ready"]')).toHaveLength(1);
  });

  it('keeps timeline and progress for legacy history and does not render the canonical shell', () => {
    useJarvisTaskRunStore.getState().replaceLegacyForAccount('scope-1', [
      {
        id: 'legacy-1',
        chatId: 'chat-1',
        goal: 'Legacy work',
        status: 'running',
        steps: [],
        progress: 10,
        activeAgents: [],
        activeTerminals: [],
        userVisibleSummary: 'Legacy working',
        startedAt: new Date(0).toISOString(),
        updatedAt: new Date(100).toISOString(),
      },
    ]);

    render(
      <JarvisCommandCenterProvider value={undefined}>
        <ChatThread chatId="chat-1" />
      </JarvisCommandCenterProvider>,
    );

    expect(screen.getByTestId('legacy-timeline')).not.toBeNull();
    expect(screen.getByTestId('legacy-progress')).not.toBeNull();
    expect(screen.queryByText('Command Center')).toBeNull();
    expect(screen.getByRole('log').getAttribute('data-sik-evidence')).toBeNull();
    expect(document.querySelector('[data-sik-evidence="chat.runtime-ready"]')).toBeNull();
  });

  it('discovers a canonical run from the account-bound data port without a legacy projection', async () => {
    render(
      <JarvisCommandCenterProvider value={binding([canonicalRun()])}>
        <ChatThread chatId="chat-1" />
      </JarvisCommandCenterProvider>,
    );

    expect(await screen.findByText('Command Center')).not.toBeNull();
    expect(screen.queryByTestId('legacy-timeline')).toBeNull();
    expect(screen.queryByTestId('legacy-progress')).toBeNull();
    expect(screen.getByRole('log').getAttribute('data-sik-evidence')).toBe('chat.run-shell');
  });

  it('rejects data-port rows that do not match the bound account and chat scope', async () => {
    const crossScopeBinding = binding([
      canonicalRun({ accountId: 'account-other', chatId: 'chat-other' }),
    ]);
    render(
      <JarvisCommandCenterProvider value={crossScopeBinding}>
        <ChatThread chatId="chat-1" />
      </JarvisCommandCenterProvider>,
    );

    await vi.waitFor(() => {
      expect(crossScopeBinding.dataPort.getRunsForChat).toHaveBeenCalledOnce();
    });
    await act(async () => undefined);
    expect(screen.queryByText('Command Center')).toBeNull();
    expect(screen.getByTestId('legacy-progress')).not.toBeNull();
    expect(screen.getByRole('log').getAttribute('data-sik-evidence')).toBeNull();
  });

  it('quarantines direct-run presence when the account-bound data port is replaced', async () => {
    const firstBinding = binding([canonicalRun()]);
    const replacementBinding = binding([], 'account-2');
    const view = render(
      <JarvisCommandCenterProvider value={firstBinding}>
        <ChatThread chatId="chat-1" />
      </JarvisCommandCenterProvider>,
    );
    expect(await screen.findByText('Command Center')).not.toBeNull();

    view.rerender(
      <JarvisCommandCenterProvider value={replacementBinding}>
        <ChatThread chatId="chat-1" />
      </JarvisCommandCenterProvider>,
    );

    expect(screen.queryByText('Command Center')).toBeNull();
    expect(screen.getByTestId('legacy-progress')).not.toBeNull();
    expect(screen.getByRole('log').getAttribute('data-sik-evidence')).toBeNull();
  });
});
