import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ExecutionIdentity } from '@/features/context/gateway/contextGatewayContracts';
import type { ChatGptAdeRunSnapshot } from './adeContracts';
import {
  ChatGptAdeTaskSurface,
  type ChatGptAdeTaskDraft,
  type ChatGptAdeTaskRun,
} from './ChatGptAdeTaskSurface';

const identity: Readonly<ExecutionIdentity> = Object.freeze({
  transportConnectionId: 'connection-a',
  transportAdapterId: 'opencode',
  upstreamProviderId: 'openai',
  upstreamModelId: 'gpt-5.6-luna',
  providerQualifiedModelId: 'openai/gpt-5.6-luna',
  authBillingRoute: 'chatgpt-subscription',
  effort: 'max',
  fastVariant: 'fast',
  catalogRevision: 'catalog-a',
});

const scope = Object.freeze({
  accountId: 'account-a',
  workspaceId: 'workspace-a',
  projectId: 'project-a',
  worktreeId: 'worktree-a',
  revision: 'revision-a',
});

function snapshot(
  status: ChatGptAdeRunSnapshot['status'],
  output: string | null = null,
): Readonly<ChatGptAdeRunSnapshot> {
  return Object.freeze({
    runId: 'run-a',
    requestId: 'request-a',
    selectedHarness: 'chatgpt',
    status,
    scope,
    executionIdentity: identity,
    terminalLink: null,
    context: null,
    output,
    safeFailure: null,
    startedAt: '2026-08-22T00:00:00.000Z',
    updatedAt: '2026-08-22T00:00:01.000Z',
    completedAt: status === 'completed' ? '2026-08-22T00:00:01.000Z' : null,
  });
}

function controlledRun() {
  let listener: ((value: Readonly<ChatGptAdeRunSnapshot>) => void) | undefined;
  let resolve!: (value: Readonly<ChatGptAdeRunSnapshot>) => void;
  const result = new Promise<Readonly<ChatGptAdeRunSnapshot>>((settle) => {
    resolve = settle;
  });
  const cancel = vi.fn(() => true);
  const unsubscribe = vi.fn();
  const run: ChatGptAdeTaskRun = {
    execute: vi.fn(() => result),
    cancel,
    subscribe: vi.fn((next) => {
      listener = next;
      return unsubscribe;
    }),
  };
  return {
    run,
    cancel,
    unsubscribe,
    emit(value: Readonly<ChatGptAdeRunSnapshot>) {
      listener?.(value);
    },
    resolve,
  };
}

