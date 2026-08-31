import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@/stores/ui';

const binding = vi.hoisted(() => ({
  useBinding: vi.fn(),
  createRun: vi.fn(),
}));

vi.mock('./productionChatGptAdeBinding', () => ({
  useProductionChatGptAdePageBinding: binding.useBinding,
  createProductionChatGptAdeTaskRun: binding.createRun,
}));

import { ChatGptAdePage } from './ChatGptAdePage';

const scope = Object.freeze({
  accountId: 'account-a',
  workspaceId: 'workspace-a',
  projectId: 'project-a',
  worktreeId: 'C:\\repo',
  revision: 'ade-scope-3-7',
});
const executionIdentity = Object.freeze({
  transportConnectionId: 'opencode-cli',
  transportAdapterId: 'opencode-persistent',
  upstreamProviderId: 'openai',
  upstreamModelId: 'gpt-5.6-sol',
  providerQualifiedModelId: 'openai/gpt-5.6-sol',
  authBillingRoute: 'managed-opencode-auth',
  effort: 'high',
  fastVariant: 'high-fast',
  catalogRevision: `sha256:${'a'.repeat(64)}`,
  observedProviderIdentity: 'openai/gpt-5.6-sol',
});

describe('ChatGptAdePage', () => {
  beforeEach(() => {
    binding.useBinding.mockReset();
    binding.createRun.mockReset();
    useUIStore.setState({ route: 'ade', settingsOpen: false });
  });

  it('fails closed and routes recovery to the existing Providers surface', () => {
    const refresh = vi.fn();
    binding.useBinding.mockReturnValue({
      authority: {
        kind: 'unavailable',
        code: 'catalog_unavailable',
        message: 'Authenticated live catalog unavailable.',
      },
      recovery: null,
      refresh,
    });
    render(<ChatGptAdePage />);

    expect(screen.getByText('ADE unavailable')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start ADE task' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry ADE authority' }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('routes each missing scope prerequisite to existing authorities without refreshing catalog', () => {
    const refresh = vi.fn();
    binding.useBinding.mockReturnValue({
      authority: {
        kind: 'unavailable',
        code: 'scope_unavailable',
        message: 'Exact ADE scope unavailable.',
        missingScope: ['account', 'workspace', 'project', 'worktree', 'chat'],
      },
      recovery: null,
      refresh,
    });
    render(<ChatGptAdePage />);

    expect(screen.queryByRole('button', { name: 'Retry ADE authority' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open Providers' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open account setup' }));
    expect(useUIStore.getState().route).toBe('account');
    fireEvent.click(screen.getByRole('button', { name: 'Choose project' }));
    expect(useUIStore.getState().route).toBe('chat');
    fireEvent.click(screen.getByRole('button', { name: 'Choose project folder' }));
    expect(useUIStore.getState().route).toBe('files');
    fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));
    expect(useUIStore.getState().route).toBe('chat');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not refresh catalog for runtime-control recovery', () => {
    const refresh = vi.fn();
    binding.useBinding.mockReturnValue({
      authority: {
        kind: 'unavailable',
        code: 'runtime_authority_unavailable',
        message: 'Choose exact runtime controls.',
      },
      recovery: null,
      refresh,
    });
    render(<ChatGptAdePage />);

    expect(screen.queryByRole('button', { name: 'Retry ADE authority' })).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('renders a runnable read-only ADE only with exact authenticated authority', async () => {
    const subscribe = vi.fn(() => () => undefined);
    binding.useBinding.mockReturnValue({
      authority: {
        kind: 'ready',
        accountSource: 'supabase',
        scope,
        executionIdentity,
        performance: 'quality',
      },
      recovery: null,
      refresh: vi.fn(),
    });
    binding.createRun.mockReturnValue({
      subscribe,
      cancel: vi.fn(() => true),
      execute: vi.fn(async () => ({
        runId: 'run-a',
        requestId: 'request-a',
        selectedHarness: 'chatgpt' as const,
        status: 'completed' as const,
        scope,
        executionIdentity,
        terminalLink: null,
        context: null,
        output: 'done',
        safeFailure: null,
        startedAt: new Date(1).toISOString(),
        updatedAt: new Date(2).toISOString(),
        completedAt: new Date(2).toISOString(),
      })),
    });

    const { container } = render(<ChatGptAdePage />);
    expect(
      container
        .querySelector('[data-ade-implementation-state]')
        ?.getAttribute('data-ade-implementation-state'),
    ).toBe('read-capable');
    expect(screen.getByText(/Authenticated account · supabase/iu)).toBeTruthy();
    expect(screen.getByText('openai / gpt-5.6-sol')).toBeTruthy();
    expect(screen.getByText('high effort · high-fast')).toBeTruthy();
    expect((screen.getByLabelText('Access') as HTMLSelectElement).value).toBe('read');

    fireEvent.change(screen.getByLabelText('ADE instruction'), {
      target: { value: 'Inspect safely.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start ADE task' }));
    await waitFor(() => expect(binding.createRun).toHaveBeenCalledOnce());
    expect(binding.createRun.mock.calls[0]![0]).toMatchObject({ executionIdentity, scope });
    expect(binding.createRun.mock.calls[0]![1]).toMatchObject({
      instruction: 'Inspect safely.',
      access: 'read',
    });
  });

  it('shows durable reload truth without restoring provider output', () => {
    binding.useBinding.mockReturnValue({
      authority: {
        kind: 'unavailable',
        code: 'route_unavailable',
        message: 'Exact route unavailable.',
      },
      recovery: { runId: 'run-old', status: 'interrupted', updatedAt: 100, retryable: true },
      refresh: vi.fn(),
    });
    render(<ChatGptAdePage />);
    expect(screen.getByText(/Previous ADE run was interrupted/iu)).toBeTruthy();
    expect(screen.queryByRole('log', { name: 'ChatGPT ADE output' })).toBeNull();
  });
});
