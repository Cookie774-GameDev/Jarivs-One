import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectId, TerminalSessionId, WorkspaceId } from '@/types/common';
import type { TerminalSession } from '@/types/terminal';

const mocks = vi.hoisted(() => ({
  sessions: [] as TerminalSession[],
}));

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => mocks.sessions,
}));

import { useTerminalTranscriptStore } from '@/features/terminals/transcriptStore';
import { useLiveTerminalStatuses } from './liveWork';

const activeSession: TerminalSession = {
  id: 'session-active' as TerminalSessionId,
  workspace_id: 'workspace-a' as WorkspaceId,
  project_id: 'project-a' as ProjectId,
  title: 'Active terminal',
  shell_command: 'pwsh.exe',
  shell_args: [],
  status: 'running',
  cols: 120,
  rows: 40,
  one_shot: false,
  last_active_at: 1,
  created_at: 1,
};

describe('useLiveTerminalStatuses transcript subscriptions', () => {
  beforeEach(() => {
    mocks.sessions = [activeSession];
    useTerminalTranscriptStore.getState().reset();
    useTerminalTranscriptStore.getState().registerSession('session-active', {
      projectId: 'project-a',
    });
    useTerminalTranscriptStore.getState().registerSession('session-unrelated', {
      projectId: 'project-b',
    });
  });

  afterEach(() => {
    useTerminalTranscriptStore.getState().reset();
  });

  it('ignores unrelated transcript output while retaining live active-session updates', () => {
    let renderCount = 0;
    const rendered = renderHook(() => {
      renderCount += 1;
      return useLiveTerminalStatuses('workspace-a' as WorkspaceId, 'project-a');
    });

    const initialRenderCount = renderCount;
    expect(rendered.result.current).toHaveLength(1);

    act(() => {
      useTerminalTranscriptStore
        .getState()
        .appendOutput('session-unrelated', 'unrelated project output\n');
    });

    expect(renderCount).toBe(initialRenderCount);

    act(() => {
      useTerminalTranscriptStore.getState().appendOutput('session-active', 'visible output\n');
    });

    expect(renderCount).toBe(initialRenderCount + 1);
    expect(rendered.result.current[0]?.lastActivitySummary).toBe('visible output');
    rendered.unmount();
  });
});