describe('ChatGptAdeTaskSurface', () => {
  it('starts one exact adapter run and renders its authoritative streamed snapshots', async () => {
    const controlled = controlledRun();
    const createRun = vi.fn((_draft: Readonly<ChatGptAdeTaskDraft>) => controlled.run);
    render(
      <ChatGptAdeTaskSurface
        accessCeiling="write"
        createRun={createRun}
        executionIdentity={identity}
        scope={scope}
      />,
    );

    expect(screen.getByText('openai / gpt-5.6-luna')).toBeTruthy();
    expect(screen.getByText('max effort · fast')).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Full access' })).toBeNull();

    fireEvent.change(screen.getByLabelText('ADE instruction'), {
      target: { value: 'Review and update the project.' },
    });
    fireEvent.change(screen.getByLabelText('Task kind'), { target: { value: 'write' } });
    fireEvent.change(screen.getByLabelText('Access'), { target: { value: 'write' } });
    fireEvent.click(screen.getByLabelText('Require VibeSpace Context'));
    fireEvent.click(screen.getByLabelText('Broad project change'));
    fireEvent.click(screen.getByRole('button', { name: 'Start ADE task' }));

    expect(createRun).toHaveBeenCalledWith({
      instruction: 'Review and update the project.',
      taskKind: 'write',
      access: 'write',
      userIntent: { context: true, deep: false },
      broadChange: true,
    });
    expect(controlled.run.subscribe).toHaveBeenCalledTimes(1);
    expect(controlled.run.execute).toHaveBeenCalledTimes(1);

    act(() => controlled.emit(snapshot('dispatching', 'Working…')));
    expect((await screen.findByRole('log', { name: 'ChatGPT ADE output' })).textContent).toBe(
      'Working…',
    );
    expect(screen.getByRole('button', { name: 'Cancel ADE task' })).toBeTruthy();

    const completed = snapshot('completed', 'Finished.');
    act(() => {
      controlled.emit(completed);
      controlled.resolve(completed);
    });
    expect(await screen.findByText('Finished.')).toBeTruthy();
    expect(controlled.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('prevents duplicate starts, cancels the active authority, and ignores late snapshots', async () => {
    const controlled = controlledRun();
    const createRun = vi.fn(() => controlled.run);
    render(
      <ChatGptAdeTaskSurface
        accessCeiling="full"
        createRun={createRun}
        executionIdentity={identity}
        scope={scope}
      />,
    );

    fireEvent.change(screen.getByLabelText('ADE instruction'), {
      target: { value: 'Inspect the project.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start ADE task' }));
    expect(
      (screen.getByRole('button', { name: 'Start ADE task' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.submit(screen.getByRole('form', { name: 'ChatGPT ADE task' }));
    expect(createRun).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel ADE task' }));
    expect(controlled.cancel).toHaveBeenCalledTimes(1);
    act(() => {
      controlled.emit(snapshot('cancelled'));
      controlled.emit(snapshot('dispatching', 'late output'));
      controlled.resolve(snapshot('cancelled'));
    });

    expect(await screen.findByText('cancelled')).toBeTruthy();
    expect(screen.queryByText('late output')).toBeNull();
  });

  it('cancels and unsubscribes an active run when the surface unmounts', () => {
    const controlled = controlledRun();
    const { unmount } = render(
      <ChatGptAdeTaskSurface
        accessCeiling="read"
        createRun={() => controlled.run}
        executionIdentity={identity}
        scope={scope}
      />,
    );
    fireEvent.change(screen.getByLabelText('ADE instruction'), {
      target: { value: 'Read the project.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start ADE task' }));

    unmount();

    expect(controlled.cancel).toHaveBeenCalledTimes(1);
    expect(controlled.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('fails closed when a run snapshot changes the bound scope or execution identity', async () => {
    const controlled = controlledRun();
    render(
      <ChatGptAdeTaskSurface
        accessCeiling="read"
        createRun={() => controlled.run}
        executionIdentity={identity}
        scope={scope}
      />,
    );
    fireEvent.change(screen.getByLabelText('ADE instruction'), {
      target: { value: 'Read safely.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start ADE task' }));

    act(() =>
      controlled.emit(
        Object.freeze({
          ...snapshot('dispatching'),
          scope: Object.freeze({ ...scope, projectId: 'project-other' }),
        }),
      ),
    );

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'ADE run identity changed.',
    );
    expect(controlled.cancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('region', { name: 'ChatGPT ADE run status' })).toBeNull();
  });

  it('cancels an active run when the inherited access ceiling is lowered', () => {
    const controlled = controlledRun();
    const { rerender } = render(
      <ChatGptAdeTaskSurface
        accessCeiling="full"
        createRun={() => controlled.run}
        executionIdentity={identity}
        scope={scope}
      />,
    );
    fireEvent.change(screen.getByLabelText('ADE instruction'), {
      target: { value: 'Perform a bounded action.' },
    });
    fireEvent.change(screen.getByLabelText('Access'), { target: { value: 'full' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start ADE task' }));

    rerender(
      <ChatGptAdeTaskSurface
        accessCeiling="read"
        createRun={() => controlled.run}
        executionIdentity={identity}
        scope={scope}
      />,
    );

    expect(controlled.cancel).toHaveBeenCalledTimes(1);
  });
});
