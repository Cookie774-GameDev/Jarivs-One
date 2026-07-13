import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { TerminalLeafBackendState } from './paneTree';

export type TerminalExecutionStatus =
  | 'queued'
  | 'starting'
  | 'running'
  | 'complete'
  | 'failed'
  | 'cancelled';

export interface TerminalExecution {
  id: string;
  status: TerminalExecutionStatus;
  sessionId?: string;
  exitCode?: number | null;
  timeoutMs?: number;
  timedOut?: boolean;
  updatedAt: number;
}

export interface TerminalPaneRuntime {
  paneId: string;
  backendState: TerminalLeafBackendState;
  sessionId?: string;
  updatedAt: number;
}

interface TerminalExecutionState {
  executions: Record<string, TerminalExecution>;
  paneRuntime: Record<string, TerminalPaneRuntime>;
  mark: (id: string, status: TerminalExecutionStatus, patch?: Partial<TerminalExecution>) => void;
  markPaneRuntime: (
    paneId: string,
    backendState: TerminalLeafBackendState,
    sessionId?: string,
  ) => void;
  clear: () => void;
}

const MAX_EXECUTIONS = 100;
const MAX_PANE_RUNTIME_RECORDS = 100;
const executionTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function clearExecutionTimeout(id: string): void {
  const timer = executionTimeouts.get(id);
  if (timer !== undefined) clearTimeout(timer);
  executionTimeouts.delete(id);
}

export const useTerminalExecutionStore = create<TerminalExecutionState>((set) => ({
  executions: {},
  paneRuntime: {},
  mark: (id, status, patch = {}) => set((state) => {
    const next = {
      ...state.executions,
      [id]: {
        ...state.executions[id],
        ...patch,
        id,
        status,
        updatedAt: Date.now(),
      },
    };
    const entries = Object.values(next).sort((left, right) => right.updatedAt - left.updatedAt);
    return {
      executions: Object.fromEntries(entries.slice(0, MAX_EXECUTIONS).map((entry) => [entry.id, entry])),
    };
  }),
  markPaneRuntime: (paneId, backendState, sessionId) => set((state) => {
    if (!paneId) return state;
    const record: TerminalPaneRuntime = {
      paneId,
      backendState,
      sessionId: backendState === 'active' ? sessionId : undefined,
      updatedAt: Date.now(),
    };
    const entries = Object.values({ ...state.paneRuntime, [paneId]: record })
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_PANE_RUNTIME_RECORDS);
    return {
      paneRuntime: Object.fromEntries(entries.map((entry) => [entry.paneId, entry])),
    };
  }),
  clear: () => {
    for (const timer of executionTimeouts.values()) clearTimeout(timer);
    executionTimeouts.clear();
    set({ executions: {}, paneRuntime: {} });
  },
}));

export function markTerminalPaneRuntime(
  paneId: string | undefined,
  backendState: TerminalLeafBackendState,
  sessionId?: string,
): void {
  if (!paneId) return;
  useTerminalExecutionStore.getState().markPaneRuntime(
    paneId,
    backendState,
    sessionId,
  );
}

export function markTerminalExecution(
  id: string | undefined,
  status: TerminalExecutionStatus,
  patch?: Partial<TerminalExecution>,
): void {
  if (!id) return;
  useTerminalExecutionStore.getState().mark(id, status, patch);
  if (status === 'complete' || status === 'failed' || status === 'cancelled') {
    clearExecutionTimeout(id);
    return;
  }
  if (status !== 'running') return;
  const execution = useTerminalExecutionStore.getState().executions[id];
  if (!execution?.timeoutMs || execution.timeoutMs <= 0) return;
  clearExecutionTimeout(id);
  const timer = setTimeout(() => {
    executionTimeouts.delete(id);
    const latest = useTerminalExecutionStore.getState().executions[id];
    if (latest?.status !== 'running') return;
    const terminate = latest.sessionId
      ? invoke('terminal_kill', { sessionId: latest.sessionId }).catch(() => undefined)
      : Promise.resolve();
    void terminate.finally(() => {
      useTerminalExecutionStore.getState().mark(id, 'failed', {
        exitCode: null,
        timedOut: true,
      });
    });
  }, execution.timeoutMs);
  executionTimeouts.set(id, timer);
}

export async function attachTerminalExecution(
  id: string | undefined,
  sessionId: string,
): Promise<boolean> {
  if (!id) return true;
  const execution = useTerminalExecutionStore.getState().executions[id];
  if (execution?.status === 'cancelled') {
    await invoke('terminal_kill', { sessionId }).catch(() => undefined);
    return false;
  }
  markTerminalExecution(id, 'running', { sessionId });
  return true;
}
