import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  JarvisCommandCenterProvider,
  type JarvisCommandCenterBinding,
} from '@/features/jarvis-command-center/JarvisCommandCenter';
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

function binding(): JarvisCommandCenterBinding {
  const liveEvidence = {
    accountId: 'account-1',
    snapshot: vi.fn(async () => undefined),
    subscribe: vi.fn(() => () => undefined),
  } as JarvisCommandCenterBinding['hostPort']['liveEvidence'];
  return {
    hostPort: {
      accountId: 'account-1',
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
      getRunsForChat: vi.fn(async () => []),
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
      <JarvisCommandCenterProvider value={binding()}>
        <ChatThread chatId="chat-1" />
      </JarvisCommandCenterProvider>,
    );

    expect(screen.getByTestId('legacy-timeline')).not.toBeNull();
    expect(screen.getByTestId('legacy-progress')).not.toBeNull();
    expect(screen.queryByText('Command Center')).toBeNull();
    expect(screen.getByRole('log').getAttribute('data-sik-evidence')).toBeNull();
  });
});
